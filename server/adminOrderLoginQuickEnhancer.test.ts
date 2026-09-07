import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const enhancer = fs.readFileSync(path.resolve(process.cwd(), "client/src/components/AdminOrderLoginQuickEnhancer.tsx"), "utf8");
const main = fs.readFileSync(path.resolve(process.cwd(), "client/src/main.tsx"), "utf8");
const orders = fs.readFileSync(path.resolve(process.cwd(), "client/src/pages/AdminOrders.tsx"), "utf8");
const qrField = fs.readFileSync(path.resolve(process.cwd(), "client/src/components/AuthenticatorQrAdminField.tsx"), "utf8");

describe("AdminOrders - atalhos de login sem quebrar o fluxo existente", () => {
  it("monta o enhancer apenas no bootstrap e restringe a /admin/orders", () => {
    expect(main).toContain('import AdminOrderLoginQuickEnhancer from "./components/AdminOrderLoginQuickEnhancer"');
    expect(main).toContain("<AdminOrderLoginQuickEnhancer />");
    expect(enhancer).toContain('startsWith("/admin/orders")');
  });

  it("reutiliza os campos e o botão Salvar Dados de Login já existentes", () => {
    expect(orders).toContain("Salvar Dados de Login");
    expect(enhancer).toContain('includes("SALVAR DADOS DE LOGIN")');
    expect(enhancer).toContain("setReactInputValue(input, createdEmail)");
    expect(enhancer).toContain("setReactInputValue(passwordInput, account.password)");
    expect(enhancer).toContain("setReactInputValue(input, formatted)");
  });

  it("cria email pelo endpoint Zoho existente e só preenche após confirmação", () => {
    expect(enhancer).toContain("trpc.email.create.useMutation()");
    expect(enhancer).toContain("const result = await createEmailRef.current");
    expect(enhancer).toContain("primaryEmailAddress");
    expect(enhancer).toContain("Nenhum servidor Zoho disponível");
  });

  it("gera QR local a partir de Base32 e envia pelo input protegido já existente", () => {
    expect(enhancer).toContain("QRCode.toDataURL");
    expect(enhancer).toContain("otpauth://totp/");
    expect(enhancer).toContain("new DataTransfer()");
    expect(qrField).toContain("onPendingValueChange({ data, mimeType: file.type })");
    expect(qrField).toContain("requestDelete");
  });

  it("não sobrescreve telefone ou email/senha existentes sem confirmação", () => {
    expect(enhancer).toContain("Já existe um telefone de login. Gerar outro e substituir?");
    expect(enhancer).toContain("Já existem dados de e-mail/senha neste pedido. Criar uma nova conta e substituir?");
  });
});
