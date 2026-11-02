import React, { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Building2, Upload, Search, Save, CheckCircle2, FileSpreadsheet, ClipboardPaste, Download } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { readTransportExcel } from "@/lib/transportesExcel";
import { isValidTransportCnpj, normalizeTransportCnpj, formatTransportCnpj, classifyTransport, TRANSPORT_TYPES, TRANSPORT_TYPE_LABELS, TRANSPORT_UFS, type TransportType } from "@shared/transportes";

type Draft = { cnpj: string; name: string; uf: string; city: string; type: TransportType; cnae: string; source: string; notes: string; isUsed: boolean };
const blank = (): Draft => ({ cnpj: "", name: "", uf: "SP", city: "", type: "carga", cnae: "", source: "Cadastro manual", notes: "", isUsed: false });
const fields = ["name", "cnpj", "type", "cnae", "city", "uf", "isUsed"] as const;
const normal = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
function recognize(header: string): keyof Draft | "" {
  const h = normal(header);
  if (/^(razaosocial|nomeempresarial|empresa|nome|transportadora|fantasia)$/.test(h)) return "name";
  if (/^(cnpj|cnpjcpf|documento)$/.test(h)) return "cnpj";
  if (/^(cidade|municipio|localidade)$/.test(h)) return "city";
  if (/^(uf|estado|siglaestado)$/.test(h)) return "uf";
  if (/^(tipo|tipodeservico|servico|modalidade|categoria)$/.test(h)) return "type";
  if (/^(cnae|cnaeprincipal|cnaeprimario)$/.test(h)) return "cnae";
  if (/^(jausado|usado|status|situacao)$/.test(h)) return "isUsed";
  return "";
}
function rowsToDraft(rows: unknown[][], fallbackUf: string, origin: string): Draft[] {
  const clean = rows.filter(row => row.some(x => String(x ?? "").trim()));
  if (!clean.length) return [];
  const headers = clean[0].map(v => recognize(String(v ?? "")));
  const hasHeader = headers.includes("cnpj");
  const positions: Record<string, number> = {};
  if (hasHeader) headers.forEach((h, i) => { if (h && positions[h] === undefined) positions[h] = i; });
  else { positions.name = 0; positions.cnpj = 1; positions.type = 2; positions.cnae = 3; positions.city = 4; positions.uf = 5; }
  return clean.slice(hasHeader ? 1 : 0).map(row => {
    const get = (key: string) => String(row[positions[key]] ?? "").trim();
    const used = get("isUsed").toLowerCase();
    return { cnpj: normalizeTransportCnpj(get("cnpj")), name: get("name") || "NOME NÃO INFORMADO",
      uf: get("uf").toUpperCase() || fallbackUf, city: get("city"), type: classifyTransport(get("type") || get("name")),
      cnae: get("cnae"), source: origin, notes: "", isUsed: /^(ja usado|já usado|usado|sim|true|1)$/.test(used) };
  }).filter(row => row.cnpj.length > 0);
}
async function readImportedFile(file: File, fallbackUf: string): Promise<Draft[]> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "xlsx" || ext === "xls") {
    const sheets = await readTransportExcel(file);
    return sheets.flatMap(({ sheet, rows }) => rowsToDraft(rows, fallbackUf, file.name + " / " + sheet));
  }
  const text = await file.text();
  return parsePasted(text, fallbackUf, file.name);
}
function parsePasted(text: string, uf: string, origin = "Texto colado"): Draft[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(x => x.trim());
  if (!lines.length) return [];
  let delimiter = "\t";
  const first = lines[0] || "";
  if (!first.includes("\t")) delimiter = first.includes(";") ? ";" : ",";
  // CSV de texto com aspas duplas escapadas, compatível com Excel.
  const rows: string[][] = [];
  for (const line of lines) {
    let current = "", quoted = false, row: string[] = [];
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"' && line[i + 1] === '"' && quoted) { current += '"'; i++; }
      else if (c === '"') quoted = !quoted;
      else if (c === delimiter && !quoted) { row.push(current); current = ""; }
      else current += c;
    }
    row.push(current);
    if (row.length === 1) {
      const match = line.match(/\b\d{2}[.]?\d{3}[.]?\d{3}[/]?\d{4}[-]?\d{2}\b/);
      if (match) { rows.push([line.replace(match[0], "").trim(), match[0]]); continue; }
    }
    rows.push(row);
  }
  return rowsToDraft(rows, uf, origin);
}

