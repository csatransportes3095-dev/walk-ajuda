/** Avatar cropping uses detection coordinates only, never facial identity or OCR guesses.
 * No stored embeddings, uploads or database changes.
 */
export type AvatarRect = { x:number; y:number; width:number; height:number };
export type AvatarFace = AvatarRect & { score:number };
export type AvatarCandidate = { crop:AvatarRect; face:AvatarFace; score:number; quality:number };
export type PixelImage = { data:Uint8ClampedArray; width:number; height:number };
export type AvatarQuality = { usable:boolean; brightness:number; variation:number; darkFraction:number; darkBorder:number };

const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
const finite=(value:number)=>Number.isFinite(value);
export function isSafeAvatarRect(crop:AvatarRect,width:number,height:number):boolean {
  return [crop.x,crop.y,crop.width,crop.height,width,height].every(finite) &&
    crop.width>=48 && crop.height>=60 && crop.height/crop.width>=.70 && crop.height/crop.width<=2.30 &&
    crop.x>=0 && crop.y>=0 && crop.x+crop.width<=width+0.01 && crop.y+crop.height<=height+0.01 &&
    Math.abs(crop.height/crop.width-1.25)<0.035;
}

/** Build a portrait around a detected face. Face is top-centered, leaving shoulders in view. */
export function portraitAroundFace(face:AvatarFace,width:number,height:number,scale=1.85):AvatarRect|null {
  if(![face.x,face.y,face.width,face.height,face.score,width,height].every(finite)||
     face.width<20||face.height<20||face.score<0.36||width<60||height<80)return null;
  const cropWidth=Math.floor(Math.min(Math.max(face.width*scale,face.height*1.23,72),width,height/1.25));
  if(cropWidth<48)return null;
  const cropHeight=Math.floor(cropWidth*1.25);
  const cx=face.x+face.width*.5;
  // Near forehead is about 20% below top, not in the middle of the crop.
  const idealY=face.y-face.height*.24;
  const x=Math.round(clamp(cx-cropWidth*.5,0,width-cropWidth));
  const y=Math.round(clamp(idealY,0,height-cropHeight));
  const crop={x,y,width:cropWidth,height:cropHeight};
  // The crop must cover the complete detected face with some headroom.
  const minMargin=Math.min(5,face.width*.025);
  if(face.x<x-minMargin||face.x+face.width>x+cropWidth+minMargin||
     face.y<y-minMargin||face.y+face.height>y+cropHeight+minMargin)return null;
  return isSafeAvatarRect(crop,width,height)?crop:null;
}

/** Reject blank dark cards and near-uniform backgrounds, not just a dark center pixel. */
export function measureAvatarQuality(image:PixelImage,crop:AvatarRect):AvatarQuality {
  const {data,width,height}=image;
  if(width<1||height<1||data.length<width*height*4||![crop.x,crop.y,crop.width,crop.height].every(finite)||crop.width<40||crop.height<40||crop.x<0||crop.y<0||crop.x+crop.width>width||crop.y+crop.height>height)
    return {usable:false,brightness:0,variation:0,darkFraction:1,darkBorder:1};
  let n=0,total=0,sq=0,dark=0,edges=0,darkEdges=0;
  const cols=22,rows=27;
  for(let iy=0;iy<rows;iy++)for(let ix=0;ix<cols;ix++){
    const x=clamp(Math.floor(crop.x+(ix+.5)*crop.width/cols),0,width-1);
    const y=clamp(Math.floor(crop.y+(iy+.5)*crop.height/rows),0,height-1);
    const p=(y*width+x)*4;
    const lum=.2126*data[p]+.7152*data[p+1]+.0722*data[p+2];
    const isDark=lum<58 && Math.max(data[p],data[p+1],data[p+2])-Math.min(data[p],data[p+1],data[p+2])<38;
    total+=lum;sq+=lum*lum;n++;
    if(isDark)dark++;
    if(ix===0||ix===cols-1||iy===0||iy===rows-1){edges++;if(isDark)darkEdges++;}
  }
  const brightness=total/n,variation=Math.sqrt(Math.max(0,sq/n-brightness*brightness));
  const darkFraction=dark/n,darkBorder=edges?darkEdges/edges:1;
  // Protect against black rectangle previews, entirely blank crops and UI chrome.
  const usable=variation>=24 && brightness>=40 && darkFraction<=.65 &&
    !(darkBorder>.78 && darkFraction>.34);
  return {usable,brightness,variation,darkFraction,darkBorder};
}

function proximityScore(crop:AvatarRect,anchor?:{left:number;top:number;width:number;height:number}):number {
  if(!anchor)return 0;
  const centerX=crop.x+crop.width*.5,centerY=crop.y+crop.height*.5;
  const nameCx=anchor.left+anchor.width*.5,nameCy=anchor.top+anchor.height*.5;
  const gap=anchor.top-(crop.y+crop.height);
  const above=gap>-crop.height*.25&&gap<crop.height*2.5&&
     Math.abs(centerX-nameCx)<Math.max(crop.width*1.3,anchor.width);
  const alongside=Math.abs(centerY-nameCy)<crop.height*.9 &&
    (crop.x+crop.width<=anchor.left+crop.width*.5||crop.x>=anchor.left+anchor.width-crop.width*.5);
  if(!above&&!alongside)return -3;
  const dx=Math.abs(centerX-nameCx)/Math.max(1,crop.width);
  const dy=above?Math.max(0,gap)/Math.max(1,crop.height):Math.abs(centerY-nameCy)/Math.max(1,crop.height);
  return (above?1.3:1.0)-.23*dx-.22*dy;
}

export function rankAvatarCandidates(
  faces:readonly AvatarFace[],image:PixelImage,
  anchor?:{left:number;top:number;width:number;height:number},
):AvatarCandidate[]{
  const output:AvatarCandidate[]=[];
  for(const face of faces){
    let best:AvatarCandidate|null=null;
    for(const scale of [1.95,1.85,1.72,1.58]){
      const crop=portraitAroundFace(face,image.width,image.height,scale);
      if(!crop)continue;
      const quality=measureAvatarQuality(image,crop);
      if(!quality.usable)continue;
      const score=face.score*2+proximityScore(crop,anchor)+
        Math.min(quality.variation,95)/100-quality.darkBorder*.7;
      const candidate={crop,face,score,quality:quality.variation};
      if(!best||score>best.score)best=candidate;
    }
    if(best)output.push(best);
  }
  // Multiple faces remain separate options; never bind an unverified identity to OCR text.
  return output.sort((a,b)=>b.score-a.score).slice(0,12);
}

/** Pair automatically ONLY one face with one OCR person. Multi-face cases need explicit choice. */
export function shouldAutoSelectAvatar(optionCount:number,personCount:number):boolean {
  return optionCount===1&&personCount===1;
}
