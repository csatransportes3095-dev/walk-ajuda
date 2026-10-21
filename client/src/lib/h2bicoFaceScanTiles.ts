/**
 * Multi-scale screenshot tiling for the native H2 Similaridade detector.
 * Geometry only: the detector locates faces, it does not establish identity.
 */
export type FaceScanTile = { x:number; y:number; width:number; height:number };
export type FaceScanBox = { x:number; y:number; width:number; height:number; score:number };
const clamp=(x:number,min:number,max:number)=>Math.max(min,Math.min(max,x));
export function createH2FaceScanTiles(width:number,height:number):FaceScanTile[] {
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<80||height<80)return [];
  const tiles:FaceScanTile[]=[{x:0,y:0,width,height}];
  const grids=Math.max(width,height)>=1450?[2,3]:Math.max(width,height)>=700?[2]:[];
  for(const count of grids){
    const stepX=width/count,stepY=height/count;
    const tileW=Math.min(width,Math.ceil(stepX*1.23)),tileH=Math.min(height,Math.ceil(stepY*1.23));
    for(let row=0;row<count;row++)for(let col=0;col<count;col++){
      const cx=(col+.5)*stepX,cy=(row+.5)*stepY;
      tiles.push({
        x:Math.round(clamp(cx-tileW/2,0,width-tileW)),
        y:Math.round(clamp(cy-tileH/2,0,height-tileH)),
        width:tileW,height:tileH
      });
    }
  }
  return tiles;
}
export function faceScanOverlap(a:FaceScanBox,b:FaceScanBox):number {
  const l=Math.max(a.x,b.x),r=Math.min(a.x+a.width,b.x+b.width);
  const t=Math.max(a.y,b.y),bott=Math.min(a.y+a.height,b.y+b.height);
  const intersection=Math.max(0,r-l)*Math.max(0,bott-t);
  const union=a.width*a.height+b.width*b.height-intersection;
  return union>0?intersection/union:0;
}
export function mergeH2FaceScanBoxes(faces:readonly FaceScanBox[],maxFaces=80):FaceScanBox[] {
  const sorted=faces.filter(x=>[x.x,x.y,x.width,x.height,x.score].every(Number.isFinite)&&
    x.width>=11&&x.height>=11&&x.score>=.36).sort((a,b)=>b.score-a.score);
  const selected:FaceScanBox[]=[];
  for(const face of sorted){
    const centerX=face.x+face.width*.5,centerY=face.y+face.height*.5;
    const duplicate=selected.some(other=>{
      const dist=Math.hypot(centerX-other.x-other.width*.5,centerY-other.y-other.height*.5);
      const shortSide=Math.min(face.width,face.height,other.width,other.height);
      const scaleSimilar=Math.min(face.width,other.width)/Math.max(face.width,other.width)>.62;
      return faceScanOverlap(face,other)>.35||(scaleSimilar&&dist<shortSide*.3);
    });
    if(!duplicate)selected.push(face);
    if(selected.length>=maxFaces)break;
  }
  return selected;
}
