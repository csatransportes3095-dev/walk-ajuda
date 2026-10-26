import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown, ArrowRight, ArrowUp, CheckCircle2, ChevronDown, ChevronRight,
  GitBranch, Link2, Map as MapIcon, Play, Plus, RotateCcw, Save, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  cloneH2AutoTree, H2_AUTO_TREE_DEFAULT, h2AutoTreeSchema, renderH2AutoNode,
  type H2AutoTree, type H2AutoTreeNode,
} from "@shared/h2AutoTree";
import {
  addConnectedStage, availableOptionKey, flowPath, flowRows, flowTitle,
  moveFlowOption, removeFlowOption, unlinkedStages, type FlowRow,
} from "@/lib/h2AutoFlowMap";

type Props = { id: string; revision: number; initial?: H2AutoTree };
const field = "w-full min-w-0 rounded-xl border border-cyan-500/40 bg-[#061625] px-4 py-3 text-base text-white outline-none focus:border-emerald-300";
const card = "rounded-2xl border border-cyan-400/25 bg-[#091e30] p-4 md:p-5";
const modeLabel: Record<H2AutoTreeNode["mode"], string> = {
  question: "Pergunta com respostas",
  end: "Encerrar este caminho",
  human: "Encaminhar para atendente",
  order: "Consultar pedidos do sistema",
};
const newText = "📋 *NOVA PERGUNTA*\n\nEscreva aqui a pergunta para o cliente.";
const numLabel = (key: string) => key === "10" ? "🔟" : key + "️⃣";

