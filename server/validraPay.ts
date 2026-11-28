import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const BASE_URL = "https://app.validrapay.com/v1";
const chargeIdSchema = z.string().regex(/^chg_[0-9a-f]{32}$/);
const externalIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const moneySchema = z.string().regex(/^\d{1,12}\.\d{2}$/);
const chargeSchema = z.object({
  id: chargeIdSchema,
  external_id: z.string().nullable(),
  status: z.string(),
  amount: moneySchema,
  pix_copy_paste: z.string().nullable(),
  qr_code_png_base64: z.string().nullable(),
  expires_at: z.string().nullable(),
  updated_at: z.string(),
  payment: z.object({
    end_to_end_id: z.string().min(1),
    amount: moneySchema,
    paid_at: z.string(),
  }).nullable(),
  amount_refunded: moneySchema,
  paid_after_expiration: z.boolean().optional(),
  paid_after_cancellation: z.boolean().optional(),
});
export type ValidraCharge = z.infer<typeof chargeSchema>;

/** Trusted server-side payment attempt; never construct from an unverified client total. */
export type ValidraAttempt = { externalId: string; amountCents: number };
export type BoundValidraAttempt = ValidraAttempt & { chargeId: string };

export function validraAmount(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 51 || cents > 99999999999999) {
    throw new Error("validra_invalid_amount");
  }
  return String(Math.floor(cents / 100)) + "." + String(cents % 100).padStart(2, "0");
}

export function validraChargeIsPaid(charge: ValidraCharge, attempt: ValidraAttempt): boolean {
  return charge.external_id === attempt.externalId && charge.amount === validraAmount(attempt.amountCents)
    && charge.status === "paid" && charge.payment !== null
    && charge.payment.amount === charge.amount && charge.amount_refunded === "0.00"
    && !charge.paid_after_expiration && !charge.paid_after_cancellation;
}

export class ValidraApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly requestId: string | null,
    public readonly retryAfter: string | null,
  ) { super("ValidraPay: " + code); this.name = "ValidraApiError"; }
}

function safeHeader(value: string | null) {
  return value && /^[A-Za-z0-9._-]{1,128}$/.test(value) ? value : null;
}

export function validraApiConfigured(env = process.env): boolean {
  return Boolean(env.VALIDRA_API_KEY && env.VALIDRA_WEBHOOK_SECRET);
}

/** No browser credentials, redirects, payouts, or automatic new attempts. */
export class ValidraPayClient {
  constructor(private readonly apiKey = process.env.VALIDRA_API_KEY, private readonly transport: typeof fetch = fetch) {
    if (!apiKey || !/^vpk_live_[A-Za-z0-9]{26}_[A-Z2-7]{52}$/.test(apiKey)) {
      throw new Error("validra_api_key_missing_or_invalid");
    }
  }

  private async call(path: string, init: RequestInit = {}): Promise<unknown> {
    let response: Response;
    try {
      response = await this.transport(BASE_URL + path, {
        ...init,
        headers: {
          Authorization: "Bearer " + this.apiKey,
          Accept: "application/json",
          ...init.headers,
        },
        redirect: "error",
        signal: AbortSignal.timeout(15000),
        cache: "no-store",
      });
    } catch {
      throw new ValidraApiError(503, "transport_error", null, null);
    }
    let payload: unknown;
    try { payload = await response.json(); }
    catch {
      throw new ValidraApiError(response.ok ? 502 : response.status, "invalid_response", safeHeader(response.headers.get("x-request-id")), safeHeader(response.headers.get("retry-after")));
    }
    if (!response.ok) {
      const parsed = z.object({ code: z.string().regex(/^[a-z0-9_]{1,64}$/) }).safeParse(payload);
      throw new ValidraApiError(response.status, parsed.success ? parsed.data.code : "upstream_error", safeHeader(response.headers.get("x-request-id")), safeHeader(response.headers.get("retry-after")));
    }
    return payload;
  }

  private parseCharge(value: unknown): ValidraCharge {
    const result = chargeSchema.safeParse(value);
    if (!result.success) throw new ValidraApiError(502, "invalid_charge_response", null, null);
    return result.data;
  }

  private verifyAttempt(charge: ValidraCharge, attempt: ValidraAttempt): ValidraCharge {
    if (charge.external_id !== externalIdSchema.parse(attempt.externalId) || charge.amount !== validraAmount(attempt.amountCents)) {
      throw new Error("validra_charge_mismatch");
    }
    return charge;
  }

