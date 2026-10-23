import { useMemo, useState } from "react";
import { Car, Database, Search, ShieldCheck, ShieldX, Sparkles } from "lucide-react";
import AdminHeader from "@/components/AdminHeader";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

type Kind = "placa" | "chassi";

export default function AdminVehicleUsage() {
  const [kind, setKind] = useState<Kind>("placa");
  const [value, setValue] = useState("");
  const [searched, setSearched] = useState<{ type: Kind; value: string } | null>(null);
  const check = trpc.vehicleUsage.check.useQuery(
    searched ? { type: searched.type, value: searched.value } : { type: "placa", value: "ABC1D23" },
    { enabled: !!searched, retry: false, staleTime: 0 }
  );
  const save = trpc.vehicleUsage.save.useMutation({
    onSuccess: async (data) => {
      if (data.saved) toast.success("Guardado como utilizado.");
      else toast.warning("Esse dado já estava guardado.");
      setSearched({ type: kind, value: data.normalizedValue });
      await check.refetch();
    },
    onError: (e) => toast.error(e.message || "Não foi possível guardar."),
  });

  const normalizedPreview = useMemo(() => value.toUpperCase().replace(/[^A-Z0-9]/g, ""), [value]);
  const doCheck = () => {
    if (!normalizedPreview) return toast.error("Digite uma placa ou chassi.");
    setSearched({ type: kind, value: normalizedPreview });
  };
  const result = searched && !check.isLoading ? check.data : null;

  return <div className="min-h-screen bg-[#04030a] text-white">
    <AdminHeader title="PLACA / CHASSI USADOS" icon={<Database className="h-5 w-5" />} />
    <div className="relative mx-auto max-w-5xl overflow-hidden px-4 py-8">
      <div className="pointer-events-none absolute inset-0 opacity-60 [background-image:radial-gradient(circle_at_20%_20%,rgba(168,85,247,.22),transparent_34%),radial-gradient(circle_at_80%_10%,rgba(34,211,238,.18),transparent_32%),radial-gradient(circle_at_50%_80%,rgba(245,184,0,.12),transparent_36%)]" />
      <div className="relative rounded-[28px] border border-fuchsia-400/30 bg-black/55 p-5 shadow-[0_0_70px_rgba(168,85,247,.18)] backdrop-blur">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-2xl border border-cyan-300/30 bg-cyan-400/10 shadow-[0_0_30px_rgba(34,211,238,.25)]"><Sparkles className="h-8 w-8 text-cyan-300" /></div>
          <h1 className="text-2xl font-black tracking-[.12em] text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-fuchsia-300 to-yellow-300">COFRE DE IDENTIFICADORES</h1>
          <p className="mt-2 text-xs font-bold uppercase tracking-[.2em] text-white/45">consulta instantânea · bloqueio definitivo de reutilização</p>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-3">
          <button onClick={() => { setKind("placa"); setSearched(null); }} className={`rounded-2xl border p-4 font-black transition ${kind==="placa"?"border-cyan-300/60 bg-cyan-400/15 text-cyan-200 shadow-[0_0_25px_rgba(34,211,238,.16)]":"border-white/10 bg-white/[.03] text-white/45"}`}><Car className="mx-auto mb-2 h-6 w-6"/>PLACA</button>
          <button onClick={() => { setKind("chassi"); setSearched(null); }} className={`rounded-2xl border p-4 font-black transition ${kind==="chassi"?"border-fuchsia-300/60 bg-fuchsia-400/15 text-fuchsia-200 shadow-[0_0_25px_rgba(217,70,239,.16)]":"border-white/10 bg-white/[.03] text-white/45"}`}><Database className="mx-auto mb-2 h-6 w-6"/>CHASSI</button>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[.035] p-4">
          <label className="mb-2 block text-[11px] font-black uppercase tracking-[.16em] text-white/55">{kind === "placa" ? "Digite a placa" : "Digite o chassi"}</label>
          <input autoFocus value={value} onChange={e=>{setValue(e.target.value);setSearched(null);}} onKeyDown={e=>{if(e.key==="Enter")doCheck();}} placeholder={kind==="placa"?"ABC1D23":"DIGITE O CHASSI"} className="h-16 w-full rounded-2xl border border-cyan-400/25 bg-black/55 px-5 text-center text-2xl font-black uppercase tracking-[.16em] text-white outline-none focus:border-cyan-300/60 focus:shadow-[0_0_30px_rgba(34,211,238,.15)]" />
          <button onClick={doCheck} disabled={check.isFetching} className="mt-3 flex h-13 w-full items-center justify-center gap-2 rounded-2xl border border-cyan-300/35 bg-gradient-to-r from-cyan-500/25 via-blue-500/20 to-fuchsia-500/25 font-black text-cyan-100 hover:brightness-125 disabled:opacity-50"><Search className="h-5 w-5"/>{check.isFetching?"CONSULTANDO...":"CONSULTAR EXISTÊNCIA"}</button>
        </div>

        {result && <div className={`mt-5 rounded-3xl border p-6 text-center ${result.exists?"border-red-400/45 bg-red-500/10 shadow-[0_0_38px_rgba(239,68,68,.16)]":"border-emerald-400/45 bg-emerald-500/10 shadow-[0_0_38px_rgba(16,185,129,.16)]"}`}>
          {result.exists ? <><ShieldX className="mx-auto h-12 w-12 text-red-300"/><p className="mt-3 text-2xl font-black text-red-300">JÁ UTILIZADO</p><p className="mt-1 text-sm font-bold text-white/55">{result.normalizedValue} já existe no banco.</p></> : <><ShieldCheck className="mx-auto h-12 w-12 text-emerald-300"/><p className="mt-3 text-2xl font-black text-emerald-300">NÃO UTILIZADO</p><p className="mt-1 text-sm font-bold text-white/55">{result.normalizedValue} ainda não existe no banco.</p><button onClick={()=>save.mutate({type:kind,value:result.normalizedValue})} disabled={save.isPending} className="mt-5 w-full rounded-2xl border border-yellow-300/45 bg-yellow-400/15 px-4 py-4 text-sm font-black text-yellow-200 shadow-[0_0_26px_rgba(245,184,0,.12)] hover:bg-yellow-400/25 disabled:opacity-50">{save.isPending?"GUARDANDO...":"GUARDAR COMO UTILIZADO"}</button></>}
        </div>}
      </div>
    </div>
  </div>;
}
