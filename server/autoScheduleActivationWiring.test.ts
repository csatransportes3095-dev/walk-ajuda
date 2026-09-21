import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("persistência do botão de agendamento automático", () => {
  it("grava imediatamente pelo próprio botão", () => {
    const products = read("client/src/pages/AdminProducts.tsx");
    expect(products).toContain("onClick={handleAutoScheduleToggle}");
    expect(products).toContain("onAutoScheduleChange(next)");
    expect(products).toContain("updateAutoScheduleMut.mutateAsync");
    expect(products).toContain("autoScheduleEnabled: enabled ? 1 : 0");
  });

  it("não altera os outros campos da opção ao ativar", () => {
    const products = read("client/src/pages/AdminProducts.tsx");
    const isolatedPayload = /updateAutoScheduleMut\.mutateAsync\(\{\s*id: opt\.id,\s*autoScheduleEnabled: enabled \? 1 : 0,\s*\}\)/s;
    expect(products).toMatch(isolatedPayload);
  });

  it("avisa quando nenhuma opção está realmente ativa", () => {
    const orders = read("client/src/pages/AdminOrders.tsx");
    expect(orders).toContain('result?.options || 0) === 0');
    expect(orders).toContain("Nenhuma opção está com agendamento automático ativado no banco.");
  });
});
