import sharp from "sharp";
import type { ScreenshotPerson } from "./h2bicoScreenshotOcr";

/**
 * Detect the actual rounded photo square in a similarity-result screenshot.
 *
 * OCR text height is not the photo size: depending on browser zoom a name may
 * be only 9px high while its photo is 114px. Search for the left/right borders
 * of the photo to the left of the detected name; fall back to geometry if
 * borders are too faint. Never crop using face recognition/identification.
 */
export async function alignScreenshotPhotoCrops(
  input: Buffer,
  persons: ScreenshotPerson[],
  originalWidth: number,
  originalHeight: number,
): Promise<ScreenshotPerson[]> {
  if (!persons.length) return [];
  const {data,info}=await sharp(input)
    .resize({width:Math.min(originalWidth,1200),withoutEnlargement:true})
    .removeAlpha().toColourspace("srgb").raw().toBuffer({resolveWithObject:true});
  const width=info.width,height=info.height,channels=info.channels;
  const ratio=width/originalWidth;
  const clamp=(n:number,lo:number,hi:number)=>Math.min(hi,Math.max(lo,n));
  const difference=(a:number,b:number)=>Math.abs(data[a]-data[b])+
    Math.abs(data[a+1]-data[b+1])+Math.abs(data[a+2]-data[b+2]);
  const at=(x:number,y:number)=>(y*width+x)*channels;
  return persons.map(person=>{
    const name=person.nameBox;
    if(!name || name.left<60 || !name.height) {
      return {...person,warnings:[...person.warnings,"Confira manualmente os limites da foto."]};
    }
    const nx=name.left*ratio,ny=name.top*ratio,nh=name.height*ratio;
    const rows=[1.1,1.5,2.0,2.7,3.3].map(mult=>Math.round(ny+nh*mult))
      .filter(y=>y>3&&y<height-4);
    if(!rows.length)return person;
    const verticalScore=(x:number)=>{
      if(x<4||x>=width-4)return 0;
      let total=0;
      for(const y of rows)total+=difference(at(x-3,y),at(x+3,y));
      return total/(rows.length*3);
    };
    const bestEdge=(expected:number,span:number)=>{
      let best=clamp(Math.round(expected),4,width-5),score=-1;
      for(let x=clamp(Math.round(expected-span),4,width-5);
          x<=clamp(Math.round(expected+span),4,width-5);x++){
        const value=verticalScore(x);
        if(value>score){best=x;score=value;}
      }
      return {x:best,score};
    };
    const span=Math.max(8,Math.round(nx*0.11));
    const left=bestEdge(nx*0.422,span);
    const right=bestEdge(nx*0.895,span);
    let x:number,size:number,hasBorders=false;
    if(left.score>=55 && right.score>=55 &&
        right.x-left.x>=Math.max(40,nx*.29) &&
        right.x-left.x<=nx*.7) {
      x=left.x;
      size=right.x-left.x;
      hasBorders=true;
    }else{
      // Approximate the photo from the card grid, NOT from OCR text height.
      x=Math.round(nx*.42);
      size=Math.round(nx*.48);
    }
    if(size<48*ratio){
      return {...person,warnings:[...person.warnings,"Foto muito pequena; confira o recorte."]};
    }
    const guessedTop=Math.round(ny-size*.13);
    let y=clamp(guessedTop,0,Math.max(0,height-size));
    if(hasBorders){
      const xs=[.12,.2,.8,.88].map(frac=>Math.round(x+size*frac))
        .filter(v=>v>3&&v<width-4);
      const horizScore=(scanY:number)=>{
        if(scanY<4||scanY>=height-4||!xs.length)return 0;
        let total=0;
        for(const scanX of xs)total+=difference(at(scanX,scanY-3),at(scanX,scanY+3));
        return total/(xs.length*3);
      };
      let score=-1;
      const range=Math.round(size*.2);
      for(let sy=clamp(guessedTop-range,4,height-5);
          sy<=clamp(guessedTop+range,4,height-5);sy++){
        const next=horizScore(sy);
        if(next>score){score=next;y=sy;}
      }
      if(score<55)y=clamp(guessedTop,0,Math.max(0,height-size));
    }
    // All browser previews use the original screenshot dimensions.
    const originalSize=Math.max(48,Math.round(size/ratio));
    const safeSize=Math.min(originalSize,originalWidth,originalHeight);
    const crop={
      x:clamp(Math.round(x/ratio),0,Math.max(0,originalWidth-safeSize)),
      y:clamp(Math.round(y/ratio),0,Math.max(0,originalHeight-safeSize)),
      size:safeSize,
    };
    return {...person,crop,
      warnings:hasBorders?person.warnings:
        [...person.warnings,"Bordas da foto pouco visíveis. Confira o enquadramento antes de salvar."]};
  });
}
