import {useEffect,useRef,useState} from "react";
import {Button} from "@/components/ui/button";
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from "@/components/ui/dialog";
import {initialManualPhotoCrop,moveManualPhotoCrop,resizeManualPhotoCrop,centerManualPhotoCrop,validateManualPhotoCrop,maxManualPhotoWidth,type ManualPhotoCrop} from "@/lib/h2bicoManualPhotoCrop";

type Props={open:boolean;onOpenChange:(open:boolean)=>void;imageUrl:string;imageWidth:number;imageHeight:number;initialCrop?:ManualPhotoCrop|null;onConfirm:(crop:ManualPhotoCrop)=>void};
export default function H2BicoManualCropDialog({open,onOpenChange,imageUrl,imageWidth,imageHeight,initialCrop,onConfirm}:Props){
 const [crop,setCrop]=useState<ManualPhotoCrop|null>(null);
 const [error,setError]=useState("");
 const surface=useRef<HTMLDivElement>(null);
 const drag=useRef<{pointerId:number;x:number;y:number;crop:ManualPhotoCrop}|null>(null);
 useEffect(()=>{
   if(!open)return;
   setCrop(initialManualPhotoCrop(imageWidth,imageHeight,initialCrop));
   setError("");
   drag.current=null;
 },[open,imageUrl,imageWidth,imageHeight,initialCrop?.x,initialCrop?.y,initialCrop?.width,initialCrop?.height]);
 const maxWidth=maxManualPhotoWidth(imageWidth,imageHeight);
 const valid=!!crop&&validateManualPhotoCrop(crop,imageWidth,imageHeight);
 const beginDrag=(event:React.PointerEvent<HTMLDivElement>)=>{
   if(!crop||!surface.current)return;
   event.preventDefault();
   drag.current={pointerId:event.pointerId,x:event.clientX,y:event.clientY,crop};
   event.currentTarget.setPointerCapture(event.pointerId);
 };
 const dragCrop=(event:React.PointerEvent<HTMLDivElement>)=>{
   if(!drag.current||drag.current.pointerId!==event.pointerId||!surface.current)return;
   const box=surface.current.getBoundingClientRect();
   if(!box.width||!box.height)return;
   const dx=(event.clientX-drag.current.x)*imageWidth/box.width;
   const dy=(event.clientY-drag.current.y)*imageHeight/box.height;
   setCrop(moveManualPhotoCrop(drag.current.crop,imageWidth,imageHeight,dx,dy));
 };
 const stopDrag=()=>{drag.current=null;};
 const confirm=()=>{if(!crop||!validateManualPhotoCrop(crop,imageWidth,imageHeight)){setError("Recorte inválido: ajuste a área da foto.");return;}onConfirm(crop);onOpenChange(false);};
 return <Dialog open={open} onOpenChange={onOpenChange}>
   <DialogContent className="z-[80] flex max-h-[94dvh] w-[min(98vw,1100px)] max-w-none flex-col gap-3 overflow-y-auto border-cyan-500/40 bg-slate-950 text-white">
     <DialogHeader>
       <DialogTitle>Trocar recorte da foto • proporção original</DialogTitle>
       <DialogDescription className="text-slate-300">A moldura acompanha a proporção real da foto. Arraste e amplie/reduza sem cortar cabeça, queixo ou ombros; apenas o recorte será alterado.</DialogDescription>
     </DialogHeader>
     <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
       <div className="min-w-0">
         <div ref={surface} className="relative mx-auto w-full max-w-[760px] overflow-hidden rounded-xl border border-slate-700 bg-black" style={{aspectRatio:imageWidth+"/"+imageHeight}}>
           <img src={imageUrl} alt="Print original para selecionar somente a fotografia" draggable={false} className="absolute inset-0 h-full w-full select-none" style={{objectFit:"fill"}}/>
           {crop&&<div role="application" aria-label="Área do recorte da foto; arraste para mover" onPointerDown={beginDrag} onPointerMove={dragCrop} onPointerUp={stopDrag} onPointerCancel={stopDrag}
             className="absolute z-10 cursor-move touch-none rounded border-[3px] border-cyan-300 bg-cyan-300/5 shadow-[0_0_0_9999px_rgba(0,0,0,.43)]"
             style={{left:(crop.x/imageWidth*100)+"%",top:(crop.y/imageHeight*100)+"%",width:(crop.width/imageWidth*100)+"%",height:(crop.height/imageHeight*100)+"%"}}>
             <span className="absolute inset-0 grid place-items-center text-xs font-black text-white drop-shadow-lg pointer-events-none">ARRASTAR</span>
           </div>}
         </div>
       </div>
       <div className="min-w-0 space-y-4">
         <div className="rounded-xl border border-cyan-500/30 bg-slate-900 p-3">
           <p className="mb-2 text-sm font-bold">Prévia do novo recorte</p>
           {crop&&<div className="relative mx-auto w-40 max-w-full overflow-hidden rounded-lg border border-cyan-400 bg-black" style={{aspectRatio:crop.width+"/"+crop.height}}>
             <img src={imageUrl} alt="Prévia exata do recorte 4 por 5" draggable={false} className="absolute max-w-none" style={{width:(imageWidth/crop.width*100)+"%",height:(imageHeight/crop.height*100)+"%",left:(-crop.x/crop.width*100)+"%",top:(-crop.y/crop.height*100)+"%"}}/>
           </div>}
         </div>
         <label className="block text-sm font-semibold">Ampliar / reduzir o recorte
           <input aria-label="Tamanho do recorte" type="range" min={48} max={Math.max(48,maxWidth)} step={1} disabled={!crop||maxWidth<48} value={crop?.width??48}
             onChange={e=>setCrop(current=>current?resizeManualPhotoCrop(current,imageWidth,imageHeight,Number(e.target.value)):current)} className="mt-3 w-full accent-cyan-400"/>
         </label>
         <div className="grid grid-cols-3 gap-2">
           <span/>
           <Button type="button" variant="outline" onClick={()=>setCrop(c=>c?moveManualPhotoCrop(c,imageWidth,imageHeight,0,-Math.max(3,c.height*.09)):c)}>↑</Button>
           <span/>
           <Button type="button" variant="outline" onClick={()=>setCrop(c=>c?moveManualPhotoCrop(c,imageWidth,imageHeight,-Math.max(3,c.width*.09),0):c)}>←</Button>
           <Button type="button" variant="outline" onClick={()=>setCrop(c=>c?centerManualPhotoCrop(c,imageWidth,imageHeight,imageWidth/2,imageHeight/2):c)}>Centro</Button>
           <Button type="button" variant="outline" onClick={()=>setCrop(c=>c?moveManualPhotoCrop(c,imageWidth,imageHeight,Math.max(3,c.width*.09),0):c)}>→</Button>
           <span/>
           <Button type="button" variant="outline" onClick={()=>setCrop(c=>c?moveManualPhotoCrop(c,imageWidth,imageHeight,0,Math.max(3,c.height*.09)):c)}>↓</Button>
           <span/>
         </div>
         <p className="text-xs text-slate-400">A proporção segue a foto detectada. Arraste a moldura ou utilize as setas; confira rosto e ombros antes de confirmar.</p>
         {error&&<p role="alert" className="text-sm text-red-300">{error}</p>}
       </div>
     </div>
     <DialogFooter>
       <Button type="button" variant="outline" onClick={()=>onOpenChange(false)}>CANCELAR</Button>
       <Button type="button" disabled={!valid} onClick={confirm}>CONFIRMAR NOVO RECORTE</Button>
     </DialogFooter>
   </DialogContent>
 </Dialog>;
}
