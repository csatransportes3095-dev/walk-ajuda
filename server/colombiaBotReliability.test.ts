import { describe, expect, it, vi } from "vitest";
import {
  botSubmissionFingerprint,
  claimColombiaBotSubmission,
  confirmColombiaBotSubmission,
  recordColombiaBotEvent,
  BOT_PHASES,
} from "./colombiaBotReliability";

const identity = { phone: "(11) 98765-4321", productId: 3, optionId: 7, priceModelId: 11 };
const key = "513da7ad-9f32-4c35-a073-c02e13c1ae15";

describe("ColombiaBot: idempotencia e diagnosticos", () => {
  it("identifica compra sem guardar o telefone em claro", () => {
    const a = botSubmissionFingerprint(identity);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(a).not.toContain("987654321");
    expect(a).toBe(botSubmissionFingerprint({...identity, phone:"11987654321"}));
    expect(a).not.toBe(botSubmissionFingerprint({...identity, optionId: 8}));
  });

  it("somente primeira insercao adquire lock; confirmacao grava IDs e valor", async () => {
    // Primeira chamada cria duas tabelas novas em banco isolado de teste (mock apenas).
    const db = { execute: vi.fn()
      .mockResolvedValueOnce([]).mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }]) };
    expect(await claimColombiaBotSubmission(db, key, identity)).toEqual({kind: "owner"});
    await expect(confirmColombiaBotSubmission(db, key, {
      registrationId: 41, orderStatusId: 52, pricePaid: "R$ 400,00",
    })).resolves.toBeUndefined();
    expect(db.execute).toHaveBeenCalledTimes(4);
  });

  it("repeticao concluida devolve pedido original", async () => {
    const db = { execute: vi.fn()
      .mockResolvedValueOnce([{affectedRows:0}])
      .mockResolvedValueOnce([[{
        fingerprint: botSubmissionFingerprint(identity),
        state: "completed", registrationId: 41, orderStatusId: 52, pricePaid: "R$ 400,00",
      }], []]) };
    expect(await claimColombiaBotSubmission(db, key, identity)).toEqual({
      kind: "duplicate", registrationId: 41, orderStatusId: 52, pricePaid: "R$ 400,00",
    });
    expect(db.execute).toHaveBeenCalledTimes(2);
  });

  it("repeticao em processamento nao cria outro pedido", async () => {
    const db = { execute: vi.fn()
      .mockResolvedValueOnce([{affectedRows:0}])
      .mockResolvedValueOnce([[{
        fingerprint: botSubmissionFingerprint(identity), state: "processing",
      }], []]) };
    expect(await claimColombiaBotSubmission(db, key, identity)).toEqual({kind:"pending"});
  });

  it("chave utilizada por outra compra e rejeitada", async () => {
    const db = { execute: vi.fn()
      .mockResolvedValueOnce([{affectedRows:0}])
      .mockResolvedValueOnce([[{ fingerprint: "diferente", state: "completed" }], []]) };
    expect(await claimColombiaBotSubmission(db, key, identity)).toEqual({kind:"conflict"});
  });

  it("aceita apenas etapas e eventos previstos; corta telemetria em 40 eventos", async () => {
    expect(BOT_PHASES).toContain("Pagamento");
    const db = { execute: vi.fn()
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{ total: 40 }], []]) };
    const accepted = await recordColombiaBotEvent(db, {
      sessionId: key,
      eventId: "48d90829-35cd-434d-9917-f08765769f46",
      phase: "Pagamento", eventCode: "etapa",
    });
    expect(accepted).toBe(false);
    expect(db.execute).toHaveBeenCalledTimes(2);
  });
});
