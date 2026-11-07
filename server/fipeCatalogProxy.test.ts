import { describe, expect, it, vi } from "vitest";
import {
  createFipeCatalogService, FipeCatalogError, fipeCatalogPath, normalizeFipeItems,
} from "./fipeCatalogProxy";

const brand = { kind: "brands" } as const;
const years = { kind: "years", brand: "59" } as const;
const models = { kind: "models", brand: "59", year: "2023-1" } as const;

function ok(items: unknown) {
  return new Response(JSON.stringify(items), {
    status: 200, headers: { "content-type": "application/json" },
  });
}

describe("FIPE isolated catalogue proxy", () => {
  it("constructs only fixed catalogue paths", () => {
    expect(fipeCatalogPath(brand)).toBe("/brands");
    expect(fipeCatalogPath(years)).toBe("/brands/59/years");
    expect(fipeCatalogPath(models)).toBe("/brands/59/years/2023-1/models");
    for (const brandInput of ["", "../admin", "59?x=1", "0", "https://attacker.test"]) {
      expect(() => fipeCatalogPath({ kind: "years", brand: brandInput })).toThrow(FipeCatalogError);
    }
    for (const yearInput of ["", "2023/1", "../x", "2023-1?x=1"]) {
      expect(() => fipeCatalogPath({ kind: "models", brand: "59", year: yearInput })).toThrow(FipeCatalogError);
    }
  });

  it("validates supplier data before caching", () => {
    expect(normalizeFipeItems([{ code: "59", name: "Volkswagen" }])).toEqual([
      { code: "59", name: "Volkswagen" },
    ]);
    expect(() => normalizeFipeItems([])).toThrow(FipeCatalogError);
    expect(normalizeFipeItems([], true)).toEqual([]);
    expect(() => normalizeFipeItems([{ code: "/api/private", name: "x" }])).toThrow(FipeCatalogError);
  });

  it("caches successful data, avoids repeat supplier calls and isolates resources", async () => {
    let calls = 0;
    let time = 0;
    const service = createFipeCatalogService(async (url) => {
      calls += 1;
      expect(url.startsWith("https://fipe.parallelum.com.br/api/v2/cars/")).toBe(true);
      return ok([{ code: "59", name: "Volkswagen" }]);
    }, () => time);
    expect((await service.load(brand)).source).toBe("upstream");
    expect((await service.load(brand)).source).toBe("cache");
    expect(calls).toBe(1);
    await service.load(years);
    expect(calls).toBe(2);
    time += 24 * 60 * 60 * 1000 + 1;
    expect((await service.load(brand)).source).toBe("upstream");
    expect(calls).toBe(3);
  });

  it("deduplicates concurrent requests", async () => {
    let calls = 0;
    const service = createFipeCatalogService(async () => {
      calls++;
      await Promise.resolve();
      return ok([{ code: "59", name: "Volkswagen" }]);
    });
    const [a, b] = await Promise.all([service.load(brand), service.load(brand)]);
    expect(a.data).toEqual(b.data);
    expect(calls).toBe(1);
  });

  it("serves a stale catalogue during supplier 429 without silently dropping brands", async () => {
    let now = 0;
    let fail = false;
    const service = createFipeCatalogService(async () =>
      fail
        ? new Response("Rate limited", { status: 429 })
        : ok([{ code: "59", name: "Volkswagen" }]), () => now);
    await service.load(brand);
    now = 24 * 60 * 60 * 1000 + 1;
    fail = true;
    const result = await service.load(brand);
    expect(result.source).toBe("stale");
    expect(result.data).toHaveLength(1);
    now = 8 * 24 * 60 * 60 * 1000;
    await expect(service.load(brand)).rejects.toMatchObject({ code: "FIPE_LIMIT", status: 503 });
  });

  it("surfaces rate limits and rejects malformed upstream JSON without cache", async () => {
    const rateService = createFipeCatalogService(async () => new Response("", { status: 429 }));
    await expect(rateService.load(brand)).rejects.toMatchObject({ code: "FIPE_LIMIT", status: 503 });
    const badService = createFipeCatalogService(async () =>
      new Response("<html>broken</html>", { status: 200 }));
    await expect(badService.load(brand)).rejects.toMatchObject({ code: "FIPE_INVALID_RESPONSE" });
  });

  it("does not retry supplier errors or alter VIN generation", async () => {
    const fetcher = vi.fn(async () => new Response("", { status: 503 }));
    const service = createFipeCatalogService(fetcher);
    await expect(service.load(models)).rejects.toMatchObject({ code: "FIPE_UPSTREAM" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("builds safe all-models paths for the brand fallback", () => {
    expect(fipeCatalogPath({ kind: "brandModels", brand: "59" })).toBe("/brands/59/models");
    expect(() => fipeCatalogPath({ kind: "brandModels", brand: "../admin" })).toThrow(FipeCatalogError);
  });

  it("uses all-models endpoint when upstream works without the backup", async () => {
    const requested: string[] = [];
    const service = createFipeCatalogService(async (url) => {
      requested.push(url);
      return ok([{ code: "005387-2", name: "GOL" }]);
    });
    const result = await service.load({ kind: "brandModels", brand: "59" });
    expect(result.source).toBe("upstream");
    expect(result.data).toEqual([{ code: "005387-2", name: "GOL" }]);
    expect(requested).toEqual(["https://fipe.parallelum.com.br/api/v2/cars/brands/59/models"]);
    expect((await service.load({ kind: "brandModels", brand: "59" })).source).toBe("cache");
    expect(requested).toHaveLength(1);
  });

  it("falls back to BrasilAPI brand models without claiming year validation", async () => {
    const requested: string[] = [];
    const service = createFipeCatalogService(async (url) => {
      requested.push(url);
      if (url.includes("fipe.parallelum.com.br")) {
        return new Response("blocked", { status: 429 });
      }
      if (url === "https://brasilapi.com.br/api/fipe/veiculos/v1/carros/59") {
        return ok([{ valor: "005387-2", modelo: "GOL" }]);
      }
      throw new Error("unexpected upstream");
    });
    const result = await service.load({ kind: "brandModels", brand: "59" });
    expect(result.source).toBe("brasilapi");
    expect(result.data).toEqual([{ code: "005387-2", name: "GOL" }]);
    expect(requested).toHaveLength(2);
    expect(requested[1]).toBe("https://brasilapi.com.br/api/fipe/veiculos/v1/carros/59");
  });

  it("does not return fabricated models when both upstreams fail", async () => {
    const service = createFipeCatalogService(async () => new Response("", { status: 503 }));
    await expect(service.load({ kind: "brandModels", brand: "59" }))
      .rejects.toMatchObject({ code: "FIPE_BACKUP_UPSTREAM" });
  });

});
