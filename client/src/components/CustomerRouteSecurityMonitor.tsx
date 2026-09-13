import { useEffect, useMemo, useRef } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { getCustomerRouteAuditTarget } from "@shared/customerRouteAudit";

const CP_TOKEN_KEY = "cp_token";
const HEARTBEAT_MS = 60_000;

export default function CustomerRouteSecurityMonitor() {
  const [location] = useLocation();
  const mutation = trpc.system.customerRouteHeartbeat.useMutation();
  const lastRouteKeyRef = useRef<string | null>(null);
  const sendInFlightRef = useRef(false);
  const lastSendRef = useRef<{ key: string; sentAt: number } | null>(null);
  const queueRef = useRef<Array<{ sessionToken: string; pathname: string; trigger: "route_change" | "heartbeat" | "tab_visible" }>>([]);
  const trackedRoute = useMemo(() => getCustomerRouteAuditTarget(location), [location]);

  const drainQueue = () => {
    sendInFlightRef.current = true;
    const next = queueRef.current.shift();
    if (!next) {
      sendInFlightRef.current = false;
      return;
    }
    void mutation.mutateAsync({
      sessionToken: next.sessionToken,
      pathname: next.pathname,
      trigger: next.trigger,
    }).catch(() => undefined).finally(() => {
      sendInFlightRef.current = false;
      if (queueRef.current.length > 0) drainQueue();
    });
  };

  const send = (trigger: "route_change" | "heartbeat" | "tab_visible") => {
    if (typeof window === "undefined") return;
    const sessionToken = localStorage.getItem(CP_TOKEN_KEY) || "";
    if (!sessionToken || !trackedRoute.tracked) return;
    const pathname = `${window.location.pathname || location || "/"}${window.location.search || ""}${window.location.hash || ""}`;
    const dedupeKey = `${trackedRoute.routeKey}:${trigger}`;
    const now = Date.now();
    if (lastSendRef.current?.key === dedupeKey && now - lastSendRef.current.sentAt < 2_000) return;
    lastSendRef.current = { key: dedupeKey, sentAt: now };
    queueRef.current.push({ sessionToken, pathname, trigger });
    if (!sendInFlightRef.current) drainQueue();
  };

  useEffect(() => {
    if (!trackedRoute.tracked) {
      lastRouteKeyRef.current = null;
      return;
    }
    if (lastRouteKeyRef.current !== trackedRoute.routeKey) {
      lastRouteKeyRef.current = trackedRoute.routeKey;
      send("route_change");
    }
  }, [trackedRoute.routeKey, trackedRoute.tracked]);

  useEffect(() => {
    if (!trackedRoute.tracked) return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      send("heartbeat");
    }, HEARTBEAT_MS);
    return () => window.clearInterval(timer);
  }, [trackedRoute.routeKey, trackedRoute.tracked]);

  useEffect(() => {
    if (!trackedRoute.tracked) return;
    const onVisible = () => {
      if (!document.hidden) send("tab_visible");
    };
    const onFocus = () => send("tab_visible");
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [trackedRoute.routeKey, trackedRoute.tracked]);

  return null;
}
