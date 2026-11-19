import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { createPool, type Pool, type RowDataPacket } from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import jwt from "jsonwebtoken";
import type { TrpcContext } from "./_core/context";

// The production DATABASE_URL is never read: only this isolated handle is used.
const state = vi.hoisted(() => ({ db: null as any, delivery: vi.fn() }));
vi.mock("./db", () => ({ getDb: async () => state.db }));
vi.mock("./siteAccessCodeDelivery", () => ({ deliverOwnSiteCode: state.delivery }));

import { ensureCustomerOtpTables, requestCustomerCode, verifyCustomerCode, redeemNewRegistrationProof } from "./customerOtpAccess";
import { issueLoginEmailProof } from "./customerLoginEmailProof";
import { ensureRegistrationReviewSchema } from "./customerRegistrationReview";
import { getCustomerLoginHistory, recordCustomerOtpLogin } from "./customerLoginHistory";
import { migrateCustomerLoginHistory } from "./customerLoginHistorySchema";
import { getCustomerLastActivity } from "./customerAccessEvidence";
import { customerPasswordRouter } from "./routers/customerPassword";
import { router } from "./_core/trpc";

const testUrl = process.env.CUSTOMER_LOGIN_HISTORY_TEST_DB_URL?.trim();
const secret = "isolated-customer-login-history-secret-never-production-20261119";
const phoneA = "11999990001", phoneB = "11999990002";
const emailA = "history-one@example.test";
const combinedRouter = router({ customerPassword: customerPasswordRouter });
let pool: Pool | undefined;

function safeDatabaseUrl(value: string): URL {
  const parsed = new URL(value);
  const host = parsed.hostname.replace(/^\[|\]$/g, "");
  if (parsed.protocol !== "mysql:" || !["127.0.0.1", "localhost", "::1", "mysql"].includes(host)
    || decodeURIComponent(parsed.pathname) !== "/h2_customer_login_history_test" || parsed.search || parsed.hash) {
    throw new Error("CUSTOMER_LOGIN_HISTORY_TEST_DB_URL must point only to the isolated local h2_customer_login_history_test database.");
  }
  return parsed;
}
async function query(statement: string, values: any[] = []): Promise<any> {
  const [result] = await pool!.query(statement, values);
  return result;
}
async function counts() {
  const result: Record<string, number> = {};
  for (const table of ["customerLoginHistory", "customerPasswordSessions", "customerOtpSessions"]) {
    result[table] = Number((await query(`SELECT COUNT(*) AS total FROM ${table}`))[0].total);
  }
  return result;
}
const context = (admin = false): TrpcContext => ({
  user: null,
  req: { headers: { cookie: admin ? `admin_token=${jwt.sign({ sub: "history-test", role: "admin" }, secret)}` : "" } } as TrpcContext["req"],
  res: {} as TrpcContext["res"],
});
async function issue(phone = phoneA) {
  await requestCustomerCode(phone, { ip: "127.0.0.1" } as any);
  const code = state.delivery.mock.calls.at(-1)?.[1];
  expect(code).toMatch(/^\d{6}$/);
  return code as string;
}
async function login(phone = phoneA) {
  const code = await issue(phone);
  const result = await verifyCustomerCode(phone, code);
  expect(result.success).toBe(true);
  if (!result.success) throw new Error("Synthetic OTP login failed");
  return { code, result };
}
function tokenFor(character: string) { return "h2otp_" + character.repeat(64); }
const sessionKey = (token: string) => createHash("sha256").update(token).digest("hex");

