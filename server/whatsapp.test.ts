import { describe, it, expect } from "vitest";

// Test the sanitization logic used in both frontend and backend
const sanitizeWhatsappNumber = (raw: string): string => {
  return raw.replace(/[^\d+]/g, '');
};

describe("WhatsApp Number Sanitization", () => {
  it("should keep clean numbers unchanged", () => {
    expect(sanitizeWhatsappNumber("5511978307371")).toBe("5511978307371");
  });

  it("should remove spaces", () => {
    expect(sanitizeWhatsappNumber("55 11 978307371")).toBe("5511978307371");
  });

  it("should remove parentheses and hyphens", () => {
    expect(sanitizeWhatsappNumber("55 (11)97830-7371")).toBe("5511978307371");
  });

  it("should handle format like '55 (11)93936-9567'", () => {
    expect(sanitizeWhatsappNumber("55 (11)93936-9567")).toBe("5511939369567");
  });

  it("should remove dots", () => {
    expect(sanitizeWhatsappNumber("55.11.978307371")).toBe("5511978307371");
  });

  it("should keep + prefix if present", () => {
    expect(sanitizeWhatsappNumber("+5511978307371")).toBe("+5511978307371");
  });

  it("should handle empty string", () => {
    expect(sanitizeWhatsappNumber("")).toBe("");
  });

  it("should generate valid wa.me URL", () => {
    const number = sanitizeWhatsappNumber("55 (11)93936-9567");
    const url = `https://wa.me/${number}?text=${encodeURIComponent("Teste")}`;
    expect(url).toBe("https://wa.me/5511939369567?text=Teste");
    expect(url).not.toContain(" ");
    expect(url).not.toContain("(");
    expect(url).not.toContain(")");
  });
});
