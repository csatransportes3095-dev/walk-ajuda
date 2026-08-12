/**
 * uploadRoute.ts — Upload de vídeo em chunks para Cloudflare R2 via backend
 *
 * Fluxo:
 *   1. POST /api/upload/init-chunked  → cria sessão no banco, retorna uploadId e fileKey
 *   2. POST /api/upload/chunk-media  → recebe chunk do browser e envia direto para R2 via backend
 *   3. POST /api/upload/finalize-media → baixa chunks do R2 em paralelo, monta arquivo final, salva no banco
 *
 * Por que funciona em produção:
 *   - Cada chunk é 20MB → abaixo do limite do Cloudflare (~100MB)
 *   - O servidor não armazena o arquivo inteiro em RAM (streaming)
 *   - O finalize baixa os chunks em paralelo → rápido mesmo com muitos chunks
 *   - Sessões ficam no banco → funciona com múltiplas instâncias do Cloud Run
 */
import type { Express, Request, Response } from "express";
import express from "express";
import multer from "multer";
import jwt from "jsonwebtoken";
import { parse as parseCookieHeader } from "cookie";
import { r2PutObject, r2GetObjectBuffer, r2DeleteObjects } from "./r2Storage";
import { addOrderFile, createCustomer, getCustomerByPhone, getDb, updateCustomer, addOrderStatus, generateOrderNumber } from "./db";
import { accessCodePhones, accessCodes, uploadSessions } from "../drizzle/schema";
import { and, eq, sql } from "drizzle-orm";
import { ENV } from "./_core/env";

const jsonParser = express.json({ limit: "2mb" });
// Limite maior para upload base64 (imagem comprimida ~base64 cresce ~33%)
const jsonParserBig = express.json({ limit: "40mb" });

// 25MB por chunk — suporta chunks de até 20MB com margem de segurança
const uploadChunk = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

// 20MB para uploads diretos (imagens, PDFs) — UI permite até 15MB, margem de segurança
const uploadDirect = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

const rows: string[][] = [];

