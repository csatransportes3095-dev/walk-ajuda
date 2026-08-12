import { and, asc, desc, eq, like, or, sql } from "drizzle-orm";
import { randomBytes } from "crypto";
import { getDb } from "../db";
import { requireCompleteMainCustomerProfile } from "../customerIdentity";
import { findMainCustomerByIdentity, getRouteAccess, normalizeCustomerCpf, normalizeCustomerPhone } from "../customerAccess";
import {
  privateAppointments,
  privateClients,
  privateEvents,
  privateSettings,
  privateTrips,
  spreadsheetClients,
  spreadsheetSessions,
  spreadsheetVehicleConfig,
} from "../../drizzle/schema";

export const PRIVATE_TRIP_STATUSES = [
  "ORÇAMENTO", "AGUARDANDO CONFIRMAÇÃO", "AGENDADA", "CONFIRMADA", "MOTORISTA A CAMINHO",
  "AGUARDANDO PASSAGEIRO", "EM VIAGEM", "CONCLUÍDA", "CANCELADA", "NÃO COMPARECEU",
] as const;

export const PRIVATE_PAYMENT_STATUSES = ["PENDENTE", "PARCIAL", "PAGO"] as const;

export type PrivateTransportUser = {
  userId: number;
  clientName: string;
  clientPhone: string;
  db: any;
};

type JsonObject = Record<string, unknown>;

let infrastructureReady = false;
let infrastructurePromise: Promise<void> | null = null;

function rows(result: any): any[] {
  return (result?.[0] || result || []) as any[];
}

