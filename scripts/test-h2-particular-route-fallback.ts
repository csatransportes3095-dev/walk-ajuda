import assert from "node:assert/strict";
import { getRouteEstimate } from "../server/private-transport/maps";

const route = await getRouteEstimate({ origin: "Avenida Paulista, 1578, São Paulo, SP", destination: "Aeroporto de Congonhas, São Paulo, SP" });
assert.ok(route.distanceKm > 0, "A rota deve retornar km maior que zero.");
assert.ok(route.durationMinutes > 0, "A rota deve retornar duração maior que zero.");
assert.ok(route.navigationUrl.includes("google.com/maps/dir"), "O link de navegação deve ser gerado.");
console.log(`Fallback de rota aprovado: ${route.distanceKm} km, ${route.durationMinutes} min, fonte=${route.source}.`);
