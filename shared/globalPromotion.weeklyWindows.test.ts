import { describe, expect, it } from "vitest";
import { globalPromotionWindow, globalPromotionOverridesIndividual, globalPromotionPrice, isValidGlobalPromotionSchedule, weeklyWindowsOverlap } from "./globalPromotion";

const base = { active: true, type:"percentage" as const, value:50, revision:"t", updatedAt:null };
const one = {startDay:5,startTime:"23:00",endDay:6,endTime:"14:00"};
const two = {startDay:6,startTime:"14:01",endDay:0,endTime:"14:00"};
const settings = {...base,schedule:{mode:"weekly_windows" as const,windows:[one,two]}};
const time=(s:string)=>Date.parse(s);
describe("Faixas independentes semanais em Brasília",()=>{
  it("sexta às 23h ativa e termina sábado às 14h",()=>{
    expect(globalPromotionWindow(settings,time("2026-10-16T22:59:59-03:00")).status).toBe("scheduled");
    expect(globalPromotionWindow(settings,time("2026-10-16T23:00:00-03:00")).active).toBe(true);
    expect(globalPromotionWindow(settings,time("2026-10-17T13:59:59-03:00")).active).toBe(true);
    expect(globalPromotionWindow(settings,time("2026-10-17T14:00:00-03:00")).active).toBe(false);
  });
  it("sábado 14:01 até domingo 14:00 sem cruzar descontos",()=>{
    expect(globalPromotionWindow(settings,time("2026-10-17T14:00:59-03:00")).active).toBe(false);
    expect(globalPromotionWindow(settings,time("2026-10-17T14:01:00-03:00")).active).toBe(true);
    expect(globalPromotionWindow(settings,time("2026-10-18T13:59:59-03:00")).active).toBe(true);
    expect(globalPromotionWindow(settings,time("2026-10-18T14:00:00-03:00")).active).toBe(false);
  });
  it("continua repetindo na semana seguinte",()=>{
    expect(globalPromotionWindow(settings,time("2026-10-23T23:05:00-03:00")).active).toBe(true);
  });
  it("suspende ofertas antigas enquanto programada, sem alterar cadastro",()=>{
    expect(globalPromotionOverridesIndividual(settings,time("2026-10-16T20:00:00-03:00"))).toBe(true);
    expect(globalPromotionPrice({price:"350,00",originalPrice:"440,00"},settings,time("2026-10-16T20:00:00-03:00"))).toBe("R$ 440,00");
    expect(globalPromotionPrice({price:"350,00",originalPrice:"440,00"},settings,time("2026-10-16T23:00:00-03:00"))).toBe("R$ 220,00");
    expect(globalPromotionOverridesIndividual({...settings,active:false},time("2026-10-16T23:00:00-03:00"))).toBe(false);
    expect(globalPromotionPrice({price:"350,00",originalPrice:"440,00"},{...settings,active:false},time("2026-10-16T23:00:00-03:00"))).toBe("350,00");
  });
  it("bloqueia sobreposição e aceita janelas separadas por um minuto",()=>{
    expect(weeklyWindowsOverlap([one,two])).toBe(false);
    expect(isValidGlobalPromotionSchedule(settings.schedule)).toBe(true);
    expect(isValidGlobalPromotionSchedule({mode:"weekly_windows",windows:[one,{startDay:6,startTime:"13:00",endDay:0,endTime:"14:00"}]})).toBe(false);
  });
  it("atravessa sábado para domingo, e domingo para segunda",()=>{
    const overnight={...base,schedule:{mode:"weekly_windows" as const, windows:[{startDay:0,startTime:"23:00",endDay:1,endTime:"06:00"}]}};
    expect(globalPromotionWindow(overnight,time("2026-10-18T23:00:00-03:00")).active).toBe(true);
    expect(globalPromotionWindow(overnight,time("2026-10-19T05:59:00-03:00")).active).toBe(true);
    expect(globalPromotionWindow(overnight,time("2026-10-19T06:00:00-03:00")).active).toBe(false);
  });
});