function money(value: unknown): number {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function asDateOnly(value: Date = new Date()): string {
  const timezoneOffset = value.getTimezoneOffset() * 60000;
  return new Date(value.getTime() - timezoneOffset).toISOString().slice(0, 10);
}

function quoteCodeFromId(id: number, prefix: "CLI" | "ORC" | "REC"): string {
  return `${prefix}-${String(id).padStart(6, "0")}`;
}

export function createPublicToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Cria as tabelas novas sem alterar ou excluir estruturas existentes. */
export async function ensurePrivateTransportInfrastructure(dbArg?: any): Promise<void> {
  if (infrastructureReady) return;
  if (infrastructurePromise) return infrastructurePromise;
  infrastructurePromise = (async () => {
    const db = dbArg || await getDb() as any;
    if (!db) throw new Error("Banco de dados indisponível");
    const statements = [
      `CREATE TABLE IF NOT EXISTS privateClients (
        id INT AUTO_INCREMENT PRIMARY KEY, userId INT NOT NULL, clientCode VARCHAR(24) NOT NULL UNIQUE,
        name VARCHAR(160) NOT NULL, phone VARCHAR(32) NOT NULL, phoneNormalized VARCHAR(16) NOT NULL,
        whatsapp VARCHAR(32) NULL, cpf VARCHAR(14) NULL, cpfNormalized VARCHAR(11) NULL, email VARCHAR(320) NULL,
        addressLine VARCHAR(255) NULL, addressNumber VARCHAR(32) NULL, addressComplement VARCHAR(128) NULL,
        neighborhood VARCHAR(128) NULL, city VARCHAR(128) NULL, state VARCHAR(2) NULL, zipCode VARCHAR(10) NULL,
        referencePoint VARCHAR(255) NULL, latitude DECIMAL(10,7) NULL, longitude DECIMAL(10,7) NULL, notes TEXT NULL,
        isFavorite TINYINT NOT NULL DEFAULT 0, isFrequent TINYINT NOT NULL DEFAULT 0, isActive TINYINT NOT NULL DEFAULT 1,
        deactivatedAt DATETIME NULL, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY private_client_user_phone_unique (userId, phoneNormalized),
        KEY private_client_user_active_name (userId, isActive, name), KEY private_client_user_cpf (userId, cpfNormalized)
      )`,
      `CREATE TABLE IF NOT EXISTS privateSettings (
        id INT AUTO_INCREMENT PRIMARY KEY, userId INT NOT NULL UNIQUE, driverName VARCHAR(160) NULL, driverPhone VARCHAR(32) NULL,
        driverCpf VARCHAR(14) NULL, driverCity VARCHAR(128) NULL, vehicleName VARCHAR(120) NULL, vehicleModel VARCHAR(120) NULL,
        vehiclePlate VARCHAR(16) NULL, pixKey VARCHAR(160) NULL, logoUrl VARCHAR(1024) NULL,
        minFare DECIMAL(12,2) NOT NULL DEFAULT 0, minRatePerKm DECIMAL(12,2) NOT NULL DEFAULT 0,
        ratePerHour DECIMAL(12,2) NOT NULL DEFAULT 0, ratePerMinute DECIMAL(12,2) NOT NULL DEFAULT 0,
        waitRatePerMinute DECIMAL(12,2) NOT NULL DEFAULT 0, profitMarginPercent DECIMAL(8,2) NOT NULL DEFAULT 0,
        overnightSurcharge DECIMAL(12,2) NOT NULL DEFAULT 0, airportSurcharge DECIMAL(12,2) NOT NULL DEFAULT 0,
        holidaySurcharge DECIMAL(12,2) NOT NULL DEFAULT 0, longTripSurcharge DECIMAL(12,2) NOT NULL DEFAULT 0,
        tollPolicy VARCHAR(16) NOT NULL DEFAULT 'separate', appointmentBufferMinutes INT NOT NULL DEFAULT 30,
        reminderMinutesJson TEXT NULL, frequentTripThreshold INT NOT NULL DEFAULT 5, quoteValidityHours INT NOT NULL DEFAULT 48,
        receiptFooter TEXT NULL, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS privateQuotes (
        id INT AUTO_INCREMENT PRIMARY KEY, userId INT NOT NULL, clientId INT NOT NULL, quoteCode VARCHAR(24) NOT NULL UNIQUE,
        publicToken VARCHAR(96) NOT NULL UNIQUE, publicLinkEnabled TINYINT NOT NULL DEFAULT 1, publicLinkExpiresAt DATETIME NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'RASCUNHO', clientNameSnapshot VARCHAR(160) NOT NULL, clientPhoneSnapshot VARCHAR(32) NULL,
        pickupAddress TEXT NOT NULL, pickupLat DECIMAL(10,7) NULL, pickupLng DECIMAL(10,7) NULL,
        destinationAddress TEXT NOT NULL, destinationLat DECIMAL(10,7) NULL, destinationLng DECIMAL(10,7) NULL,
        stopsJson TEXT NULL, appointmentAt DATETIME NULL, returnAt DATETIME NULL, tripType VARCHAR(24) NOT NULL DEFAULT 'ONE_WAY', waitMinutes INT NOT NULL DEFAULT 0,
        distanceToPickupKm DECIMAL(12,3) NOT NULL DEFAULT 0, passengerDistanceKm DECIMAL(12,3) NOT NULL DEFAULT 0,
        totalDistanceKm DECIMAL(12,3) NOT NULL DEFAULT 0, estimatedDurationMinutes INT NOT NULL DEFAULT 0,
        estimatedFuelCost DECIMAL(12,2) NOT NULL DEFAULT 0, estimatedTolls DECIMAL(12,2) NOT NULL DEFAULT 0,
        estimatedParking DECIMAL(12,2) NOT NULL DEFAULT 0, estimatedOtherCosts DECIMAL(12,2) NOT NULL DEFAULT 0,
        estimatedCost DECIMAL(12,2) NOT NULL DEFAULT 0, recommendedPrice DECIMAL(12,2) NOT NULL DEFAULT 0,
        finalPrice DECIMAL(12,2) NOT NULL DEFAULT 0, acceptedAt DATETIME NULL, convertedAppointmentId INT NULL, notes TEXT NULL,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY private_quote_user_status_date (userId, status, appointmentAt), KEY private_quote_user_client (userId, clientId)
      )`,
      `CREATE TABLE IF NOT EXISTS privateAppointments (
        id INT AUTO_INCREMENT PRIMARY KEY, userId INT NOT NULL, clientId INT NOT NULL, quoteId INT NULL, parentAppointmentId INT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'AGENDADA', clientNameSnapshot VARCHAR(160) NOT NULL, clientPhoneSnapshot VARCHAR(32) NULL,
        pickupAddress TEXT NOT NULL, pickupLat DECIMAL(10,7) NULL, pickupLng DECIMAL(10,7) NULL,
        destinationAddress TEXT NOT NULL, destinationLat DECIMAL(10,7) NULL, destinationLng DECIMAL(10,7) NULL,
        stopsJson TEXT NULL, startsAt DATETIME NOT NULL, endsAt DATETIME NULL, returnAt DATETIME NULL,
        tripType VARCHAR(24) NOT NULL DEFAULT 'ONE_WAY', waitMinutes INT NOT NULL DEFAULT 0,
        estimatedDistanceKm DECIMAL(12,3) NOT NULL DEFAULT 0, estimatedDurationMinutes INT NOT NULL DEFAULT 0,
        estimatedCost DECIMAL(12,2) NOT NULL DEFAULT 0, finalPrice DECIMAL(12,2) NOT NULL DEFAULT 0,
        recurrenceRule VARCHAR(32) NULL, recurrenceUntil DATETIME NULL, cancellationReason TEXT NULL,
        cancelledAt DATETIME NULL, cancelledBy VARCHAR(32) NULL, noShowFee DECIMAL(12,2) NOT NULL DEFAULT 0,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY private_appointment_user_start (userId, startsAt), KEY private_appointment_user_client (userId, clientId), KEY private_appointment_user_status (userId, status)
      )`,
      `CREATE TABLE IF NOT EXISTS privateTrips (
        id INT AUTO_INCREMENT PRIMARY KEY, userId INT NOT NULL, clientId INT NOT NULL, appointmentId INT NULL, quoteId INT NULL,
        status VARCHAR(40) NOT NULL DEFAULT 'AGENDADA', clientNameSnapshot VARCHAR(160) NOT NULL, clientPhoneSnapshot VARCHAR(32) NULL,
        pickupAddress TEXT NOT NULL, destinationAddress TEXT NOT NULL, stopsJson TEXT NULL, startedAt DATETIME NULL, completedAt DATETIME NULL,
        cancelledAt DATETIME NULL, cancellationReason TEXT NULL, estimatedDistanceKm DECIMAL(12,3) NOT NULL DEFAULT 0,
        actualDistanceKm DECIMAL(12,3) NULL, estimatedCost DECIMAL(12,2) NOT NULL DEFAULT 0,
        combinedAmount DECIMAL(12,2) NOT NULL DEFAULT 0, additionalAmount DECIMAL(12,2) NOT NULL DEFAULT 0,
        discountAmount DECIMAL(12,2) NOT NULL DEFAULT 0, finalAmount DECIMAL(12,2) NOT NULL DEFAULT 0,
        paymentStatus VARCHAR(24) NOT NULL DEFAULT 'PENDENTE', paidAmount DECIMAL(12,2) NOT NULL DEFAULT 0,
        remainingAmount DECIMAL(12,2) NOT NULL DEFAULT 0, incomePostedAt DATETIME NULL, incomeDate VARCHAR(10) NULL,
        incomeReference VARCHAR(96) NULL, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY private_trip_user_status (userId, status), KEY private_trip_user_client (userId, clientId), KEY private_trip_appointment (userId, appointmentId)
      )`,
      `CREATE TABLE IF NOT EXISTS privateTripStops (
        id INT AUTO_INCREMENT PRIMARY KEY, userId INT NOT NULL, tripId INT NULL, appointmentId INT NULL, quoteId INT NULL,
        sortOrder INT NOT NULL DEFAULT 0, address TEXT NOT NULL, latitude DECIMAL(10,7) NULL, longitude DECIMAL(10,7) NULL,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, KEY private_stop_user_trip (userId, tripId),
        KEY private_stop_user_appointment (userId, appointmentId), KEY private_stop_user_quote (userId, quoteId)
      )`,
      `CREATE TABLE IF NOT EXISTS privatePayments (
        id INT AUTO_INCREMENT PRIMARY KEY, userId INT NOT NULL, tripId INT NOT NULL, amount DECIMAL(12,2) NOT NULL,
        paymentMethod VARCHAR(32) NOT NULL DEFAULT 'PIX', paidAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, notes TEXT NULL,
        reversedAt DATETIME NULL, reversalReason TEXT NULL, incomeEarningId INT NULL, incomePostedAt DATETIME NULL,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY private_payment_user_trip (userId, tripId), KEY private_payment_user_date (userId, paidAt)
      )`,
      `CREATE TABLE IF NOT EXISTS privateReceipts (
        id INT AUTO_INCREMENT PRIMARY KEY, userId INT NOT NULL, tripId INT NOT NULL, paymentId INT NULL,
        receiptCode VARCHAR(24) NOT NULL UNIQUE, publicToken VARCHAR(96) NOT NULL UNIQUE, publicLinkEnabled TINYINT NOT NULL DEFAULT 1,
        pdfUrl VARCHAR(1024) NULL, amount DECIMAL(12,2) NOT NULL, paymentMethod VARCHAR(32) NOT NULL, paidAt DATETIME NOT NULL,
        snapshotJson TEXT NULL, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY private_receipt_user_trip (userId, tripId)
      )`,
      `CREATE TABLE IF NOT EXISTS privateEvents (
        id INT AUTO_INCREMENT PRIMARY KEY, userId INT NOT NULL, clientId INT NULL, quoteId INT NULL, appointmentId INT NULL,
        tripId INT NULL, receiptId INT NULL, eventType VARCHAR(64) NOT NULL, message TEXT NOT NULL, metadataJson TEXT NULL,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, KEY private_event_user_client_date (userId, clientId, createdAt),
        KEY private_event_user_date (userId, createdAt)
      )`,
    ];
    try {
      for (const statement of statements) await db.execute(sql.raw(statement));
      // Compatibilidade para instalações iniciadas antes do vínculo financeiro idempotente.
      for (const statement of [
        "ALTER TABLE privatePayments ADD COLUMN incomeEarningId INT NULL",
        "ALTER TABLE privatePayments ADD COLUMN incomePostedAt DATETIME NULL",
      ]) { try { await db.execute(sql.raw(statement)); } catch (_) {} }
      infrastructureReady = true;
    } catch (error) {
      infrastructurePromise = null;
      throw error;
    }
  })();
  return infrastructurePromise;
}

/** Resolve uma sessão válida da Planilha e impede acesso entre motoristas. */
export async function resolvePrivateTransportUser(token: string): Promise<PrivateTransportUser> {
  const db = await getDb() as any;
  if (!db) throw new Error("Banco de dados indisponível");
  await ensurePrivateTransportInfrastructure(db);
  const cleanToken = String(token || "").trim();
  if (!cleanToken) throw new Error("Sessão inválida. Entre novamente na Planilha de Gastos.");
  const session = (await db.select().from(spreadsheetSessions).where(eq(spreadsheetSessions.token, cleanToken)).limit(1))[0];
  if (!session || new Date(session.expiresAt) < new Date()) throw new Error("Sessão inválida ou expirada. Entre novamente.");
  const client = (await db.select().from(spreadsheetClients).where(eq(spreadsheetClients.id, session.clientId)).limit(1))[0];
  if (!client) throw new Error("Cadastro da Planilha não encontrado.");
  await requireCompleteMainCustomerProfile(db, { phone: client.phone || "", cpf: client.cpf || "" });
  const mainCustomer = await findMainCustomerByIdentity({ phone: client.phone || "", cpf: client.cpf || "" }, db);
  if (!mainCustomer) throw new Error("Conclua o cadastro principal para utilizar o H2 Particular.");
  const access = await getRouteAccess(mainCustomer.id, db);
  if (access.restricted && !access.routes.includes("gastos")) throw new Error("Acesso à Planilha de Gastos não está liberado.");
  return { userId: Number(session.clientId), clientName: String(client.name || "Motorista"), clientPhone: String(client.phone || ""), db };
}

export async function getPrivateSettings(user: PrivateTransportUser): Promise<any> {
  const current = (await user.db.select().from(privateSettings).where(eq(privateSettings.userId, user.userId)).limit(1))[0];
  if (current) return current;
  const vehicle = (await user.db.select().from(spreadsheetVehicleConfig).where(eq(spreadsheetVehicleConfig.userId, user.userId)).limit(1))[0];
  await user.db.insert(privateSettings).values({
    userId: user.userId,
    driverName: user.clientName,
    driverPhone: user.clientPhone,
    vehicleName: vehicle?.vehicleName || null,
    minRatePerKm: vehicle?.minRatePerKm || "0",
    ratePerMinute: vehicle?.minRatePerMin || "0",
    waitRatePerMinute: vehicle?.minRatePerMin || "0",
    reminderMinutesJson: JSON.stringify([1440, 60, 30]),
  });
  return (await user.db.select().from(privateSettings).where(eq(privateSettings.userId, user.userId)).limit(1))[0];
}

export async function logPrivateEvent(user: PrivateTransportUser, input: {
  eventType: string; message: string; clientId?: number; quoteId?: number; appointmentId?: number; tripId?: number; receiptId?: number; metadata?: JsonObject;
}) {
  await user.db.insert(privateEvents).values({
    userId: user.userId, clientId: input.clientId || null, quoteId: input.quoteId || null,
    appointmentId: input.appointmentId || null, tripId: input.tripId || null, receiptId: input.receiptId || null,
    eventType: input.eventType, message: input.message, metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
  });
}

export async function listPrivateClients(user: PrivateTransportUser, input?: { search?: string; filter?: string; limit?: number; offset?: number }) {
  const search = String(input?.search || "").trim();
  const normalizedSearch = normalizeCustomerPhone(search);
  const raw = await user.db.select().from(privateClients)
    .where(eq(privateClients.userId, user.userId)).orderBy(desc(privateClients.isFavorite), asc(privateClients.name));
  const filtered = raw.filter((client: any) => {
    if (input?.filter === "favorites" && client.isFavorite !== 1) return false;
    if (input?.filter === "active" && client.isActive !== 1) return false;
    if (input?.filter === "inactive" && client.isActive !== 0) return false;
    if (!search) return true;
    const lower = search.toLowerCase();
    return String(client.name || "").toLowerCase().includes(lower)
      || String(client.phoneNormalized || "").includes(normalizedSearch || search.replace(/\D/g, ""))
      || String(client.cpfNormalized || "").includes(normalizeCustomerCpf(search));
  });
  const offset = Math.max(0, Number(input?.offset || 0));
  const limit = Math.min(100, Math.max(1, Number(input?.limit || 30)));
  return { total: filtered.length, items: filtered.slice(offset, offset + limit) };
}

export async function createPrivateClient(user: PrivateTransportUser, input: {
  name: string; phone: string; whatsapp?: string; cpf?: string; email?: string; addressLine?: string; addressNumber?: string;
  addressComplement?: string; neighborhood?: string; city?: string; state?: string; zipCode?: string; referencePoint?: string;
  latitude?: string | null; longitude?: string | null; notes?: string;
}) {
  const name = String(input.name || "").trim();
  const phoneNormalized = normalizeCustomerPhone(input.phone);
  if (name.length < 2) throw new Error("Informe o nome completo do passageiro.");
  if (!phoneNormalized) throw new Error("Informe um telefone válido com DDD.");
  const duplicate = (await user.db.select().from(privateClients).where(and(eq(privateClients.userId, user.userId), eq(privateClients.phoneNormalized, phoneNormalized))).limit(1))[0];
  if (duplicate) return { duplicate: true, client: duplicate };
  const pendingCode = `PENDING-${createPublicToken().slice(0, 16)}`;
  const cpfNormalized = input.cpf ? normalizeCustomerCpf(input.cpf) || null : null;
  const inserted = await user.db.insert(privateClients).values({
    userId: user.userId, clientCode: pendingCode, name, phone: input.phone, phoneNormalized,
    whatsapp: input.whatsapp || input.phone, cpf: input.cpf || null, cpfNormalized, email: input.email || null,
    addressLine: input.addressLine || null, addressNumber: input.addressNumber || null, addressComplement: input.addressComplement || null,
    neighborhood: input.neighborhood || null, city: input.city || null, state: input.state || null, zipCode: input.zipCode || null,
    referencePoint: input.referencePoint || null, latitude: input.latitude || null, longitude: input.longitude || null, notes: input.notes || null,
  });
  const clientId = Number((inserted as any)[0]?.insertId);
  const clientCode = quoteCodeFromId(clientId, "CLI");
  await user.db.update(privateClients).set({ clientCode }).where(and(eq(privateClients.id, clientId), eq(privateClients.userId, user.userId)));
  const client = (await user.db.select().from(privateClients).where(and(eq(privateClients.id, clientId), eq(privateClients.userId, user.userId))).limit(1))[0];
  await logPrivateEvent(user, { eventType: "CLIENT_CREATED", message: `Passageiro ${name} cadastrado`, clientId });
  return { duplicate: false, client };
}

export async function updatePrivateClient(user: PrivateTransportUser, clientId: number, input: Partial<{
  name: string; phone: string; whatsapp: string; cpf: string; email: string; addressLine: string; addressNumber: string; addressComplement: string;
  neighborhood: string; city: string; state: string; zipCode: string; referencePoint: string; latitude: string | null; longitude: string | null;
  notes: string; isFavorite: boolean; isActive: boolean;
}>) {
  const current = (await user.db.select().from(privateClients).where(and(eq(privateClients.id, clientId), eq(privateClients.userId, user.userId))).limit(1))[0];
  if (!current) throw new Error("Passageiro não encontrado.");
  const payload: Record<string, any> = {};
  if (input.name !== undefined) payload.name = String(input.name).trim();
  if (input.phone !== undefined) {
    const phoneNormalized = normalizeCustomerPhone(input.phone);
    if (!phoneNormalized) throw new Error("Telefone inválido.");
    const duplicate = (await user.db.select().from(privateClients).where(and(eq(privateClients.userId, user.userId), eq(privateClients.phoneNormalized, phoneNormalized))).limit(1))[0];
    if (duplicate && Number(duplicate.id) !== clientId) throw new Error(`Este telefone já está cadastrado para ${duplicate.name}.`);
    payload.phone = input.phone; payload.phoneNormalized = phoneNormalized;
  }
  if (input.cpf !== undefined) { payload.cpf = input.cpf || null; payload.cpfNormalized = input.cpf ? normalizeCustomerCpf(input.cpf) || null : null; }
  for (const key of ["whatsapp", "email", "addressLine", "addressNumber", "addressComplement", "neighborhood", "city", "state", "zipCode", "referencePoint", "latitude", "longitude", "notes"] as const) {
    if (input[key] !== undefined) payload[key] = input[key] || null;
  }
  if (input.isFavorite !== undefined) payload.isFavorite = input.isFavorite ? 1 : 0;
  if (input.isActive !== undefined) { payload.isActive = input.isActive ? 1 : 0; payload.deactivatedAt = input.isActive ? null : new Date(); }
  await user.db.update(privateClients).set(payload).where(and(eq(privateClients.id, clientId), eq(privateClients.userId, user.userId)));
  const updated = (await user.db.select().from(privateClients).where(and(eq(privateClients.id, clientId), eq(privateClients.userId, user.userId))).limit(1))[0];
  await logPrivateEvent(user, { eventType: input.isActive === false ? "CLIENT_DEACTIVATED" : "CLIENT_UPDATED", message: `Cadastro de ${updated.name} atualizado`, clientId });
  return updated;
}

export function calculatePrivateTripPrice(input: {
  settings: any; vehicle: any; distanceKm: number; durationMinutes: number; waitMinutes?: number; tolls?: number; parking?: number; otherCosts?: number;
  overnight?: boolean; airport?: boolean; holiday?: boolean; longTrip?: boolean;
}) {
  const distanceKm = Math.max(0, money(input.distanceKm));
  const durationMinutes = Math.max(0, Math.round(Number(input.durationMinutes || 0)));
  const waitMinutes = Math.max(0, Math.round(Number(input.waitMinutes || 0)));
  const fuelPrice = money(input.vehicle?.fuelPricePerLiter);
  const kmPerLiter = money(input.vehicle?.kmPerLiter);
  const fuelCost = kmPerLiter > 0 ? money((distanceKm / kmPerLiter) * fuelPrice) : 0;
  const tolls = money(input.tolls); const parking = money(input.parking); const otherCosts = money(input.otherCosts);
  const waitCost = money(waitMinutes * money(input.settings?.waitRatePerMinute));
  const estimatedCost = money(fuelCost + tolls + parking + otherCosts + waitCost);
  const byKm = money(distanceKm * money(input.settings?.minRatePerKm));
  const byTime = money(durationMinutes * money(input.settings?.ratePerMinute));
  const minimumBase = Math.max(money(input.settings?.minFare), byKm, byTime);
  const marginValue = money(estimatedCost * (money(input.settings?.profitMarginPercent) / 100));
  const surcharges = money((input.overnight ? money(input.settings?.overnightSurcharge) : 0)
    + (input.airport ? money(input.settings?.airportSurcharge) : 0)
    + (input.holiday ? money(input.settings?.holidaySurcharge) : 0)
    + (input.longTrip ? money(input.settings?.longTripSurcharge) : 0));
  const recommendedPrice = money(Math.max(minimumBase, estimatedCost + marginValue) + surcharges);
  return { distanceKm, durationMinutes, waitMinutes, fuelCost, tolls, parking, otherCosts, waitCost, estimatedCost, minimumBase, marginValue, surcharges, recommendedPrice };
}

export function getPriceQuality(finalPrice: number, estimatedCost: number): { key: string; label: string; profit: number } {
  const profit = money(finalPrice - estimatedCost);
  if (profit < 0) return { key: "below_cost", label: "Preço abaixo do custo", profit };
  const ratio = estimatedCost > 0 ? profit / estimatedCost : 1;
  if (ratio < 0.2) return { key: "low", label: "Margem baixa", profit };
  if (ratio < 0.6) return { key: "good", label: "Boa margem", profit };
  return { key: "excellent", label: "Excelente margem", profit };
}

export async function listPrivateEvents(user: PrivateTransportUser, clientId?: number) {
  const records = clientId
    ? await user.db.select().from(privateEvents).where(and(eq(privateEvents.userId, user.userId), eq(privateEvents.clientId, clientId))).orderBy(desc(privateEvents.createdAt))
    : await user.db.select().from(privateEvents).where(eq(privateEvents.userId, user.userId)).orderBy(desc(privateEvents.createdAt));
  return records.slice(0, 200);
}

export function localDateOnly(): string { return asDateOnly(); }


export async function updatePrivateSettings(user: PrivateTransportUser, input: Partial<{
  driverName: string; driverPhone: string; driverCpf: string; driverCity: string; vehicleName: string; vehicleModel: string; vehiclePlate: string;
  pixKey: string; logoUrl: string; minFare: string; minRatePerKm: string; ratePerHour: string; ratePerMinute: string;
  waitRatePerMinute: string; profitMarginPercent: string; overnightSurcharge: string; airportSurcharge: string;
  holidaySurcharge: string; longTripSurcharge: string; tollPolicy: string; appointmentBufferMinutes: number;
  reminderMinutes: number[]; frequentTripThreshold: number; quoteValidityHours: number; receiptFooter: string;
}>) {
  await getPrivateSettings(user);
  const payload: Record<string, unknown> = {};
  const stringKeys = ["driverName", "driverPhone", "driverCpf", "driverCity", "vehicleName", "vehicleModel", "vehiclePlate", "pixKey", "logoUrl", "tollPolicy", "receiptFooter"] as const;
  const moneyKeys = ["minFare", "minRatePerKm", "ratePerHour", "ratePerMinute", "waitRatePerMinute", "profitMarginPercent", "overnightSurcharge", "airportSurcharge", "holidaySurcharge", "longTripSurcharge"] as const;
  for (const key of stringKeys) if (input[key] !== undefined) payload[key] = input[key] || null;
  for (const key of moneyKeys) if (input[key] !== undefined) payload[key] = String(Math.max(0, money(input[key])));
  if (input.appointmentBufferMinutes !== undefined) payload.appointmentBufferMinutes = Math.max(0, Math.min(180, Math.round(input.appointmentBufferMinutes)));
  if (input.frequentTripThreshold !== undefined) payload.frequentTripThreshold = Math.max(1, Math.min(1000, Math.round(input.frequentTripThreshold)));
  if (input.quoteValidityHours !== undefined) payload.quoteValidityHours = Math.max(1, Math.min(720, Math.round(input.quoteValidityHours)));
  if (input.reminderMinutes !== undefined) payload.reminderMinutesJson = JSON.stringify([...new Set(input.reminderMinutes.filter(v => Number.isFinite(v) && v > 0))]);
  await user.db.update(privateSettings).set(payload).where(eq(privateSettings.userId, user.userId));
  const settings = await getPrivateSettings(user);
  await logPrivateEvent(user, { eventType: "SETTINGS_UPDATED", message: "Configurações do H2 Particular atualizadas" });
  return settings;
}


type AppointmentDraft = {
  clientId: number; pickupAddress: string; pickupLat?: string | null; pickupLng?: string | null;
  destinationAddress: string; destinationLat?: string | null; destinationLng?: string | null; stops?: Array<{ address: string; latitude?: string | null; longitude?: string | null }>;
  startsAt: string; durationMinutes: number; returnAt?: string | null; tripType?: string; waitMinutes?: number;
  estimatedDistanceKm?: number; estimatedCost?: number; finalPrice?: number; recurrenceRule?: string | null; recurrenceUntil?: string | null;
};

function toValidDate(value: string | Date) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Informe uma data e horário válidos.");
  return date;
}

