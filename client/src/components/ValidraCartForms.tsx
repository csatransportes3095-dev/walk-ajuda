import { useEffect,useRef,useState } from "react";
import { trpc } from "@/lib/trpc";
import { QuestionAudioRecorder } from "@/components/QuestionAudioRecorder";
import { encodePrivateWav,readPrivateAudioDuration } from "@/lib/validraPrivateAudio";
import { resolveValidraQuestionFlow,type ValidraItemFormInput,type ValidraFormDocument } from "@shared/validraCartForms";

type Selection={productId:number;optionId:number;priceModelId?:number;warrantyTierId?:number};
type ItemDraft={answers:Record<number,string>;files:Record<string,string>;audioDurations?:Record<number,number>};
export type ValidraCartFormsState={scope:string;ready:boolean;forms:ValidraItemFormInput[]};
const blank:ItemDraft={answers:{},files:{}};
const fieldClass="block w-full rounded-lg bg-black/60 border border-white/20 p-2 text-white";
async function uploadDocument(file:File,doc:ValidraFormDocument,cpToken:string){
  if(file.size<=0||file.size>15*1024*1024)throw new Error("Selecione um arquivo de até 15 MB.");
  const data=await new Promise<string>((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result||""));
    reader.onerror=()=>reject(new Error("Não foi possível ler o arquivo."));
    reader.onabort=()=>reject(new Error("Leitura cancelada."));
    reader.readAsDataURL(file);
  });
  const controller=new AbortController();
  const timer=window.setTimeout(()=>controller.abort(),120000);
  try{
    const response=await fetch("/api/upload/validra-order-file-base64",{
      method:"POST",headers:{"Content-Type":"application/json","x-customer-session":cpToken},
      credentials:"include",signal:controller.signal,body:JSON.stringify({label:doc.label,data}),
    });
    const result=await response.json();
    if(!response.ok||result.success!==true||typeof result.fileKey!=="string"||result.label!==doc.label||
        (doc.pdfOnly&&result.mimeType!=="application/pdf")||(doc.imageOnly&&!/^image\/(jpeg|png|webp)$/.test(String(result.mimeType))))
      throw new Error("Documento não aceito. Use o tipo de arquivo solicitado e tente novamente.");
    return result.fileKey as string;
  }finally{window.clearTimeout(timer);}
}

