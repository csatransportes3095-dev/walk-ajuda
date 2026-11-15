import { useState } from "react";
import { ClipboardCopy, SearchCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { MAX_PLATES_PER_LOOKUP, parseVaultPlateList } from "./vehicleVaultPlateBatchUtils";

type LookupResult = {
  total: number;
  available: string[];
  registered: {plate:string;inactive:boolean}[];
};

export default function VehicleVaultPlateLookupPanel(){
  const [input,setInput]=useState("");
  const [result,setResult]=useState<LookupResult|null>(null);
  const [previousInput,setPreviousInput]=useState("");
  const lookup=trpc.vehicleVault.checkPlates.useMutation();
  const parsed=parseVaultPlateList(input);
  const stale=input!==previousInput;
  const run=async()=>{
    if(!parsed.plates.length)return toast.error("Cole pelo menos uma placa válida.");
    if(parsed.plates.length>MAX_PLATES_PER_LOOKUP)return toast.error("Máximo de 2.000 placas únicas por consulta.");
    setResult(null);
    try{
      const checked=await lookup.mutateAsync({plates:parsed.plates});
      setResult(checked);
      setPreviousInput(input);
      toast.success(checked.available.length+" placa(s) não cadastrada(s) encontradas.");
    }catch(error){
      toast.error(error instanceof Error?error.message:"Não foi possível consultar as placas.");
    }
  };
  const copy=async()=>{
    if(!result||stale||!result.available.length)return;
    try{
      await navigator.clipboard.writeText(result.available.join("\n"));
      toast.success(result.available.length+" placa(s) copiadas, uma por linha.");
    }catch{toast.error("Não foi possível copiar. Selecione as placas na caixa de resultado.");}
  };
  return <section className="space-y-4 rounded-2xl border border-cyan-400/30 bg-[#071627] p-4 sm:p-5" aria-label="Consulta de placas em lote">
    <div>
      <h4 className="text-base font-black text-cyan-200">CONSULTAR PLACAS EM LOTE</h4>
      <p className="mt-1 text-xs leading-relaxed text-slate-300">Cole as placas em linhas ou separadas por vírgula. Compara com todo o Cofre, inclusive registros inativos. As já cadastradas são descartadas do resultado para copiar.</p>
    </div>
    <label className="block text-xs font-bold text-slate-200" htmlFor="cofre-plate-batch">LISTA DE PLACAS
      <textarea id="cofre-plate-batch" value={input} onChange={event=>setInput(event.target.value)}
        className="mt-2 h-44 w-full resize-y rounded-xl border border-white/20 bg-black/55 p-3 font-mono text-sm text-white outline-none focus:border-cyan-300/60"
        placeholder={"ABC1D23\nDEF4G56\nGHI7J89"}/>
    </label>
    <div className="flex flex-wrap gap-2 text-xs">
      <span className="rounded-lg border border-cyan-400/30 px-3 py-2 text-cyan-200">{parsed.plates.length} únicas</span>
      <span className="rounded-lg border border-amber-400/25 px-3 py-2 text-amber-200">{parsed.duplicates.length} repetidas no texto</span>
      <span className="rounded-lg border border-rose-400/25 px-3 py-2 text-rose-200">{parsed.invalid.length} linhas inválidas</span>
    </div>
    {parsed.plates.length>MAX_PLATES_PER_LOOKUP&&<p className="text-xs font-bold text-rose-300">Limite de 2.000 placas por consulta. Divida a lista.</p>}
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={lookup.isPending||parsed.plates.length===0||parsed.plates.length>MAX_PLATES_PER_LOOKUP}
        onClick={()=>void run()} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-3 text-xs font-black text-slate-950 disabled:opacity-40">
        <SearchCheck className="h-4 w-4"/>{lookup.isPending?"CONSULTANDO...":"CONSULTAR E DESCARTAR CADASTRADAS"}
      </button>
      <button type="button" disabled={lookup.isPending} onClick={()=>{setInput("");setResult(null);setPreviousInput("");}}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/20 px-4 py-2 text-xs font-bold text-slate-200 disabled:opacity-40">
        <Trash2 className="h-4 w-4"/> LIMPAR
      </button>
    </div>
    {result&&!stale&&<div className="space-y-3 border-t border-white/15 pt-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-cyan-400/25 bg-cyan-400/5 p-3"><p className="text-[10px] font-bold text-slate-300">CONSULTADAS</p><strong className="text-2xl text-white">{result.total}</strong></div>
        <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/5 p-3"><p className="text-[10px] font-bold text-emerald-200">NÃO CADASTRADAS</p><strong className="text-2xl text-emerald-300">{result.available.length}</strong></div>
        <div className="rounded-xl border border-rose-400/25 bg-rose-400/5 p-3"><p className="text-[10px] font-bold text-rose-200">DESCARTADAS</p><strong className="text-2xl text-rose-300">{result.registered.length}</strong></div>
      </div>
      <div className="rounded-xl border border-emerald-400/30 bg-black/30 p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h5 className="text-xs font-black text-emerald-200">PLACAS NÃO CADASTRADAS — PRONTAS PARA COPIAR</h5>
          <button type="button" disabled={!result.available.length} onClick={()=>void copy()}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-black text-slate-950 disabled:opacity-40">
            <ClipboardCopy className="h-4 w-4"/> COPIAR ({result.available.length})
          </button>
        </div>
        <textarea readOnly value={result.available.join("\n")} rows={Math.max(3,Math.min(12,result.available.length))}
          aria-label="Placas não cadastradas" className="w-full resize-y rounded-lg border border-white/15 bg-black/40 p-3 font-mono text-sm text-white"/>
      </div>
      {result.registered.length>0&&<details className="rounded-xl border border-rose-400/20 bg-rose-400/5 p-3">
        <summary className="cursor-pointer text-xs font-black text-rose-200">{result.registered.length} JÁ CADASTRADAS — EXCLUÍDAS DA CÓPIA</summary>
        <div className="mt-3 max-h-36 overflow-y-auto font-mono text-xs text-slate-300">
          {result.registered.map(item=><p key={item.plate}>{item.plate}{item.inactive?" · INATIVA":""}</p>)}
        </div>
      </details>}
    </div>}
    {result&&stale&&<p className="text-xs font-bold text-amber-200">A lista foi alterada. Consulte novamente para copiar um resultado atualizado.</p>}
    <p className="text-[11px] text-slate-400">Consulta somente de leitura. Nenhum documento será cadastrado, alterado, aprovado ou excluído.</p>
  </section>;
}
