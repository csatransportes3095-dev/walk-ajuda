/** H2BICO: avoid replacing a visible portrait with a black or stale crop. 
 * Pure helpers used by both the review UI and automated regression tests.
 */
import { isSafeAvatarRect, measureAvatarQuality, type AvatarFace, type AvatarRect, type PixelImage } from "./h2bicoAvatarCrop";

export type StableCropMode="original"|"white"|"avatar";
export type StablePreviewState={
  cropMode?:StableCropMode;
  whiteCrop?:AvatarRect|null;
  avatarCrop?:AvatarRect|null;
  avatarBusy?:boolean;
  avatarError?:string;
  matchedCpf?:boolean;
  selected?:boolean;
};

/** Only let the face scanner replace the current preview after checking the full portrait. */
export function isValidAvatarReplacement(image:PixelImage,crop:AvatarRect|null,face?:AvatarFace):boolean {
  if(!crop||!isSafeAvatarRect(crop,image.width,image.height))return false;
  const quality=measureAvatarQuality(image,crop);
  if(!quality.usable||quality.darkFraction>.58)return false;
  if(face){
    if(face.score<.42)return false;
    // Face must fit entirely inside its assigned crop, including forehead and chin.
    if(face.x<crop.x-2||face.y<crop.y-2||
       face.x+face.width>crop.x+crop.width+2||
       face.y+face.height>crop.y+crop.height+2)return false;
    if(face.width/crop.width<.26||face.height/crop.height<.29)return false;
  }
  return true;
}

/** Failed or uncertain scans must not touch cropMode, whiteCrop or avatarCrop. */
export function applyStableAvatarResult<T extends StablePreviewState>(
  current:T,crop:AvatarRect|null,isVerified:boolean,warning:string,
):T {
  if(!isVerified||!crop){
    return {...current,avatarBusy:false,selected:false,avatarError:warning};
  }
  return {...current,avatarBusy:false,avatarCrop:crop,matchedCpf:true,
    cropMode:"avatar",selected:false,avatarError:undefined};
}

/** Failed white-background retries also retain the last good crop. */
export function keepPreviewOnFailedPreset<T extends StablePreviewState>(current:T,message:string):T {
  return {...current,avatarBusy:false,selected:false,avatarError:message};
}