function endDate(start: Date, durationMinutes: number, waitMinutes = 0, returnAt?: string | null) {
  if (returnAt) return toValidDate(returnAt);
  return new Date(start.getTime() + Math.max(10, Math.round(durationMinutes + waitMinutes)) * 60_000);
}

export function recurrenceDates(start: Date, rule?: string | null, untilRaw?: string | null): Date[] {
  if (!rule || rule === "NONE") return [start];
  const until = untilRaw ? toValidDate(untilRaw) : new Date(start.getTime() + 90 * 24 * 60 * 60_000);
  if (until < start) throw new Error("A data final da recorrência não pode ser anterior ao primeiro agendamento.");
  const values: Date[] = [];
  const cursor = new Date(start);
  const maxInstances = 180;
  while (cursor <= until && values.length < maxInstances) {
    values.push(new Date(cursor));
    if (rule === "DAILY") cursor.setDate(cursor.getDate() + 1);
    else if (rule === "WEEKLY") cursor.setDate(cursor.getDate() + 7);
    else if (rule === "BIWEEKLY") cursor.setDate(cursor.getDate() + 14);
    else if (rule === "MONTHLY") cursor.setMonth(cursor.getMonth() + 1);
    else throw new Error("Regra de recorrência não reconhecida.");
  }
  if (values.length >= maxInstances && cursor <= until) throw new Error("A recorrência gera mais de 180 viagens. Escolha uma data final menor.");
  return values;
}

