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
