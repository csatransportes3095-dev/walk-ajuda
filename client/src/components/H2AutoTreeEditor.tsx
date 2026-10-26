import { useEffect, useMemo, useState } from "react";
import { GitBranch, Plus, Save, Trash2, RotateCcw, Play } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { cloneH2AutoTree, H2_AUTO_TREE_DEFAULT, h2AutoTreeSchema, renderH2AutoNode, type H2AutoTree, type H2AutoTreeNode } from "@shared/h2AutoTree";

type Props = { id: string; revision: number; initial?: H2AutoTree };
const blank = (id: string): H2AutoTreeNode => ({ id, text: "📋 *NOVA PERGUNTA*\n\nEscolha uma opção:", mode: "question", options: [] });
const inputClass = "w-full rounded-xl border border-cyan-500/35 bg-[#081526] px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-300";
const types = [
  ["question", "Pergunta com respostas"],
  ["end", "Encerrar atendimento"],
  ["human", "Falar com atendente"],
  ["order", "Consultar pedido autenticado"],
] as const;

export default function H2AutoTreeEditor({ id, revision, initial }: Props) {
  const utils = trpc.useUtils();
  const [tree, setTree] = useState<H2AutoTree>(() => cloneH2AutoTree(initial || H2_AUTO_TREE_DEFAULT));
  const [selected, setSelected] = useState(tree.start);
  const [test, setTest] = useState<{ current: string; stack: string[] }>({ current: tree.start, stack: [] });
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) {
      const fresh = cloneH2AutoTree(initial || H2_AUTO_TREE_DEFAULT);
      setTree(fresh);
      setSelected(fresh.start);
      setTest({ current: fresh.start, stack: [] });
    }
  }, [id, revision, initial, dirty]);
  const selectedNode = useMemo(() => tree.nodes.find(n => n.id === selected), [tree, selected]);
  const save = (trpc.h2AutoAdmin as any).saveTree.useMutation({
    onSuccess: () => {
      toast.success("Árvore salva. Aguardando sincronização do APK.");
      setDirty(false);
      utils.h2AutoAdmin.list.invalidate();
    },
    onError: (error: Error) => toast.error(error.message || "Não foi possível salvar."),
  });
  function updateNode(id: string, updater: (node: H2AutoTreeNode) => H2AutoTreeNode) {
    setTree(prev => ({ ...prev, nodes: prev.nodes.map(n => n.id === id ? updater(n) : n) }));
    setDirty(true);
  }
  function addNode() {
    const id = "p" + Math.random().toString(36).slice(2, 10);
    setTree(prev => ({ ...prev, nodes: [...prev.nodes, blank(id)] }));
    setSelected(id);
    setDirty(true);
  }
  function deleteNode(id: string) {
    if (id === tree.start) { toast.error("A pergunta inicial não pode ser excluída."); return; }
    if (!window.confirm("Excluir esta etapa e todas as ligações que apontam para ela?")) return;
    setTree(prev => ({
      ...prev,
      nodes: prev.nodes.filter(n => n.id !== id).map(n => ({
        ...n, options: n.options.filter(o => o.next !== id),
      })),
    }));
    setSelected(tree.start);
    setDirty(true);
  }
  const ids = tree.nodes.map(n => n.id);
  const currentTest = tree.nodes.find(n => n.id === test.current);
  function choose(key: string) {
    if (!currentTest) return;
    const option = currentTest.options.find(o => o.key === key);
    if (option && tree.nodes.some(n => n.id === option.next))
      setTest(prev => ({ current: option.next, stack: [...prev.stack, prev.current] }));
  }
  function submit() {
    const result = h2AutoTreeSchema.safeParse(tree);
    if (!result.success) {
      toast.error(result.error.issues[0]?.message || "Revise as perguntas.");
      return;
    }
    save.mutate({ id, expectedRevision: revision, tree: result.data });
  }

  return <section className="rounded-2xl border border-emerald-400/40 bg-[#061321] p-4 md:p-5 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="flex items-center gap-2 text-lg font-black text-emerald-300"><GitBranch className="h-5 w-5" /> ÁRVORE DE ATENDIMENTO</h3>
        <p className="text-xs text-white/65">Configure perguntas, respostas, caminhos e encerramentos neste aparelho.</p></div>
      <label className="flex items-center gap-2 text-sm font-bold text-emerald-200">
        <input type="checkbox" checked={tree.enabled} onChange={e => { setTree(t => ({ ...t, enabled: e.target.checked })); setDirty(true); }} /> Árvore ativa
      </label>
    </div>
    <div className="grid gap-4 lg:grid-cols-[minmax(210px,0.85fr)_minmax(0,2fr)]">
      <aside className="rounded-xl border border-cyan-500/25 bg-[#091b2d] p-3 space-y-2">
        <div className="flex items-center justify-between gap-2"><span className="text-xs font-black text-cyan-300">ETAPAS ({tree.nodes.length})</span>
          <button onClick={addNode} className="rounded-lg bg-cyan-500 px-2 py-2 text-xs font-bold text-slate-950" disabled={tree.nodes.length >= 100}><Plus className="inline h-4 w-4" /> CRIAR</button></div>
        <div className="max-h-[440px] space-y-2 overflow-y-auto">
          {tree.nodes.map(n => <button key={n.id} onClick={() => setSelected(n.id)}
            className={"w-full rounded-xl border p-3 text-left " + (selected === n.id ? "border-emerald-300 bg-emerald-900/30" : "border-cyan-500/20 bg-slate-950/50")}>
            <span className="block break-all text-sm font-black text-white">{n.id === tree.start ? "🏠 " : "◇ "}{n.id}</span>
            <span className="block truncate text-[11px] text-white/60">{n.text.split("\n").find(Boolean)}</span>
            <span className="text-[10px] text-cyan-300">{n.mode === "question" ? n.options.length + " opções" : "Etapa final"}</span>
          </button>)}
        </div>
      </aside>
      <div className="space-y-4">
        {selectedNode && <>
          <div className="flex flex-wrap justify-between gap-2"><span className="text-xs font-black text-emerald-300">EDITAR ETAPA: {selectedNode.id}</span>
            <div className="flex gap-2">
              {selectedNode.id !== tree.start && <button className="rounded-lg border border-cyan-400/40 px-2 py-1 text-xs" onClick={() => { setTree(t => ({ ...t, start: selectedNode.id })); setDirty(true); }}>DEFINIR INÍCIO</button>}
              {selectedNode.id !== tree.start && <button className="rounded-lg border border-red-400/40 px-2 py-1 text-xs text-red-300" onClick={() => deleteNode(selectedNode.id)}><Trash2 className="inline h-4 w-4" /> EXCLUIR</button>}
            </div>
          </div>
          <label className="block text-xs text-cyan-200">IDENTIFICADOR DA ETAPA
            <input className={inputClass + " mt-1 opacity-70"} value={selectedNode.id} disabled /></label>
          <label className="block text-xs text-cyan-200">TIPO DE RESPOSTA
            <select className={inputClass + " mt-1"} value={selectedNode.mode}
              onChange={e => updateNode(selectedNode.id, n => ({ ...n, mode: e.target.value as H2AutoTreeNode["mode"], options: e.target.value === "question" ? n.options : [] }))}>
              {types.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select></label>
          <label className="block text-xs text-cyan-200">MENSAGEM PARA O WHATSAPP
            <textarea className={inputClass + " mt-1 font-mono"} rows={6} maxLength={1800} value={selectedNode.text}
              onChange={e => updateNode(selectedNode.id, n => ({ ...n, text: e.target.value }))} /></label>
          {selectedNode.mode === "question" && <div className="space-y-3 rounded-xl border border-violet-400/30 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-black text-violet-300">RESPOSTAS E DESTINOS</h4>
              <button disabled={selectedNode.options.length >= 10} className="rounded-lg bg-violet-500 px-3 py-2 text-xs font-black" onClick={() => {
                const taken = new Set(selectedNode.options.map(o => o.key));
                const key = Array.from({length:10}, (_,i)=>String(i+1)).find(k=>!taken.has(k));
                if (key) updateNode(selectedNode.id,n=>({...n,options:[...n.options,{key,label:"Nova resposta",next:n.id}]}));
              }}><Plus className="inline h-4 w-4" /> ADICIONAR OPÇÃO</button></div>
            {selectedNode.options.length === 0 && <p className="text-xs text-amber-200">Adicione as opções que o cliente poderá digitar.</p>}
            {selectedNode.options.map((o, index) => <div className="grid gap-2 rounded-xl border border-violet-400/20 bg-black/20 p-3 md:grid-cols-[65px_minmax(0,1.3fr)_minmax(0,1fr)_36px]" key={index}>
              <select className={inputClass} value={o.key} onChange={e=>updateNode(selectedNode.id,n=>({...n,options:n.options.map((x,i)=>i===index?{...x,key:e.target.value}:x)}))}>
                {Array.from({length:10},(_,i)=>String(i+1)).map(k=><option key={k} value={k}>{k}</option>)}
              </select>
              <input className={inputClass} value={o.label} maxLength={160} placeholder="Texto da resposta"
                onChange={e=>updateNode(selectedNode.id,n=>({...n,options:n.options.map((x,i)=>i===index?{...x,label:e.target.value}:x)}))} />
              <select className={inputClass} value={o.next} onChange={e=>updateNode(selectedNode.id,n=>({...n,options:n.options.map((x,i)=>i===index?{...x,next:e.target.value}:x)}))}>
                {ids.map(k=><option value={k} key={k}>{k}</option>)}
              </select>
              <button aria-label="Excluir resposta" title="Excluir resposta" className="text-rose-300" onClick={()=>updateNode(selectedNode.id,n=>({...n,options:n.options.filter((_x,i)=>i!==index)}))}><Trash2 className="h-4 w-4" /></button>
            </div>)}
          </div>}
        </>}
      </div>
    </div>
    <div className="rounded-xl border border-cyan-500/30 bg-[#091827] p-4 space-y-3">
      <div className="flex items-center justify-between gap-2"><h4 className="flex items-center gap-2 font-black text-cyan-300"><Play className="h-4 w-4" /> SIMULADOR DE ATENDIMENTO</h4>
        <button className="text-xs text-cyan-200" onClick={()=>setTest({current:tree.start,stack:[]})}><RotateCcw className="inline h-4 w-4" /> REINICIAR</button></div>
      <div className="whitespace-pre-wrap rounded-xl border border-white/10 bg-black/30 p-4 text-sm leading-relaxed">{currentTest ? renderH2AutoNode(currentTest) : "Etapa não encontrada."}</div>
      <div className="flex flex-wrap gap-2">{currentTest?.options.map(o=><button key={o.key} onClick={()=>choose(o.key)} className="rounded-lg border border-cyan-500/50 px-3 py-2 text-xs font-bold">{o.key} — {o.label}</button>)}</div>
      <div className="flex gap-2"><button className="text-xs text-white/70" onClick={()=>setTest(t=>({current:t.stack.at(-1)||tree.start,stack:t.stack.slice(0,-1)}))}>0 — VOLTAR</button><button className="text-xs text-white/70" onClick={()=>setTest({current:tree.start,stack:[]})}>MENU — INÍCIO</button></div>
      <p className="text-[11px] text-white/45">A simulação não envia mensagens nem altera conversas reais.</p>
    </div>
    <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 p-3 font-black text-slate-950 disabled:opacity-50" disabled={save.isPending || !dirty} onClick={submit}>
      <Save className="h-4 w-4" /> {save.isPending ? "SALVANDO..." : dirty ? "SALVAR ÁRVORE E SINCRONIZAR" : "ÁRVORE SALVA"}
    </button>
    <p className="text-xs text-amber-200/75">A árvore será enviada ao telefone quando o H2 Auto realizar a próxima sincronização. Sem backup adicional e sem alterar pedidos.</p>
  </section>;
}