export async function findAppointmentConflicts(user: PrivateTransportUser, startsAt: Date, endsAt: Date, ignoreAppointmentId?: number) {
  const settings = await getPrivateSettings(user);
  const bufferMs = Math.max(0, Number(settings.appointmentBufferMinutes || 0)) * 60_000;
  const windowStart = new Date(startsAt.getTime() - bufferMs);
  const windowEnd = new Date(endsAt.getTime() + bufferMs);
  const records = await user.db.select().from(privateAppointments).where(eq(privateAppointments.userId, user.userId));
  return records.filter((appointment: any) => {
    if (ignoreAppointmentId && Number(appointment.id) === ignoreAppointmentId) return false;
    if (["CANCELADA", "NÃO COMPARECEU", "CONCLUÍDA"].includes(String(appointment.status))) return false;
    const existingStart = new Date(appointment.startsAt);
    const existingEnd = appointment.endsAt ? new Date(appointment.endsAt) : new Date(existingStart.getTime() + 60 * 60_000);
    return existingStart < windowEnd && existingEnd > windowStart;
  });
}

export async function listPrivateAppointments(user: PrivateTransportUser, input?: { from?: string; to?: string; status?: string; limit?: number }) {
  const records = await user.db.select().from(privateAppointments).where(eq(privateAppointments.userId, user.userId)).orderBy(asc(privateAppointments.startsAt));
  const from = input?.from ? toValidDate(input.from) : null;
  const to = input?.to ? toValidDate(input.to) : null;
  const limit = Math.min(300, Math.max(1, Number(input?.limit || 100)));
  return records.filter((appointment: any) => {
    const startsAt = new Date(appointment.startsAt);
    if (from && startsAt < from) return false;
    if (to && startsAt > to) return false;
    return !input?.status || appointment.status === input.status;
  }).slice(0, limit);
}

