/**
 * H2BICO manual image-only crop. Coordinates are always expressed in pixels
 * of the ORIGINAL uploaded screenshot, independent of screen zoom or layout.
 */
import { isSafeAvatarRect, type AvatarRect } from "./h2bicoAvatarCrop";

export type ManualPhotoCrop=AvatarRect;
export const MANUAL_CROP_ASPECT=5/4;

const clamp=(n:number,min:number,max:number)=>Math.min(max,Math.max(min,n));

export function maxManualPhotoWidth(imageWidth:number,imageHeight:number):number {
  if(!Number.isFinite(imageWidth)||!Number.isFinite(imageHeight))return 0;
  return Math.max(0,Math.floor(Math.min(imageWidth,imageHeight/MANUAL_CROP_ASPECT)));
}

export function initialManualPhotoCrop(
  imageWidth:number,imageHeight:number,
  previous?:AvatarRect|null,
):ManualPhotoCrop|null {
  const max=maxManualPhotoWidth(imageWidth,imageHeight);
  if(max<48)return null;
  const suggested=previous?.width&&Number.isFinite(previous.width)
    ?previous.width:Math.min(260,max*.42);
  const width=Math.round(clamp(suggested,48,max));
  const previousRatio=previous&&previous.width>0&&previous.height>0
    ?previous.height/previous.width:MANUAL_CROP_ASPECT;
  const height=Math.round(Math.min(imageHeight,width*clamp(previousRatio,.70,2.30)));
  const centerX=previous&&Number.isFinite(previous.x)&&Number.isFinite(previous.width)
    ?previous.x+previous.width/2:imageWidth/2;
  const centerY=previous&&Number.isFinite(previous.y)&&Number.isFinite(previous.height)
    ?previous.y+previous.height/2:imageHeight/2;
  const crop={
    x:Math.round(clamp(centerX-width/2,0,imageWidth-width)),
    y:Math.round(clamp(centerY-height/2,0,imageHeight-height)),
    width,height
  };
  return isSafeAvatarRect(crop,imageWidth,imageHeight)?crop:null;
}

/**
 * Compatibilidade com o recorte quadrado antigo do OCR.
 * O quadrado normalmente começa na testa e corta o queixo/ombros; ao abrir
 * o editor ou receber um novo print, amplia para 4:5 e favorece a parte
 * inferior do retrato, mantendo a cabeça dentro da moldura.
 */
export function portraitFromLegacySquare(
  imageWidth:number,imageHeight:number,
  square:{x:number;y:number;size:number}|null|undefined,
):ManualPhotoCrop|null {
  if(!square||![square.x,square.y,square.size].every(Number.isFinite)||square.size<48)return null;
  const max=maxManualPhotoWidth(imageWidth,imageHeight);
  if(max<48)return null;
  const width=Math.round(clamp(square.size,48,max));
  const height=Math.round(width*MANUAL_CROP_ASPECT);
  const centerX=square.x+square.size*.5;
  // Move the center down so the new space is added mostly below the face.
  const centerY=square.y+square.size*.58;
  const crop={
    x:Math.round(clamp(centerX-width*.5,0,imageWidth-width)),
    y:Math.round(clamp(centerY-height*.5,0,imageHeight-height)),
    width,height,
  };
  return isSafeAvatarRect(crop,imageWidth,imageHeight)?crop:null;
}

export function moveManualPhotoCrop(
  crop:ManualPhotoCrop,imageWidth:number,imageHeight:number,
  dx:number,dy:number,
):ManualPhotoCrop {
  return {...crop,
    x:Math.round(clamp(crop.x+dx,0,Math.max(0,imageWidth-crop.width))),
    y:Math.round(clamp(crop.y+dy,0,Math.max(0,imageHeight-crop.height)))
  };
}

export function centerManualPhotoCrop(
  crop:ManualPhotoCrop,imageWidth:number,imageHeight:number,
  centerX:number,centerY:number,
):ManualPhotoCrop {
  return moveManualPhotoCrop(
    crop,imageWidth,imageHeight,
    centerX-(crop.x+crop.width/2),
    centerY-(crop.y+crop.height/2)
  );
}

export function resizeManualPhotoCrop(
  crop:ManualPhotoCrop,imageWidth:number,imageHeight:number,newWidth:number,
):ManualPhotoCrop {
  const max=maxManualPhotoWidth(imageWidth,imageHeight);
  if(max<48)return crop;
  const width=Math.round(clamp(newWidth,48,max));
  const ratio=crop.width>0?crop.height/crop.width:MANUAL_CROP_ASPECT;
  const height=Math.round(Math.min(imageHeight,width*clamp(ratio,.70,2.30)));
  const centerX=crop.x+crop.width/2;
  const centerY=crop.y+crop.height/2;
  return {
    x:Math.round(clamp(centerX-width/2,0,imageWidth-width)),
    y:Math.round(clamp(centerY-height/2,0,imageHeight-height)),
    width,height
  };
}

export function validateManualPhotoCrop(
  crop:ManualPhotoCrop,imageWidth:number,imageHeight:number
):boolean {
  return isSafeAvatarRect(crop,imageWidth,imageHeight);
}
