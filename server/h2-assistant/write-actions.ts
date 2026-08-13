import { and, eq } from "drizzle-orm";
import { privateClients } from "../../drizzle/schema";
import { createEarning, createExpense, createGoal } from "../db";
import { createPrivateAppointment, createPrivateQuote } from "../private-transport/service";
import {
  completeAssistantAction,
  createAssistantAction,
  failAssistantAction,
  getAssistantAction,
  markAssistantActionRunning,
  type AssistantUserContext,
} from "./service";

type ConversationInput = { conversationId?: number };

type MonetaryDraft = ConversationInput & {
  date: string;
  category: string;
  amount: number;
};

type GoalDraft = ConversationInput & {
  month: string;
  dailyGoal?: number;
  weeklyGoal?: number;
  monthlyGoal: number;
};

type LocationStop = { address: string; latitude?: string | null; longitude?: string | null };

type AppointmentDraft = ConversationInput & {
  clientId: number;
  pickupAddress: string;
  pickupLat?: string | null;
  pickupLng?: string | null;
  destinationAddress: string;
  destinationLat?: string | null;
  destinationLng?: string | null;
  stops?: LocationStop[];
  startsAt: string;
  durationMinutes: number;
  returnAt?: string | null;
  tripType?: string;
  waitMinutes?: number;
  estimatedDistanceKm?: number;
  estimatedCost?: number;
  finalPrice?: number;
  recurrenceRule?: string | null;
  recurrenceUntil?: string | null;
};

type QuoteDraft = ConversationInput & {
  clientId: number;
  pickupAddress: string;
  pickupLat?: string | null;
  pickupLng?: string | null;
  destinationAddress: string;
  destinationLat?: string | null;
  destinationLng?: string | null;
  stops?: LocationStop[];
  appointmentAt?: string | null;
  returnAt?: string | null;
  tripType?: string;
  waitMinutes?: number;
  distanceToPickupKm?: number;
  passengerDistanceKm?: number;
  totalDistanceKm?: number;
  estimatedDurationMinutes?: number;
  estimatedFuelCost?: number;
  estimatedTolls?: number;
  estimatedParking?: number;
  estimatedOtherCosts?: number;
  estimatedCost?: number;
  recommendedPrice?: number;
  finalPrice: number;
  notes?: string;
};

type SupportedPayload =
  | { kind: "earning"; data: { date: string; field: string; categoryLabel: string; amount: number } }
  | { kind: "expense"; data: { date: string; field: string; categoryLabel: string; amount: number } }
  | { kind: "goal"; data: { month: string; dailyGoal: number; weeklyGoal: number; monthlyGoal: number } }
  | { kind: "appointment"; data: AppointmentDraft }
  | { kind: "quote"; data: QuoteDraft };

const EARNING_CATEGORIES: Record<string, { field: string; label: string }> = {
  uber: { field: "uber", label: "Uber" },
  "99": { field: "ninetynine", label: "99" },
  ninetynine: { field: "ninetynine", label: "99" },
  indrive: { field: "indrive", label: "inDrive" },
  particular: { field: "particular", label: "Particular" },
  delivery: { field: "deliveries", label: "Entregas" },
  deliveries: { field: "deliveries", label: "Entregas" },
  entrega: { field: "deliveries", label: "Entregas" },
  gorjeta: { field: "tips", label: "Gorjetas" },
  gorjetas: { field: "tips", label: "Gorjetas" },
  outros: { field: "otherEarnings", label: "Outros ganhos" },
  outro: { field: "otherEarnings", label: "Outros ganhos" },
};

const EXPENSE_CATEGORIES: Record<string, { field: string; label: string }> = {
  combustivel: { field: "fuel", label: "Combustível" },
  aluguel: { field: "carRental", label: "Aluguel do carro" },
  manutencao: { field: "maintenance", label: "Manutenção" },
  oleo: { field: "oilChange", label: "Troca de óleo" },
  lavagem: { field: "washing", label: "Lavagem" },
  seguro: { field: "insurance", label: "Seguro" },
  internet: { field: "internetPhone", label: "Internet e telefone" },
  telefone: { field: "internetPhone", label: "Internet e telefone" },
  alimentacao: { field: "food", label: "Alimentação" },
  estacionamento: { field: "parking", label: "Estacionamento" },
  pedagio: { field: "tolls", label: "Pedágio" },
  financiamento: { field: "financing", label: "Financiamento" },
  multa: { field: "fines", label: "Multas" },
  acessorios: { field: "accessories", label: "Acessórios" },
  outros: { field: "otherExpenses", label: "Outros gastos" },
  outro: { field: "otherExpenses", label: "Outros gastos" },
};

function normalize(value: string) {
  return String(value || "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function toMoney(value: number, field = "valor") {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0 || numberValue > 1_000_000) throw new Error(`Informe um ${field} válido entre R$ 0,01 e R$ 1.000.000,00.`);
  return Math.round(numberValue * 100) / 100;
}

function validateDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(new Date(`${value}T12:00:00`).getTime())) throw new Error("Informe a data no formato AAAA-MM-DD.");
  return value;
}

