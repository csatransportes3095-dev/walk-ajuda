/**
 * FIPE catalogue only. Independent of VIN generation/reservation.
 *
 * All upstream URLs are fixed and validated. Server-side cache avoids exposing
 * third-party requests/tokens in browsers and reduces free API quota usage.
 */
import type { Express, Request, Response as ExpressResponse } from "express";

const FIPE_CARS_BASE = "https://fipe.parallelum.com.br/api/v2/cars";
const CACHE_FRESH_MS = 24 * 60 * 60 * 1000;
const CACHE_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CACHE_KEYS = 500;
const FETCH_TIMEOUT_MS = 8_000;
const MAX_RESPONSE_BYTES = 2_000_000;

export type FipeCatalogItem = { code: string; name: string };
export type FipeCatalogSource = "upstream" | "brasilapi" | "cache" | "stale";
export type FipeCatalogResource =
  | { kind: "brands" }
  | { kind: "years"; brand: string }
  | { kind: "brandModels"; brand: string }
  | { kind: "models"; brand: string; year: string };

type CatalogResult = { data: FipeCatalogItem[]; source: FipeCatalogSource };
type CacheEntry = { data: FipeCatalogItem[]; freshUntil: number; staleUntil: number };

export class FipeCatalogError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = "FipeCatalogError";
  }
}

export function fipeCatalogPath(resource: FipeCatalogResource): string {
  if (resource.kind === "brands") return "/brands";
  if (!/^[1-9][0-9]{0,5}$/.test(resource.brand)) {
    throw new FipeCatalogError(400, "INVALID_BRAND", "Marca FIPE invalida.");
  }
  if (resource.kind === "years") return "/brands/" + resource.brand + "/years";
  if (resource.kind === "brandModels") return "/brands/" + resource.brand + "/models";
  if (!/^[0-9]{4,5}-[0-9]{1,2}$/.test(resource.year)) {
    throw new FipeCatalogError(400, "INVALID_YEAR", "Ano FIPE invalido.");
  }
  return "/brands/" + resource.brand + "/years/" + resource.year + "/models";
}

export function normalizeFipeItems(payload: unknown, allowEmpty = false): FipeCatalogItem[] {
  if (!Array.isArray(payload) || payload.length > 10000 || (!allowEmpty && payload.length === 0)) {
    throw new FipeCatalogError(502, "FIPE_INVALID_RESPONSE", "Resposta do catalogo FIPE invalida.");
  }
  return payload.map((entry: unknown) => {
    if (entry === null || typeof entry !== "object") {
      throw new FipeCatalogError(502, "FIPE_INVALID_RESPONSE", "Item FIPE invalido.");
    }
    const raw = entry as Record<string, unknown>;
    const code = typeof raw.code === "number" && Number.isFinite(raw.code)
      ? String(raw.code) : raw.code;
    const name = raw.name;
    if (typeof code !== "string" || !/^[0-9]+(?:-[0-9]+)?$/.test(code) ||
        typeof name !== "string" || !name.trim() || name.length > 500) {
      throw new FipeCatalogError(502, "FIPE_INVALID_RESPONSE", "Campos FIPE invalidos.");
    }
    return { code, name };
  });
}

