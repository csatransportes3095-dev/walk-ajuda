import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { selectWhatsappTemplateForStatus } from "../shared/whatsappTemplateSelection";

const projectRoot = path.resolve(import.meta.dirname, "..");

const templates = [
  { id: 1, statusKey: "pedido_entregue", isDefault: 0 },
  { id: 2, statusKey: "pedido_entregue", isDefault: "1" },
  { id: 3, statusKey: "conta_ativa", isDefault: 1 },
];

describe("seleção de pré-molde WhatsApp por status", () => {
  it("prioriza o pré-molde padrão do status canônico", () => {
    expect(selectWhatsappTemplateForStatus(templates, "pedido_entregue")?.id).toBe(2);
  });

  it("reconhece o status legado entregue como pedido_entregue", () => {
    expect(selectWhatsappTemplateForStatus(templates, "entregue")?.id).toBe(2);
  });

  it("não usa um pré-molde de outro status", () => {
    expect(selectWhatsappTemplateForStatus(templates, "em_analise")).toBeNull();
  });

  it("usa o status selecionado ao abrir o modal do pedido", () => {
    const source = fs.readFileSync(path.join(projectRoot, "client/src/pages/AdminOrders.tsx"), "utf8");

    expect(source).toContain("selectWhatsappTemplateForStatus(waTemplates as any[], currentStatus)");
    expect(source).toContain("setWaModalOrder({ ...order, latestStatus: currentStatus, waPhone, defaultMsg: msg })");
    expect(source).not.toContain("const currentStatus = order.latestStatus || '';\n                              const defaultTemplate = (waTemplates as any[]).find");
  });
});
