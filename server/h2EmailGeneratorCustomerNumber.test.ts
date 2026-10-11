import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const orders = fs.readFileSync(path.resolve(root, "client/src/pages/AdminOrders.tsx"), "utf8");
const generator = fs.readFileSync(path.resolve(root, "client/src/components/AdminEmailGenerator.tsx"), "utf8");

describe("gerador H2 vinculado ao codigo do cliente", () => {
  it("abre o gerador H2 levando customerNumber do pedido", () => {
    expect(orders).toContain('params.set("customerNumber", String(customerNumber))');
    expect(orders).toContain('window.open(buildH2EmailGeneratorUrl(ar)');
  });

  it("usa customerNumber como sufixo final quando aberto pelo pedido", () => {
    expect(generator).toContain('const fixedOrderSuffix = orderParams.fromOrder ? orderParams.customerNumber : null;');
    expect(generator).toContain('const suffix = orderParams.fromOrder ? orderParams.customerNumber! : randomNumber();');
    expect(generator).toContain('Todo e-mail gerado neste acesso terminará em .${orderParams.customerNumber}@${activeDomain}.');
  });

  it("bloqueia a geracao se o pedido nao enviar o codigo do cliente", () => {
    expect(generator).toContain('Código do cliente não recebido do pedido');
    expect(generator).toContain('A geração está bloqueada para evitar criar um e-mail com número errado.');
  });
});
