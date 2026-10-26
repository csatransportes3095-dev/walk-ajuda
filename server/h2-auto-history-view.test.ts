import { describe, expect, it } from "vitest";
import {
  getH2AutoHistoryCategory,
  getInitialHistoryCursor,
  getUnreadHistoryCount,
  historyCursorStorageKey,
  resolveHistoryCursor,
  sortH2AutoHistoryEvents,
  type H2AutoHistory,
  type H2AutoHistoryEvent,
} from "../client/src/lib/h2AutoHistoryView";

const event = (
  sequence: number,
  chat: string,
  rule = "",
  occurredAt = sequence
): H2AutoHistoryEvent => ({
  id: `event-${sequence}`,
  sequence,
  occurredAt,
  time: `2026-10-26 10:0${sequence}`,
  chat,
  rule,
});

const history = (overrides: Partial<H2AutoHistory> = {}): H2AutoHistory => ({
  streamId: "stream-a",
  latestSequence: 8,
  baselineSequence: 3,
  events: [
    event(4, "Olá"),
    event(6, "Digite MENU"),
    event(8, "Áudio recebido"),
  ],
  ...overrides,
});

describe("H2 AUTO admin history view", () => {
  it("counts retained events above the local cursor instead of subtracting sequences", () => {
    expect(getInitialHistoryCursor(history())).toBe(3);
    expect(getUnreadHistoryCount(history(), 3)).toBe(3);
    expect(getUnreadHistoryCount(history(), 6)).toBe(1);
    expect(getUnreadHistoryCount(history(), 8)).toBe(0);
  });

  it("isolates cursors by device and stream, and floors migrated cursors at baseline", () => {
    expect(historyCursorStorageKey("device-1", "stream-a")).not.toBe(
      historyCursorStorageKey("device-1", "stream-b")
    );
    expect(historyCursorStorageKey("device-1", "stream-a")).not.toBe(
      historyCursorStorageKey("device-2", "stream-a")
    );
    expect(resolveHistoryCursor(history(), 1)).toBe(3);
    expect(
      resolveHistoryCursor(
        { ...history(), streamId: "stream-b", baselineSequence: 10 },
        3
      )
    ).toBe(10);
  });

  it("orders timeline events oldest-to-newest with deterministic tie breaks", () => {
    const events = [
      event(4, "B", "", 20),
      event(2, "C", "", 5),
      event(4, "A", "", 10),
    ];
    expect(sortH2AutoHistoryEvents(events).map(item => item.chat)).toEqual([
      "C",
      "A",
      "B",
    ]);
  });

  it("derives the display category from processed response content", () => {
    expect(
      getH2AutoHistoryCategory(event(1, "Digite MENU para escolher"))
    ).toBe("menu");
    expect(
      getH2AutoHistoryCategory(event(2, "Resposta enviada", "bom dia"))
    ).toBe("regras");
    expect(
      getH2AutoHistoryCategory(event(3, "Preciso falar com atendente"))
    ).toBe("atendimento");
    expect(getH2AutoHistoryCategory(event(4, "Áudio recebido"))).toBe("midia");
  });
});
