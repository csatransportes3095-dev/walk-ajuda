import crypto from "crypto";
import { sql } from "drizzle-orm";
import {
  createAppointment,
  getAppointmentByOrder,
  getDb,
  getSetting,
  listAppointmentsByRegistration,
  upsertSetting,
} from "./db";
import { publicSiteUrl } from "../shared/publicLinks";

const AUTO_SCHEDULE_RULES_KEY = "auto_schedule_rules_v1";

export type AutoScheduleRule = {
  enabled: boolean;
  templateId: number | null;
};

export type AutoScheduleRules = {
  products: Record<string, AutoScheduleRule>;
  options: Record<string, AutoScheduleRule>;
};

const emptyRules = (): AutoScheduleRules => ({ products: {}, options: {} });

function normalizeRule(value: any): AutoScheduleRule {
  return {
    enabled: value?.enabled === true || value?.enabled === 1,
    templateId: Number.isInteger(Number(value?.templateId)) && Number(value?.templateId) > 0
      ? Number(value.templateId)
      : null,
  };
}

function normalizeRules(value: unknown): AutoScheduleRules {
  const base = emptyRules();
  if (!value || typeof value !== "object") return base;
  const raw = value as any;
  for (const [key, rule] of Object.entries(raw.products || {})) base.products[String(key)] = normalizeRule(rule);
  for (const [key, rule] of Object.entries(raw.options || {})) base.options[String(key)] = normalizeRule(rule);
  return base;
}

export async function getAutoScheduleRules(): Promise<AutoScheduleRules> {
  const raw = await getSetting(AUTO_SCHEDULE_RULES_KEY);
  if (!raw) return emptyRules();
  try {
    return normalizeRules(JSON.parse(raw));
  } catch {
    return emptyRules();
  }
}

export async function saveAutoScheduleRule(input: {
  scope: "product" | "option";
  id: number;
  enabled: boolean;
  templateId?: number | null;
}): Promise<AutoScheduleRules> {
  const rules = await getAutoScheduleRules();
  const target = input.scope === "option" ? rules.options : rules.products;
  target[String(input.id)] = {
    enabled: !!input.enabled,
    templateId: input.templateId && input.templateId > 0 ? input.templateId : null,
  };
  await upsertSetting(AUTO_SCHEDULE_RULES_KEY, JSON.stringify(rules));
  return rules;
}

export function resolveAutoScheduleRule(
  rules: AutoScheduleRules,
  productId?: number | null,
  optionId?: number | null,
): AutoScheduleRule | null {
  if (optionId && Object.prototype.hasOwnProperty.call(rules.options, String(optionId))) {
    return rules.options[String(optionId)];
  }
  if (productId && Object.prototype.hasOwnProperty.call(rules.products, String(productId))) {
    return rules.products[String(productId)];
  }
  return null;
}

function makeToken(): string {
  return crypto.randomBytes(16).toString("hex");
}

