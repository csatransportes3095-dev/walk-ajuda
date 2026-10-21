import {describe,it,expect} from "vitest";
import {findRankedPortraitRects,pairRankedPortraits} from "./h2bicoRankedPortraits";
function sample(){
 const width=889,height=1302,data=new Uint8Array(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  let bright=false;
  for(let k=0;k<5;k++){const top=96+k*255.5;if(x>=108&&x<=224&&y>=top&&y<=top+116){bright=true;break;}}
  const v=bright?180:24,i=(y*width+x)*4;
  data[i]=v;data[i+1]=v;data[i+2]=v;data[i+3]=255;
 }
 const names=Array.from({length:5},(_,i)=>({left:247,top:55+255.5*i,width:260,height:22}));
 return {width,height,data,names};
}
describe("H2BICO ranked portraits",()=>{
 it("detects all five full square photos despite dark results cards",()=>{
  const {data,width,height}=sample();const list=findRankedPortraitRects(data,width,height);
  expect(list).toHaveLength(5);
  expect(list.map(p=>p.width)).toEqual([117,117,117,117,117]);
  expect(list.every(p=>p.height>=116&&p.height<=117)).toBe(true);
 });
 it("pairs each photo with a unique OCR name on same row",()=>{
  const {data,width,height,names}=sample();const photos=findRankedPortraitRects(data,width,height);const paired=pairRankedPortraits(photos,names);
  expect(paired).toHaveLength(5);expect(paired.every(Boolean)).toBe(true);
  expect(new Set(paired.map(x=>x?.y)).size).toBe(5);
 });
 it("never pairs unrelated names outside the row",()=>{
  const {data,width,height}=sample();
  const paired=pairRankedPortraits(findRankedPortraitRects(data,width,height),[{left:700,top:120,width:110,height:20}]);
  expect(paired[0]).toBeNull();
 });
});
