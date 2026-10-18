import {describe,it,expect} from "vitest";
import {scanWhitePortraitCandidates,matchWhitePortraitCandidates} from "./h2bicoScreenshotWhitePhoto";
const make=(w:number,h:number,portrait:boolean)=>{
 const data=new Uint8Array(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const p=(y*w+x)*4,white=portrait&&x>=250&&x<490&&y>=120&&y<420;
  data[p]=white?249:28;data[p+1]=white?249:24;data[p+2]=white?249:43;data[p+3]=255;
 }
 if(portrait)for(let y=155;y<390;y++)for(let x=320;x<420;x++){
  const p=(y*w+x)*4;data[p]=130;data[p+1]=96;data[p+2]=72;
 }
 return data;
};
describe("H2BICO recorte branco automatico sem Paint",()=>{
 it("detecta o retrato no print inteiro mesmo longe da linha de nome",()=>{
  const crops=scanWhitePortraitCandidates(make(900,1000,true),900,1000);
  expect(crops).toHaveLength(1);
  expect(crops[0].x).toBeGreaterThanOrEqual(250);
  expect(crops[0].y).toBeGreaterThanOrEqual(120);
  expect(crops[0].height/crops[0].width).toBeCloseTo(1.25,1);
  expect(matchWhitePortraitCandidates(crops,[{left:100,top:850,width:220,height:20}])[0]).toEqual(crops[0]);
 });
 it("nao cria foto falsa a partir de tela inteiramente escura",()=>{
  expect(scanWhitePortraitCandidates(make(900,1000,false),900,1000)).toHaveLength(0);
 });
 it("nao associa um unico retrato a varios nomes sem posicao confiavel",()=>{
  const photo={x:250,y:120,width:236,height:295};
  expect(matchWhitePortraitCandidates([photo],[undefined,undefined])).toEqual([null,null]);
 });
});