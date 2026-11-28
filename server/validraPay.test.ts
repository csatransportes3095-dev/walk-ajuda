import { describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { ValidraPayClient, validraAmount, validraWebhookSignatureValid, parseValidraWebhook } from "./validraPay";

const key = "vpk_live_" + "A".repeat(26) + "_" + "B".repeat(52);
const attempt = { externalId: "h2-test-attempt-01", amountCents: 4990, chargeId: "chg_" + "a".repeat(32) };
const charge = { id: attempt.chargeId, external_id: attempt.externalId, status: "active", amount: "49.90", pix_copy_paste: "fake-test-pix", qr_code_png_base64: null, expires_at: "2026-11-28T16:30:00Z", updated_at: "2026-11-28T16:00:00Z", payment: null, amount_refunded: "0.00" };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const mockClient = (reply: unknown, status = 200) => {
  const transport = vi.fn<typeof fetch>().mockImplementation(async () => response(reply, status));
  return { client: new ValidraPayClient(key, transport), transport };
};

describe("ValidraPay cobrança Pix: contrato isolado", () => {
  it("formata centavos de forma exata e rejeita valores inválidos", () => {
    expect(validraAmount(51)).toBe("0.51");
    expect(validraAmount(4990)).toBe("49.90");
    expect(validraAmount(100000)).toBe("1000.00");
    for (const value of [0, 50, -1, 49.9, NaN, Infinity]) expect(() => validraAmount(value)).toThrow();
  });

  it("usa somente o valor e identificador da tentativa persistida, repetindo a mesma chave", async () => {
    const { client, transport } = mockClient(charge, 201);
    await client.createCharge(attempt);
    await client.createCharge(attempt);
    expect(transport).toHaveBeenCalledTimes(2);
    for (const [url, req] of transport.mock.calls) {
      expect(url).toBe("https://app.validrapay.com/v1/charges");
      expect(req?.method).toBe("POST");
      expect(req?.redirect).toBe("error");
      expect(req?.headers).toMatchObject({ "Idempotency-Key": "chg-" + attempt.externalId });
      expect(JSON.parse(String(req?.body))).toEqual({ amount: "49.90", external_id: attempt.externalId, expires_in: 1800, description: "Pedido" });
    }
  });

  it("recupera a cobrança existente sem criar outra tentativa", async () => {
    const transport = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ code: "external_id_already_used" }, 409))
      .mockResolvedValueOnce(response(charge));
    const client = new ValidraPayClient(key, transport);
    expect((await client.createCharge(attempt)).id).toBe(charge.id);
    expect(transport).toHaveBeenCalledTimes(2);
    expect(transport.mock.calls[1][0]).toBe("https://app.validrapay.com/v1/charges/by-external-id/" + attempt.externalId);
  });

  it("não cria nova cobrança após falha de rede ou rate limit", async () => {
    const transport = vi.fn<typeof fetch>().mockRejectedValue(new Error("network failure"));
    await expect(new ValidraPayClient(key, transport).createCharge(attempt)).rejects.toMatchObject({ code: "transport_error" });
    expect(transport).toHaveBeenCalledTimes(1);
    const other = mockClient({ code: "rate_limited" }, 429);
    await expect(other.client.createCharge(attempt)).rejects.toMatchObject({ code: "rate_limited" });
    expect(other.transport).toHaveBeenCalledTimes(1);
  });

  it("confirma pagamento somente após consulta, conferindo ID, referência e valor", async () => {
    const paid = { ...charge, status: "paid", payment: { end_to_end_id: "E-test", amount: "49.90", paid_at: "2026-11-28T16:10:00Z" } };
    await expect(mockClient(paid).client.confirmPaid(attempt)).resolves.toMatchObject({ status: "paid" });
    for (const item of [charge, { ...paid, status: "expired" }, { ...paid, status: "unknown" }, { ...paid, payment: null }, { ...paid, payment: { ...paid.payment, amount: "0.51" } }, { ...paid, amount_refunded: "1.00" }]) {
      await expect(mockClient(item).client.confirmPaid(attempt)).resolves.toBeNull();
    }
    for (const item of [{ ...paid, id: "chg_" + "b".repeat(32) }, { ...paid, external_id: "other" }, { ...paid, amount: "0.51" }]) {
      await expect(mockClient(item).client.confirmPaid(attempt)).rejects.toThrow("validra_charge_mismatch");
    }
  });

  it("checks activation credentials by read-only GET /me, without creating a charge",async()=>{
    const {createHash}=await import("node:crypto");
    const secret="test-only-webhook";
    const me={environment:"production",api_key:{scopes:["charges:read","charges:write"]},
      charges:{enabled:true},webhook_endpoint:{configured:true,status:"active",host:"h2colombiano.com",
        secret_fingerprint:createHash("sha256").update(secret).digest("hex").slice(0,8)}};
    const {client,transport}=mockClient(me);
    expect(await client.checkReadiness(secret)).toMatchObject({ready:true,validScopes:true});
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0][0]).toBe("https://app.validrapay.com/v1/me");
    expect(transport.mock.calls[0][1]?.method??"GET").toBe("GET");
    expect(await mockClient(me).client.checkReadiness("different")).toMatchObject({ready:false});
    expect(await mockClient({...me,api_key:{scopes:[...me.api_key.scopes,"transfers:write"]}}).client.checkReadiness(secret)).toMatchObject({ready:false});
  });
  it("valida HMAC dos bytes originais, prazo e rotação de segredo", () => {
    const now = 1791986400;
    const raw = Buffer.from(JSON.stringify({ id: "evt_" + "A".repeat(26), type: "ping", api_version: "v1", environment: "production", created_at: "2026-11-28T16:00:00Z", data: {} }));
    const secret = "test-only-secret";
    const sig = createHmac("sha256", secret).update(now + ".").update(raw).digest("hex");
    const header = "t=" + now + ",v1=" + "0".repeat(64) + ",v1=" + sig;
    expect(validraWebhookSignatureValid(raw, header, [secret], now)).toBe(true);
    expect(validraWebhookSignatureValid(Buffer.concat([raw, Buffer.from(" ")]), header, [secret], now)).toBe(false);
    expect(validraWebhookSignatureValid(raw, header, [secret], now + 301)).toBe(false);
    expect(validraWebhookSignatureValid(raw, header, ["wrong"], now)).toBe(false);
    expect(validraWebhookSignatureValid(raw, header + ",t=" + now, [secret], now)).toBe(false);
    expect(parseValidraWebhook(raw).type).toBe("ping");
  });
});