export default function H2AutoTreeEditor({ id, revision, initial }: Props) {
  const utils = trpc.useUtils();
  const [tree, setTree] = useState<H2AutoTree>(() => cloneH2AutoTree(initial || H2_AUTO_TREE_DEFAULT));
  const [selected, setSelected] = useState(tree.start);
  const [test, setTest] = useState<{ current: string; stack: string[] }>({ current: tree.start, stack: [] });
  const [dirty, setDirty] = useState(false);
  const [folded, setFolded] = useState<Set<string>>(() => new Set());
  const [existingTarget, setExistingTarget] = useState(tree.start);
  const loadedRevision = useRef(revision);
  const editRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (dirty || loadedRevision.current === revision) return;
    const fresh = cloneH2AutoTree(initial || H2_AUTO_TREE_DEFAULT);
    loadedRevision.current = revision;
    setTree(fresh);
    setSelected(fresh.start);
    setExistingTarget(fresh.start);
    setTest({ current: fresh.start, stack: [] });
    setFolded(new Set());
  }, [dirty, revision, initial]);

  const selectedNode = useMemo(() => tree.nodes.find(n => n.id === selected), [tree, selected]);
  const map = useMemo(() => flowRows(tree, folded), [tree, folded]);
  // Each top-level answer is a separate full-width vertical block.
  // Keep the DFS order, shared destinations and fold/unfold behavior unchanged.
  const mapGroups = useMemo(() => {
    const root = map.length && map[0].depth === 0 ? map[0] : null;
    const branches: Array<{ key: string; title: string; rows: FlowRow[] }> = [];
    for (const row of map) {
      if (row.depth === 0) continue;
      if (row.depth === 1) {
        branches.push({ key: row.viaKey || "", title: row.viaLabel || "Resposta", rows: [row] });
      } else if (branches.length) {
        branches[branches.length - 1].rows.push(row);
      }
    }
    return { root, branches };
  }, [map]);
  const path = useMemo(() => flowPath(tree, selected), [tree, selected]);
  const unlinked = useMemo(() => unlinkedStages(tree), [tree]);
  const currentTest = tree.nodes.find(n => n.id === test.current);
  const stale = revision !== loadedRevision.current;
  const questionCount = tree.nodes.filter(n => n.mode === "question").length;
  const save = trpc.h2AutoAdmin.saveTree.useMutation({
    onSuccess: () => {
      toast.success("Árvore salva! O APK receberá a atualização na sincronização.");
      setDirty(false);
      void utils.h2AutoAdmin.list.invalidate();
    },
    onError: error => toast.error(error.message || "Erro ao salvar a árvore."),
  });

  function selectStage(stageId: string) {
    setSelected(stageId);
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => editRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }

  function changeNode(stageId: string, transform: (node: H2AutoTreeNode) => H2AutoTreeNode) {
    setTree(prev => ({ ...prev, nodes: prev.nodes.map(n => n.id === stageId ? transform(n) : n) }));
    setDirty(true);
  }

  function newId() {
    let candidate = "";
    do {
      candidate = "p" + Math.random().toString(36).slice(2, 11);
    } while (tree.nodes.some(n => n.id === candidate));
    return candidate;
  }

  function createAnswerHere(parentId: string) {
    try {
      const id = newId();
      const updated = addConnectedStage(tree, parentId, id);
      setTree(updated);
      setDirty(true);
      selectStage(id);
      toast.success("Etapa criada e posicionada na resposta do menu anterior.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível criar a etapa.");
    }
  }

  function newDestination(parentId: string, answerIndex: number) {
    if (tree.nodes.length >= 100) { toast.error("Limite de 100 etapas atingido."); return; }
    const id = newId();
    const updated = tree.nodes.map(node => node.id !== parentId ? node : ({
      ...node,
      options: node.options.map((answer, i) => i === answerIndex ? { ...answer, next: id } : answer),
    }));
    setTree({ ...tree, nodes: [...updated, { id, text: newText, mode: "question", options: [] }] });
    setDirty(true);
    selectStage(id);
    toast.success("Próxima etapa criada nesta posição.");
  }

  function linkExisting(parentId: string) {
    const parent = tree.nodes.find(n => n.id === parentId);
    if (!parent || parent.mode !== "question") return;
    const key = availableOptionKey(parent.options);
    if (!key) { toast.error("Máximo de 10 respostas por pergunta."); return; }
    if (!tree.nodes.some(n => n.id === existingTarget)) {
      toast.error("Escolha uma etapa existente.");
      return;
    }
    changeNode(parentId, node => ({
      ...node, options: [...node.options, { key, label: "Nova resposta", next: existingTarget }],
    }));
    toast.success("Resposta conectada. Edite o texto da nova resposta.");
  }

  function deleteStage(stageId: string) {
    if (stageId === tree.start) { toast.error("Não é possível excluir o início do atendimento."); return; }
    const node = tree.nodes.find(n => n.id === stageId);
    if (!node || !window.confirm("Excluir " + flowTitle(node, tree.start) + "?\nAs respostas que apontavam para esta etapa serão removidas.")) return;
    setTree(prev => ({
      ...prev,
      nodes: prev.nodes.filter(n => n.id !== stageId).map(n => ({
        ...n, options: n.options.filter(option => option.next !== stageId),
      })),
    }));
    setDirty(true);
    setSelected(tree.start);
  }

  function resetFromServer() {
    if (dirty && !window.confirm("Descartar mudanças não salvas e recarregar as etapas do ADM?")) return;
    const fresh = cloneH2AutoTree(initial || H2_AUTO_TREE_DEFAULT);
    loadedRevision.current = revision;
    setTree(fresh);
    setSelected(fresh.start);
    setExistingTarget(fresh.start);
    setTest({ current: fresh.start, stack: [] });
    setDirty(false);
    setFolded(new Set());
  }

  function submit() {
    if (stale) { toast.error("O ADM foi atualizado em outro lugar. Recarregue para evitar sobrescrever."); return; }
    const parsed = h2AutoTreeSchema.safeParse(tree);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message || "Revise as perguntas e os destinos.");
      return;
    }
    save.mutate({ id, expectedRevision: loadedRevision.current, tree: parsed.data });
  }

  function chooseTest(key: string) {
    const answer = currentTest?.options.find(o => o.key === key);
    if (answer && tree.nodes.some(n => n.id === answer.next)) {
      setTest(prev => ({ current: answer.next, stack: [...prev.stack, prev.current] }));
    }
  }

  const saveButton = (
    <button type="button" onClick={submit} disabled={!dirty || stale || save.isPending}
      className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-400 px-5 py-3 font-black text-[#052016] disabled:cursor-not-allowed disabled:opacity-45">
      <Save className="h-5 w-5" />
      {save.isPending ? "SALVANDO..." : dirty ? "SALVAR E SINCRONIZAR" : "TUDO SALVO"}
    </button>
  );


  function renderMapRow(row: FlowRow, index: number, levelOffset = 0, showVia = true) {
    const node = tree.nodes.find(n => n.id === row.id);
    if (!node) return null;
    const active = selected === row.id;
    const expandable = node.options.length > 0 && !row.shared;
    const indentation = Math.min(Math.max(row.depth - levelOffset, 0), 3) * 12;
    return (
      <div key={row.id + "-" + index}
        style={{ marginLeft: indentation }}
        className={"min-w-0 rounded-xl border-l-[3px] p-2 " +
          (active ? "border-l-emerald-300 bg-emerald-900/25" : "border-l-cyan-600/65 bg-slate-950/20")}>
        {showVia && row.viaKey !== null && (
          <div className="mb-2 flex min-w-0 items-start gap-2 pl-2 text-sm leading-snug text-violet-200">
            <span className="shrink-0 rounded-md border border-violet-400/40 bg-violet-950/60 px-2 py-1 font-black">{row.viaKey}</span>
            <span className="min-w-0 flex-1 break-words">{row.viaLabel}</span>
            <ArrowRight className="mt-1 h-4 w-4 shrink-0" />
          </div>
        )}
        <div className="flex min-w-0 items-stretch gap-2">
          <button type="button" onClick={() => selectStage(row.id)} aria-pressed={active}
            className={"min-w-0 flex-1 rounded-xl border px-3 py-3 text-left " +
              (active ? "border-emerald-300 bg-emerald-950/70 text-white" :
                "border-cyan-500/25 bg-[#092036] text-slate-100 hover:border-cyan-300")}>
            <span className="block text-[11px] font-bold uppercase tracking-wide text-cyan-300">
              {row.depth === 0 ? "🏠 PRIMEIRA MENSAGEM" : row.shared ? "↗ ETAPA COMPARTILHADA" : "↳ PRÓXIMA ETAPA"}
            </span>
            <span className="mt-1 block break-words text-sm font-black leading-snug">{flowTitle(node, tree.start)}</span>
            <span className="mt-1 block text-xs text-slate-300">
              {node.mode === "question" ? node.options.length + " resposta(s)" : modeLabel[node.mode]}
            </span>
          </button>
          {expandable && (
            <button type="button" onClick={() => setFolded(previous => {
              const next = new Set(previous);
              if (next.has(row.id)) next.delete(row.id);
              else next.add(row.id);
              return next;
            })} title={folded.has(row.id) ? "Mostrar respostas" : "Recolher respostas"}
              className="shrink-0 rounded-lg border border-cyan-500/25 px-3 text-cyan-200">
              {folded.has(row.id) ? <ChevronRight className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <section className="space-y-5 rounded-3xl border-2 border-emerald-400/60 bg-[#061321] p-4 shadow-[0_0_40px_rgba(16,185,129,0.1)] md:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h3 className="flex items-center gap-3 text-2xl font-black text-emerald-300 md:text-3xl">
            <GitBranch className="h-7 w-7" /> ÁRVORE DE ATENDIMENTO
          </h3>
          <p className="max-w-4xl text-sm leading-relaxed text-slate-300">
            Veja onde cada pergunta está posicionada. Clique em um caminho para editar
            e use <strong className="text-emerald-300">CRIAR PRÓXIMA ETAPA</strong> para continuar exatamente naquela resposta.
          </p>
        </div>
        <label className="flex items-center gap-3 rounded-xl border border-emerald-400/30 bg-emerald-900/20 px-4 py-3 text-sm font-bold text-emerald-200">
          <input type="checkbox" className="h-5 w-5" checked={tree.enabled}
            onChange={event => { setTree(prev => ({ ...prev, enabled: event.target.checked })); setDirty(true); }} />
          Árvore ativa no atendimento
        </label>
      </div>

      <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-400/40 bg-[#092436] p-3 shadow-xl">
        <span className="text-sm font-semibold text-white">
          {stale ? "⚠️ Configuração alterada no ADM. Recarregue antes de salvar."
            : dirty ? "● Alterações não salvas na árvore" : "✓ Configuração salva no ADM"}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {stale && <button type="button" onClick={resetFromServer}
            className="rounded-lg border border-amber-400/60 px-3 py-2 text-sm font-semibold text-amber-200">
            RECARREGAR
          </button>}
          {saveButton}
        </div>
      </div>

      <div className="flex w-full min-w-0 flex-col gap-6">
        <aside className={card + " w-full min-w-0 space-y-4"}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="flex items-center gap-2 text-lg font-black text-cyan-300">
                <MapIcon className="h-5 w-5" /> 1. MAPA DO ATENDIMENTO
              </h4>
              <p className="mt-1 text-sm text-slate-300">Siga as respostas de cima para baixo. Cada bloco mostra a próxima etapa.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-lg bg-cyan-950 px-3 py-2 font-bold text-cyan-200">{tree.nodes.length} etapas</span>
            <span className="rounded-lg bg-violet-950 px-3 py-2 font-bold text-violet-200">{questionCount} com respostas</span>
            {unlinked.length > 0 && <span className="rounded-lg bg-amber-950 px-3 py-2 font-bold text-amber-300">{unlinked.length} sem conexão</span>}
          </div>
          <div className="flex gap-2">
            <button type="button" className="rounded-lg border border-cyan-400/40 px-3 py-2 text-xs font-bold text-cyan-100"
              onClick={() => setFolded(new Set())}>EXPANDIR TODOS</button>
            <button type="button" className="rounded-lg border border-cyan-400/40 px-3 py-2 text-xs font-bold text-cyan-100"
              onClick={() => setFolded(new Set(tree.nodes.filter(node => node.mode === "question" && node.id !== tree.start).map(node => node.id)))}>
              RECOLHER RAMOS
            </button>
          </div>

          <div className="w-full min-w-0 space-y-4" aria-label="Mapa completo das perguntas e respostas">
            {mapGroups.root && (
              <div className="w-full min-w-0 rounded-2xl border border-cyan-400/30 bg-cyan-950/10 p-3 md:p-4">
                {renderMapRow(mapGroups.root, 0)}
              </div>
            )}
            {mapGroups.branches.map((branch, branchIndex) => (
              <section key={branch.key + "-" + branchIndex}
                className="w-full min-w-0 space-y-3 rounded-2xl border border-violet-400/35 bg-[#0b172a] p-3 md:p-4">
                <div className="flex min-w-0 flex-col items-start gap-2 border-b border-violet-400/20 pb-3 sm:flex-row sm:items-center">
                  <span className="shrink-0 rounded-xl bg-violet-800/60 px-3 py-2 text-sm font-black text-white">
                    OPÇÃO {numLabel(branch.key)}
                  </span>
                  <span className="min-w-0 break-words text-base font-black leading-snug text-violet-100">
                    {branch.title}
                  </span>
                </div>
                <div className="min-w-0 space-y-2">
                  {branch.rows.map((row, index) => renderMapRow(row, index, 1, index !== 0))}
                </div>
              </section>
            ))}
            {!mapGroups.branches.length && (
              <p className="rounded-xl border border-amber-400/30 bg-amber-950/15 p-3 text-sm text-amber-100">
                Abra as respostas da primeira mensagem para visualizar os caminhos.
              </p>
            )}
          </div>

          {unlinked.length > 0 && (
            <div className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-950/15 p-4">
              <h5 className="font-black text-amber-200">ETAPAS FORA DO CAMINHO ({unlinked.length})</h5>
              <p className="text-sm text-slate-300">Estas etapas ainda não são alcançadas por nenhuma resposta desde o início. Abra uma pergunta e escolha a etapa como destino.</p>
              {unlinked.map(node => <button key={node.id} type="button" onClick={() => selectStage(node.id)}
                className="block w-full rounded-lg border border-amber-500/30 px-3 py-2 text-left text-sm text-amber-100">
                {flowTitle(node, tree.start)}
              </button>)}
            </div>
          )}
        </aside>

        <div className={card + " w-full min-w-0 scroll-mt-28 space-y-5"} ref={editRef}>
          {selectedNode && (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h4 className="text-lg font-black text-emerald-300">2. EDITAR A ETAPA SELECIONADA</h4>
                  <p className="mt-1 break-words text-xl font-black text-white">{flowTitle(selectedNode, tree.start)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedNode.id !== tree.start && (
                    <button type="button" onClick={() => {
                      if (window.confirm("Tornar esta etapa o novo início? Os caminhos anteriores podem ficar desconectados.")) {
                        setTree(prev => ({ ...prev, start: selectedNode.id }));
                        setDirty(true);
                      }
                    }} className="rounded-lg border border-cyan-500/50 px-3 py-2 text-xs font-bold text-cyan-100">
                      DEFINIR COMO INÍCIO
                    </button>
                  )}
                  {selectedNode.id !== tree.start && (
                    <button type="button" onClick={() => deleteStage(selectedNode.id)}
                      className="rounded-lg border border-rose-400/40 px-3 py-2 text-xs font-bold text-rose-200">
                      <Trash2 className="mr-1 inline h-4 w-4" /> EXCLUIR
                    </button>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-cyan-500/35 bg-[#061625] p-3">
                <p className="mb-2 text-xs font-black tracking-wide text-cyan-200">POSIÇÃO DESTA ETAPA NO ATENDIMENTO</p>
                {path.length === 0 ? <p className="text-sm text-amber-200">
                  Esta etapa está sem ligação com o início. Escolha-a como destino de uma resposta para posicioná-la.
                </p> : (
                  <div className="flex flex-wrap items-center gap-2">
                    {path.map((crumb, index) => (
                      <div key={crumb.id + index} className="flex items-center gap-2">
                        {index > 0 && <ChevronRight className="h-4 w-4 text-slate-500" />}
                        <button type="button" onClick={() => selectStage(crumb.id)}
                          className={"rounded-lg border px-3 py-2 text-sm font-semibold " +
                            (crumb.id === selected ? "border-emerald-400 bg-emerald-900/40 text-emerald-200" :
                              "border-cyan-600/35 text-cyan-100")}>
                          {index === 0 ? "🏠 INÍCIO" : crumb.key + " · " + crumb.label}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <label className="block space-y-2 text-sm font-black text-cyan-200">
                TIPO DE ETAPA
                <select className={field} value={selectedNode.mode}
                  onChange={event => changeNode(selectedNode.id, node => ({
                    ...node, mode: event.target.value as H2AutoTreeNode["mode"],
                    options: event.target.value === "question" ? node.options : [],
                  }))}>
                  {Object.entries(modeLabel).map(([value, label]) =>
                    <option value={value} key={value}>{label}</option>)}
                </select>
              </label>

              <label className="block space-y-2 text-sm font-black text-cyan-200">
                MENSAGEM QUE O CLIENTE RECEBE NO WHATSAPP
                <textarea className={field + " min-h-[210px] font-sans leading-relaxed"} rows={7}
                  maxLength={1800} value={selectedNode.text}
                  onChange={event => changeNode(selectedNode.id, node => ({ ...node, text: event.target.value }))} />
                <span className="block text-xs font-normal text-slate-400">
                  A primeira linha identifica esta etapa no mapa. Use quebras de linha curtas para o celular.
                </span>
              </label>

              {selectedNode.mode === "question" ? (
                <div className="space-y-4 rounded-2xl border border-violet-400/35 bg-violet-950/10 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h5 className="text-lg font-black text-violet-200">RESPOSTAS DESTA PERGUNTA</h5>
                      <p className="mt-1 text-sm text-slate-300">
                        A posição 1, 2, 3... é a opção que o cliente digita. Cada opção aponta para uma etapa.
                      </p>
                    </div>
                    <button type="button" disabled={selectedNode.options.length >= 10 || tree.nodes.length >= 100}
                      onClick={() => createAnswerHere(selectedNode.id)}
                      className="flex items-center gap-2 rounded-xl bg-violet-500 px-4 py-3 text-sm font-black text-white disabled:opacity-40">
                      <Plus className="h-5 w-5" /> CRIAR RESPOSTA + PRÓXIMA ETAPA
                    </button>
                  </div>

                  {selectedNode.options.length === 0 && (
                    <p className="rounded-xl border border-amber-500/35 bg-amber-950/15 p-4 text-sm text-amber-100">
                      Esta pergunta ainda não tem respostas. Clique em <strong>CRIAR RESPOSTA + PRÓXIMA ETAPA</strong>.
                      A nova etapa aparecerá automaticamente no lugar certo do mapa.
                    </p>
                  )}
                  {selectedNode.options.map((answer, index) => {
                    const dest = tree.nodes.find(n => n.id === answer.next);
                    return (
                      <div key={selectedNode.id + "-" + index}
                        className="space-y-3 rounded-xl border border-violet-400/35 bg-[#061625] p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="rounded-xl bg-violet-800/55 px-3 py-2 text-sm font-black text-white">
                            OPÇÃO {answer.key}
                          </span>
                          <div className="flex gap-1">
                            <button type="button" aria-label="Mover resposta para cima" disabled={index === 0}
                              onClick={() => changeNode(selectedNode.id, node => ({ ...node, options: moveFlowOption(node.options, index, index - 1) }))}
                              className="rounded-lg border border-cyan-500/30 p-2 text-cyan-200 disabled:opacity-25">
                              <ArrowUp className="h-4 w-4" />
                            </button>
                            <button type="button" aria-label="Mover resposta para baixo" disabled={index >= selectedNode.options.length - 1}
                              onClick={() => changeNode(selectedNode.id, node => ({ ...node, options: moveFlowOption(node.options, index, index + 1) }))}
                              className="rounded-lg border border-cyan-500/30 p-2 text-cyan-200 disabled:opacity-25">
                              <ArrowDown className="h-4 w-4" />
                            </button>
                            <button type="button" aria-label="Excluir resposta" title="Excluir resposta"
                              onClick={() => changeNode(selectedNode.id, node => ({ ...node, options: removeFlowOption(node.options, index) }))}
                              className="rounded-lg border border-rose-500/40 p-2 text-rose-300">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>

                        <label className="block space-y-1.5 text-sm font-bold text-slate-200">
                          O QUE APARECE NESTA OPÇÃO?
                          <input className={field} value={answer.label} maxLength={160}
                            placeholder="Ex.: SIM, já sou cliente"
                            onChange={event => changeNode(selectedNode.id, node => ({
                              ...node, options: node.options.map((x, i) => i === index ? { ...x, label: event.target.value } : x),
                            }))} />
                        </label>

                        <div className="flex items-center gap-2 text-sm font-black text-emerald-200">
                          <ArrowRight className="h-4 w-4" /> QUANDO ESCOLHER {answer.key}, VAI PARA:
                        </div>
                        <select className={field} value={answer.next}
                          onChange={event => changeNode(selectedNode.id, node => ({
                            ...node, options: node.options.map((x, i) => i === index ? { ...x, next: event.target.value } : x),
                          }))}>
                          {tree.nodes.map(node => (
                            <option key={node.id} value={node.id}>
                              {flowTitle(node, tree.start) + " — " + modeLabel[node.mode]}
                            </option>
                          ))}
                        </select>
                        <div className="flex flex-wrap gap-2">
                          {dest && <button type="button" onClick={() => selectStage(dest.id)}
                            className="flex items-center gap-1.5 rounded-lg border border-emerald-400/55 px-3 py-2 text-sm font-bold text-emerald-200">
                            <ArrowRight className="h-4 w-4" /> EDITAR PRÓXIMA ETAPA
                          </button>}
                          <button type="button" disabled={tree.nodes.length >= 100}
                            onClick={() => newDestination(selectedNode.id, index)}
                            className="flex items-center gap-1.5 rounded-lg border border-cyan-400/40 px-3 py-2 text-sm font-bold text-cyan-200 disabled:opacity-40">
                            <Plus className="h-4 w-4" /> CRIAR NOVA ETAPA AQUI
                          </button>
                        </div>
                        {dest && <p className="text-xs text-slate-400">
                          Destino atual: {flowTitle(dest, tree.start)}. Para reutilizar outra etapa, escolha-a acima.
                        </p>}
                      </div>
                    );
                  })}

                  {selectedNode.options.length < 10 && (
                    <div className="rounded-xl border border-cyan-500/25 bg-cyan-950/10 p-4">
                      <h6 className="flex items-center gap-2 text-sm font-black text-cyan-200">
                        <Link2 className="h-4 w-4" /> OU VINCULE UMA ETAPA QUE JÁ EXISTE
                      </h6>
                      <p className="mb-3 mt-1 text-sm text-slate-300">
                        Use esta opção quando duas respostas devem levar à mesma mensagem.
                      </p>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <select className={field} value={existingTarget}
                          onChange={event => setExistingTarget(event.target.value)}>
                          {tree.nodes.map(node => (
                            <option key={node.id} value={node.id}>{flowTitle(node, tree.start)}</option>
                          ))}
                        </select>
                        <button type="button" onClick={() => linkExisting(selectedNode.id)}
                          className="shrink-0 rounded-xl border border-cyan-400/60 px-4 py-3 text-sm font-black text-cyan-100">
                          VINCULAR RESPOSTA
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-start gap-3 rounded-xl border border-emerald-400/35 bg-emerald-950/15 p-4">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
                  <div>
                    <p className="font-black text-emerald-200">{modeLabel[selectedNode.mode]}</p>
                    <p className="mt-1 text-sm leading-relaxed text-slate-300">
                      {selectedNode.mode === "order"
                        ? "Esta etapa usa a consulta autenticada de pedidos do H2 Colombiano. Não precisa criar opções manuais para essa consulta."
                        : selectedNode.mode === "human"
                          ? "O cliente passa para o atendimento humano. MENU permite retornar ao fluxo automático."
                          : "Este caminho termina aqui. Para continuar depois de uma resposta, altere o tipo da etapa para Pergunta com respostas."}
                    </p>
                  </div>
                </div>
              )}

              <details className="text-xs text-slate-500">
                <summary className="cursor-pointer">Identificação técnica (não precisa configurar)</summary>
                <code>{selectedNode.id}</code>
              </details>
            </>
          )}
        </div>
      </div>

      <section className={card + " w-full min-w-0 space-y-4"}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="flex items-center gap-2 text-lg font-black text-cyan-300">
              <Play className="h-5 w-5" /> 3. TESTAR O CAMINHO
            </h4>
            <p className="mt-1 text-sm text-slate-300">Clique nas respostas como se fosse um cliente. O teste não envia WhatsApp.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setTest({ current: tree.start, stack: [] })}
              className="flex items-center gap-1 rounded-lg border border-cyan-500/40 px-3 py-2 text-sm text-cyan-100">
              <RotateCcw className="h-4 w-4" /> INICIAR DO COMEÇO
            </button>
            <button type="button" onClick={() => setTest({ current: selected, stack: [] })}
              className="rounded-lg border border-emerald-400/40 px-3 py-2 text-sm text-emerald-100">
              TESTAR ESTA ETAPA
            </button>
          </div>
        </div>
        <div className="rounded-xl border border-cyan-500/30 bg-[#020d18] p-5">
          <p className="mb-3 text-sm font-black text-emerald-200">
            {currentTest ? flowTitle(currentTest, tree.start) : "Etapa não encontrada"}
          </p>
          <div className="whitespace-pre-wrap text-base leading-relaxed text-white">
            {currentTest ? renderH2AutoNode(currentTest) : "Etapa indisponível."}
          </div>
        </div>
        <div className="flex w-full flex-col gap-2">
          {currentTest?.options.map(answer => (
            <button type="button" key={answer.key} onClick={() => chooseTest(answer.key)}
              className="w-full rounded-xl border border-cyan-400/45 bg-[#102b40] px-4 py-3 text-left text-sm font-bold text-white">
              {numLabel(answer.key)} {answer.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="rounded-lg border border-slate-500/40 px-3 py-2 text-sm text-slate-200"
            onClick={() => setTest(prev => ({ current: prev.stack[prev.stack.length - 1] || tree.start, stack: prev.stack.slice(0, -1) }))}>
            0 — VOLTAR
          </button>
          <button type="button" className="rounded-lg border border-slate-500/40 px-3 py-2 text-sm text-slate-200"
            onClick={() => setTest({ current: tree.start, stack: [] })}>MENU — INÍCIO</button>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-400/35 bg-[#092436] p-4">
        <p className="text-sm text-slate-200">As alterações serão enviadas ao APK na próxima sincronização. Pedidos e outros serviços não serão alterados.</p>
        {saveButton}
      </div>
    </section>
  );
}
