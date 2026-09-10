import { createConnection } from "mysql2/promise";
import { r2HeadObject } from "../server/r2Storage";
import { isRecoveredCustomerName } from "../shared/customerProfile";

type PhotoStatus = "valid" | "broken" | "uncertain";
type PhotoAudit = {
  id: number;
  customerNumber: number | null;
  status: PhotoStatus;
  source: "r2" | "external" | "invalid" | "relative";
  reason: string;
  host?: string;
  legacy?: boolean;
};

const CONCURRENCY = 8;
const EXTERNAL_TIMEOUT_MS = 8000;
const LEGACY_PHOTO_HOSTS = new Set(["d2xsxph8kpxj0f.cloudfront.net"]);

function safeStatus(error: any): number | null {
  const raw = Number(error?.$metadata?.httpStatusCode || error?.status || 0);
  return Number.isFinite(raw) && raw > 0 ? raw : null;
}

function publicR2Key(rawUrl: string): string | null {
  const baseRaw = String(process.env.R2_PUBLIC_URL || "").trim().replace(/\/+$/, "");
  if (!baseRaw) return null;
  try {
    const base = new URL(baseRaw);
    const target = new URL(rawUrl);
    const basePath = base.pathname.replace(/\/+$/, "");
    if (target.origin !== base.origin) return null;
    const prefix = `${basePath}/`.replace(/^\/\//, "/");
    if (!target.pathname.startsWith(prefix)) return null;
    const key = decodeURIComponent(target.pathname.slice(prefix.length)).replace(/^\/+/, "");
    return key || null;
  } catch {
    return null;
  }
}

async function probeR2(id: number, customerNumber: number | null, key: string): Promise<PhotoAudit> {
  try {
    const head = await r2HeadObject(key);
    if (head.httpStatus === 200 && Number(head.contentLength || 0) > 0) {
      return { id, customerNumber, status: "valid", source: "r2", reason: "object_exists" };
    }
    return { id, customerNumber, status: "uncertain", source: "r2", reason: `head_status_${head.httpStatus ?? "unknown"}` };
  } catch (error: any) {
    const status = safeStatus(error);
    const name = String(error?.name || error?.Code || "");
    if (status === 404 || /NoSuchKey|NotFound/i.test(name)) {
      return { id, customerNumber, status: "broken", source: "r2", reason: "object_not_found" };
    }
    return { id, customerNumber, status: "uncertain", source: "r2", reason: `head_error_${status ?? (name || "unknown")}` };
  }
}

async function fetchWithTimeout(url: string, method: "HEAD" | "GET", browserImage = false) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EXTERNAL_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method,
      redirect: "follow",
      signal: controller.signal,
      headers: browserImage ? {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/147 Safari/537.36",
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Referer": "https://h2colombiano.com/",
      } : undefined,
    });
  } finally {
    clearTimeout(timer);
  }
}

function classifySuccessfulExternal(id: number, customerNumber: number | null, response: Response, host: string, legacy: boolean): PhotoAudit {
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (contentType && !contentType.startsWith("image/") && contentType !== "application/octet-stream") {
    return { id, customerNumber, status: "broken", source: "external", reason: `not_image_${contentType.split(";")[0]}`, host, legacy };
  }
  return { id, customerNumber, status: "valid", source: "external", reason: `http_${response.status}`, host, legacy };
}

