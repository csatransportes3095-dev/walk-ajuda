import { describe, expect, it } from "vitest";
import {
  groupOrderStatusChoices,
  hasOrderSurname,
  visibleOrderName,
} from "../client/src/lib/orderCardCompactUtils";

describe("ADM Pedidos - agrupamento visual de status", () => {
  const options = [
    { key:"analise", label:"EM ANÁLISE" },
    { key:"aguardando_agendamento", label:"AGUARDANDO AGENDAMENTO" },
    { key:"agendamento_confirmado", label:"AGENDAMENTO CONFIRMADO" },
    { key:"cnh_em_analise", label:"CNH EM ANÁLISE" },
    { key:"cnh_aprovada", label:"CNH APROVADA" },
    { key:"foto_em_analise", label:"FOTO EM ANÁLISE" },
    { key:"foto_aprovada", label:"FOTO APROVADA" },
    { key:"foto_reprovada", label:"FOTO REPROVADA" },
    { key:"aguardando_ativa", label:"AGUARDANDO ATIVAR" },
    { key:"conta_ativa", label:"CONTA ATIVA" },
    { key:"doc_veiculo_em_teste", label:"DOC VEÍCULO EM TESTE" },
    { key:"doc_veiculo_aprovado", label:"DOC VEÍCULO APROVADO" },
    { key:"pedido_entregue", label:"PEDIDO ENTREGUE" },
    { key:"muitos_agendamentos", label:"MUITOS AGENDAMENTOS" },
    { key:"doc_veiculo_reprovado", label:"DOC VEÍCULO REPROVADO" },
    { key:"status_extra_x", label:"STATUS PERSONALIZADO" },
  ];

  it("preserva todas as chaves, sem apagar ou duplicar status de produto", () => {
    const grouped = groupOrderStatusChoices(options);
    const keys = grouped.flatMap(group => group.items.map(item => item.key));
    expect(keys).toHaveLength(options.length);
    expect(new Set(keys)).toEqual(new Set(options.map(item => item.key)));
  });

  it("separa foto, documentos, agendamento e encerramento sem trocar as chaves", () => {
    const groups = Object.fromEntries(groupOrderStatusChoices(options).map(group => [group.id, group.items.map(item => item.key)]));
    expect(groups.foto).toEqual(["foto_em_analise", "foto_aprovada", "foto_reprovada"]);
    expect(groups.documentos).toEqual(["cnh_em_analise", "cnh_aprovada", "doc_veiculo_em_teste", "doc_veiculo_aprovado", "doc_veiculo_reprovado"]);
    expect(groups.pedido).toContain("agendamento_confirmado");
    expect(groups.pedido).toContain("muitos_agendamentos");
    expect(groups.finalizacao).toContain("conta_ativa");
    expect(groups.finalizacao).toContain("pedido_entregue");
    expect(groups.outros).toEqual(["status_extra_x"]);
  });

  it("oculta somente o sobrenome na tela sem alterar o valor original", () => {
    const full = "Maria de Souza";
    expect(hasOrderSurname(full)).toBe(true);
    expect(visibleOrderName(full)).toBe("Maria •••");
    expect(visibleOrderName(full, true)).toBe(full);
    expect(visibleOrderName("João")).toBe("João");
    expect(visibleOrderName(null)).toBe("Cliente");
  });
});
