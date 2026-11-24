import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash, createHmac, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { createConnection, type Connection } from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import jwt from "jsonwebtoken";
import type { TrpcContext } from "./_core/context";

// Only email transport and the DB getter are replaced. Issuance, policy SQL,
// authentication, transactions and expiration comparisons execute for real.
const isolated = vi.hoisted(() => ({ db: null as any, delivery: vi.fn() }));
vi.mock("./db", () => ({ getDb: async () => isolated.db }));
vi.mock("./siteAccessCodeDelivery", () => ({ deliverOwnSiteCode: isolated.delivery }));
import { ensureCustomerOtpTables, requestCustomerCode, verifyCustomerCode, redeemNewRegistrationProof,
  getVerifiedCustomerOtpSession, revokeCustomerOtpSession } from "./customerOtpAccess";
import { ensureCustomerPasskeyLoginTables } from "./customerPasskeyLogin";
import { biometricBridgeBinding, isBiometricBridgeActive } from "./customerPasskeyBridge";
import { issueLoginEmailProof } from "./customerLoginEmailProof";
import { ensureRegistrationReviewSchema } from "./customerRegistrationReview";
import { migrateCustomerLoginHistory } from "./customerLoginHistorySchema";
import { requireCustomerSession } from "./customerSession";
import { customerPasswordRouter } from "./routers/customerPassword";
import { router } from "./_core/trpc";

const testUrl = process.env.CUSTOMER_SESSION_POLICY_TEST_DB_URL?.trim();
const databaseName = "h2_customer_session_policy_test";
const secret = "isolated-session-policy-mysql-secret-never-production-20261119";
const hour = 3_600_000, epoch = Date.parse("2026-11-19T12:00:00Z");
const phone = "11999990001", email = "session-policy@example.test";
const settingKey = "customer_session_hours";
let connection: Connection | undefined;
let now = epoch;
const combinedRouter = router({ customerPassword: customerPasswordRouter });
const policy = (hours: number) => ({ hours, minHours: 1, maxHours: 2160, appliesTo: "new_logins" });
const hash = (scope: string, value: string) => createHmac("sha256", secret)
  .update("customer-otp-v2:" + scope + ":" + value).digest("hex");

