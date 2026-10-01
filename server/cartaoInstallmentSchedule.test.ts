import { describe, expect, it } from "vitest";
import { buildInstallmentSchedule } from "./cartaoInstallmentSchedule";

describe("cronograma de parcelas pelo ciclo do cartão", () => {
  const card = { id: 1, fechamentoDia: 25, vencimentoDia: 3 };

  it("compra em 02/08 fecha em 25/08 e primeira parcela vence em 03/09", () => {
    const schedule = buildInstallmentSchedule("2026-08-02", 4, card, "2026-10-01");
    expect(schedule).toEqual([
      expect.objectContaining({ numeroParcela: 1, competencia: "2026-08", fechamento: "2026-08-25", vencimento: "2026-09-03", historicaPaga: true }),
      expect.objectContaining({ numeroParcela: 2, competencia: "2026-09", fechamento: "2026-09-25", vencimento: "2026-10-03", historicaPaga: false }),
      expect.objectContaining({ numeroParcela: 3, competencia: "2026-10", fechamento: "2026-10-25", vencimento: "2026-11-03", historicaPaga: false }),
      expect.objectContaining({ numeroParcela: 4, competencia: "2026-11", fechamento: "2026-11-25", vencimento: "2026-12-03", historicaPaga: false }),
    ]);
  });

  it("compra depois do fechamento entra no ciclo seguinte", () => {
    const [first] = buildInstallmentSchedule("2026-08-28", 1, card, "2026-08-30");
    expect(first).toMatchObject({
      competencia: "2026-09",
      fechamento: "2026-09-25",
      vencimento: "2026-10-03",
      historicaPaga: false,
    });
  });

  it("vencida é paga para histórico, vence hoje ainda não", () => {
    const [past] = buildInstallmentSchedule("2026-08-02", 1, card, "2026-09-04");
    const [today] = buildInstallmentSchedule("2026-08-02", 1, card, "2026-09-03");
    expect(past.historicaPaga).toBe(true);
    expect(today.historicaPaga).toBe(false);
  });

  it("mantém dia da compra somente como referência para descobrir o ciclo", () => {
    const schedule = buildInstallmentSchedule("2026-08-02", 2, card, "2026-08-01");
    expect(schedule.map((x) => x.compraReferencia)).toEqual(["2026-08-02", "2026-09-02"]);
    expect(schedule.map((x) => x.vencimento)).toEqual(["2026-09-03", "2026-10-03"]);
  });
});
