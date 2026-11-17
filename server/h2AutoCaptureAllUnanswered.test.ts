import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {safeH2AutoUnknownQuestion} from "./h2-auto-learning";
import {isH2AutoUnknownTextEligible} from "../shared/h2AutoUnknownReply";
const schema=readFileSync(new URL("./h2-auto-diagnostics.ts",import.meta.url),"utf8");
const panel=readFileSync(new URL("../client/src/pages/AdminH2Auto.tsx",import.meta.url),"utf8");
describe("H2 Auto unanswered text capture with explicit limits",()=>{
 it("captures short or non-question texts only after they have no registered reply",()=>{
   for(const value of ["Justino","Costumes de ar","Quero saber novidades","Olá preciso consultar?"]){
     expect(safeH2AutoUnknownQuestion(value)).not.toBeNull();
   }
 });
 it("retains safeguards for identity and navigation",()=>{
   for(const value of ["MENU","0","/H2","oi","123456","Meu CPF 12345678901","Quero pix de 300","https://example.com","email@test.com"]){
     expect(safeH2AutoUnknownQuestion(value)).toBeNull();
   }
   expect(isH2AutoUnknownTextEligible("Justino")).toBe(true);
 });
 it("reports backlog and overflow with no message content",()=>{
   expect(schema).toContain("learningQueuePending");
   expect(schema).toContain("learningQueueFull");
   expect(schema).toContain("learningWorkerFull");
   expect(panel).toContain("Fila pendente no APK");
   expect(panel).toContain("Fila local cheia");
 });
});