function safeDatabaseUrl(value: string): URL {
  const parsed = new URL(value), host = parsed.hostname.replace(/^\[|\]$/g, "");
  if (parsed.protocol !== "mysql:" || !["127.0.0.1", "localhost", "::1", "mysql"].includes(host)
    || decodeURIComponent(parsed.pathname) !== "/" + databaseName || parsed.search || parsed.hash) {
    throw new Error("CUSTOMER_SESSION_POLICY_TEST_DB_URL must use only the isolated local h2_customer_session_policy_test database.");
  }
  return parsed;
}
async function query(statement: string, values: any[] = []): Promise<any> {
  const [result] = await connection!.query(statement, values); return result;
}
async function clock(value: number) {
  now = value; vi.setSystemTime(value);
  // One dedicated connection keeps SQL NOW() and JavaScript Date on the same
  // clock. Never change MySQL's global clock or use the production DATABASE_URL.
  await query("SET timestamp = ?", [value / 1000]);
}
function context(admin = false): TrpcContext {
  return {
    user: null,
    req: { ip: "127.0.0.1", socket: {remoteAddress:"127.0.0.1"}, headers: { cookie: admin ? "admin_token=" + jwt.sign({ sub: "session-policy-test", role: "admin" }, secret) : "" } } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}
const admin = () => customerPasswordRouter.createCaller(context(true));
async function issue() {
  await requestCustomerCode(phone, { headers: {}, ip: "127.0.0.1", socket: { remoteAddress: "127.0.0.1" } } as any);
  const code = isolated.delivery.mock.calls.at(-1)?.[1];
  expect(code).toMatch(/^\d{6}$/);
  return code as string;
}
async function login() {
  const code = await issue(), result = await verifyCustomerCode(phone, code);
  expect(result.success).toBe(true);
  if (!result.success) throw new Error("Synthetic OTP verification failed");
  return { code, token: result.token };
}
async function session(token: string) {
  const [row] = await query(`SELECT s.phone,UNIX_TIMESTAMP(s.createdAt)*1000 AS createdMs,
    UNIX_TIMESTAMP(s.expiresAt)*1000 AS passwordExpiryMs,b.expiresAt AS otpExpiryMs
    FROM customerPasswordSessions s JOIN customerOtpSessions b ON b.tokenHash=? WHERE s.token=?`,
    [hash("session", token), token]);
  return row ? { phone: row.phone, createdMs: Number(row.createdMs), passwordExpiryMs: Number(row.passwordExpiryMs), otpExpiryMs: Number(row.otpExpiryMs) } : null;
}
async function counts() {
  const result: Record<string, number> = {};
  for (const table of ["customerPasswordSessions", "customerOtpSessions", "customerLoginHistory", "customerOtpUsedProofs"]) {
    result[table] = Number((await query(`SELECT COUNT(*) AS total FROM ${table}`))[0].total);
  }
  return result;
}
async function assertLifetime(token: string, hours: number, issuedAt = now) {
  const expected = Math.floor(issuedAt / 1000) * 1000 + hours * hour;
  expect(await session(token)).toEqual({ phone, createdMs: Math.floor(issuedAt / 1000) * 1000, passwordExpiryMs: expected, otpExpiryMs: expected });
}

describe.skipIf(!testUrl)("Customer session policy — isolated MySQL and real OTP sessions", () => {
  beforeAll(async () => {
    const parsed = safeDatabaseUrl(testUrl!);
    connection = await createConnection({ host: parsed.hostname, port: Number(parsed.port || 3306),
      user: decodeURIComponent(parsed.username), password: decodeURIComponent(parsed.password), database: databaseName, timezone: "Z" });
    expect((await query("SELECT DATABASE() AS name"))[0].name).toBe(databaseName);
    isolated.db = drizzle(connection);
    for (const [name, value] of Object.entries({ JWT_SECRET: secret, H2_SITE_ACCESS_SECRET: secret, H2_CUSTOMER_OTP_V2_ENABLED: "true", RENDER: "false" })) vi.stubEnv(name, value);
    await query("DROP TRIGGER IF EXISTS session_policy_test_reject_update");
    await query("DROP TABLE IF EXISTS session_policy_test_hidden_settings");
    for (const table of ["customerPasskeySessions", "customerPasskeyLoginChallenges", "customerPasskeyRevocations", "customerPasskeyEnrollments", "customerPasskeyCredentials", "customerLoginHistory", "customerPasswordSessions", "customerOtpSessions", "customerOtpChallenges", "customerOtpLimits", "customerOtpUsedProofs", "customerRegistrationReviews", "customerRegistrationReviewConfig", "customers", "appSettings"]) await query(`DROP TABLE IF EXISTS ${table}`);
    await query("CREATE TABLE appSettings (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,`key` VARCHAR(128) NOT NULL UNIQUE,value TEXT NOT NULL,updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB");
    await query(`CREATE TABLE customers (
      id INT NOT NULL PRIMARY KEY,phone VARCHAR(32) NOT NULL,email VARCHAR(320) NOT NULL,name VARCHAR(128) NOT NULL,
      blocked INT NOT NULL DEFAULT 0,deletedAt TIMESTAMP NULL,cpf VARCHAR(32),cep VARCHAR(16),street VARCHAR(255),
      addressNumber VARCHAR(32),neighborhood VARCHAR(128),city VARCHAR(128),uf VARCHAR(2),profilePhotoUrl TEXT,
      lastAccessAt TIMESTAMP NULL,createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB`);
    await query(`CREATE TABLE customerPasswordSessions (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,phone VARCHAR(32) NOT NULL,token VARCHAR(255) NOT NULL UNIQUE,
      expiresAt TIMESTAMP NOT NULL,createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,lastAccessAt TIMESTAMP NULL
    ) ENGINE=InnoDB`);
    await query(`CREATE TABLE customerLoginHistory (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,phone VARCHAR(32) NOT NULL,loginAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ipAddress VARCHAR(64) NULL,userAgent VARCHAR(512) NULL
    ) ENGINE=InnoDB`);
    await ensureCustomerOtpTables(isolated.db);
    await ensureCustomerPasskeyLoginTables(isolated.db);
    await ensureRegistrationReviewSchema(isolated.db);
    await migrateCustomerLoginHistory(isolated.db);
  }, 30_000);

  beforeEach(async () => {
    vi.restoreAllMocks(); vi.useFakeTimers({ toFake: ["Date"] });
    await query("SET time_zone = '+00:00'"); await clock(epoch);
    isolated.delivery.mockReset().mockResolvedValue({ channel: "smtp", messageId: "isolated-session-policy" });
    await query("DROP TRIGGER IF EXISTS session_policy_test_reject_update");
    for (const table of ["customerPasskeySessions", "customerPasskeyLoginChallenges", "customerPasskeyRevocations", "customerPasskeyEnrollments", "customerPasskeyCredentials", "customerLoginHistory", "customerPasswordSessions", "customerOtpSessions", "customerOtpChallenges", "customerOtpLimits", "customerOtpUsedProofs", "customerRegistrationReviews", "customers", "appSettings"]) await query(`DELETE FROM ${table}`);
    await query("UPDATE customerRegistrationReviewConfig SET mode='automatico',manualSince=NULL WHERE id=1");
    await query(`INSERT INTO customers (id,phone,email,name,cpf,cep,street,addressNumber,neighborhood,city,uf,profilePhotoUrl)
      VALUES (101,?,?,'Cliente sintético','90000000175','01000000','Rua de teste','1','Teste','São Paulo','SP','https://example.test/profile.png')`, [phone, email]);
  });

  afterAll(async () => {
    if (connection) { await query("DROP TRIGGER IF EXISTS session_policy_test_reject_update"); await query("SET timestamp = 0"); }
    await connection?.end(); isolated.db = null;
    vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs();
  });

  it("only prepares optional enrollment after fresh OTP with the rollout and ADM permission", async () => {
    const ctx = context();
    ctx.req.headers.origin = "https://h2colombiano.com";
    const caller = customerPasswordRouter.createCaller(ctx);
    vi.stubEnv("H2_CUSTOMER_PASSKEY_ENROLLMENT_ENABLED","true");
    try {
      expect(await caller.passkeyEnrollmentAvailable()).toEqual({available:true});
      const code = await issue();
      const result = await caller.verifyCustomerCode({phone,code,remember:true,enrollPasskey:true});
      expect(result.success).toBe(true);
      if (!result.success || !("enrollment" in result) || !result.enrollment) throw new Error("Enrollment unavailable");
      expect(result.enrollment.options.rp.id).toBe("h2colombiano.com");
      expect(result.enrollment.options.authenticatorSelection?.userVerification).toBe("required");
      expect(await query("SELECT customerId,expiresAt FROM customerPasskeyEnrollments")).toEqual([expect.objectContaining({customerId:101})]);
      expect(Number((await query("SELECT expiresAt FROM customerPasskeyEnrollments"))[0].expiresAt)).toBe(epoch+300000);
      expect((await caller.verifyCustomerCode({phone,code,enrollPasskey:true})).success).toBe(false);
      const proof = {id:"YWJj",rawId:"YWJj",type:"public-key" as const,response:{clientDataJSON:"YWJj",attestationObject:"YWJj"},clientExtensionResults:{}};
      await expect(caller.finishPasskeyEnrollment({token:result.token,challengeId:result.enrollment.challengeId,response:proof})).rejects.toMatchObject({code:"BAD_REQUEST"});
      expect(await query("SELECT * FROM customerPasskeyEnrollments")).toHaveLength(0);
      expect(await query("SELECT * FROM customerPasskeyCredentials")).toHaveLength(0);
      await expect(caller.finishPasskeyEnrollment({token:result.token,challengeId:result.enrollment.challengeId,response:proof})).rejects.toMatchObject({code:"BAD_REQUEST"});
      await assertLifetime(result.token,720);
    } finally { vi.stubEnv("H2_CUSTOMER_PASSKEY_ENROLLMENT_ENABLED","false"); }
  });

  it("verifies real ES256 registration and login, rejects invalid proofs, and revokes only biometric central sessions", async () => {
    const ctx = context();
    ctx.req.headers.origin = "https://h2colombiano.com";
    const caller = customerPasswordRouter.createCaller(ctx);
    vi.stubEnv("H2_CUSTOMER_PASSKEY_ENROLLMENT_ENABLED","true");
    vi.stubEnv("H2_CUSTOMER_PASSKEY_LOGIN_ENABLED","true");
    try {
      const first = await caller.verifyCustomerCode({phone,code:await issue(),remember:true,enrollPasskey:true});
      if (!first.success || !("enrollment" in first) || !first.enrollment) throw new Error("Enrollment unavailable");
      const registration = first.enrollment.options;
      const {privateKey,publicKey} = generateKeyPairSync("ec",{namedCurve:"prime256v1"});
      const jwk = publicKey.export({format:"jwk"});
      const credentialId = randomBytes(32);
      const id = credentialId.toString("base64url");
      const rpHash = createHash("sha256").update("h2colombiano.com").digest();
      const counter = (n:number) => { const buf=Buffer.alloc(4);buf.writeUInt32BE(n);return buf; };
      const cose = Buffer.concat([Buffer.from("a5010203262001215820","hex"),Buffer.from(jwk.x!,"base64url"),Buffer.from("225820","hex"),Buffer.from(jwk.y!,"base64url")]);
      const authData = Buffer.concat([rpHash,Buffer.from([0x45]),counter(0),Buffer.alloc(16),Buffer.from([0,credentialId.length]),credentialId,cose]);
      const text = (s:string) => Buffer.concat([Buffer.from([0x60+Buffer.byteLength(s)]),Buffer.from(s)]);
      const bytes = (b:Buffer) => Buffer.concat([b.length<256?Buffer.from([0x58,b.length]):Buffer.from([0x59,b.length>>8,b.length&255]),b]);
      const attestationObject = Buffer.concat([Buffer.from([0xa3]),text("fmt"),text("none"),text("attStmt"),Buffer.from([0xa0]),text("authData"),bytes(authData)]);
      const clientData = (type:string,challenge:string,origin="https://h2colombiano.com") => Buffer.from(JSON.stringify({type,challenge,origin,crossOrigin:false}));
      const registered = await caller.finishPasskeyEnrollment({token:first.token,challengeId:first.enrollment.challengeId,response:{
        id,rawId:id,type:"public-key",response:{clientDataJSON:clientData("webauthn.create",registration.challenge).toString("base64url"),attestationObject:attestationObject.toString("base64url")},clientExtensionResults:{}
      }});
      expect(registered).toEqual({enrolled:true});
      expect(await query("SELECT customerId,signCount FROM customerPasskeyCredentials")).toEqual([expect.objectContaining({customerId:101,signCount:0})]);
      expect(await query("SELECT * FROM customerPasskeyEnrollments")).toHaveLength(0);
      const assertion = (challenge:string,n:number,flags=0x05,origin="https://h2colombiano.com",key=privateKey) => {
        const data=Buffer.concat([rpHash,Buffer.from([flags]),counter(n)]);
        const client=clientData("webauthn.get",challenge,origin);
        const signature=sign("sha256",Buffer.concat([data,createHash("sha256").update(client).digest()]),key);
        return {id,rawId:id,type:"public-key" as const,response:{authenticatorData:data.toString("base64url"),clientDataJSON:client.toString("base64url"),signature:signature.toString("base64url"),userHandle:registration.user.id},clientExtensionResults:{}};
      };
      expect(await caller.passkeyLoginAvailable()).toEqual({available:true});
      const invalid = await caller.beginPasskeyLogin({phone,remember:false});
      await expect(caller.finishPasskeyLogin({phone,challengeId:invalid.challengeId,response:assertion(invalid.options.challenge,1,0x01)})).rejects.toMatchObject({code:"UNAUTHORIZED"});
      await expect(caller.finishPasskeyLogin({phone,challengeId:invalid.challengeId,response:assertion(invalid.options.challenge,1)})).rejects.toMatchObject({code:"UNAUTHORIZED"});
      const wrongOrigin = await caller.beginPasskeyLogin({phone,remember:false});
      await expect(caller.finishPasskeyLogin({phone,challengeId:wrongOrigin.challengeId,response:assertion(wrongOrigin.options.challenge,1,0x05,"https://example.invalid")})).rejects.toMatchObject({code:"UNAUTHORIZED"});
      const wrongKey = await caller.beginPasskeyLogin({phone,remember:false});
      await expect(caller.finishPasskeyLogin({phone,challengeId:wrongKey.challengeId,response:assertion(wrongKey.options.challenge,1,0x05,"https://h2colombiano.com",generateKeyPairSync("ec",{namedCurve:"prime256v1"}).privateKey)})).rejects.toMatchObject({code:"UNAUTHORIZED"});
      const otherPhone = await caller.beginPasskeyLogin({phone:"11999990002",remember:false});
      await expect(caller.finishPasskeyLogin({phone:"11999990002",challengeId:otherPhone.challengeId,response:assertion(otherPhone.options.challenge,1)})).rejects.toMatchObject({code:"UNAUTHORIZED"});
      const challenge = await caller.beginPasskeyLogin({phone,remember:false});
      const response = assertion(challenge.options.challenge,1);
      const biometric = await caller.finishPasskeyLogin({phone,challengeId:challenge.challengeId,response});
      expect(biometric.success).toBe(true);
      expect(biometric.phone).toBe(phone);
      await assertLifetime(biometric.token,1);
      await assertLifetime(first.token,720);
      expect(await getVerifiedCustomerOtpSession(isolated.db,biometric.token)).not.toBeNull();
      const cardBinding = await biometricBridgeBinding(isolated.db,biometric.token,101);
      expect(cardBinding).toBe(createHash("sha256").update(biometric.token).digest("hex"));
      expect(await isBiometricBridgeActive(isolated.db,cardBinding,phone)).toBe(true);
      expect(await isBiometricBridgeActive(isolated.db,cardBinding,"11999990002")).toBe(false);
      expect(await biometricBridgeBinding(isolated.db,first.token,101)).toBeNull();
      await expect(caller.finishPasskeyLogin({phone,challengeId:challenge.challengeId,response})).rejects.toMatchObject({code:"UNAUTHORIZED"});
      const rollbackCounter = await caller.beginPasskeyLogin({phone,remember:false});
      await expect(caller.finishPasskeyLogin({phone,challengeId:rollbackCounter.challengeId,response:assertion(rollbackCounter.options.challenge,1)})).rejects.toMatchObject({code:"UNAUTHORIZED"});
      expect(await query("SELECT * FROM customerPasskeySessions")).toHaveLength(1);
      await expect(caller.getPasskeyRevocationTarget({customerId:101})).rejects.toMatchObject({code:"FORBIDDEN"});
      await expect(caller.revokeCustomerPasskeys({customerId:101,expectedPhone:phone,confirm:true})).rejects.toMatchObject({code:"FORBIDDEN"});
      expect(await admin().getPasskeyRevocationTarget({customerId:101})).toMatchObject({credentialCount:1,activeSessionCount:1});
      await expect(admin().revokeCustomerPasskeys({customerId:101,expectedPhone:"11999990002",confirm:true})).rejects.toMatchObject({code:"CONFLICT"});
      const pending = await caller.beginPasskeyLogin({phone,remember:true});
      expect(await admin().revokeCustomerPasskeys({customerId:101,expectedPhone:phone,confirm:true})).toMatchObject({credentialsRevoked:1,sessionsRevoked:1});
      expect(await getVerifiedCustomerOtpSession(isolated.db,biometric.token)).toBeNull();
      expect(await session(biometric.token)).toBeNull();
      expect(await isBiometricBridgeActive(isolated.db,cardBinding,phone)).toBe(false);
      expect(await getVerifiedCustomerOtpSession(isolated.db,first.token)).not.toBeNull();
      expect(await query("SELECT * FROM customerPasskeyCredentials")).toHaveLength(0);
      expect(await query("SELECT administrator,credentialsRevoked,sessionsRevoked FROM customerPasskeyRevocations")).toEqual([expect.objectContaining({administrator:"session-policy-test",credentialsRevoked:1,sessionsRevoked:1})]);
      await expect(caller.finishPasskeyLogin({phone,challengeId:pending.challengeId,response:assertion(pending.options.challenge,2)})).rejects.toMatchObject({code:"UNAUTHORIZED"});
      await admin().updatePasskeyPermission({allowed:false});
      expect(await caller.passkeyLoginAvailable()).toEqual({available:false});
      await expect(caller.beginPasskeyLogin({phone,remember:true})).rejects.toMatchObject({code:"UNAUTHORIZED"});
      await clock(epoch+61_000);
      const recovery = await caller.verifyCustomerCode({phone,code:await issue(),remember:true,enrollPasskey:true});
      expect(recovery.success).toBe(true);
      expect("enrollment" in recovery ? recovery.enrollment : undefined).toBeFalsy();
    } finally {
      vi.stubEnv("H2_CUSTOMER_PASSKEY_ENROLLMENT_ENABLED","false");
      vi.stubEnv("H2_CUSTOMER_PASSKEY_LOGIN_ENABLED","false");
    }
  });

  it("persists the ADM Passkey preference independently of the session duration", async () => {
    expect(await admin().getPasskeyPermission()).toEqual({allowed:true});
    await admin().updatePasskeyPermission({allowed:false});
    expect(await admin().getPasskeyPermission()).toEqual({allowed:false});
    expect(await admin().getSessionPolicy()).toEqual(policy(720));
    await admin().updateSessionPolicy({hours:2160});
    expect(await admin().getPasskeyPermission()).toEqual({allowed:false});
    await admin().updatePasskeyPermission({allowed:true});
    expect(await query("SELECT value FROM appSettings WHERE `key`=?",["customer_passkey_allowed"])).toEqual([expect.objectContaining({value:"1"})]);
    expect(await admin().getSessionPolicy()).toEqual(policy(2160));
  });

  it("persists 48 hours and both valid limits through the real admin API without changing other settings", async () => {
    expect(await admin().getSessionPolicy()).toEqual(policy(720));
    await query("INSERT INTO appSettings (`key`,value) VALUES ('unrelated_fixture','keep')");
    for (const hours of [48, 1, 720, 2160]) {
      expect(await admin().updateSessionPolicy({ hours })).toEqual(policy(hours));
      expect(await admin().getSessionPolicy()).toEqual(policy(hours));
    }
    expect(await query("SELECT value FROM appSettings WHERE `key`=?", [settingKey])).toEqual([expect.objectContaining({ value: "2160" })]);
    expect((await query("SELECT value FROM appSettings WHERE `key`='unrelated_fixture'"))[0].value).toBe("keep");
  });

  it("issues the initial 30-day duration when no policy was stored", async () => {
    const { token } = await login(); await assertLifetime(token, 720);
    expect(await query("SELECT * FROM appSettings")).toHaveLength(0);
  });

  it("caps the explicitly shortened session at one hour under a 90-day ADM policy", async () => {
    await admin().updateSessionPolicy({ hours: 2160 });
    const code = await issue();
    const result = await verifyCustomerCode(phone, code, false);
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("Synthetic OTP login failed");
    await assertLifetime(result.token, 1);
    await clock(epoch + hour);
    expect(await getVerifiedCustomerOtpSession(isolated.db, result.token)).toBeNull();
    expect((await verifyCustomerCode(phone, code)).success).toBe(false);
  });

  it("enforces the 90-day upper duration and expires at its exact deadline", async () => {
    await admin().updateSessionPolicy({ hours: 2160 });
    const { token } = await login();
    await assertLifetime(token, 2160);
    await clock(epoch + 2160 * hour - 1);
    expect(await getVerifiedCustomerOtpSession(isolated.db, token)).toMatchObject({ phone });
    await clock(epoch + 2160 * hour);
    expect(await getVerifiedCustomerOtpSession(isolated.db, token)).toBeNull();
  });

  it("uses 24 hours for an invalid historical value without overwriting that setting", async () => {
    await query("INSERT INTO appSettings (`key`,value) VALUES (?, 'bad legacy setting')", [settingKey]);
    expect(await admin().getSessionPolicy()).toEqual(policy(24));
    const { token } = await login(); await assertLifetime(token, 24);
    expect((await query("SELECT value FROM appSettings WHERE `key`=?", [settingKey]))[0].value).toBe("bad legacy setting");
  });

  it("issues identical 48-hour expirations in both tables and still consumes the OTP once", async () => {
    await admin().updateSessionPolicy({ hours: 48 });
    const { code, token } = await login(); await assertLifetime(token, 48);
    expect(isolated.delivery.mock.calls[0]).toEqual([email, code, "customer-login"]);
    expect((await verifyCustomerCode(phone, code)).success).toBe(false);
    expect(await counts()).toEqual({ customerPasswordSessions: 1, customerOtpSessions: 1, customerLoginHistory: 1, customerOtpUsedProofs: 0 });
  });

  it("applies the same duration to an approved registration proof and refuses its replay", async () => {
    await admin().updateSessionPolicy({ hours: 48 });
    const proof = issueLoginEmailProof(phone, email), result = await redeemNewRegistrationProof(phone, proof);
    expect(result.success).toBe(true); if (!result.success) throw new Error("Synthetic registration was not approved");
    await assertLifetime(result.token, 48);
    await expect(redeemNewRegistrationProof(phone, proof)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(await counts()).toEqual({ customerPasswordSessions: 1, customerOtpSessions: 1, customerLoginHistory: 1, customerOtpUsedProofs: 1 });
    expect(isolated.delivery).not.toHaveBeenCalled();
  });

  it("stores the same absolute expiry at millisecond input precision and in a non-UTC SQL session", async () => {
    await admin().updateSessionPolicy({ hours: 48 });
    await query("SET time_zone = '-03:00'"); await clock(epoch + 789);
    const { token } = await login(); await assertLifetime(token, 48);
    const verified = await getVerifiedCustomerOtpSession(isolated.db, token);
    expect(Number(verified?.sessionExpiresAtMs)).toBe(epoch + 48 * hour);
    expect(Number(verified?.bindingExpires)).toBe(epoch + 48 * hour);
  });

  it("expires at exactly 48 hours using both the SQL and JavaScript clocks", async () => {
    await admin().updateSessionPolicy({ hours: 48 });
    const { token } = await login();
    await clock(epoch + 48 * hour - 1);
    expect(await getVerifiedCustomerOtpSession(isolated.db, token)).toMatchObject({ phone });
    await expect(requireCustomerSession(token, phone)).resolves.toEqual({ phone });
    await clock(epoch + 48 * hour);
    expect(await getVerifiedCustomerOtpSession(isolated.db, token)).toBeNull();
    expect(await combinedRouter.createCaller(context()).customerPassword.checkSession({ token })).toMatchObject({ valid: false, reason: "expired" });
    await expect(requireCustomerSession(token, phone)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("does not extend either expiry or create a new login when checkSession is polled", async () => {
    await admin().updateSessionPolicy({ hours: 48 }); const { token } = await login();
    const before = await session(token), caller = combinedRouter.createCaller(context());
    for (let index = 1; index <= 3; index++) {
      await clock(epoch + index * hour);
      expect(await caller.customerPassword.checkSession({ token })).toMatchObject({ valid: true, phone, source: "customer" });
    }
    expect(await session(token)).toEqual(before);
    expect((await counts()).customerLoginHistory).toBe(1);
  });

  it("increases only future sessions and never resurrects the old 24-hour token", async () => {
    await admin().updateSessionPolicy({ hours: 24 });
    const first = await login(); await assertLifetime(first.token, 24);
    const firstSnapshot = await session(first.token);
    await clock(epoch + 2 * hour); await admin().updateSessionPolicy({ hours: 48 });
    expect(await session(first.token)).toEqual(firstSnapshot);
    const second = await login(); await assertLifetime(second.token, 48);
    await clock(epoch + 24 * hour);
    expect(await getVerifiedCustomerOtpSession(isolated.db, first.token)).toBeNull();
    expect(await getVerifiedCustomerOtpSession(isolated.db, second.token)).toMatchObject({ phone });
    await admin().updateSessionPolicy({ hours: 720 });
    expect(await getVerifiedCustomerOtpSession(isolated.db, first.token)).toBeNull();
  });

  it("reduces only future sessions while preserving the expiry of an already open 48-hour session", async () => {
    await admin().updateSessionPolicy({ hours: 48 }); const first = await login();
    const firstSnapshot = await session(first.token);
    await clock(epoch + 2 * hour); await admin().updateSessionPolicy({ hours: 1 });
    const second = await login(); await assertLifetime(second.token, 1);
    expect(await session(first.token)).toEqual(firstSnapshot);
    await clock(epoch + 4 * hour);
    expect(await getVerifiedCustomerOtpSession(isolated.db, first.token)).toMatchObject({ phone });
    expect(await getVerifiedCustomerOtpSession(isolated.db, second.token)).toBeNull();
  });

  it("does not restore a revoked token when the administrator increases the duration", async () => {
    const { token } = await login(); await revokeCustomerOtpSession(isolated.db, token);
    await admin().updateSessionPolicy({ hours: 720 });
    expect(await getVerifiedCustomerOtpSession(isolated.db, token)).toBeNull();
    expect(await session(token)).toBeNull();
    expect((await counts()).customerPasswordSessions).toBe(0);
    expect((await counts()).customerOtpSessions).toBe(0);
  });

  it("refuses a token if either of its durable expiration records is expired", async () => {
    await admin().updateSessionPolicy({ hours: 48 }); const { token } = await login();
    await query("UPDATE customerPasswordSessions SET expiresAt=FROM_UNIXTIME(?) WHERE token=?", [(epoch - 1000) / 1000, token]);
    expect(await getVerifiedCustomerOtpSession(isolated.db, token)).toBeNull();
    await query("UPDATE customerPasswordSessions SET expiresAt=FROM_UNIXTIME(?) WHERE token=?", [(epoch + 48 * hour) / 1000, token]);
    await query("UPDATE customerOtpSessions SET expiresAt=? WHERE tokenHash=?", [epoch - 1, hash("session", token)]);
    expect(await getVerifiedCustomerOtpSession(isolated.db, token)).toBeNull();
  });

  it("rolls back OTP consumption and session writes when reading the policy inside issuance fails", async () => {
    await admin().updateSessionPolicy({ hours: 48 }); const code = await issue();
    await query("RENAME TABLE appSettings TO session_policy_test_hidden_settings");
    try {
      await expect(verifyCustomerCode(phone, code)).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
      expect(await counts()).toEqual({ customerPasswordSessions: 0, customerOtpSessions: 0, customerLoginHistory: 0, customerOtpUsedProofs: 0 });
      const [challenge] = await query("SELECT usedAt,attempts,codeDigest FROM customerOtpChallenges");
      expect(challenge.usedAt).toBeNull(); expect(Number(challenge.attempts)).toBe(0); expect(challenge.codeDigest).toMatch(/^[a-f0-9]{64}$/);
    } finally { await query("RENAME TABLE session_policy_test_hidden_settings TO appSettings"); }
    const result = await verifyCustomerCode(phone, code);
    expect(result.success).toBe(true); if (!result.success) throw new Error("The rolled-back code was not reusable");
    await assertLifetime(result.token, 48);
  });

  it("rolls back registration-proof consumption if the policy cannot be read", async () => {
    const proof = issueLoginEmailProof(phone, email);
    await query("RENAME TABLE appSettings TO session_policy_test_hidden_settings");
    try {
      await expect(redeemNewRegistrationProof(phone, proof)).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
      expect(await counts()).toEqual({ customerPasswordSessions: 0, customerOtpSessions: 0, customerLoginHistory: 0, customerOtpUsedProofs: 0 });
    } finally { await query("RENAME TABLE session_policy_test_hidden_settings TO appSettings"); }
    const result = await redeemNewRegistrationProof(phone, proof);
    expect(result.success).toBe(true); if (!result.success) throw new Error("The rolled-back proof was not reusable");
    await assertLifetime(result.token, 720);
  });

  it("keeps the saved value when MySQL rejects an administrative update", async () => {
    await admin().updateSessionPolicy({ hours: 24 });
    await query(`CREATE TRIGGER session_policy_test_reject_update BEFORE UPDATE ON appSettings
      FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='isolated policy write failure'`);
    await expect(admin().updateSessionPolicy({ hours: 48 })).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    expect(await admin().getSessionPolicy()).toEqual(policy(24));
  });
});
