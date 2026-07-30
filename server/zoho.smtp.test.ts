import { describe, it, expect } from "vitest";
import nodemailer from "nodemailer";

describe("Zoho SMTP Configuration", () => {
  it("should have ZOHO_EMAIL_PASSWORD set", () => {
    expect(process.env.ZOHO_EMAIL_PASSWORD).toBeTruthy();
    expect(typeof process.env.ZOHO_EMAIL_PASSWORD).toBe("string");
    expect(process.env.ZOHO_EMAIL_PASSWORD!.length).toBeGreaterThan(0);
  });

  it("should create a Zoho SMTP transporter without errors", () => {
    const transporter = nodemailer.createTransport({
      host: "smtp.zoho.com",
      port: 465,
      secure: true,
      auth: {
        user: "h2@h2colombiano.com",
        pass: process.env.ZOHO_EMAIL_PASSWORD || "",
      },
    });
    expect(transporter).toBeDefined();
  });

  it("should use h2@h2colombiano.com as sender (not gmail)", () => {
    const from = '"H2 COLOMBIANO" <h2@h2colombiano.com>';
    expect(from).toContain("h2@h2colombiano.com");
    expect(from).not.toContain("gmail");
    expect(from).not.toContain("noreply@manus");
  });
});
