import { describe,it,expect } from "vitest";
import {applyStableAvatarResult,keepPreviewOnFailedPreset,isValidAvatarReplacement} from "../client/src/lib/h2bicoStablePreview";
const portrait={x:30,y:25,width:96,height:120};
const current={cropMode:"white" as const,whiteCrop:portrait,avatarCrop:null,matchedCpf:false,avatarBusy:true,selected:false};
describe("H2BICO stable photo preview",()=>{
 it("preserves previous good crop when CPF match fails",()=>{
   const next=applyStableAvatarResult(current,null,false,"Vínculo não encontrado");
   expect(next.cropMode).toBe("white");expect(next.whiteCrop).toEqual(portrait);expect(next.avatarCrop).toBeNull();expect(next.matchedCpf).toBe(false);
 });
 it("keeps original image when detector fails",()=>{
   const next=keepPreviewOnFailedPreset(current,"Detector indisponível");
   expect(next.whiteCrop).toEqual(portrait);expect(next.cropMode).toBe("white");
 });
 it("switches to verified avatar crop without dropping white fallback",()=>{
   const avatar={x:40,y:32,width:80,height:100};
   const next=applyStableAvatarResult(current,avatar,true,"");
   expect(next.cropMode).toBe("avatar");expect(next.avatarCrop).toEqual(avatar);expect(next.whiteCrop).toEqual(portrait);
 });
 it("rejects black rectangles, malformed bounds, and face outside crop",()=>{
   const width=240,height=300,data=new Uint8ClampedArray(width*height*4);
   for(let i=0;i<data.length;i+=4){data[i]=7;data[i+1]=7;data[i+2]=7;data[i+3]=255;}
   const img={width,height,data};
   const rect={x:30,y:25,width:96,height:120};
   expect(isValidAvatarReplacement(img,rect,{x:45,y:50,width:54,height:70,score:.93})).toBe(false);
   expect(isValidAvatarReplacement(img,{x:-10,y:0,width:96,height:120})).toBe(false);
 });
});
