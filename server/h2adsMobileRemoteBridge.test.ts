import { describe, expect, it } from "vitest";
import { H2AdsMobileBridge, MOBILE_REMOTE_LEASE_MS } from "./h2adsMobileRemoteBridge";

function syntheticJpeg() {
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(130, 7), Buffer.from([0xff, 0xd9])]);
}

describe("H2ADS Mobile Fase 2: sessoes em memoria", () => {
  it("reserva apenas uma sessao por instancia e exige segredo de cada lado", () => {
    const bridge = new H2AdsMobileBridge();
    const lease = bridge.start(101, 10, 1_000);
    expect(lease.sessionToken.length).toBeGreaterThan(32);
    expect(() => bridge.start(101, 10, 1_001)).toThrow("instance_already_controlled");
    expect(bridge.heartbeat(101, "invalid", 1_002)).toBe(false);
    expect(bridge.heartbeat(101, lease.sessionToken, 1_003)).toBe(true);
    expect(bridge.workerNext(101, 99, 1_004)).toEqual({ active: false });
    expect(bridge.stop(101, "invalid")).toBe(false);
    expect(bridge.stop(101, lease.sessionToken)).toBe(true);
    expect(bridge.workerNext(101, 10, 1_005).active).toBe(false);
  });

  it("envia a imagem apenas para o ADM com token e Worker corretos", () => {
    const bridge = new H2AdsMobileBridge();
    const lease = bridge.start(11, 2, 1_000);
    const next = bridge.workerNext(11, 2, 1_001);
    expect(next.active).toBe(true);
    if (!next.active) throw new Error("lease inesperada");
    const jpeg = syntheticJpeg();
    expect(bridge.workerFrame(11, 999, next.workerLeaseId, jpeg, 1_100)).toBe(false);
    expect(bridge.workerFrame(11, 2, "wrong", jpeg, 1_100)).toBe(false);
    expect(bridge.workerFrame(11, 2, next.workerLeaseId, jpeg, 1_100)).toBe(true);
    expect(bridge.readFrame(11, "wrong", 1_200)).toBeNull();
    expect(bridge.readFrame(11, lease.sessionToken, 1_200)?.jpeg.equals(jpeg)).toBe(true);
    expect(bridge.readFrame(11, lease.sessionToken, 8_300)).toBeNull();
    bridge.clearAll();
    expect(bridge.readFrame(11, lease.sessionToken, 8_301)).toBeNull();
  });

  it("limita fila, quadros, sessoes simultaneas e expira se o celular sair", () => {
    const bridge = new H2AdsMobileBridge();
    const lease = bridge.start(1, 1, 1_000);
    bridge.start(2, 1, 1_000);
    expect(() => bridge.start(3, 1, 1_000)).toThrow("remote_capacity_reached");
    for (let i = 0; i < 16; i++) {
      expect(bridge.input(1, lease.sessionToken, { kind: "key", key: "Enter" }, 1_010)).toBe(true);
    }
    expect(bridge.input(1, lease.sessionToken, { kind: "key", key: "Tab" }, 1_020)).toBe(false);
    expect(bridge.workerNext(1, 1, 1_030).active).toBe(true);
    expect(bridge.heartbeat(1, lease.sessionToken, 1_020 + MOBILE_REMOTE_LEASE_MS + 1)).toBe(false);
    expect(bridge.workerNext(1, 1, 99_000).active).toBe(false);
    expect(bridge.start(3, 1, 99_001).sessionToken).toBeTruthy();
  });

  it("mantem entrada em voo ate ACK do Worker correto e informa o Android", () => {
    const bridge = new H2AdsMobileBridge();
    const lease = bridge.start(301, 10, 1_000);
    expect(bridge.input(301, lease.sessionToken, { kind: "scroll", deltaY: 200 }, 1_010)).toBe(true);
    const first = bridge.workerNext(301, 10, 1_020);
    const second = bridge.workerNext(301, 10, 1_030);
    if (!first.active || !second.active || !first.input || !second.input) throw new Error("entrada pendente");
    expect(second.input.id).toBe(first.input.id);
    expect(bridge.workerInputResult(301, 11, first.workerLeaseId, first.input.id, "sent", null, 1_040)).toBe(false);
    expect(bridge.workerInputResult(301, 10, "invalid", first.input.id, "sent", null, 1_040)).toBe(false);
    expect(bridge.workerInputResult(301, 10, first.workerLeaseId, first.input.id, "blocked", "target_unavailable", 1_040)).toBe(true);
    expect(bridge.lastInputStatus(301, lease.sessionToken, 1_041)).toMatchObject({
      state: "blocked", reason: "target_unavailable", kind: "scroll",
    });
    const completed = bridge.workerNext(301, 10, 1_050);
    expect(completed.active).toBe(true);
    if (!completed.active) throw new Error("sessao encerrada");
    expect(completed.input).toBeNull();
  });

  it("permite identificacao local mais varias abas e protege a escolha explicita", () => {
    const bridge = new H2AdsMobileBridge();
    const lease = bridge.start(51, 4, 1_000);
    const first = bridge.workerNext(51, 4, 1_010);
    if (!first.active) throw new Error("sessao nao ativa");
    const tabs = [
      { targetId: "aabb01", title: "Identificacao H2ADS", label: "Identificacao H2ADS", kind: "label" as const },
      { targetId: "aabb02", title: "Pagina um", label: "example.com", kind: "web" as const },
      { targetId: "aabb03", title: "Pagina dois", label: "uber.com", kind: "web" as const },
    ];
    expect(bridge.workerTabs(51, 9, first.workerLeaseId, tabs, 1_020)).toBe(false);
    expect(bridge.workerTabs(51, 4, first.workerLeaseId, tabs, 1_020)).toBe(true);
    expect(bridge.tabStatus(51, lease.sessionToken, 1_030)?.selectedTargetId).toBeNull();
    expect(bridge.selectTab(51, lease.sessionToken, "bad", 1_040)).toBe(false);
    expect(bridge.selectTab(51, lease.sessionToken, "aabb03", 1_040)).toBe(true);
    const selected = bridge.workerNext(51, 4, 1_050);
    expect(selected.active && selected.selectedTargetId).toBe("aabb03");
    const jpeg = syntheticJpeg();
    expect(bridge.workerFrame(51, 4, first.workerLeaseId, jpeg, 1_100, "aabb02")).toBe(false);
    expect(bridge.workerFrame(51, 4, first.workerLeaseId, jpeg, 1_100, "aabb03")).toBe(true);
    expect(bridge.selectTab(51, lease.sessionToken, "aabb02", 1_120)).toBe(true);
    expect(bridge.readFrame(51, lease.sessionToken, 1_130)).toBeNull();
    expect(bridge.workerTabs(51, 4, first.workerLeaseId, tabs.filter(t => t.targetId !== "aabb02"), 1_140)).toBe(true);
    expect(bridge.tabStatus(51, lease.sessionToken, 1_150)?.selectedTargetId).toBeNull();
    expect(bridge.workerFrame(51, 4, first.workerLeaseId, jpeg, 1_160, "aabb03")).toBe(false);
  });

  it("nega troca de Worker e rejeita JPEG ou volume invalido", () => {
    const bridge = new H2AdsMobileBridge();
    const first = bridge.start(42, 5, 1_000);
    const job = bridge.workerNext(42, 5, 1_001);
    if (!job.active) throw new Error("job esperado");
    expect(bridge.workerFrame(42, 5, job.workerLeaseId, Buffer.alloc(120), 1_020)).toBe(false);
    expect(bridge.workerFrame(42, 5, job.workerLeaseId, Buffer.alloc(360_000), 1_030)).toBe(false);
    bridge.revokeWorker(42, 5);
    expect(bridge.heartbeat(42, first.sessionToken, 1_040)).toBe(false);
  });
});
