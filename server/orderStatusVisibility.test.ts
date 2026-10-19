import {describe,it,expect} from "vitest";
import {resolveStatusVisibility,getNextVisibleStatusKey} from "../shared/orderStatusVisibility";
describe("Visibilidade de status H2",()=>{
 const steps=["recebido","foto_em_analise","foto_reprovada","foto_aprovada","aguardando_ativa","entregue"];
 it("preserva jornada antiga quando regra nao existe",()=>expect(resolveStatusVisibility(steps,"foto_reprovada").visibleKeys).toEqual(steps));
 it("oculta selecionados sem ocultar status atual",()=>{
  const result=resolveStatusVisibility(steps,"foto_reprovada",{mode:"hide_selected",hiddenStatusKeys:["foto_aprovada","foto_reprovada"],showNextStep:false,showProgress:true});
  expect(result.visibleKeys).not.toContain("foto_aprovada");
  expect(result.visibleKeys).toContain("foto_reprovada");
  expect(result.showNextStep).toBe(false);
  expect(getNextVisibleStatusKey(steps,result.visibleKeys,2)).toBe("aguardando_ativa");
 });
 it("pode mostrar somente status atual sem mexer no fluxo real",()=>{
  const result=resolveStatusVisibility(steps,"foto_reprovada",{mode:"current_only",hiddenStatusKeys:[],showNextStep:true,showProgress:true});
  expect(result).toEqual({visibleKeys:[],showTimeline:false,showNextStep:false,showProgress:false});
  expect(steps).toHaveLength(6);
 });
});
