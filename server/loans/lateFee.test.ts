import { describe, expect, it } from "vitest";
import { calculateLateFeeDetailsForInstallment, calculateLateFeeForInstallment } from "./lateFee";

const config = {
  enabled: true,
  fee_after_18h: 10,
  fee_after_20h: 10,
  fee_after_midnight_pct: 100,
};

function fee(amount: number, today: string, hour: number, minute: number, dueDate = "2026-08-31") {
  return calculateLateFeeForInstallment({
    dueDate,
    amount,
    config,
    clock: { today, hour, minute },
  });
}

describe("daily loan cumulative late fee", () => {
  it("does not charge before 18:01 on the due date", () => {
    expect(fee(16, "2026-08-31", 18, 0)).toBe(0);
  });

  it("charges R$10 exactly from 18:01 on the current day", () => {
    expect(fee(16, "2026-08-31", 18, 1)).toBe(10);
    expect(fee(16, "2026-08-31", 20, 0)).toBe(10);
  });

  it("charges accumulated R$20 exactly from 20:01", () => {
    expect(fee(16, "2026-08-31", 20, 1)).toBe(20);
    expect(fee(16, "2026-08-31", 23, 58)).toBe(20);
  });

  it("at 23:59 keeps R$20 when 100% of the installment is smaller", () => {
    expect(fee(16, "2026-08-31", 23, 59)).toBe(20);
  });

  it("at 23:59 uses 100% of the installment when it is larger", () => {
    expect(fee(50.4, "2026-08-31", 23, 59)).toBe(50.4);
  });

  it("preserves one completed cycle on the following day before 18:01", () => {
    expect(fee(16, "2026-09-01", 0, 0)).toBe(20);
    expect(fee(50.4, "2026-09-01", 0, 0)).toBe(50.4);
  });

  it("accumulates a complete cycle for every civil day of delay", () => {
    expect(fee(24.5, "2026-08-31", 4, 12, "2026-08-27")).toBe(98);
    expect(fee(24.5, "2026-08-31", 18, 1, "2026-08-27")).toBe(108);
    expect(fee(24.5, "2026-08-31", 20, 1, "2026-08-27")).toBe(118);
    expect(fee(24.5, "2026-08-31", 23, 59, "2026-08-27")).toBe(122.5);
  });

  it("returns the dated sequence for the real 27/08 -> 31/08 example", () => {
    const details = calculateLateFeeDetailsForInstallment({
      dueDate: "2026-08-27",
      amount: 24.5,
      config,
      clock: { today: "2026-08-31", hour: 4, minute: 12 },
    });
    expect(details.completedDays).toBe(4);
    expect(details.currentDayFee).toBe(0);
    expect(details.fee).toBe(98);
    expect(details.entries).toEqual([
      { date: "2026-08-27", fee: 24.5, stage: "23:59", completed: true },
      { date: "2026-08-28", fee: 24.5, stage: "23:59", completed: true },
      { date: "2026-08-29", fee: 24.5, stage: "23:59", completed: true },
      { date: "2026-08-30", fee: 24.5, stage: "23:59", completed: true },
    ]);
  });

  it("does not charge a future installment", () => {
    expect(fee(50.4, "2026-08-30", 23, 59)).toBe(0);
  });

  it("respects a disabled configuration", () => {
    expect(calculateLateFeeForInstallment({
      dueDate: "2026-08-27",
      amount: 50.4,
      config: { ...config, enabled: false },
      clock: { today: "2026-08-31", hour: 23, minute: 59 },
    })).toBe(0);
  });
});
