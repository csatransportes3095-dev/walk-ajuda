import crypto from "crypto";
import { sql } from "drizzle-orm";
import { completeOpenAppointmentsForOrder, createAppointment, deleteAppointment, getAppointmentByOrder, getDb, getLatestOrderStatus, getStatusLabelFromDb } from "./db";
import { findMainCustomerByIdentity, normalizeCustomerPhone } from "./customerAccess";
import { publicSiteUrl } from "../shared/publicLinks";
import { sendMailDirect } from "./_core/sendMailDirect";

const SCHEDULE_CLOSED_STATUSES = new Set([
  "foto_em_anal", "foto_em_analise", "foto_analise",
  "documentos_aprovados", "foto_aprovada", "foto_perfil_aprovada",
  "aguardando_ativa", "aguardando_ficar_ativa",
  "conta_ativa", "p", "entregue", "pedido_entregue", "cancelado",
]);

type AutomaticScheduleOption = {
  id: number;
  productId: number;
  label: string;
  productName: string | null;
  autoScheduleEnabled: number;
};

export type AutomaticScheduleResult = {
  created: boolean;
  appointmentId?: number;
  token?: string;
  url?: string;
  registrationId?: number;
  optionId?: number;
};

function normalizeLabel(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function baseServiceOptionLabel(value: unknown): string {
  let raw = String(value || "").trim();
  raw = raw.split(/\s+-\s+Garantia\s*:/i)[0] || raw;
  raw = raw.split(/\s+—\s+/)[0] || raw;
  return raw.trim();
}

async function isScheduleClosedStatus(status: unknown): Promise<boolean> {
  const key = String(status || "").trim();
  if (!key) return false;
  let label = key;
  try { label = await getStatusLabelFromDb(key); } catch {}
  const semantic = normalizeLabel(label).replace(/[_-]+/g, " ");
  if (semantic === "em analise") return false;
  if (semantic === "foto em analise") return true;
  return SCHEDULE_CLOSED_STATUSES.has(key);
}

async function notifyAutomaticScheduleByEmail(input: {
  email?: string | null;
  customerName?: string | null;
  serviceName?: string | null;
  url: string;
}): Promise<void> {
  const email = String(input.email || "").trim();
  if (!email) return;
  try {
    await sendMailDirect({
      from: '"H2 COLOMBIANO" <h2@h2colombiano.com>',
      to: email,
      subject: "Novo agendamento liberado — H2 COLOMBIANO",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#0a0a18;color:#fff;border-radius:14px">
          <h2 style="margin:0 0 12px;color:#e879f9">Novo agendamento liberado</h2>
          <p style="margin:0 0 12px;color:#ddd">Olá${input.customerName ? `, <strong>${input.customerName}</strong>` : ""}!</p>
          <p style="margin:0 0 12px;color:#ccc">Um novo agendamento foi liberado para o seu pedido${input.serviceName ? ` de <strong>${input.serviceName}</strong>` : ""}.</p>
          <p style="margin:20px 0;text-align:center">
            <a href="${input.url}" style="display:inline-block;background:#a855f7;color:#fff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:10px">Escolher data e horário</a>
          </p>
          <p style="margin:0;color:#888;font-size:12px">O mesmo agendamento também fica disponível em Acompanhar Pedido e no botão de Agendamento da vitrine.</p>
        </div>
      `,
    });
  } catch (error) {
    console.error("[AutoSchedule] Agendamento criado, mas o e-mail do novo link falhou:", error);
  }
}

async function loadAutomaticOptionById(optionId: number): Promise<AutomaticScheduleOption | null> {
  const db = await getDb() as any;
  if (!db || !Number.isInteger(optionId) || optionId <= 0) return null;
  const result = await db.execute(sql`
    SELECT po.id, po.productId, po.label, po.autoScheduleEnabled, p.name AS productName
    FROM productOptions po
    LEFT JOIN products p ON p.id = po.productId
    WHERE po.id = ${optionId} AND po.autoScheduleEnabled = 1
    LIMIT 1
  `);
  return ((result[0] || []) as AutomaticScheduleOption[])[0] || null;
}

async function loadAutomaticOptions(): Promise<AutomaticScheduleOption[]> {
  const db = await getDb() as any;
  if (!db) return [];
  const result = await db.execute(sql`
    SELECT po.id, po.productId, po.label, po.autoScheduleEnabled, p.name AS productName
    FROM productOptions po
    LEFT JOIN products p ON p.id = po.productId
    WHERE po.autoScheduleEnabled = 1
  `);
  return (result[0] || []) as AutomaticScheduleOption[];
}

export function findAutomaticOption(
  options: AutomaticScheduleOption[],
  serviceName: unknown,
  serviceOption: unknown,
): AutomaticScheduleOption | null {
  const optionLabel = normalizeLabel(baseServiceOptionLabel(serviceOption));
  const service = normalizeLabel(serviceName);

  // Pedidos antigos podem não ter serviceOption gravado. Nesse caso só é seguro
  // inferir o agendamento quando o produto exato possui UMA única opção automática.
  if (!optionLabel) {
    if (!service) return null;
    const productCandidates = options.filter((option) => normalizeLabel(option.productName) === service);
    return productCandidates.length === 1 ? productCandidates[0] : null;
  }

  const candidates = options.filter((option) => normalizeLabel(option.label) === optionLabel);
  if (candidates.length === 0) return null;

  // Quando o pedido antigo traz o produto, ele também precisa coincidir.
  // Evita, por exemplo, que duas vitrines com a opção "Nome Completo"
  // recebam agendamento uma da outra.
  if (service) {
    const exactProduct = candidates.find((option) => normalizeLabel(option.productName) === service);
    if (exactProduct) return exactProduct;
    // Pedidos antigos guardam o nome do produto como texto. Esse nome pode ter
    // sido renomeado no ADM depois da compra, embora a opção continue sendo a
    // mesma. Quando o rótulo da opção identifica um único card automático, ele
    // é seguro e deve receber o link retroativo. Só recusamos quando existem
    // dois cards automáticos com o mesmo rótulo, pois aí o produto é necessário
    // para evitar associar o pedido ao card errado.
    return candidates.length === 1 ? candidates[0] : null;
  }

  return candidates.length === 1 ? candidates[0] : null;
}

export async function ensureAutomaticScheduleForOrder(input: {
  registrationId: number;
  customerPhone: string;
  optionId: number;
  customerName?: string | null;
  customerEmail?: string | null;
  serviceName?: string | null;
  subOrderIndex?: number;
}): Promise<AutomaticScheduleResult> {
  const registrationId = Number(input.registrationId);
  const optionId = Number(input.optionId);
  const subOrderIndex = Number.isInteger(input.subOrderIndex) ? Number(input.subOrderIndex) : 0;
  const customerPhone = normalizeCustomerPhone(input.customerPhone);

  if (!Number.isInteger(registrationId) || registrationId <= 0 || !customerPhone) return { created: false };
  const option = await loadAutomaticOptionById(optionId);
  if (!option) return { created: false, registrationId, optionId };

  const latestStatus = await getLatestOrderStatus(registrationId);
  if (latestStatus && await isScheduleClosedStatus(latestStatus.status)) {
    return { created: false, registrationId, optionId };
  }

  // Só um agendamento ATIVO impede nova criação. Histórico completed/cancelled
  // não bloqueia um novo ciclo; ao reabrir o fluxo ele é removido antes do novo token.
  const existing = await getAppointmentByOrder(registrationId, subOrderIndex);
  if (existing && (existing.status === "pending" || existing.status === "confirmed")) {
    return {
      created: false,
      appointmentId: existing.id,
      token: existing.token,
      url: publicSiteUrl(`/agendar/${existing.token}`),
      registrationId,
      optionId,
    };
  }
  if (existing && (existing.status === "completed" || existing.status === "cancelled")) {
    await deleteAppointment(existing.id);
  }

  let customerName = input.customerName ?? null;
  let customerEmail = input.customerEmail ?? null;
  let customerPhotoUrl: string | null = null;
  try {
    const db = await getDb() as any;
    if (db) {
      const customer = await findMainCustomerByIdentity({ phone: customerPhone }, db);
      customerName = customerName || customer?.name || null;
      customerEmail = customerEmail || customer?.email || null;
      customerPhotoUrl = customer?.profilePhotoUrl || null;
    }
  } catch {
    // Dados de identificacao sao complementares; a agenda ainda pode ser criada.
  }

  const token = crypto.randomBytes(16).toString("hex");
  const appointment = await createAppointment({
    token,
    registrationId,
    subOrderIndex,
    customerPhone,
    customerName,
    customerEmail,
    customerPhotoUrl,
    serviceName: input.serviceName || [option.productName, option.label].filter(Boolean).join(" — "),
    templateId: null,
  });

  return {
    created: true,
    appointmentId: appointment.id,
    token: appointment.token,
    url: publicSiteUrl(`/agendar/${appointment.token}`),
    registrationId,
    optionId,
  };
}

export async function regenerateScheduleForOrder(input: {
  registrationId: number;
  customerPhone: string;
  customerName?: string | null;
  customerEmail?: string | null;
  serviceName?: string | null;
  subOrderIndex?: number;
  optionId?: number;
  notifyCustomer?: boolean;
}): Promise<AutomaticScheduleResult> {
  const registrationId = Number(input.registrationId);
  const subOrderIndex = Number.isInteger(input.subOrderIndex) ? Number(input.subOrderIndex) : 0;
  const customerPhone = normalizeCustomerPhone(input.customerPhone);
  if (!Number.isInteger(registrationId) || registrationId <= 0 || !customerPhone) {
    return { created: false };
  }

  // Regeneração explícita: finaliza qualquer agenda aberta deste mesmo
  // pedido/subpedido e remove o registro finalizado antes de gerar um token NOVO.
  // Nunca usa fallback por telefone para não afetar outro pedido do cliente.
  await completeOpenAppointmentsForOrder(registrationId, subOrderIndex, customerPhone, false);
  const previous = await getAppointmentByOrder(registrationId, subOrderIndex);
  if (previous && (previous.status === "completed" || previous.status === "cancelled")) {
    await deleteAppointment(previous.id);
  }

  let customerName = input.customerName ?? null;
  let customerEmail = input.customerEmail ?? null;
  let customerPhotoUrl: string | null = null;
  try {
    const db = await getDb() as any;
    if (db) {
      const customer = await findMainCustomerByIdentity({ phone: customerPhone }, db);
      customerName = customerName || customer?.name || null;
      customerEmail = customerEmail || customer?.email || null;
      customerPhotoUrl = customer?.profilePhotoUrl || null;
    }
  } catch {
    // Dados de identificacao sao complementares; a agenda ainda pode ser criada.
  }

  const token = crypto.randomBytes(16).toString("hex");
  const appointment = await createAppointment({
    token,
    registrationId,
    subOrderIndex,
    customerPhone,
    customerName,
    customerEmail,
    customerPhotoUrl,
    serviceName: input.serviceName ?? null,
    templateId: null,
  });

  const url = publicSiteUrl(`/agendar/${appointment.token}`);
  if (input.notifyCustomer) {
    await notifyAutomaticScheduleByEmail({
      email: customerEmail,
      customerName,
      serviceName: input.serviceName,
      url,
    });
  }

  return {
    created: true,
    appointmentId: appointment.id,
    token: appointment.token,
    url,
    registrationId,
    optionId: input.optionId,
  };
}

export async function ensureActiveAutomaticScheduleForAnalysis(input: {
  registrationId: number;
  customerPhone: string;
  serviceName?: string | null;
  serviceOption?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  subOrderIndex?: number;
}): Promise<AutomaticScheduleResult> {
  const registrationId = Number(input.registrationId);
  const subOrderIndex = Number.isInteger(input.subOrderIndex) ? Number(input.subOrderIndex) : 0;
  const customerPhone = normalizeCustomerPhone(input.customerPhone);
  if (!Number.isInteger(registrationId) || registrationId <= 0 || !customerPhone) {
    return { created: false };
  }

  const automaticOptions = await loadAutomaticOptions();
  const option = findAutomaticOption(automaticOptions, input.serviceName, input.serviceOption);
  if (!option) {
    console.warn('[AutoSchedule] EM ANÁLISE sem opção automática compatível:', {
      registrationId,
      subOrderIndex,
      serviceName: input.serviceName || null,
      serviceOption: input.serviceOption || null,
    });
    return { created: false, registrationId };
  }

  // Invariante de EM ANÁLISE: se já existe agenda ativa, não duplica.
  // Se a última agenda está completed/cancelled (ou não existe), cria link NOVO.
  const existing = await getAppointmentByOrder(registrationId, subOrderIndex);
  if (existing && (existing.status === 'pending' || existing.status === 'confirmed')) {
    return {
      created: false,
      appointmentId: existing.id,
      token: existing.token,
      url: publicSiteUrl(`/agendar/${existing.token}`),
      registrationId,
      optionId: option.id,
    };
  }

  return regenerateScheduleForOrder({
    registrationId,
    customerPhone,
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    serviceName: input.serviceName || [option.productName, option.label].filter(Boolean).join(" — "),
    subOrderIndex,
    optionId: option.id,
    notifyCustomer: true,
  });
}

export async function regenerateAutomaticScheduleForOrder(input: {
  registrationId: number;
  customerPhone: string;
  serviceName?: string | null;
  serviceOption?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  subOrderIndex?: number;
}): Promise<AutomaticScheduleResult> {
  const automaticOptions = await loadAutomaticOptions();
  const option = findAutomaticOption(automaticOptions, input.serviceName, input.serviceOption);
  if (!option) {
    // Ao trocar produto ou voltar para Em Análise, um link antigo não pode
    // permanecer ativo quando a nova opção não possui agendamento automático.
    await completeOpenAppointmentsForOrder(
      Number(input.registrationId),
      Number.isInteger(input.subOrderIndex) ? Number(input.subOrderIndex) : 0,
      input.customerPhone,
      false,
    );
    return { created: false, registrationId: Number(input.registrationId) };
  }

  return regenerateScheduleForOrder({
    registrationId: input.registrationId,
    customerPhone: input.customerPhone,
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    serviceName: input.serviceName || [option.productName, option.label].filter(Boolean).join(" — "),
    subOrderIndex: input.subOrderIndex,
    optionId: option.id,
    notifyCustomer: true,
  });
}

export async function syncAutomaticSchedulesForCustomer(phoneInput: string): Promise<AutomaticScheduleResult[]> {
  const db = await getDb() as any;
  const phone = normalizeCustomerPhone(phoneInput);
  if (!db || !phone) return [];

  const automaticOptions = await loadAutomaticOptions();
  if (automaticOptions.length === 0) return [];

  const result = await db.execute(sql`
    SELECT id, registrationId, customerPhone, status, serviceName, serviceOption, createdAt
    FROM orderStatusHistory
    WHERE REGEXP_REPLACE(customerPhone, '[^0-9]', '') IN (${phone}, ${"55" + phone})
    ORDER BY registrationId DESC, id DESC
  `);
  const rows = (result[0] || []) as any[];
  if (rows.length === 0) return [];

  const byRegistration = new Map<number, any[]>();
  for (const row of rows) {
    const registrationId = Number(row.registrationId || 0);
    if (!registrationId) continue;
    const group = byRegistration.get(registrationId) || [];
    group.push(row);
    byRegistration.set(registrationId, group);
  }

  const customer = await findMainCustomerByIdentity({ phone }, db);
  const created: AutomaticScheduleResult[] = [];

  for (const [registrationId, history] of byRegistration.entries()) {
    const latest = history[0];
    if (!latest || await isScheduleClosedStatus(latest.status)) continue;

    const orderInfo = [...history].reverse().find((entry) => entry.serviceOption || entry.serviceName) || latest;
    const option = findAutomaticOption(automaticOptions, orderInfo.serviceName, orderInfo.serviceOption);
    if (!option) continue;

    const schedule = await ensureAutomaticScheduleForOrder({
      registrationId,
      customerPhone: phone,
      optionId: option.id,
      customerName: customer?.name || null,
      customerEmail: customer?.email || null,
      serviceName: orderInfo.serviceName || [option.productName, option.label].filter(Boolean).join(" — "),
      subOrderIndex: 0,
    });
    if (schedule.created) created.push(schedule);
  }

  return created;
}


export type AutomaticScheduleBackfillSummary = {
  options: number;
  scannedOrders: number;
  matchedOrders: number;
  created: number;
  existing: number;
  skippedClosed: number;
  errors: number;
};

export async function backfillAutomaticSchedulesForOption(optionIdInput: number): Promise<AutomaticScheduleBackfillSummary> {
  const db = await getDb() as any;
  const optionId = Number(optionIdInput);
  const summary: AutomaticScheduleBackfillSummary = {
    options: 0,
    scannedOrders: 0,
    matchedOrders: 0,
    created: 0,
    existing: 0,
    skippedClosed: 0,
    errors: 0,
  };
  if (!db || !Number.isInteger(optionId) || optionId <= 0) return summary;

  const option = await loadAutomaticOptionById(optionId);
  if (!option) return summary;
  summary.options = 1;

  const result = await db.execute(sql`
    SELECT id, registrationId, customerPhone, status, serviceName, serviceOption, createdAt
    FROM orderStatusHistory
    ORDER BY registrationId DESC, id DESC
  `);
  const rows = (result[0] || []) as any[];
  if (rows.length === 0) return summary;

  const byRegistration = new Map<number, any[]>();
  for (const row of rows) {
    const registrationId = Number(row.registrationId || 0);
    if (!registrationId) continue;
    const group = byRegistration.get(registrationId) || [];
    group.push(row);
    byRegistration.set(registrationId, group);
  }

  const customerCache = new Map<string, any>();

  for (const [registrationId, history] of byRegistration.entries()) {
    summary.scannedOrders++;
    const latest = history[0];
    if (!latest) continue;
    if (await isScheduleClosedStatus(latest.status)) {
      summary.skippedClosed++;
      continue;
    }

    const orderInfo = [...history].reverse().find((entry) => entry.serviceOption || entry.serviceName) || latest;
    const matchedOption = findAutomaticOption([option], orderInfo.serviceName, orderInfo.serviceOption);
    if (!matchedOption) continue;

    const phone = normalizeCustomerPhone(orderInfo.customerPhone || latest.customerPhone);
    if (!phone) continue;
    summary.matchedOrders++;

    try {
      let customer = customerCache.get(phone);
      if (customer === undefined) {
        customer = await findMainCustomerByIdentity({ phone }, db);
        customerCache.set(phone, customer || null);
      }

      const schedule = await ensureAutomaticScheduleForOrder({
        registrationId,
        customerPhone: phone,
        optionId: option.id,
        customerName: customer?.name || null,
        customerEmail: customer?.email || null,
        serviceName: orderInfo.serviceName || [option.productName, option.label].filter(Boolean).join(" — "),
        subOrderIndex: 0,
      });

      if (schedule.created) summary.created++;
      else if (schedule.token) summary.existing++;
    } catch (error) {
      summary.errors++;
      console.error(`[AutoSchedule] Falha no retroativo do pedido ${registrationId} / opção ${option.id}:`, error);
    }
  }

  return summary;
}

export async function backfillAllAutomaticSchedules(): Promise<AutomaticScheduleBackfillSummary> {
  const options = await loadAutomaticOptions();
  const total: AutomaticScheduleBackfillSummary = {
    options: options.length,
    scannedOrders: 0,
    matchedOrders: 0,
    created: 0,
    existing: 0,
    skippedClosed: 0,
    errors: 0,
  };

  for (const option of options) {
    const result = await backfillAutomaticSchedulesForOption(option.id);
    total.scannedOrders += result.scannedOrders;
    total.matchedOrders += result.matchedOrders;
    total.created += result.created;
    total.existing += result.existing;
    total.skippedClosed += result.skippedClosed;
    total.errors += result.errors;
  }

  return total;
}
