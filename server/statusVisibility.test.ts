import {describe,it,expect} from "vitest";
import {resolveVisibility,type StatusVisibilityRule} from "../shared/statusVisibility";
const rules:StatusVisibilityRule[]=[
 {flowId:0,triggerKey:"foto_reprovada",mode:"current_only",hiddenKeys:[],showNext:false,showProgress:false},
 {flowId:5,triggerKey:"foto_reprovada",mode:"selected",hiddenKeys:["foto_aprovada"],showNext:false,showProgress:true},
];
const keys=["recebido","foto_em_analise","foto_reprovada","foto_aprovada","aguardando_ativa","entregue"];
describe("Visibilidade do status é apenas apresentação",()=>{
 it("mostra só o status atual com ocultação total",()=>expect(resolveVisibility({flowId:0,currentKey:"foto_reprovada",keys,rules})).toEqual({keys:["foto_reprovada"],showNext:false,showProgress:false}));
 it("prioriza a regra do produto sem ocultar status atual",()=>expect(resolveVisibility({flowId:5,currentKey:"foto_reprovada",keys,rules}).keys).not.toContain("foto_aprovada"));
 it("sem regra mantém todos os status",()=>expect(resolveVisibility({flowId:0,currentKey:"em_analise",keys,rules}).keys).toEqual(keys));
 it("não modifica a lista original",()=>{resolveVisibility({flowId:0,currentKey:"foto_reprovada",keys,rules});expect(keys).toHaveLength(6)});
});