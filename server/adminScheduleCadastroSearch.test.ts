import { describe, expect, it } from "vitest";
import { filterAdminScheduleAppointments as search } from "../client/src/lib/adminScheduleAppointmentFilter";

const rows = [
  { id: 1, status: "pending", customerNumber: 509, registrationId: 1920001, customerName: "Ana Teste", customerPhone: "11999991111", serviceName: "UBER" },
  { id: 2, status: "confirmed", customerNumber: 509, registrationId: 1920002, customerName: "Ana Teste", customerPhone: "11999991111", serviceName: "UBER" },
  { id: 3, status: "confirmed", customerNumber: 510, registrationId: 509, customerName: "Bruna", customerPhone: "11888882222", serviceName: "Comfort" },
  { id: 4, status: "completed", customerNumber: 509, registrationId: 1920003, customerName: "Ana Teste" },
  { id: 5, status: "cancelled", customerNumber: 509, registrationId: 1920004, customerName: "Ana Teste" },
];
describe("ADM Agendamentos: código do cadastro", () => {
  it("busca *509 em aguardando e confirmado, nunca no pedido 509 de outro cliente", () => {
    expect(search(rows, "*509").map(x => x.id)).toEqual([1, 2]);
  });
  it("busca 509 pelo cadastro e por pedido sem confundir os campos", () => {
    expect(search(rows, "509").map(x => x.id)).toEqual([1, 2, 3]);
  });
  it("busca #509 somente pelo pedido", () => {
    expect(search(rows, "#509").map(x => x.id)).toEqual([3]);
  });
  it("mantém nome, telefone, serviço e pesquisa vazia", () => {
    expect(search(rows, "ana").map(x => x.id)).toEqual([1, 2]);
    expect(search(rows, "99991111").map(x => x.id)).toEqual([1, 2]);
    expect(search(rows, "comfort").map(x => x.id)).toEqual([3]);
    expect(search(rows, "").map(x => x.id)).toEqual([1, 2, 3]);
  });
  it("não associa código 509 a 1509 e não lista finalizados/cancelados", () => {
    expect(search(rows, "*1509")).toEqual([]);
    expect(search(rows, "*509").some(x => x.status === "completed" || x.status === "cancelled")).toBe(false);
  });
});