export function createFipeCatalogService(
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response> =
    (url, init) => globalThis.fetch(url, init),
  now: () => number = () => Date.now(),
) {
  const cache = new Map<string, CacheEntry>();
  const pending = new Map<string, Promise<CatalogResult>>();

  async function fetchUpstream(path: string, allowEmpty: boolean): Promise<FipeCatalogItem[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const token = process.env.FIPE_API_TOKEN?.trim();
    try {
      const response = await fetchImpl(FIPE_CARS_BASE + path, {
        method: "GET",
        headers: {
          Accept: "application/json",
          ...(token ? { "X-Subscription-Token": token } : {}),
        },
        redirect: "error",
        signal: controller.signal,
      });
      if (response.status === 429) {
        throw new FipeCatalogError(503, "FIPE_LIMIT", "Limite temporario de consultas FIPE atingido.");
      }
      if (!response.ok) {
        throw new FipeCatalogError(502, "FIPE_UPSTREAM", "Servico FIPE indisponivel (" + response.status + ").");
      }
      const bytes = Number(response.headers.get("content-length") || "0");
      if (bytes > MAX_RESPONSE_BYTES) {
        throw new FipeCatalogError(502, "FIPE_INVALID_RESPONSE", "Resposta FIPE muito grande.");
      }
      const content = await response.text();
      if (content.length > MAX_RESPONSE_BYTES) {
        throw new FipeCatalogError(502, "FIPE_INVALID_RESPONSE", "Resposta FIPE muito grande.");
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        throw new FipeCatalogError(502, "FIPE_INVALID_RESPONSE", "JSON FIPE invalido.");
      }
      return normalizeFipeItems(parsed, allowEmpty);
    } catch (error) {
      if (error instanceof FipeCatalogError) throw error;
      if (controller.signal.aborted) {
        throw new FipeCatalogError(504, "FIPE_TIMEOUT", "Tempo limite de consulta FIPE excedido.");
      }
      throw new FipeCatalogError(502, "FIPE_NETWORK", "Nao foi possivel conectar a FIPE.");
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchBrasilModels(brand: string): Promise<FipeCatalogItem[]> {
    // Fixed, allowlisted URL and digits-only code, checked by fipeCatalogPath.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetchImpl(
        "https://brasilapi.com.br/api/fipe/veiculos/v1/carros/" + brand,
        { method: "GET", headers: { Accept: "application/json" }, redirect: "error", signal: controller.signal },
      );
      if (!response.ok) {
        throw new FipeCatalogError(502, "FIPE_BACKUP_UPSTREAM", "Catalogo alternativo indisponivel (" + response.status + ").");
      }
      const declaredSize = Number(response.headers.get("content-length") || "0");
      if (declaredSize > MAX_RESPONSE_BYTES) {
        throw new FipeCatalogError(502, "FIPE_BACKUP_INVALID", "Catalogo alternativo excedeu limite.");
      }
      const body = await response.text();
      if (body.length > MAX_RESPONSE_BYTES) {
        throw new FipeCatalogError(502, "FIPE_BACKUP_INVALID", "Catalogo alternativo excedeu limite.");
      }
      let payload: unknown;
      try { payload = JSON.parse(body); }
      catch { throw new FipeCatalogError(502, "FIPE_BACKUP_INVALID", "Resposta alternativa invalida."); }
      if (!Array.isArray(payload) || payload.length === 0 || payload.length > 10000) {
        throw new FipeCatalogError(502, "FIPE_BACKUP_INVALID", "Lista alternativa invalida.");
      }
      return normalizeFipeItems(payload.map((entry: unknown) => {
        if (!entry || typeof entry !== "object") {
          throw new FipeCatalogError(502, "FIPE_BACKUP_INVALID", "Modelo alternativo invalido.");
        }
        const row = entry as Record<string, unknown>;
        return { code: row.valor, name: row.modelo };
      }));
    } catch (error) {
      if (error instanceof FipeCatalogError) throw error;
      if (controller.signal.aborted) {
        throw new FipeCatalogError(504, "FIPE_BACKUP_TIMEOUT", "Catalogo alternativo demorou demais.");
      }
      throw new FipeCatalogError(502, "FIPE_BACKUP_NETWORK", "Erro de conexao com catalogo alternativo.");
    } finally {
      clearTimeout(timer);
    }
  }

  async function load(resource: FipeCatalogResource): Promise<CatalogResult> {
    const path = fipeCatalogPath(resource);
    const existing = cache.get(path);
    if (existing && now() < existing.freshUntil) {
      return { data: existing.data, source: "cache" };
    }
    const inProgress = pending.get(path);
    if (inProgress) return inProgress;

    const task = (async (): Promise<CatalogResult> => {
      try {
        // Do not retry 429: respect provider quota; serve stale cache if available.
        let source: FipeCatalogSource = "upstream";
        let data: FipeCatalogItem[];
        if (resource.kind === "brandModels") {
          try {
            data = await fetchUpstream(path, false);
          } catch (primaryError) {
            // Official alternate path: BrasilAPI returns all models of a FIPE brand,
            // not models verified for a specific year. The client labels this explicitly.
            try {
              data = await fetchBrasilModels(resource.brand);
              source = "brasilapi";
            } catch (secondaryError) {
              console.warn("[FIPE catalog] both model suppliers unavailable:",
                primaryError instanceof FipeCatalogError ? primaryError.code : "PRIMARY_ERROR",
                secondaryError instanceof FipeCatalogError ? secondaryError.code : "SECONDARY_ERROR");
              throw secondaryError;
            }
          }
        } else {
          data = await fetchUpstream(path, resource.kind === "models");
        }
        const timestamp = now();
        cache.delete(path);
        cache.set(path, {
          data, freshUntil: timestamp + CACHE_FRESH_MS,
          staleUntil: timestamp + CACHE_STALE_MS,
        });
        if (cache.size > MAX_CACHE_KEYS) {
          const oldest = cache.keys().next().value;
          if (oldest) cache.delete(oldest);
        }
        return { data, source };
      } catch (error) {
        const old = cache.get(path);
        if (old && now() < old.staleUntil) {
          return { data: old.data, source: "stale" };
        }
        throw error;
      }
    })();
    pending.set(path, task);
    try {
      return await task;
    } finally {
      if (pending.get(path) === task) pending.delete(path);
    }
  }
  return { load };
}

export function registerFipeCatalogRoutes(app: Express): void {
  const service = createFipeCatalogService();

  async function reply(req: Request, res: ExpressResponse, resource: FipeCatalogResource): Promise<void> {
    try {
      const result = await service.load(resource);
      res.setHeader("X-H2-Fipe-Source", result.source);
      res.setHeader("Cache-Control", result.source === "stale"
        ? "public, max-age=60"
        : "public, max-age=300");
      res.status(200).json(result.data);
    } catch (error) {
      const failure = error instanceof FipeCatalogError
        ? error
        : new FipeCatalogError(502, "FIPE_UNAVAILABLE", "Catalogo FIPE indisponivel.");
      res.setHeader("Cache-Control", "no-store");
      console.warn("[FIPE catalog] request failed:", failure.code, failure.message, req.path);
      res.status(failure.status).json({ code: failure.code, error: failure.message });
    }
  }

  app.get("/api/fipe/catalog/brands", (_req, res) => {
    void reply(_req, res, { kind: "brands" });
  });
  app.get("/api/fipe/catalog/brands/:brand/models", (req, res) => {
    res.setHeader("X-H2-Fipe-Scope", "brand-not-year-verified");
    void reply(req, res, { kind: "brandModels", brand: String(req.params.brand) });
  });
  app.get("/api/fipe/catalog/brands/:brand/years", (req, res) => {
    void reply(req, res, { kind: "years", brand: String(req.params.brand) });
  });
  app.get("/api/fipe/catalog/brands/:brand/years/:year/models", (req, res) => {
    void reply(req, res, {
      kind: "models", brand: String(req.params.brand), year: String(req.params.year),
    });
  });
}