export function ValidraCartForms({scope,items,phone,cpToken,onChange,disabled}:{
  scope:string;items:Selection[];phone:string;cpToken:string;onChange:(value:ValidraCartFormsState)=>void;disabled:boolean;
}){
  const query=trpc.uploads.validraCartRequirements.useQuery({cpToken,phone,items},{retry:false,refetchOnWindowFocus:false,enabled:cpToken.length>=32});
  const [drafts,setDrafts]=useState<Record<number,ItemDraft>>({});
  const [audioFlowId]=useState(()=>crypto.randomUUID());
  const [busy,setBusy]=useState<string|null>(null);
  const lock=useRef(false);
  const [error,setError]=useState("");
  useEffect(()=>{
    const specs=query.data;
    if(!specs||specs.length!==items.length||query.isError||query.isFetching){
      onChange({scope,ready:false,forms:[]});return;
    }
    let ready=!busy;
    const forms=specs.map((spec,index)=>{
      const draft=drafts[index]??blank;
      const flow=resolveValidraQuestionFlow(spec.questions,draft.answers);
      const visible=flow.questions;
      if(flow.invalid||visible.some(q=>q.required&&!draft.answers[q.id]?.trim())||visible.some(q=>q.fieldType==="select"&&draft.answers[q.id]&&!q.choices.some(choice=>choice.label===draft.answers[q.id]&&!choice.blocked))||spec.documents.some(doc=>!draft.files[doc.fieldId]))ready=false;
      return {
        audioFlowId,
        answers:visible.filter(q=>draft.answers[q.id]?.trim()).map(q=>({questionId:q.id,answer:draft.answers[q.id]})),
        documents:spec.documents.filter(doc=>draft.files[doc.fieldId]).map(doc=>({fieldId:doc.fieldId,fileKey:draft.files[doc.fieldId]})),
      };
    });
    onChange({scope,ready,forms});
  },[query.data,query.isError,query.isFetching,drafts,busy,scope,items.length,onChange,audioFlowId]);
  if(cpToken.length<32)return <p className="text-red-300">Entre na sua conta para carregar os formulários.</p>;
  if(query.isError)return <div className="space-y-2"><p className="text-red-300">{query.error?.message||"Não foi possível carregar os requisitos."}</p><button type="button" disabled={disabled} onClick={()=>void query.refetch()} className="underline text-blue-300">Tentar novamente</button></div>;
  if(!query.data||query.isFetching)return <p className="text-white/70">Carregando requisitos de cada item...</p>;
  return <div className="space-y-3">
    <p className="text-white font-bold">DOCUMENTOS E PERGUNTAS POR ITEM</p>
    {query.data.map((spec,index)=>{
      const draft=drafts[index]??blank;
      const flow=resolveValidraQuestionFlow(spec.questions,draft.answers);
      const visible=flow.questions;
      return <fieldset key={index} disabled={disabled||!!busy} className="space-y-3 rounded-lg border border-white/20 p-3">
        <legend className="text-blue-300 font-bold px-1">Item {index+1}: {spec.service} — {spec.option}</legend>
        {!spec.questions.length&&!spec.documents.length&&<p className="text-white/70 text-sm">Nenhum formulário adicional.</p>}
        {visible.map(question=>{
          const value=draft.answers[question.id]??"";
          const change=(answer:string)=>{
            setDrafts(prev=>{
              const current=prev[index]??blank;
              const answers={...current.answers,[question.id]:answer};
              // Changing a parent invalidates its descendants in this item only.
              const clear=(parent:number)=>{for(const child of spec.questions.filter(q=>q.parentQuestionId===parent)){delete answers[child.id];clear(child.id);}};
              if(current.answers[question.id]!==answer){
                clear(question.id);
                const previous=resolveValidraQuestionFlow(spec.questions,current.answers).questions;
                const position=previous.findIndex(q=>q.id===question.id);
                for(const later of previous.slice(position+1))delete answers[later.id];
              }
              return {...prev,[index]:{...current,answers}};
            });
          };
          if(question.fieldType==="audio"&&question.audio){
            const settings=question.audio;
            return <div key={question.id} className="space-y-1 text-sm text-white">
              <p>{question.question}{question.required?" *":""}</p>
              <QuestionAudioRecorder questionId={question.id} productId={spec.productId} optionId={spec.optionId}
                flowId={audioFlowId} phone={phone} minDurationSeconds={settings.min} maxDurationSeconds={settings.max}
                allowRerecord={settings.allowRerecord} allowFileUpload={settings.allowFileUpload} helpText={settings.helpText}
                value={value?{id:value,audioUrl:"private",mimeType:"audio/wav",durationSeconds:draft.audioDurations?.[question.id]??0}:undefined}
                privateDuration={readPrivateAudioDuration}
                privateUpload={async(file,source)=>{
                  if(lock.current)throw new Error("Há outro arquivo sendo enviado.");
                  lock.current=true;setBusy(index+":audio:"+question.id);
                  try{
                    const wav=await encodePrivateWav(file,settings.min,settings.max);
                    const data=await new Promise<string>((resolve,reject)=>{
                      const reader=new FileReader();
                      reader.onload=()=>resolve(String(reader.result||"").split(",")[1]||"");
                      reader.onerror=()=>reject(new Error("Não foi possível ler o áudio."));
                      reader.readAsDataURL(wav);
                    });
                    const response=await fetch("/api/upload/validra-question-audio",{method:"POST",credentials:"include",
                      headers:{"Content-Type":"application/json","x-customer-session":cpToken},
                      signal:AbortSignal.timeout(120000),body:JSON.stringify({flowId:audioFlowId,itemIndex:index,productId:spec.productId,optionId:spec.optionId,questionId:question.id,source,data})});
                    const result=await response.json();
                    if(!response.ok||result.success!==true||typeof result.fileKey!=="string"||!Number.isFinite(result.durationSeconds))throw new Error(result.error||"Áudio não autorizado.");
                    return {id:result.fileKey,audioUrl:"private",mimeType:"audio/wav",durationSeconds:result.durationSeconds};
                  }finally{lock.current=false;setBusy(null);}
                }}
                onConfirmed={audio=>{
                  change(audio.id);
                  setDrafts(prev=>{const current=prev[index]??blank;return {...prev,[index]:{...current,audioDurations:{...current.audioDurations,[question.id]:audio.durationSeconds}}};});
                }} onClear={()=>change("")}/>
            </div>;
          }
          return <label key={question.id} className="block space-y-1 text-sm text-white">
            <span>{question.question}{question.required?" *":""}</span>
            {question.fieldType==="select"?<select className={fieldClass} value={value} onChange={e=>change(e.target.value)}>
              <option value="">Selecione</option>{question.choices.map(choice=><option key={choice.label} value={choice.label} disabled={choice.blocked}>{choice.label}{choice.blocked?" (indisponível)":""}</option>)}
            </select>:question.fieldType==="textarea"?<textarea className={fieldClass} value={value} maxLength={2000} onChange={e=>change(e.target.value)}/>:<input className={fieldClass} value={value} maxLength={2000} onChange={e=>change(e.target.value)}/>}
          </label>;
        })}
        {flow.invalid&&<p className="text-red-300" role="alert">Caminho de respostas indisponível. Revise a seleção.</p>}
        {flow.message&&<p className="text-white/90 border border-white/20 rounded-lg p-2">{flow.message}</p>}
        {spec.documents.map(doc=><label key={doc.fieldId} className="block space-y-1 text-sm text-white">
          <span>{doc.label} * {draft.files[doc.fieldId]?"— enviado":""}</span>
          <input type="file" className={fieldClass} accept={doc.pdfOnly?"application/pdf":doc.imageOnly?"image/jpeg,image/png,image/webp":"application/pdf,image/jpeg,image/png,image/webp"} capture={doc.inputSource==="camera"?"environment":undefined} onChange={async event=>{
            const file=event.target.files?.[0];event.target.value="";
            if(!file||lock.current)return;
            lock.current=true;setBusy(index+":"+doc.fieldId);setError("");
            setDrafts(prev=>{const current=prev[index]??blank;const files={...current.files};delete files[doc.fieldId];return {...prev,[index]:{...current,files}};});
            try{
              const fileKey=await uploadDocument(file,doc,cpToken);
              setDrafts(prev=>{const current=prev[index]??blank;return {...prev,[index]:{...current,files:{...current.files,[doc.fieldId]:fileKey}}};});
            }catch(e){setError("Item "+(index+1)+": "+(e instanceof Error?e.message:"Falha no envio."));}
            finally{lock.current=false;setBusy(null);}
          }}/>
        </label>)}
      </fieldset>;
    })}
    {busy&&<p className="text-blue-300">Enviando documento. Aguarde a confirmação.</p>}
    {error&&<p className="text-red-300" role="alert">{error}</p>}
  </div>;
}
