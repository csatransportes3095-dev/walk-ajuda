import {describe,it,expect} from "vitest";
import {groupVisibleH2AutoOrders,type H2AutoStatusRow} from "./h2-auto-order-history";
const row=(id:number,reg:number,status:string,ts:string,opts:Partial<H2AutoStatusRow>={}):H2AutoStatusRow=>({
  id,registrationId:reg,status,statusLabel:null,orderNumber:null,
  serviceName:null,serviceOption:null,createdAt:ts,...opts
});
describe("H2 AUTO authenticated order timeline",()=>{
  it("reports no orders separately from failed authentication",()=>{
    expect(groupVisibleH2AutoOrders([],[],"recebido")).toEqual([]);
  });
  it("shows latest status, customer-facing catalog label, and service option",()=>{
    const history=[
      row(1,120,"recebido","2026-10-20T10:00:00Z",{orderNumber:155,serviceName:"UBER CARRO",serviceOption:"NOME COMPLETO"}),
      row(2,120,"foto_em_analise","2026-10-21T10:00:00Z",{statusLabel:"FOTO EM ANÁLISE"}),
    ];
    const x=groupVisibleH2AutoOrders(history,[],"recebido");
    expect(x).toMatchObject([{registrationId:120,subOrderIndex:0,orderNumber:155,serviceName:"UBER CARRO",serviceOption:"NOME COMPLETO",status:"foto_em_analise",statusLabel:"FOTO EM ANÁLISE"}]);
    expect(Object.keys(x[0])).not.toContain("note");
  });
  it("keeps distinct cart suborders and excludes only the hidden suborder",()=>{
    const rows=[
      row(1,60,"recebido","2026-10-20T10:00:00Z",{orderNumber:100,serviceName:"UBER CARRO",serviceOption:"NOME ALEATÓRIO"}),
      row(2,60,"ativo","2026-10-20T11:00:00Z"),
      row(3,60,"recebido","2026-10-21T10:00:00Z",{orderNumber:101,serviceName:"UBER MOTO",serviceOption:"NOME COMPLETO"}),
      row(4,60,"em_analise","2026-10-21T11:00:00Z"),
    ];
    expect(groupVisibleH2AutoOrders(rows,[],"recebido").map(x=>x.orderNumber)).toEqual([101,100]);
    expect(groupVisibleH2AutoOrders(rows,[{registrationId:60,subOrderIndex:0}],"recebido").map(x=>x.orderNumber)).toEqual([100]);
    expect(groupVisibleH2AutoOrders(rows,[{registrationId:60,subOrderIndex:1}],"recebido").map(x=>x.orderNumber)).toEqual([101]);
  });
  it("does not infer a former suborder status as a new order",()=>{
    const rows=[row(1,61,"recebido","2026-10-20T10:00:00Z",{orderNumber:102}),
      row(2,61,"foto_aprovada","2026-10-21T11:00:00Z")];
    expect(groupVisibleH2AutoOrders(rows,[],"recebido")).toHaveLength(1);
  });
  it("preserves the source registration and never shows all items if all are hidden",()=>{
    const rows=[row(1,10,"recebido","2026-10-22T10:00:00Z"),row(2,11,"recebido","2026-10-22T11:00:00Z")];
    expect(groupVisibleH2AutoOrders(rows,[{registrationId:10,subOrderIndex:0},{registrationId:11,subOrderIndex:0}],"recebido")).toEqual([]);
    expect(groupVisibleH2AutoOrders(rows,[],"recebido",1)).toHaveLength(1);
  });
});
