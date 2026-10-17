import sharp from "sharp";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {writeFile} from "node:fs/promises";
import {join} from "node:path";
import {isValidCpf} from "../client/src/lib/h2bicoCpfExtractor";
const run = promisify(execFile);

export type CpfOcrBox={left:number;top:number;width:number;height:number};

/**
 * Automatic changes need TWO corroborating OCR reads of the cropped CPF line.
 * The checksum alone, or a unique guessed digit, must never trigger a change.
 * We also demand a single-character difference from the original OCR result.
 */
export function chooseAutomaticCpf(read:string,attempts:readonly string[]):string|null {
  const original=read.replace(/[^0-9]/g,"");
  if(original.length!==11||isValidCpf(original))return null;
  const votes=new Map<string,number>();
  for(const attempt of attempts){
    const cpf=attempt.replace(/[^0-9]/g,"");
    if(cpf.length!==11||!isValidCpf(cpf))continue;
    const changed=[...cpf].reduce((sum,digit,i)=>sum+(digit!==original[i]?1:0),0);
    if(changed!==1)continue;
    votes.set(cpf,(votes.get(cpf)||0)+1);
  }
  if(votes.size!==1)return null;
  const [candidate,count]=[...votes.entries()][0];
  return count>=2?candidate:null;
}

/**
 * Crop the original screenshot tightly around the CPF line reported by TSV.
 * Threshold BEFORE resizing so a faint 5 is not smoothed into a 9.
 * 75 and 90 represent two distinct binarization conditions.
 */
export async function autoReadCpfLine(args:{
  image:Buffer;width:number;height:number;
  ocrWidth:number;ocrHeight:number;
  box:CpfOcrBox;original:string;temporaryDir:string;index:number;
}):Promise<string|null>{
  const {image,width,height,ocrWidth,ocrHeight,box,original,temporaryDir,index}=args;
  if(!box||width<100||height<80||ocrWidth<=0||ocrHeight<=0)return null;
  const scaleX=width/ocrWidth,scaleY=height/ocrHeight;
  const left=Math.max(0,Math.round(box.left*scaleX)-5);
  const top=Math.max(0,Math.round(box.top*scaleY)-2);
  if(left>=width-20||top>=height-12)return null;
  const cropWidth=Math.min(width-left,Math.max(60,Math.round(box.width*scaleX)+10));
  const cropHeight=Math.min(height-top,Math.max(16,Math.round(box.height*scaleY)+6));
  if(cropWidth<45||cropHeight<12)return null;
  const attempts:string[]=[];
  for(const threshold of [75,90,105]){
    try{
      const transformed=await sharp(image,{limitInputPixels:32_000_000})
        .extract({left,top,width:cropWidth,height:cropHeight})
        .greyscale().threshold(threshold)
        .resize({width:cropWidth*5,kernel:"cubic"}).png().toBuffer();
      const path=join(temporaryDir,"cpf-auto-"+index+"-"+threshold+".png");
      await writeFile(path,transformed);
      const {stdout}=await run("tesseract",[path,"stdout","-l","eng","--psm","7",
        "-c","tessedit_char_whitelist=0123456789.-"],{
        timeout:6500,maxBuffer:8192,encoding:"utf8",
      });
      attempts.push(stdout);
      const corrected=chooseAutomaticCpf(original,attempts);
      if(corrected)return corrected;
    }catch{
      // Never guess or overwrite on a failed OCR run.
    }
  }
  return null;
}
