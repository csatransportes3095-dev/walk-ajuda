import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sharedUpload = fs.readFileSync(path.resolve(root, "client/src/lib/reliableOrderUpload.ts"), "utf8");
const home = fs.readFileSync(path.resolve(root, "client/src/pages/Home.tsx"), "utf8");
const bot = fs.readFileSync(path.resolve(root, "client/src/components/ColombiaBot.tsx"), "utf8");
const uploadRoute = fs.readFileSync(path.resolve(root, "server/uploadRoute.ts"), "utf8");

describe("upload único de comprovante para vitrine e Bot", () => {
  it("faz vitrine e Bot usarem o mesmo núcleo de upload", () => {
    expect(home).toContain('import { uploadOrderFileReliably } from "@/lib/reliableOrderUpload";');
    expect(bot).toContain('import { uploadOrderFileReliably } from "@/lib/reliableOrderUpload";');
    expect(home).toContain("await uploadOrderFileReliably(file, label)");
    expect(bot).toContain("await uploadOrderFileReliably(file, 'comprovante-pix')");
    expect(bot).not.toContain("uploadFileBase64");
  });

  it("prepara imagens, mantém PDF, lê arquivo com nova tentativa e repete falhas temporárias", () => {
    expect(sharedUpload).toContain("compressImageForOrderUpload");
    expect(sharedUpload).toContain("if (isPdf(file)");
    expect(sharedUpload).toContain("return readOnce(2)");
    expect(sharedUpload).toContain("for (let attempt = 1; attempt <= 4");
    expect(sharedUpload).toContain("credentials: \"include\"");
    expect(sharedUpload).toContain("MAX_ORDER_UPLOAD_BYTES");
  });

  it("informa erro específico de sessão, identidade, arquivo, rede ou servidor", () => {
    expect(sharedUpload).toContain('kind: "session"');
    expect(sharedUpload).toContain('kind: "permission"');
    expect(sharedUpload).toContain('kind: "file"');
    expect(sharedUpload).toContain('kind: "network"');
    expect(sharedUpload).toContain('kind: "server"');
  });

  it("não permite que telefone local escolha o cadastro de destino do upload", () => {
    const routeStart = uploadRoute.indexOf('app.post("/api/upload/order-file-base64"');
    const routeEnd = uploadRoute.indexOf('// ─── UPLOAD DO APK', routeStart);
    const route = uploadRoute.slice(routeStart, routeEnd);
    expect(route).toContain("requireCustomerSession(getCustomerSessionTokenFromRequest(req))");
    expect(route).not.toContain("requireCustomerSession(getCustomerSessionTokenFromRequest(req), phone)");
    expect(route).not.toContain("const { label, phone, data");
  });
});
