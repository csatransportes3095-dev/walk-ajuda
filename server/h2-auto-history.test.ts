import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import { createHash } from "node:crypto";
import {
  decodeH2AutoHistory,
  h2AutoHistorySchema,
  mergeH2AutoHistory,
  type H2AutoHistory,
} from "./h2-auto-history";

const { execute, transaction, getDb } = vi.hoisted(() => ({
  execute: vi.fn(),
  transaction: vi.fn(),
  getDb: vi.fn(),
}));
vi.mock("./db", () => ({ getDb }));

import { registerH2AutoDeviceRoutes } from "./h2-auto-remote";

const DEVICE_ID = "0123456789abcdef01234567";
const TOKEN = "a".repeat(64);
const OTHER_TOKEN = "b".repeat(64);
const STREAM_ID = "11111111-1111-4111-8111-111111111111";
const SECOND_STREAM_ID = "22222222-2222-4222-8222-222222222222";
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

const event = (
  sequence: number,
  id = `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
  overrides: Partial<H2AutoHistory["events"][number]> = {}
) => ({
  id,
  sequence,
  occurredAt: 1_700_000_000_000,
  time: `10:${String(sequence).padStart(2, "0")}`,
  chat: "Contato aprovado",
  rule: "Regra de atendimento",
  ...overrides,
});

const history = (
  events: H2AutoHistory["events"],
  overrides: Partial<H2AutoHistory> = {}
): H2AutoHistory => ({
  streamId: STREAM_ID,
  latestSequence: events.reduce((max, item) => Math.max(max, item.sequence), 0),
  baselineSequence: 0,
  events,
  ...overrides,
});

function sqlText(query: any): string {
  return (query?.queryChunks || [])
    .map((chunk: any) => {
      if (typeof chunk === "string") return "?";
      return Array.isArray(chunk?.value) ? chunk.value.join("") : "?";
    })
    .join("");
}

type DbState = {
  revision: number;
  acceptUpdates: boolean;
  storedHistory: H2AutoHistory | null;
  historyInserts: number;
  diagnosticInserts: number;
};

function configureDb(state: DbState) {
  execute.mockImplementation(async (query: any) => {
    const text = sqlText(query);
    if (text.startsWith("CREATE TABLE")) return [[]];
    if (text.includes("SELECT token_hash")) {
      return [
        [
          {
            token_hash: hash(TOKEN),
            revision: state.revision,
          },
        ],
      ];
    }
    if (text.includes("SELECT history_json")) {
      return [
        state.storedHistory
          ? [{ history_json: JSON.stringify(state.storedHistory) }]
          : [],
      ];
    }
    if (text.includes("INSERT INTO h2_auto_history")) {
      state.historyInserts += 1;
      return [{ affectedRows: 1 }];
    }
    if (text.includes("INSERT INTO h2_auto_diagnostics")) {
      state.diagnosticInserts += 1;
      return [{ affectedRows: 1 }];
    }
    if (text.includes("UPDATE h2_auto_devices"))
      return [{ affectedRows: state.acceptUpdates ? 1 : 0 }];
    return [[]];
  });
  transaction.mockImplementation(
    async (callback: (tx: any) => Promise<unknown>) => callback({ execute })
  );
  getDb.mockResolvedValue({ execute, transaction });
}

const servers: Server[] = [];
async function request(path: string, init: RequestInit = {}) {
  const app = express();
  app.use(express.json());
  registerH2AutoDeviceRoutes(app);
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("server address unavailable");
  return fetch(`http://127.0.0.1:${address.port}${path}`, init);
}

function headers(token = TOKEN) {
  return {
    "content-type": "application/json",
    "x-h2-device-id": DEVICE_ID,
    "x-h2-device-token": token,
  };
}

