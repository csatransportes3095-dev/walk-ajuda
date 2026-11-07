import { describe, expect, it } from "vitest";
import { h2MailFrom } from "./mailSenderIdentity";

describe("H2 code sender identity", () => {
  it("uses the recognizable H2 name without changing the authenticated mailbox", () => {
    expect(h2MailFrom("h2@h2colombiano.com")).toBe("H2 Colombiano <h2@h2colombiano.com>");
  });
  it("preserves custom mailbox and pre-existing display names", () => {
    expect(h2MailFrom("custom@example.com")).toBe("H2 Colombiano <custom@example.com>");
    expect(h2MailFrom("H2 Colombiano <h2@h2colombiano.com>")).toBe("H2 Colombiano <h2@h2colombiano.com>");
  });
  it("rejects malformed or injected senders", () => {
    expect(() => h2MailFrom("h2@h2colombiano.com\r\nBcc:bad@example.com")).toThrow("INVALID_MAIL_FROM");
    expect(() => h2MailFrom("")).toThrow("INVALID_MAIL_FROM");
  });
});
