import { makeRequest, type DirectionsResult } from "../_core/map";

export type RouteStop = { address: string };
type RouteEstimate = { distanceKm: number; durationMinutes: number; legs: Array<{ origin: string; destination: string; distanceKm: number; durationMinutes: number; distanceLabel: string; durationLabel: string }>; encodedPolyline: string | null; summary: string | null; navigationUrl: string; tollsAvailable: boolean; source: "configured_maps" | "fallback" };

export function buildNavigationUrl(origin: string, destination: string, stops: RouteStop[] = []) {
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("origin", origin);
  url.searchParams.set("destination", destination);
  if (stops.length) url.searchParams.set("waypoints", stops.map((stop) => stop.address).join("|"));
  url.searchParams.set("travelmode", "driving");
  return url.toString();
}

function parseConfiguredRoute(directions: DirectionsResult, origin: string, destination: string, stops: RouteStop[]): RouteEstimate {
  if (directions.status !== "OK" || !directions.routes?.[0]?.legs?.length) throw new Error(directions.status === "ZERO_RESULTS" ? "Não foi possível encontrar uma rota entre os endereços informados." : "Não foi possível calcular a rota agora. Confira os endereços e tente novamente.");
  const route = directions.routes[0];
  const legs = route.legs.map((leg) => ({ origin: leg.start_address, destination: leg.end_address, distanceKm: Math.round((leg.distance.value / 1000) * 100) / 100, durationMinutes: Math.max(1, Math.round(leg.duration.value / 60)), distanceLabel: leg.distance.text, durationLabel: leg.duration.text }));
  return { distanceKm: Math.round(legs.reduce((total, leg) => total + leg.distanceKm, 0) * 100) / 100, durationMinutes: legs.reduce((total, leg) => total + leg.durationMinutes, 0), legs, encodedPolyline: route.overview_polyline?.points || null, summary: route.summary || null, navigationUrl: buildNavigationUrl(origin, destination, stops), tollsAvailable: false, source: "configured_maps" };
}

async function geocodeFallback(address: string) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", address);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "br");
  const response = await fetch(url, { headers: { "User-Agent": "H2Particular/1.0 (route-calculation)" } });
  if (!response.ok) throw new Error("Não foi possível localizar este endereço.");
  const results = await response.json() as Array<{ lat: string; lon: string; display_name: string }>;
  const point = results[0];
  if (!point) throw new Error(`Endereço não encontrado: ${address}.`);
  return { latitude: Number(point.lat), longitude: Number(point.lon), label: point.display_name };
}

async function fallbackRoute(origin: string, destination: string, stops: RouteStop[]): Promise<RouteEstimate> {
  const locations = await Promise.all([origin, ...stops.map((stop) => stop.address), destination].map(geocodeFallback));
  const coordinates = locations.map((point) => `${point.longitude},${point.latitude}`).join(";");
  const url = new URL(`https://router.project-osrm.org/route/v1/driving/${coordinates}`);
  url.searchParams.set("overview", "simplified");
  url.searchParams.set("steps", "false");
  const response = await fetch(url, { headers: { "User-Agent": "H2Particular/1.0 (route-calculation)" } });
  if (!response.ok) throw new Error("O serviço de rota não respondeu agora.");
  const data = await response.json() as { code?: string; routes?: Array<{ distance: number; duration: number; geometry?: string }> };
  const route = data.routes?.[0];
  if (data.code !== "Ok" || !route) throw new Error("Não foi possível calcular a rota para estes endereços.");
  const distanceKm = Math.round((route.distance / 1000) * 100) / 100;
  const durationMinutes = Math.max(1, Math.round(route.duration / 60));
  const legs = locations.slice(0, -1).map((point, index) => ({ origin: point.label, destination: locations[index + 1].label, distanceKm: 0, durationMinutes: 0, distanceLabel: "Incluído no trajeto", durationLabel: "Incluído no trajeto" }));
  return { distanceKm, durationMinutes, legs, encodedPolyline: route.geometry || null, summary: "Rota calculada", navigationUrl: buildNavigationUrl(origin, destination, stops), tollsAvailable: false, source: "fallback" };
}

export async function getRouteEstimate(input: { origin: string; destination: string; stops?: RouteStop[] }) {
  const origin = String(input.origin || "").trim();
  const destination = String(input.destination || "").trim();
  const stops = (input.stops || []).filter((stop) => String(stop.address || "").trim());
  if (!origin || !destination) throw new Error("Informe a origem e o destino para calcular a rota.");
  try {
    const directions = await makeRequest<DirectionsResult>("/maps/api/directions/json", { origin, destination, mode: "driving", waypoints: stops.length ? stops.map((stop) => stop.address.trim()).join("|") : undefined, alternatives: false, language: "pt-BR", region: "br" });
    return parseConfiguredRoute(directions, origin, destination, stops);
  } catch (_) {
    try { return await fallbackRoute(origin, destination, stops); }
    catch (fallbackError: any) { throw new Error(fallbackError?.message || "Não foi possível calcular a rota agora. Confira CEP, número e endereço."); }
  }
}

export async function autocompleteAddress(input: string) {
  const search = String(input || "").trim();
  if (search.length < 3) return [];
  try {
    const result = await makeRequest<{ status: string; predictions?: Array<{ description: string; place_id: string }> }>("/maps/api/place/autocomplete/json", { input: search, language: "pt-BR", components: "country:br" });
    if (result.status === "OK") return (result.predictions || []).slice(0, 6).map((prediction) => ({ address: prediction.description, placeId: prediction.place_id }));
  } catch (_) {}
  return [];
}
