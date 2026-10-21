import {describe,it,expect} from "vitest";
import {avatarContainGeometry,detectStandaloneAvatarBounds} from "../client/src/lib/h2bicoStandaloneAvatar";
function framedAvatar(w=354,h=457){
 const a=new Uint8ClampedArray(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const idx=(y*w+x)*4;
  const border=x<10||x>w-11||y<3||y>h-12;
  const skin=x>w*.27&&x<w*.73&&y>h*.14&&y<h*.70;
  const shirt=y>h*.75&&x>w*.15&&x<w*.85;
  const c=border?20:skin?145:shirt?120:253;
  a[idx]=c;a[idx+1]=c;a[idx+2]=c;a[idx+3]=255;
 }
 return {data:a,width:w,height:h};
}
describe("H2BICO final isolated avatar photograph",()=>{
 it("removes outer black frame but keeps head and shoulders",()=>{
  const image=framedAvatar();
  const crop=detectStandaloneAvatarBounds(image)!;
  expect(crop.x).toBeGreaterThanOrEqual(10);
  expect(crop.y).toBeLessThan(25);
  expect(crop.width).toBeGreaterThan(310);
  expect(crop.y+crop.height).toBeGreaterThan(400);
 });
 it("accepts different photo dimensions without reading CPF or name",()=>{
  for(const [w,h] of [[354,457],[300,400],[640,800],[512,512]]){
   const rect=detectStandaloneAvatarBounds(framedAvatar(w,h));
   expect(rect).toBeTruthy();
  }
 });
 it("preserves source ratio and white letterbox without distortion",()=>{
  for(const [w,h] of [[340,444],[300,300],[180,270],[512,640]]){
   const result=avatarContainGeometry(w,h);
   expect(result.width/result.height).toBeCloseTo(w/h,5);
   expect(result.width).toBeLessThanOrEqual(256);
   expect(result.height).toBeLessThanOrEqual(320);
  }
 });
 it("does not treat a full width multi-person screenshot as standalone portrait",()=>{
  expect(detectStandaloneAvatarBounds(framedAvatar(1600,950))).toBeNull();
 });
 it("rejects broken input",()=>{
  expect(detectStandaloneAvatarBounds({width:120,height:200,data:new Uint8ClampedArray(3)})).toBeNull();
 });
});