async function prepareActivityEvidence(notices: Array<{ eventKey: string; payload: unknown }>, activityAt?: number) {
  await query("CREATE TABLE loanAdminEmailOutbox (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,eventKey VARCHAR(120) NOT NULL,payload LONGTEXT NOT NULL) ENGINE=InnoDB");
  await query("CREATE TABLE loans (id INT NOT NULL PRIMARY KEY,marker VARCHAR(64) NOT NULL) ENGINE=InnoDB");
  await query("INSERT INTO loans VALUES (700,'must remain unchanged')");
  for (const notice of notices) {
    await query("INSERT INTO loanAdminEmailOutbox (eventKey,payload) VALUES (?,?)", [notice.eventKey, typeof notice.payload === "string" ? notice.payload : JSON.stringify(notice.payload)]);
  }
  if (activityAt) {
    await query(`INSERT INTO customerPasswordSessions (phone,token,expiresAt,createdAt,lastAccessAt)
      VALUES (?, ?, DATE_ADD(NOW(),INTERVAL 1 DAY),FROM_UNIXTIME(?),FROM_UNIXTIME(?))`,
      [phoneA, tokenFor("e"), Date.parse("2026-11-16T13:00:00Z") / 1000, activityAt / 1000]);
  }
  return {
    outbox: await query("SELECT * FROM loanAdminEmailOutbox ORDER BY id"),
    loans: await query("SELECT * FROM loans ORDER BY id"),
  };
}
async function assertActivityEvidenceUnchanged(before: { outbox: unknown; loans: unknown }) {
  expect(await query("SELECT * FROM loanAdminEmailOutbox ORDER BY id")).toEqual(before.outbox);
  expect(await query("SELECT * FROM loans ORDER BY id")).toEqual(before.loans);
}

