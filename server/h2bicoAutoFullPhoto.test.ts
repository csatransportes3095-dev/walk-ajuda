import {describe,it,expect} from "vitest";
import {initialManualPhotoCrop,validateManualPhotoCrop,resizeManualPhotoCrop,suggestCompletePhotoCrop} from "../client/src/lib/h2bicoManualPhotoCrop";
const image=(w:number,h:number,border=0)=>{const data=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const v=(x<border||x>=w-border||y<border||y>=h-border)?25:(x>w*.27&&x<w*.74&&y>h*.16&&y<h*.66?138:y>h*.75?113:245);let i=(y*w+x)*4;data[i]=v;data[i+1]=v;data[i+2]=v;data[i+3]=255;}return {width:w,height:h,data};};
describe("Complete auto selection of standalone photo",()=>{
 it("opens a full standalone picture instead of small center rectangle",()=>{
 const img=image(300,400);
 const suggestion=suggestCompletePhotoCrop(img);
 expect(suggestion).not.toBeNull();
 expect(suggestion!.width).toBeGreaterThan(280);
 expect(suggestion!.height).toBeGreaterThan(370);
 const initial=initialManualPhotoCrop(img.width,img.height,suggestion);
 expect(initial).not.toBeNull();
 expect(initial!.width).toBeGreaterThan(280);
 expect(validateManualPhotoCrop(initial!,img.width,img.height)).toBe(true);
 });
 it("includes head and shoulders in frame with dark border",()=>{
 const img=image(354,457,10);
 const crop=suggestCompletePhotoCrop(img);expect(crop).not.toBeNull();
 expect(crop!.width).toBeGreaterThan(310);
 expect(crop!.height).toBeGreaterThan(390);
 });
 it("does not auto select an entire dark application screenshot",()=>{
 const w=340,h=550,data=new Uint8ClampedArray(w*h*4);
 for(let i=0;i<data.length;i+=4){data[i]=12;data[i+1]=17;data[i+2]=31;data[i+3]=255;}
 expect(suggestCompletePhotoCrop({width:w,height:h,data})).toBeNull();
 });
 it("resizing retains original aspect of square crop",()=>{
 const c=initialManualPhotoCrop(400,400,{x:0,y:0,width:400,height:400})!;
 const next=resizeManualPhotoCrop(c,400,400,300);
 expect(next.width).toBe(300);expect(next.height).toBe(300);
 expect(validateManualPhotoCrop(next,400,400)).toBe(true);
 });
});