export async function createPrivateAppointment(user: PrivateTransportUser, draft: AppointmentDraft, allowConflict = false) {
  const client = (await user.db.select().from(privateClients).where(and(eq(privateClients.id, draft.clientId), eq(privateClients.userId, user.userId))).limit(1))[0];
  if (!client || Number(client.isActive) !== 1) throw new Error("Escolha um passageiro ativo para criar o agendamento.");
  if (!String(draft.pickupAddress || "").trim() || !String(draft.destinationAddress || "").trim()) throw new Error("Informe o endereço de busca e o destino.");
  const firstStart = toValidDate(draft.startsAt);
  const durationMinutes = Math.max(10, Math.round(Number(draft.durationMinutes || 0)));
  const waitMinutes = Math.max(0, Math.round(Number(draft.waitMinutes || 0)));
  const dates = recurrenceDates(firstStart, draft.recurrenceRule, draft.recurrenceUntil);
  const created: any[] = [];
  let parentId: number | null = null;
  for (const startsAt of dates) {
    const endsAt = endDate(startsAt, durationMinutes, waitMinutes, draft.returnAt || null);
    const conflicts = await findAppointmentConflicts(user, startsAt, endsAt);
    if (conflicts.length && !allowConflict) {
      const conflict = conflicts[0];
      throw new Error(`CONFLITO DE HORÁRIO: já existe a viagem de ${conflict.clientNameSnapshot} prevista para ${new Date(conflict.startsAt).toLocaleString("pt-BR")}.`);
    }
    const result = await user.db.insert(privateAppointments).values({
      userId: user.userId, clientId: Number(client.id), quoteId: null, parentAppointmentId: parentId,
      status: "AGENDADA", clientNameSnapshot: client.name, clientPhoneSnapshot: client.whatsapp || client.phone,
      pickupAddress: draft.pickupAddress.trim(), pickupLat: draft.pickupLat || null, pickupLng: draft.pickupLng || null,
      destinationAddress: draft.destinationAddress.trim(), destinationLat: draft.destinationLat || null, destinationLng: draft.destinationLng || null,
      stopsJson: draft.stops?.length ? JSON.stringify(draft.stops) : null, startsAt, endsAt, returnAt: draft.returnAt ? toValidDate(draft.returnAt) : null,
      tripType: draft.tripType || "ONE_WAY", waitMinutes, estimatedDistanceKm: String(money(draft.estimatedDistanceKm)),
      estimatedDurationMinutes: durationMinutes, estimatedCost: String(money(draft.estimatedCost)), finalPrice: String(money(draft.finalPrice)),
      recurrenceRule: draft.recurrenceRule || null, recurrenceUntil: draft.recurrenceUntil ? toValidDate(draft.recurrenceUntil) : null,
    });
    const appointmentId = Number((result as any)[0]?.insertId);
    if (!parentId) parentId = appointmentId;
    const appointment = (await user.db.select().from(privateAppointments).where(and(eq(privateAppointments.id, appointmentId), eq(privateAppointments.userId, user.userId))).limit(1))[0];
    created.push(appointment);
    await logPrivateEvent(user, { eventType: "APPOINTMENT_CREATED", message: `Agendamento criado para ${client.name}`, clientId: Number(client.id), appointmentId, metadata: { startsAt: startsAt.toISOString(), recurrence: draft.recurrenceRule || "NONE" } });
  }
  return { appointments: created, recurring: dates.length > 1 };
}

export async function updatePrivateAppointmentStatus(user: PrivateTransportUser, appointmentId: number, status: string, cancellationReason?: string) {
  if (!PRIVATE_TRIP_STATUSES.includes(status as any)) throw new Error("Status de viagem inválido.");
  const current = (await user.db.select().from(privateAppointments).where(and(eq(privateAppointments.id, appointmentId), eq(privateAppointments.userId, user.userId))).limit(1))[0];
  if (!current) throw new Error("Agendamento não encontrado.");
  const payload: Record<string, unknown> = { status };
  if (status === "CANCELADA") { payload.cancelledAt = new Date(); payload.cancellationReason = cancellationReason || "Cancelado pelo motorista"; payload.cancelledBy = "motorista"; }
  await user.db.update(privateAppointments).set(payload).where(and(eq(privateAppointments.id, appointmentId), eq(privateAppointments.userId, user.userId)));
  await logPrivateEvent(user, { eventType: `APPOINTMENT_${status}`, message: `Agendamento atualizado para ${status}`, clientId: Number(current.clientId), appointmentId });
  return (await user.db.select().from(privateAppointments).where(and(eq(privateAppointments.id, appointmentId), eq(privateAppointments.userId, user.userId))).limit(1))[0];
}


type QuoteDraft = {
  clientId: number; pickupAddress: string; pickupLat?: string | null; pickupLng?: string | null; destinationAddress: string; destinationLat?: string | null; destinationLng?: string | null;
  stops?: Array<{ address: string; latitude?: string | null; longitude?: string | null }>; appointmentAt?: string | null; returnAt?: string | null;
  tripType?: string; waitMinutes?: number; distanceToPickupKm?: number; passengerDistanceKm?: number; totalDistanceKm?: number; estimatedDurationMinutes?: number;
  estimatedFuelCost?: number; estimatedTolls?: number; estimatedParking?: number; estimatedOtherCosts?: number; estimatedCost?: number; recommendedPrice?: number; finalPrice: number; notes?: string;
};

export async function createPrivateQuote(user: PrivateTransportUser, draft: QuoteDraft) {
  const client = (await user.db.select().from(privateClients).where(and(eq(privateClients.id, draft.clientId), eq(privateClients.userId, user.userId))).limit(1))[0];
  if (!client || Number(client.isActive) !== 1) throw new Error("Escolha um passageiro ativo para criar o orçamento.");
  if (!String(draft.pickupAddress || "").trim() || !String(draft.destinationAddress || "").trim()) throw new Error("Informe a origem e o destino do orçamento.");
  const settings = await getPrivateSettings(user);
  const provisionalCode = `PENDING-${createPublicToken().slice(0, 16)}`;
  const expires = new Date(Date.now() + Math.max(1, Number(settings.quoteValidityHours || 48)) * 60 * 60_000);
  const result = await user.db.insert((await import("../../drizzle/schema")).privateQuotes).values({
    userId: user.userId, clientId: Number(client.id), quoteCode: provisionalCode, publicToken: createPublicToken(), publicLinkEnabled: 1, publicLinkExpiresAt: expires,
    status: "RASCUNHO", clientNameSnapshot: client.name, clientPhoneSnapshot: client.whatsapp || client.phone,
    pickupAddress: draft.pickupAddress.trim(), pickupLat: draft.pickupLat || null, pickupLng: draft.pickupLng || null,
    destinationAddress: draft.destinationAddress.trim(), destinationLat: draft.destinationLat || null, destinationLng: draft.destinationLng || null,
    stopsJson: draft.stops?.length ? JSON.stringify(draft.stops) : null, appointmentAt: draft.appointmentAt ? toValidDate(draft.appointmentAt) : null,
    returnAt: draft.returnAt ? toValidDate(draft.returnAt) : null, tripType: draft.tripType || "ONE_WAY", waitMinutes: Math.max(0, Math.round(Number(draft.waitMinutes || 0))),
    distanceToPickupKm: String(money(draft.distanceToPickupKm)), passengerDistanceKm: String(money(draft.passengerDistanceKm)), totalDistanceKm: String(money(draft.totalDistanceKm)),
    estimatedDurationMinutes: Math.max(0, Math.round(Number(draft.estimatedDurationMinutes || 0))), estimatedFuelCost: String(money(draft.estimatedFuelCost)),
    estimatedTolls: String(money(draft.estimatedTolls)), estimatedParking: String(money(draft.estimatedParking)), estimatedOtherCosts: String(money(draft.estimatedOtherCosts)),
    estimatedCost: String(money(draft.estimatedCost)), recommendedPrice: String(money(draft.recommendedPrice)), finalPrice: String(money(draft.finalPrice)), notes: draft.notes || null,
  });
  const quoteId = Number((result as any)[0]?.insertId);
  const { privateQuotes } = await import("../../drizzle/schema");
  await user.db.update(privateQuotes).set({ quoteCode: quoteCodeFromId(quoteId, "ORC") }).where(and(eq(privateQuotes.id, quoteId), eq(privateQuotes.userId, user.userId)));
  const quote = (await user.db.select().from(privateQuotes).where(and(eq(privateQuotes.id, quoteId), eq(privateQuotes.userId, user.userId))).limit(1))[0];
  await logPrivateEvent(user, { eventType: "QUOTE_CREATED", message: `Orçamento ${quote.quoteCode} criado para ${client.name}`, clientId: Number(client.id), quoteId });
  return quote;
}

export async function listPrivateQuotes(user: PrivateTransportUser, status?: string) {
  const { privateQuotes } = await import("../../drizzle/schema");
  const records = await user.db.select().from(privateQuotes).where(eq(privateQuotes.userId, user.userId)).orderBy(desc(privateQuotes.createdAt));
  return records.filter((quote: any) => !status || quote.status === status).slice(0, 200);
}

export async function markQuoteSent(user: PrivateTransportUser, quoteId: number) {
  const { privateQuotes } = await import("../../drizzle/schema");
  const quote = (await user.db.select().from(privateQuotes).where(and(eq(privateQuotes.id, quoteId), eq(privateQuotes.userId, user.userId))).limit(1))[0];
  if (!quote) throw new Error("Orçamento não encontrado.");
  if (quote.status === "RASCUNHO") await user.db.update(privateQuotes).set({ status: "ENVIADO" }).where(and(eq(privateQuotes.id, quoteId), eq(privateQuotes.userId, user.userId)));
  await logPrivateEvent(user, { eventType: "QUOTE_SENT", message: `Orçamento ${quote.quoteCode} preparado para envio`, clientId: Number(quote.clientId), quoteId });
  return (await user.db.select().from(privateQuotes).where(and(eq(privateQuotes.id, quoteId), eq(privateQuotes.userId, user.userId))).limit(1))[0];
}

