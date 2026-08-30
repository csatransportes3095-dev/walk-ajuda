import { eq } from "drizzle-orm";
import { getDb } from "./db";
import {
  spreadsheetEarnings,
  spreadsheetExpenses,
  spreadsheetOperational,
  spreadsheetGoals,
  spreadsheetVehicleConfig,
} from "../drizzle/schema";

const FORMAT = "h2-spreadsheet-backup";
const VERSION = 1;
const MAX_ROWS_PER_SECTION = 25000;

function cleanMoney(value: unknown): string {
  const raw = String(value ?? "0").trim().replace(",", ".");
  const number = Number(raw.replace(/[^0-9.\-]/g, ""));
  if (!Number.isFinite(number)) return "0";
  return String(Math.round(number * 100) / 100);
}

function cleanText(value: unknown, max = 128): string {
  return String(value ?? "").trim().slice(0, max);
}

function cleanDate(value: unknown): string {
  const raw = String(value ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error("Data inválida no arquivo de backup.");
  return raw;
}

function cleanMonth(value: unknown): string {
  const raw = String(value ?? "").slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(raw)) throw new Error("Mês inválido no arquivo de backup.");
  return raw;
}

function cleanTime(value: unknown): string {
  const raw = cleanText(value, 8);
  if (!raw) return "";
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(raw)) return "";
  return raw.slice(0, 5);
}

function cleanCount(value: unknown): number {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.min(100000, Math.floor(number));
}

function boundedArray(value: unknown, name: string): any[] {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error(`Seção ${name} inválida.`);
  if (value.length > MAX_ROWS_PER_SECTION) throw new Error(`Seção ${name} excede o limite permitido.`);
  return value;
}

export async function buildSpreadsheetClientBackup(clientId: number) {
  const db = await getDb() as any;
  if (!db) throw new Error("Banco de dados indisponível");

  const [earnings, expenses, operational, goals, vehicleRows] = await Promise.all([
    db.select().from(spreadsheetEarnings).where(eq(spreadsheetEarnings.userId, clientId)),
    db.select().from(spreadsheetExpenses).where(eq(spreadsheetExpenses.userId, clientId)),
    db.select().from(spreadsheetOperational).where(eq(spreadsheetOperational.userId, clientId)),
    db.select().from(spreadsheetGoals).where(eq(spreadsheetGoals.userId, clientId)),
    db.select().from(spreadsheetVehicleConfig).where(eq(spreadsheetVehicleConfig.userId, clientId)).limit(1),
  ]);

  return {
    format: FORMAT,
    version: VERSION,
    createdAt: new Date().toISOString(),
    app: "H2 Colombiano - Planilha de Gastos",
    data: {
      earnings: earnings.map((row: any) => ({
        date: String(row.date).slice(0, 10),
        uber: row.uber ?? "0",
        ninetynine: row.ninetynine ?? "0",
        indrive: row.indrive ?? "0",
        particular: row.particular ?? "0",
        deliveries: row.deliveries ?? "0",
        tips: row.tips ?? "0",
        otherEarnings: row.otherEarnings ?? "0",
      })),
      expenses: expenses.map((row: any) => ({
        date: String(row.date).slice(0, 10),
        fuel: row.fuel ?? "0",
        carRental: row.carRental ?? "0",
        maintenance: row.maintenance ?? "0",
        oilChange: row.oilChange ?? "0",
        washing: row.washing ?? "0",
        insurance: row.insurance ?? "0",
        internetPhone: row.internetPhone ?? "0",
        food: row.food ?? "0",
        parking: row.parking ?? "0",
        tolls: row.tolls ?? "0",
        financing: row.financing ?? "0",
        fines: row.fines ?? "0",
        accessories: row.accessories ?? "0",
        otherExpenses: row.otherExpenses ?? "0",
      })),
      operational: operational.map((row: any) => ({
        date: String(row.date).slice(0, 10),
        kmInitial: row.kmInitial ?? "0",
        kmFinal: row.kmFinal ?? "0",
        timeInitial: row.timeInitial ?? "",
        timeFinal: row.timeFinal ?? "",
        rideCount: row.rideCount ?? 0,
        ridesUber: row.ridesUber ?? 0,
        rides99: row.rides99 ?? 0,
        ridesIndrive: row.ridesIndrive ?? 0,
        ridesParticular: row.ridesParticular ?? 0,
        ridesDeliveries: row.ridesDeliveries ?? 0,
      })),
      goals: goals.map((row: any) => ({
        month: row.month,
        dailyGoal: row.dailyGoal ?? "0",
        weeklyGoal: row.weeklyGoal ?? "0",
        monthlyGoal: row.monthlyGoal ?? "0",
      })),
      vehicleConfig: vehicleRows[0] ? {
        vehicleName: vehicleRows[0].vehicleName ?? "Meu Veículo",
        kmPerLiter: vehicleRows[0].kmPerLiter ?? "10",
        fuelPricePerLiter: vehicleRows[0].fuelPricePerLiter ?? "6",
        tankCapacityLiters: vehicleRows[0].tankCapacityLiters ?? "50",
        minRatePerKm: vehicleRows[0].minRatePerKm ?? "2",
        minRatePerMin: vehicleRows[0].minRatePerMin ?? "0.60",
      } : null,
    },
  };
}

