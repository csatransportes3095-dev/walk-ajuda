import assert from "node:assert/strict";
import { calculatePrivateTripPrice, getPriceQuality, recurrenceDates } from "../server/private-transport/service";
import { buildNavigationUrl } from "../server/private-transport/maps";

const settings: any = {
  minFare: "20", minRatePerKm: "2", ratePerHour: "30", ratePerMinute: "0", waitRatePerMinute: "0.5", profitMarginPercent: "25",
  overnightSurcharge: "10", airportSurcharge: "15", holidaySurcharge: "20", longTripSurcharge: "0", tollPolicy: "separate",
};
const vehicle: any = { kmPerLiter: "10", fuelPricePerLiter: "6" };
const price = calculatePrivateTripPrice({ distanceKm: 20, durationMinutes: 60, waitMinutes: 10, tolls: 12, parking: 5, otherCosts: 3, settings, vehicle });
assert.ok(price.fuelCost > 0, "O custo de combustível deve ser calculado pelo veículo salvo.");
assert.ok(price.estimatedCost >= price.fuelCost + 20, "O custo estimado deve incluir custos adicionais.");
assert.ok(price.recommendedPrice >= 20, "O preço recomendado deve respeitar a tarifa mínima.");
const lowQuality = getPriceQuality(10, price.estimatedCost);
assert.equal(lowQuality.key, "below_cost", "Preço abaixo do custo deve ser identificado com segurança.");
const weekly = recurrenceDates(new Date("2026-08-12T09:00:00-03:00"), "WEEKLY", "2026-09-02T09:00:00-03:00");
assert.equal(weekly.length, 4, "Recorrência semanal deve criar todas as quatro ocorrências do período.");
const monthly = recurrenceDates(new Date("2026-07-30T09:00:00-03:00"), "MONTHLY", "2026-09-30T09:00:00-03:00");
assert.equal(monthly.length, 3, "Recorrência mensal deve preservar a sequência de meses.");
assert.throws(() => recurrenceDates(new Date("2026-08-12T09:00:00-03:00"), "WEEKLY", "2026-08-01T09:00:00-03:00"), /data final/, "A data final anterior deve ser bloqueada.");
const link = buildNavigationUrl("Rua A, São Paulo", "Aeroporto de Congonhas", [{ address: "Rua B, São Paulo" }]);
assert.ok(link.includes("api=1") && link.includes("origin=") && link.includes("destination=") && link.includes("waypoints="), "O link de navegação deve carregar origem, destino e parada.");
console.log("H2 Particular: testes de preço, recorrência e link de navegação aprovados.");
