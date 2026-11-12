import { describe, expect, it, vi } from "vitest";
import {
  createFipeCatalogService, FipeCatalogError, fipeCatalogPath, normalizeFipeItems,
} from "./fipeCatalogProxy";

const brand = { kind: "brands" } as const;
const years = { kind: "years", brand: "59" } as const;
const models = { kind: "models", brand: "59", year: "2023-1" } as const;
const makeId = "11111111-2222-3333-4444-555555555555";
const yearModels = { kind: "brandModels", brand: makeId, year: 2016 } as const;

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
    expect(fipeCatalogPath(yearModels)).toBe("/brands/" + makeId + "/models?year=2016");
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
    expect(normalizeFipeItems([{ code: makeId, name: "Volkswagen" }])).toEqual([{ code: makeId, name: "Volkswagen" }]);
    expect(normalizeFipeItems([], true)).toEqual([]);
    expect(() => normalizeFipeItems([{ code: "/api/private", name: "x" }])).toThrow(FipeCatalogError);
  });

  it("loads all FIPEX brands across pages, caches them, and loads make/year models", async () => {
    let calls = 0;
    let now = 0;
    const requested: string[] = [];
    const service = createFipeCatalogService(async (url) => {
      calls += 1;
      requested.push(url);
      if (url.includes("/v1/makes")) {
        return ok({ data: [{ id: makeId, name: "VOLKSWAGEN" }], pagination: { pages: 1 } });
      }
      if (url.includes("/v1/models")) {
        return ok({ data: [{ id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", name: "GOL" }], pagination: { pages: 1 } });
      }
      throw new Error("Unexpected URL");
    }, () => now);
    expect((await service.load(brand)).source).toBe("fipex");
    expect((await service.load(brand)).data[0].code).toBe(makeId);
    expect((await service.load(brand)).source).toBe("cache");
    expect(calls).toBe(1);
    expect((await service.load(yearModels)).data[0].name).toBe("GOL");
    expect(requested[1]).toContain("make_id=" + makeId);
    expect(requested[1]).toContain("year=2016");
    expect(calls).toBe(2);
    now += 24 * 60 * 60 * 1000 + 1;
    expect((await service.load(brand)).source).toBe("fipex");
    expect(calls).toBe(3);
  });

  it("validates FIPEX make UUID and requested calendar year", () => {
    expect(() => fipeCatalogPath({ kind: "brandModels", brand: "../escape", year: 2016 })).toThrow(FipeCatalogError);
    expect(() => fipeCatalogPath({ kind: "brandModels", brand: makeId, year: 0 })).toThrow(FipeCatalogError);
  });

  it("deduplicates concurrent requests", async () => {
    let calls = 0;
    const service = createFipeCatalogService(async () => {
      calls++;
      await Promise.resolve();
      return ok({ data: [{ id: makeId, name: "VOLKSWAGEN" }], pagination: { pages: 1 } });
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
        : ok({ data: [{ id: makeId, name: "VOLKSWAGEN" }], pagination: { pages: 1 } }), () => now);
    await service.load(brand);
    now = 24 * 60 * 60 * 1000 + 1;
    fail = true;
    const result = await service.load(brand);
    expect(result.source).toBe("stale");
    expect(result.data).toHaveLength(1);
    now = 8 * 24 * 60 * 60 * 1000;
    await expect(service.load(brand)).rejects.toMatchObject({ code: "FIPEX_LIMIT", status: 503 });
  });

  it("surfaces rate limits and rejects malformed upstream JSON without cache", async () => {
    const rateService = createFipeCatalogService(async () => new Response("", { status: 429 }));
    await expect(rateService.load(brand)).rejects.toMatchObject({ code: "FIPEX_LIMIT", status: 503 });
    const badService = createFipeCatalogService(async () =>
      new Response("<html>broken</html>", { status: 200 }));
    await expect(badService.load(brand)).rejects.toMatchObject({ code: "FIPEX_INVALID" });
  });

  it("uses GM - Chevrolet models when native Chevrolet models are empty for the selected year", async () => {
    const chevroletId = "01988fb8-6018-7ad1-8c99-c70763fa578f";
    const gmChevroletId = "01988fb8-609f-7bae-9741-4e15fb6e3bca";
    const requested: string[] = [];
    const service = createFipeCatalogService(async (url) => {
      requested.push(url);
      if (url.includes("make_id=" + chevroletId)) {
        return ok({ data: [], pagination: { pages: 0 } });
      }
      if (url.includes("make_id=" + gmChevroletId)) {
        return ok({
          data: [{ id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", name: "ONIX" }],
          pagination: { pages: 1 },
        });
      }
      throw new Error("Unexpected URL");
    });
    const result = await service.load({ kind: "brandModels", brand: chevroletId, year: 2022 });
    expect(result.data).toEqual([
      { code: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", name: "ONIX" },
    ]);
    expect(requested).toHaveLength(2);
    expect(requested[0]).toContain("make_id=" + chevroletId);
    expect(requested[0]).toContain("year=2022");
    expect(requested[1]).toContain("make_id=" + gmChevroletId);
    expect(requested[1]).toContain("year=2022");
  });

  it("allows zero-page FIPEX responses only for empty model catalogs", async () => {
    const requested: string[] = [];
    const emptyModelsService = createFipeCatalogService(async (url) => {
      requested.push(url);
      return ok({ data: [], pagination: { pages: 0 } });
    });
    const result = await emptyModelsService.load({ kind: "brandModels", brand: makeId, year: 2022 });
    expect(result.data).toEqual([]);
    expect(requested).toHaveLength(1);

    const emptyMakesService = createFipeCatalogService(async () =>
      ok({ data: [], pagination: { pages: 0 } }));
    await expect(emptyMakesService.load(brand)).rejects.toMatchObject({ code: "FIPEX_INVALID" });

    const inconsistentService = createFipeCatalogService(async () =>
      ok({ data: [{ id: makeId, name: "VOLKSWAGEN" }], pagination: { pages: 0 } }));
    await expect(inconsistentService.load({ kind: "brandModels", brand: makeId, year: 2022 }))
      .rejects.toMatchObject({ code: "FIPEX_INVALID" });
  });

  it("does not retry supplier errors or alter VIN generation", async () => {
    const fetcher = vi.fn(async () => new Response("", { status: 503 }));
    const service = createFipeCatalogService(fetcher);
    await expect(service.load(models)).rejects.toMatchObject({ code: "FIPE_UPSTREAM" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
