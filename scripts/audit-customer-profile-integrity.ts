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
};

const CONCURRENCY = 8;
const EXTERNAL_TIMEOUT_MS = 6000;

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
    return { id, customerNumber, status: "uncertain", source: "r2", reason: `head_error_${status ?? name || "unknown"}` };
  }
}

async function fetchWithTimeout(url: string, method: "HEAD" | "GET") {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EXTERNAL_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method,
      redirect: "follow",
      signal: controller.signal,
      ...(method === "GET" ? { headers: { Range: "bytes=0-0" } } : {}),
    });
  } finally {
    clearTimeout(timer);
  }
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

  if (!/^https?:$/.test(parsed.protocol)) {
    return { id, customerNumber, status: "broken", source: "invalid", reason: "unsupported_protocol" };
  }

  try {
    let response = await fetchWithTimeout(rawUrl, "HEAD");
    if (response.status === 405 || response.status === 501 || (response.ok && !response.headers.get("content-type"))) {
      response.body?.cancel().catch(() => {});
      response = await fetchWithTimeout(rawUrl, "GET");
    }
    const status = response.status;
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    response.body?.cancel().catch(() => {});

    if (status === 404 || status === 410) {
      return { id, customerNumber, status: "broken", source: "external", reason: `http_${status}` };
    }
    if (status >= 200 && status < 300) {
      if (contentType && !contentType.startsWith("image/") && contentType !== "application/octet-stream") {
        return { id, customerNumber, status: "broken", source: "external", reason: `not_image_${contentType.split(";")[0]}` };
      }
      return { id, customerNumber, status: "valid", source: "external", reason: `http_${status}` };
    }
    if (status >= 300 && status < 400) {
      return { id, customerNumber, status: "uncertain", source: "external", reason: `redirect_${status}` };
    }
    return { id, customerNumber, status: "uncertain", source: "external", reason: `http_${status}` };
  } catch (error: any) {
    const name = String(error?.name || "network_error");
    return { id, customerNumber, status: "uncertain", source: "external", reason: name === "AbortError" ? "timeout" : "network_error" };
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

    console.log(`[PROFILE-AUDIT] SUMMARY ${JSON.stringify({
      customers: customers.length,
      withPhoto: withPhoto.length,
      blankPhoto,
      valid: valid.length,
      broken: broken.length,
      uncertain: uncertain.length,
      recoveredNames: recovered.length,
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
