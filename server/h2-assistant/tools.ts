import { sql } from "drizzle-orm";
import { getPrivateDashboard, listPrivateAppointments, listPrivateClients } from "../private-transport/service";
import type { AssistantUserContext } from "./service";

export type AssistantNavigationTarget =
  | "gastos" | "ganhos" | "operacional" | "metas" | "graficos"
  | "emprestimos" | "analisador" | "particular" | "cartoes";

export type AssistantReadTool =
  | "finance_today"
  | "finance_month"
  | "goal_month"
  | "private_dashboard"
  | "private_tomorrow"
  | "private_client_search";

const navigationLabels: Record<AssistantNavigationTarget, { label: string; path: string }> = {
  gastos: { label: "Gastos", path: "/gastos" },
  ganhos: { label: "Ganhos", path: "/gastos" },
  operacional: { label: "Operacional", path: "/gastos" },
  metas: { label: "Metas", path: "/gastos" },
  graficos: { label: "Gráficos", path: "/gastos" },
  emprestimos: { label: "Empréstimos", path: "/gastos" },
  analisador: { label: "Analisador", path: "/gastos" },
  particular: { label: "H2 Particular", path: "/gastos" },
  cartoes: { label: "Cartões", path: "/cartoes" },
};

function brazilDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function brazilMonth() {
  return brazilDate().slice(0, 7);
}

function sumNumber(row: any, key: string) {
  return Number(row?.[key] || 0);
}

