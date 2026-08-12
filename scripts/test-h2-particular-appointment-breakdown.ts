import assert from "node:assert/strict";
import { calculateAppointmentPriceBreakdown } from "../server/private-transport/service";

const base = {
  distanceKm: 10,
  durationMinutes: 20,
  waitMinutes: 30,
  settings: { minFare: "0", minRatePerKm: "2", ratePerMinute: "0", waitRatePerMinute: "1", profitMarginPercent: "0", overnightSurcharge: "0", airportSurcharge: "0", holidaySurcharge: "0", longTripSurcharge: "0" },
  vehicle: null,
};
const oneWay = calculateAppointmentPriceBreakdown({ ...base, tripType: "ONE_WAY" });
assert.equal(oneWay.outbound.recommendedPrice, 20);
assert.equal(oneWay.returnTrip, null);
assert.equal(oneWay.wait.value, 30);
assert.equal(oneWay.recommendedPrice, 50);
assert.equal(oneWay.totalDistanceKm, 10);
assert.equal(oneWay.totalDurationMinutes, 50);

const roundTrip = calculateAppointmentPriceBreakdown({ ...base, tripType: "ROUND_TRIP" });
assert.equal(roundTrip.returnTrip?.recommendedPrice, 20);
assert.equal(roundTrip.wait.value, 30);
assert.equal(roundTrip.recommendedPrice, 70);
assert.equal(roundTrip.totalDistanceKm, 20);
assert.equal(roundTrip.totalDurationMinutes, 70);

console.log("Cálculo de ida, volta, espera e total aprovado.");
