import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveCustomerOtpRequestSource } from "./customerOtpRequestSource";

const request = (headers: Record<string, unknown> = {}, remoteAddress = "10.0.0.7", ip = "10.0.0.8") =>
  ({ headers, socket: { remoteAddress }, ip }) as any;

afterEach(() => vi.unstubAllEnvs());

describe("Customer OTP request source", () => {
  it("uses a single validated Cloudflare address only on Render", () => {
    vi.stubEnv("RENDER", "true");
    expect(resolveCustomerOtpRequestSource(request({ "cf-connecting-ip": "203.0.113.41" })))
      .toEqual({ ip: "203.0.113.41", source: "render_cf" });
    expect(resolveCustomerOtpRequestSource(request({ "cf-connecting-ip": "2001:db8::41" })))
      .toEqual({ ip: "2001:db8::41", source: "render_cf" });
  });

  it.each(["", "false", "1"])("ignores client-supplied forwarding headers outside Render (%s)", render => {
    vi.stubEnv("RENDER", render);
    expect(resolveCustomerOtpRequestSource(request({
      "cf-connecting-ip": "203.0.113.41", "x-forwarded-for": "198.51.100.99",
    }))).toEqual({ ip: "10.0.0.7", source: "socket" });
  });

  it.each([
    "203.0.113.41, 198.51.100.1", "203.0.113.41:8080", "not-an-ip", "", ["203.0.113.41"],
  ])("rejects ambiguous or invalid CF addresses even on Render (%j)", header => {
    vi.stubEnv("RENDER", "true");
    expect(resolveCustomerOtpRequestSource(request({ "cf-connecting-ip": header })))
      .toEqual({ ip: "10.0.0.7", source: "socket" });
  });

  it("never derives the quota identity from arbitrary X-Forwarded-For", () => {
    vi.stubEnv("RENDER", "true");
    expect(resolveCustomerOtpRequestSource(request({ "x-forwarded-for": "198.51.100.99" })))
      .toEqual({ ip: "10.0.0.7", source: "socket" });
  });

  it("uses the valid Express address only when the socket address is absent or invalid", () => {
    vi.stubEnv("RENDER", "false");
    expect(resolveCustomerOtpRequestSource(request({}, "", "198.51.100.44")))
      .toEqual({ ip: "198.51.100.44", source: "express" });
    expect(resolveCustomerOtpRequestSource(request({}, "not-an-ip", "198.51.100.44")))
      .toEqual({ ip: "198.51.100.44", source: "express" });
  });

  it("uses an explicit unknown bucket when no valid address exists", () => {
    vi.stubEnv("RENDER", "false");
    expect(resolveCustomerOtpRequestSource(request({}, "", "")))
      .toEqual({ ip: "unknown", source: "unknown" });
  });
});
