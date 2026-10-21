import {describe,it,expect} from "vitest";
import {initialManualPhotoCrop,moveManualPhotoCrop,resizeManualPhotoCrop,centerManualPhotoCrop,validateManualPhotoCrop} from "../client/src/lib/h2bicoManualPhotoCrop";
describe("H2BICO manual photo-only crop",()=>{
 it("uses a valid exact 4:5 crop on tall screenshots",()=>{
  const crop=initialManualPhotoCrop(847,1313);
  expect(crop).not.toBeNull();expect(validateManualPhotoCrop(crop!,847,1313)).toBe(true);
  expect(crop!.height/crop!.width).toBeCloseTo(1.25,1);
 });
 it("supports narrow and wide screenshots without fixed resolution",()=>{
  for(const [w,h] of [[600,1500],[2200,900],[847,1313],[1400,2600]]){
    const crop=initialManualPhotoCrop(w,h);
    expect(crop).not.toBeNull();expect(validateManualPhotoCrop(crop!,w,h)).toBe(true);
  }
 });
 it("keeps crop entirely inside the source when dragged beyond edges",()=>{
  const crop=initialManualPhotoCrop(847,1313)!;
  const far=moveManualPhotoCrop(crop,847,1313,5000,-5000);
  expect(far.y).toBe(0);expect(far.x+far.width).toBeLessThanOrEqual(847);
 });
 it("zoom and centering retain 4:5 aspect ratio",()=>{
  const crop=initialManualPhotoCrop(600,900)!;
  const zoom=resizeManualPhotoCrop(crop,600,900,300);
  const moved=centerManualPhotoCrop(zoom,600,900,589,889);
  expect(validateManualPhotoCrop(moved,600,900)).toBe(true);
 });
 it("rejects manually supplied crop outside the image",()=>{
  expect(validateManualPhotoCrop({x:700,y:20,width:250,height:313},847,1313)).toBe(false);
 });
});
