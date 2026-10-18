import { describe, expect, it } from "vitest";
import { classifySiteBulkStatus, filterSiteBulkCandidates, prepareSiteBulkCandidates, selectVisibleSiteBulkOrders, splitSiteBulkBatches } from "../shared/siteSecurityBulk";

const customers = [
  { id: 1, name: "Ana", email: " ANA@EXEMPLO.COM ", phone: "(61) 99999-1001" },
  { id: 2, name: "Bruno", email: "bruno@exemplo.com", phone: "61999991002" },
  { id: 3, name: "Carlos", email: "carlos@exemplo.com", phone: "61999991003" },
  { id: 4, name: "Denise", email: "denise@exemplo.com", phone: "61999991004" },
  { id: 5, name: "Bloqueado", email: "bloqueado@exemplo.com", phone: "61999991005", blocked: 1 },
  { id: 6, name: "Duplicada", email: "ana@exemplo.com", phone: "61999991006" },
  { id: 7, name: "Sem email", email: "invalido", phone: "61999991007" },
  { id: 8, name: "Lixeira", email: "lixeira@exemplo.com", phone: "61999991008", deletedAt: new Date() },
];
const orders = [
  { customerPhone: "61999991001", status: "conta_ativa" },
  { customerPhone: "61999991002", status: "pedido_entregue" },
  { customerPhone: "61999991003", status: "foto_em_analise" },
];

describe("Importacao de e-mails na Seguranca do Site", () => {
  const list = prepareSiteBulkCandidates(customers, orders, ["BRUNO@exemplo.com"]);
  it("normaliza e remove e-mails invalidos, duplicados e cadastros bloqueados/excluidos", () => {
    expect(list.map(c => c.email)).toEqual([
      "ana@exemplo.com", "bruno@exemplo.com", "carlos@exemplo.com", "denise@exemplo.com",
    ]);
  });
  it("distingue ativo, entregue, andamento e sem pedido", () => {
    expect(filterSiteBulkCandidates(list, "active").map(c => c.name)).toEqual(["Ana"]);
    expect(filterSiteBulkCandidates(list, "delivered").map(c => c.name)).toEqual(["Bruno"]);
    expect(filterSiteBulkCandidates(list, "in_progress").map(c => c.name)).toEqual(["Carlos"]);
    expect(filterSiteBulkCandidates(list, "without_orders").map(c => c.name)).toEqual(["Denise"]);
    expect(filterSiteBulkCandidates(list, "with_orders")).toHaveLength(3);
  });
  it("nao reativa automaticamente autorizacao suspensa ou existente", () => {
    expect(list.find(c => c.name === "Bruno")?.alreadyAuthorized).toBe(true);
  });
  it("aceita pesquisa por nome, email e telefone", () => {
    expect(filterSiteBulkCandidates(list, "all", "ANA")).toHaveLength(1);
    expect(filterSiteBulkCandidates(list, "all", "BRUNO@EXEMPLO.COM")).toHaveLength(1);
    expect(filterSiteBulkCandidates(list, "all", "1004")).toHaveLength(1);
  });
  it("separa subpedidos e exclui os ocultados do ADM", () => {
    const orders = selectVisibleSiteBulkOrders([
      {id:1,registrationId:12,customerPhone:"61999991001",status:"recebido"},
      {id:2,registrationId:12,customerPhone:"61999991001",status:"pedido_entregue"},
      {id:3,registrationId:12,customerPhone:"61999991001",status:"recebido"},
      {id:4,registrationId:12,customerPhone:"61999991001",status:"conta_ativa"},
      {id:5,registrationId:13,customerPhone:"61999991002",status:"recebido"},
    ], [{registrationId:12,subOrderIndex:1}]);
    expect(orders).toEqual([
      {customerPhone:"61999991001",status:"conta_ativa"},
      {customerPhone:"61999991002",status:"recebido"},
    ]);
  });
  it("permite mais de 500 clientes repartindo em lotes sem duplicar IDs", () => {
    const batches=splitSiteBulkBatches(Array.from({length:1205},(_,i)=>i+1).concat([42]));
    expect(batches.map(b=>b.length)).toEqual([500,500,205]);
    expect(new Set(batches.flat()).size).toBe(1205);
  });
  it("inclui emprestimos antigos e ativos independentemente do status dos pedidos", () => {
    const matches = new Map([["cpf:12345678901",2],["phone:61999991004",1]]);
    const withLoans=prepareSiteBulkCandidates(
      [{ id:20,name:"Antigo",email:"antigo@exemplo.com",phone:"61911112222",cpf:"123.456.789-01" },
       { id:21,name:"Atual",email:"atual@exemplo.com",phone:"61999991004" }],
      [], [], matches,
    );
    expect(filterSiteBulkCandidates(withLoans,"with_loans").map(c=>c.email)).toEqual(["antigo@exemplo.com","atual@exemplo.com"]);
    expect(filterSiteBulkCandidates(withLoans,"without_orders")).toHaveLength(2);
  });
  it("classifica cancelamentos fora dos pedidos em andamento", () => {
    expect(classifySiteBulkStatus("cancelado")).toBe("other");
    expect(classifySiteBulkStatus("p")).toBe("active");
  });
});