export default function AdminTransportes() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [draft, setDraft] = useState<Draft>(blank);
  const [editId, setEditId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [uf, setUf] = useState("");
  const [city, setCity] = useState("");
  const [type, setType] = useState("");
  const [used, setUsed] = useState<"todos" | "usados" | "disponiveis">("todos");
  const [page, setPage] = useState(1);
  const [paste, setPaste] = useState("");
  const [importUf, setImportUf] = useState("SP");
  const [pending, setPending] = useState<Draft[]>([]);
  const [importing, setImporting] = useState(false);
  const list = trpc.transportes.list.useQuery({ search, uf: uf || undefined, city: city || undefined, type: (type || undefined) as TransportType | undefined, used, page, limit: 50 });
  const stats = trpc.transportes.stats.useQuery();
  const refresh = () => { utils.transportes.list.invalidate(); utils.transportes.stats.invalidate(); };
  const upsert = trpc.transportes.upsert.useMutation({ onSuccess: () => { toast.success("Transportadora salva"); setDraft(blank()); refresh(); }, onError: e => toast.error(e.message) });
  const update = trpc.transportes.update.useMutation({ onSuccess: () => { toast.success("Cadastro atualizado"); setEditId(null); setDraft(blank()); refresh(); }, onError: e => toast.error(e.message) });
  const markUsed = trpc.transportes.markUsed.useMutation({ onSuccess: refresh, onError: e => toast.error(e.message) });
  const remove = trpc.transportes.delete.useMutation({ onSuccess: refresh, onError: e => toast.error(e.message) });
  const batch = trpc.transportes.importBatch.useMutation();
  const preview = useMemo(() => {
    const map = new Map<string, Draft>();
    let duplicates = 0, invalid = 0, malformed = 0;
    for (const row of pending) {
      const key = normalizeTransportCnpj(row.cnpj);
      if (!/^\d{14}$/.test(key)) { malformed++; continue; }
      if (!isValidTransportCnpj(key)) invalid++;
      if (map.has(key)) { duplicates++; continue; }
      map.set(key, { ...row, cnpj: key });
    }
    return { rows: [...map.values()], duplicates, invalid, malformed };
  }, [pending]);
  const importAll = async () => {
    if (!preview.rows.length || importing) return;
    setImporting(true);
    let created = 0, duplicates = preview.duplicates, invalid = preview.malformed;
    try {
      for (let i = 0; i < preview.rows.length; i += 300) {
        const result = await batch.mutateAsync({ records: preview.rows.slice(i, i + 300) });
        created += result.created; duplicates += result.duplicated; invalid += result.invalid;
      }
      toast.success(`Importação concluída: ${created} novos, ${duplicates} repetidos, ${invalid} rejeitados.`, { duration: 9000 });
      setPending([]); setPaste(""); refresh();
    } catch (e: any) { toast.error("Falha na importação: " + (e.message || String(e))); }
    finally { setImporting(false); }
  };
  const inputStyle = "w-full min-w-0 rounded-xl border border-white/15 bg-slate-900 p-3 text-white outline-none focus:border-cyan-500";
  const cnpjStyle = isValidTransportCnpj(draft.cnpj) ? "text-emerald-400" : "text-amber-400";
  const handleSave = () => {
    if (!/^\d{14}$/.test(normalizeTransportCnpj(draft.cnpj))) return toast.error("Informe um CNPJ de 14 dígitos");
    if (!draft.name.trim()) return toast.error("Informe a razão social");
    if (editId) update.mutate({ ...draft, id: editId });
    else upsert.mutate(draft);
  };
  const exportCsv = () => {
    const rows = list.data?.rows || [];
    const escape = (v: unknown) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
    const csv = [["UF", "CIDADE", "EMPRESA", "CNPJ", "CATEGORIA", "USADO", "CONFERÊNCIA"], ...rows.map(r => [r.uf, r.city, r.name, formatTransportCnpj(r.cnpj), TRANSPORT_TYPE_LABELS[r.type as TransportType] || r.type, r.isUsed ? "JÁ USADO" : "DISPONÍVEL", r.checksumOk ? "DÍGITOS VÁLIDOS" : "CNPJ INVÁLIDO"])].map(row => row.map(escape).join(";")).join("\r\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" })); a.download = "transportes-pagina.csv"; a.click(); URL.revokeObjectURL(a.href);
  };
  return <div className="min-h-screen bg-[#070b18] text-white pb-16">
    <div className="max-w-7xl mx-auto p-4 sm:p-7 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-cyan-400 text-xs font-bold tracking-widest">H2 COLOMBIANO • ADM</p><h1 className="text-2xl sm:text-4xl font-black">🚚 TRANSPORTES</h1><p className="text-slate-400 text-sm">CNPJ único • ônibus, caminhões e todos os transportes</p></div>
        <button onClick={() => navigate("/admin/codes")} className="rounded-xl border border-white/20 p-3 hover:bg-white/10">← Voltar ao ADM</button>
      </header>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[[stats.data?.total ?? 0,"TOTAL"],[(stats.data?.total ?? 0)-(stats.data?.used ?? 0),"DISPONÍVEIS"],[stats.data?.used ?? 0,"JÁ USADOS"],[stats.data?.invalid ?? 0,"CNPJ A CONFERIR"]].map(([number,label]) => <div key={String(label)} className="rounded-2xl bg-slate-900 border border-cyan-900/40 p-4"><div className="text-2xl font-black text-cyan-300">{number}</div><p className="text-xs text-slate-400 mt-1">{label}</p></div>)}
      </div>
      <section className="rounded-2xl border border-cyan-500/25 bg-slate-900/70 p-4 sm:p-6 space-y-4">
        <h2 className="text-lg font-black flex items-center gap-2"><Building2 size={19}/> {editId ? "EDITAR TRANSPORTADORA" : "ADICIONAR CNPJ"}</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <label className="space-y-1"><span className="text-xs text-slate-300">CNPJ</span><input value={draft.cnpj} onChange={e => setDraft({ ...draft, cnpj: e.target.value })} className={inputStyle} placeholder="00.000.000/0001-00"/><small className={cnpjStyle}>{draft.cnpj ? (isValidTransportCnpj(draft.cnpj) ? "Dígitos conferem" : "Verificar CNPJ") : "Preencha o CNPJ"}</small></label>
          <label className="space-y-1 sm:col-span-2"><span className="text-xs text-slate-300">Razão social</span><input value={draft.name} onChange={e => setDraft({...draft,name:e.target.value})} className={inputStyle}/></label>
          <label className="space-y-1"><span className="text-xs text-slate-300">Tipo de transporte</span><select value={draft.type} onChange={e => setDraft({...draft,type:e.target.value as TransportType})} className={inputStyle}>{TRANSPORT_TYPES.map(t=><option key={t} value={t}>{TRANSPORT_TYPE_LABELS[t]}</option>)}</select></label>
          <label className="space-y-1"><span className="text-xs text-slate-300">UF</span><select value={draft.uf} onChange={e=>setDraft({...draft,uf:e.target.value})} className={inputStyle}>{TRANSPORT_UFS.map(u=><option key={u}>{u}</option>)}</select></label>
          <label className="space-y-1"><span className="text-xs text-slate-300">Cidade</span><input value={draft.city} onChange={e=>setDraft({...draft,city:e.target.value})} className={inputStyle} placeholder="Jandira"/></label>
          <label className="space-y-1"><span className="text-xs text-slate-300">CNAE</span><input value={draft.cnae} onChange={e=>setDraft({...draft,cnae:e.target.value})} className={inputStyle}/></label>
          <label className="space-y-1"><span className="text-xs text-slate-300">Fonte</span><input value={draft.source} onChange={e=>setDraft({...draft,source:e.target.value})} className={inputStyle}/></label>
        </div>
        <textarea value={draft.notes} onChange={e=>setDraft({...draft,notes:e.target.value})} className={inputStyle} placeholder="Anotações opcionais" rows={2}/>
        <div className="flex flex-wrap gap-2 items-center"><button onClick={handleSave} disabled={upsert.isPending||update.isPending} className="rounded-xl bg-cyan-600 px-6 py-3 font-bold flex gap-2 items-center"><Save size={18}/> Salvar CNPJ</button>{editId&&<button onClick={()=>{setEditId(null);setDraft(blank())}} className="border border-white/30 rounded-xl p-3">Cancelar edição</button>}</div>
      </section>
      <section className="rounded-2xl border border-purple-500/30 bg-slate-900/70 p-4 sm:p-6 space-y-3">
        <h2 className="font-black flex gap-2 items-center"><Upload size={20}/> IMPORTAÇÃO INTELIGENTE</h2>
        <p className="text-xs text-slate-400">Aceita Excel (.xlsx/.xls), CSV, TXT e texto colado. Cabeçalhos: Razão Social, CNPJ, Tipo, CNAE, Cidade e UF. Registros repetidos são ignorados e nenhum status JÁ USADO é apagado.</p>
        <div className="flex flex-wrap items-center gap-3"><label className="rounded-xl border border-purple-500/40 bg-purple-500/10 px-4 py-3 cursor-pointer font-semibold flex items-center gap-2"><FileSpreadsheet size={18}/> Selecionar Excel / TXT <input type="file" accept=".xlsx,.csv,.txt,.tsv" multiple className="hidden" onChange={async e=>{const files=[...(e.target.files||[])];try{const chunks=await Promise.all(files.map(f=>readImportedFile(f,importUf)));setPending(v=>[...v,...chunks.flat()]);toast.success(files.length+" arquivo(s) lido(s)")}catch(err:any){toast.error(err.message||"Erro ao ler arquivo")}e.target.value=""}}/></label><span className="text-sm">UF padrão:</span><select className={inputStyle+" !w-24"} value={importUf} onChange={e=>setImportUf(e.target.value)}>{TRANSPORT_UFS.map(u=><option key={u}>{u}</option>)}</select></div>
        <textarea className={inputStyle} rows={5} value={paste} onChange={e=>setPaste(e.target.value)} placeholder={"Cole aqui dados do Excel ou Bloco de Notas:\nRazão Social;CNPJ;Tipo de Serviço;CNAE;Cidade;UF\nEmpresa Exemplo;00.000.000/0001-00;Carga;4930-2/02;Jandira;SP"}/>
        <button onClick={()=>{const parsed=parsePasted(paste,importUf);setPending(v=>[...v,...parsed]);toast.success(parsed.length+" linha(s) extraída(s)")}} className="rounded-xl border border-purple-400/40 px-4 py-2 flex gap-2 items-center"><ClipboardPaste size={17}/> Extrair texto colado</button>
        {pending.length>0&&<div className="border border-cyan-500/25 rounded-xl p-3 space-y-2"><p className="font-bold">Prévia: {pending.length} recebidos • {preview.rows.length} CNPJs únicos • {preview.duplicates} repetidos • {preview.invalid} com dígitos inválidos • {preview.malformed} incompletos</p><p className="text-xs text-amber-300">A conferência de dígitos não equivale à confirmação cadastral na Receita Federal. Registros suspeitos ficam sinalizados.</p><div className="max-h-32 overflow-auto text-xs text-slate-300">{preview.rows.slice(0,30).map(r=><div key={r.cnpj}>{formatTransportCnpj(r.cnpj)} — {r.name} — {r.uf}/{r.city}</div>)}</div><button disabled={importing} onClick={importAll} className="rounded-xl bg-emerald-600 px-5 py-3 font-black">{importing?"Importando...":"IMPORTAR SEM DUPLICATAS"}</button><button onClick={()=>setPending([])} className="ml-2 rounded-xl border p-3">Limpar prévia</button></div>}
      </section>
      <section className="rounded-2xl border border-cyan-500/25 bg-slate-900/70 p-4 sm:p-6 space-y-4">
        <div className="flex justify-between gap-2 flex-wrap"><h2 className="font-black flex items-center gap-2"><Search size={20}/> PESQUISAR TRANSPORTADORAS</h2><button onClick={exportCsv} className="text-sm border border-white/20 rounded-xl p-2 flex gap-2"><Download size={16}/> Exportar página CSV</button></div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
          <input className={inputStyle+" col-span-2 lg:col-span-1"} placeholder="Nome ou CNPJ" value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}}/>
          <select className={inputStyle} value={uf} onChange={e=>{setUf(e.target.value);setPage(1)}}><option value="">Todas UFs</option>{TRANSPORT_UFS.map(u=><option key={u}>{u}</option>)}</select>
          <input className={inputStyle} placeholder="Cidade" value={city} onChange={e=>{setCity(e.target.value);setPage(1)}}/>
          <select className={inputStyle} value={type} onChange={e=>{setType(e.target.value);setPage(1)}}><option value="">Todas categorias</option>{TRANSPORT_TYPES.map(t=><option key={t} value={t}>{TRANSPORT_TYPE_LABELS[t]}</option>)}</select>
          <select className={inputStyle} value={used} onChange={e=>{setUsed(e.target.value as typeof used);setPage(1)}}><option value="todos">Todos</option><option value="disponiveis">Disponíveis</option><option value="usados">Já usados</option></select>
        </div>
        {list.isError&&<div className="text-red-300">Não foi possível consultar a base. Verifique a migração e o banco de dados: {list.error.message}</div>}
        <p className="text-sm text-slate-400">{list.data?.total ?? 0} resultados • página {page}</p>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {(list.data?.rows||[]).map(r=><article key={r.id} className={`rounded-xl border p-4 space-y-2 ${r.isUsed?"border-red-500/70 bg-red-950/50":"border-white/10 bg-slate-950/60"}`}>
            <div className="flex items-start justify-between gap-3"><div><p className="font-black">{r.name}</p><p className="text-sm text-cyan-300 font-mono">{formatTransportCnpj(r.cnpj)}</p></div><button onClick={()=>markUsed.mutate({id:r.id,used:!r.isUsed})} className={`shrink-0 text-xs font-black px-3 py-2 rounded-lg border ${r.isUsed?"bg-red-600 text-white border-red-400":"bg-slate-800 text-slate-200 border-white/20"}`}>{r.isUsed?"🔴 JÁ USADO":"□ MARCAR USADO"}</button></div>
            <p className="text-xs text-slate-300">{r.uf} • {r.city||"Município não informado"} • {TRANSPORT_TYPE_LABELS[r.type as TransportType] || r.type}</p>
            {!r.checksumOk&&<p className="text-xs font-bold text-amber-400">⚠ Dígitos do CNPJ inválidos — conferir</p>}
            <div className="flex gap-2"><button className="border border-cyan-500/30 rounded-lg px-3 py-1 text-sm" onClick={()=>{setEditId(r.id);setDraft({cnpj:r.cnpj,name:r.name,type:r.type as TransportType,uf:r.uf,city:r.city,cnae:r.cnae,source:r.source||"",notes:r.notes||"",isUsed:Boolean(r.isUsed)});window.scrollTo({top:0,behavior:"smooth"})}}>Editar</button><button className="border border-red-500/30 rounded-lg px-3 py-1 text-sm text-red-300" onClick={()=>{if(window.confirm("Excluir definitivamente este cadastro?"))remove.mutate({id:r.id})}}>Excluir</button></div>
          </article>)}
        </div>
        <div className="flex items-center justify-between"><button disabled={page<=1} onClick={()=>setPage(page-1)} className="border rounded-xl p-2 disabled:opacity-30">← Anterior</button><span className="text-sm">{page} / {Math.max(1,Math.ceil((list.data?.total||0)/50))}</span><button disabled={page*50>=(list.data?.total||0)} onClick={()=>setPage(page+1)} className="border rounded-xl p-2 disabled:opacity-30">Próxima →</button></div>
      </section>
    </div>
  </div>;
}