function normalizeText(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function baseOptionLabel(value: unknown): string {
  return String(value || "").split(" - Garantia:")[0].trim();
}

function isTerminalOrderStatus(value: unknown): boolean {
  const status = normalizeText(value).replace(/\s+/g, "_");
  return [
    "entregue",
    "cancelado",
    "recusado",
    "finalizado",
    "concluido",
    "conta_ativa",
  ].some((terminal) => status === terminal || status.startsWith(terminal + "_"));
}

export async function ensureAutomaticScheduleForOrder(input: {
  registrationId: number;
  subOrderIndex?: number;
  customerPhone: string;
  customerName?: string | null;
  customerEmail?: string | null;
  serviceName?: string | null;
  serviceOption?: string | null;
  productId?: number | null;
  optionId?: number | null;
}): Promise<{ token: string; url: string; created: boolean } | null> {
  if (!input.registrationId || !input.customerPhone) return null;

  const db = await getDb() as any;
  if (!db) return null;

  // Confirma no servidor que os IDs recebidos pertencem ao produto/opção realmente comprado.
  // Assim o navegador não consegue liberar agendamento usando o ID de outro produto ativo.
  let authoritativeProductId: number | null = null;
  let authoritativeOptionId: number | null = null;
  if (input.optionId) {
    const catalogResult = await db.execute(sql`
      SELECT p.id AS productId, p.name AS productName, po.id AS optionId, po.label AS optionLabel
      FROM productOptions po
      INNER JOIN products p ON p.id = po.productId
      WHERE po.id = ${input.optionId}
      LIMIT 1
    `);
    const item = ((catalogResult?.[0] || []) as Array<any>)[0];
    if (!item) return null;
    if (input.productId && Number(item.productId) !== Number(input.productId)) return null;
    if (normalizeText(item.productName) !== normalizeText(input.serviceName)) return null;
    if (normalizeText(item.optionLabel) !== normalizeText(baseOptionLabel(input.serviceOption))) return null;
    authoritativeProductId = Number(item.productId);
    authoritativeOptionId = Number(item.optionId);
  } else if (input.productId) {
    const catalogResult = await db.execute(sql`
      SELECT id, name FROM products WHERE id = ${input.productId} LIMIT 1
    `);
    const item = ((catalogResult?.[0] || []) as Array<any>)[0];
    if (!item || normalizeText(item.name) !== normalizeText(input.serviceName)) return null;
    authoritativeProductId = Number(item.id);
  } else {
    return null;
  }

  const rules = await getAutoScheduleRules();
  const rule = resolveAutoScheduleRule(rules, authoritativeProductId, authoritativeOptionId);
  if (!rule?.enabled) return null;

  // Cada envio de item já possui registrationId próprio; manter índice 0 preserva compatibilidade
  // com o gerador manual existente e evita duplicidade entre fluxo automático e manual.
  const subOrderIndex = 0;
  const existing = await getAppointmentByOrder(input.registrationId, subOrderIndex);
  if (existing) {
    return {
      token: existing.token,
      url: publicSiteUrl(`/agendar/${existing.token}`),
      created: false,
    };
  }

  const optionLabel = baseOptionLabel(input.serviceOption);
  const scheduleServiceName = [input.serviceName, optionLabel && optionLabel !== "N/A" ? optionLabel : ""]
    .filter(Boolean)
    .join(" - ");

  const appointment = await createAppointment({
    token: makeToken(),
    registrationId: input.registrationId,
    subOrderIndex,
    customerPhone: input.customerPhone,
    customerName: input.customerName ?? null,
    customerEmail: input.customerEmail ?? null,
    serviceName: scheduleServiceName || input.serviceName || "Agendamento",
    instructions: "Agendamento liberado automaticamente pelo produto.",
    templateId: rule.templateId,
  });

  return {
    token: appointment.token,
    url: publicSiteUrl(`/agendar/${appointment.token}`),
    created: true,
  };
}

export async function ensureAutomaticSchedulesForCustomer(phone: string): Promise<Array<{
  registrationId: number;
  token: string;
  url: string;
  serviceName: string | null;
  created: boolean;
}>> {
  const cleanPhone = String(phone || "").replace(/\D/g, "");
  if (cleanPhone.length < 10) return [];

  const db = await getDb() as any;
  if (!db) return [];

  const rules = await getAutoScheduleRules();
  const hasEnabledRule =
    Object.values(rules.products).some((rule) => rule.enabled) ||
    Object.values(rules.options).some((rule) => rule.enabled);
  if (!hasEnabledRule) return [];

  const [orderResult, catalogResult] = await Promise.all([
    db.execute(sql`
      SELECT id, registrationId, status, serviceName, serviceOption, createdAt
      FROM orderStatusHistory
      WHERE REGEXP_REPLACE(customerPhone, '[^0-9]', '') = ${cleanPhone}
      ORDER BY id ASC
    `),
    db.execute(sql`
      SELECT p.id AS productId, p.name AS productName,
             po.id AS optionId, po.label AS optionLabel
      FROM products p
      LEFT JOIN productOptions po ON po.productId = p.id
    `),
  ]);

  const orderRows = (orderResult?.[0] || []) as Array<any>;
  const catalogRows = (catalogResult?.[0] || []) as Array<any>;

  const orders = new Map<number, { registrationId: number; latestStatus: string; serviceName: string; serviceOption: string; firstId: number }>();
  for (const row of orderRows) {
    const registrationId = Number(row.registrationId || 0);
    if (!registrationId) continue;
    const current = orders.get(registrationId) || {
      registrationId,
      latestStatus: "",
      serviceName: "",
      serviceOption: "",
      firstId: Number(row.id || 0),
    };
    current.latestStatus = String(row.status || current.latestStatus || "");
    if (!current.serviceName && row.serviceName) current.serviceName = String(row.serviceName);
    if (!current.serviceOption && row.serviceOption) current.serviceOption = String(row.serviceOption);
    current.firstId = Math.min(current.firstId || Number(row.id || 0), Number(row.id || 0));
    orders.set(registrationId, current);
  }

  const normalizedCatalog = catalogRows.map((row) => ({
    productId: Number(row.productId || 0),
    productName: String(row.productName || ""),
    productKey: normalizeText(row.productName),
    optionId: row.optionId ? Number(row.optionId) : null,
    optionLabel: row.optionLabel ? String(row.optionLabel) : "",
    optionKey: normalizeText(row.optionLabel),
  }));

  const customerResult = await db.execute(sql`
    SELECT name, email FROM customers
    WHERE REGEXP_REPLACE(phone, '[^0-9]', '') = ${cleanPhone}
    LIMIT 1
  `);
  const customer = ((customerResult?.[0] || []) as Array<any>)[0] || {};

  const results: Array<{ registrationId: number; token: string; url: string; serviceName: string | null; created: boolean }> = [];

  for (const order of [...orders.values()].sort((a, b) => a.firstId - b.firstId)) {
    if (!order.serviceName || isTerminalOrderStatus(order.latestStatus)) continue;

    const serviceKey = normalizeText(order.serviceName);
    const optionKey = normalizeText(baseOptionLabel(order.serviceOption));
    const catalog = normalizedCatalog.find((item) =>
      item.productKey === serviceKey && (!!optionKey ? item.optionKey === optionKey : !item.optionId)
    ) || normalizedCatalog.find((item) => item.productKey === serviceKey && !item.optionId);

    if (!catalog) continue;

    const rule = resolveAutoScheduleRule(rules, catalog.productId, catalog.optionId);
    if (!rule?.enabled) continue;

    const existingAppointments = await listAppointmentsByRegistration(order.registrationId);
    const desiredName = [order.serviceName, baseOptionLabel(order.serviceOption)]
      .filter((part) => part && part !== "N/A")
      .join(" - ");
    const sameService = existingAppointments.find((appointment) =>
      normalizeText(appointment.serviceName) === normalizeText(desiredName)
    );
    const existing = sameService || existingAppointments[0];

    if (existing) {
      results.push({
        registrationId: order.registrationId,
        token: existing.token,
        url: publicSiteUrl(`/agendar/${existing.token}`),
        serviceName: existing.serviceName || desiredName || null,
        created: false,
      });
      continue;
    }

    const appointment = await createAppointment({
      token: makeToken(),
      registrationId: order.registrationId,
      subOrderIndex: 0,
      customerPhone: cleanPhone,
      customerName: customer.name || null,
      customerEmail: customer.email || null,
      serviceName: desiredName || order.serviceName,
      instructions: "Agendamento liberado automaticamente para pedido existente.",
      templateId: rule.templateId,
    });

    results.push({
      registrationId: order.registrationId,
      token: appointment.token,
      url: publicSiteUrl(`/agendar/${appointment.token}`),
      serviceName: appointment.serviceName || null,
      created: true,
    });
  }

  return results;
}
