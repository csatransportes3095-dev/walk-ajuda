import { describe, expect, it } from "vitest";
import {
  h2AdsCreateGroupSchema,
  h2AdsCreateInstanceSchema,
  h2AdsGroupStatusSchema,
  h2AdsInstanceStatusSchema,
  h2AdsUpdateGroupSchema,
  h2AdsUpdateInstanceSchema,
} from "./routers/h2ads";

describe("contrato administrativo H2 Ads", () => {
  it("aceita apenas os estados administrativos da base isolada", () => {
    expect(h2AdsGroupStatusSchema.safeParse("active").success).toBe(true);
    expect(h2AdsGroupStatusSchema.safeParse("archived").success).toBe(true);
    expect(h2AdsInstanceStatusSchema.safeParse("draft").success).toBe(true);
    expect(h2AdsInstanceStatusSchema.safeParse("paused").success).toBe(true);
    expect(h2AdsInstanceStatusSchema.safeParse("ready").success).toBe(false);
  });

  it("valida grupos e instâncias e rejeita campos de proxy ou browser", () => {
    expect(h2AdsCreateGroupSchema.safeParse({ name: "Operação São Paulo" }).success).toBe(true);
    expect(h2AdsCreateInstanceSchema.safeParse({ groupId: 1, name: "Instância 01" }).success).toBe(true);
    expect(h2AdsCreateInstanceSchema.safeParse({ groupId: 1, name: "Instância 01", proxyUrl: "http://blocked" }).success).toBe(false);
    expect(h2AdsCreateInstanceSchema.safeParse({ groupId: 1, name: "Instância 01", browserWSEndpoint: "ws://blocked" }).success).toBe(false);
  });

  it("exige alterações explícitas ao atualizar", () => {
    expect(h2AdsUpdateGroupSchema.safeParse({ id: 1 }).success).toBe(false);
    expect(h2AdsUpdateInstanceSchema.safeParse({ id: 1 }).success).toBe(false);
    expect(h2AdsUpdateInstanceSchema.safeParse({ id: 1, status: "paused" }).success).toBe(true);
  });
});
