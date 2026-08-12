import { makeRequest, type DirectionsResult } from "../_core/map";

export type RouteStop = { address: string };

export function buildNavigationUrl(origin: string, destination: string, stops: RouteStop[] = []) {
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("origin", origin);
  url.searchParams.set("destination", destination);
  if (stops.length) url.searchParams.set("waypoints", stops.map((stop) => stop.address).join("|"));
  url.searchParams.set("travelmode", "driving");
  return url.toString();
}

export async function getRouteEstimate(input: { origin: string; destination: string; stops?: RouteStop[] }) {
  const origin = String(input.origin || "").trim();
  const destination = String(input.destination || "").trim();
  const stops = (input.stops || []).filter((stop) => String(stop.address || "").trim());
  if (!origin || !destination) throw new Error("Informe a origem e o destino para calcular a rota.");
  const directions = await makeRequest<DirectionsResult>("/maps/api/directions/json", {
    origin,
    destination,
    mode: "driving",
    waypoints: stops.length ? stops.map((stop) => stop.address.trim()).join("|") : undefined,
    alternatives: false,
    language: "pt-BR",
    region: "br",
  });
  if (directions.status !== "OK" || !directions.routes?.[0]?.legs?.length) {
    const message = directions.status === "ZERO_RESULTS" ? "Não foi possível encontrar uma rota entre os endereços informados." : "Não foi possível calcular a rota agora. Confira os endereços e tente novamente.";
    throw new Error(message);
  }
  const route = directions.routes[0];
  const legs = route.legs.map((leg) => ({
    origin: leg.start_address,
    destination: leg.end_address,
    distanceKm: Math.round((leg.distance.value / 1000) * 100) / 100,
    durationMinutes: Math.max(1, Math.round(leg.duration.value / 60)),
    distanceLabel: leg.distance.text,
    durationLabel: leg.duration.text,
  }));
  const distanceKm = Math.round(legs.reduce((total, leg) => total + leg.distanceKm, 0) * 100) / 100;
  const durationMinutes = legs.reduce((total, leg) => total + leg.durationMinutes, 0);
  return {
    distanceKm,
    durationMinutes,
    legs,
    encodedPolyline: route.overview_polyline?.points || null,
    summary: route.summary || null,
    navigationUrl: buildNavigationUrl(origin, destination, stops),
    tollsAvailable: false,
  };
}

export async function autocompleteAddress(input: string) {
  const search = String(input || "").trim();
  if (search.length < 3) return [];
  const result = await makeRequest<{ status: string; predictions?: Array<{ description: string; place_id: string }> }>("/maps/api/place/autocomplete/json", { input: search, language: "pt-BR", components: "country:br" });
  if (result.status !== "OK" && result.status !== "ZERO_RESULTS") return [];
  return (result.predictions || []).slice(0, 6).map((prediction) => ({ address: prediction.description, placeId: prediction.place_id }));
}
