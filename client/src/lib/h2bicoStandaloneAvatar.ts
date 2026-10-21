/**
 * Detect an isolated avatar frame (including a dark or purple UI outline)
 * without OCR or any identity inference. A direct photo can be substituted
 * into ONE card while its name/CPF/EAR remain untouched.
 */
import type {AvatarRect} from "./h2bicoAvatarCrop";

type RGBA={data:Uint8ClampedArray;width:number;height:number};
const median=(a:number[])=>{const sorted=[...a].sort((x,y)=>x-y);return sorted[Math.floor(sorted.length/2)];};
const inside=(x:number,y:number,w:number,h:number)=>x>=0&&y>=0&&x<w&&y<h;
const light=(data:Uint8ClampedArray,w:number,x:number,y:number)=>{
 const i=(y*w+x)*4,r=data[i],g=data[i+1],b=data[i+2];
 return data[i+3]>128&&Math.min(r,g,b)>=185&&Math.max(r,g,b)-Math.min(r,g,b)<=48;
};
export function detectStandaloneAvatarBounds(image:RGBA):AvatarRect|null {
 const {data,width:w,height:h}=image;
 if(w<70||h<80||!data||data.length<w*h*4)return null;
 const ratio=w/h;
 // A complete page cannot silently replace somebody's photograph.
 if(ratio<.55||ratio>1.40)return null;
 const rows=[.12,.20,.30,.38,.52,.67];
 const left:number[]=[],right:number[]=[];
 for(const fract of rows){
  const y=Math.floor(h*fract);
  if(!inside(0,y,w,h))continue;
  let l=-1,r=-1;
  for(let x=0;x<Math.floor(w*.30);x++)if(light(data,w,x,y)){l=x;break;}
  for(let x=w-1;x>=Math.ceil(w*.70);x--)if(light(data,w,x,y)){r=x;break;}
  if(l>=0&&r>=0&&r-l>=w*.58){left.push(l);right.push(r);}
 }
 // The image may be an ordinary document-style portrait without a frame.
 // Its full area is already the exact photograph, not a screenshot UI.
 if(left.length<4)return {x:0,y:0,width:w,height:h};
 const l=median(left),r=median(right);
 let top=0,bottom=h-1;
 const centerSamples=[.20,.30,.40,.60,.70,.80].map(t=>Math.floor(t*w));
 for(let y=0;y<Math.floor(h*.18);y++){
  if(centerSamples.filter(x=>light(data,w,x,y)).length>=4){top=y;break;}
 }
 const lowerSamples=[.15,.22,.28,.72,.79,.86].map(t=>Math.floor(t*w));
 for(let y=h-1;y>=Math.floor(h*.68);y--){
  if(lowerSamples.filter(x=>{
   const p=(y*w+x)*4;
   return (data[p]+data[p+1]+data[p+2])>=360;
  }).length>=4){bottom=y;break;}
 }
 const result={x:Math.max(0,l),y:Math.max(0,top),
  width:Math.min(w-l,r-l+1),height:Math.min(h-top,bottom-top+1)};
 if(result.width<60||result.height<75||result.width/result.height<.53||result.width/result.height>1.45)
  return {x:0,y:0,width:w,height:h};
 return result;
}
/** A bounded source rectangle becomes a portrait with NO stretching or crop. */
export function avatarContainGeometry(sourceWidth:number,sourceHeight:number,targetWidth=256,targetHeight=320){
 if(sourceWidth<=0||sourceHeight<=0||targetWidth<=0||targetHeight<=0)throw new Error("Tamanho de foto inválido.");
 const scale=Math.min(targetWidth/sourceWidth,targetHeight/sourceHeight);
 const width=sourceWidth*scale,height=sourceHeight*scale;
 return {x:(targetWidth-width)/2,y:(targetHeight-height)/2,width,height,targetWidth,targetHeight};
}
