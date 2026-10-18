import sharp from "sharp";

/** Scan portrait-shaped white photo BACKGROUNDS anywhere in a screenshot.
 * No OCR-name proximity assumption and no face recognition. */
export type PortraitCrop = {x:number;y:number;width:number;height:number};
export type NameAnchor = {left:number;top:number;width:number;height:number};

export function scanWhitePortraitCandidates(
  pixels:Uint8Array|Uint8ClampedArray,width:number,height:number,channels=4,
):PortraitCrop[]{
  const n=width*height;
  if(width<120||height<120||n>6_000_000||channels<3||pixels.length<n*channels)return [];
  const mask=new Uint8Array(n),seen=new Uint8Array(n),queue=new Int32Array(n);
  for(let i=0;i<n;i++){
    const at=i*channels,r=pixels[at],g=pixels[at+1],b=pixels[at+2];
    mask[i]=r>=210&&g>=210&&b>=210&&
      Math.max(r,g,b)-Math.min(r,g,b)<=40?1:0;
  }
  const isOutsideDark=(x:number,y:number)=>{
    if(x<0||y<0||x>=width||y>=height)return null;
    const pos=(y*width+x)*channels;
    return (pixels[pos]+pixels[pos+1]+pixels[pos+2])/3<150;
  };
  const results:Array<{crop:PortraitCrop;rank:number}>=[];
  for(let i=0;i<n;i++){
    if(!mask[i]||seen[i])continue;
    let head=0,tail=1,minX=width,minY=height,maxX=0,maxY=0;
    queue[0]=i;seen[i]=1;
    while(head<tail){
      const pos=queue[head++],x=pos%width,y=Math.floor(pos/width);
      minX=Math.min(x,minX);maxX=Math.max(x,maxX);
      minY=Math.min(y,minY);maxY=Math.max(y,maxY);
      const visit=(next:number)=>{if(mask[next]&&!seen[next]){seen[next]=1;queue[tail++]=next;}};
      if(x>0)visit(pos-1);
      if(x<width-1)visit(pos+1);
      if(y>0)visit(pos-width);
      if(y<height-1)visit(pos+width);
    }
    const bw=maxX-minX+1,bh=maxY-minY+1,density=tail/(bw*bh);
    if(bw<68||bh<75||bw>width*.86||bh>height*.88||
       bh/bw<.70||bh/bw>2.10||density<.14||density>.89)continue;
    // A photo has a continuous bright backdrop with a dark UI outside,
    // not just thin white text or a plain white form.
    let dark=0,samples=0;
    for(const t of [.18,.34,.5,.66,.82]){
      const y=Math.round(minY+bh*t);
      for(const x of [minX-5,maxX+5]){
        const value=isOutsideDark(x,y);
        if(value!==null){samples++;if(value)dark++;}
      }
    }
    if(samples<6||dark/samples<.60)continue;
    let varied=0,points=0;
    for(const yy of [.24,.34,.44,.54,.64,.74]){
      for(const xx of [.32,.43,.54,.65]){
        const x=Math.floor(minX+bw*xx),y=Math.floor(minY+bh*yy);
        const at=(y*width+x)*channels;
        if(!mask[y*width+x])varied++;
        points++;
      }
    }
    if(varied<4)continue;
    // Vertical 4:5 inside the real photo. Slightly inset to leave the
    // screenshot's dark or purple rounded border OUTSIDE the output.
    let cropWidth=Math.floor(bw*.96);
    const cropY=minY+Math.max(2,Math.round(bw*.008));
    cropWidth=Math.min(cropWidth,Math.floor((height-cropY)/1.25));
    const cropHeight=Math.round(cropWidth*1.25);
    const cropX=minX+Math.floor((bw-cropWidth)/2);
    if(cropWidth<64||cropHeight<80||cropX<0||cropY<0||
       cropX+cropWidth>width||cropY+cropHeight>height)continue;
    const checkWhite=(x:number,y:number)=>x>=0&&y>=0&&x<width&&y<height&&mask[y*width+x]===1;
    if(!checkWhite(cropX+6,cropY+2)||!checkWhite(cropX+cropWidth-7,cropY+2))continue;
    const rank=bw*bh*(.4+density)+varied/points*1000;
    results.push({crop:{x:cropX,y:cropY,width:cropWidth,height:cropHeight},rank});
  }
  return results.sort((a,b)=>b.rank-a.rank).slice(0,80).map(row=>row.crop);
}

