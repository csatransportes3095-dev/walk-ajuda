import {describe,it,expect} from "vitest";
import {portraitAroundFace,measureAvatarQuality,rankAvatarCandidates,shouldAutoSelectAvatar} from "./h2bicoAvatarCrop";
const face={x:190,y:140,width:80,height:95,score:.97};
function sample(w:number,h:number,black=false){
 const data=new Uint8ClampedArray(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const p=(y*w+x)*4;
  const inPhoto=x>170&&x<345&&y>100&&y<340;
  const v=black?15:inPhoto?(x>210&&x<290&&y>155&&y<280?90:239):18;
  data[p]=v;data[p+1]=v;data[p+2]=v;data[p+3]=255;
 }
 return {data,width:w,height:h};
}
describe("H2BICO avatar inteligente",()=>{
 it("constroi retrato vertical 4:5 contendo todo rosto",()=>{
   const crop=portraitAroundFace(face,700,850);
   expect(crop).not.toBeNull();
   expect(crop!.height/crop!.width).toBeCloseTo(1.25,1);
   expect(crop!.x).toBeLessThanOrEqual(face.x);
   expect(crop!.y).toBeLessThanOrEqual(face.y);
 });
 it("recusa quadro preto sem avatar",()=>{
   const r=rankAvatarCandidates([face],sample(700,850,true));
   expect(r).toHaveLength(0);
 });
 it("aceita foto com variacao e rejeita tela uniforme",()=>{
   const crop=portraitAroundFace(face,700,850)!;
   expect(measureAvatarQuality(sample(700,850),crop).usable).toBe(true);
   expect(measureAvatarQuality(sample(700,850,true),crop).usable).toBe(false);
 });
 it("so seleciona automaticamente se um cadastro e um rosto",()=>{
   expect(shouldAutoSelectAvatar(1,1)).toBe(true);
   expect(shouldAutoSelectAvatar(2,1)).toBe(false);
   expect(shouldAutoSelectAvatar(1,2)).toBe(false);
   expect(shouldAutoSelectAvatar(0,1)).toBe(false);
 });
 it("mantem multiplos candidatos separados",()=>{
   const faces=[face,{x:390,y:140,width:80,height:95,score:.95}];
   const photo=sample(700,850);
   const results=rankAvatarCandidates(faces,photo);
   expect(results.length).toBeLessThanOrEqual(2);
 });
});