async function probeExternal(id: number, customerNumber: number | null, rawUrl: string): Promise<PhotoAudit> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    if (rawUrl.startsWith("/")) {
      return { id, customerNumber, status: "uncertain", source: "relative", reason: "relative_url" };
    }
    return { id, customerNumber, status: "broken", source: "invalid", reason: "malformed_url" };
  }

  const host = parsed.hostname.toLowerCase();
  const legacy = LEGACY_PHOTO_HOSTS.has(host);

  if (!/^https?:$/.test(parsed.protocol)) {
    return { id, customerNumber, status: "broken", source: "invalid", reason: "unsupported_protocol", host, legacy };
  }

  try {
    let response = await fetchWithTimeout(rawUrl, "HEAD");
    let status = response.status;
    response.body?.cancel().catch(() => {});

    if (status === 403 || status === 405 || status === 501) {
      response = await fetchWithTimeout(rawUrl, "GET", true);
      status = response.status;
    }

    if (status === 404 || status === 410) {
      response.body?.cancel().catch(() => {});
      return { id, customerNumber, status: "broken", source: "external", reason: `http_${status}`, host, legacy };
    }

    if (status >= 200 && status < 300) {
      const result = classifySuccessfulExternal(id, customerNumber, response, host, legacy);
      response.body?.cancel().catch(() => {});
      return result;
    }

    response.body?.cancel().catch(() => {});
    if (status >= 300 && status < 400) {
      return { id, customerNumber, status: "uncertain", source: "external", reason: `redirect_${status}`, host, legacy };
    }
    return { id, customerNumber, status: "uncertain", source: "external", reason: `browser_get_http_${status}`, host, legacy };
  } catch (error: any) {
    const name = String(error?.name || "network_error");
    return { id, customerNumber, status: "uncertain", source: "external", reason: name === "AbortError" ? "timeout" : "network_error", host, legacy };
  }
}

async function auditPhoto(row: any): Promise<PhotoAudit> {
  const id = Number(row.id);
  const customerNumber = row.customerNumber == null ? null : Number(row.customerNumber);
  const rawUrl = String(row.profilePhotoUrl || "").trim();
  const key = publicR2Key(rawUrl);
  if (key) return probeR2(id, customerNumber, key);
  return probeExternal(id, customerNumber, rawUrl);
}

function logChunks(label: string, rows: unknown[], size = 20) {
  for (let i = 0; i < rows.length; i += size) {
    console.log(`[PROFILE-AUDIT] ${label} ${JSON.stringify(rows.slice(i, i + size))}`);
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("[PROFILE-AUDIT] SKIP DATABASE_URL ausente");
    return;
  }

  const db = await createConnection(process.env.DATABASE_URL);
  try {
    const [rawRows]: any = await db.query(`
      SELECT id, customerNumber, name, profilePhotoUrl
      FROM customers
      WHERE deletedAt IS NULL
      ORDER BY id
    `);
    const customers = Array.isArray(rawRows) ? rawRows : [];
    const withPhoto = customers.filter((row: any) => String(row.profilePhotoUrl || "").trim());
    const recovered = customers
      .filter((row: any) => isRecoveredCustomerName(row.name))
      .map((row: any) => ({ id: Number(row.id), customerNumber: row.customerNumber == null ? null : Number(row.customerNumber) }));

    const results: PhotoAudit[] = [];
    for (let start = 0; start < withPhoto.length; start += CONCURRENCY) {
      const batch = withPhoto.slice(start, start + CONCURRENCY);
      results.push(...await Promise.all(batch.map(auditPhoto)));
    }

    const valid = results.filter((item) => item.status === "valid");
    const broken = results.filter((item) => item.status === "broken");
    const uncertain = results.filter((item) => item.status === "uncertain");
    const blankPhoto = customers.length - withPhoto.length;
    const hostCounts = results
      .filter((item) => item.host)
      .reduce<Record<string, number>>((acc, item) => {
        const host = item.host!;
        acc[host] = (acc[host] || 0) + 1;
        return acc;
      }, {});

    console.log(`[PROFILE-AUDIT] SUMMARY ${JSON.stringify({
      customers: customers.length,
      withPhoto: withPhoto.length,
      blankPhoto,
      valid: valid.length,
      broken: broken.length,
      uncertain: uncertain.length,
      recoveredNames: recovered.length,
      hostCounts,
    })}`);

    logChunks("BROKEN", broken);
    logChunks("UNCERTAIN", uncertain);
    logChunks("RECOVERED_NAMES", recovered);
    console.log("[PROFILE-AUDIT] COMPLETE read_only=true");
  } finally {
    await db.end();
  }
}

await main();