/** Match only unambiguous candidates. Single-portrait screenshots can
 * put the OCR name much farther down in a repeated information table. */
export function matchWhitePortraitCandidates(
  photos:readonly PortraitCrop[],names:readonly (NameAnchor|undefined)[],
):Array<PortraitCrop|null>{
  const output:Array<PortraitCrop|null>=names.map(()=>null);
  if(names.length===1&&photos.length===1){output[0]=photos[0];return output;}
  const scores:Array<{pi:number;ni:number;score:number}>=[];
  for(let ni=0;ni<names.length;ni++){
    const n=names[ni];if(!n)continue;
    for(let pi=0;pi<photos.length;pi++){
      const c=photos[pi],cx=c.x+c.width/2,nx=n.left+n.width/2;
      const gap=n.top-(c.y+c.height);
      // Above the name (same column) or to its left/right in a card.
      const above=gap>=-c.height*.20&&gap<c.height*1.8&&
        Math.abs(cx-nx)<Math.max(c.width*1.20,n.width*.90);
      const lateral=Math.abs(c.y+c.height*.50-(n.top+n.height*.50))<c.height*.78&&
        (n.left>=c.x+c.width*.68||c.x>=n.left+n.width*.68)&&
        Math.abs(cx-nx)<c.width*3;
      if(!above&&!lateral)continue;
      const dx=Math.abs(cx-nx)/Math.max(c.width,n.width);
      const dy=above?Math.max(0,gap)/c.height:
        Math.abs(c.y+c.height*.50-(n.top+n.height*.5))/c.height;
      scores.push({pi,ni,score:dx+(above?dy*.75:dy+.35)});
    }
  }
  scores.sort((a,b)=>a.score-b.score);
  const usedP=new Set<number>(),usedN=new Set<number>();
  for(const s of scores){
    if(usedN.has(s.ni)||usedP.has(s.pi))continue;
    const next=scores.find(row=>row.ni===s.ni&&row.pi!==s.pi&&!usedP.has(row.pi));
    if(next&&next.score-s.score<.22)continue; // ambiguous pairing
    output[s.ni]=photos[s.pi];usedN.add(s.ni);usedP.add(s.pi);
  }
  return output;
}

export async function detectWhitePortraitCrops(
  screenshot:Buffer,originalWidth:number,originalHeight:number,
  persons:readonly {nameBox?:NameAnchor}[],
):Promise<Array<PortraitCrop|null>>{
  if(!persons.length)return [];
  const {data,info}=await sharp(screenshot,{limitInputPixels:32_000_000})
    .resize({width:Math.min(originalWidth,1400),withoutEnlargement:true})
    .toColourspace("srgb").ensureAlpha().raw()
    .toBuffer({resolveWithObject:true});
  const xScale=info.width/originalWidth,yScale=info.height/originalHeight;
  const photos=scanWhitePortraitCandidates(data,info.width,info.height,info.channels);
  const boxes=persons.map(p=>p.nameBox?{
    left:p.nameBox.left*xScale,top:p.nameBox.top*yScale,
    width:p.nameBox.width*xScale,height:p.nameBox.height*yScale,
  }:undefined);
  return matchWhitePortraitCandidates(photos,boxes).map(c=>c?{
    x:Math.round(c.x/xScale),y:Math.round(c.y/yScale),
    width:Math.round(c.width/xScale),height:Math.round(c.height/yScale),
  }:null);
}
