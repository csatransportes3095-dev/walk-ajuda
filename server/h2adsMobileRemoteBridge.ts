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
  | { kind: "scroll"; deltaY: number; x?: number; y?: number }
  | { kind: "text"; text: string }
  | { kind: "key"; key: "Enter" | "Backspace" | "Tab" | "Escape" };

type InputJob = MobileInput & { id: number };
export type MobileInputResultState = "sent" | "blocked" | "failed";
export type MobileInputResultReason = "target_unavailable" | "target_changed" | "chrome_error" | null;
export type MobileRemoteTab = { targetId: string; title: string; label: string; kind: "web" | "label" };
type InputReceipt = {
  id: number;
  kind: MobileInput["kind"];
  state: "queued" | MobileInputResultState;
  reason: MobileInputResultReason;
  at: number;
};
type Session = {
  adminToken: string;
  workerLeaseId: string;
  workerId: number;
  expiresAt: number;
  frame: Buffer | null;
  frameAt: number;
  captureAskedAt: number;
  pending: InputJob[];
  inFlight: InputJob | null;
  lastInput: InputReceipt | null;
  tabs: MobileRemoteTab[];
  selectedTargetId: string | null;
  selectionRequired: boolean;
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
      captureAskedAt: 0, pending: [], inFlight: null, lastInput: null,
      tabs: [], selectedTargetId: null, selectionRequired: false, nextJobId: 1,
    });
    return { sessionToken: adminToken, expiresAt };
  }

  workerTabs(instanceId: number, workerId: number, workerLeaseId: string, tabs: MobileRemoteTab[], now = Date.now()): boolean {
    this.purge(now);
    const current = this.sessions.get(instanceId);
    if (!current || current.workerId !== workerId || current.workerLeaseId !== workerLeaseId ||
        !Array.isArray(tabs) || tabs.length > 20 || tabs.some(tab =>
          !tab || typeof tab.targetId !== "string" || !/^[a-fA-F0-9-]{1,128}$/.test(tab.targetId) ||
          typeof tab.title !== "string" || tab.title.length > 120 ||
          typeof tab.label !== "string" || tab.label.length > 120 ||
          !["web", "label"].includes(tab.kind))) return false;
    current.tabs = tabs.map(tab => ({ ...tab }));
    if (current.selectedTargetId && !tabs.some(tab => tab.targetId === current.selectedTargetId)) {
      current.selectedTargetId = null;
      current.selectionRequired = true;
      current.frame = null;
      current.frameAt = 0;
      current.pending = [];
      current.inFlight = null;
    }
    // A guia de identificacao local nao bloqueia uma unica aba web.
    const webTabs = tabs.filter(tab => tab.kind === "web");
    if (!current.selectedTargetId && !current.selectionRequired) {
      const only = webTabs.length === 1 ? webTabs[0] : tabs.length === 1 ? tabs[0] : null;
      if (only) current.selectedTargetId = only.targetId;
    }
    return true;
  }

  tabStatus(instanceId: number, token: string, now = Date.now()) {
    const current = this.admin(instanceId, token, now);
    return current ? {
      tabs: current.tabs.map(tab => ({ ...tab })),
      selectedTargetId: current.selectedTargetId,
    } : null;
  }

  selectTab(instanceId: number, token: string, targetId: string, now = Date.now()): boolean {
    const current = this.admin(instanceId, token, now);
    if (!current || !current.tabs.some(tab => tab.targetId === targetId)) return false;
    if (current.selectedTargetId === targetId) return true;
    current.selectedTargetId = targetId;
    current.selectionRequired = false;
    current.frame = null;
    current.frameAt = 0;
    current.pending = [];
    current.inFlight = null;
    current.lastInput = null;
    return true;
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
    if (!current || current.pending.length + (current.inFlight ? 1 : 0) >= MOBILE_REMOTE_MAX_QUEUE) return false;
    const job = { ...input, id: current.nextJobId++ };
    current.pending.push(job);
    current.lastInput = { id: job.id, kind: input.kind, state: "queued", reason: null, at: now };
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
      capture: shouldCapture, selectedTargetId: current.selectedTargetId,
      input: current.inFlight ?? (current.inFlight = current.pending.shift() ?? null),
    };
  }

  // O comando nao sai definitivamente da fila ate o Worker confirmar o envio
  // ao CDP. A confirmacao nao significa que a pagina mudou visualmente.
  workerInputResult(
    instanceId: number, workerId: number, workerLeaseId: string, jobId: number,
    state: MobileInputResultState, reason: MobileInputResultReason, now = Date.now(),
  ): boolean {
    this.purge(now);
    const current = this.sessions.get(instanceId);
    if (!current || current.workerId !== workerId || current.workerLeaseId !== workerLeaseId ||
        !current.inFlight || current.inFlight.id !== jobId) return false;
    const job = current.inFlight;
    current.inFlight = null;
    if (!current.lastInput || current.lastInput.id <= jobId) {
      current.lastInput = { id: jobId, kind: job.kind, state, reason, at: now };
    }
    return true;
  }

  lastInputStatus(instanceId: number, token: string, now = Date.now()): InputReceipt | null {
    const current = this.admin(instanceId, token, now);
    return current?.lastInput ? { ...current.lastInput } : null;
  }

  workerFrame(instanceId: number, workerId: number, workerLeaseId: string, jpeg: Buffer, now = Date.now(), targetId?: string): boolean {
    this.purge(now);
    const current = this.sessions.get(instanceId);
    if (!current || current.workerId !== workerId || current.workerLeaseId !== workerLeaseId ||
        !current.selectedTargetId || targetId !== current.selectedTargetId) return false;
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
