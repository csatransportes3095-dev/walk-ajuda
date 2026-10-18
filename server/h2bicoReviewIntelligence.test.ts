import {describe,expect,it} from "vitest";
import {classifyCpfAction,fingerprintCpfs} from "./h2bicoReviewIntelligence";
const base={status:"available",reviewState:"pending" as const,linkedOrder:null,usedAt:null};
describe("H2BICO Intelligence",()=>{
 it("reconhece listas repetidas",()=>{
  expect(fingerprintCpfs(["123","456","123"])).toBe(fingerprintCpfs(["456","123"]));
 });
 it("preserva registros descartados e confirmados",()=>{
  expect(classifyCpfAction("confirm",{...base,reviewState:"confirmed"})).toBe("already");
  expect(classifyCpfAction("confirm",{...base,reviewState:"discarded"})).toBe("protected");
  expect(classifyCpfAction("confirm",base)).toBe("updated");
 });
 it("protege CPFs usados ou vinculados a pedidos",()=>{
  expect(classifyCpfAction("discard",{...base,status:"used"})).toBe("protected");
  expect(classifyCpfAction("discard",{...base,linkedOrder:"order"})).toBe("protected");
 });
});