function validateMonth(value: string) {
  if (!/^\d{4}-\d{2}$/.test(value) || Number(value.slice(5)) < 1 || Number(value.slice(5)) > 12) throw new Error("Informe o mês no formato AAAA-MM.");
  return value;
}

function brl(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
}

function privateUser(ctx: AssistantUserContext) {
  return { db: ctx.db, userId: ctx.userId, clientName: ctx.client.name || "", clientPhone: ctx.client.phone || "" } as any;
}

async function activePassenger(ctx: AssistantUserContext, clientId: number) {
  const client = (await ctx.db.select({ id: privateClients.id, name: privateClients.name, phone: privateClients.phone, whatsapp: privateClients.whatsapp, isActive: privateClients.isActive }).from(privateClients).where(and(eq(privateClients.id, clientId), eq(privateClients.userId, ctx.userId))).limit(1))[0];
  if (!client || Number(client.isActive) !== 1) throw new Error("Escolha um passageiro ativo do H2 Particular.");
  return client;
}

function validateAddress(value: string, label: string) {
  const address = String(value || "").trim();
  if (address.length < 4 || address.length > 500) throw new Error(`Informe ${label} completo.`);
  return address;
}

function validateAppointmentDraft(input: AppointmentDraft): AppointmentDraft {
  const start = new Date(input.startsAt);
  if (Number.isNaN(start.getTime())) throw new Error("Informe data e horário válidos para o agendamento.");
  const durationMinutes = Math.round(Number(input.durationMinutes));
  if (!Number.isFinite(durationMinutes) || durationMinutes < 10 || durationMinutes > 1_440) throw new Error("A duração deve ser de 10 a 1.440 minutos.");
  const waitMinutes = Math.max(0, Math.min(1_440, Math.round(Number(input.waitMinutes || 0))));
  const tripType = ["ONE_WAY", "ROUND_TRIP", "RETURN", "IDA_VOLTA"].includes(String(input.tripType || "ONE_WAY")) ? String(input.tripType || "ONE_WAY") : "ONE_WAY";
  const recurrenceRule = ["NONE", "DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY"].includes(String(input.recurrenceRule || "NONE")) ? String(input.recurrenceRule || "NONE") : "NONE";
  return { ...input, clientId: Math.trunc(input.clientId), pickupAddress: validateAddress(input.pickupAddress, "o endereço de busca"), destinationAddress: validateAddress(input.destinationAddress, "o destino"), durationMinutes, waitMinutes, tripType, recurrenceRule };
}

function validateQuoteDraft(input: QuoteDraft): QuoteDraft {
  const finalPrice = toMoney(input.finalPrice, "valor final");
  const appointmentAt = input.appointmentAt ? new Date(input.appointmentAt) : null;
  if (input.appointmentAt && Number.isNaN(appointmentAt?.getTime())) throw new Error("Informe data e horário válidos para o orçamento.");
  return { ...input, clientId: Math.trunc(input.clientId), pickupAddress: validateAddress(input.pickupAddress, "a origem"), destinationAddress: validateAddress(input.destinationAddress, "o destino"), finalPrice };
}

export async function draftCreateExpense(ctx: AssistantUserContext, input: MonetaryDraft) {
  const category = EXPENSE_CATEGORIES[normalize(input.category)];
  if (!category) throw new Error("Categoria de gasto não reconhecida. Escolha uma categoria da Planilha.");
  const payload: SupportedPayload = { kind: "expense", data: { date: validateDate(input.date), field: category.field, categoryLabel: category.label, amount: toMoney(input.amount) } };
  const action = await createAssistantAction(ctx, { conversationId: input.conversationId, actionType: "CREATE_EXPENSE", toolName: "spreadsheet.createExpense", riskLevel: "NORMAL", payload, summary: `Criar gasto de ${brl(payload.data.amount)} em ${payload.data.categoryLabel} no dia ${payload.data.date}.` });
  return { type: "preview" as const, action, title: "Prévia de gasto", message: `Revise o gasto de ${brl(payload.data.amount)} em ${payload.data.categoryLabel}. Ele só será salvo após você confirmar.`, preview: payload.data };
}

export async function draftCreateEarning(ctx: AssistantUserContext, input: MonetaryDraft) {
  const category = EARNING_CATEGORIES[normalize(input.category)];
  if (!category) throw new Error("Categoria de ganho não reconhecida. Escolha uma categoria da Planilha.");
  const payload: SupportedPayload = { kind: "earning", data: { date: validateDate(input.date), field: category.field, categoryLabel: category.label, amount: toMoney(input.amount) } };
  const action = await createAssistantAction(ctx, { conversationId: input.conversationId, actionType: "CREATE_EARNING", toolName: "spreadsheet.createEarning", riskLevel: "NORMAL", payload, summary: `Criar ganho de ${brl(payload.data.amount)} em ${payload.data.categoryLabel} no dia ${payload.data.date}.` });
  return { type: "preview" as const, action, title: "Prévia de ganho", message: `Revise o ganho de ${brl(payload.data.amount)} em ${payload.data.categoryLabel}. Ele só será salvo após você confirmar.`, preview: payload.data };
}

