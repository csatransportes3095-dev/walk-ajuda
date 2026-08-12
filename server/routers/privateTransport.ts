import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { publicProcedure, router } from "../_core/trpc";
import { privateClients, spreadsheetVehicleConfig } from "../../drizzle/schema";
import {
  calculateAppointmentPriceBreakdown,
  calculatePrivateTripPrice,
  createPrivateClient,
  getPriceQuality,
  getPrivateSettings,
  listPrivateClients,
  listPrivateEvents,
  resolvePrivateTransportUser,
  updatePrivateClient,
  updatePrivateSettings,
} from "../private-transport/service";

const clientInput = z.object({
  name: z.string().min(2, "Informe o nome completo do passageiro."),
  phone: z.string().min(8, "Informe um telefone válido."),
  whatsapp: z.string().optional(),
  cpf: z.string().optional(),
  email: z.string().email("E-mail inválido.").optional().or(z.literal("")),
  addressLine: z.string().optional(),
  addressNumber: z.string().optional(),
  addressComplement: z.string().optional(),
  neighborhood: z.string().optional(),
  city: z.string().optional(),
  state: z.string().max(2).optional(),
  zipCode: z.string().optional(),
  referencePoint: z.string().optional(),
  latitude: z.string().optional().nullable(),
  longitude: z.string().optional().nullable(),
  notes: z.string().optional(),
});

async function currentUser(token: string) {
  try {
    return await resolvePrivateTransportUser(token);
  } catch (error: any) {
    throw new TRPCError({ code: "FORBIDDEN", message: error?.message || "Acesso ao H2 Particular não autorizado." });
  }
}

