import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createPool, type Pool, type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ChassisServiceStore, generateChassisCandidates } from "./chassisServiceStore";
import { chassisTokenHash } from "./chassisServiceCore";

const url = process.env.CHASSIS_TEST_DATABASE_URL;
describe.skipIf(!url)("créditos e sessões com MySQL isolado", () => {
  let pool: Pool;
  let store: ChassisServiceStore;
  const tables = ["h2_chassis_audit_log", "h2_chassis_credit_ledger", "h2_chassis_generations", "h2_chassis_purchases", "h2_chassis_packages", "h2_chassis_sessions", "h2_chassis_users"];
  const generationInput = () => ({ requestId: randomUUID(), marca: "Toyota", modelo: "Corolla", yearCode: "T" as const, quantity: 1 });
  async function account(credits: number, phone = "11998765432") {
    const user = await store.createUser({ phone, password: "chassis-test-123", accountType: "paid", credits }, "test-admin");
    const login = await store.login(phone, "chassis-test-123");
    return { user, token: login.token, tokenHash: chassisTokenHash(login.token) };
  }
  beforeAll(async () => {
    const parsed = new URL(url!);
    if (!/^(127\.0\.0\.1|localhost)$/.test(parsed.hostname) || parsed.pathname !== "/chassis_service_test") throw new Error("Testes aceitam somente o banco MySQL local chassis_service_test.");
    pool = createPool({ uri: url!, connectionLimit: 8, timezone: "Z" });
    const source = await readFile(path.resolve("drizzle/chassis-service.sql"), "utf8");
    const statements = source.replace(/^--.*$/gm, "").split(";").map(value => value.trim()).filter(Boolean);
    for (let pass = 0; pass < 2; pass += 1) for (const statement of statements) await pool.query(statement);
    await pool.query("CREATE TABLE IF NOT EXISTS h2_generated_vin_registry (vin CHAR(17) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY, createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB");
    await pool.query("CREATE TABLE IF NOT EXISTS customers (id INT PRIMARY KEY, phone VARCHAR(15), password_hash VARCHAR(40))");
    await pool.query("INSERT IGNORE INTO customers VALUES (507, '11998765432', 'central-unchanged')");
    store = new ChassisServiceStore(pool);
  }, 20_000);
  beforeEach(async () => {
    for (const table of tables) await pool.query(`DELETE FROM ${table}`);
    await pool.query("DELETE FROM h2_generated_vin_registry");
    await pool.query("UPDATE h2_chassis_settings SET trial_credits = 0, registration_enabled = 1 WHERE id = 1");
  });
  afterAll(async () => { if (pool) await pool.end(); });

  it("cadastro, senha e sessões não alteram o cliente central com o mesmo telefone", async () => {
    const { user, token } = await account(10);
    expect((await store.resolveSession(token))?.user.id).toBe(user.id);
    expect(await store.resolveSession("admin-token")).toBeNull();
    await store.resetPassword(user.id, "another-test-password", "test-admin");
    expect(await store.resolveSession(token)).toBeNull();
    await expect(store.login(user.phone, "chassis-test-123")).rejects.toThrow();
    expect((await store.login(user.phone, "another-test-password")).user.id).toBe(user.id);
    const [rows] = await pool.query<RowDataPacket[]>("SELECT * FROM customers WHERE id = 507");
    expect(rows[0].password_hash).toBe("central-unchanged");
  });
  it("concede o teste uma única vez por telefone, sem recarga ao entrar novamente", async () => {
    await pool.query("UPDATE h2_chassis_settings SET trial_credits = 3 WHERE id = 1");
    const user = await store.register("+55 11 99876-5432", "chassis-test-123");
    expect(user.balance).toBe(3);
    await expect(store.register("11998765432", "chassis-test-123")).rejects.toThrow("já possui");
    expect((await store.login(user.phone, "chassis-test-123")).user.balance).toBe(3);
  });
  it("duas abas não gastam além do saldo", async () => {
    const { user, tokenHash } = await account(1);
    const results = await Promise.allSettled([store.generate(user.id, tokenHash, generationInput()), store.generate(user.id, tokenHash, generationInput())]);
    expect(results.filter(item => item.status === "fulfilled")).toHaveLength(1);
    expect((await store.listUsers())[0].balance).toBe(0);
    expect((await store.listUsers())[0].totalUsed).toBe(1);
    expect((await store.history(user.id)).generations).toHaveLength(1);
  });
  it("gera dez números e desconta dez créditos, com repetição idempotente", async () => {
    const { user, tokenHash } = await account(10);
    const input = { ...generationInput(), quantity: 10 };
    const [first, replay] = await Promise.all([store.generate(user.id, tokenHash, input), store.generate(user.id, tokenHash, input)]);
    expect(first.vins).toHaveLength(10); expect(new Set(first.vins).size).toBe(10);
    expect(replay.vins).toEqual(first.vins);
    expect((await store.listUsers())[0].balance).toBe(0);
    expect((await store.history(user.id)).ledger.filter(item => item.kind === "generation")).toHaveLength(1);
    await expect(store.generate(user.id, tokenHash, { ...input, quantity: 1 })).rejects.toThrow("outros dados");
  });
  it("reverte reservas parciais e saldo se a geração falhar", async () => {
    const { user, tokenHash } = await account(5);
    const first = await store.generate(user.id, tokenHash, generationInput());
    const fresh = generateChassisCandidates(generationInput(), 1)[0];
    let attempts = 0;
    const failing = new ChassisServiceStore(pool, () => { attempts += 1; if (attempts > 1) throw new Error("injected-failure"); return [first.vins[0], fresh]; });
    await expect(failing.generate(user.id, tokenHash, { ...generationInput(), quantity: 2 })).rejects.toThrow("injected-failure");
    expect((await store.listUsers())[0].balance).toBe(4);
    expect((await store.history(user.id)).generations).toHaveLength(1);
    const [rows] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS amount FROM h2_generated_vin_registry WHERE vin = ?", [fresh]);
    expect(Number(rows[0].amount)).toBe(0);
  });
  it("não permite remoção além do saldo e não repete o mesmo ajuste", async () => {
    const { user } = await account(2);
    await expect(store.adjustCredits(user.id, -3, "test", "test-admin", randomUUID())).rejects.toThrow();
    const requestId = randomUUID();
    await Promise.all([store.adjustCredits(user.id, 3, "test", "test-admin", requestId), store.adjustCredits(user.id, 3, "test", "test-admin", requestId)]);
    expect((await store.listUsers())[0].balance).toBe(5);
  });
  it("guarda preço e quantidade da compra e libera uma única vez após confirmação", async () => {
    const { user, tokenHash } = await account(0);
    await store.savePackage({ title: "Pacote de teste", credits: 25, priceCents: 1234, active: true }, "test-admin");
    const selected = (await store.listPackages())[0];
    const purchase = await store.createPurchase(user.id, tokenHash, selected.id, randomUUID());
    expect(purchase.priceCents).toBe(1234); expect(purchase.credits).toBe(25);
    expect((await store.listUsers())[0].balance).toBe(0);
    await store.savePackage({ ...selected, credits: 50, priceCents: 9999 }, "test-admin");
    await Promise.all([store.confirmPurchase(purchase.id, "test-admin"), store.confirmPurchase(purchase.id, "test-admin")]);
    expect((await store.listUsers())[0].balance).toBe(25);
    expect((await store.history(user.id)).ledger.filter(item => item.kind === "purchase")).toHaveLength(1);
    expect((await store.listUsers())[0].accountType).toBe("paid");
  });
  it("bloqueia e invalida sessões, e mantém o histórico limitado ao dono", async () => {
    const first = await account(2);
    const second = await account(1, "21998765432");
    await store.generate(first.user.id, first.tokenHash, generationInput());
    expect((await store.history(second.user.id)).generations).toHaveLength(0);
    await store.updateUser({ userId: first.user.id, status: "blocked", accountType: "paid" }, "test-admin");
    expect(await store.resolveSession(first.token)).toBeNull();
    await expect(store.generate(first.user.id, first.tokenHash, generationInput())).rejects.toThrow("bloqueado");
    expect((await store.listUsers()).find(item => item.id === first.user.id)?.balance).toBe(1);
  });
});