export async function getPublicQuote(publicToken: string) {
  const db = await getDb() as any;
  if (!db) throw new Error("Banco de dados indisponível");
  await ensurePrivateTransportInfrastructure(db);
  const { privateQuotes, privateSettings } = await import("../../drizzle/schema");
  const quote = (await db.select().from(privateQuotes).where(eq(privateQuotes.publicToken, publicToken)).limit(1))[0];
  if (!quote || Number(quote.publicLinkEnabled) !== 1) throw new Error("Este orçamento não está disponível.");
  if (quote.publicLinkExpiresAt && new Date(quote.publicLinkExpiresAt) < new Date() && !["ACEITO", "CONVERTIDO EM AGENDAMENTO"].includes(quote.status)) {
    await db.update(privateQuotes).set({ status: "EXPIRADO" }).where(eq(privateQuotes.id, quote.id));
    throw new Error("Este orçamento expirou.");
  }
  const settings = (await db.select().from(privateSettings).where(eq(privateSettings.userId, quote.userId)).limit(1))[0];
  return {
    quote: { quoteCode: quote.quoteCode, status: quote.status, clientName: quote.clientNameSnapshot, pickupAddress: quote.pickupAddress, destinationAddress: quote.destinationAddress,
      appointmentAt: quote.appointmentAt, tripType: quote.tripType, waitMinutes: quote.waitMinutes, totalDistanceKm: quote.totalDistanceKm, estimatedDurationMinutes: quote.estimatedDurationMinutes,
      estimatedTolls: quote.estimatedTolls, finalPrice: quote.finalPrice, notes: quote.notes, expiresAt: quote.publicLinkExpiresAt, acceptedAt: quote.acceptedAt },
    driver: { name: settings?.driverName || "Motorista particular", phone: settings?.driverPhone || null, city: settings?.driverCity || null, vehicle: settings?.vehicleName || null, logoUrl: settings?.logoUrl || null },
  };
}

export async function acceptPublicQuote(publicToken: string) {
  const db = await getDb() as any;
  if (!db) throw new Error("Banco de dados indisponível");
  await ensurePrivateTransportInfrastructure(db);
  const { privateQuotes } = await import("../../drizzle/schema");
  const quote = (await db.select().from(privateQuotes).where(eq(privateQuotes.publicToken, publicToken)).limit(1))[0];
  if (!quote || Number(quote.publicLinkEnabled) !== 1) throw new Error("Este orçamento não está disponível.");
  if (quote.publicLinkExpiresAt && new Date(quote.publicLinkExpiresAt) < new Date()) throw new Error("Este orçamento expirou.");
  if (quote.status === "CONVERTIDO EM AGENDAMENTO") return { accepted: true, appointmentId: quote.convertedAppointmentId, alreadyAccepted: true };
  if (["RECUSADO", "EXPIRADO"].includes(quote.status)) throw new Error("Este orçamento não pode mais ser aceito.");
  const user: PrivateTransportUser = { userId: Number(quote.userId), clientName: "Motorista", clientPhone: "", db };
  const startsAt = quote.appointmentAt ? new Date(quote.appointmentAt) : new Date();
  const endsAt = new Date(startsAt.getTime() + Math.max(10, Number(quote.estimatedDurationMinutes || 60) + Number(quote.waitMinutes || 0)) * 60_000);
  const appointmentResult = await db.insert(privateAppointments).values({
    userId: Number(quote.userId), clientId: Number(quote.clientId), quoteId: Number(quote.id), status: "CONFIRMADA", clientNameSnapshot: quote.clientNameSnapshot, clientPhoneSnapshot: quote.clientPhoneSnapshot,
    pickupAddress: quote.pickupAddress, pickupLat: quote.pickupLat, pickupLng: quote.pickupLng, destinationAddress: quote.destinationAddress, destinationLat: quote.destinationLat, destinationLng: quote.destinationLng,
    stopsJson: quote.stopsJson, startsAt, endsAt, returnAt: quote.returnAt, tripType: quote.tripType, waitMinutes: Number(quote.waitMinutes || 0),
    estimatedDistanceKm: quote.totalDistanceKm, estimatedDurationMinutes: Number(quote.estimatedDurationMinutes || 0), estimatedCost: quote.estimatedCost, finalPrice: quote.finalPrice,
  });
  const appointmentId = Number((appointmentResult as any)[0]?.insertId);
  await db.update(privateQuotes).set({ status: "CONVERTIDO EM AGENDAMENTO", acceptedAt: new Date(), convertedAppointmentId: appointmentId }).where(eq(privateQuotes.id, quote.id));
  await logPrivateEvent(user, { eventType: "QUOTE_ACCEPTED", message: `Orçamento ${quote.quoteCode} aceito e convertido em agendamento`, clientId: Number(quote.clientId), quoteId: Number(quote.id), appointmentId });
  return { accepted: true, appointmentId, alreadyAccepted: false };
}


export async function createTripFromAppointment(user: PrivateTransportUser, appointmentId: number) {
  const appointment = (await user.db.select().from(privateAppointments).where(and(eq(privateAppointments.id, appointmentId), eq(privateAppointments.userId, user.userId))).limit(1))[0];
  if (!appointment) throw new Error("Agendamento não encontrado.");
  const { privateTrips } = await import("../../drizzle/schema");
  const existing = (await user.db.select().from(privateTrips).where(and(eq(privateTrips.userId, user.userId), eq(privateTrips.appointmentId, appointmentId))).limit(1))[0];
  if (existing) return existing;
  const finalAmount = money(appointment.finalPrice);
  const result = await user.db.insert(privateTrips).values({
    userId: user.userId, clientId: Number(appointment.clientId), appointmentId, quoteId: appointment.quoteId || null, status: appointment.status,
    clientNameSnapshot: appointment.clientNameSnapshot, clientPhoneSnapshot: appointment.clientPhoneSnapshot, pickupAddress: appointment.pickupAddress,
    destinationAddress: appointment.destinationAddress, stopsJson: appointment.stopsJson, estimatedDistanceKm: appointment.estimatedDistanceKm,
    estimatedCost: appointment.estimatedCost, combinedAmount: String(finalAmount), finalAmount: String(finalAmount), remainingAmount: String(finalAmount), paymentStatus: "PENDENTE",
  });
  const tripId = Number((result as any)[0]?.insertId);
  const trip = (await user.db.select().from(privateTrips).where(and(eq(privateTrips.id, tripId), eq(privateTrips.userId, user.userId))).limit(1))[0];
  await logPrivateEvent(user, { eventType: "TRIP_CREATED", message: `Viagem criada para ${appointment.clientNameSnapshot}`, clientId: Number(appointment.clientId), appointmentId, tripId });
  return trip;
}

export async function listPrivateTrips(user: PrivateTransportUser, input?: { status?: string; paymentStatus?: string; onlyReceivables?: boolean }) {
  const { privateTrips } = await import("../../drizzle/schema");
  const records = await user.db.select().from(privateTrips).where(eq(privateTrips.userId, user.userId)).orderBy(desc(privateTrips.createdAt));
  return records.filter((trip: any) => {
    if (input?.status && trip.status !== input.status) return false;
    if (input?.paymentStatus && trip.paymentStatus !== input.paymentStatus) return false;
    if (input?.onlyReceivables && Number(trip.remainingAmount || 0) <= 0) return false;
    return true;
  }).slice(0, 250);
}

export async function updateTripStatus(user: PrivateTransportUser, tripId: number, status: string) {
  if (!PRIVATE_TRIP_STATUSES.includes(status as any)) throw new Error("Status de viagem inválido.");
  const { privateTrips } = await import("../../drizzle/schema");
  const trip = (await user.db.select().from(privateTrips).where(and(eq(privateTrips.id, tripId), eq(privateTrips.userId, user.userId))).limit(1))[0];
  if (!trip) throw new Error("Viagem não encontrada.");
  const payload: Record<string, unknown> = { status };
  if (status === "MOTORISTA A CAMINHO" && !trip.startedAt) payload.startedAt = new Date();
  if (status === "CONCLUÍDA") payload.completedAt = new Date();
  if (status === "CANCELADA") payload.cancelledAt = new Date();
  await user.db.update(privateTrips).set(payload).where(and(eq(privateTrips.id, tripId), eq(privateTrips.userId, user.userId)));
  await logPrivateEvent(user, { eventType: `TRIP_${status}`, message: `Viagem atualizada para ${status}`, clientId: Number(trip.clientId), tripId });
  return (await user.db.select().from(privateTrips).where(and(eq(privateTrips.id, tripId), eq(privateTrips.userId, user.userId))).limit(1))[0];
}

