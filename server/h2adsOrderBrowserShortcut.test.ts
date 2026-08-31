import { describe, expect, it } from "vitest";
import {
  canonicalH2AdsServiceKey,
  resolveH2AdsOrderBrowserShortcutState,
  resolveH2AdsOrderLinkRepairCandidate,
} from "../shared/h2adsOrderBrowserShortcut";

const base = {
  registrationId: 100,
  subOrderIndex: 2,
  links: [{ instanceId: 9, registrationId: 100, subOrderIndex: 2 }],
  instances: [{ id: 9, status: "draft" }],
  assignments: [{ instanceId: 9, workerId: 7 }],
  workers: [{ id: 7, connectionStatus: "online" }],
};

describe("H2ADS order browser shortcut", () => {
  it("usa somente o vínculo exato de pedido e subpedido", () => {
    expect(resolveH2AdsOrderBrowserShortcutState({ ...base, runs: [] })?.instanceId).toBe(9);
    expect(resolveH2AdsOrderBrowserShortcutState({ ...base, subOrderIndex: 1, runs: [] })).toBeNull();
  });

  it("não adivinha quando o pedido possui outro vínculo", () => {
    const result = resolveH2AdsOrderBrowserShortcutState({
      ...base,
      subOrderIndex: 3,
      links: [
        { instanceId: 9, registrationId: 100, subOrderIndex: 0 },
        { instanceId: 10, registrationId: 100, subOrderIndex: 1 },
      ],
      instances: [{ id: 9, status: "draft" }, { id: 10, status: "draft" }],
      assignments: [{ instanceId: 9, workerId: 7 }, { instanceId: 10, workerId: 7 }],
      runs: [],
    });
    expect(result).toBeNull();
  });

  it("libera abrir quando o perfil está pronto ou fechado", () => {
    expect(resolveH2AdsOrderBrowserShortcutState({ ...base, runs: [{ instanceId: 9, state: "proxy_verified" }] })?.canOpen).toBe(true);
    expect(resolveH2AdsOrderBrowserShortcutState({ ...base, runs: [{ instanceId: 9, state: "closed" }] })?.canOpen).toBe(true);
  });

  it("libera somente fechar quando o browser está aberto", () => {
    const result = resolveH2AdsOrderBrowserShortcutState({ ...base, runs: [{ instanceId: 9, state: "browser_open" }] });
    expect(result?.canOpen).toBe(false);
    expect(result?.canClose).toBe(true);
  });

  it("bloqueia os atalhos quando o Worker está offline", () => {
    const result = resolveH2AdsOrderBrowserShortcutState({ ...base, workers: [{ id: 7, connectionStatus: "offline" }], runs: [{ instanceId: 9, state: "closed" }] });
    expect(result?.canOpen).toBe(false);
    expect(result?.canClose).toBe(false);
    expect(result?.reason).toBe("Worker offline.");
  });

  it("bloqueia instância arquivada", () => {
    const result = resolveH2AdsOrderBrowserShortcutState({ ...base, instances: [{ id: 9, status: "archived" }], runs: [{ instanceId: 9, state: "closed" }] });
    expect(result?.canOpen).toBe(false);
    expect(result?.reason).toContain("arquivada");
  });
});

describe("H2ADS legacy order link repair", () => {
  it("normaliza aliases equivalentes de nome completo", () => {
    expect(canonicalH2AdsServiceKey("UBER APP", "NOME COMPLETO")).toBe("uber|nome_completo");
    expect(canonicalH2AdsServiceKey("UBER APP", "UBER NOME / COMPLETO")).toBe("uber|nome_completo");
  });

  it("normaliza aliases tradicionais das opções", () => {
    expect(canonicalH2AdsServiceKey("UBER APP", "NOME ALEATÓRIO")).toBe("uber|nome_aleatorio");
    expect(canonicalH2AdsServiceKey("UBER APP", "PRIMEIRO NOME")).toBe("uber|primeiro_nome");
  });

  it("oferece reparo somente quando existe um candidato único do mesmo cliente e serviço", () => {
    const result = resolveH2AdsOrderLinkRepairCandidate({
      registrationId: 200,
      subOrderIndex: 0,
      customerNumber: 2021,
      serviceName: "UBER APP",
      serviceOption: "NOME COMPLETO",
      links: [{ instanceId: 9, registrationId: 100, subOrderIndex: 0 }],
      orders: [
        { id: 100, subOrderIndex: 0, customerNumber: 2021, orderNumber: 310000, serviceName: "UBER APP", serviceOption: "UBER NOME / COMPLETO" },
        { id: 200, subOrderIndex: 0, customerNumber: 2021, orderNumber: 100008, serviceName: "UBER APP", serviceOption: "NOME COMPLETO" },
      ],
    });
    expect(result).toMatchObject({ instanceId: 9, linkedRegistrationId: 100, linkedSubOrderIndex: 0, linkedOrderNumber: 310000, serviceKey: "uber|nome_completo" });
  });

  it("não oferece reparo quando há dois candidatos compatíveis", () => {
    const result = resolveH2AdsOrderLinkRepairCandidate({
      registrationId: 200,
      subOrderIndex: 0,
      customerNumber: 2021,
      serviceName: "UBER APP",
      serviceOption: "NOME COMPLETO",
      links: [
        { instanceId: 9, registrationId: 100, subOrderIndex: 0 },
        { instanceId: 10, registrationId: 101, subOrderIndex: 0 },
      ],
      orders: [
        { id: 100, subOrderIndex: 0, customerNumber: 2021, orderNumber: 310000, serviceName: "UBER APP", serviceOption: "UBER NOME / COMPLETO" },
        { id: 101, subOrderIndex: 0, customerNumber: 2021, orderNumber: 310001, serviceName: "UBER APP", serviceOption: "NOME COMPLETO" },
      ],
    });
    expect(result).toBeNull();
  });

  it("não oferece reparo para cliente diferente", () => {
    const result = resolveH2AdsOrderLinkRepairCandidate({
      registrationId: 200,
      subOrderIndex: 0,
      customerNumber: 2021,
      serviceName: "UBER APP",
      serviceOption: "NOME COMPLETO",
      links: [{ instanceId: 9, registrationId: 100, subOrderIndex: 0 }],
      orders: [{ id: 100, subOrderIndex: 0, customerNumber: 9999, orderNumber: 310000, serviceName: "UBER APP", serviceOption: "NOME COMPLETO" }],
    });
    expect(result).toBeNull();
  });

  it("não oferece reparo para serviço diferente", () => {
    const result = resolveH2AdsOrderLinkRepairCandidate({
      registrationId: 200,
      subOrderIndex: 0,
      customerNumber: 2021,
      serviceName: "UBER APP",
      serviceOption: "NOME COMPLETO",
      links: [{ instanceId: 9, registrationId: 100, subOrderIndex: 0 }],
      orders: [{ id: 100, subOrderIndex: 0, customerNumber: 2021, orderNumber: 310000, serviceName: "UBER APP", serviceOption: "NOME ALEATÓRIO" }],
    });
    expect(result).toBeNull();
  });
});
