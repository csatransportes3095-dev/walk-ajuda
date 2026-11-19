import { isIP } from "node:net";
import type { Request } from "express";

type Source = "render_cf" | "socket" | "express" | "unknown";

function validIp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const address = value.trim();
  if (!address || address.length > 64 || !isIP(address)) return null;
  if (address.toLowerCase().startsWith("::ffff:") && isIP(address.slice(7)) === 4) return address.slice(7);
  return address.toLowerCase();
}

/** Render's public edge overwrites CF-Connecting-IP. Never trust client-supplied
 * forwarding headers outside that environment, or change Express globally. */
export function resolveCustomerOtpRequestSource(
  request: Pick<Request, "headers" | "ip" | "socket">,
): { ip: string; source: Source } {
  if (process.env.RENDER === "true") {
    const address = validIp(request.headers?.["cf-connecting-ip"]);
    if (address) return { ip: address, source: "render_cf" };
  }
  const socket = validIp(request.socket?.remoteAddress);
  if (socket) return { ip: socket, source: "socket" };
  const express = validIp(request.ip);
  if (express) return { ip: express, source: "express" };
  return { ip: "unknown", source: "unknown" };
}