export async function draftCreateGoal(ctx: AssistantUserContext, input: GoalDraft) {
  const payload: SupportedPayload = { kind: "goal", data: { month: validateMonth(input.month), dailyGoal: input.dailyGoal ? toMoney(input.dailyGoal, "meta diária") : 0, weeklyGoal: input.weeklyGoal ? toMoney(input.weeklyGoal, "meta semanal") : 0, monthlyGoal: toMoney(input.monthlyGoal, "meta mensal") } };
  const action = await createAssistantAction(ctx, { conversationId: input.conversationId, actionType: "CREATE_GOAL", toolName: "spreadsheet.createGoal", riskLevel: "NORMAL", payload, summary: `Definir metas de ${payload.data.month}: diária ${brl(payload.data.dailyGoal)}, semanal ${brl(payload.data.weeklyGoal)} e mensal ${brl(payload.data.monthlyGoal)}.` });
  return { type: "preview" as const, action, title: "Prévia de metas", message: "Revise as metas. Esta ação atualiza as metas do mês somente após sua confirmação.", preview: payload.data };
}

export async function draftCreateAppointment(ctx: AssistantUserContext, input: AppointmentDraft) {
  const data = validateAppointmentDraft(input);
  const passenger = await activePassenger(ctx, data.clientId);
  const payload: SupportedPayload = { kind: "appointment", data };
  const action = await createAssistantAction(ctx, { conversationId: input.conversationId, actionType: "CREATE_PRIVATE_APPOINTMENT", toolName: "privateTransport.createAppointment", riskLevel: "NORMAL", payload, summary: `Criar agendamento para ${passenger.name}: ${formatDateTime(data.startsAt)}, de ${data.pickupAddress} para ${data.destinationAddress}, por ${brl(Number(data.finalPrice || 0))}.` });
  return { type: "preview" as const, action, title: "Prévia de agendamento", message: `Revise o agendamento de ${passenger.name}. O horário será conferido novamente no momento da confirmação.`, preview: { ...data, passengerName: passenger.name } };
}

export async function draftCreateQuote(ctx: AssistantUserContext, input: QuoteDraft) {
  const data = validateQuoteDraft(input);
  const passenger = await activePassenger(ctx, data.clientId);
  const payload: SupportedPayload = { kind: "quote", data };
  const action = await createAssistantAction(ctx, { conversationId: input.conversationId, actionType: "CREATE_PRIVATE_QUOTE", toolName: "privateTransport.createQuote", riskLevel: "NORMAL", payload, summary: `Criar orçamento para ${passenger.name}, de ${data.pickupAddress} para ${data.destinationAddress}, no valor de ${brl(data.finalPrice)}.` });
  return { type: "preview" as const, action, title: "Prévia de orçamento", message: `Revise o orçamento de ${brl(data.finalPrice)} para ${passenger.name}. Ele só será criado após sua confirmação.`, preview: { ...data, passengerName: passenger.name } };
}

function parsePayload(raw: string | null): SupportedPayload {
  if (!raw) throw new Error("A prévia não possui dados válidos.");
  const payload = JSON.parse(raw) as SupportedPayload;
  if (!payload || !["earning", "expense", "goal", "appointment", "quote"].includes((payload as any).kind)) throw new Error("Tipo de ação não permitido.");
  return payload;
}

export async function executeConfirmedAction(ctx: AssistantUserContext, actionId: number) {
  const transition = await markAssistantActionRunning(ctx, actionId);
  if (transition.alreadyCompleted) return { actionId, status: "CONCLUIDA", alreadyCompleted: true };

  try {
    const payload = parsePayload(transition.action.payloadJson);
    let result: unknown;
    if (payload.kind === "earning") {
      result = await createEarning({ userId: ctx.userId, date: payload.data.date, [payload.data.field]: String(payload.data.amount) } as any);
    } else if (payload.kind === "expense") {
      result = await createExpense({ userId: ctx.userId, date: payload.data.date, [payload.data.field]: String(payload.data.amount) } as any);
    } else if (payload.kind === "goal") {
      result = await createGoal({ userId: ctx.userId, ...payload.data, dailyGoal: String(payload.data.dailyGoal), weeklyGoal: String(payload.data.weeklyGoal), monthlyGoal: String(payload.data.monthlyGoal) } as any);
    } else if (payload.kind === "appointment") {
      result = await createPrivateAppointment(privateUser(ctx), payload.data as any);
    } else {
      result = await createPrivateQuote(privateUser(ctx), payload.data as any);
    }
    await completeAssistantAction(ctx, actionId, result);
    return { actionId, status: "CONCLUIDA", message: "Ação confirmada e registrada com sucesso.", result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível concluir a ação.";
    await failAssistantAction(ctx, actionId, message);
    throw new Error(message);
  }
}

export async function getActionPreview(ctx: AssistantUserContext, actionId: number) {
  const action = await getAssistantAction(ctx, actionId);
  return { ...action, payload: parsePayload(action.payloadJson) };
}