async function postPaymentIncome(user: PrivateTransportUser, paymentId: number) {
  const { privatePayments, spreadsheetEarnings } = await import("../../drizzle/schema");
  const payment = (await user.db.select().from(privatePayments).where(and(eq(privatePayments.id, paymentId), eq(privatePayments.userId, user.userId))).limit(1))[0];
  if (!payment) throw new Error("Pagamento não encontrado.");
  if (payment.reversedAt) return payment;
  if (payment.incomeEarningId) return payment;
  const date = asDateOnly(new Date(payment.paidAt));
  const earningResult = await user.db.insert(spreadsheetEarnings).values({
    userId: user.userId, date, uber: "0", ninetynine: "0", indrive: "0", particular: String(money(payment.amount)), deliveries: "0", tips: "0", otherEarnings: "0",
  });
  const earningId = Number((earningResult as any)[0]?.insertId);
  await user.db.update(privatePayments).set({ incomeEarningId: earningId, incomePostedAt: new Date() }).where(and(eq(privatePayments.id, paymentId), eq(privatePayments.userId, user.userId), eq(privatePayments.incomeEarningId, null)));
  return (await user.db.select().from(privatePayments).where(and(eq(privatePayments.id, paymentId), eq(privatePayments.userId, user.userId))).limit(1))[0];
}

export async function registerPrivatePayment(user: PrivateTransportUser, input: { tripId: number; amount: number; paymentMethod: string; paidAt?: string; notes?: string }) {
  const { privatePayments, privateTrips } = await import("../../drizzle/schema");
  const trip = (await user.db.select().from(privateTrips).where(and(eq(privateTrips.id, input.tripId), eq(privateTrips.userId, user.userId))).limit(1))[0];
  if (!trip) throw new Error("Viagem não encontrada.");
  const amount = money(input.amount);
  const remainingBefore = money(trip.remainingAmount);
  if (amount <= 0) throw new Error("Informe um valor de pagamento maior que zero.");
  if (amount > remainingBefore + 0.01) throw new Error(`O pagamento não pode ser maior que o saldo pendente de ${remainingBefore.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`);
  const paidAt = input.paidAt ? toValidDate(input.paidAt) : new Date();
  const result = await user.db.insert(privatePayments).values({ userId: user.userId, tripId: input.tripId, amount: String(amount), paymentMethod: input.paymentMethod || "PIX", paidAt, notes: input.notes || null });
  const paymentId = Number((result as any)[0]?.insertId);
  const payment = await postPaymentIncome(user, paymentId);
  const paidAmount = money(Number(trip.paidAmount || 0) + amount);
  const remainingAmount = money(Math.max(0, money(trip.finalAmount) - paidAmount));
  const paymentStatus = remainingAmount <= 0 ? "PAGO" : "PARCIAL";
  await user.db.update(privateTrips).set({ paidAmount: String(paidAmount), remainingAmount: String(remainingAmount), paymentStatus, status: trip.status === "AGENDADA" ? "CONCLUÍDA" : trip.status }).where(and(eq(privateTrips.id, input.tripId), eq(privateTrips.userId, user.userId)));
  await logPrivateEvent(user, { eventType: "PAYMENT_REGISTERED", message: `Pagamento de ${amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} registrado`, clientId: Number(trip.clientId), tripId: input.tripId, metadata: { paymentId, incomeEarningId: payment.incomeEarningId || null } });
  const receipt = await generatePrivateReceipt(user, paymentId);
  return { payment, receipt, trip: (await user.db.select().from(privateTrips).where(and(eq(privateTrips.id, input.tripId), eq(privateTrips.userId, user.userId))).limit(1))[0] };
}

export async function reversePrivatePayment(user: PrivateTransportUser, paymentId: number, reason: string) {
  const { privatePayments, privateTrips, spreadsheetEarnings } = await import("../../drizzle/schema");
  const payment = (await user.db.select().from(privatePayments).where(and(eq(privatePayments.id, paymentId), eq(privatePayments.userId, user.userId))).limit(1))[0];
  if (!payment) throw new Error("Pagamento não encontrado.");
  if (payment.reversedAt) throw new Error("Este pagamento já foi estornado.");
  const trip = (await user.db.select().from(privateTrips).where(and(eq(privateTrips.id, payment.tripId), eq(privateTrips.userId, user.userId))).limit(1))[0];
  if (!trip) throw new Error("Viagem vinculada não encontrada.");
  if (payment.incomeEarningId) await user.db.delete(spreadsheetEarnings).where(eq(spreadsheetEarnings.id, payment.incomeEarningId));
  await user.db.update(privatePayments).set({ reversedAt: new Date(), reversalReason: reason || "Estornado pelo motorista" }).where(and(eq(privatePayments.id, paymentId), eq(privatePayments.userId, user.userId)));
  const paidAmount = money(Math.max(0, Number(trip.paidAmount || 0) - Number(payment.amount || 0)));
  const remainingAmount = money(Math.max(0, Number(trip.finalAmount || 0) - paidAmount));
  await user.db.update(privateTrips).set({ paidAmount: String(paidAmount), remainingAmount: String(remainingAmount), paymentStatus: paidAmount <= 0 ? "PENDENTE" : "PARCIAL" }).where(and(eq(privateTrips.id, trip.id), eq(privateTrips.userId, user.userId)));
  await logPrivateEvent(user, { eventType: "PAYMENT_REVERSED", message: "Pagamento estornado", clientId: Number(trip.clientId), tripId: Number(trip.id), metadata: { paymentId } });
  return { success: true };
}

export async function listTripPayments(user: PrivateTransportUser, tripId: number) {
  const { privatePayments } = await import("../../drizzle/schema");
  return await user.db.select().from(privatePayments).where(and(eq(privatePayments.userId, user.userId), eq(privatePayments.tripId, tripId))).orderBy(desc(privatePayments.paidAt));
}


async function createReceiptPdf(snapshot: any): Promise<Buffer> {
  const module = await import("pdfkit");
  const PDFDocument = (module as any).default || module;
  return new Promise<Buffer>((resolve, reject) => {
    const document = new PDFDocument({ size: "A4", margin: 48 });
    const buffers: Buffer[] = [];
    document.on("data", (chunk: Buffer) => buffers.push(Buffer.from(chunk)));
    document.on("error", reject);
    document.on("end", () => resolve(Buffer.concat(buffers)));
    document.rect(0, 0, 595, 118).fill("#083344");
    document.fillColor("#cffafe").fontSize(10).font("Helvetica-Bold").text("H2 PARTICULAR", 48, 38, { characterSpacing: 1.5 });
    document.fillColor("#ffffff").fontSize(23).text("RECIBO DE PAGAMENTO", 48, 57);
    document.fillColor("#e2e8f0").fontSize(10).font("Helvetica").text(`RECIBO Nº ${snapshot.receiptCode}`, 48, 91);
    document.fillColor("#0f172a").fontSize(11).font("Helvetica-Bold").text("Recebi de", 48, 150);
    document.fontSize(17).text(snapshot.clientName, 48, 168);
    document.font("Helvetica").fontSize(11).fillColor("#475569").text("o valor de", 48, 204);
    document.font("Helvetica-Bold").fontSize(26).fillColor("#059669").text(snapshot.amountFormatted, 48, 223);
    document.font("Helvetica").fontSize(11).fillColor("#475569").text(`Forma de pagamento: ${snapshot.paymentMethod}`, 48, 267);
    document.text(`Data do pagamento: ${snapshot.paidAtFormatted}`, 48, 285);
    document.moveTo(48, 315).lineTo(547, 315).strokeColor("#cbd5e1").stroke();
    document.fillColor("#0f172a").font("Helvetica-Bold").fontSize(12).text("Referente ao transporte particular", 48, 338);
    document.font("Helvetica").fontSize(11).fillColor("#334155").text(`Data da viagem: ${snapshot.tripDateFormatted}`, 48, 362);
    document.text(`Origem: ${snapshot.pickupAddress}`, 48, 384, { width: 499 });
    document.text(`Destino: ${snapshot.destinationAddress}`, 48, 418, { width: 499 });
    if (snapshot.notes) document.text(`Observações: ${snapshot.notes}`, 48, 452, { width: 499 });
    document.moveTo(48, 550).lineTo(547, 550).strokeColor("#cbd5e1").stroke();
    document.fillColor("#0f172a").font("Helvetica-Bold").fontSize(12).text(snapshot.driverName || "Motorista particular", 48, 570);
    document.font("Helvetica").fontSize(10).fillColor("#475569");
    if (snapshot.driverPhone) document.text(`Telefone: ${snapshot.driverPhone}`, 48, 589);
    if (snapshot.driverCpf) document.text(`CPF: ${snapshot.driverCpf}`, 48, 605);
    if (snapshot.vehicle) document.text(`Veículo: ${snapshot.vehicle}`, 48, 621);
    if (snapshot.receiptFooter) document.text(snapshot.receiptFooter, 48, 650, { width: 499, align: "center" });
    document.fillColor("#64748b").fontSize(8).text(`Documento gerado em ${snapshot.generatedAtFormatted}`, 48, 748, { width: 499, align: "center" });
    document.end();
  });
}

