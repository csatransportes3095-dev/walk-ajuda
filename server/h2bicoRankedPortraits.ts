import sharp from "sharp";
export type Rect={x:number;y:number;width:number;height:number};
type NameBox={left:number;top:number;width:number;height:number};
export function findRankedPortraitRects(data:Uint8Array,width:number,height:number,channels=4):Rect[]{
 if(width<240||height<160||channels<3||data.length<width*height*channels)return [];
 const n=width*height,mask=new Uint8Array(n),visited=new Uint8Array(n),queue=new Int32Array(n);
 // Portraits in similarity result cards have bright foreground bounded by a
 // dark uniform background. Detect the entire square, not only white pixels.
 for(let p=0;p<n;p++){
   const at=p*channels,avg=(data[at]+data[at+1]+data[at+2])/3;
   mask[p]=avg>76&&Math.max(data[at],data[at+1],data[at+2])>95?1:0;
 }
 const rects:Rect[]=[];
 for(let p=0;p<n;p++){
   if(!mask[p]||visited[p])continue;
   let count=0,head=0,tail=1,minX=width,minY=height,maxX=0,maxY=0;
   queue[0]=p;visited[p]=1;
   while(head<tail){
     const pos=queue[head++],x=pos%width,y=Math.floor(pos/width);
     count++;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
     const consider=(q:number)=>{if(mask[q]&&!visited[q]){visited[q]=1;queue[tail++]=q;}};
     if(x>0)consider(pos-1);if(x+1<width)consider(pos+1);
     if(y>0)consider(pos-width);if(y+1<height)consider(pos+width);
   }
   const w=maxX-minX+1,h=maxY-minY+1,area=w*h;
   if(w<55||h<55||w>width*.35||h>height*.34||area>width*height*.06)continue;
   if(h/w<.76||h/w>1.45||count/area<.37)continue;
   // At least four of eight exterior samples must be dark.
   let dark=0,checked=0;
   for(const fraction of [.2,.4,.6,.8]){
     const yy=minY+Math.round(h*fraction);
     for(const xx of [minX-5,maxX+5]){
       if(xx<0||xx>=width||yy<0||yy>=height)continue;
       const i=(yy*width+xx)*channels;checked++;
       if((data[i]+data[i+1]+data[i+2])/3<65)dark++;
     }
   }
   if(checked<5||dark/checked<.6)continue;
   rects.push({x:minX,y:minY,width:w,height:h});
 }
 return rects.sort((a,b)=>a.y-b.y||a.x-b.x);
}
export function pairRankedPortraits(photos:readonly Rect[],names:readonly (NameBox|undefined)[]):(Rect|null)[]{
 const assigned:(Rect|null)[]=names.map(()=>null),used=new Set<number>();
 for(let ni=0;ni<names.length;ni++){
   const name=names[ni];if(!name)continue;
   const candidates=photos.map((p,index)=>{
     const rowDistance=Math.abs((p.y+p.height/2)-(name.top+name.height/2));
     const horizontalGap=name.left-(p.x+p.width);
     const valid=horizontalGap>=-p.width*.2&&horizontalGap<=Math.max(500,p.width*7)&&rowDistance<=Math.max(p.height*.88,name.height*5);
     return {p,index,score:rowDistance/Math.max(p.height,1)+Math.max(0,horizontalGap)/Math.max(1,p.width*3),valid};
   }).filter(x=>x.valid&&!used.has(x.index)).sort((a,b)=>a.score-b.score);
   if(!candidates.length||(candidates.length>1&&candidates[1].score-candidates[0].score<.2))continue;
   const pick=candidates[0];used.add(pick.index);assigned[ni]=pick.p;
 }
 return assigned;
}
export async function detectRankedPortraitCrops(buffer:Buffer,width:number,height:number,persons:readonly {nameBox?:NameBox}[]):Promise<(Rect|null)[]>{
 if(!persons.length)return [];
 const {data,info}=await sharp(buffer,{limitInputPixels:32_000_000}).resize({width:Math.min(1200,width),withoutEnlargement:true}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const factorX=info.width/width,factorY=info.height/height;
 const photoRects=findRankedPortraitRects(data,info.width,info.height,info.channels);
 const scaledNames=persons.map(p=>p.nameBox?{left:p.nameBox.left*factorX,top:p.nameBox.top*factorY,width:p.nameBox.width*factorX,height:p.nameBox.height*factorY}:undefined);
 return pairRankedPortraits(photoRects,scaledNames).map(r=>r?{x:Math.round(r.x/factorX),y:Math.round(r.y/factorY),width:Math.round(r.width/factorX),height:Math.round(r.height/factorY)}:null);
}