describe("H2 AUTO metadata-only history", () => {
  const state: DbState = {
    revision: 1,
    acceptUpdates: true,
    storedHistory: null,
    historyInserts: 0,
    diagnosticInserts: 0,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    state.revision = 1;
    state.acceptUpdates = true;
    state.storedHistory = null;
    state.historyInserts = 0;
    state.diagnosticInserts = 0;
    configureDb(state);
  });

  afterEach(async () => {
    await Promise.all(
      servers
        .splice(0)
        .map(
          server => new Promise<void>(resolve => server.close(() => resolve()))
        )
    );
  });

  it("strictly accepts the bounded metadata contract and rejects private fields or sequence zero", () => {
    const valid = history([event(1)], {
      baselineSequence: 1,
      latestSequence: 1,
    });
    expect(h2AutoHistorySchema.safeParse(valid).success).toBe(true);
    expect(
      h2AutoHistorySchema.safeParse({
        ...valid,
        events: [event(0)],
      }).success
    ).toBe(false);
    expect(
      h2AutoHistorySchema.safeParse({
        ...valid,
        events: [{ ...event(1), transcript: "texto privado" }],
      }).success
    ).toBe(false);
    expect(
      h2AutoHistorySchema.safeParse({
        ...valid,
        events: [event(1), event(1, "33333333-3333-4333-8333-333333333333")],
      }).success
    ).toBe(false);
    expect(decodeH2AutoHistory(JSON.stringify(valid))).toEqual(valid);
  });

  it("keeps distinct events with the same timestamp and retains records after a local clear", () => {
    const first = history([
      event(1, "00000000-0000-4000-8000-000000000001", {
        occurredAt: 1_700_000_000_000,
      }),
    ]);
    const second = history(
      [
        event(2, "00000000-0000-4000-8000-000000000002", {
          occurredAt: 1_700_000_000_000,
        }),
      ],
      { latestSequence: 2 }
    );
    const merged = mergeH2AutoHistory(first, second);
    expect(merged.events.map(item => item.sequence)).toEqual([2, 1]);

    const cleared = mergeH2AutoHistory(merged, {
      ...second,
      events: [],
    });
    expect(cleared.events.map(item => item.sequence)).toEqual([2, 1]);
    expect(cleared.baselineSequence).toBe(0);
  });

  it("is idempotent, preserves the baseline and never regresses latestSequence", () => {
    const snapshot = history([event(3)], {
      latestSequence: 3,
      baselineSequence: 2,
    });
    const once = mergeH2AutoHistory(null, snapshot);
    const twice = mergeH2AutoHistory(once, snapshot);
    expect(twice).toEqual(once);
    expect(
      mergeH2AutoHistory(once, {
        ...snapshot,
        latestSequence: 1,
        events: [],
        baselineSequence: 1,
      })
    ).toEqual(once);
  });

  it("resets history for a new install stream and rejects event equivocation", () => {
    const current = history([event(1)], { latestSequence: 1 });
    const newStream = history([event(1)], {
      streamId: SECOND_STREAM_ID,
      latestSequence: 1,
    });
    expect(mergeH2AutoHistory(current, newStream)).toEqual(newStream);

    expect(() =>
      mergeH2AutoHistory(current, {
        ...current,
        events: [event(2, current.events[0].id)],
        latestSequence: 2,
      })
    ).toThrow(/changed sequence/);
  });

  it("keeps legacy ACK compatibility and persists history only after authenticated conditional update", async () => {
    const legacy = await request("/api/h2-auto/ack", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ revision: 1 }),
    });
    expect(legacy.status).toBe(200);
    expect(state.historyInserts).toBe(0);

    const incoming = history([event(1)], {
      latestSequence: 1,
      baselineSequence: 0,
    });
    const accepted = await request("/api/h2-auto/ack", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ revision: 1, history: incoming }),
    });
    expect(accepted.status).toBe(200);
    expect(state.historyInserts).toBe(1);
  });

  it("does not persist history for a wrong token, revision race, or invalid strict payload", async () => {
    const incoming = history([event(1)]);
    const wrongToken = await request("/api/h2-auto/ack", {
      method: "POST",
      headers: headers(OTHER_TOKEN),
      body: JSON.stringify({ revision: 1, history: incoming }),
    });
    expect(wrongToken.status).toBe(401);
    expect(state.historyInserts).toBe(0);

    state.acceptUpdates = false;
    const raced = await request("/api/h2-auto/ack", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ revision: 1, history: incoming }),
    });
    expect(raced.status).toBe(409);
    expect(state.historyInserts).toBe(0);

    state.acceptUpdates = true;
    const invalid = await request("/api/h2-auto/ack", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        revision: 1,
        history: {
          ...incoming,
          events: [{ ...incoming.events[0], message: "raw conversation" }],
        },
      }),
    });
    expect(invalid.status).toBe(400);
    expect(state.historyInserts).toBe(0);
  });

  it("reads the stored snapshot under FOR UPDATE and merges it idempotently", async () => {
    const existing = history([event(1)], {
      latestSequence: 1,
      baselineSequence: 1,
    });
    state.storedHistory = existing;
    const incoming = history([event(2)], {
      latestSequence: 2,
      baselineSequence: 2,
    });
    const response = await request("/api/h2-auto/ack", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ revision: 1, history: incoming }),
    });
    expect(response.status).toBe(200);
    expect(state.historyInserts).toBe(1);
    expect(
      execute.mock.calls.some(
        ([query]) =>
          sqlText(query).includes("SELECT history_json") &&
          sqlText(query).includes("FOR UPDATE")
      )
    ).toBe(true);

    const merged = mergeH2AutoHistory(existing, incoming);
    expect(mergeH2AutoHistory(merged, incoming)).toEqual(merged);
    expect(merged.baselineSequence).toBe(1);
    expect(merged.latestSequence).toBe(2);
  });
});