  async createCharge(attempt: ValidraAttempt, expiresIn = 1800): Promise<ValidraCharge> {
    const externalId = externalIdSchema.parse(attempt.externalId);
    if (!Number.isInteger(expiresIn) || expiresIn < 300 || expiresIn > 86400) throw new Error("validra_invalid_expiry");
    const amount = validraAmount(attempt.amountCents);
    try {
      const result = await this.call("/charges", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": "chg-" + externalId },
        body: JSON.stringify({ amount, external_id: externalId, expires_in: expiresIn, description: "Pedido" }),
      });
      return this.verifyAttempt(this.parseCharge(result), attempt);
    } catch (error) {
      if (error instanceof ValidraApiError && error.code === "external_id_already_used") {
        return this.getChargeByExternalId(attempt);
      }
      throw error;
    }
  }

  async getChargeByExternalId(attempt: ValidraAttempt): Promise<ValidraCharge> {
    const externalId = externalIdSchema.parse(attempt.externalId);
    return this.verifyAttempt(this.parseCharge(await this.call("/charges/by-external-id/" + encodeURIComponent(externalId))), attempt);
  }

  async getCharge(attempt: BoundValidraAttempt): Promise<ValidraCharge> {
    const id = chargeIdSchema.parse(attempt.chargeId);
    const charge = this.verifyAttempt(this.parseCharge(await this.call("/charges/" + encodeURIComponent(id))), attempt);
    if (charge.id !== id) throw new Error("validra_charge_mismatch");
    return charge;
  }

  /** Call from a durable reconciliation worker; a webhook alone never authorizes fulfillment. */
  async confirmPaid(attempt: BoundValidraAttempt): Promise<ValidraCharge | null> {
    const charge = await this.getCharge(attempt);
    if (!validraChargeIsPaid(charge, attempt)) return null;
    return charge;
  }

  /** Read-only credential readiness; do not create a real charge to test connection. */
  async checkReadiness(secret = process.env.VALIDRA_WEBHOOK_SECRET) {
    const me = z.object({
      environment: z.string(),
      api_key: z.object({ scopes: z.array(z.string()) }),
      charges: z.object({ enabled: z.boolean() }),
      webhook_endpoint: z.object({ configured: z.boolean(), status: z.string().nullable().optional(), host: z.string().nullable().optional(), secret_fingerprint: z.string().nullable().optional() }),
    }).parse(await this.call("/me"));
    const scopes = me.api_key.scopes;
    const validScopes = scopes.includes("charges:read") && scopes.includes("charges:write") &&
      !scopes.includes("withdrawals:write") && !scopes.includes("transfers:write");
    const fingerprint = secret ? createHash("sha256").update(secret, "utf8").digest("hex").slice(0, 8) : null;
    return {
      ready: me.environment === "production" && validScopes && me.charges.enabled && me.webhook_endpoint.configured &&
        me.webhook_endpoint.status === "active" && me.webhook_endpoint.host === "h2colombiano.com" &&
        Boolean(fingerprint && fingerprint === me.webhook_endpoint.secret_fingerprint),
      chargesEnabled: me.charges.enabled,
      webhookConfigured: me.webhook_endpoint.configured,
      validScopes,
    };
  }
}

export function validraWebhookSignatureValid(raw: Buffer, header: string | undefined, secrets: readonly string[], nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  if (!Buffer.isBuffer(raw) || !header || header.length > 2048 || !Number.isFinite(nowSeconds)) return false;
  const timestamps: string[] = [];
  const signatures: Buffer[] = [];
  for (const part of header.split(",")) {
    const split = part.indexOf("=");
    if (split < 0) continue;
    const name = part.slice(0, split).trim();
    const value = part.slice(split + 1).trim();
    if (name === "t") timestamps.push(value);
    else if (name === "v1" && /^[0-9a-f]{64}$/.test(value)) signatures.push(Buffer.from(value, "hex"));
  }
  if (timestamps.length !== 1 || !/^[0-9]{1,12}$/.test(timestamps[0]) || !signatures.length || Math.abs(nowSeconds - Number(timestamps[0])) > 300) return false;
  return secrets.filter(Boolean).some(secret => {
    const expected = createHmac("sha256", secret).update(timestamps[0] + ".").update(raw).digest();
    return signatures.some(signature => timingSafeEqual(expected, signature));
  });
}

const eventSchema = z.object({
  id: z.string().regex(/^evt_[A-Za-z0-9]{26}$/),
  type: z.string(),
  api_version: z.literal("v1"),
  environment: z.literal("production"),
  created_at: z.string(),
  data: z.object({ charge: chargeSchema.optional() }).passthrough(),
});

/** Use only after verifying raw bytes. Persist the event ID uniquely before acknowledging. */
export function parseValidraWebhook(raw: Buffer) {
  const event = eventSchema.parse(JSON.parse(raw.toString("utf8")));
  if (event.type.startsWith("charge.") && !event.data.charge) throw new Error("validra_missing_charge");
  return event;
}
