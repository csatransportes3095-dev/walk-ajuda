import { describe, it, expect } from "vitest";
import { globalPromotionWindow, globalPromotionIsActive, calculateGlobalPromotionPrice, parseGlobalPromotionConfig, isValidGlobalPromotionSchedule } from "./globalPromotion";

const base = { active: true, type: "percentage" as const, value: 50, revision: "test", updatedAt: null };
const ms = (date: string) => Date.parse(date);
const period = { ...base, schedule: { mode: "period" as const, startAt: "2026-10-15T23:00:00-03:00", endAt: "2026-10-16T06:00:00-03:00" } };
const weekly = { ...base, schedule: { mode: "weekly" as const, weekdays: [1,2], startsOn: "2026-10-12", endsOn: "2026-10-20", startTime: "23:00", endTime: "06:00" } };
const price = { price: "400,00", originalPrice: "500,00" };

describe("programação da promoção geral em Brasília", () => {
  it("mantém a promoção manual existente sem programação", () => {
    expect(globalPromotionIsActive(base)).toBe(true);
    expect(parseGlobalPromotionConfig(JSON.stringify(base)).schedule).toBeNull();
  });
  it("inicia e encerra exatamente nos instantes gravados", () => {
    expect(globalPromotionWindow(period, ms("2026-10-15T22:59:59-03:00")).status).toBe("scheduled");
    expect(globalPromotionWindow(period, ms("2026-10-15T23:00:00-03:00")).active).toBe(true);
    expect(globalPromotionWindow(period, ms("2026-10-16T05:59:59-03:00")).active).toBe(true);
    expect(globalPromotionWindow(period, ms("2026-10-16T06:00:00-03:00")).active).toBe(false);
    expect(calculateGlobalPromotionPrice(price, period, ms("2026-10-16T05:00:00-03:00")).final).toBe("R$ 250,00");
    expect(calculateGlobalPromotionPrice(price, period, ms("2026-10-16T06:00:00-03:00")).final).toBe("R$ 400,00");
  });
  it("segunda e terça às 23h permanecem válidas até as 6h do dia seguinte", () => {
    expect(globalPromotionWindow(weekly, ms("2026-10-12T23:00:00-03:00")).active).toBe(true);
    expect(globalPromotionWindow(weekly, ms("2026-10-13T05:59:59-03:00")).active).toBe(true);
    expect(globalPromotionWindow(weekly, ms("2026-10-13T06:00:00-03:00")).active).toBe(false);
    expect(globalPromotionWindow(weekly, ms("2026-10-13T23:00:00-03:00")).active).toBe(true);
    expect(globalPromotionWindow(weekly, ms("2026-10-14T05:59:59-03:00")).active).toBe(true);
    expect(globalPromotionWindow(weekly, ms("2026-10-14T06:00:00-03:00")).active).toBe(false);
  });
  it("encerra a recorrência após o último dia configurado", () => {
    expect(globalPromotionWindow(weekly, ms("2026-10-21T06:00:00-03:00")).status).toBe("expired");
  });
  it("preserva desconto salvo quando desativado e rejeita agendas inválidas", () => {
    expect(globalPromotionWindow({ ...weekly, active: false }, ms("2026-10-13T00:00:00-03:00")).status).toBe("disabled");
    expect(isValidGlobalPromotionSchedule({ mode: "weekly", weekdays: [], startsOn: "2026-10-12", endsOn: "2026-10-13", startTime: "23:00", endTime: "06:00" })).toBe(false);
    expect(parseGlobalPromotionConfig(JSON.stringify({ ...base, schedule: { mode: "period", startAt: "2026-10-16T06:00:00-03:00", endAt: "2026-10-15T23:00:00-03:00" } })).active).toBe(false);
  });
});