export const privateTransportRouter = router({
  dashboard: publicProcedure.input(z.object({ token: z.string() })).query(async ({ input }) => (await import("../private-transport/service")).getPrivateDashboard(await currentUser(input.token))),

  bootstrap: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const user = await currentUser(input.token);
      const [settings, vehicle] = await Promise.all([
        getPrivateSettings(user),
        user.db.select().from(spreadsheetVehicleConfig).where(eq(spreadsheetVehicleConfig.userId, user.userId)).limit(1),
      ]);
      return {
        user: { id: user.userId, name: user.clientName, phone: user.clientPhone },
        settings,
        vehicle: vehicle[0] || null,
      };
    }),

  settings: router({
    get: publicProcedure.input(z.object({ token: z.string() })).query(async ({ input }) => getPrivateSettings(await currentUser(input.token))),
    update: publicProcedure.input(z.object({
      token: z.string(), driverName: z.string().max(160).optional(), driverPhone: z.string().max(32).optional(),
      driverCpf: z.string().max(14).optional(), driverCity: z.string().max(128).optional(), vehicleName: z.string().max(120).optional(),
      vehicleModel: z.string().max(120).optional(), vehiclePlate: z.string().max(16).optional(), pixKey: z.string().max(160).optional(),
      logoUrl: z.string().max(1024).optional(), minFare: z.string().optional(), minRatePerKm: z.string().optional(),
      ratePerHour: z.string().optional(), ratePerMinute: z.string().optional(), waitRatePerMinute: z.string().optional(),
      profitMarginPercent: z.string().optional(), overnightSurcharge: z.string().optional(), airportSurcharge: z.string().optional(),
      holidaySurcharge: z.string().optional(), longTripSurcharge: z.string().optional(), tollPolicy: z.enum(["included", "separate"]).optional(),
      appointmentBufferMinutes: z.number().int().optional(), reminderMinutes: z.array(z.number().int()).optional(),
      frequentTripThreshold: z.number().int().optional(), quoteValidityHours: z.number().int().optional(), receiptFooter: z.string().max(2000).optional(),
    })).mutation(async ({ input }) => {
      const user = await currentUser(input.token);
      const { token: _token, ...payload } = input;
      return updatePrivateSettings(user, payload);
    }),
  }),

  clients: router({
    list: publicProcedure.input(z.object({ token: z.string(), search: z.string().max(160).optional(), filter: z.enum(["all", "active", "inactive", "favorites"]).optional(), limit: z.number().int().min(1).max(100).optional(), offset: z.number().int().min(0).optional() }))
      .query(async ({ input }) => listPrivateClients(await currentUser(input.token), input)),
    get: publicProcedure.input(z.object({ token: z.string(), clientId: z.number().int().positive() })).query(async ({ input }) => {
      const user = await currentUser(input.token);
      const client = (await user.db.select().from(privateClients).where(eq(privateClients.id, input.clientId)).limit(1))[0];
      if (!client || Number(client.userId) !== user.userId) throw new TRPCError({ code: "NOT_FOUND", message: "Passageiro não encontrado." });
      const events = await listPrivateEvents(user, input.clientId);
      return { client, events };
    }),
    create: publicProcedure.input(z.object({ token: z.string(), client: clientInput })).mutation(async ({ input }) => createPrivateClient(await currentUser(input.token), input.client)),
    update: publicProcedure.input(z.object({ token: z.string(), clientId: z.number().int().positive(), client: clientInput.partial().extend({ isFavorite: z.boolean().optional(), isActive: z.boolean().optional() }) }))
      .mutation(async ({ input }) => updatePrivateClient(await currentUser(input.token), input.clientId, input.client)),
  }),

  receipts: router({
    list: publicProcedure.input(z.object({ token: z.string() })).query(async ({ input }) => (await import("../private-transport/service")).listPrivateReceipts(await currentUser(input.token))),
    generate: publicProcedure.input(z.object({ token: z.string(), paymentId: z.number().int().positive() })).mutation(async ({ input }) => (await import("../private-transport/service")).generatePrivateReceipt(await currentUser(input.token), input.paymentId)),
    getPublic: publicProcedure.input(z.object({ publicToken: z.string().min(20).max(120) })).query(async ({ input }) => { try { return await (await import("../private-transport/service")).getPublicReceipt(input.publicToken); } catch (error: any) { throw new TRPCError({ code: "NOT_FOUND", message: error?.message || "Recibo não encontrado." }); } }),
  }),

  trips: router({
    list: publicProcedure.input(z.object({ token: z.string(), status: z.string().optional(), paymentStatus: z.enum(["PENDENTE", "PARCIAL", "PAGO"]).optional(), onlyReceivables: z.boolean().optional() })).query(async ({ input }) => (await import("../private-transport/service")).listPrivateTrips(await currentUser(input.token), input)),
    createFromAppointment: publicProcedure.input(z.object({ token: z.string(), appointmentId: z.number().int().positive() })).mutation(async ({ input }) => (await import("../private-transport/service")).createTripFromAppointment(await currentUser(input.token), input.appointmentId)),
    updateStatus: publicProcedure.input(z.object({ token: z.string(), tripId: z.number().int().positive(), status: z.enum(["AGENDADA", "CONFIRMADA", "MOTORISTA A CAMINHO", "AGUARDANDO PASSAGEIRO", "EM VIAGEM", "CONCLUÍDA", "CANCELADA", "NÃO COMPARECEU"]) })).mutation(async ({ input }) => (await import("../private-transport/service")).updateTripStatus(await currentUser(input.token), input.tripId, input.status)),
    payments: publicProcedure.input(z.object({ token: z.string(), tripId: z.number().int().positive() })).query(async ({ input }) => (await import("../private-transport/service")).listTripPayments(await currentUser(input.token), input.tripId)),
    registerPayment: publicProcedure.input(z.object({ token: z.string(), tripId: z.number().int().positive(), amount: z.number().positive(), paymentMethod: z.enum(["PIX", "DINHEIRO", "CARTÃO", "TRANSFERÊNCIA", "OUTRO"]), paidAt: z.string().optional(), notes: z.string().max(2000).optional() })).mutation(async ({ input }) => (await import("../private-transport/service")).registerPrivatePayment(await currentUser(input.token), input)),
    reversePayment: publicProcedure.input(z.object({ token: z.string(), paymentId: z.number().int().positive(), reason: z.string().min(3).max(2000) })).mutation(async ({ input }) => (await import("../private-transport/service")).reversePrivatePayment(await currentUser(input.token), input.paymentId, input.reason)),
  }),

  quotes: router({
    list: publicProcedure.input(z.object({ token: z.string(), status: z.string().optional() })).query(async ({ input }) => (await import("../private-transport/service")).listPrivateQuotes(await currentUser(input.token), input.status)),
    create: publicProcedure.input(z.object({
      token: z.string(), clientId: z.number().int().positive(), pickupAddress: z.string().min(3), pickupLat: z.string().nullable().optional(), pickupLng: z.string().nullable().optional(),
      destinationAddress: z.string().min(3), destinationLat: z.string().nullable().optional(), destinationLng: z.string().nullable().optional(),
      stops: z.array(z.object({ address: z.string().min(2), latitude: z.string().nullable().optional(), longitude: z.string().nullable().optional() })).optional(),
      appointmentAt: z.string().nullable().optional(), returnAt: z.string().nullable().optional(), tripType: z.enum(["ONE_WAY", "ROUND_TRIP", "RETURN_LATER"]).optional(), waitMinutes: z.number().min(0).optional(),
      distanceToPickupKm: z.number().min(0).optional(), passengerDistanceKm: z.number().min(0).optional(), totalDistanceKm: z.number().min(0).optional(), estimatedDurationMinutes: z.number().min(0).optional(),
      estimatedFuelCost: z.number().min(0).optional(), estimatedTolls: z.number().min(0).optional(), estimatedParking: z.number().min(0).optional(), estimatedOtherCosts: z.number().min(0).optional(),
      estimatedCost: z.number().min(0).optional(), recommendedPrice: z.number().min(0).optional(), finalPrice: z.number().min(0), notes: z.string().max(5000).optional(),
    })).mutation(async ({ input }) => { const { token: _token, ...draft } = input; return (await import("../private-transport/service")).createPrivateQuote(await currentUser(input.token), draft); }),
    markSent: publicProcedure.input(z.object({ token: z.string(), quoteId: z.number().int().positive() })).mutation(async ({ input }) => (await import("../private-transport/service")).markQuoteSent(await currentUser(input.token), input.quoteId)),
    getPublic: publicProcedure.input(z.object({ publicToken: z.string().min(20).max(120) })).query(async ({ input }) => { try { return await (await import("../private-transport/service")).getPublicQuote(input.publicToken); } catch (error: any) { throw new TRPCError({ code: "NOT_FOUND", message: error?.message || "Orçamento não encontrado." }); } }),
    acceptPublic: publicProcedure.input(z.object({ publicToken: z.string().min(20).max(120) })).mutation(async ({ input }) => { try { return await (await import("../private-transport/service")).acceptPublicQuote(input.publicToken); } catch (error: any) { throw new TRPCError({ code: "BAD_REQUEST", message: error?.message || "Não foi possível aceitar este orçamento." }); } }),
  }),

  appointments: router({
    list: publicProcedure.input(z.object({ token: z.string(), from: z.string().optional(), to: z.string().optional(), status: z.string().optional(), limit: z.number().int().min(1).max(300).optional() }))
      .query(async ({ input }) => (await import("../private-transport/service")).listPrivateAppointments(await currentUser(input.token), input)),
    checkConflict: publicProcedure.input(z.object({ token: z.string(), startsAt: z.string(), durationMinutes: z.number().min(10), waitMinutes: z.number().min(0).optional(), returnAt: z.string().nullable().optional() }))
      .query(async ({ input }) => {
        const service = await import("../private-transport/service"); const user = await currentUser(input.token);
        const startsAt = new Date(input.startsAt); const endsAt = input.returnAt ? new Date(input.returnAt) : new Date(startsAt.getTime() + (input.durationMinutes + (input.waitMinutes || 0)) * 60_000);
        const conflicts = await service.findAppointmentConflicts(user, startsAt, endsAt);
        return { hasConflict: conflicts.length > 0, conflicts };
      }),
    create: publicProcedure.input(z.object({
      token: z.string(), clientId: z.number().int().positive(), pickupAddress: z.string().min(3), pickupLat: z.string().nullable().optional(), pickupLng: z.string().nullable().optional(),
      destinationAddress: z.string().min(3), destinationLat: z.string().nullable().optional(), destinationLng: z.string().nullable().optional(),
      stops: z.array(z.object({ address: z.string().min(2), latitude: z.string().nullable().optional(), longitude: z.string().nullable().optional() })).optional(),
      startsAt: z.string(), durationMinutes: z.number().min(10).max(1440), returnAt: z.string().nullable().optional(), tripType: z.enum(["ONE_WAY", "ROUND_TRIP", "RETURN_LATER"]).optional(),
      waitMinutes: z.number().min(0).max(1440).optional(), estimatedDistanceKm: z.number().min(0).optional(), estimatedCost: z.number().min(0).optional(), finalPrice: z.number().min(0).optional(),
      recurrenceRule: z.enum(["NONE", "DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY"]).optional(), recurrenceUntil: z.string().nullable().optional(), allowConflict: z.boolean().optional(),
    })).mutation(async ({ input }) => {
      const service = await import("../private-transport/service"); const user = await currentUser(input.token); const { token: _token, allowConflict, ...draft } = input;
      return service.createPrivateAppointment(user, draft, Boolean(allowConflict));
    }),
    updateStatus: publicProcedure.input(z.object({ token: z.string(), appointmentId: z.number().int().positive(), status: z.enum(["AGENDADA", "CONFIRMADA", "MOTORISTA A CAMINHO", "AGUARDANDO PASSAGEIRO", "EM VIAGEM", "CONCLUÍDA", "CANCELADA", "NÃO COMPARECEU"]), cancellationReason: z.string().max(2000).optional() }))
      .mutation(async ({ input }) => (await import("../private-transport/service")).updatePrivateAppointmentStatus(await currentUser(input.token), input.appointmentId, input.status, input.cancellationReason)),
  }),

  addresses: router({
    lookupCep: publicProcedure.input(z.object({ token: z.string(), cep: z.string().min(8).max(16) })).query(async ({ input }) => {
      await currentUser(input.token);
      const cep = input.cep.replace(/\D/g, "");
      if (cep.length !== 8) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe um CEP com 8 dígitos." });
      try {
        const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        if (!response.ok) throw new Error("Falha na consulta do CEP.");
        const address = await response.json() as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string; cep?: string; complemento?: string };
        if (address.erro) throw new Error("CEP não encontrado.");
        return { cep: address.cep || cep, street: address.logradouro || "", neighborhood: address.bairro || "", city: address.localidade || "", state: address.uf || "", complement: address.complemento || "" };
      } catch (error: any) { throw new TRPCError({ code: "BAD_REQUEST", message: error?.message || "Não foi possível consultar este CEP." }); }
    }),
  }),

  maps: router({
    autocomplete: publicProcedure.input(z.object({ token: z.string(), input: z.string().max(300) })).query(async ({ input }) => {
      await currentUser(input.token);
      try { return await (await import("../private-transport/maps")).autocompleteAddress(input.input); }
      catch { return []; }
    }),
    route: publicProcedure.input(z.object({ token: z.string(), origin: z.string().min(3).max(500), destination: z.string().min(3).max(500), stops: z.array(z.object({ address: z.string().min(2).max(500) })).optional() }))
      .query(async ({ input }) => {
        await currentUser(input.token);
        try { return await (await import("../private-transport/maps")).getRouteEstimate(input); }
        catch (error: any) { throw new TRPCError({ code: "BAD_REQUEST", message: error?.message || "Não foi possível calcular a rota." }); }
      }),
  }),

  pricing: router({
    preview: publicProcedure.input(z.object({
      token: z.string(), distanceKm: z.number().min(0), durationMinutes: z.number().min(0), waitMinutes: z.number().min(0).optional(),
      tolls: z.number().min(0).optional(), parking: z.number().min(0).optional(), otherCosts: z.number().min(0).optional(),
      overnight: z.boolean().optional(), airport: z.boolean().optional(), holiday: z.boolean().optional(), longTrip: z.boolean().optional(), finalPrice: z.number().min(0).optional(),
    })).query(async ({ input }) => {
      const user = await currentUser(input.token);
      const [settings, vehicleRows] = await Promise.all([
        getPrivateSettings(user),
        user.db.select().from(spreadsheetVehicleConfig).where(eq(spreadsheetVehicleConfig.userId, user.userId)).limit(1),
      ]);
      const calculation = calculatePrivateTripPrice({ ...input, settings, vehicle: vehicleRows[0] || null });
      const finalPrice = input.finalPrice === undefined ? calculation.recommendedPrice : input.finalPrice;
      return { ...calculation, finalPrice, quality: getPriceQuality(finalPrice, calculation.estimatedCost) };
    }),
    appointmentPreview: publicProcedure.input(z.object({
      token: z.string(), distanceKm: z.number().min(0), durationMinutes: z.number().min(0), waitMinutes: z.number().min(0).optional(),
      tripType: z.enum(["ONE_WAY", "ROUND_TRIP", "RETURN_LATER"]), finalPrice: z.number().min(0).optional(),
    })).query(async ({ input }) => {
      const user = await currentUser(input.token);
      const [settings, vehicleRows] = await Promise.all([
        getPrivateSettings(user),
        user.db.select().from(spreadsheetVehicleConfig).where(eq(spreadsheetVehicleConfig.userId, user.userId)).limit(1),
      ]);
      const calculation = calculateAppointmentPriceBreakdown({ ...input, settings, vehicle: vehicleRows[0] || null });
      const finalPrice = input.finalPrice === undefined ? calculation.recommendedPrice : input.finalPrice;
      return { ...calculation, finalPrice, quality: getPriceQuality(finalPrice, calculation.estimatedCost) };
    }),
  }),
});
