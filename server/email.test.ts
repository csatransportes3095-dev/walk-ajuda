import { describe, expect, it } from "vitest";

describe("email credentials", () => {
  it("EMAIL_USER should be set", () => {
    expect(process.env.EMAIL_USER).toBeTruthy();
    expect(typeof process.env.EMAIL_USER).toBe("string");
  });

  it("EMAIL_PASSWORD should be set", () => {
    expect(process.env.EMAIL_PASSWORD).toBeTruthy();
    expect(typeof process.env.EMAIL_PASSWORD).toBe("string");
  });

  it("SITE_GENERAL_PASSWORD should be set", () => {
    expect(process.env.SITE_GENERAL_PASSWORD).toBeTruthy();
    expect(typeof process.env.SITE_GENERAL_PASSWORD).toBe("string");
  });
});
