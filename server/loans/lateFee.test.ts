import { describe, expect, it } from "vitest";
import { calculateLateFeeForInstallment } from "./lateFee";

const config = {
  enabled: true,
  fee_after_18h: 10,
  fee_after_20h: 10,
  fee_after_midnight_pct: 100,
};

function fee(amount: number, dueDate: string, today: string, hour: number, minute: number) {
  return calculateLateFeeForInstallment({
    amount,
    dueDate,
    config,
    clock: { today, hour, minute },
  });
}

describe("taxa de atraso diaria", () => {
  it("nao cobra antes de 18:01 no dia do vencimento", () => {
    expect(fee(50, "2026-08-31", "2026-08-31", 18, 0)).toBe(0);
  });

  it("cobra R$ 10 a partir de 18:01", () => {
    expect(fee(50, "2026-08-31", "2026-08-31", 18, 1)).toBe(10);
    expect(fee(50, "2026-08-31", "2026-08-31", 20, 0)).toBe(10);
  });

  it("cobra R$ 20 acumulados a partir de 20:01", () => {
    expect(fee(50, "2026-08-31", "2026-08-31", 20, 1)).toBe(20);
    expect(fee(50, "2026-08-31", "2026-08-31", 23, 58)).toBe(20);
  });

  it("as 23:59 usa sempre o maior entre taxa fixa e 100% da parcela", () => {
    expect(fee(16, "2026-08-31", "2026-08-31", 23, 59)).toBe(20);
    expect(fee(50, "2026-08-31", "2026-08-31", 23, 59)).toBe(50);
    expect(fee(100.8, "2026-08-31", "2026-08-31", 23, 59)).toBe(100.8);
  });

  it("mantem a mesma regra de maior valor nos dias seguintes", () => {
    expect(fee(16, "2026-08-30", "2026-08-31", 0, 0)).toBe(20);
    expect(fee(100.8, "2026-08-30", "2026-08-31", 0, 0)).toBe(100.8);
  });

  it("nao cobra parcela que ainda nao venceu", () => {
    expect(fee(50, "2026-09-01", "2026-08-31", 23, 59)).toBe(0);
  });

  it("respeita configuracao desativada", () => {
    expect(calculateLateFeeForInstallment({
      amount: 50,
      dueDate: "2026-08-31",
      config: { ...config, enabled: false },
      clock: { today: "2026-08-31", hour: 23, minute: 59 },
    })).toBe(0);
  });
});