export async function restoreSpreadsheetClientBackup(clientId: number, rawPayload: string) {
  if (!rawPayload || rawPayload.length > 15_000_000) throw new Error("Arquivo de backup inválido ou muito grande.");

  let payload: any;
  try {
    payload = JSON.parse(rawPayload);
  } catch {
    throw new Error("O arquivo selecionado não é um backup JSON válido.");
  }

  if (payload?.format !== FORMAT || Number(payload?.version) !== VERSION || !payload?.data) {
    throw new Error("Este arquivo não é um backup compatível da Planilha H2.");
  }

  const earnings = boundedArray(payload.data.earnings, "ganhos").map((row) => ({
    userId: clientId,
    date: cleanDate(row.date),
    uber: cleanMoney(row.uber),
    ninetynine: cleanMoney(row.ninetynine),
    indrive: cleanMoney(row.indrive),
    particular: cleanMoney(row.particular),
    deliveries: cleanMoney(row.deliveries),
    tips: cleanMoney(row.tips),
    otherEarnings: cleanMoney(row.otherEarnings),
  }));

  const expenses = boundedArray(payload.data.expenses, "gastos").map((row) => ({
    userId: clientId,
    date: cleanDate(row.date),
    fuel: cleanMoney(row.fuel),
    carRental: cleanMoney(row.carRental),
    maintenance: cleanMoney(row.maintenance),
    oilChange: cleanMoney(row.oilChange),
    washing: cleanMoney(row.washing),
    insurance: cleanMoney(row.insurance),
    internetPhone: cleanMoney(row.internetPhone),
    food: cleanMoney(row.food),
    parking: cleanMoney(row.parking),
    tolls: cleanMoney(row.tolls),
    financing: cleanMoney(row.financing),
    fines: cleanMoney(row.fines),
    accessories: cleanMoney(row.accessories),
    otherExpenses: cleanMoney(row.otherExpenses),
  }));

  const operational = boundedArray(payload.data.operational, "operacional").map((row) => ({
    userId: clientId,
    date: cleanDate(row.date),
    kmInitial: cleanMoney(row.kmInitial),
    kmFinal: cleanMoney(row.kmFinal),
    timeInitial: cleanTime(row.timeInitial),
    timeFinal: cleanTime(row.timeFinal),
    rideCount: cleanCount(row.rideCount),
    ridesUber: cleanCount(row.ridesUber),
    rides99: cleanCount(row.rides99),
    ridesIndrive: cleanCount(row.ridesIndrive),
    ridesParticular: cleanCount(row.ridesParticular),
    ridesDeliveries: cleanCount(row.ridesDeliveries),
  }));

  const goals = boundedArray(payload.data.goals, "metas").map((row) => ({
    userId: clientId,
    month: cleanMonth(row.month),
    dailyGoal: cleanMoney(row.dailyGoal),
    weeklyGoal: cleanMoney(row.weeklyGoal),
    monthlyGoal: cleanMoney(row.monthlyGoal),
  }));

  const vehicle = payload.data.vehicleConfig && typeof payload.data.vehicleConfig === "object"
    ? {
        userId: clientId,
        vehicleName: cleanText(payload.data.vehicleConfig.vehicleName || "Meu Veículo", 100),
        kmPerLiter: cleanMoney(payload.data.vehicleConfig.kmPerLiter || "10"),
        fuelPricePerLiter: cleanMoney(payload.data.vehicleConfig.fuelPricePerLiter || "6"),
        tankCapacityLiters: cleanMoney(payload.data.vehicleConfig.tankCapacityLiters || "50"),
        minRatePerKm: cleanMoney(payload.data.vehicleConfig.minRatePerKm || "2"),
        minRatePerMin: cleanMoney(payload.data.vehicleConfig.minRatePerMin || "0.60"),
      }
    : null;

  const db = await getDb() as any;
  if (!db) throw new Error("Banco de dados indisponível");

  await db.transaction(async (tx: any) => {
    await tx.delete(spreadsheetEarnings).where(eq(spreadsheetEarnings.userId, clientId));
    await tx.delete(spreadsheetExpenses).where(eq(spreadsheetExpenses.userId, clientId));
    await tx.delete(spreadsheetOperational).where(eq(spreadsheetOperational.userId, clientId));
    await tx.delete(spreadsheetGoals).where(eq(spreadsheetGoals.userId, clientId));
    await tx.delete(spreadsheetVehicleConfig).where(eq(spreadsheetVehicleConfig.userId, clientId));

    if (earnings.length) await tx.insert(spreadsheetEarnings).values(earnings);
    if (expenses.length) await tx.insert(spreadsheetExpenses).values(expenses);
    if (operational.length) await tx.insert(spreadsheetOperational).values(operational);
    if (goals.length) await tx.insert(spreadsheetGoals).values(goals);
    if (vehicle) await tx.insert(spreadsheetVehicleConfig).values(vehicle);
  });

  return {
    success: true,
    restored: {
      earnings: earnings.length,
      expenses: expenses.length,
      operational: operational.length,
      goals: goals.length,
      vehicleConfig: vehicle ? 1 : 0,
    },
  };
}
