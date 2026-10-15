export type NoteSaveStatus = "pending" | "saving" | "saved" | "error";
type SaveNote = (id: number, content: string) => Promise<void>;
type Entry = {
  text: string;
  saved: string;
  status: NoteSaveStatus;
  uploads: number;
  attempts: number;
  timer?: ReturnType<typeof setTimeout>;
  maxTimer?: ReturnType<typeof setTimeout>;
  flight?: Promise<void>;
};

/** One queue per order/query client, retained across tab/card remounts.
 * Only user edits enqueue writes. Nothing is stored in localStorage.
 */
export class OrderNoteAutosave {
  private entries = new Map<number, Entry>();
  private removed = new Set<number>();
  private listeners = new Set<() => void>();
  private version = 0;
  private save: SaveNote;
  private delay: number;
  private maxWait: number;
  private retryDelays: number[];

  constructor(save: SaveNote, delay = 600, maxWait = 3000, retryDelays = [2000, 5000, 15000]) {
    this.save = save;
    this.delay = delay;
    this.maxWait = maxWait;
    this.retryDelays = retryDelays;
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); this.releaseCleanEntries(); };
  };
  private releaseCleanEntries() {
    if (this.listeners.size) return;
    for (const [id, entry] of this.entries) {
      if (!entry.flight && !entry.uploads && entry.text === entry.saved) {
        this.clearTimers(entry); this.entries.delete(id);
      }
    }
  }
  getSnapshot = () => this.version;
  private emit() { this.version++; this.listeners.forEach(listener => listener()); }
  private clearTimers(entry: Entry) {
    clearTimeout(entry.timer); clearTimeout(entry.maxTimer);
    entry.timer = undefined; entry.maxTimer = undefined;
  }
  private ensure(id: number, original: string) {
    if (this.removed.has(id)) return undefined;
    let entry = this.entries.get(id);
    if (!entry) {
      entry = { text: original, saved: original, status: "saved", uploads: 0, attempts: 0 };
      this.entries.set(id, entry);
    }
    return entry;
  }

  text(id: number, original: string) { return this.entries.get(id)?.text ?? original; }
  status(id: number) { return this.entries.get(id)?.status; }
  uploading(id: number) { return (this.entries.get(id)?.uploads ?? 0) > 0; }
  isRemoved(id: number) { return this.removed.has(id); }
  hasPending = () => [...this.entries.values()].some(e => e.text !== e.saved || !!e.flight || e.uploads > 0);

  change(id: number, content: string, original: string, immediately = false) {
    const entry = this.ensure(id, original);
    if (!entry) return;
    entry.text = content;
    entry.attempts = 0;
    clearTimeout(entry.timer);
    if (!entry.flight && content === entry.saved) {
      this.clearTimers(entry); entry.status = "saved"; this.emit(); return;
    }
    entry.status = entry.flight ? "saving" : "pending";
    this.emit();
    if (immediately) { void this.flush(id); return; }
    entry.timer = setTimeout(() => { void this.flush(id); }, this.delay);
    if (!entry.maxTimer) entry.maxTimer = setTimeout(() => { void this.flush(id); }, this.maxWait);
  }

  flush = (id: number): Promise<void> => {
    const entry = this.entries.get(id);
    if (!entry || this.removed.has(id)) return Promise.resolve();
    this.clearTimers(entry);
    if (entry.flight) return entry.flight;
    if (entry.text === entry.saved) return Promise.resolve();
    // Defer until flight is assigned, including synchronous transport failures.
    const task = Promise.resolve().then(async () => {
      while (!this.removed.has(id) && entry.text !== entry.saved) {
        const content = entry.text;
        entry.status = "saving"; this.emit();
        try {
          await this.save(id, content);
        } catch (error) {
          if (this.removed.has(id)) return;
          entry.status = "error";
          this.clearTimers(entry);
          const code = (error as { data?: { code?: string } })?.data?.code;
          const permanent = ["UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "BAD_REQUEST"].includes(code ?? "");
          const retryDelay = permanent ? undefined : this.retryDelays[entry.attempts++];
          if (retryDelay !== undefined) entry.timer = setTimeout(() => { void this.flush(id); }, retryDelay);
          return;
        }
        if (this.removed.has(id)) return;
        entry.saved = content;
        entry.attempts = 0;
        this.clearTimers(entry);
        // Edits made during the request are sent next, never in parallel.
      }
      entry.status = "saved";
    }).finally(() => { entry.flight = undefined; this.releaseCleanEntries(); this.emit(); });
    entry.flight = task;
    this.emit();
    return task;
  };

  flushAll = () => Promise.all([...this.entries.keys()].map(id => this.flush(id))).then(() => undefined);
  beginUpload(id: number, original: string) {
    const entry = this.ensure(id, original);
    if (!entry || entry.uploads) return false;
    entry.uploads++; this.emit(); return true;
  }
  endUpload(id: number) {
    const entry = this.entries.get(id);
    if (entry) { entry.uploads = Math.max(0, entry.uploads - 1); this.releaseCleanEntries(); this.emit(); }
  }
  discard(id: number) {
    this.removed.add(id);
    const entry = this.entries.get(id);
    if (entry) this.clearTimers(entry);
    this.entries.delete(id); this.emit();
  }
}

const registries = new WeakMap<object, Map<number, OrderNoteAutosave>>();
export function getOrderNoteAutosave(owner: object, registrationId: number, save: SaveNote) {
  let registry = registries.get(owner);
  if (!registry) {
    registry = new Map(); registries.set(owner, registry);
    // Keep pending writes protected even after the Notes tab unmounts.
    if (typeof window !== "undefined") {
      const queues = registry;
      window.addEventListener("beforeunload", event => {
        if (![...queues.values()].some(queue => queue.hasPending())) return;
        queues.forEach(queue => { void queue.flushAll(); });
        event.preventDefault(); event.returnValue = "";
      });
      window.addEventListener("online", () => queues.forEach(queue => { void queue.flushAll(); }));
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") queues.forEach(queue => { void queue.flushAll(); });
      });
    }
  }
  let queue = registry.get(registrationId);
  if (!queue) { queue = new OrderNoteAutosave(save); registry.set(registrationId, queue); }
  return queue;
}
