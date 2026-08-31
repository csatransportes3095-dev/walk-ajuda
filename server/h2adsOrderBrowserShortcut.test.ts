import { describe, expect, it } from "vitest";
import { resolveH2AdsOrderBrowserShortcutState } from "../shared/h2adsOrderBrowserShortcut";

const base = {
  registrationId: 100,
  subOrderIndex: 2,
  links: [{ instanceId: 9, registrationId: 100, subOrderIndex: 2 }],
  instances: [{ id: 9, status: "draft" }],
  assignments: [{ instanceId: 9, workerId: 7 }],
  workers: [{ id: 7, connectionStatus: "online" }],
};

describe("H2ADS order browser shortcut", () => {
  it("prioriza o subpedido exato", () => {
    expect(resolveH2AdsOrderBrowserShortcutState({ ...base, runs: [] })?.instanceId).toBe(9);
  });

  it("usa o unico vinculo do mesmo pedido quando o indice legado divergir", () => {
    const result = resolveH2AdsOrderBrowserShortcutState({ ...base, subOrderIndex: 1, runs: [] });
    expect(result?.instanceId).toBe(9);
  });

  it("nao adivinha quando o pedido possui mais de um vinculo e nenhum indice bate", () => {
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
