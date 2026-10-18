
import { useCallback, useEffect, useRef, useState } from "react";
import { ClipboardPaste } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { isValidCpf } from "@/lib/h2bicoCpfExtractor";
import { shouldPreselectH2BicoPhoto } from "@/lib/h2bicoImportReview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { findWhitePhotoCrop, locateWhitePortrait, isWhitePortraitAboveName, type WhitePhotoCrop } from "@/lib/h2bicoWhitePhotoCrop";

type Item={
  id:string; source:string; name:string; cpf:string;
  photo:string; crop:{x:number;y:number;size:number};
  width:number;height:number; existing:boolean; selected:boolean; warnings:string[];
  error?:string; saved?:boolean; cpfSuggestion?:string|null;
  photoLayout?:"left"|"right"|"above"; confidence?:number;
  nameBox?:{left:number;top:number;width:number;height:number};
  cropMode?:"original"|"white"; whiteCrop?:WhitePhotoCrop|null; whiteChecked?:boolean;
};
const digits=(value:string)=>value.replace(/\D/g,"");
const readBase64=(file:File)=>new Promise<string>((resolve,reject)=>{
  const reader=new FileReader();
  reader.onerror=()=>reject(new Error("Falha ao ler o print."));
  reader.onload=()=>resolve(String(reader.result||"").split(",")[1]||"");
  reader.readAsDataURL(file);
});
async function cropPhoto(item:Item):Promise<string>{
  const image=new Image();
  image.src=item.photo;
  await image.decode();
  const canvas=document.createElement("canvas");
  const size=Math.round(item.crop.size);
  const white=item.cropMode==="white" ? item.whiteCrop : null;
  const x=Math.round(item.crop.x);
  const y=Math.round(item.crop.y);
  if(size<48||x<0||y<0||x+size>image.naturalWidth||y+size>image.naturalHeight)
    throw new Error("Ajuste o recorte da foto.");
  canvas.width=white ? Math.round(white.width) : size;
  canvas.height=white ? Math.round(white.height) : size;
  const ctx=canvas.getContext("2d");
  if(!ctx)throw new Error("Não foi possível recortar a foto.");
  if(white){
    if(white.x<0||white.y<0||white.width<48||white.height<48||white.x+white.width>image.naturalWidth||white.y+white.height>image.naturalHeight)
      throw new Error("Recorte branco inválido. Confira a foto.");
    ctx.drawImage(image,white.x,white.y,white.width,white.height,0,0,white.width,white.height);
  }else ctx.drawImage(image,x,y,size,size,0,0,size,size);
  // Only the cropped portrait canvas is serialized, never the full print.
  const p=ctx.getImageData(Math.floor(canvas.width*.5),Math.floor(canvas.height*.5),1,1).data;
  if(p[0]+p[1]+p[2]<90)throw new Error("Recorte escuro ou vazio. Foto não salva.");
  return canvas.toDataURL("image/jpeg",0.9).split(",")[1];
}
function CropPreview({item}:{item:Item}){
  const {crop,width,height}=item;
  const active=item.cropMode==="white"&&item.whiteCrop?item.whiteCrop:{x:crop.x,y:crop.y,width:crop.size,height:crop.size};
  const scale=112/Math.max(1,active.width);
  return <div className={`relative ${item.cropMode==="white"?"h-36":"h-28"} w-28 shrink-0 overflow-hidden rounded-lg border border-cyan-400/40 bg-black`}>
    <img alt={"Recorte de "+item.name} src={item.photo} style={{
      position:"absolute",maxWidth:"none",width:width*scale,height:height*scale,
      left:-active.x*scale,top:-active.y*scale
    }}/>
  </div>;
}
export default function H2BicoScreenshotImporter(){
  const input=useRef<HTMLInputElement>(null);
  const [items,setItems]=useState<Item[]>([]);
  const [busy,setBusy]=useState(false);
  const [saving,setSaving]=useState(false);
  const [status,setStatus]=useState("");
  // Fila sem limite artificial de quantidade: cada imagem e analisada separadamente.
  const pendingRef=useRef<File[]>([]);
  const runningRef=useRef(false);
  const savingRef=useRef(false);
  const photoUrlsRef=useRef(new Set<string>());
  const [pendingCount,setPendingCount]=useState(0);
  const [processedCount,setProcessedCount]=useState(0);
  const nextPrintNumber=useRef(0);

  useEffect(()=>()=>{for(const url of photoUrlsRef.current)URL.revokeObjectURL(url);photoUrlsRef.current.clear();},[]);
  const analyze=trpc.h2bico.analyzeScreenshot.useMutation();
  const save=trpc.h2bico.importScreenshotRecord.useMutation();
  const utils=trpc.useUtils();
  const update=(id:string,patch:Partial<Item>)=>setItems(current=>current.map(item=>item.id===id?{...item,...patch}:item));
  // Automatically try the independent white-background crop on every
  // imported print. Wrong legacy estimates must not silently save a dark box.
  const autoPreviewWhite=async(item:Item)=>{
    if(!item.nameBox)return;
    try{
      const img=new Image();img.src=item.photo;await img.decode();
      const scale=Math.min(1,1400/Math.max(img.naturalWidth,img.naturalHeight));
      const canvas=document.createElement("canvas");
      canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
      canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
      const ctx=canvas.getContext("2d",{willReadFrequently:true});
      if(!ctx)return;
      ctx.drawImage(img,0,0,canvas.width,canvas.height);
      const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
      const box=item.nameBox;
      const found=locateWhitePortrait(pixels,canvas.width,canvas.height,
        box.left*scale,box.top*scale,box.width*scale);
      const crop=found?{x:Math.round(found.x/scale),y:Math.round(found.y/scale),
        width:Math.round(found.width/scale),height:Math.round(found.height/scale)}:null;
      if(isWhitePortraitAboveName(crop,box)){
        update(item.id,{whiteCrop:crop,cropMode:"white",whiteChecked:true,selected:false,
          error:undefined,warnings:[...item.warnings,
          "Foto branca encontrada automaticamente acima do nome. Confira a prévia e marque para salvar."]});
      }else if(item.selected){
        // Do not block the legacy workflow. Prevent auto-import when crop
        // plausibly points at the dark app background instead of a portrait.
        const x=Math.max(0,Math.min(img.naturalWidth-1,Math.round(item.crop.x+item.crop.size*.5)));
        const y=Math.max(0,Math.min(img.naturalHeight-1,Math.round(item.crop.y+item.crop.size*.5)));
        const sample=document.createElement("canvas");sample.width=sample.height=1;
        const sx=sample.getContext("2d");
        if(sx){sx.drawImage(img,x,y,1,1,0,0,1,1);
          const rgb=sx.getImageData(0,0,1,1).data;
          if(rgb[0]+rgb[1]+rgb[2]<170)
            update(item.id,{selected:false,warnings:[...item.warnings,
              "RECORTE ESCURO: nenhuma foto confirmada; confira a imagem original antes de salvar."]});
        }
      }
    }catch{ /* OCR and old manual crop remain available */ }
  };
  const applyWhitePreset=async(item:Item)=>{
    try{
      const img=new Image();img.src=item.photo;await img.decode();
      const canvas=document.createElement("canvas");
      const scale=Math.min(1,1400/Math.max(img.naturalWidth,img.naturalHeight));
      canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
      canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
      const ctx=canvas.getContext("2d",{willReadFrequently:true});
      if(!ctx)throw new Error("Não foi possível analisar a foto.");
      ctx.drawImage(img,0,0,canvas.width,canvas.height);
      const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
      const anchor=item.nameBox;
      const candidate=anchor?locateWhitePortrait(pixels,canvas.width,canvas.height,
        anchor.left*scale,anchor.top*scale,anchor.width*scale):null;
      const located=candidate?{
        x:Math.round(candidate.x/scale),y:Math.round(candidate.y/scale),
        width:Math.round(candidate.width/scale),height:Math.round(candidate.height/scale)
      }:null;
      // Compatibilidade: caso o print use o layout antigo, tenta o detector legado.
      const found=located||findWhitePhotoCrop(pixels,canvas.width,canvas.height,0,0,{
        x:item.crop.x*scale,y:item.crop.y*scale,size:item.crop.size*scale
      });
      const finalCrop=located|| (found?{
        x:Math.round(found.x/scale),y:Math.round(found.y/scale),
        width:Math.round(found.width/scale),height:Math.round(found.height/scale)
      }:null);
      update(item.id,{whiteChecked:true,whiteCrop:finalCrop,cropMode:finalCrop?"white":"original",
        selected:false,error:finalCrop?undefined:"Fundo branco não localizado com segurança. Recorte antigo preservado. Confira o print original."});
      if(finalCrop)toast.success("Foto padrão: somente a área branca foi selecionada. Confira o preview.");
      else toast.warning("Fundo branco não localizado; nenhum recorte foi substituído.");
    }catch(error){update(item.id,{selected:false,error:error instanceof Error?error.message:"Erro ao analisar fundo branco."});}
  };
  const processQueue=useCallback(async()=>{
    if(runningRef.current||savingRef.current)return;
    runningRef.current=true;
    setBusy(true);
    try{
      while(pendingRef.current.length){
        const file=pendingRef.current.shift()!;
        setPendingCount(pendingRef.current.length);
        const number=++nextPrintNumber.current;
        setStatus("Analisando print "+number+" • "+file.name);
        try{
          if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>10*1024*1024||file.size===0)
            throw new Error("Use JPG, PNG ou WEBP com até 10 MB por imagem.");
          const base64=await readBase64(file);
          const analysis=await analyze.mutateAsync({base64});
          if(analysis.persons.length){
            // Mantem a foto uma unica vez, via Blob URL, em vez de copiar um
            // base64 grande para cada pessoa encontrada no mesmo print.
            const photo=URL.createObjectURL(file);
            photoUrlsRef.current.add(photo);
            const incoming:Item[]=analysis.persons.map((p,i)=>({
              id:Date.now()+"-"+number+"-"+i+"-"+Math.random(),
              source:file.name,photo,name:p.name,cpf:p.cpf,cpfSuggestion:p.cpfSuggestion,crop:p.crop,
               photoLayout:p.photoLayout,confidence:p.confidence,
               nameBox:p.nameBox,
               whiteCrop:p.whitePhotoCrop||null,
               cropMode:p.whitePhotoCrop?"white":"original",
               whiteChecked:true,
              width:analysis.width,height:analysis.height,
              existing:p.alreadyExists,
              selected:shouldPreselectH2BicoPhoto(p),
              warnings:[...p.warnings],
            }));
            setItems(current=>{
              const known=new Set(current.map(item=>digits(item.cpf)));
              const merged=[...current];
              for(const person of incoming){
                if(known.has(person.cpf)){
                  person.selected=false;
                  person.warnings.push("CPF repetido em outro print.");
                }else known.add(person.cpf);
                merged.push(person);
              }
              return merged;
            });
            // The server has already located portraits on the full source image.
            // Never overwrite these coordinates with the old proximity-based detector.
          }else toast.warning(file.name+": nenhum CPF identificado.");
        }catch(error){
          toast.error(file.name+": "+(error instanceof Error?error.message:"Falha na leitura"));
        }finally{
          setProcessedCount(count=>count+1);
        }
      }
    }finally{
      runningRef.current=false;
      setBusy(false);
      setStatus("");
    }
  },[analyze]);

  const inspect=useCallback((files:FileList|File[])=>{
    if(savingRef.current){
      toast.warning("Aguarde o salvamento terminar antes de adicionar prints.");
      return;
    }
    const chosen=Array.from(files);
    if(!chosen.length)return;
    pendingRef.current.push(...chosen);
    setPendingCount(pendingRef.current.length);
    void processQueue();
  },[processQueue]);

  // Botao explicito para ler imagens da area de transferencia.
  const pasteFromClipboard=async()=>{
    if(savingRef.current)return;
    if(!navigator.clipboard?.read){
      toast.info("Use Ctrl+V para colar o print neste painel.");
      return;
    }
    try{
      const clips=await navigator.clipboard.read();
      const files:File[]=[];
      for(const clip of clips){
        const imageType=clip.types.find(type=>["image/png","image/jpeg","image/webp"].includes(type));
        if(!imageType)continue;
        const blob=await clip.getType(imageType);
        const ext=imageType==="image/png"?"png":imageType==="image/webp"?"webp":"jpg";
        files.push(new File([blob],"print-colado-"+Date.now()+"-"+(files.length+1)+"."+ext,{type:imageType}));
      }
      if(!files.length){toast.warning("Copie uma imagem ou tire um print antes de clicar em COLAR PRINT.");return;}
      inspect(files);
    }catch{
      toast.error("O navegador não permitiu ler o clipboard. Experimente Ctrl+V.");
    }
  };

  // Ctrl+V em qualquer ponto da pagina; nao interfere com textos normais.
  useEffect(()=>{
    const handlePaste=(event:ClipboardEvent)=>{
      const files=Array.from(event.clipboardData?.items||[])
        .filter(item=>item.kind==="file"&&["image/png","image/jpeg","image/webp"].includes(item.type))
        .map(item=>item.getAsFile()).filter((file):file is File=>file!==null);
      if(!files.length)return;
      event.preventDefault();
      inspect(files);
    };
    document.addEventListener("paste",handlePaste);
    return ()=>document.removeEventListener("paste",handlePaste);
  },[inspect]);

  const clearResults=()=>{
    if(runningRef.current||savingRef.current)return;
    for(const url of photoUrlsRef.current)URL.revokeObjectURL(url);
    photoUrlsRef.current.clear();
    setItems([]);
    setProcessedCount(0);
    nextPrintNumber.current=0;
  };
  const saveAll=async()=>{
    if(savingRef.current||runningRef.current||pendingRef.current.length)return;
    savingRef.current=true;
    setSaving(true);
    let imported=0,duplicates=0,errors=0;
    try{
      // A validacao final e feita de novo no servidor, inclusive duplicidade.
      for(const item of items.filter(row=>row.selected&&!row.saved)){
        if(!isValidCpf(item.cpf)||item.name.trim().split(/\s+/).length<2){
          update(item.id,{error:"Nome completo ou CPF inválido.",selected:false});errors++;continue;
        }
        setStatus("Salvando "+item.name+"...");
        try{
          if(item.cropMode!=="white"||!item.whiteCrop){update(item.id,{error:"Foto com fundo branco não identificada automaticamente. Salvamento bloqueado.",selected:false});errors++;continue;}
          const base64=await cropPhoto(item);
          const result=await save.mutateAsync({cpf:item.cpf,name:item.name,base64,photoMode:item.cropMode==="white"?"white":"original"});
          if(result.result==="imported"){imported++;update(item.id,{saved:true,selected:false,error:undefined});}
          else{duplicates++;update(item.id,{selected:false,existing:true,error:"CPF já cadastrado."});}
        }catch(error){errors++;update(item.id,{error:error instanceof Error?error.message:"Falha ao salvar"});}
      }
      await utils.h2bico.invalidate();
      toast.info("Concluído: "+imported+" novo(s), "+duplicates+" duplicado(s), "+errors+" erro(s).");
    }finally{savingRef.current=false;setSaving(false);setStatus("");}
  };
  const eligible=(item:Item)=>!item.existing&&!item.saved&&isValidCpf(item.cpf)&&
    item.name.trim().split(/\\s+/).length>=2&&item.confidence!==undefined&&item.confidence>=70&&
    !item.cpfSuggestion&&!item.warnings.some(w=>/CONFIRA O N[UÚ]MERO|ASSOCIA|CPF REPETIDO|LEITURA DIVERGENTE/i.test(w))&&
    (item.cropMode==="white"&&!!item.whiteCrop||item.crop.size>=48);
  const selected=items.filter(item=>item.selected&&!item.saved&&!item.existing);
  const selectable=items.filter(eligible);
  const selectAll=()=>setItems(current=>current.map(item=>({...item,selected:eligible(item)})));
  const deselectAll=()=>setItems(current=>current.map(item=>({...item,selected:false})));
  return <Card className="border-cyan-500/30 bg-gray-900 p-4 space-y-3 text-white">
    <div>
      <div className="text-xs font-black uppercase tracking-widest text-cyan-300">Extrator inteligente de prints</div>
      <h2 className="mt-1 text-xl font-black">Foto + nome + CPF → H2BICO</h2>
      <p className="mt-1 text-sm text-gray-400">Envie prints dos resultados. Confira cada foto e corrija o nome ou CPF antes de salvar. Os dados existentes não são substituídos.</p>
    </div>
    <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden"
      onChange={e=>{if(e.target.files)void inspect(e.target.files);e.currentTarget.value="";}}/>
    <div onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();inspect(e.dataTransfer.files);}}
      className="rounded-xl border-2 border-dashed border-cyan-400/40 p-4 text-center">
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button type="button" onClick={()=>input.current?.click()} disabled={saving}>SELECIONAR OU ARRASTAR PRINTS</Button>
        <Button type="button" onClick={()=>void pasteFromClipboard()} disabled={saving}
          className="bg-emerald-600 font-black text-white hover:bg-emerald-500">
          <ClipboardPaste className="mr-2 h-4 w-4"/>COLAR PRINT
        </Button>
      </div>
      <p className="mt-2 text-xs text-gray-400">Sem limite fixo de quantidade: cole quantos prints quiser, inclusive com Ctrl+V. Processamento individual em fila, até 10 MB por imagem. Confira os dados antes de salvar.</p>
      {(busy||pendingCount>0)&&<p role="status" className="mt-2 text-sm font-semibold text-cyan-300">Processados: {processedCount} • Aguardando na fila: {pendingCount} • Processando um print por vez</p>}
    </div>
    {status&&<p role="status" className="text-sm text-amber-200">{status}</p>}
    {items.length>0&&<>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-bold">{items.length} identificado(s) • {items.filter(x=>x.existing).length} já cadastrado(s) • {selected.length} selecionado(s)</div>
        <div className="flex gap-2">
          <Button disabled={saving||busy} variant="outline" onClick={clearResults}>LIMPAR</Button>
          <Button disabled={saving||busy||!selected.length} onClick={()=>void saveAll()}>{saving?"SALVANDO...":"SALVAR "+selected.length+" NO H2BICO"}</Button>
        </div>
      </div>
      <div className="max-h-[600px] overflow-y-auto space-y-2">
        {items.map(item=><div key={item.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="flex flex-wrap items-start gap-3">
            <div className="space-y-2"><CropPreview item={item}/><p className="text-[11px] text-cyan-200">{item.cropMode==="white"?"Foto padrão 4:5":"Recorte atual"}</p></div>
            <div className="min-w-[210px] flex-1 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                 <div className="text-xs text-gray-400 break-all">{item.source}</div>
                 <Button type="button" variant="outline" size="sm" onClick={()=>window.open(item.photo,"_blank","noopener,noreferrer")}>
                   VER PRINT ORIGINAL
                 </Button>
               </div>
               <div className="text-xs text-cyan-200">
                 OCR {item.confidence??0}% • foto {item.photoLayout==="right"?"à direita":item.photoLayout==="above"?"acima":"à esquerda"}
                 {item.photoLayout!=="left"?" • confirme o recorte antes de marcar":""}
               </div>
              <Input aria-label="Nome completo" disabled={saving||item.saved||item.existing} value={item.name}
                onChange={e=>update(item.id,{name:e.target.value,error:undefined})} placeholder="NOME COMPLETO" />
              <Input aria-label="CPF" disabled={saving||item.saved||item.existing} value={item.cpf}
                onChange={e=>update(item.id,{cpf:digits(e.target.value).slice(0,11),error:undefined})} placeholder="CPF" />
              {item.cpfSuggestion&&!item.saved&&!item.existing&&<div className="rounded-lg border border-amber-500/50 bg-amber-950/20 p-2 space-y-2">
                <p className="text-xs font-bold text-amber-200">Possível erro de OCR. CPF sugerido: {item.cpfSuggestion.slice(0,3)}.{item.cpfSuggestion.slice(3,6)}.{item.cpfSuggestion.slice(6,9)}-{item.cpfSuggestion.slice(9)}. Compare com o print original.</p>
                <Button type="button" variant="outline" size="sm" disabled={saving} onClick={()=>{
                  if(!window.confirm("Você conferiu visualmente o CPF no print original e confirma esta correção?"))return;
                  update(item.id,{cpf:item.cpfSuggestion!,cpfSuggestion:null,selected:false,error:undefined});
                }}>CONFERI NO PRINT — USAR CPF SUGERIDO</Button>
              </div>}
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={item.selected} disabled={saving||item.saved||item.existing}
                  onChange={e=>update(item.id,{selected:e.target.checked})}/>
                {item.saved?"SALVO":item.existing?"CPF JÁ CADASTRADO":isValidCpf(item.cpf)?"Conferido — salvar":"CPF INVÁLIDO"}
              </label>
              {item.warnings.some(w=>w.includes("CONFIRA O NUMERO"))&&<p className="text-xs font-bold text-amber-200">OCR apresentou leituras diferentes. Verifique o CPF e marque manualmente antes de salvar.</p>}
              {item.warnings.map((w,i)=><p key={i} className="text-xs text-amber-200">{w}</p>)}
              {item.error&&<p className="text-xs text-red-300">{item.error}</p>}
            </div>
          </div>
          {!item.saved&&<div className="mt-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" variant={item.cropMode==="white"?"default":"outline"} disabled={saving||busy} onClick={()=>void applyWhitePreset(item)}>
                USAR RECORTE PADRÃO DA FOTO — FUNDO BRANCO
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={saving||busy} onClick={()=>update(item.id,{cropMode:"original",selected:false,error:undefined})}>
                VOLTAR AO RECORTE ATUAL
              </Button>
            </div>
            <p className="text-xs text-gray-400">Novo modo separado: começa no fundo branco, exclui a borda escura e mantém retrato vertical 4:5. Confira a prévia antes de marcar para salvar.</p>
            {item.existing&&<p className="text-xs text-amber-200">Já cadastrado: pode conferir o recorte, mas não é possível sobrescrever a foto salva.</p>}
            {!item.existing&&<div className="grid grid-cols-3 gap-2">
            {(["x","y","size"] as const).map(key=><label key={key} className="text-xs text-gray-400">
              {key==="x"?"Foto horizontal":key==="y"?"Foto vertical":"Tamanho do recorte"}
              <Input type="number" className="mt-1" min={key==="size"?48:0}
                value={item.crop[key]} disabled={saving}
                onChange={e=>update(item.id,{crop:{...item.crop,[key]:Number(e.target.value)}})}/>
            </label>)}
            </div>}
          </div>}
        </div>)}
      </div>
    </>}
  </Card>;
}
