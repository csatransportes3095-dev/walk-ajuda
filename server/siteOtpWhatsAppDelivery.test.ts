import { describe, expect, it, vi, afterEach } from "vitest";
import { deliverSiteOtpWhatsApp } from "./siteOtpWhatsAppDelivery";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("isolated WhatsApp OTP transport", () => {
  it("remains disabled by default", async () => {
    vi.stubEnv("H2_WHATSAPP_OTP_ENABLED", "false");
    const send = vi.fn();
    vi.stubGlobal("fetch", send);
    expect(await deliverSiteOtpWhatsApp("11999999999", "123456", true)).toEqual({ status: "disabled" });
    expect(send).not.toHaveBeenCalled();
  });

  it("requires customer opt-in", async () => {
    vi.stubEnv("H2_WHATSAPP_OTP_ENABLED", "true");
    const send = vi.fn();
    vi.stubGlobal("fetch", send);
    expect(await deliverSiteOtpWhatsApp("11999999999", "123456", false)).toEqual({ status: "disabled" });
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects an unconfigured provider without sending", async () => {
    vi.stubEnv("H2_WHATSAPP_OTP_ENABLED", "true");
    vi.stubEnv("H2_WHATSAPP_PHONE_NUMBER_ID", "");
    vi.stubEnv("H2_WHATSAPP_ACCESS_TOKEN", "");
    vi.stubEnv("H2_WHATSAPP_AUTH_TEMPLATE", "");
    const send = vi.fn();
    vi.stubGlobal("fetch", send);
    expect(await deliverSiteOtpWhatsApp("11999999999", "123456", true)).toEqual({ status: "failed", reason: "CONFIG" });
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects an invalid destination without sending", async () => {
    vi.stubEnv("H2_WHATSAPP_OTP_ENABLED", "true");
    const send = vi.fn();
    vi.stubGlobal("fetch", send);
    expect(await deliverSiteOtpWhatsApp("000", "123456", true)).toEqual({ status: "failed", reason: "DESTINATION" });
    expect(send).not.toHaveBeenCalled();
  });

  it("refuses to send when provider rejects the request", async () => {
    vi.stubEnv("H2_WHATSAPP_OTP_ENABLED", "true");
    vi.stubEnv("H2_WHATSAPP_PHONE_NUMBER_ID", "1234567890");
    vi.stubEnv("H2_WHATSAPP_ACCESS_TOKEN", "test-only-token");
    vi.stubEnv("H2_WHATSAPP_AUTH_TEMPLATE", "codigo_acesso_h2");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    expect(await deliverSiteOtpWhatsApp("11999999999", "123456", true)).toEqual({
      status: "failed", reason: "PROVIDER",
    });
  });

  it("sends only an approved template payload to the registered destination", async () => {
    vi.stubEnv("H2_WHATSAPP_OTP_ENABLED", "true");
    vi.stubEnv("H2_WHATSAPP_PHONE_NUMBER_ID", "1234567890");
    vi.stubEnv("H2_WHATSAPP_ACCESS_TOKEN", "test-only-token");
    vi.stubEnv("H2_WHATSAPP_AUTH_TEMPLATE", "codigo_acesso_h2");
    const send = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ messages: [{ id: "wamid.test" }] }),
    });
    vi.stubGlobal("fetch", send);
    expect(await deliverSiteOtpWhatsApp("11999999999", "123456", true)).toEqual({
      status: "accepted", messageId: "wamid.test",
    });
    expect(send).toHaveBeenCalledTimes(1);
    const body = JSON.parse(send.mock.calls[0][1].body);
    expect(body.to).toBe("5511999999999");
    expect(body.type).toBe("template");
    expect(body.template.components[0].parameters[0].text).toBe("123456");
  });
});