export async function generatePrivateReceipt(user: PrivateTransportUser, paymentId: number) {
  const { privatePayments, privateReceipts, privateTrips } = await import("../../drizzle/schema");
  const payment = (await user.db.select().from(privatePayments).where(and(eq(privatePayments.id, paymentId), eq(privatePayments.userId, user.userId))).limit(1))[0];
  if (!payment || payment.reversedAt) throw new Error("Pagamento válido não encontrado.");
  const existing = (await user.db.select().from(privateReceipts).where(and(eq(privateReceipts.userId, user.userId), eq(privateReceipts.paymentId, paymentId))).limit(1))[0];
  if (existing) return existing;
  const trip = (await user.db.select().from(privateTrips).where(and(eq(privateTrips.id, payment.tripId), eq(privateTrips.userId, user.userId))).limit(1))[0];
  if (!trip) throw new Error("Viagem vinculada não encontrada.");
  const settings = await getPrivateSettings(user);
  const temporaryCode = `PENDING-${createPublicToken().slice(0, 16)}`;
  const receiptResult = await user.db.insert(privateReceipts).values({ userId: user.userId, tripId: Number(trip.id), paymentId, receiptCode: temporaryCode, publicToken: createPublicToken(), publicLinkEnabled: 1, amount: String(money(payment.amount)), paymentMethod: payment.paymentMethod, paidAt: payment.paidAt, snapshotJson: "{}" });
  const receiptId = Number((receiptResult as any)[0]?.insertId);
  const receiptCode = quoteCodeFromId(receiptId, "REC");
  const snapshot = {
    receiptCode, clientName: trip.clientNameSnapshot, amountFormatted: money(payment.amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }), paymentMethod: payment.paymentMethod,
    paidAtFormatted: new Date(payment.paidAt).toLocaleString("pt-BR"), tripDateFormatted: trip.completedAt ? new Date(trip.completedAt).toLocaleString("pt-BR") : "Data não registrada",
    pickupAddress: trip.pickupAddress, destinationAddress: trip.destinationAddress, notes: payment.notes || null, driverName: settings.driverName || user.clientName,
    driverPhone: settings.driverPhone || user.clientPhone, driverCpf: settings.driverCpf || null, vehicle: settings.vehicleName || settings.vehicleModel || null,
    receiptFooter: settings.receiptFooter || null, generatedAtFormatted: new Date().toLocaleString("pt-BR"),
  };
  await user.db.update(privateReceipts).set({ receiptCode, snapshotJson: JSON.stringify(snapshot) }).where(and(eq(privateReceipts.id, receiptId), eq(privateReceipts.userId, user.userId)));
  let pdfUrl: string | null = null;
  try {
    const { r2PutObject } = await import("../r2Storage");
    const pdf = await createReceiptPdf(snapshot);
    const upload = await r2PutObject(`private/receipts/${user.userId}/${receiptCode}.pdf`, pdf, "application/pdf");
    pdfUrl = upload.url;
    await user.db.update(privateReceipts).set({ pdfUrl }).where(and(eq(privateReceipts.id, receiptId), eq(privateReceipts.userId, user.userId)));
  } catch (error) {
    // O recibo e o link público continuam válidos; a nova tentativa de PDF pode ser feita posteriormente.
    console.error("[H2 Particular] Falha ao gerar PDF do recibo", error);
  }
  await logPrivateEvent(user, { eventType: "RECEIPT_GENERATED", message: `Recibo ${receiptCode} gerado`, clientId: Number(trip.clientId), tripId: Number(trip.id), receiptId });
  return (await user.db.select().from(privateReceipts).where(and(eq(privateReceipts.id, receiptId), eq(privateReceipts.userId, user.userId))).limit(1))[0];
}

export async function listPrivateReceipts(user: PrivateTransportUser) {
  const { privateReceipts } = await import("../../drizzle/schema");
  return await user.db.select().from(privateReceipts).where(eq(privateReceipts.userId, user.userId)).orderBy(desc(privateReceipts.createdAt));
}

export async function getPublicReceipt(publicToken: string) {
  const db = await getDb() as any;
  if (!db) throw new Error("Banco de dados indisponível");
  await ensurePrivateTransportInfrastructure(db);
  const { privateReceipts } = await import("../../drizzle/schema");
  const receipt = (await db.select().from(privateReceipts).where(eq(privateReceipts.publicToken, publicToken)).limit(1))[0];
  if (!receipt || Number(receipt.publicLinkEnabled) !== 1) throw new Error("Este recibo não está disponível.");
  return { receipt: { receiptCode: receipt.receiptCode, pdfUrl: receipt.pdfUrl, amount: receipt.amount, paymentMethod: receipt.paymentMethod, paidAt: receipt.paidAt, snapshot: receipt.snapshotJson ? JSON.parse(receipt.snapshotJson) : null } };
}


export async function getPrivateDashboard(user: PrivateTransportUser) {
  const { privateTrips, privateQuotes, privatePayments, privateEvents } = await import("../../drizzle/schema");
  const [clients, appointments, trips, quotes, payments, events, settings] = await Promise.all([
    user.db.select().from(privateClients).where(eq(privateClients.userId, user.userId)),
    user.db.select().from(privateAppointments).where(eq(privateAppointments.userId, user.userId)),
    user.db.select().from(privateTrips).where(eq(privateTrips.userId, user.userId)),
    user.db.select().from(privateQuotes).where(eq(privateQuotes.userId, user.userId)),
    user.db.select().from(privatePayments).where(eq(privatePayments.userId, user.userId)),
    user.db.select().from(privateEvents).where(eq(privateEvents.userId, user.userId)).orderBy(desc(privateEvents.createdAt)),
    getPrivateSettings(user),
  ]);
  const now = new Date();
  const todayKey = asDateOnly(now);
  const monthKey = todayKey.slice(0, 7);
  const paidPayments = payments.filter((payment: any) => !payment.reversedAt);
  const paidThisMonth = paidPayments.filter((payment: any) => asDateOnly(new Date(payment.paidAt)).startsWith(monthKey)).reduce((total: number, payment: any) => total + Number(payment.amount || 0), 0);
  const receivable = trips.filter((trip: any) => !["CANCELADA", "NÃO COMPARECEU"].includes(trip.status)).reduce((total: number, trip: any) => total + Math.max(0, Number(trip.remainingAmount || 0)), 0);
  const upcoming = appointments.filter((appointment: any) => new Date(appointment.startsAt) >= now && !["CANCELADA", "CONCLUÍDA", "NÃO COMPARECEU"].includes(appointment.status)).sort((a: any, b: any) => +new Date(a.startsAt) - +new Date(b.startsAt)).slice(0, 8);
  const todayAppointments = appointments.filter((appointment: any) => asDateOnly(new Date(appointment.startsAt)) === todayKey && !["CANCELADA", "NÃO COMPARECEU"].includes(appointment.status));
  const completedTrips = trips.filter((trip: any) => trip.status === "CONCLUÍDA");
  const averageTicket = completedTrips.length ? completedTrips.reduce((total: number, trip: any) => total + Number(trip.finalAmount || 0), 0) / completedTrips.length : 0;
  const clientTotals = new Map<number, { id: number; name: string; trips: number; paid: number }>();
  for (const trip of trips as any[]) { const key = Number(trip.clientId); const value = clientTotals.get(key) || { id: key, name: trip.clientNameSnapshot, trips: 0, paid: 0 }; value.trips += 1; value.paid += Number(trip.paidAmount || 0); clientTotals.set(key, value); }
  const topClients = [...clientTotals.values()].sort((a, b) => b.paid - a.paid || b.trips - a.trips).slice(0, 5);
  return {
    metrics: { totalClients: clients.filter((client: any) => Number(client.isActive) === 1).length, favoriteClients: clients.filter((client: any) => Number(client.isFavorite) === 1).length, todayAppointments: todayAppointments.length, activeQuotes: quotes.filter((quote: any) => ["RASCUNHO", "ENVIADO", "AGUARDANDO RESPOSTA"].includes(quote.status)).length, receivable, paidThisMonth, averageTicket, completedTrips: completedTrips.length, totalTrips: trips.length },
    upcoming, topClients, recentEvents: events.slice(0, 12), settings,
  };
}
