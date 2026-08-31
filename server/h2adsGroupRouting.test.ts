import { describe, expect, it } from "vitest";
import { resolveH2AdsAutomaticGroup } from "../shared/h2adsGroupRouting";

const groups = [
  { id: 1, name: "NOME ALEATORIO", status: "active" },
  { id: 2, name: "PRIMEIRO NOME", status: "active" },
  { id: 3, name: "NOME COMPLETO", status: "active" },
  { id: 4, name: "TAXI", status: "active" },
  { id: 5, name: "CONTA ATIVA", status: "active" },
  { id: 6, name: "AG FICAR ATIVA", status: "active" },
];

describe("H2ADS automatic group routing", () => {
  it("direciona pelas opções tradicionais do pedido", () => {
    expect(resolveH2AdsAutomaticGroup(groups, { serviceName: "UBER APP", serviceOption: "UBER 1º / NOME" })?.id).toBe(2);
    expect(resolveH2AdsAutomaticGroup(groups, { serviceName: "UBER APP", serviceOption: "UBER NOME / COMPLETO" })?.id).toBe(3);
    expect(resolveH2AdsAutomaticGroup(groups, { serviceName: "UBER APP", serviceOption: "NOME ALEATÓRIO" })?.id).toBe(1);
    expect(resolveH2AdsAutomaticGroup(groups, { serviceName: "TAXI", serviceOption: "NOME COMPLETO" })?.id).toBe(4);
  });

  it("prioriza etapas conta ativa e aguardando ficar ativa", () => {
    expect(resolveH2AdsAutomaticGroup(groups, { serviceOption: "NOME COMPLETO", latestStatus: "conta_ativa" })?.id).toBe(5);
    expect(resolveH2AdsAutomaticGroup(groups, { serviceOption: "NOME COMPLETO", latestStatus: "aguardando_ativa" })?.id).toBe(6);
  });

  it("ignora grupos arquivados", () => {
    expect(resolveH2AdsAutomaticGroup([{ id: 9, name: "TAXI", status: "archived" }], { serviceName: "TAXI" })).toBeNull();
  });
});
