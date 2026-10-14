import { randomBytes, randomUUID } from "node:crypto";
import { createPool, type Pool, type PoolConnection, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import { gerarMultiplosVINs, gerarVINsDeTestePorChassiOriginal, obterPerfilFabricanteOficial } from "../client/src/lib/vinGenerator";
import { assertValidVinReservationBatch } from "./vinRegistryCore";
import { assertChassisCredits, chassisGenerationHash, chassisTokenHash, ChassisServiceError, hashChassisPassword, normalizeChassisPhone, verifyChassisPassword } from "./chassisServiceCore";
import type { ChassisGenerationInput, ChassisGenerationResult } from "../shared/chassisService";

interface UserRow extends RowDataPacket {
  id: number; phone: string; password_hash: string; account_type: "test" | "paid";
  status: "active" | "blocked"; balance: number; total_used: number; session_version: number; created_at: Date;
}
interface PackageRow extends RowDataPacket { id: number; title: string; credits: number; price_cents: number; active: number; }
interface PurchaseRow extends RowDataPacket {
  id: string; user_id: number; package_id: number; package_title: string; credits: number;
  price_cents: number; status: "pending" | "approved" | "cancelled"; created_at: Date;
}
interface GenerationRow extends RowDataPacket {
  id: string; user_id: number; input_hash: string; results: string | string[];
  marca: string; modelo: string; year_code: string; quantity: number; created_at: Date;
}

function publicUser(row: UserRow) {
  return { id: row.id, phone: row.phone, accountType: row.account_type, status: row.status, balance: row.balance, totalUsed: row.total_used, createdAt: row.created_at };
}
function publicPackage(row: PackageRow) { return { id: row.id, title: row.title, credits: row.credits, priceCents: row.price_cents, active: Number(row.active) === 1 }; }
function publicPurchase(row: PurchaseRow) { return { id: row.id, userId: row.user_id, packageTitle: row.package_title, credits: row.credits, priceCents: row.price_cents, status: row.status, createdAt: row.created_at }; }
function generationResult(row: GenerationRow, balance: number, replayed: boolean): ChassisGenerationResult {
  return { id: row.id, vins: typeof row.results === "string" ? JSON.parse(row.results) : row.results, marca: row.marca, modelo: row.modelo, yearCode: row.year_code, quantity: row.quantity, balance, replayed };
}

export function generateChassisCandidates(input: ChassisGenerationInput, amount: number): string[] {
  if (input.originalVin) {
    if (input.originalVin[9] !== input.yearCode) throw new ChassisServiceError("BAD_REQUEST", "O ano selecionado precisa ser o mesmo do chassi original.");
    return gerarVINsDeTestePorChassiOriginal(input.originalVin, amount);
  }
  const profile = obterPerfilFabricanteOficial(input.marca, input.modelo);
  return gerarMultiplosVINs(profile.wmi, profile.vds, input.yearCode, amount, profile.plant);
}

/** Armazena somente contas, saldos e compras deste serviço. Nunca consulta customers. */
export class ChassisServiceStore {
  constructor(public readonly pool: Pool, private readonly candidates = generateChassisCandidates) {}

  private async transaction<T>(fn: (connection: PoolConnection) => Promise<T>): Promise<T> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const result = await fn(connection);
      await connection.commit();
      return result;
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  }
  private async lockedUser(connection: PoolConnection, id: number, active = false): Promise<UserRow> {
    const [rows] = await connection.execute<UserRow[]>("SELECT * FROM h2_chassis_users WHERE id = ? FOR UPDATE", [id]);
    const user = rows[0];
    if (!user) throw new ChassisServiceError("NOT_FOUND", "Usuário do serviço não encontrado.");
    if (active && user.status !== "active") throw new ChassisServiceError("FORBIDDEN", "Seu acesso está bloqueado. Entre em contato com o ADM.");
    return user;
  }
  private async ledger(connection: PoolConnection, userId: number, kind: string, delta: number, balance: number, actor: string, referenceId: string | null = null, note = "") {
    await connection.execute("INSERT INTO h2_chassis_credit_ledger (user_id, kind, delta, balance_after, actor, reference_id, note) VALUES (?, ?, ?, ?, ?, ?, ?)", [userId, kind, delta, balance, actor.slice(0, 128), referenceId, note.slice(0, 300)]);
  }
  private async audit(connection: PoolConnection, userId: number | null, action: string, actor: string) {
    await connection.execute("INSERT INTO h2_chassis_audit_log (user_id, action, actor) VALUES (?, ?, ?)", [userId, action, actor.slice(0, 128)]);
  }

  async getConfig() {
    const [rows] = await this.pool.execute<RowDataPacket[]>("SELECT * FROM h2_chassis_settings WHERE id = 1");
    const row = rows[0];
    if (!row) throw new ChassisServiceError("CONFLICT", "O serviço ainda não foi configurado pelo ADM.");
    return { trialCredits: Number(row.trial_credits), registrationEnabled: Number(row.registration_enabled) === 1, supportPhone: String(row.support_phone || ""), paymentInstructions: String(row.payment_instructions || ""), paymentMode: "manual" as const };
  }
  async setConfig(input: { trialCredits: number; registrationEnabled: boolean; supportPhone: string; paymentInstructions: string }, actor: string) {
    assertChassisCredits(input.trialCredits);
    const supportPhone = input.supportPhone ? normalizeChassisPhone(input.supportPhone) : "";
    await this.transaction(async connection => {
      await connection.execute("UPDATE h2_chassis_settings SET trial_credits = ?, registration_enabled = ?, support_phone = ?, payment_instructions = ? WHERE id = 1", [input.trialCredits, input.registrationEnabled, supportPhone, input.paymentInstructions]);
      await this.audit(connection, null, "update_config", actor);
    });
    return this.getConfig();
  }
  async listPackages(includeInactive = false) {
    const [rows] = await this.pool.execute<PackageRow[]>(`SELECT * FROM h2_chassis_packages ${includeInactive ? "" : "WHERE active = 1"} ORDER BY credits, id`);
    return rows.map(publicPackage);
  }
  async savePackage(input: { id?: number; title: string; credits: number; priceCents: number; active: boolean }, actor: string) {
    assertChassisCredits(input.credits, false);
    if (!Number.isSafeInteger(input.priceCents) || input.priceCents < 1 || input.priceCents > 100_000_000) throw new ChassisServiceError("BAD_REQUEST", "Informe um preço válido para o pacote.");
    return this.transaction(async connection => {
      if (input.id) {
        const [result] = await connection.execute<ResultSetHeader>("UPDATE h2_chassis_packages SET title = ?, credits = ?, price_cents = ?, active = ? WHERE id = ?", [input.title, input.credits, input.priceCents, input.active, input.id]);
        if (result.affectedRows === 0) throw new ChassisServiceError("NOT_FOUND", "Pacote não encontrado.");
      } else {
        await connection.execute("INSERT INTO h2_chassis_packages (title, credits, price_cents, active) VALUES (?, ?, ?, ?)", [input.title, input.credits, input.priceCents, input.active]);
      }
      await this.audit(connection, null, input.id ? "edit_package" : "create_package", actor);
      return { success: true };
    });
  }

  private async insertUser(connection: PoolConnection, phone: string, passwordHash: string, accountType: "test" | "paid", credits: number, actor: string) {
    try {
      const [result] = await connection.execute<ResultSetHeader>("INSERT INTO h2_chassis_users (phone, password_hash, account_type, balance) VALUES (?, ?, ?, ?)", [phone, passwordHash, accountType, credits]);
      await this.ledger(connection, result.insertId, accountType === "test" ? "trial" : "initial", credits, credits, actor);
      await this.audit(connection, result.insertId, "create_user", actor);
      const [rows] = await connection.execute<UserRow[]>("SELECT * FROM h2_chassis_users WHERE id = ?", [result.insertId]);
      return publicUser(rows[0]);
    } catch (error) {
      if ((error as { code?: string }).code === "ER_DUP_ENTRY") throw new ChassisServiceError("CONFLICT", "Este telefone já possui acesso ao serviço. Entre com sua senha.");
      throw error;
    }
  }
  async register(phoneInput: string, password: string) {
    const phone = normalizeChassisPhone(phoneInput);
    const passwordHash = await hashChassisPassword(password);
    return this.transaction(async connection => {
      const [rows] = await connection.execute<RowDataPacket[]>("SELECT trial_credits, registration_enabled FROM h2_chassis_settings WHERE id = 1 FOR UPDATE");
      if (!rows[0] || Number(rows[0].registration_enabled) !== 1) throw new ChassisServiceError("FORBIDDEN", "Novos acessos são cadastrados pelo ADM. Entre em contato.");
      return this.insertUser(connection, phone, passwordHash, "test", Number(rows[0].trial_credits), "self-registration");
    });
  }
  async createUser(input: { phone: string; password: string; accountType: "test" | "paid"; credits: number }, actor: string) {
    assertChassisCredits(input.credits);
    const phone = normalizeChassisPhone(input.phone);
    const hash = await hashChassisPassword(input.password);
    return this.transaction(connection => this.insertUser(connection, phone, hash, input.accountType, input.credits, actor));
  }
  async login(phoneInput: string, password: string) {
    const phone = normalizeChassisPhone(phoneInput);
    const [rows] = await this.pool.execute<UserRow[]>("SELECT * FROM h2_chassis_users WHERE phone = ?", [phone]);
    const user = rows[0];
    const valid = await verifyChassisPassword(password, user?.password_hash || null);
    if (!valid || !user) throw new ChassisServiceError("UNAUTHORIZED", "Telefone ou senha incorretos.");
    if (user.status !== "active") throw new ChassisServiceError("FORBIDDEN", "Seu acesso está bloqueado. Entre em contato com o ADM.");
    // Revalida a versão sob lock: uma redefinição simultânea não cria sessão antiga.
    return this.transaction(async connection => {
      const locked = await this.lockedUser(connection, user.id, true);
      if (locked.session_version !== user.session_version) throw new ChassisServiceError("UNAUTHORIZED", "A senha foi atualizada. Entre novamente.");
      const token = randomBytes(32).toString("base64url");
      await connection.execute("DELETE FROM h2_chassis_sessions WHERE user_id = ? AND expires_at <= UTC_TIMESTAMP()", [user.id]);
      await connection.execute("INSERT INTO h2_chassis_sessions (token_hash, user_id, session_version, expires_at) VALUES (?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 14 DAY))", [chassisTokenHash(token), user.id, locked.session_version]);
      return { token, user: publicUser(locked) };
    });
  }
  async resolveSession(token: string | undefined) {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const hash = chassisTokenHash(token);
    const [rows] = await this.pool.execute<UserRow[]>("SELECT u.* FROM h2_chassis_sessions s JOIN h2_chassis_users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP() AND s.session_version = u.session_version AND u.status = 'active'", [hash]);
    return rows[0] ? { user: publicUser(rows[0]), tokenHash: hash } : null;
  }
  async logout(token: string | undefined) {
    if (token) await this.pool.execute("DELETE FROM h2_chassis_sessions WHERE token_hash = ?", [chassisTokenHash(token)]);
    return { success: true };
  }
  private async assertSession(connection: PoolConnection, user: UserRow, tokenHash: string) {
    const [rows] = await connection.execute<RowDataPacket[]>("SELECT token_hash FROM h2_chassis_sessions WHERE token_hash = ? AND user_id = ? AND session_version = ? AND expires_at > UTC_TIMESTAMP()", [tokenHash, user.id, user.session_version]);
    if (!rows.length) throw new ChassisServiceError("UNAUTHORIZED", "Entre novamente na conta do serviço.");
  }
  async listUsers(search = "", offset = 0) {
    const phone = search.replace(/\D/g, "");
    const [rows] = await this.pool.query<UserRow[]>("SELECT id, phone, account_type, status, balance, total_used, created_at FROM h2_chassis_users WHERE phone LIKE ? ORDER BY id DESC LIMIT 50 OFFSET ?", [`%${phone}%`, offset]);
    return rows.map(publicUser);
  }
  async adjustCredits(userId: number, delta: number, note: string, actor: string, requestId: string) {
    assertChassisCredits(Math.abs(delta), false);
    return this.transaction(async connection => {
      const user = await this.lockedUser(connection, userId);
      const [existing] = await connection.execute<RowDataPacket[]>("SELECT id, delta FROM h2_chassis_credit_ledger WHERE user_id = ? AND reference_id = ? AND kind = 'adjustment'", [userId, requestId]);
      if (existing[0]) {
        if (Number(existing[0].delta) !== delta) throw new ChassisServiceError("CONFLICT", "Esta movimentação já foi registrada com outra quantidade.");
        return { balance: user.balance, replayed: true };
      }
      const balance = user.balance + delta;
      if (balance < 0) throw new ChassisServiceError("BAD_REQUEST", "A quantidade a remover supera o saldo disponível.");
      assertChassisCredits(balance);
      await connection.execute("UPDATE h2_chassis_users SET balance = ? WHERE id = ?", [balance, userId]);
      await this.ledger(connection, userId, "adjustment", delta, balance, actor, requestId, note);
      return { balance, replayed: false };
    });
  }
  async updateUser(input: { userId: number; status: "active" | "blocked"; accountType: "test" | "paid" }, actor: string) {
    return this.transaction(async connection => {
      const previous = await this.lockedUser(connection, input.userId);
      const revoke = input.status === "blocked" || previous.status !== input.status;
      await connection.execute("UPDATE h2_chassis_users SET status = ?, account_type = ?, session_version = session_version + ? WHERE id = ?", [input.status, input.accountType, revoke ? 1 : 0, input.userId]);
      if (revoke) await connection.execute("DELETE FROM h2_chassis_sessions WHERE user_id = ?", [input.userId]);
      await this.audit(connection, input.userId, input.status === "blocked" ? "block_user" : "update_user", actor);
      return { success: true };
    });
  }
  async resetPassword(userId: number, password: string, actor: string) {
    const passwordHash = await hashChassisPassword(password);
    return this.transaction(async connection => {
      await this.lockedUser(connection, userId);
      await connection.execute("UPDATE h2_chassis_users SET password_hash = ?, session_version = session_version + 1 WHERE id = ?", [passwordHash, userId]);
      await connection.execute("DELETE FROM h2_chassis_sessions WHERE user_id = ?", [userId]);
      await this.audit(connection, userId, "reset_password", actor);
      return { success: true };
    });
  }

  async createPurchase(userId: number, tokenHash: string, packageId: number, requestId: string) {
    return this.transaction(async connection => {
      const user = await this.lockedUser(connection, userId, true);
      await this.assertSession(connection, user, tokenHash);
      const [existing] = await connection.execute<PurchaseRow[]>("SELECT * FROM h2_chassis_purchases WHERE id = ?", [requestId]);
      if (existing[0]) {
        if (existing[0].user_id !== userId || existing[0].package_id !== packageId) throw new ChassisServiceError("CONFLICT", "Esta solicitação já foi utilizada.");
        return publicPurchase(existing[0]);
      }
      const [packages] = await connection.execute<PackageRow[]>("SELECT * FROM h2_chassis_packages WHERE id = ? AND active = 1", [packageId]);
      const selected = packages[0];
      if (!selected) throw new ChassisServiceError("NOT_FOUND", "Este pacote não está disponível.");
      const [pending] = await connection.execute<PurchaseRow[]>("SELECT * FROM h2_chassis_purchases WHERE user_id = ? AND package_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1", [userId, packageId]);
      if (pending[0]) return publicPurchase(pending[0]);
      await connection.execute("INSERT INTO h2_chassis_purchases (id, user_id, package_id, package_title, credits, price_cents) VALUES (?, ?, ?, ?, ?, ?)", [requestId, userId, packageId, selected.title, selected.credits, selected.price_cents]);
      const [rows] = await connection.execute<PurchaseRow[]>("SELECT * FROM h2_chassis_purchases WHERE id = ?", [requestId]);
      return publicPurchase(rows[0]);
    });
  }
  async cancelPurchase(userId: number, id: string) {
    await this.pool.execute("UPDATE h2_chassis_purchases SET status = 'cancelled' WHERE id = ? AND user_id = ? AND status = 'pending'", [id, userId]);
    return { success: true };
  }
  async listPurchases() {
    const [rows] = await this.pool.query<Array<PurchaseRow & { phone: string }>>("SELECT p.*, u.phone FROM h2_chassis_purchases p JOIN h2_chassis_users u ON u.id = p.user_id ORDER BY p.created_at DESC LIMIT 100");
    return rows.map(row => ({ ...publicPurchase(row), phone: row.phone }));
  }
  async confirmPurchase(id: string, actor: string) {
    return this.transaction(async connection => {
      const [purchases] = await connection.execute<PurchaseRow[]>("SELECT * FROM h2_chassis_purchases WHERE id = ? FOR UPDATE", [id]);
      const purchase = purchases[0];
      if (!purchase) throw new ChassisServiceError("NOT_FOUND", "Compra não encontrada.");
      if (purchase.status === "cancelled") throw new ChassisServiceError("CONFLICT", "A compra foi cancelada.");
      const user = await this.lockedUser(connection, purchase.user_id);
      if (purchase.status === "approved") return { balance: user.balance, replayed: true };
      const balance = user.balance + purchase.credits;
      assertChassisCredits(balance);
      await connection.execute("UPDATE h2_chassis_users SET balance = ?, account_type = 'paid' WHERE id = ?", [balance, user.id]);
      await connection.execute("UPDATE h2_chassis_purchases SET status = 'approved', confirmed_by = ?, confirmed_at = UTC_TIMESTAMP() WHERE id = ?", [actor.slice(0, 128), id]);
      await this.ledger(connection, user.id, "purchase", purchase.credits, balance, actor, id, purchase.package_title);
      return { balance, replayed: false };
    });
  }
  async history(userId: number) {
    const [ledger] = await this.pool.execute<RowDataPacket[]>("SELECT id, kind, delta, balance_after AS balanceAfter, note, created_at AS createdAt FROM h2_chassis_credit_ledger WHERE user_id = ? ORDER BY id DESC LIMIT 50", [userId]);
    const [generations] = await this.pool.execute<GenerationRow[]>("SELECT * FROM h2_chassis_generations WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 20", [userId]);
    const [purchases] = await this.pool.execute<PurchaseRow[]>("SELECT * FROM h2_chassis_purchases WHERE user_id = ? ORDER BY created_at DESC LIMIT 20", [userId]);
    return { ledger: ledger.map(row => ({ id: Number(row.id), kind: String(row.kind), delta: Number(row.delta), balanceAfter: Number(row.balanceAfter), note: String(row.note), createdAt: row.createdAt as Date })), generations: generations.map(row => ({ ...generationResult(row, 0, true), createdAt: row.created_at })), purchases: purchases.map(publicPurchase) };
  }
  async adminHistory(userId: number) {
    const history = await this.history(userId);
    const [audit] = await this.pool.execute<RowDataPacket[]>("SELECT action, actor, created_at AS createdAt FROM h2_chassis_audit_log WHERE user_id = ? ORDER BY id DESC LIMIT 30", [userId]);
    const [movements] = await this.pool.execute<RowDataPacket[]>("SELECT kind, delta, balance_after AS balanceAfter, actor, note, created_at AS createdAt FROM h2_chassis_credit_ledger WHERE user_id = ? ORDER BY id DESC LIMIT 50", [userId]);
    return { ...history, audit, movements };
  }

  async generate(userId: number, tokenHash: string, input: ChassisGenerationInput): Promise<ChassisGenerationResult> {
    return this.transaction(async connection => {
      const user = await this.lockedUser(connection, userId, true);
      await this.assertSession(connection, user, tokenHash);
      const inputHash = chassisGenerationHash(input);
      const [previous] = await connection.execute<GenerationRow[]>("SELECT * FROM h2_chassis_generations WHERE id = ?", [input.requestId]);
      if (previous[0]) {
        if (previous[0].user_id !== userId || previous[0].input_hash !== inputHash) throw new ChassisServiceError("CONFLICT", "A solicitação já foi utilizada com outros dados.");
        return generationResult(previous[0], user.balance, true);
      }
      if (user.balance < input.quantity) throw new ChassisServiceError("FORBIDDEN", user.balance === 0 ? "Seus créditos acabaram. Escolha um pacote para continuar." : "Saldo insuficiente. Escolha uma quantidade menor ou recarregue.");
      const accepted: string[] = [];
      for (let attempt = 0; accepted.length < input.quantity && attempt < 20; attempt += 1) {
        const candidates = this.candidates(input, input.quantity - accepted.length);
        assertValidVinReservationBatch(candidates);
        for (const vin of candidates) {
          const [result] = await connection.execute<ResultSetHeader>("INSERT IGNORE INTO h2_generated_vin_registry (vin) VALUES (?)", [vin]);
          if (result.affectedRows === 1) accepted.push(vin);
        }
      }
      if (accepted.length !== input.quantity) throw new ChassisServiceError("CONFLICT", "Não foi possível reservar chassis exclusivos. Nenhum crédito foi descontado.");
      const balance = user.balance - accepted.length;
      await connection.execute("UPDATE h2_chassis_users SET balance = ?, total_used = total_used + ? WHERE id = ?", [balance, accepted.length, userId]);
      await connection.execute("INSERT INTO h2_chassis_generations (id, user_id, input_hash, results, marca, modelo, year_code, quantity) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [input.requestId, userId, inputHash, JSON.stringify(accepted), input.marca, input.modelo, input.yearCode, accepted.length]);
      await this.ledger(connection, userId, "generation", -accepted.length, balance, `user:${userId}`, input.requestId);
      return { id: input.requestId, vins: accepted, marca: input.marca, modelo: input.modelo, yearCode: input.yearCode, quantity: accepted.length, balance, replayed: false };
    });
  }
}

let store: ChassisServiceStore | undefined;
export function getChassisServiceStore(): ChassisServiceStore {
  if (!store) {
    if (!process.env.DATABASE_URL) throw new ChassisServiceError("CONFLICT", "O serviço está temporariamente indisponível.");
    store = new ChassisServiceStore(createPool({ uri: process.env.DATABASE_URL, connectionLimit: 3, charset: "utf8mb4", timezone: "Z", enableKeepAlive: true }));
  }
  return store;
}
