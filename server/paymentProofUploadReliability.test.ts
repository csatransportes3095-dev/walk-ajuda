import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const home = fs.readFileSync(path.resolve(root, "client/src/pages/Home.tsx"), "utf8");
const bot = fs.readFileSync(path.resolve(root, "client/src/components/ColombiaBot.tsx"), "utf8");
const uploadRoute = fs.readFileSync(path.resolve(root, "server/uploadRoute.ts"), "utf8");

describe("confiabilidade do envio de comprovante", () => {
  it("não libera finalizar apenas pela prévia local", () => {
    expect(home).toContain("disabled={!restoredFileUrls.paymentProof || isSubmitting}");
    expect(home).toContain("if (!restoredFileUrls.paymentProof) {");
  });

  it("não inicia um segundo upload do comprovante no momento de finalizar", () => {
    expect(home).toContain("const paymentProofUploadedUrl = restoredFileUrls.paymentProof;");
    expect(home).not.toContain("uploadFileToServer(await prepareForUpload(paymentProof), 'comprovante-pix'");
  });

  it("mantém o arquivo selecionado e oferece reenvio depois de falha", () => {
    expect(home).toContain("setPaymentProofUploadState('failed');");
    expect(home).toContain("TENTAR ENVIAR NOVAMENTE");
  });

  it("padroniza o limite de 15 MB entre vitrine, Bot e servidor", () => {
    expect(home).toContain("file.size > 15 * 1024 * 1024");
    expect(bot).toContain("file.size > 15 * 1024 * 1024");
    expect(uploadRoute).toContain("buffer.length > 15 * 1024 * 1024");
  });

  it("repete somente falhas temporárias e protege também o Bot", () => {
    expect(home).toContain("const transient = !status || status === 408 || status === 429 || status >= 500;");
    expect(bot).toContain("const timeoutId = setTimeout(() => controller.abort(), 120000);");
    expect(bot).toContain("for (let attempt = 1; attempt <= 4; attempt++)");
  });
});
