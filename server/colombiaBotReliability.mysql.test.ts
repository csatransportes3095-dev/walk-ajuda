import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createConnection, type Connection } from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { sql } from "drizzle-orm";
import {
  claimColombiaBotSubmission,
  confirmColombiaBotSubmission,
  flagColombiaBotSubmissionForReview,
  recordColombiaBotEvent,
  getColombiaBotDiagnostics,
} from "./colombiaBotReliability";
import { randomUUID } from "node:crypto";

const isolated = Boolean(process.env.COLOMBIABOT_TEST_DATABASE_URL);
const itDb = isolated ? it : it.skip;

describe("ColombiaBot — MySQL real e isolado", () => {
  let conn: Connection;
  let db: ReturnType<typeof drizzle>;
  const phone = "11988776655";
  const identity = { phone, productId: 31, optionId: 45, priceModelId: 12 };

  beforeAll(async () => {
    if (!isolated) return;
    // Database explicitly supplied by this test workflow; never use DATABASE_URL.
    conn = await createConnection(process.env.COLOMBIABOT_TEST_DATABASE_URL!);
    db = drizzle(conn);
    await conn.execute("SELECT 1 FROM colombiaBotSubmissions LIMIT 1");
  });
  afterAll(async () => {
    if (!isolated || !conn) return;
    await conn.end();
  });

  itDb("acesso simultâneo: somente uma solicitação vira dona do pedido", async () => {
    const key = randomUUID();
    const [a,b] = await Promise.all([
      claimColombiaBotSubmission(db,key,identity),
      claimColombiaBotSubmission(db,key,identity),
    ]);
    expect([a.kind,b.kind].sort()).toEqual(["owner","pending"]);
    await confirmColombiaBotSubmission(db,key,{
      registrationId: 321,orderStatusId:654,pricePaid:"R$ 400,00",
    });
    const repeated=await claimColombiaBotSubmission(db,key,identity);
    expect(repeated).toEqual({kind:"duplicate",registrationId:321,orderStatusId:654,pricePaid:"R$ 400,00"});
    expect(await claimColombiaBotSubmission(db,key,{...identity,optionId:99})).toEqual({kind:"conflict"});
  });

  itDb("falha ambígua exige revisão, sem produzir novo lock", async () => {
    const key=randomUUID();
    expect((await claimColombiaBotSubmission(db,key,identity)).kind).toBe("owner");
    await flagColombiaBotSubmissionForReview(db,key);
    expect((await claimColombiaBotSubmission(db,key,identity)).kind).toBe("pending");
  });

  itDb("diagnósticos não armazenam respostas nem telefone", async () => {
    const sessionId=randomUUID();
    expect(await recordColombiaBotEvent(db,{
      eventId:randomUUID(),sessionId,phase:"Pagamento",eventCode:"pedido_pendente",
    })).toBe(true);
    const result=await getColombiaBotDiagnostics(db);
    expect(result.phases.Pagamento).toBeGreaterThanOrEqual(1);
    const text=JSON.stringify(result);
    expect(text).not.toContain(phone);
    expect(text).not.toContain("cpf");
  });
});
