/**
 * Bind a photo to the CPF printed in the SAME screenshot card.
 * A face score detects a face, not the person's identity. We require
 * unambiguous geometric association with the OCR bounding box for the CPF.
 */
import { measureAvatarQuality, type AvatarFace, type AvatarRect, type PixelImage } from "./h2bicoAvatarCrop";
export type CpfAnchor={cpf:string;cpfBox?:AvatarRect};
export type CpfAvatarMatch={faceIndex:number;crop:AvatarRect;associationScore:number};
const clamp=(v:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,v));
const finiteRect=(r:AvatarRect)=>[r.x,r.y,r.width,r.height].every(Number.isFinite)&&r.width>0&&r.height>0;
const centerX=(r:AvatarRect)=>r.x+r.width/2;
const centerY=(r:AvatarRect)=>r.y+r.height/2;
function pairingCost(face:AvatarFace,cpf:AvatarRect,img:PixelImage):number|null{
  if(!finiteRect(face)||!finiteRect(cpf)||face.score<.46)return null;
  if(face.width<13||face.height<13)return null;
  const dx=Math.abs(centerX(face)-centerX(cpf));
  const gap=cpf.y-(face.y+face.height);
  // Similaridade cards show the portrait above its CPF. Limit the distance
  // to the current card row; never borrow a face from the preceding row.
  const upperBound=Math.max(face.height*3.15,cpf.height*12,Math.min(img.height*.12,215));
  const aligned=dx<=Math.max(face.width*.92,cpf.width*.55,24) &&
    gap>=-face.height*.23&&gap<=upperBound;
  // Other screenshot layouts can place a portrait immediately beside the CPF.
  const lateralGap=Math.max(cpf.x-face.x-face.width,face.x-cpf.x-cpf.width,0);
  const lateral=Math.abs(centerY(face)-centerY(cpf))<=Math.max(face.height*.62,cpf.height*2) &&
    lateralGap<Math.max(face.width*.58,cpf.height*3) &&
    dx>face.width*.55;
  if(!aligned&&!lateral)return null;
  const nx=dx/Math.max(28,face.width,cpf.width);
  const ny=aligned?Math.max(0,gap)/Math.max(28,face.height):
    Math.abs(centerY(face)-centerY(cpf))/Math.max(face.height,28);
  const score=aligned?nx*3.8+ny*.22+(1-face.score)*.24:
    1.65+nx*.35+ny+(1-face.score)*.24;
  return score<3.5?score:null;
}
function cropIntersectsOtherFaces(crop:AvatarRect,faceIndex:number,faces:readonly AvatarFace[]):boolean{
  for(let i=0;i<faces.length;i++){
    if(i===faceIndex)continue;
    const f=faces[i];
    const w=Math.max(0,Math.min(crop.x+crop.width,f.x+f.width)-Math.max(crop.x,f.x));
    const h=Math.max(0,Math.min(crop.y+crop.height,f.y+f.height)-Math.max(crop.y,f.y));
    if(w*h/Math.max(1,f.width*f.height)>.09)return true;
  }
  return false;
}
export function isolateCpfAvatarCrop(
  face:AvatarFace,faceIndex:number,
  cpf:CpfAnchor,cpfs:readonly CpfAnchor[],
  faces:readonly AvatarFace[],image:PixelImage,
):AvatarRect|null{
  const box=cpf.cpfBox;
  if(!box||!finiteRect(box))return null;
  let left=0,right=image.width;
  const myX=centerX(box);
  for(const other of cpfs){
    if(other===cpf||!other.cpfBox||!finiteRect(other.cpfBox))continue;
    const theirBox=other.cpfBox;
    // Only constrain by neighboring CPFs on the same card row.
    if(Math.abs(centerY(theirBox)-centerY(box))>Math.max(box.height,theirBox.height)*2.3)continue;
    const boundary=(myX+centerX(theirBox))/2;
    if(centerX(theirBox)<myX)left=Math.max(left,boundary);
    else if(centerX(theirBox)>myX)right=Math.min(right,boundary);
  }
  // The portrait is above the CPF; leave a narrow gap below the photo.
  const above=face.y+face.height<=box.y+face.height*.25;
  const bottomLimit=above?Math.max(0,box.y-3):image.height;
  const faceCx=centerX(face);
  if(face.x<left-2||face.x+face.width>right+2||bottomLimit<=face.y+face.height+3)return null;
  for(const scale of [1.88,1.72,1.57,1.42,1.28]){
    const w=Math.round(Math.min(face.width*scale,(face.height*1.55)*scale/1.65,
      right-left,image.height/1.25,above?(bottomLimit-Math.max(0,face.y-face.height*.24))/1.25:image.height/1.25));
    if(w<48||w<face.width*1.12)continue;
    const h=Math.round(w*1.25);
    const x=Math.round(clamp(faceCx-w/2,Math.ceil(left),Math.floor(right-w)));
    // Keep hair and chin visible while respecting the CPF below.
    const topMin=0,topMax=Math.min(image.height-h,above?bottomLimit-h:image.height-h);
    if(topMax<0)continue;
    const y=Math.round(clamp(face.y-face.height*.28,topMin,topMax));
    const crop={x,y,width:w,height:h};
    if(x>face.x-1||x+w<face.x+face.width+1||
      y>face.y-1||y+h<face.y+face.height+1)continue;
    if(cropIntersectsOtherFaces(crop,faceIndex,faces))continue;
    const quality=measureAvatarQuality(image,crop);
    // Visible face + sufficiently varied image: no need for white background.
    const faceQuality=measureAvatarQuality(image,{
      x:clamp(Math.floor(face.x),0,image.width-1),
      y:clamp(Math.floor(face.y),0,image.height-1),
      width:Math.max(1,Math.min(image.width-Math.floor(face.x),Math.floor(face.width))),
      height:Math.max(1,Math.min(image.height-Math.floor(face.y),Math.floor(face.height))),
    });
    if(!(quality.usable||(face.score>=.7&&faceQuality.variation>=19&&
       quality.variation>=22&&quality.darkFraction<.82)))continue;
    return crop;
  }
  return null;
}
/** One-to-one reciprocal match: each face belongs to at most one CPF. */
export function matchCpfAvatarFaces(
  cpfs:readonly CpfAnchor[],faces:readonly AvatarFace[],image:PixelImage
):(CpfAvatarMatch|null)[]{
  const result:(CpfAvatarMatch|null)[]=cpfs.map(()=>null);
  const edges:{p:number;f:number;cost:number;crop:AvatarRect}[]=[];
  for(let p=0;p<cpfs.length;p++){
    const box=cpfs[p].cpfBox;
    if(!box||!finiteRect(box))continue;
    for(let f=0;f<faces.length;f++){
      const cost=pairingCost(faces[f],box,image);
      if(cost===null)continue;
      const crop=isolateCpfAvatarCrop(faces[f],f,cpfs[p],cpfs,faces,image);
      if(crop)edges.push({p,f,cost,crop});
    }
  }
  // Each CPF and each face must consider each other the best option.
  for(let p=0;p<cpfs.length;p++){
    const ranked=edges.filter(edge=>edge.p===p).sort((a,b)=>a.cost-b.cost);
    if(!ranked.length)continue;
    const best=ranked[0];
    const competing=ranked[1];
    if(competing&&competing.cost-best.cost<.37)continue;
    const other=edges.filter(edge=>edge.f===best.f&&edge.p!==p).sort((a,b)=>a.cost-b.cost)[0];
    if(other&&other.cost-best.cost<.37)continue;
    if(best.cost>2.75)continue;
    result[p]={faceIndex:best.f,crop:best.crop,associationScore:best.cost};
  }
  // Even in pathological layouts, never reuse a face for two CPFs.
  const counts=new Map<number,number>();
  for(const item of result)if(item)counts.set(item.faceIndex,(counts.get(item.faceIndex)||0)+1);
  return result.map(item=>item&&counts.get(item.faceIndex)===1?item:null);
}
