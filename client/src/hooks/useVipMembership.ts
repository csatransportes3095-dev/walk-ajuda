import { useEffect } from "react";
import { trpc } from "@/lib/trpc";

const VIP_ACTIVE_KEY = "walk_vip_active";
const VIP_EXPIRES_KEY = "walk_vip_expires";

function normalizePhone(value: string) {
  let digits = String(value || "").replace(/\D/g, "");
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) digits = digits.slice(2);
  return digits;
}

function legacyVipState() {
  if (typeof window === "undefined") return { active: false, expiresAt: null as number | null };
  if (localStorage.getItem("walk_access_type") !== "vip") return { active: false, expiresAt: null };
  const raw = localStorage.getItem("walk_access_expires");
  if (!raw) return { active: true, expiresAt: null };
  const expiresAt = new Date(raw).getTime();
  return { active: Number.isFinite(expiresAt) && expiresAt > Date.now(), expiresAt: Number.isFinite(expiresAt) ? expiresAt : null };
}

export function useVipMembership() {
  const phone = typeof window !== "undefined" ? normalizePhone(localStorage.getItem("walk_client_phone") || "") : "";
  const cachedExpires = typeof window !== "undefined" ? Number(localStorage.getItem(VIP_EXPIRES_KEY) || 0) : 0;
  const cachedActive = typeof window !== "undefined" && localStorage.getItem(VIP_ACTIVE_KEY) === "true" && cachedExpires > Date.now();
  const legacy = legacyVipState();
  const query = trpc.vipMemberships.status.useQuery(
    { phone },
    {
      enabled: phone.length >= 10,
      staleTime: 15_000,
      refetchInterval: 30_000,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: 2,
    },
  );

  const membershipActive = query.data ? Boolean(query.data.active) : cachedActive;
  const expiresAt = query.data?.active ? Number(query.data.expiresAtMs || 0) || null : (membershipActive ? cachedExpires || null : legacy.expiresAt);
  const isVipCustomer = membershipActive || legacy.active;

  useEffect(() => {
    if (typeof window === "undefined" || !query.data) return;
    if (query.data.active && query.data.expiresAtMs) {
      localStorage.setItem(VIP_ACTIVE_KEY, "true");
      localStorage.setItem(VIP_EXPIRES_KEY, String(query.data.expiresAtMs));
    } else {
      localStorage.removeItem(VIP_ACTIVE_KEY);
      localStorage.removeItem(VIP_EXPIRES_KEY);
    }
  }, [query.data?.active, query.data?.expiresAtMs]);

  return {
    isVipCustomer,
    membershipActive,
    expiresAt,
    daysLeft: query.data?.daysLeft ?? (membershipActive && expiresAt ? Math.max(0, Math.ceil((expiresAt - Date.now()) / 86400000)) : 0),
    status: query.data?.status ?? (membershipActive ? "active" : "none"),
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
