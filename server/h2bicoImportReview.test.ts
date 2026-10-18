import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
import {shouldPreselectH2BicoPhoto,formatMissingH2BicoCpfs} from "../client/src/lib/h2bicoImportReview";
const base={alreadyExists:false,validCpf:true,name:"MARIA SILVA",confidence:93,cpfSuggestion:null,whitePhotoCrop:{x:100,y:300,width:180,height:225},warnings:["Bordas da foto pouco visíveis. Confira o enquadramento antes de salvar."]};
describe("H2BICO safe automatic checkbox and copy",()=>{
 it("auto-selects valid new white-background photo, without auto-saving",()=>expect(shouldPreselectH2BicoPhoto(base)).toBe(true));
 it("never selects existing or invalid or missing photo",()=>{
  expect(shouldPreselectH2BicoPhoto({...base,alreadyExists:true})).toBe(false);
  expect(shouldPreselectH2BicoPhoto({...base,validCpf:false})).toBe(false);
  expect(shouldPreselectH2BicoPhoto({...base,whitePhotoCrop:null})).toBe(false);
  expect(shouldPreselectH2BicoPhoto({...base,cpfSuggestion:"12345678901"})).toBe(false);
  expect(shouldPreselectH2BicoPhoto({...base,warnings:["CONFIRA O NUMERO"]})).toBe(false);
 });
 it("copies all missing CPFs in original order with leading zeros",()=>expect(formatMissingH2BicoCpfs(["01234567890","09876543210"])).toBe("01234567890\n09876543210"));
});
describe("legacy print formats and select-all controls",()=>{
 it("keeps a single explicit Save action and selects only bounded portraits",()=>{
  const source=readFileSync("client/src/components/H2BicoScreenshotImporter.tsx","utf8");
  expect(source).toContain("SELECIONAR TODOS");
  expect(source).toContain("DESMARCAR TODOS");
  expect(source).toContain('ctx.drawImage(image,x,y,size,size,0,0,size,size)');
  expect(source).toContain('canvas.toDataURL("image/jpeg",0.9)');
  expect(source).not.toContain('if(item.cropMode!=="white"||!item.whiteCrop)');
 });
});
