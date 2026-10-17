import { randomBytes } from "node:crypto";

/**
 * Ponte efemera do H2ADS Mobile. Nunca persistir screenshots, comandos ou tokens.
 * Acesso: cookie ADM na borda HTTP/tRPC; Bearer Worker na borda Windows.
 * Um controlador por instancia; expiracao automatica se a aba for fechada.
 */
export const MOBILE_REMOTE_LEASE_MS = 20_000;
export const MOBILE_REMOTE_MAX_FRAME_BYTES = 350_000;
export const MOBILE_REMOTE_MAX_CONCURRENT = 2;
export const MOBILE_REMOTE_MAX_QUEUE = 16;

export type MobileInput =
  | { kind: "tap"; x: number; y: number }
  | { kind: "scroll"; deltaY: number }
  | { kind: "text"; text: string }
  | { kind: "key"; key: "Enter" | "Backspace" | "Tab" | "Escape" };

type InputJob = MobileInput & { id: number };
type Session = {
  adminToken: string;
  workerLeaseId: string;
  workerId: number;
  expiresAt: number;
  frame: Buffer | null;
  frameAt: number;
  captureAskedAt: number;
  pending: InputJob[];
  nextJobId: number;
};

export class H2AdsMobileBridge {
  private sessions = new Map<number, Session>();

  private purge(now: number) {
    for (const [id, item] of this.sessions) {
      if (item.expiresAt <= now) this.sessions.delete(id);
    }
  }

  start(instanceId: number, workerId: number, now = Date.now()): { sessionToken: string; expiresAt: number } {
    this.purge(now);
    if (this.sessions.has(instanceId)) throw new Error("instance_already_controlled");
    if (this.sessions.size >= MOBILE_REMOTE_MAX_CONCURRENT) throw new Error("remote_capacity_reached");
    const adminToken = randomBytes(32).toString("base64url");
    const workerLeaseId = randomBytes(20).toString("base64url");
    const expiresAt = now + MOBILE_REMOTE_LEASE_MS;
    this.sessions.set(instanceId, {
      adminToken, workerLeaseId, workerId, expiresAt, frame: null, frameAt: 0,
      captureAskedAt: 0, pending: [], nextJobId: 1,
    });
    return { sessionToken: adminToken, expiresAt };
  }

  private admin(instanceId: number, token: string, now: number): Session | null {
    this.purge(now);
    const current = this.sessions.get(instanceId);
    if (!current || current.adminToken !== token) return null;
    current.expiresAt = now + MOBILE_REMOTE_LEASE_MS;
    return current;
  }

  readFrame(instanceId: number, token: string, now = Date.now()): { jpeg: Buffer; at: number } | null {
    const current = this.admin(instanceId, token, now);
    if (!current || !current.frame || now - current.frameAt > 6_000) return null;
    return { jpeg: current.frame, at: current.frameAt };
  }

  heartbeat(instanceId: number, token: string, now = Date.now()): boolean {
    return this.admin(instanceId, token, now) !== null;
  }

  input(instanceId: number, token: string, input: MobileInput, now = Date.now()): boolean {
    const current = this.admin(instanceId, token, now);
    if (!current || current.pending.length >= MOBILE_REMOTE_MAX_QUEUE) return false;
    current.pending.push({ ...input, id: current.nextJobId++ });
    return true;
  }

  stop(instanceId: number, token: string): boolean {
    const current = this.sessions.get(instanceId);
    if (!current || current.adminToken !== token) return false;
    this.sessions.delete(instanceId);
    return true;
  }

  revokeWorker(instanceId: number, workerId: number): void {
    const current = this.sessions.get(instanceId);
    if (current && current.workerId === workerId) this.sessions.delete(instanceId);
  }

  workerNext(instanceId: number, workerId: number, now = Date.now()) {
    this.purge(now);
    const current = this.sessions.get(instanceId);
    if (!current || current.workerId !== workerId) return { active: false as const };
    const shouldCapture = now - current.captureAskedAt >= 1_200;
    if (shouldCapture) current.captureAskedAt = now;
    return {
      active: true as const, workerLeaseId: current.workerLeaseId,
      capture: shouldCapture, input: current.pending.shift() ?? null,
    };
  }

  workerFrame(instanceId: number, workerId: number, workerLeaseId: string, jpeg: Buffer, now = Date.now()): boolean {
    this.purge(now);
    const current = this.sessions.get(instanceId);
    if (!current || current.workerId !== workerId || current.workerLeaseId !== workerLeaseId) return false;
    if (!jpeg.length || jpeg.length > MOBILE_REMOTE_MAX_FRAME_BYTES) return false;
    if (jpeg.length < 100 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8 || jpeg[2] !== 0xff ||
        jpeg[jpeg.length - 2] !== 0xff || jpeg[jpeg.length - 1] !== 0xd9) return false;
    if (now - current.frameAt < 700) return false;
    current.frame = Buffer.from(jpeg);
    current.frameAt = now;
    return true;
  }

  clearAll() {
    this.sessions.clear();
  }
}

export const h2AdsMobileBridge = new H2AdsMobileBridge();
export const h2AdsMobileRemoteEnabled = () => process.env.H2ADS_MOBILE_REMOTE_ENABLED === "1";
