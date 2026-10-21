import {describe,it,expect} from "vitest";
import {matchCpfAvatarFaces} from "../client/src/lib/h2bicoCpfAvatarMatcher";
const image=(w=700,h=800)=>{const data=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;const v=(x>80&&x<600&&y>70&&y<600)?((x+y)%80<30?160:218):18;data[i]=v;data[i+1]=v;data[i+2]=v;data[i+3]=255;}return {data,width:w,height:h};};
describe("CPF and avatar exclusive association",()=>{
 it("pairs two faces with their own CPFs in adjacent cards",()=>{
  const faces=[{x:125,y:140,width:68,height:78,score:.95},{x:445,y:140,width:68,height:78,score:.93}];
  const cpfs=[{cpf:"11111111111",cpfBox:{x:120,y:330,width:102,height:24}},{cpf:"22222222222",cpfBox:{x:440,y:330,width:102,height:24}}];
  const out=matchCpfAvatarFaces(cpfs,faces,image());
  expect(out[0]?.faceIndex).toBe(0);
  expect(out[1]?.faceIndex).toBe(1);
  expect(out[0]?.crop.x!+out[0]?.crop.width!).toBeLessThan(out[1]!.crop.x);
 });
 it("does not associate a remote CPF to an arbitrary face",()=>{
  const out=matchCpfAvatarFaces([{cpf:"11111111111",cpfBox:{x:600,y:700,width:90,height:20}}],[{x:80,y:50,width:65,height:78,score:.95}],image());
  expect(out[0]).toBeNull();
 });
 it("does not reuse a single face for two CPFs",()=>{
  const faces=[{x:150,y:150,width:65,height:80,score:.96}];
  const cpfs=[{cpf:"11111111111",cpfBox:{x:140,y:320,width:96,height:20}},{cpf:"22222222222",cpfBox:{x:145,y:324,width:100,height:20}}];
  const out=matchCpfAvatarFaces(cpfs,faces,image());
  expect(out.filter(Boolean).length).toBeLessThanOrEqual(1);
 });
});
