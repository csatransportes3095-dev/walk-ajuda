import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { Customer } from "../drizzle/schema";
import { normalizeProfilePhotoPhone, profilePhotoKeyTimestamp, profilePhotoPrefixes } from "../shared/profilePhotoIdentity";
import { getDb } from "./db";
import { storagePut } from "./storage";
import { buildR2PublicUrl, r2GetObjectBuffer, r2HeadObject, r2ListObjectsPage } from "./r2Storage";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Não foi possível confirmar o cadastro. Tente novamente." });
  return db;
}
function resultRows<T>(result: unknown): T[] { return ((result as [T[]])[0] || []) as T[]; }

/** Resolve before upload: never update a deleted row or guess between active duplicates. */
export async function resolveProfilePhotoCustomer(rawPhone: string, requireExisting = false) {
  const phone = normalizeProfilePhotoPhone(rawPhone);
  if (!phone) throw new TRPCError({ code: "BAD_REQUEST", message: "Telefone inválido para vincular a foto." });
  const db = await requireDb();
  const candidates = resultRows<Customer>(await db.execute(sql`
    SELECT * FROM customers
    WHERE deletedAt IS NULL
      AND REGEXP_REPLACE(phone, '[^0-9]', '') IN (${phone}, ${`55${phone}`})
    ORDER BY id ASC LIMIT 2
  `));
  if (candidates.length > 1) throw new TRPCError({ code: "CONFLICT", message: "Há mais de um cadastro ativo com esse telefone. A foto não foi alterada; revise os cadastros." });
  const customer = candidates[0] || null;
  if (!customer && requireExisting) throw new TRPCError({ code: "NOT_FOUND", message: "Cadastro ativo não encontrado. A foto não foi alterada." });
  return { phone, customer };
}

/** Only the photo and its update timestamp change. Prevent concurrent uploads from reverting it. */
export async function persistCustomerProfilePhoto(customer: Pick<Customer, "id" | "phone" | "profilePhotoUrl">, url: string) {
  const db = await requireDb();
  const phone = normalizeProfilePhotoPhone(customer.phone);
  if (!phone) throw new TRPCError({ code: "BAD_REQUEST", message: "Telefone inválido para vincular a foto." });
  return db.transaction(async tx => {
    const result = await tx.execute(sql`
      UPDATE customers SET profilePhotoUrl=${url}, updatedAt=NOW()
      WHERE id=${customer.id} AND deletedAt IS NULL
        AND REGEXP_REPLACE(phone, '[^0-9]', '') IN (${phone}, ${`55${phone}`})
        AND profilePhotoUrl <=> ${customer.profilePhotoUrl ?? null}
    `);
    if (Number((result as unknown as [{ affectedRows: number }])[0]?.affectedRows) !== 1) {
      throw new TRPCError({ code: "CONFLICT", message: "O cadastro ou a foto mudou durante o envio. Atualize a tela antes de tentar novamente." });
    }
    const saved = resultRows<Pick<Customer, "id" | "profilePhotoUrl">>(await tx.execute(sql`
      SELECT id, profilePhotoUrl FROM customers WHERE id=${customer.id} AND deletedAt IS NULL LIMIT 1
    `))[0];
    if (!saved || saved.profilePhotoUrl !== url) throw new TRPCError({ code: "CONFLICT", message: "Não foi possível confirmar o salvamento da foto." });
    return { customerId: Number(saved.id), saved: true as const };
  });
}

async function activeCustomerById(customerId: number) {
  const db = await requireDb();
  const customer = resultRows<Customer>(await db.execute(sql`
    SELECT * FROM customers WHERE id=${customerId} AND deletedAt IS NULL LIMIT 1
  `))[0];
  if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Cadastro ativo não encontrado." });
  const resolved = await resolveProfilePhotoCustomer(customer.phone, true);
  if (resolved.customer?.id !== customer.id) throw new TRPCError({ code: "CONFLICT", message: "Não foi possível confirmar a vinculação da foto." });
  return customer;
}

/** Admin-only callers. Listing is read-only and scoped to this customer's exact phone aliases. */
export async function listRecoverableProfilePhotos(customerId: number) {
  const customer = await activeCustomerById(customerId);
  const found = new Map<string, { key: string; url: string; uploadedAt: number }>();
  let truncated = false;
  for (const prefix of profilePhotoPrefixes(customer.phone)) {
    let token: string | undefined;
    const seenTokens = new Set<string>();
    for (let page = 0; page < 4; page++) {
      const result = await r2ListObjectsPage(prefix, token);
      for (const object of result.objects) {
        const uploadedAt = profilePhotoKeyTimestamp(object.key, customer.phone);
        if (uploadedAt === null || object.size <= 0 || object.size > MAX_PHOTO_BYTES) continue;
        found.set(object.key, { key: object.key, url: buildR2PublicUrl(object.key), uploadedAt });
      }
      const next = result.nextContinuationToken;
      if (!next) break;
      if (page === 3 || seenTokens.has(next)) { truncated = true; break; }
      seenTokens.add(next); token = next;
    }
  }
  return {
    expectedPhotoUrl: customer.profilePhotoUrl ?? null,
    candidates: [...found.values()].sort((a, b) => b.uploadedAt - a.uploadedAt).slice(0, 12),
    truncated,
  };
}

/** An administrator must preview and explicitly select a photo; never pick a person by filename. */
export async function restoreCustomerProfilePhoto(input: { customerId: number; key: string; expectedPhotoUrl: string | null }) {
  const customer = await activeCustomerById(input.customerId);
  if ((customer.profilePhotoUrl ?? null) !== input.expectedPhotoUrl) throw new TRPCError({ code: "CONFLICT", message: "A foto atual mudou. Feche a recuperação e confira novamente." });
  if (profilePhotoKeyTimestamp(input.key, customer.phone) === null) throw new TRPCError({ code: "BAD_REQUEST", message: "Arquivo fora do escopo deste cadastro." });
  let buffer: Buffer;
  let ext: string;
  let mime: string;
  try {
    const head = await r2HeadObject(input.key);
    if (!head.contentLength || head.contentLength > MAX_PHOTO_BYTES) throw new Error("invalid_size");
    buffer = await r2GetObjectBuffer(input.key);
    if (buffer.length !== head.contentLength || buffer.length > MAX_PHOTO_BYTES) throw new Error("invalid_size");
    const image = sharp(buffer, { limitInputPixels: 40_000_000, failOn: "error" });
    const meta = await image.metadata();
    if (!meta.width || !meta.height || !["jpeg", "png", "webp"].includes(meta.format || "")) throw new Error("invalid_format");
    await image.stats(); // Decode, do not merely trust the extension or MIME declaration.
    ext = meta.format === "jpeg" ? "jpg" : meta.format!;
    mime = `image/${meta.format}`;
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: "A foto selecionada não está disponível ou não é uma imagem válida. Nenhuma foto foi substituída." });
  }
  // Fresh owned URL avoids stale CDN error caches; keep the original file untouched.
  const key = `profile-photos/${normalizeProfilePhotoPhone(customer.phone)}-${Date.now()}-${randomUUID()}.${ext}`;
  const { url } = await storagePut(key, buffer, mime);
  const saved = await persistCustomerProfilePhoto(customer, url);
  return { success: true as const, url, ...saved };
}
