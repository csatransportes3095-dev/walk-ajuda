import { describe, expect, it } from "vitest";
import {
  createWhatsappMessageUrl,
  readWhatsappMessageFromUrl,
  snapshotUnicodeText,
  snapshotWhatsappUrl,
} from "../shared/whatsappUnicodeDiagnostics";

const testMessage = "TESTE UTF-8 🔐 ⚠️ 🎥 📱 ✅ ❌ ℹ️";

describe("diagnóstico Unicode do payload WhatsApp", () => {
  it("preserva os emojis no texto original e na serialização JSON", () => {
    const template = snapshotUnicodeText(testMessage);
    const fromJson = snapshotUnicodeText(JSON.parse(template.json));

    expect(template.hasReplacementCharacter).toBe(false);
    expect(fromJson).toMatchObject({
      value: testMessage,
      codePoints: template.codePoints,
      utf8BytesHex: template.utf8BytesHex,
      hasReplacementCharacter: false,
    });
    expect(template.utf8BytesHex).toContain("F0 9F 94 90");
    expect(template.utf8BytesHex).toContain("E2 9A A0 EF B8 8F");
  });

  it("preserva o payload Unicode depois de construir e reler a URL do WhatsApp", () => {
    const url = createWhatsappMessageUrl("5511999999999", testMessage);
    const payload = readWhatsappMessageFromUrl(url);

    expect(url).toContain("text=TESTE%20UTF-8");
    expect(snapshotUnicodeText(payload)).toMatchObject({
      value: testMessage,
      hasReplacementCharacter: false,
    });
  });

  it("sinaliza a presença real de U+FFFD sem tentar alterá-la", () => {
    const corrupted = snapshotUnicodeText("TESTE UTF-8 �");

    expect(corrupted.hasReplacementCharacter).toBe(true);
    expect(corrupted.codePoints).toContain("U+FFFD");
  });

  it("expõe o payload percent-encoded antes da abertura do wa.me", () => {
    const diagnosticUrl = snapshotWhatsappUrl("5511999999999", testMessage);

    expect(diagnosticUrl.encodedText).toContain("%F0%9F%94%90");
    expect(diagnosticUrl.encodedText).toContain("%E2%9A%A0%EF%B8%8F");
    expect(diagnosticUrl.decodedPayload).toMatchObject({
      value: testMessage,
      hasReplacementCharacter: false,
    });
  });
});