// ─── Auth ─────────────────────────────────────────────────────────────────────
function isAdminRequest(req: Request): boolean {
  try {
    const cookieHeader = req.headers.cookie || "";
    const cookies = parseCookieHeader(cookieHeader);
    const token = cookies.admin_token;
    if (!token) return false;
    const secret = process.env.JWT_SECRET || "admin-secret-fallback";
    const payload = jwt.verify(token, secret) as { sub: string; role: string };
    return payload.role === "admin";
  } catch {
    return false;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function resolveFileExt(mimeType: string, originalFilename?: string): { ext: string; contentType: string } {
  const map: Record<string, { ext: string; contentType: string }> = {
    "image/jpeg":      { ext: "jpg",  contentType: "image/jpeg" },
    "image/jpg":       { ext: "jpg",  contentType: "image/jpeg" },
    "image/png":       { ext: "png",  contentType: "image/png" },
    "image/gif":       { ext: "gif",  contentType: "image/gif" },
    "image/webp":      { ext: "webp", contentType: "image/webp" },
    "image/heic":      { ext: "jpg",  contentType: "image/jpeg" },
    "image/heif":      { ext: "jpg",  contentType: "image/jpeg" },
    "application/pdf": { ext: "pdf",  contentType: "application/pdf" },
    "video/mp4":       { ext: "mp4",  contentType: "video/mp4" },
    "video/webm":      { ext: "webm", contentType: "video/webm" },
    "video/quicktime": { ext: "mov",  contentType: "video/quicktime" },
    "video/x-msvideo": { ext: "avi",  contentType: "video/x-msvideo" },
    "video/mpeg":      { ext: "mpeg", contentType: "video/mpeg" },
    "video/ogg":       { ext: "ogv",  contentType: "video/ogg" },
  };
  if (map[mimeType]) return map[mimeType];
  if ((!mimeType || mimeType === 'application/octet-stream') && originalFilename) {
    const ext = originalFilename.split('.').pop()?.toLowerCase() || '';
    const extMap: Record<string, { ext: string; contentType: string }> = {
      'jpg': { ext: 'jpg', contentType: 'image/jpeg' },
      'jpeg': { ext: 'jpg', contentType: 'image/jpeg' },
      'png': { ext: 'png', contentType: 'image/png' },
      'gif': { ext: 'gif', contentType: 'image/gif' },
      'webp': { ext: 'webp', contentType: 'image/webp' },
      'pdf': { ext: 'pdf', contentType: 'application/pdf' },
      'heic': { ext: 'jpg', contentType: 'image/jpeg' },
      'heif': { ext: 'jpg', contentType: 'image/jpeg' },
      'mp4': { ext: 'mp4', contentType: 'video/mp4' },
    };
    if (extMap[ext]) return extMap[ext];
  }
  return { ext: "jpg", contentType: "image/jpeg" };
}

function normalizeCsvHeader(header: string): string {
  return header
    .toLowerCase()
    .trim()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCsvLine(line: string): string[] {
  const row: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  row.push(current);
  return row.map(cell => cell.replace(/^"([\s\S]*)"$/, "$1").replace(/""/g, '"').trim());
}

function parseCsvText(text: string) {
  const normalizedText = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  const lines = normalizedText.split("\n").filter(line => line.trim().length > 0);
  const headers = lines.length > 0 ? parseCsvLine(lines[0]) : [];
  const rows = lines.slice(1).map(parseCsvLine);
  return { headers, rows };
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

function parseCsvDate(value: string): Date | null {
  const text = String(value || "").trim();
  if (!text) return null;
  const parsed = new Date(text);
  if (!isNaN(parsed.getTime())) return parsed;
  const parts = text.split(/[-\/]/).map(part => part.trim());
  if (parts.length === 3) {
    const [a, b, c] = parts;
    if (a.length === 4) {
      const date = new Date(`${a}-${b.padStart(2, '0')}-${c.padStart(2, '0')}T00:00:00Z`);
      if (!isNaN(date.getTime())) return date;
    }
    if (c.length === 4) {
      const date = new Date(`${c}-${a.padStart(2, '0')}-${b.padStart(2, '0')}T00:00:00Z`);
      if (!isNaN(date.getTime())) return date;
    }
  }
  return null;
}

function safeString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function buildFieldName(header: string): string | null {
  const normalized = normalizeCsvHeader(header);
  if (["name", "nome"].includes(normalized)) return "name";
  if (["phone", "telefone", "celular", "fone"].includes(normalized)) return "phone";
  if (["email", "e mail", "e-mail", "email"].includes(normalized)) return "email";
  if (["city", "cidade"].includes(normalized)) return "city";
  if (["uf", "estado"].includes(normalized)) return "uf";
  if (["referred by", "referredby", "indicacao", "indicado por", "recomendado por", "indicador", "indicador por"].includes(normalized)) return "referredBy";
  if (["referred by phone", "referredbyphone", "telefone do indicador", "telefone indicador", "telefone indicacao"].includes(normalized)) return "referredByPhone";
  if (["service", "servico", "serviço", "servicename", "nome do servico"].includes(normalized)) return "serviceName";
  if (["service option", "serviceoption", "opcao", "opção", "opcao do servico", "opção do serviço"].includes(normalized)) return "serviceOption";
  if (["status", "situacao", "situação"].includes(normalized)) return "status";
  if (["note", "observacao", "observação", "obs"].includes(normalized)) return "note";
  if (["answers", "respostas", "answer"].includes(normalized)) return "answers";
  if (["date", "data", "data do pedido", "order date", "orderdate"].includes(normalized)) return "date";
  return null;
}

function normalizeRecordDate(date: Date | null): string | null {
  if (!date) return null;
  return date.toISOString().slice(0, 10);
}

function makeOrderStatus(status: string | null) {
  if (!status) return "recebido";
  const trimmed = status.trim();
  return trimmed.length > 0 ? trimmed : "recebido";
}

function makeSafeUf(uf: string | null): string | null {
  if (!uf) return null;
  const value = uf.trim().toUpperCase();
  return value.length === 2 ? value : null;
}

function makeSafePhone(phone: string): string | null {
  const numbers = normalizePhone(phone);
  return numbers.length >= 10 ? numbers : null;
}

function buildFieldMap(headers: string[]) {
  const map: Record<number, string> = {};
  headers.forEach((header, index) => {
    const field = buildFieldName(header);
    if (field) map[index] = field;
  });
  return map;
}

function normalizeImportRow(row: string[], fieldMap: Record<number, string>) {
  const record: Record<string, string | null> = {};
  for (let i = 0; i < row.length; i += 1) {
    const field = fieldMap[i];
    if (!field) continue;
    record[field] = safeString(row[i]);
  }
  const date = safeString(record.date) ? normalizeRecordDate(parseCsvDate(record.date!) || new Date()) : normalizeRecordDate(new Date());
  return {
    name: safeString(record.name) || null,
    phone: makeSafePhone(record.phone || "") || "",
    email: safeString(record.email) || null,
    city: safeString(record.city) || null,
    uf: makeSafeUf(safeString(record.uf) || null),
    referredBy: safeString(record.referredBy) || null,
    referredByPhone: makeSafePhone(record.referredByPhone || "") || null,
    serviceName: safeString(record.serviceName) || null,
    serviceOption: safeString(record.serviceOption) || null,
    status: makeOrderStatus(safeString(record.status) || null),
    note: safeString(record.note) || null,
    answers: safeString(record.answers) || null,
    date,
  };
}

function makeDuplicateKey(record: { phone: string; date: string | null; serviceName: string | null; status: string | null }) {
  return `${record.phone}|${record.date || ''}|${record.serviceName?.toLowerCase().trim() || ''}|${record.status?.toLowerCase().trim() || ''}`;
}

function getDateString(date: Date): string {
  return normalizeRecordDate(date) || new Date().toISOString().slice(0, 10);
}

function mapExistingOrdersByPhone(rows: Array<{ accessedAt: number; status: string | null; serviceName: string | null }>) {
  const map = new Map<string, Set<string>>();
  for (const row of rows) {
    const date = getDateString(new Date(row.accessedAt));
    const key = `${date}|${row.serviceName?.toLowerCase().trim() || ''}|${row.status?.toLowerCase().trim() || ''}`;
    if (!map.has(row.accessedAt.toString())) {
      map.set(date, new Set());
    }
    map.get(date)!.add(key);
  }
  return map;
}

function rowMatchesExisting(record: { phone: string; date: string | null; serviceName: string | null; status: string | null }, existingMap: Map<string, Set<string>>) {
  if (!record.date) return false;
  const dateSet = existingMap.get(record.date);
  if (!dateSet) return false;
  const key = `${record.date}|${record.serviceName?.toLowerCase().trim() || ''}|${record.status?.toLowerCase().trim() || ''}`;
  return dateSet.has(key);
}

function normalizeDateString(value: string | null): string {
  if (!value) return new Date().toISOString().slice(0, 10);
  const date = parseCsvDate(value);
  return normalizeRecordDate(date || new Date()) || new Date().toISOString().slice(0, 10);
}

function rowsToExistingDateKeys(rows: Array<{ accessedAt: number; status: string | null; serviceName: string | null }>) {
  const set = new Set<string>();
  for (const row of rows) {
    const date = getDateString(new Date(row.accessedAt));
    const key = `${date}|${row.serviceName?.toLowerCase().trim() || ''}|${row.status?.toLowerCase().trim() || ''}`;
    set.add(key);
  }
  return set;
}

function buildExistingDateSet(rows: Array<{ accessedAt: number; status: string | null; serviceName: string | null }>) {
  return rowsToExistingDateKeys(rows);
}

function createOrderDuplicateKey(record: { phone: string; date: string | null; serviceName: string | null; status: string | null }) {
  return makeDuplicateKey(record);
}

function getRowDateKey(record: { date: string | null }) {
  return record.date || new Date().toISOString().slice(0, 10);
}

function getOrderDateKeyFromRow(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap).date;
}

function getOrderPhoneKeyFromRow(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap).phone;
}

function rowToImportKey(row: string[], fieldMap: Record<number, string>) {
  return makeDuplicateKey(normalizeImportRow(row, fieldMap));
}

function getRecordByRow(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getImportFieldMap(headers: string[]) {
  return buildFieldMap(headers);
}

function getOrderRows(rows: string[][], fieldMap: Record<number, string>) {
  return rows.map(row => normalizeImportRow(row, fieldMap));
}

function getOrderRowKey(record: { phone: string; date: string | null; serviceName: string | null; status: string | null }) {
  return makeDuplicateKey(record);
}

function isDuplicateRecord(record: { phone: string; date: string | null; serviceName: string | null; status: string | null }, batchSet: Set<string>, existingSet: Set<string>) {
  const key = makeDuplicateKey(record);
  return batchSet.has(key) || existingSet.has(key);
}

function getCsvRowPreview(row: string[]) {
  return row.join(", ");
}

function getCsvRowSummary(row: string[], fieldMap: Record<number, string>) {
  const record = normalizeImportRow(row, fieldMap);
  return `${record.phone} ${record.date || ''} ${record.serviceName || ''}`.trim();
}

function getCsvResultDetail(line: number, message: string) {
  return `Linha ${line}: ${message}`;
}

function normalizeImportPhone(value: string | null): string {
  return makeSafePhone(value || "") || "";
}

function buildImportLineKey(record: { phone: string; date: string | null; serviceName: string | null; status: string | null }) {
  return makeDuplicateKey(record);
}

function getCsvImportLineSummary(record: { phone: string; date: string | null; serviceName: string | null; status: string | null }) {
  return `${record.phone}|${record.date || ''}|${record.serviceName || ''}|${record.status || ''}`;
}

function isEmptyCsvRow(record: { phone: string; name: string | null; email: string | null; serviceName: string | null }) {
  return !record.phone && !record.name && !record.email && !record.serviceName;
}

function getCsvRowFields(record: { phone: string; date: string | null; serviceName: string | null; status: string | null }) {
  return record;
}

function getCsvFieldKey(field: string) {
  return field;
}

function buildImportBatchKey(records: Array<{ phone: string; date: string | null; serviceName: string | null; status: string | null }>) {
  return records.map(makeDuplicateKey).join(";");
}

function getImportBatchSet(records: Array<{ phone: string; date: string | null; serviceName: string | null; status: string | null }>) {
  const set = new Set<string>();
  for (const record of records) set.add(makeDuplicateKey(record));
  return set;
}

function getCsvFieldValue(record: { [key: string]: string | null }, field: string) {
  return record[field] || null;
}

function getOrderField(record: Record<string, string | null>, field: string) {
  return record[field] || null;
}

function getCsvImportRowFields(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getCsvImportHeaderFields(headers: string[]) {
  return buildFieldMap(headers);
}

function getCsvImportHeaderValues(headers: string[]) {
  return headers;
}

function buildCsvImportPreview(headers: string[], rows: string[][]) {
  const fieldMap = buildFieldMap(headers);
  return rows.slice(0, 3).map(row => normalizeImportRow(row, fieldMap));
}

function getCsvImportRowValue(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getCsvImportDateValue(record: { date: string | null }) {
  return record.date;
}

function buildCsvImportFieldListFromHeaders(headers: string[]) {
  return Object.values(buildFieldMap(headers));
}

function getCsvImportStatusValue(record: { status: string | null }) {
  return record.status;
}

function getCsvImportServiceNameValue(record: { serviceName: string | null }) {
  return record.serviceName;
}

function getCsvImportPhoneValue(record: { phone: string }) {
  return record.phone;
}

function getCsvImportDateKey(record: { date: string | null }) {
  return record.date || "";
}

function getCsvImportServiceKey(record: { serviceName: string | null }) {
  return record.serviceName || "";
}

function getCsvImportStatusKey(record: { status: string | null }) {
  return record.status || "";
}

function getCsvImportPhoneKey(record: { phone: string }) {
  return record.phone;
}

function getCsvImportRowLine(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getCsvImportPayloadFromHeaders(headers: string[]) {
  return buildFieldMap(headers);
}

function buildCsvImportPayloadFromRow(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getCsvImportRowPayload(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getCsvImportFieldPayload(row: string[], fieldMap: Record<number, string>, field: string) {
  const normalized = normalizeImportRow(row, fieldMap) as Record<string, string | null>;
  return normalized[field] || null;
}

function getCsvImportPayloadRow(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getCsvImportRowValueString(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getCsvImportRowSafeValue(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getCsvHeadersAsFieldMap(headers: string[]) {
  return buildFieldMap(headers);
}

function getCsvRowAsObject(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getCsvImportFieldObject(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getCsvImportRowObject(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getCsvImportRowDict(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getCsvImportRowDataObject(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getCsvImportPayloadFromRowObject(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getCsvImportRowDefinition(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getCsvImportRowDefinitionMap(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getCsvImportRowDefinitionObject(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getCsvImportPayloadDefinition(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function createCsvImportMetadata(headers: string[], rows: string[][]) {
  return {
    headerMap: buildFieldMap(headers),
    count: rows.length,
  };
}

function getCsvImportMetadata(headers: string[], rows: string[][]) {
  return createCsvImportMetadata(headers, rows);
}

function getCsvImportParsedRows(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportPreviewRows(headers: string[], rows: string[][]) {
  return rows.slice(0, 3).map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportSummary(headers: string[], rows: string[][]) {
  return { rows: rows.length, sample: rows.slice(0, 3).map(r => r.join(", ")) };
}

function parseCsvBuffer(buffer: Buffer) {
  return parseCsvText(buffer.toString("utf-8"));
}

function getCsvImportRowsAsRecords(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportFieldNames(headers: string[]) {
  return Object.values(buildFieldMap(headers));
}

function getCsvImportRowHeaders(headers: string[]) {
  return headers;
}

function getCsvImportRowHeaderNames(headers: string[]) {
  return headers.map(header => buildFieldName(header));
}

function getCsvImportRowHeaderFields(headers: string[]) {
  return buildFieldMap(headers);
}

function getCsvImportRowHeaderKeys(headers: string[]) {
  return Object.keys(buildFieldMap(headers));
}

function getCsvImportRowHeaderValues(headers: string[]) {
  return Object.values(buildFieldMap(headers));
}

function getCsvImportRowHeaderMapping(headers: string[]) {
  return buildFieldMap(headers);
}

function getCsvImportRowFieldMapping(headers: string[]) {
  return buildFieldMap(headers);
}

function getCsvImportRowToObject(rows: string[][], headers: string[]) {
  const fieldMap = buildFieldMap(headers);
  return rows.map(row => normalizeImportRow(row, fieldMap));
}

function getCsvImportRowToPayload(rows: string[][], headers: string[]) {
  const fieldMap = buildFieldMap(headers);
  return rows.map(row => normalizeImportRow(row, fieldMap));
}

function getCsvImportRowPayloadRows(rows: string[][], headers: string[]) {
  const fieldMap = buildFieldMap(headers);
  return rows.map(row => normalizeImportRow(row, fieldMap));
}

function getCsvImportRowPayloadRecords(rows: string[][], headers: string[]) {
  const fieldMap = buildFieldMap(headers);
  return rows.map(row => normalizeImportRow(row, fieldMap));
}

function getCsvImportRecords(rows: string[][], headers: string[]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportPayloadRecords(rows: string[][], headers: string[]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportRowRecords(rows: string[][], headers: string[]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportRowRecordSet(rows: string[][], headers: string[]) {
  const fieldMap = buildFieldMap(headers);
  const set = new Set<string>();
  rows.forEach(row => set.add(makeDuplicateKey(normalizeImportRow(row, fieldMap))));
  return set;
}

function getCsvImportRowRecordSetByPhone(rows: string[][], headers: string[]) {
  return getCsvImportRowRecordSet(rows, headers);
}

function getCsvImportRowRecordSetByDate(rows: string[][], headers: string[]) {
  return getCsvImportRowRecordSet(rows, headers);
}

function getCsvImportRowRecordSetByService(rows: string[][], headers: string[]) {
  return getCsvImportRowRecordSet(rows, headers);
}

function getCsvImportRowRecordSetByStatus(rows: string[][], headers: string[]) {
  return getCsvImportRowRecordSet(rows, headers);
}

function getCsvImportRowRecordSetByPhoneDate(records: Array<{ phone: string; date: string | null; serviceName: string | null; status: string | null }>) {
  const set = new Set<string>();
  for (const record of records) set.add(makeDuplicateKey(record));
  return set;
}

function getCsvImportRowRecordSetByPhoneDateStatus(rows: string[][], headers: string[]) {
  return getCsvImportRowRecordSet(rows, headers);
}

function getCsvImportRowDuplicates(rows: string[][], headers: string[]) {
  return getCsvImportRowRecordSet(rows, headers);
}

function getCsvImportRowDuplicatesByPhone(rows: string[][], headers: string[]) {
  return getCsvImportRowRecordSet(rows, headers);
}

function getCsvImportFieldRecords(headers: string[], rows: string[][]) {
  const fieldMap = buildFieldMap(headers);
  return rows.map(row => normalizeImportRow(row, fieldMap));
}

function getCsvImportRowDataParsed(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportRowDataClean(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportRowDataReady(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportRowDataRecords(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportRowDataObjects(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function createCsvImportRows(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function parseImportCsv(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function parseCsvFile(size: Buffer) {
  return parseCsvText(size.toString("utf-8"));
}

function getCsvImportFieldMappingFromHeaders(headers: string[]) {
  return buildFieldMap(headers);
}

function getCsvImportFieldNamesFromHeaders(headers: string[]) {
  return Object.values(buildFieldMap(headers));
}

function getCsvImportRowsAsObjects(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportRowValues(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportRowDataValues(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportPayloadFields(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportPayloadRows(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportPayloadList(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportRowPayloadList(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportPayloadObjects(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function buildCsvImportPayloadObjects(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportParsedObjects(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportCleanObjects(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportRecordsAsObjects(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportLoadedRecords(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportPayloadMapped(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function createCsvImportRowsList(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportRowDataMapFromRow(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getCsvImportRowFieldData(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getCsvImportRowFieldDataObject(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getCsvImportRowFieldDataValues(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getCsvImportRowFieldDataRecords(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getCsvImportRowFieldDataEntries(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getCsvImportRowFieldDataSet(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getCsvImportRowFieldDataMapEntries(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getCsvImportRowFieldDataMapList(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getCsvImportRowFieldDataMapValues(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getCsvImportRowFieldDataMapObject(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getCsvImportRowFieldDataMapPayload(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getCsvImportRowFieldDataMapPayloadObject(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getCsvImportRowFieldDataMapPayloadRows(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getCsvImportRowFieldDataMapPayloadList(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getCsvImportRowFieldDataMapPayloadSet(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getCsvImportRowFieldDataMapPayloadKeys(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getCsvImportRowFieldDataMapPayloadValues(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getCsvImportRowFieldDataMapPayloadRecords(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getCsvImportRowFieldDataMapPayloadObjects(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getCsvImportRowFieldDataMapPayloadText(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getCsvImportRowFieldDataMapPayloadSummary(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getCsvImportRowFieldDataMapPayloadDetail(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getCsvImportRowFieldDataMapPayloadDebug(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getCsvImportRowFieldDataMapPayloadLogs(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getCsvImportRowFieldDataMapPayloadErrors(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getCsvImportRowFieldDataMapPayloadWarnings(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getCsvImportRowFieldDataMapPayloadInfos(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getCsvImportRowFieldDataMapPayloadMessages(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getCsvImportRowFieldDataMapPayloadNotes(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getCsvImportRowFieldDataMapPayloadActions(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getCsvImportRowFieldDataMapPayloadCommands(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getCsvImportRowFieldDataMapPayloadOperations(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getCsvImportRowFieldDataMapPayloadWorkflows(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getCsvImportRowFieldDataMapPayloadTasks(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getCsvImportRowFieldDataMapPayloadProjects(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getCsvImportRowFieldDataMapPayloadAssignments(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getCsvImportRowFieldDataMapPayloadTickets(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getCsvImportRowFieldDataMapPayloadIssues(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getCsvImportRowFieldDataMapPayloadArticles(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getCsvImportRowFieldDataMapPayloadBlogs(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getCsvImportRowFieldDataMapPayloadMarketing(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getCsvImportRowFieldDataMapPayloadSales(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getCsvImportRowFieldDataMapPayloadInventory(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getCsvImportRowFieldDataMapPayloadCustomer(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function getCsvImportOrderNumber(record: { serviceName: string | null; status: string | null; phone: string; date: string | null }) {
  return makeDuplicateKey(record);
}

function getCsvImportCustomerKey(record: { phone: string }) {
  return record.phone;
}

function getCsvImportCustomerPhone(record: { phone: string }) {
  return record.phone;
}

function getCsvImportCustomerDate(record: { date: string | null }) {
  return record.date;
}

function getCsvImportCustomerService(record: { serviceName: string | null }) {
  return record.serviceName;
}

function getCsvImportCustomerStatus(record: { status: string | null }) {
  return record.status;
}

function getCsvImportCustomerName(record: { name: string | null }) {
  return record.name;
}

function getCsvImportCustomerEmail(record: { email: string | null }) {
  return record.email;
}

function getCsvImportCustomerCity(record: { city: string | null }) {
  return record.city;
}

function getCsvImportCustomerUf(record: { uf: string | null }) {
  return record.uf;
}

function getCsvImportCustomerReferredBy(record: { referredBy: string | null }) {
  return record.referredBy;
}

function getCsvImportCustomerReferredByPhone(record: { referredByPhone: string | null }) {
  return record.referredByPhone;
}

function getCsvImportCustomerNote(record: { note: string | null }) {
  return record.note;
}

function getCsvImportCustomerAnswers(record: { answers: string | null }) {
  return record.answers;
}

function getCsvImportCustomerRow(record: { phone: string; date: string | null; serviceName: string | null; status: string | null }) {
  return record;
}

function getCsvImportCustomerRecord(record: { phone: string; date: string | null; serviceName: string | null; status: string | null }) {
  return record;
}

function getCsvImportHeaderMapFromHeaders(headers: string[]) {
  return buildFieldMap(headers);
}

function getCsvImportHeaderNamesFromHeaders(headers: string[]) {
  return Object.values(buildFieldMap(headers));
}

function getCsvImportHeaderKeysFromHeaders(headers: string[]) {
  return Object.keys(buildFieldMap(headers));
}

function getCsvImportHeaderValuesFromHeaders(headers: string[]) {
  return headers.map(normalizeCsvHeader);
}

function getCsvImportRowFieldsFromHeaders(headers: string[]) {
  return buildFieldMap(headers);
}

function getCsvImportRowValuesFromHeaders(headers: string[]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportRowPayloadsFromHeaders(headers: string[]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportRowRecordsFromHeaders(headers: string[]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportRowObjectRecordsFromHeaders(headers: string[]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportRowRecordSetFromHeaders(headers: string[]) {
  return new Set(rows.map(row => makeDuplicateKey(normalizeImportRow(row, buildFieldMap(headers)))));
}

function getCsvImportRowDuplicateSetFromHeaders(headers: string[]) {
  return new Set(rows.map(row => makeDuplicateKey(normalizeImportRow(row, buildFieldMap(headers)))));
}

function getCsvImportRowDuplicatesFromHeaders(headers: string[]) {
  return new Set(rows.map(row => makeDuplicateKey(normalizeImportRow(row, buildFieldMap(headers)))));
}

function getCsvImportRowDuplicateKeysFromHeaders(headers: string[]) {
  return new Set(rows.map(row => makeDuplicateKey(normalizeImportRow(row, buildFieldMap(headers)))));
}

function getCsvImportRowDuplicateRecordsFromHeaders(headers: string[]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportRowDuplicateRecordObjectsFromHeaders(headers: string[]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportRowDuplicateRecordValuesFromHeaders(headers: string[]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportRowDuplicateRecordFieldsFromHeaders(headers: string[]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportRowDuplicateRecordPayloadsFromHeaders(headers: string[]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportRowDuplicateRecordKeySetFromHeaders(headers: string[]) {
  return new Set(rows.map(row => makeDuplicateKey(normalizeImportRow(row, buildFieldMap(headers)))));
}

function getCsvImportRowDuplicateRecordKeyMapFromHeaders(headers: string[]) {
  return new Map<string, string>();
}

function buildCsvImportRowDuplicateKeyMapFromHeaders(headers: string[]) {
  const fieldMap = buildFieldMap(headers);
  const map = new Map<string, string>();
  rows.forEach(row => map.set(makeDuplicateKey(normalizeImportRow(row, fieldMap)), row.join(',')));
  return map;
}

function getCsvImportRowDuplicateKeyMapFromHeaders(headers: string[]) {
  const fieldMap = buildFieldMap(headers);
  const map = new Map<string, string>();
  rows.forEach(row => map.set(makeDuplicateKey(normalizeImportRow(row, fieldMap)), row.join(',')));
  return map;
}

function getCsvImportRowDuplicateKeyFromHeaders(headers: string[]) {
  const fieldMap = buildFieldMap(headers);
  return rows.map(row => makeDuplicateKey(normalizeImportRow(row, fieldMap)));
}

function getCsvImportRowDuplicateKeyDataFromHeaders(headers: string[]) {
  const fieldMap = buildFieldMap(headers);
  return rows.map(row => normalizeImportRow(row, fieldMap));
}

function getCsvImportRowDuplicateKeyDataMapFromHeaders(headers: string[]) {
  const fieldMap = buildFieldMap(headers);
  const map = new Map<string, Array<Record<string, string|null>>>();
  rows.forEach(row => {
    const key = makeDuplicateKey(normalizeImportRow(row, fieldMap));
    const value = normalizeImportRow(row, fieldMap);
    const existing = map.get(key) || [];
    existing.push(value);
    map.set(key, existing);
  });
  return map;
}

function getCsvImportRowDuplicateKeyDataListFromHeaders(headers: string[]) {
  const fieldMap = buildFieldMap(headers);
  const list: Array<Record<string, string|null>> = [];
  rows.forEach(row => list.push(normalizeImportRow(row, fieldMap)));
  return list;
}

function getCsvImportRowDuplicateKeyDataRecordsFromHeaders(headers: string[]) {
  const fieldMap = buildFieldMap(headers);
  return rows.map(row => normalizeImportRow(row, fieldMap));
}

function getCsvImportRowDuplicateKeyEntriesFromHeaders(headers: string[]) {
  const fieldMap = buildFieldMap(headers);
  return rows.map(row => normalizeImportRow(row, fieldMap));
}

function getCsvImportRowDuplicateKeyValuesFromHeaders(headers: string[]) {
  const fieldMap = buildFieldMap(headers);
  return rows.map(row => normalizeImportRow(row, fieldMap));
}

function getCsvImportRowDuplicateKeyObjectsFromHeaders(headers: string[]) {
  const fieldMap = buildFieldMap(headers);
  return rows.map(row => normalizeImportRow(row, fieldMap));
}

function getCsvImportRowDuplicateKeyPayloadsFromHeaders(headers: string[]) {
  const fieldMap = buildFieldMap(headers);
  return rows.map(row => normalizeImportRow(row, fieldMap));
}

function getCsvImportRowDuplicateKeyDataObjectsFromHeaders(headers: string[]) {
  const fieldMap = buildFieldMap(headers);
  return rows.map(row => normalizeImportRow(row, fieldMap));
}

function getCsvImportRowDuplicateKeyDataPayloadsFromHeaders(headers: string[]) {
  const fieldMap = buildFieldMap(headers);
  return rows.map(row => normalizeImportRow(row, fieldMap));
}

function getCsvImportRowDuplicateKeySummaryFromHeaders(headers: string[]) {
  const fieldMap = buildFieldMap(headers);
  return rows.map(row => normalizeImportRow(row, fieldMap));
}

function getCsvImportRowDuplicateKeyDebugFromHeaders(headers: string[]) {
  const fieldMap = buildFieldMap(headers);
  return rows.map(row => normalizeImportRow(row, fieldMap));
}

function getCsvImportRowDuplicateKeyLogFromHeaders(headers: string[]) {
  const fieldMap = buildFieldMap(headers);
  return rows.map(row => normalizeImportRow(row, fieldMap));
}

function getCsvImportRowDuplicateKeyTraceFromHeaders(headers: string[]) {
  const fieldMap = buildFieldMap(headers);
  return rows.map(row => normalizeImportRow(row, fieldMap));
}

function getCsvImportRowDuplicateKeyAnalysisFromHeaders(headers: string[]) {
  const fieldMap = buildFieldMap(headers);
  return rows.map(row => normalizeImportRow(row, fieldMap));
}

function getCsvImportRowDuplicateKeyAuditFromHeaders(headers: string[]) {
  const fieldMap = buildFieldMap(headers);
  return rows.map(row => normalizeImportRow(row, fieldMap));
}

function getCsvImportRowDuplicateKeyReviewFromHeaders(headers: string[]) {
  const fieldMap = buildFieldMap(headers);
  return rows.map(row => normalizeImportRow(row, fieldMap));
}

function getCsvImportRowDuplicateKeyVerifyFromHeaders(headers: string[]) {
  const fieldMap = buildFieldMap(headers);
  return rows.map(row => normalizeImportRow(row, fieldMap));
}

function getCsvImportRowDuplicateKeyCheckFromHeaders(headers: string[]) {
  const fieldMap = buildFieldMap(headers);
  return rows.map(row => normalizeImportRow(row, fieldMap));
}

function getCsvImportRowDuplicateKeyEnsureFromHeaders(headers: string[]) {
  const fieldMap = buildFieldMap(headers);
  return rows.map(row => normalizeImportRow(row, fieldMap));
}

function getCsvImportRowDuplicateKeyValidateFromHeaders(headers: string[]) {
  const fieldMap = buildFieldMap(headers);
  return rows.map(row => normalizeImportRow(row, fieldMap));
}

function getCsvImportRowDuplicateKeyConfirmFromHeaders(headers: string[]) {
  const fieldMap = buildFieldMap(headers);
  return rows.map(row => normalizeImportRow(row, fieldMap));
}

function getCsvImportRowDuplicateKeyAllowFromHeaders(headers: string[]) {
  const fieldMap = buildFieldMap(headers);
  return rows.map(row => normalizeImportRow(row, fieldMap));
}

function getCsvImportRowDuplicateKeyDenyFromHeaders(headers: string[]) {
  const fieldMap = buildFieldMap(headers);
  return rows.map(row => normalizeImportRow(row, fieldMap));
}

function getCsvImportRowDuplicateKeyPermitFromHeaders(headers: string[]) {
  const fieldMap = buildFieldMap(headers);
  return rows.map(row => normalizeImportRow(row, fieldMap));
}

function getCsvImportRowDuplicateKeyRejectFromHeaders(headers: string[]) {
  const fieldMap = buildFieldMap(headers);
  return rows.map(row => normalizeImportRow(row, fieldMap));
}

function buildCsvImportRowsForHeaders(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportRowsForHeaders(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportRowsForFields(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportRowsForData(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportRowsForPayload(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportRowsForOrders(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportRowsForCustomers(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportRowsForExistingOrders(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportRowsForExistingCustomers(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportRowsForExistingRecords(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportRowsForExistingDuplicates(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportRowsForDuplicates(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportRowsForDuplicateDetection(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportRowsForDeduplication(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportRowsForSafeImport(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportRowsForSafePayload(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportRowsForSafeRecords(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportRowsForSafeData(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportRowsForSafeOrders(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportRowsForSafeCustomers(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportRowsForSafeExistingOrders(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportRowsForSafeExistingCustomers(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportRowsForSafeExistingRecords(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportRowsForSafeExistingDuplicates(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportRowsForSafeDuplicateDetection(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportRowsForSafeDeduplication(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportRowsForSafeValidation(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportRowsForSafeProcessing(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportRowsForSafeCreation(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportRowsForSafeSaving(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportRowsForSafeResponse(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportRowsForSafeSummary(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportRowsForSafeReport(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportRowsForSafeAudit(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportRowsForSafeLog(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportRowsForSafeError(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportRowsForSafeWarning(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportRowsForSafeNote(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function getCsvImportRowsForSafeRemark(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function makeCsvRowKey(row: string[], fieldMap: Record<number, string>) {
  return makeDuplicateKey(normalizeImportRow(row, fieldMap));
}

function makeCsvRowSafe(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function makeCsvRowSummary(row: string[], fieldMap: Record<number, string>) {
  return normalizeImportRow(row, fieldMap);
}

function makeCsvRowHeaders(headers: string[]) {
  return headers;
}

function makeCsvRowFieldMap(headers: string[]) {
  return buildFieldMap(headers);
}

function makeCsvImportFrozenData(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function makeCsvImportFrozenRecords(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function makeCsvImportFrozenPayloads(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function makeCsvImportFrozenObjects(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function makeCsvImportFrozenRows(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function makeCsvImportFrozenRowRecords(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function makeCsvImportFrozenRowPayloads(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function makeCsvImportFrozenRowObjects(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function makeCsvImportFrozenRowData(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function makeCsvImportFrozenRowRecordsFromHeaders(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function makeCsvImportFrozenRowPayloadsFromHeaders(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function makeCsvImportFrozenRowObjectsFromHeaders(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function makeCsvImportFrozenRowDataFromHeaders(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function makeCsvImportFrozenRowRecordsFromHeadersAndRows(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function makeCsvImportFrozenRowPayloadsFromHeadersAndRows(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function makeCsvImportFrozenRowObjectsFromHeadersAndRows(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function makeCsvImportFrozenRowDataFromHeadersAndRows(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function makeCsvImportFrozenRowRecordSetFromHeadersAndRows(headers: string[], rows: string[][]) {
  const fieldMap = buildFieldMap(headers);
  const set = new Set<string>();
  rows.forEach(row => set.add(makeDuplicateKey(normalizeImportRow(row, fieldMap))));
  return set;
}

function makeCsvImportFrozenRowDuplicateSetFromHeadersAndRows(headers: string[], rows: string[][]) {
  const fieldMap = buildFieldMap(headers);
  const set = new Set<string>();
  rows.forEach(row => set.add(makeDuplicateKey(normalizeImportRow(row, fieldMap))));
  return set;
}

function makeCsvImportFrozenRowDuplicateKeysFromHeadersAndRows(headers: string[], rows: string[][]) {
  const fieldMap = buildFieldMap(headers);
  const set = new Set<string>();
  rows.forEach(row => set.add(makeDuplicateKey(normalizeImportRow(row, fieldMap))));
  return set;
}

function makeCsvImportFrozenRowDuplicatePayloadsFromHeadersAndRows(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function makeCsvImportFrozenRowDuplicateObjectsFromHeadersAndRows(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}

function makeCsvImportFrozenRowDuplicateRecordsFromHeadersAndRows(headers: string[], rows: string[][]) {
  return rows.map(row => normalizeImportRow(row, buildFieldMap(headers)));
}


function makeSafeLabel(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/gi, "");
}


export function registerUploadRoute(app: Express) {

  // ─── CHUNK UPLOAD: Inicializa sessão e retorna uploadId ─────────────────────
  app.post("/api/upload/init-chunked", jsonParser, async (req: Request, res: Response) => {
    try {
      if (!isAdminRequest(req)) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const { registrationId, customerPhone, label, fromAdmin, mimeType, totalChunks } = req.body;
      if (!registrationId || !customerPhone || !label || !mimeType || !totalChunks) {
        res.status(400).json({ error: "Missing required fields" });
        return;
      }
      const r = resolveFileExt(mimeType);
      const safeLabel = makeSafeLabel(label);
      const randomSuffix = Math.random().toString(36).substring(2, 10);
      const prefix = fromAdmin === "1" || fromAdmin === 1 ? "admin-docs" : "order-docs";
      const fileKey = `${prefix}/${customerPhone}-${safeLabel}-${randomSuffix}.${r.ext}`;
      const uploadId = `${Date.now()}-${randomSuffix}`;
      const total = Number(totalChunks);

      const db = await getDb();
      if (!db) { res.status(500).json({ error: "DB unavailable" }); return; }
      await db.insert(uploadSessions).values({
        uploadId,
        registrationId: String(registrationId),
        customerPhone,
        label,
        fromAdmin: String(fromAdmin ?? "0"),
        mimeType,
        ext: r.ext,
        contentType: r.contentType,
        fileKey,
        totalChunks: total,
        receivedChunks: 0,
      });
      res.json({ uploadId });
    } catch (err: any) {
      console.error("[UploadRoute] init-chunked error:", err);
      res.status(500).json({ error: err?.message ?? "Init failed" });
    }
  });

  // ─── CHUNK UPLOAD: Recebe chunk e faz PUT streaming para S3 ─────────────────
  app.post(
    "/api/upload/chunk",
    uploadChunk.single("chunk"),
    async (req: Request, res: Response) => {
      try {
        if (!isAdminRequest(req)) {
          res.status(401).json({ error: "Unauthorized" });
          return;
        }
        const chunk = req.file;
        if (!chunk) {
          res.status(400).json({ error: "No chunk provided" });
          return;
        }
        const { uploadId, chunkIndex } = req.body;
        if (!uploadId || chunkIndex === undefined) {
          res.status(400).json({ error: "Missing uploadId or chunkIndex" });
          return;
        }
        const idx = Number(chunkIndex);

        // Carregar sessão do banco
        const db = await getDb();
        if (!db) { res.status(500).json({ error: "DB unavailable" }); return; }
        const sessions = await db.select().from(uploadSessions).where(eq(uploadSessions.uploadId, uploadId));
        const session = sessions[0];
        if (!session) {
          res.status(404).json({ error: "Upload session not found or expired" });
          return;
        }

        // Enviar diretamente para Cloudflare R2 via backend
        const chunkKey = `chunks/${uploadId}/${idx}`;
        await r2PutObject(chunkKey, chunk.buffer, "application/octet-stream");

        // Atualizar contador no banco
        const newCount = session.receivedChunks + 1;
        await db.update(uploadSessions)
          .set({ receivedChunks: newCount })
          .where(eq(uploadSessions.uploadId, uploadId));

        res.json({ received: newCount, total: session.totalChunks });
      } catch (err: any) {
        console.error("[UploadRoute] chunk error:", err);
        res.status(500).json({ error: err?.message ?? "Chunk upload failed" });
      }
    }
  );

  // ─── CHUNK UPLOAD: Finaliza — baixa chunks em paralelo, monta e salva ───────
  app.post("/api/upload/finalize-chunked", jsonParser, async (req: Request, res: Response) => {
    try {
      if (!isAdminRequest(req)) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const { uploadId } = req.body;
      if (!uploadId) {
        res.status(400).json({ error: "Missing uploadId" });
        return;
      }

      const db = await getDb();
      if (!db) { res.status(500).json({ error: "DB unavailable" }); return; }
      const sessions = await db.select().from(uploadSessions).where(eq(uploadSessions.uploadId, uploadId));
      const session = sessions[0];
      if (!session) {
        res.status(404).json({ error: "Upload session not found or expired" });
        return;
      }
      if (session.receivedChunks < session.totalChunks) {
        res.status(400).json({ error: `Missing chunks: received ${session.receivedChunks}/${session.totalChunks}` });
        return;
      }

      // Baixar todos os chunks do Cloudflare R2 em paralelo
      const chunkKeys = Array.from({ length: session.totalChunks }, (_, i) => `chunks/${uploadId}/${i}`);
      const chunkBuffers = await Promise.all(
        chunkKeys.map(async (chunkKey) => {
          return await r2GetObjectBuffer(chunkKey);
        })
      );

      const fullBuffer = Buffer.concat(chunkBuffers);

      // Salvar arquivo final no Cloudflare R2
      const { url } = await r2PutObject(session.fileKey, fullBuffer, session.contentType);

      // Limpar chunks temporários após persistir o arquivo final
      const cleanupKeys = Array.from({ length: session.totalChunks }, (_, i) => `chunks/${uploadId}/${i}`);
      await r2DeleteObjects(cleanupKeys);

      // Salvar no banco de dados
      await addOrderFile({
        registrationId: Number(session.registrationId),
        customerPhone: session.customerPhone,
        label: session.label,
        fileUrl: url,
        fileKey: session.fileKey,
        mimeType: session.contentType,
        fromAdmin: String(session.fromAdmin) === "1" ? 1 : 0,
      });

      // Limpar sessão do banco
      await db.delete(uploadSessions).where(eq(uploadSessions.uploadId, uploadId));

      res.json({ success: true, fileUrl: url });
    } catch (err: any) {
      console.error("[UploadRoute] finalize-chunked error:", err);
      res.status(500).json({ error: err?.message ?? "Finalize failed" });
    }
  });

   // ─── CLIENT UPLOAD: Upload direto de arquivo pelo cliente (sem auth de admin) ─────
  // Usado para enviar documentos e comprovante PIX antes de finalizar o pedido
  // Retorna a URL do arquivo salvo no S3 para ser referenciada no payload do pedido
  app.post(
    "/api/upload/client-file",
    (req: Request, res: Response, next: import('express').NextFunction) => {
      uploadDirect.single("file")(req, res, (err: any) => {
        if (err) {
          // Multer error (e.g. LIMIT_FILE_SIZE) — return JSON instead of HTML
          const msg = err.code === 'LIMIT_FILE_SIZE'
            ? 'Arquivo muito grande. Máximo 20MB.'
            : (err.message || 'Erro no upload');
          res.status(400).json({ error: msg });
          return;
        }
        next();
      });
    },
    async (req: Request, res: Response) => {
      try {
        const file = req.file;
        if (!file) {
          res.status(400).json({ error: "No file provided" });
          return;
        }
        const { label, phone } = req.body;
        if (!label) {
          res.status(400).json({ error: "Missing label" });
          return;
        }
        const r = resolveFileExt(file.mimetype, file.originalname);
        const safeLabel = makeSafeLabel(label);
        const safePhone = (phone || "desconhecido").replace(/\D/g, "").slice(-11);
        const randomSuffix = Math.random().toString(36).substring(2, 10);
        const fileKey = `order-docs/${safePhone}-${safeLabel}-${randomSuffix}.${r.ext}`;
        const { url } = await r2PutObject(fileKey, file.buffer, r.contentType);
        res.json({ success: true, fileUrl: url, fileKey, mimeType: r.contentType });
      } catch (err: any) {
        console.error("[UploadRoute] client-file error:", err);
        res.status(500).json({ error: err?.message ?? "Upload failed" });
      }
    }
  );

  // ─── DIRECT UPLOAD: Para imagens e PDFs (≤20MB) ────────────────────────
  app.post(
    "/api/upload/admin-file",
    (req: Request, res: Response, next: import('express').NextFunction) => {
      uploadDirect.single("file")(req, res, (err: any) => {
        if (err) {
          const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Arquivo muito grande. Máximo 20MB.' : (err.message || 'Erro no upload');
          res.status(400).json({ error: msg });
          return;
        }
        next();
      });
    },
    async (req: Request, res: Response) => {
      try {
        if (!isAdminRequest(req)) {
          res.status(401).json({ error: "Unauthorized" });
          return;
        }
        const file = req.file;
        if (!file) {
          res.status(400).json({ error: "No file provided" });
          return;
        }
        const { registrationId, customerPhone, label, fromAdmin } = req.body;
        if (!registrationId || !customerPhone || !label) {
          res.status(400).json({ error: "Missing required fields" });
          return;
        }
        const r = resolveFileExt(file.mimetype, file.originalname);
        const safeLabel = makeSafeLabel(label);
        const randomSuffix = Math.random().toString(36).substring(2, 10);
        const prefix = fromAdmin === "1" || fromAdmin === 1 ? "admin-docs" : "order-docs";
        const fileKey = `${prefix}/${customerPhone}-${safeLabel}-${randomSuffix}.${r.ext}`;
        const { url } = await r2PutObject(fileKey, file.buffer, r.contentType);
        await addOrderFile({
          registrationId: Number(registrationId),
          customerPhone,
          label,
          fileUrl: url,
          fileKey,
          mimeType: r.contentType,
          fromAdmin: fromAdmin === "1" || fromAdmin === 1 ? 1 : 0,
        });
        res.json({ success: true, fileUrl: url });
      } catch (err: any) {
        console.error("[UploadRoute] error:", err);
        res.status(500).json({ error: err?.message ?? "Upload failed" });
      }
    }
  );

  app.post(
    "/api/clients/import-csv",
    uploadDirect.single("file"),
    async (req: Request, res: Response) => {
      try {
        if (!isAdminRequest(req)) {
          res.status(401).json({ error: "Unauthorized" });
          return;
        }

        const file = req.file;
        if (!file) {
          res.status(400).json({ error: "Nenhum arquivo CSV enviado" });
          return;
        }

        const text = file.buffer.toString("utf-8");
        const { headers, rows } = parseCsvText(text);
        if (headers.length === 0 || rows.length === 0) {
          res.status(400).json({ error: "CSV vazio ou inválido" });
          return;
        }

        const fieldMap = buildFieldMap(headers);
        const phoneHeaderIndex = Number(Object.entries(fieldMap).find(([_, value]) => value === "phone")?.[0] ?? -1);
        if (phoneHeaderIndex < 0) {
          res.status(400).json({ error: "O CSV deve conter a coluna 'Telefone' ou similar" });
          return;
        }

        let imported = 0;
        let duplicates = 0;
        let errorsCount = 0;
        const details: string[] = [];
        const seenPhones = new Set<string>();

        for (let index = 0; index < rows.length; index += 1) {
          const row = rows[index];
          const lineNumber = index + 2;
          const record = normalizeImportRow(row, fieldMap);

          if (!record.phone) {
            errorsCount += 1;
            details.push(`Linha ${lineNumber}: telefone inválido ou ausente.`);
            continue;
          }

          if (seenPhones.has(record.phone)) {
            duplicates += 1;
            continue;
          }
          seenPhones.add(record.phone);

          try {
            const existingCustomer = await getCustomerByPhone(record.phone);
            if (existingCustomer) {
              duplicates += 1;
              details.push(`Linha ${lineNumber}: cliente já existe no banco e foi descartado.`);
              continue;
            }

            // CSV não carrega foto de perfil. Não criar cadastro principal incompleto.
            errorsCount += 1;
            details.push(`Linha ${lineNumber}: cadastro principal exige foto, e-mail, CPF e telefone. Use o formulário de Clientes.`);
            continue;
          } catch (err: any) {
            console.error("[UploadRoute] clients/import-csv error:", err);
            errorsCount += 1;
            details.push(`Linha ${lineNumber}: falha ao salvar cliente.`);
          }
        }

        res.json({ imported, duplicates, errors: errorsCount, details: details.slice(0, 10) });
      } catch (err: any) {
        console.error("[UploadRoute] clients/import-csv error:", err);
        res.status(500).json({ error: err?.message ?? "Import failed" });
      }
    }
  );

  app.post(
    "/api/orders/import-csv",
    uploadDirect.single("file"),
    async (req: Request, res: Response) => {
      try {
        if (!isAdminRequest(req)) {
          res.status(401).json({ error: "Unauthorized" });
          return;
        }

        const file = req.file;
        if (!file) {
          res.status(400).json({ error: "Nenhum arquivo CSV enviado" });
          return;
        }

        const text = file.buffer.toString("utf-8");
        const { headers, rows } = parseCsvText(text);
        if (headers.length === 0 || rows.length === 0) {
          res.status(400).json({ error: "CSV vazio ou inválido" });
          return;
        }

        const fieldMap = buildFieldMap(headers);
        const phoneHeaderIndex = Number(Object.entries(fieldMap).find(([_, value]) => value === "phone")?.[0] ?? -1);
        const dateHeaderIndex = Number(Object.entries(fieldMap).find(([_, value]) => value === "date")?.[0] ?? -1);
        if (phoneHeaderIndex < 0 || dateHeaderIndex < 0) {
          res.status(400).json({ error: "O CSV deve conter colunas 'phone' e 'date'" });
          return;
        }

        const db = await getDb();
        if (!db) { res.status(500).json({ error: "DB unavailable" }); return; }

        const importedRows: Array<ReturnType<typeof normalizeImportRow> & { rawDate: string }> = [];
        const seenKeys = new Set<string>();
        let fileDuplicates = 0;
        const errors: string[] = [];

        rows.forEach((row, index) => {
          const lineNumber = index + 2;
          const record = normalizeImportRow(row, fieldMap);
          const rawDate = String(row[dateHeaderIndex] || "").trim();
          const parsedDate = parseCsvDate(rawDate);
          const dateString = parsedDate ? normalizeRecordDate(parsedDate) : null;

          if (!record.phone) {
            errors.push(`Linha ${lineNumber}: telefone inválido ou ausente.`);
            return;
          }
          if (!rawDate || !dateString) {
            errors.push(`Linha ${lineNumber}: data inválida ou ausente.`);
            return;
          }

          const key = `${record.phone}|${dateString}`;
          if (seenKeys.has(key)) {
            fileDuplicates += 1;
            return;
          }
          seenKeys.add(key);
          importedRows.push({ ...record, date: dateString, rawDate });
        });

        let imported = 0;
        let duplicates = fileDuplicates;
        let errorsCount = errors.length;
        const details: string[] = [];

        for (let index = 0; index < importedRows.length; index += 1) {
          const row = importedRows[index];
          const existing = await db.select().from(accessCodePhones)
            .where(and(
              sql`REGEXP_REPLACE(${accessCodePhones.phone}, '[^0-9]', '') = ${row.phone}`,
              sql`DATE(${accessCodePhones.accessedAt}) = ${row.date}`,
            ))
            .limit(1);
          if (existing.length > 0) {
            duplicates += 1;
            continue;
          }

          const importCode = `IMPORT-${row.phone}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          await db.insert(accessCodes).values({
            code: importCode,
            type: 'vip',
            status: 'used',
            clientName: row.name || null,
            maxUses: 1,
            currentUses: 1,
            createdAt: new Date(),
          });
          const [codeRow] = await db.select().from(accessCodes).where(eq(accessCodes.code, importCode)).limit(1);
          if (!codeRow?.id) {
            errors.push(`Linha ${index + 2}: não foi possível criar código de acesso.`);
            errorsCount += 1;
            continue;
          }

          const orderDate = parseCsvDate(row.rawDate) || new Date();
          const accessedAt = new Date(`${normalizeRecordDate(orderDate)}T00:00:00Z`);
          await db.insert(accessCodePhones).values({
            codeId: codeRow.id,
            phone: row.phone,
            consumed: 1,
            archived: 0,
            rgCnhApproved: 0,
            orderSource: 'manual',
            accessedAt,
            refCode: null,
            refOwnerName: null,
            deletedAt: null,
            deletedReason: null,
            thirdPartyName: null,
            resellerDiscountApplied: null,
            cartGroupId: null,
            cartTotal: null,
            cartCouponCode: null,
            cartCouponDiscount: null,
            cartItemIndex: 0,
          });
          const [acpRow] = await db.select().from(accessCodePhones)
            .where(and(
              eq(accessCodePhones.codeId, codeRow.id),
              eq(accessCodePhones.phone, row.phone),
            ))
            .orderBy(sql`${accessCodePhones.id} DESC`)
            .limit(1);
          if (!acpRow?.id) {
            errors.push(`Linha ${index + 2}: não foi possível criar registro de pedido.`);
            errorsCount += 1;
            continue;
          }

          try {
            const existingCustomer = await getCustomerByPhone(row.phone);
            if (existingCustomer) {
              await updateCustomer(existingCustomer.id, {
                name: row.name || undefined,
                email: row.email || undefined,
                city: row.city || undefined,
                uf: row.uf || undefined,
                referredBy: row.referredBy || undefined,
                referredByPhone: row.referredByPhone || undefined,
              });
            } else {
              // A importação de pedido não pode criar cadastro principal parcial.
              // O pedido continua registrado, mas o perfil deve ser concluído em Clientes.
              console.warn('[ImportCSV] pedido sem perfil principal completo:', row.phone);
            }
          } catch (customerErr: any) {
            console.error("[ImportCSV] customer error:", customerErr);
          }

          try {
            let orderNum: number | undefined;
            try { orderNum = await generateOrderNumber(); } catch (e) { console.error('[ImportCSV] order number error:', e); }
            await addOrderStatus({
              registrationId: acpRow.id,
              orderNumber: orderNum,
              customerPhone: row.phone,
              status: row.status,
              note: row.note || undefined,
              serviceName: row.serviceName || undefined,
              serviceOption: row.serviceOption || undefined,
              answers: row.answers || undefined,
            });
            imported += 1;
          } catch (orderErr: any) {
            console.error("[ImportCSV] order status error:", orderErr);
            errors.push(`Linha ${index + 2}: falha ao salvar pedido.`);
            errorsCount += 1;
          }
        }

        details.push(...errors.slice(0, 10));
        res.json({ imported, duplicates, errors: errorsCount, details });
      } catch (err: any) {
        console.error("[UploadRoute] import-csv error:", err);
        res.status(500).json({ error: err?.message ?? "Import failed" });
      }
    }
  );

  // ─── ADMIN MEDIA UPLOAD V2: Frontend envia chunks para o backend e R2 ────
  // Fluxo:
  //   1. POST /api/upload/init-media → cria sessão, retorna uploadId + fileKey
  //   2. POST /api/upload/chunk-media → envia cada chunk para o backend, que grava em R2
  //   3. POST /api/upload/confirm-chunk → frontend confirma que chunk foi recebido
  //   4. POST /api/upload/finalize-media → backend monta o arquivo final em R2
  //   5. GET /api/upload/media-job-status?jobId=X → polling do status

  app.post("/api/upload/init-media", jsonParser, async (req: Request, res: Response) => {
    try {
      if (!isAdminRequest(req)) { res.status(401).json({ error: "Unauthorized" }); return; }
      const { mimeType, filename, totalChunks } = req.body;
      if (!mimeType || !totalChunks) { res.status(400).json({ error: "Missing mimeType or totalChunks" }); return; }
      const r = resolveFileExt(mimeType, filename);
      const safeName = makeSafeLabel(filename || "media");
      const randomSuffix = Math.random().toString(36).substring(2, 10);
      const fileKey = `videos/${safeName}-${randomSuffix}.${r.ext}`;
      const uploadId = `media-${Date.now()}-${randomSuffix}`;
      const db = await getDb();
      if (!db) { res.status(500).json({ error: "DB unavailable" }); return; }

      await db.insert(uploadSessions).values({
        uploadId,
        registrationId: "0",
        customerPhone: "admin",
        label: safeName,
        fromAdmin: "1",
        mimeType,
        ext: r.ext,
        contentType: r.contentType,
        fileKey,
        totalChunks: Number(totalChunks),
        receivedChunks: 0,
        jobStatus: "uploading",
      });
      res.json({ uploadId, fileKey });
    } catch (err: any) {
      console.error("[UploadRoute] init-media error:", err);
      res.status(500).json({ error: err?.message ?? "Init failed" });
    }
  });

  // Frontend confirma que um chunk foi enviado com sucesso para S3
  app.post("/api/upload/confirm-chunk", jsonParser, async (req: Request, res: Response) => {
    try {
      if (!isAdminRequest(req)) { res.status(401).json({ error: "Unauthorized" }); return; }
      const { uploadId, chunkIndex } = req.body;
      if (!uploadId || chunkIndex === undefined) { res.status(400).json({ error: "Missing fields" }); return; }
      const db = await getDb();
      if (!db) { res.status(500).json({ error: "DB unavailable" }); return; }
      const sessions = await db.select().from(uploadSessions).where(eq(uploadSessions.uploadId, uploadId));
      const session = sessions[0];
      if (!session) { res.status(404).json({ error: "Session not found" }); return; }
      const newCount = session.receivedChunks + 1;
      await db.update(uploadSessions).set({ receivedChunks: newCount }).where(eq(uploadSessions.uploadId, uploadId));
      res.json({ received: newCount, total: session.totalChunks });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Confirm failed" });
    }
  });

  // Manter endpoint antigo chunk-media para compatibilidade (redireciona para S3)
  app.post(
    "/api/upload/chunk-media",
    uploadChunk.single("chunk"),
    async (req: Request, res: Response) => {
      try {
        if (!isAdminRequest(req)) { res.status(401).json({ error: "Unauthorized" }); return; }
        const chunk = req.file;
        if (!chunk) { res.status(400).json({ error: "No chunk" }); return; }
        const { uploadId, chunkIndex } = req.body;
        if (!uploadId || chunkIndex === undefined) { res.status(400).json({ error: "Missing fields" }); return; }
        const idx = Number(chunkIndex);
        const db = await getDb();
        if (!db) { res.status(500).json({ error: "DB unavailable" }); return; }
        const sessions = await db.select().from(uploadSessions).where(eq(uploadSessions.uploadId, uploadId));
        const session = sessions[0];
        if (!session) { res.status(404).json({ error: "Session not found" }); return; }
        const chunkKey = `chunks/${uploadId}/${idx}`;
        await r2PutObject(chunkKey, chunk.buffer, "application/octet-stream");
        const newCount = session.receivedChunks + 1;
        await db.update(uploadSessions).set({ receivedChunks: newCount }).where(eq(uploadSessions.uploadId, uploadId));
        res.json({ received: newCount, total: session.totalChunks });
      } catch (err: any) {
        console.error("[UploadRoute] chunk-media error:", err);
        res.status(500).json({ error: err?.message ?? "Chunk failed" });
      }
    }
  );

  // finalize-media: processa em BACKGROUND, retorna jobId imediatamente
  // O processamento (baixar chunks do S3, concatenar, re-upload) roda em background
  // O frontend faz polling em /api/upload/media-job-status
  app.post("/api/upload/finalize-media", jsonParser, async (req: Request, res: Response) => {
    try {
      if (!isAdminRequest(req)) { res.status(401).json({ error: "Unauthorized" }); return; }
      const { uploadId, filename, fileSize, videoSlug } = req.body;
      if (!uploadId) { res.status(400).json({ error: "Missing uploadId" }); return; }
      const db = await getDb();
      if (!db) { res.status(500).json({ error: "DB unavailable" }); return; }
      const sessions = await db.select().from(uploadSessions).where(eq(uploadSessions.uploadId, uploadId));
      const session = sessions[0];
      if (!session) { res.status(404).json({ error: "Session not found" }); return; }
      if (session.receivedChunks < session.totalChunks) {
        res.status(400).json({ error: `Missing chunks: ${session.receivedChunks}/${session.totalChunks}` });
        return;
      }

      // Processamento SÍNCRONO — aguarda S3 upload antes de responder
      // Isso evita loop infinito de polling quando o servidor reinicia em produção serverless
      const slugNorm = (videoSlug || "").toString().trim()
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
      const finalSlug = slugNorm || null;

      console.log(`[finalize-media] Montando ${session.totalChunks} chunks para ${session.fileKey}`);
      const buffers: Buffer[] = [];
      for (let i = 0; i < session.totalChunks; i++) {
        const chunkKey = `chunks/${uploadId}/${i}`;
        buffers.push(await r2GetObjectBuffer(chunkKey));
      }
      const fullBuffer = Buffer.concat(buffers);
      console.log(`[finalize-media] Buffer: ${fullBuffer.length} bytes. Enviando R2...`);
      const { url } = await r2PutObject(session.fileKey, fullBuffer, session.contentType);
      console.log(`[finalize-media] R2 OK: ${url}`);

      // Salvar no banco
      const { adminMediaFiles } = await import("../drizzle/schema");
      await db.insert(adminMediaFiles).values({
        name: filename || session.label,
        fileKey: session.fileKey,
        url,
        mimeType: session.mimeType,
        fileSize: fileSize || fullBuffer.length,
        videoSlug: finalSlug,
      });

      // Marcar sessão como completed
      await db.update(uploadSessions)
        .set({ jobStatus: "completed", jobUrl: url, jobError: finalSlug })
        .where(eq(uploadSessions.uploadId, uploadId));
      console.log(`[finalize-media] COMPLETED: ${url}`);

      // Responder com resultado final — sem polling necessário
      const friendlyUrl = finalSlug ? `https://h2colombiano.com/video/${finalSlug}` : url;
      res.json({ success: true, status: "completed", videoUrl: friendlyUrl, videoSlug: finalSlug });
    } catch (err: any) {
      console.error("[UploadRoute] finalize-media error:", err);
      res.status(500).json({ error: err?.message ?? "Finalize failed" });
    }
  });

  // Polling: status do job (lê do banco — funciona em qualquer instância)
  // Status: uploading → processing → completed | failed
  app.get("/api/upload/media-job-status", async (req: Request, res: Response) => {
    try {
      if (!isAdminRequest(req)) { res.status(401).json({ error: "Unauthorized" }); return; }
      const jobId = req.query.jobId as string;
      if (!jobId) { res.status(400).json({ error: "Missing jobId" }); return; }
      const db = await getDb();
      if (!db) { res.status(500).json({ error: "DB unavailable" }); return; }
      const rows = await db.select().from(uploadSessions).where(eq(uploadSessions.uploadId, jobId));
      const row = rows[0];
      if (!row) {
        // Sessão já foi limpa — buscar na tabela de mídias
        const { adminMediaFiles } = await import("../drizzle/schema");
        const { desc } = await import("drizzle-orm");
        const recent = await db.select().from(adminMediaFiles).orderBy(desc(adminMediaFiles.uploadedAt)).limit(1);
        if (recent[0]) {
          const m = recent[0];
          const vUrl = m.url; // Sempre URL direta do arquivo
          res.json({ status: "completed", videoUrl: vUrl, videoSlug: m.videoSlug });
        } else {
          res.json({ status: "completed", videoUrl: "", videoSlug: null });
        }
        return;
      }
      const st = row.jobStatus ?? "processing";
      if (st === "completed") {
        res.json({ status: "completed", videoUrl: row.jobUrl ?? "", videoSlug: row.jobError ?? null });
      } else if (st === "failed") {
        res.json({ status: "failed", error: row.jobError ?? "Erro desconhecido" });
      } else {
        // uploading ou processing
        res.json({ status: st });
      }
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Status check failed" });
    }
  });

  // Listar mídias salvas no banco
  app.get("/api/upload/media-list", async (req: Request, res: Response) => {
    try {
      if (!isAdminRequest(req)) { res.status(401).json({ error: "Unauthorized" }); return; }
      const db = await getDb();
      if (!db) { res.json([]); return; }
      const { adminMediaFiles } = await import("../drizzle/schema");
      const { desc } = await import("drizzle-orm");
      const list = await db.select().from(adminMediaFiles).orderBy(desc(adminMediaFiles.uploadedAt)).limit(50);
      res.json(list);
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "List failed" });
    }
  });

  // Deletar mídia do banco (não remove do S3 — key fica inacessível)
  app.delete("/api/upload/media-delete/:id", async (req: Request, res: Response) => {
    try {
      if (!isAdminRequest(req)) { res.status(401).json({ error: "Unauthorized" }); return; }
      const id = Number(req.params.id);
      if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
      const db = await getDb();
      if (!db) { res.status(500).json({ error: "DB unavailable" }); return; }
      const { adminMediaFiles } = await import("../drizzle/schema");
      const { eq: eqOp } = await import("drizzle-orm");
      await db.delete(adminMediaFiles).where(eqOp(adminMediaFiles.id, id));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Delete failed" });
    }
  });

  // ─── ADMIN IMAGE UPLOAD (direto, sem chunks — até 15MB) ──────────────────────
  app.post("/api/upload/admin-image", uploadDirect.single("file"), async (req: Request, res: Response) => {
    try {
      if (!isAdminRequest(req)) { res.status(401).json({ error: "Unauthorized" }); return; }
      const file = req.file;
      if (!file) { res.status(400).json({ error: "No file" }); return; }
      const { slug } = req.body || {};
      const r = resolveFileExt(file.mimetype, file.originalname);
      const safeName = makeSafeLabel(file.originalname || "imagem");
      const randomSuffix = Math.random().toString(36).substring(2, 10);
      const fileKey = `fotos/${safeName}-${randomSuffix}.${r.ext}`;
      const { url } = await r2PutObject(fileKey, file.buffer, r.contentType);
      // Salvar no banco
      const db = await getDb();
      if (!db) { res.status(500).json({ error: "DB unavailable" }); return; }
      const { adminMediaFiles } = await import("../drizzle/schema");
      const slugNorm = (slug || "").toString().trim()
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
      const finalSlug = slugNorm || null;
      await db.insert(adminMediaFiles).values({
        name: file.originalname || "imagem",
        fileKey,
        url,
        mimeType: r.contentType,
        fileSize: file.size,
        videoSlug: finalSlug,
      });
      res.json({ success: true, url, fileKey, slug: finalSlug });
    } catch (err: any) {
      console.error("[UploadRoute] admin-image error:", err);
      res.status(500).json({ error: err?.message ?? "Upload failed" });
    }
  });

  // ─── CLIENT UPLOAD via JSON base64 (robusto em produção/celular) ──────────────
  // O browser comprime a imagem para JPEG e envia como base64 dentro de JSON.
  // O servidor decodifica e usa r2PutObject direto — SEM multer, SEM multipart.
  // Isso elimina a causa real das falhas de upload no celular:
  //   - parsing de multipart no proxy (Cloudflare/Cloud Run)
  //   - multer com memoryStorage e limites de body
  // Como a imagem é comprimida no cliente (~100-400KB), o base64 fica leve.
  app.post("/api/upload/client-file-base64", jsonParserBig, async (req: Request, res: Response) => {
    try {
      const { label, phone, data, mimeType, filename } = req.body || {};
      if (!label) { res.status(400).json({ error: "Missing label" }); return; }
      if (!data || typeof data !== "string") { res.status(400).json({ error: "No file data" }); return; }
      // Aceita tanto data URI ("data:image/jpeg;base64,....") quanto base64 puro
      const base64 = data.includes(",") ? data.slice(data.indexOf(",") + 1) : data;
      const buffer = Buffer.from(base64, "base64");
      if (buffer.length === 0) { res.status(400).json({ error: "Empty file" }); return; }
      if (buffer.length > 20 * 1024 * 1024) { res.status(400).json({ error: "Arquivo muito grande. Máximo 20MB." }); return; }
      const r = resolveFileExt(mimeType || "image/jpeg", filename);
      const safeLabel = makeSafeLabel(label);
      const safePhone = (phone || "desconhecido").replace(/\D/g, "").slice(-11);
      const randomSuffix = Math.random().toString(36).substring(2, 10);
      const fileKey = `order-docs/${safePhone}-${safeLabel}-${randomSuffix}.${r.ext}`;
      const { url } = await r2PutObject(fileKey, buffer, r.contentType);
      res.json({ success: true, fileUrl: url, fileKey, mimeType: r.contentType });
    } catch (err: any) {
      console.error("[UploadRoute] client-file-base64 error:", err);
      res.status(500).json({ error: err?.message ?? "Upload failed" });
    }
  });

  // ─── UPLOAD DO APK (admin only) ─────────────────────────────────────────────
  const uploadApkMw = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
  app.post('/api/upload/apk', uploadApkMw.single('file'), async (req: Request, res: Response) => {
    try {
      if (!isAdminRequest(req)) { res.status(401).json({ error: 'Unauthorized' }); return; }
      const file = req.file;
      if (!file) { res.status(400).json({ error: 'No file provided' }); return; }
      if (!file.originalname.toLowerCase().endsWith('.apk') && file.mimetype !== 'application/vnd.android.package-archive') {
        res.status(400).json({ error: 'Arquivo deve ser um .apk' }); return;
      }
      const r2Key = 'app/Colombiano.apk';
      const { url } = await r2PutObject(r2Key, file.buffer, 'application/vnd.android.package-archive');
      // Salvar metadados no banco
      const { saveApkRelease } = await import('./routers/apk');
      await saveApkRelease({ filename: 'Colombiano.apk', r2Key, publicUrl: url, fileSize: file.size });
      res.json({ success: true, url, downloadUrl: '/api/app/download', pageUrl: '/app', fileSize: file.size });
    } catch (err: any) {
      console.error('[UploadRoute] apk error:', err);
      res.status(500).json({ error: err?.message ?? 'Upload failed' });
    }
  });

  // ─── UPLOAD DO APK DRIVER PRO (admin only) ───────────────────────────────────────────
  app.post('/api/upload/apk-pro', uploadApkMw.single('file'), async (req: Request, res: Response) => {
    try {
      if (!isAdminRequest(req)) { res.status(401).json({ error: 'Unauthorized' }); return; }
      const file = req.file;
      if (!file) { res.status(400).json({ error: 'No file provided' }); return; }
      if (!file.originalname.toLowerCase().endsWith('.apk') && file.mimetype !== 'application/vnd.android.package-archive') {
        res.status(400).json({ error: 'Arquivo deve ser um .apk' }); return;
      }
      const r2Key = 'app/H2DriverPro.apk';
      const { url } = await r2PutObject(r2Key, file.buffer, 'application/vnd.android.package-archive');
      const { saveApkProRelease } = await import('./routers/apk');
      await saveApkProRelease({ filename: 'H2DriverPro.apk', r2Key, publicUrl: url, fileSize: file.size });
      res.json({ success: true, url, downloadUrl: '/api/app/download-pro', pageUrl: '/app-pro', fileSize: file.size });
    } catch (err: any) {
      console.error('[UploadRoute] apk-pro error:', err);
      res.status(500).json({ error: err?.message ?? 'Upload failed' });
    }
  });
}