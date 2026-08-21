import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const bot = fs.readFileSync(path.resolve(process.cwd(), "client/src/components/ColombiaBot.tsx"), "utf8");

describe("confirmação visual de envio no Bot", () => {
  it("guarda a URL confirmada e mostra prévia de documento e comprovante", () => {
    expect(bot).toContain("previewUrl?: string; previewMime?: string");
    expect(bot).toContain("markDocUploaded(msgId, uploaded.url, uploaded.mimeType)");
    expect(bot).toContain("previewUrl: uploaded.url, previewMime: uploaded.mimeType");
    expect(bot).toContain("RECEBIDO COM SUCESSO");
    expect(bot).toContain("Toque na foto para ampliar e conferir");
  });

  it("usa cards grandes e explicativos antes do envio", () => {
    expect(bot).toContain("Envie agora:");
    expect(bot).toContain("Toque para enviar");
    expect(bot).toContain("Último passo: envie o comprovante");
    expect(bot).toContain("Enviar comprovante Pix");
    expect(bot).toContain("Sem o comprovante, o pedido não pode ser finalizado.");
  });

  it("mantém a confirmação apenas depois que o upload realmente retorna sucesso", () => {
    const uploadIndex = bot.indexOf("const uploaded = await uploadOrderFileReliably(file, 'comprovante-pix')");
    const confirmationIndex = bot.indexOf("flowState.current.pixProofUrl = uploaded.url", uploadIndex);
    expect(uploadIndex).toBeGreaterThan(-1);
    expect(confirmationIndex).toBeGreaterThan(uploadIndex);
    expect(bot).toContain("if (!uploaded.ok)");
  });
});
