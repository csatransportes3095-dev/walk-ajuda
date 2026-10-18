import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
const db=readFileSync("server/db.ts","utf8");
const scheduler=readFileSync("server/autoSchedule.ts","utf8");
const ui=readFileSync("client/src/pages/AdminProducts.tsx","utf8");
const aliases=readFileSync("server/productScheduleAliases.ts","utf8");
describe("rename protection - products and existing orders",()=>{
 it("renames historical orders only by exact old product name in same transaction",()=>{
  expect(db).toContain('UPDATE orderStatusHistory SET serviceName=');
  expect(db).toContain('WHERE serviceName=');
  expect(db).toContain('captureAliasesBeforeProductRename(tx,id,oldName)');
  expect(db).toContain('db.transaction(async tx=>');
  expect(db).toContain('Existem produtos com o mesmo nome antigo');
  expect(db).not.toContain('SET serviceOption=newName');
 });
 it("preserves operational scheduling rules on normal option save",()=>{
  const start=ui.indexOf("const handleSave = () =>");
  const end=ui.indexOf("const totalQuestions",start);
  expect(start).toBeGreaterThan(0);
  expect(ui.slice(start,end)).not.toContain("autoScheduleEnabled:");
  expect(ui).toContain("onAutoScheduleChange(next)");
 });
 it("persists old names and schedules by immutable option id",()=>{
  expect(aliases).toContain("PRIMARY KEY(optionId,productName,optionLabel)");
  expect(db).toContain("captureAliasBeforeOptionRename(tx,id,oldLabel)");
  expect(scheduler).toContain("loadAutomaticProductAliases");
  expect(scheduler).toContain("historical.length===1");
  expect(scheduler).toContain("historical.length>1");
 });
});