function brl(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

export function getNavigationTarget(value: string): AssistantNavigationTarget | null {
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (normalized.includes("cart")) return "cartoes";
  if (normalized.includes("emprest")) return "emprestimos";
  if (normalized.includes("graf")) return "graficos";
  if (normalized.includes("meta")) return "metas";
  if (normalized.includes("operac")) return "operacional";
  if (normalized.includes("analisa")) return "analisador";
  if (normalized.includes("particular") || normalized.includes("passageiro")) return "particular";
  if (normalized.includes("ganho") || normalized.includes("receita")) return "ganhos";
  if (normalized.includes("gasto") || normalized.includes("despesa")) return "gastos";
  return null;
}

export function createNavigationResult(target: AssistantNavigationTarget) {
  const definition = navigationLabels[target];
  return {
    type: "navigation" as const,
    target,
    path: definition.path,
    title: `Abrir ${definition.label}`,
    message: `Vou abrir ${definition.label}.`,
  };
}

export async function executeReadTool(ctx: AssistantUserContext, tool: AssistantReadTool, args?: { search?: string }) {
  const today = brazilDate();
  const month = brazilMonth();

  if (tool === "finance_today" || tool === "finance_month") {
    const dateFilter = tool === "finance_today" ? `date = '${today}'` : `date LIKE '${month}%'`;
    const [earningRows, expenseRows] = await Promise.all([
      ctx.db.execute(sql.raw(`SELECT
        COALESCE(SUM(CAST(uber AS DECIMAL(14,2)) + CAST(ninetynine AS DECIMAL(14,2)) + CAST(indrive AS DECIMAL(14,2)) + CAST(particular AS DECIMAL(14,2)) + CAST(deliveries AS DECIMAL(14,2)) + CAST(tips AS DECIMAL(14,2)) + CAST(otherEarnings AS DECIMAL(14,2))), 0) AS total
        FROM spreadsheetEarnings WHERE userId = ${ctx.userId} AND ${dateFilter}`)),
      ctx.db.execute(sql.raw(`SELECT
        COALESCE(SUM(CAST(fuel AS DECIMAL(14,2)) + CAST(carRental AS DECIMAL(14,2)) + CAST(maintenance AS DECIMAL(14,2)) + CAST(oilChange AS DECIMAL(14,2)) + CAST(washing AS DECIMAL(14,2)) + CAST(insurance AS DECIMAL(14,2)) + CAST(internetPhone AS DECIMAL(14,2)) + CAST(food AS DECIMAL(14,2)) + CAST(parking AS DECIMAL(14,2)) + CAST(tolls AS DECIMAL(14,2)) + CAST(financing AS DECIMAL(14,2)) + CAST(fines AS DECIMAL(14,2)) + CAST(accessories AS DECIMAL(14,2)) + CAST(otherExpenses AS DECIMAL(14,2))), 0) AS total
        FROM spreadsheetExpenses WHERE userId = ${ctx.userId} AND ${dateFilter}`)),
    ]);
    const earnings = sumNumber((earningRows[0] || earningRows)[0], "total");
    const expenses = sumNumber((expenseRows[0] || expenseRows)[0], "total");
    const period = tool === "finance_today" ? "hoje" : "neste mês";
    return {
      type: "answer" as const,
      tool,
      title: `Resumo financeiro — ${period}`,
      data: { earnings, expenses, profit: earnings - expenses, period: tool === "finance_today" ? today : month },
      message: `${period[0].toUpperCase()}${period.slice(1)}, você teve ${brl(earnings)} em ganhos, ${brl(expenses)} em gastos e ${brl(earnings - expenses)} de resultado.`,
    };
  }

  if (tool === "goal_month") {
    const rows = await ctx.db.execute(sql.raw(`SELECT dailyGoal, weeklyGoal, monthlyGoal FROM spreadsheetGoals WHERE userId = ${ctx.userId} AND month = '${month}' LIMIT 1`));
    const goal = (rows[0] || rows)[0] || {};
    return {
      type: "answer" as const,
      tool,
      title: "Metas do mês",
      data: { month, dailyGoal: sumNumber(goal, "dailyGoal"), weeklyGoal: sumNumber(goal, "weeklyGoal"), monthlyGoal: sumNumber(goal, "monthlyGoal") },
      message: `Sua meta mensal é ${brl(sumNumber(goal, "monthlyGoal"))}; meta semanal ${brl(sumNumber(goal, "weeklyGoal"))} e diária ${brl(sumNumber(goal, "dailyGoal"))}.`,
    };
  }

  if (tool === "private_dashboard") {
    const dashboard = await getPrivateDashboard({ db: ctx.db, userId: ctx.userId, clientName: ctx.client.name || "", clientPhone: ctx.client.phone || "" } as any);
    return {
      type: "answer" as const,
      tool,
      title: "H2 Particular",
      data: dashboard,
      message: `No H2 Particular, você tem ${Number((dashboard as any).receivablesCount || 0)} recebível(is) pendente(s) e ${brl(Number((dashboard as any).receivableAmount || 0))} a receber.`,
    };
  }

  if (tool === "private_tomorrow") {
    const tomorrowDate = new Date(`${today}T12:00:00`);
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrow = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(tomorrowDate);
    const appointments = await listPrivateAppointments({ db: ctx.db, userId: ctx.userId, clientName: ctx.client.name || "", clientPhone: ctx.client.phone || "" } as any, { from: `${tomorrow}T00:00:00`, to: `${tomorrow}T23:59:59`, limit: 30 });
    const items = Array.isArray(appointments) ? appointments : [];
    return {
      type: "answer" as const,
      tool,
      title: "Particular amanhã",
      data: { date: tomorrow, appointments: items },
      message: items.length ? `Você tem ${items.length} agendamento(s) de particular amanhã.` : "Você não tem agendamentos de particular para amanhã.",
    };
  }

  if (tool === "private_client_search") {
    const search = String(args?.search || "").trim();
    if (search.length < 2) throw new Error("Informe pelo menos duas letras do nome ou dois números do telefone.");
    const result = await listPrivateClients({ db: ctx.db, userId: ctx.userId, clientName: ctx.client.name || "", clientPhone: ctx.client.phone || "" } as any, { search, limit: 10, offset: 0, filter: "all" });
    const clients = Array.isArray(result) ? result : (result as any).items || [];
    return {
      type: "answer" as const,
      tool,
      title: "Passageiros encontrados",
      data: { search, clients },
      message: clients.length ? `Encontrei ${clients.length} passageiro(s) para “${search}”.` : `Não encontrei passageiro para “${search}”.`,
    };
  }

  throw new Error("Ferramenta de consulta não permitida.");
}

export const assistantToolCatalog = {
  finance_today: { readOnly: true, title: "Resumo financeiro de hoje" },
  finance_month: { readOnly: true, title: "Resumo financeiro do mês" },
  goal_month: { readOnly: true, title: "Metas do mês" },
  private_dashboard: { readOnly: true, title: "Resumo H2 Particular" },
  private_tomorrow: { readOnly: true, title: "Agenda particular de amanhã" },
  private_client_search: { readOnly: true, title: "Busca de passageiro particular" },
  navigate: { readOnly: true, title: "Navegação segura de módulo" },
} as const;