describe.skipIf(!testUrl)("Histórico de acessos — OTP real e MySQL isolado", () => {
  beforeAll(async () => {
    const parsed = safeDatabaseUrl(testUrl!);
    pool = createPool({
      host: parsed.hostname, port: Number(parsed.port || 3306),
      user: decodeURIComponent(parsed.username), password: decodeURIComponent(parsed.password),
      database: "h2_customer_login_history_test", timezone: "Z", connectionLimit: 6,
    });
    expect((await query("SELECT DATABASE() AS name"))[0].name).toBe("h2_customer_login_history_test");
    state.db = drizzle(pool);
    vi.stubEnv("JWT_SECRET", secret);
    vi.stubEnv("H2_SITE_ACCESS_SECRET", secret);
    vi.stubEnv("H2_CUSTOMER_OTP_V2_ENABLED", "true");

    await query("DROP TRIGGER IF EXISTS history_test_reject_insert");
    await query("DROP TABLE IF EXISTS loanAdminEmailOutbox");
    await query("DROP TABLE IF EXISTS loans");
    for (const table of ["customerLoginHistory", "customerPasswordSessions", "customerOtpSessions", "customerOtpChallenges", "customerOtpLimits", "customerOtpUsedProofs", "customerRegistrationReviews", "customerRegistrationReviewConfig", "customers", "appSettings"]) {
      await query(`DROP TABLE IF EXISTS ${table}`);
    }
    await query("CREATE TABLE appSettings (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,`key` VARCHAR(128) NOT NULL UNIQUE,value TEXT NOT NULL,updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB");
    await query(`CREATE TABLE customers (
      id INT NOT NULL PRIMARY KEY, phone VARCHAR(32) NOT NULL, email VARCHAR(320) NOT NULL,
      name VARCHAR(128) NOT NULL, blocked INT NOT NULL DEFAULT 0, deletedAt TIMESTAMP NULL,
      cpf VARCHAR(32) NULL, cep VARCHAR(16) NULL, street VARCHAR(255) NULL,
      addressNumber VARCHAR(32) NULL, neighborhood VARCHAR(128) NULL, city VARCHAR(128) NULL,
      uf VARCHAR(2) NULL, profilePhotoUrl TEXT NULL, lastAccessAt TIMESTAMP NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB`);
    await query(`CREATE TABLE customerPasswordSessions (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, phone VARCHAR(32) NOT NULL,
      token VARCHAR(255) NOT NULL UNIQUE, expiresAt TIMESTAMP NOT NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, lastAccessAt TIMESTAMP NULL
    ) ENGINE=InnoDB`);
    // Start with the old deployed shape so the real additive migration is exercised.
    await query(`CREATE TABLE customerLoginHistory (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, phone VARCHAR(32) NOT NULL,
      loginAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ipAddress VARCHAR(64) NULL, userAgent VARCHAR(512) NULL
    ) ENGINE=InnoDB`);
    await ensureCustomerOtpTables(state.db);
    await ensureRegistrationReviewSchema(state.db);
    await migrateCustomerLoginHistory(state.db);
  }, 30_000);

  beforeEach(async () => {
    vi.restoreAllMocks();
    state.delivery.mockReset().mockResolvedValue({ channel: "smtp", messageId: "isolated-history-test" });
    await query("DROP TRIGGER IF EXISTS history_test_reject_insert");
    await query("DROP TABLE IF EXISTS loanAdminEmailOutbox");
    await query("DROP TABLE IF EXISTS loans");
    for (const table of ["customerLoginHistory", "customerPasswordSessions", "customerOtpSessions", "customerOtpChallenges", "customerOtpLimits", "customerOtpUsedProofs", "customerRegistrationReviews", "customers", "appSettings"]) {
      await query(`DELETE FROM ${table}`);
    }
    await query("UPDATE customerRegistrationReviewConfig SET mode='automatico',manualSince=NULL WHERE id=1");
    await query(`INSERT INTO customers
      (id,phone,email,name,cpf,cep,street,addressNumber,neighborhood,city,uf,profilePhotoUrl)
      VALUES (101,?,?,'Cliente sintético A','90000000175','01000000','Rua de teste','1','Teste','São Paulo','SP','https://example.test/a.png'),
      (102,?,'history-two@example.test','Cliente sintético B','90000000256','01000000','Rua de teste','2','Teste','São Paulo','SP','https://example.test/b.png')`,
      [phoneA, emailA, phoneB]);
  });

  afterAll(async () => {
    if (pool) await query("DROP TRIGGER IF EXISTS history_test_reject_insert");
    await pool?.end();
    state.db = null;
    vi.restoreAllMocks(); vi.unstubAllEnvs();
  });

  it("registra o login OTP no mesmo instante da sessão e retorna o evento ao ADM", async () => {
    const before = Math.floor(Date.now() / 1000) * 1000;
    const { result } = await login();
    expect(await counts()).toEqual({ customerLoginHistory: 1, customerPasswordSessions: 1, customerOtpSessions: 1 });
    const [row] = await query(`SELECT h.phone,h.sessionKey,
      UNIX_TIMESTAMP(h.loginAt)*1000 AS loginMs,UNIX_TIMESTAMP(s.createdAt)*1000 AS createdMs,
      UNIX_TIMESTAMP(c.lastAccessAt)*1000 AS customerMs
      FROM customerLoginHistory h JOIN customerPasswordSessions s ON h.sessionKey=SHA2(s.token,256)
      JOIN customers c ON c.id=101`);
    expect(row.phone).toBe(phoneA);
    expect(row.sessionKey).toBe(sessionKey(result.token));
    expect(Number(row.loginMs)).toBe(Number(row.createdMs));
    expect(Number(row.customerMs)).toBe(Number(row.loginMs));
    expect(Number(row.loginMs)).toBeGreaterThanOrEqual(before);
    expect(Number(row.loginMs)).toBeLessThanOrEqual(Date.now());
    const history = await combinedRouter.createCaller(context(true)).customerPassword.adminGetLoginHistory({ phone: phoneA });
    expect(history).toMatchObject({ total: 1, recent: [Number(row.loginMs)] });
  });

  it("não registra tentativa com código incorreto nem código vencido", async () => {
    const code = await issue();
    expect((await verifyCustomerCode(phoneA, code === "000000" ? "000001" : "000000")).success).toBe(false);
    await query("UPDATE customerOtpChallenges SET expiresAt=?", [Date.now() - 1]);
    expect((await verifyCustomerCode(phoneA, code)).success).toBe(false);
    expect(await counts()).toEqual({ customerLoginHistory: 0, customerPasswordSessions: 0, customerOtpSessions: 0 });
  });

  it("não duplica o evento ao reenviar um código já consumido", async () => {
    const { code } = await login();
    expect((await verifyCustomerCode(phoneA, code)).success).toBe(false);
    expect(await counts()).toEqual({ customerLoginHistory: 1, customerPasswordSessions: 1, customerOtpSessions: 1 });
  });

  it("grava apenas um acesso em duas confirmações simultâneas do mesmo código", async () => {
    const code = await issue();
    const results = await Promise.all([verifyCustomerCode(phoneA, code), verifyCustomerCode(phoneA, code)]);
    expect(results.filter(result => result.success)).toHaveLength(1);
    expect(await counts()).toEqual({ customerLoginHistory: 1, customerPasswordSessions: 1, customerOtpSessions: 1 });
  });

  it("reverte sessão e consumo do código se a gravação do histórico falhar", async () => {
    const code = await issue();
    await query(`CREATE TRIGGER history_test_reject_insert BEFORE INSERT ON customerLoginHistory
      FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='isolated history write failure'`);
    await expect(verifyCustomerCode(phoneA, code)).rejects.toBeDefined();
    expect(await counts()).toEqual({ customerLoginHistory: 0, customerPasswordSessions: 0, customerOtpSessions: 0 });
    const [challenge] = await query("SELECT usedAt,codeDigest FROM customerOtpChallenges");
    expect(challenge.usedAt).toBeNull(); expect(challenge.codeDigest).toMatch(/^[a-f0-9]{64}$/);
    await query("DROP TRIGGER history_test_reject_insert");
    expect((await verifyCustomerCode(phoneA, code)).success).toBe(true);
    expect((await counts()).customerLoginHistory).toBe(1);
  });

  it("registra uma única entrada ao concluir cadastro aprovado com comprovante assinado", async () => {
    const proof = issueLoginEmailProof(phoneA, emailA);
    expect((await redeemNewRegistrationProof(phoneA, proof)).success).toBe(true);
    await expect(redeemNewRegistrationProof(phoneA, proof)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(await counts()).toEqual({ customerLoginHistory: 1, customerPasswordSessions: 1, customerOtpSessions: 1 });
  });

  it("não registra entrada quando o cadastro ainda aguarda aprovação", async () => {
    await query("INSERT INTO customerRegistrationReviews (customerId,status) VALUES (101,'pending')");
    const proof = issueLoginEmailProof(phoneA, emailA);
    expect(await redeemNewRegistrationProof(phoneA, proof)).toMatchObject({ success: false, pendingApproval: true });
    expect((await verifyCustomerCode(phoneA, await issue())).success).toBe(false);
    expect(await counts()).toEqual({ customerLoginHistory: 0, customerPasswordSessions: 0, customerOtpSessions: 0 });
  });

  it("polling de sessão atualiza atividade sem inventar novos logins", async () => {
    const { result } = await login();
    const caller = combinedRouter.createCaller(context());
    for (let index = 0; index < 3; index++) {
      expect(await caller.customerPassword.checkSession({ token: result.token })).toMatchObject({ valid: true, phone: phoneA, source: "customer" });
    }
    expect((await counts()).customerLoginHistory).toBe(1);
    const [session] = await query("SELECT UNIX_TIMESTAMP(lastAccessAt)*1000 AS lastMs FROM customerPasswordSessions");
    expect(Number(session.lastMs)).toBeGreaterThan(Date.now() - 10_000);
  });

  it("recupera datas reais das sessões OTP sobreviventes sem duplicar nem usar o último polling", async () => {
    const previous = Date.parse("2026-09-03T16:21:03Z");
    const first = Date.parse("2026-11-18T15:10:11Z"), second = Date.parse("2026-11-19T01:02:03Z");
    await query("INSERT INTO customerLoginHistory (phone,loginAt) VALUES (?,FROM_UNIXTIME(?))", [phoneA, previous / 1000]);
    await query(`INSERT INTO customerPasswordSessions (phone,token,expiresAt,createdAt,lastAccessAt) VALUES
      (?, ?, DATE_ADD(NOW(),INTERVAL 1 DAY),FROM_UNIXTIME(?),NOW()),
      (?, ?, DATE_ADD(NOW(),INTERVAL 1 DAY),FROM_UNIXTIME(?),NOW()),
      (?, 'legacy-session-test', DATE_ADD(NOW(),INTERVAL 1 DAY),NOW(),NOW()),
      (?, ?, DATE_ADD(NOW(),INTERVAL 1 DAY),NOW(),NOW())`,
      [phoneA, tokenFor("a"), first / 1000, "+55 (11) 99999-0001", tokenFor("b"), second / 1000, phoneA, phoneA, "H2OTP_" + "c".repeat(64)]);
    const customersBefore = await query("SELECT id,lastAccessAt FROM customers ORDER BY id");
    await migrateCustomerLoginHistory(state.db);
    await migrateCustomerLoginHistory(state.db);
    expect(await getCustomerLoginHistory(state.db, phoneA)).toMatchObject({ total: 3, recent: [second, first, previous] });
    expect(await query("SELECT id,lastAccessAt FROM customers ORDER BY id")).toEqual(customersBefore);
    const rows = await query("SELECT sessionKey FROM customerLoginHistory WHERE sessionKey IS NOT NULL ORDER BY sessionKey");
    expect(rows.map((row: any) => row.sessionKey).sort()).toEqual([sessionKey(tokenFor("a")), sessionKey(tokenFor("b"))].sort());
  });

  it("preserva um evento já gravado quando a migração é executada novamente", async () => {
    const { result } = await login();
    const { total, recent } = await getCustomerLoginHistory(state.db, phoneA);
    await query("UPDATE customerPasswordSessions SET createdAt=DATE_SUB(createdAt,INTERVAL 1 DAY),lastAccessAt=NOW() WHERE token=?", [result.token]);
    await migrateCustomerLoginHistory(state.db);
    expect(await getCustomerLoginHistory(state.db, phoneA)).toMatchObject({ total, recent });
  });

  it("normaliza máscara e DDI, mantém o total e retorna somente os cinco mais recentes do cliente", async () => {
    const start = Date.parse("2026-11-18T12:00:00Z");
    const variants = [phoneA, "(11) 99999-0001", "+55 (11) 99999-0001", "5511999990001"];
    for (let index = 0; index < 8; index++) {
      await query("INSERT INTO customerLoginHistory (phone,loginAt) VALUES (?,FROM_UNIXTIME(?))", [variants[index % variants.length], start / 1000 + index * 60]);
    }
    await query("INSERT INTO customerLoginHistory (phone,loginAt) VALUES (?,NOW()),('1199990001',NOW())", [phoneB]);
    const expected = { total: 8, recent: [7, 6, 5, 4, 3].map(index => start + index * 60_000) };
    for (const phone of variants) expect(await getCustomerLoginHistory(state.db, phone)).toMatchObject(expected);
    expect((await getCustomerLoginHistory(state.db, phoneB)).total).toBe(1);
    expect((await getCustomerLoginHistory(state.db, "1199990001")).total).toBe(1);
  });

  it("mantém o instante absoluto com sessão SQL em UTC-3 e não recua a atividade mais recente", async () => {
    const at = Date.parse("2026-11-19T01:02:03Z"), newer = at + 3_600_000;
    await query("UPDATE customers SET lastAccessAt=FROM_UNIXTIME(?) WHERE id=101", [newer / 1000]);
    const connection = await pool!.getConnection();
    try {
      await connection.query("SET time_zone='-03:00'");
      const db = drizzle(connection);
      await recordCustomerOtpLogin(db, { customerId: 101, phone: phoneA, token: tokenFor("d"), loggedInAtMs: at });
      expect(await getCustomerLoginHistory(db, phoneA)).toMatchObject({ total: 1, recent: [at] });
      const [rows] = await connection.query<RowDataPacket[]>("SELECT UNIX_TIMESTAMP(lastAccessAt)*1000 AS lastMs FROM customers WHERE id=101");
      expect(Number(rows[0].lastMs)).toBe(newer);
    } finally {
      await connection.query("SET time_zone='+00:00'");
      connection.release();
    }
  });

  it("mostra pedido confirmado do dia seguinte sem transformá-lo em mais um login", async () => {
    const loginAt = Date.parse("2026-11-16T13:00:00Z"), requestAt = Date.parse("2026-11-17T15:00:00Z");
    await query("INSERT INTO customerLoginHistory (phone,loginAt) VALUES (?,FROM_UNIXTIME(?))", [phoneA, loginAt / 1000]);
    const before = await prepareActivityEvidence([
      { eventKey: "request:701", payload: { kind: "request", loanId: 701, clientPhone: "+55 (11) 99999-0001", submittedAt: new Date(requestAt).toISOString() } },
    ], loginAt);
    expect(await getCustomerLoginHistory(state.db, phoneA)).toEqual({
      total: 1, recent: [loginAt], lastActivity: { at: requestAt, source: "loan_request" },
    });
    expect((await counts()).customerLoginHistory).toBe(1);
    await assertActivityEvidenceUnchanged(before);
  });

  it("não atribui pedido de outro telefone nem ação manual do ADM como entrada do cliente", async () => {
    const loginAt = Date.parse("2026-11-16T13:00:00Z");
    const before = await prepareActivityEvidence([
      { eventKey: "request:702", payload: { kind: "request", loanId: 702, clientPhone: phoneB, submittedAt: "2026-11-17T15:00:00.000Z" } },
      { eventKey: "request:703", payload: { kind: "manual_payment", loanId: 703, clientPhone: phoneA, submittedAt: "2026-11-17T16:00:00.000Z" } },
    ]);
    expect(await getCustomerLastActivity(state.db, phoneA, loginAt)).toEqual({ at: loginAt, source: "login" });
    expect((await counts()).customerLoginHistory).toBe(0);
    await assertActivityEvidenceUnchanged(before);
  });

  it("ignora JSON inválido, chave inconsistente e data inválida sem alterar a evidência", async () => {
    const loginAt = Date.parse("2026-01-16T13:00:00Z");
    const before = await prepareActivityEvidence([
      { eventKey: "request:704", payload: "{invalid legacy JSON" },
      { eventKey: "request:705", payload: { kind: "request", loanId: 706, clientPhone: phoneA, submittedAt: "2026-11-17T15:00:00.000Z" } },
      { eventKey: "request:707", payload: { kind: "request", loanId: 707, clientPhone: phoneA, submittedAt: "not-a-date" } },
      { eventKey: "request:708", payload: { kind: "request", loanId: 708, clientPhone: phoneA, submittedAt: "2099-11-17T15:00:00.000Z" } },
      { eventKey: "request:710", payload: { kind: "request", loanId: 710, clientPhone: phoneA, submittedAt: "2026-02-30T15:00:00.000Z" } },
    ]);
    expect(await getCustomerLastActivity(state.db, phoneA, loginAt)).toEqual({ at: loginAt, source: "login" });
    await assertActivityEvidenceUnchanged(before);
  });

  it("prioriza atividade de sessão mais recente mantendo os logins e avisos intactos", async () => {
    const loginAt = Date.parse("2026-11-16T13:00:00Z"), sessionAt = Date.parse("2026-11-18T17:00:00Z");
    await query("INSERT INTO customerLoginHistory (phone,loginAt) VALUES (?,FROM_UNIXTIME(?))", [phoneA, loginAt / 1000]);
    const before = await prepareActivityEvidence([
      { eventKey: "request:709", payload: { kind: "request", loanId: 709, clientPhone: phoneA, submittedAt: "2026-11-17T15:00:00.000Z" } },
    ], sessionAt);
    expect(await getCustomerLoginHistory(state.db, phoneA)).toEqual({
      total: 1, recent: [loginAt], lastActivity: { at: sessionAt, source: "session" },
    });
    await assertActivityEvidenceUnchanged(before);
  });
});
