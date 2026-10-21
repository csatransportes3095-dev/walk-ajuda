import {describe,it,expect} from "vitest";
import {parseScreenshotTsv} from "./h2bicoScreenshotOcr";
const header="level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext";
const row=(text:string,x:number,y:number,w:number,h:number,i:number)=>["5",1,i,1,1,1,x,y,w,h,95,text].join("\t");
function fixture(w:number,h:number,photoX:number,captionY:number,detailsY:number){
 const scale=w/847;
 const data=[
 row("RODRIGO DE SOUZA",photoX,captionY,Math.round(240*scale),Math.round(23*scale),1),
 row("Baixar Foto",photoX,captionY+Math.round(50*scale),Math.round(160*scale),Math.round(24*scale),2),
 row("Informações Encontradas",20,detailsY-Math.round(100*scale),Math.round(350*scale),Math.round(24*scale),3),
 row("Nome",Math.round(10*scale),detailsY,Math.round(55*scale),Math.round(21*scale),4),
 row("RODRIGO DE SOUZA",Math.round(w*.48),detailsY,Math.round(240*scale),Math.round(21*scale),5),
 row("CPF",Math.round(10*scale),detailsY+Math.round(75*scale),Math.round(40*scale),Math.round(21*scale),6),
 row("112.463.567-08",Math.round(w*.48),detailsY+Math.round(75*scale),Math.round(210*scale),Math.round(21*scale),7),
 row("Registro",Math.round(10*scale),detailsY+Math.round(140*scale),Math.round(75*scale),Math.round(21*scale),8),
 row("05045274935",Math.round(w*.48),detailsY+Math.round(140*scale),Math.round(205*scale),Math.round(21*scale),9)
 ];return [header,...data].join("\n");
}
describe("H2BICO varied-size print name CPF pairing",()=>{
 for(const [w,h,x,caption,details] of [[803,1288,270,640,1060],[1421,1451,585,615,1100],[1629,1537,800,630,1150],[847,1313,535,580,1010]]){
  it(`binds one image caption and one validated CPF in ${w}x${h}`,()=>{
    const people=parseScreenshotTsv(fixture(w,h,x,caption,details),w,h);
    expect(people).toHaveLength(1);
    expect(people[0].name).toBe("RODRIGO DE SOUZA");
    expect(people[0].cpf).toBe("11246356708");
    expect(people[0].cpfBox).toBeTruthy();
  });
 }
});
