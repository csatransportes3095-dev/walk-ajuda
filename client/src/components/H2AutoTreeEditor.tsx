import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown, ArrowRight, ArrowUp, CheckCircle2, ChevronDown, ChevronRight,
  GitBranch, Link2, Map as MapIcon, Play, Plus, RotateCcw, Save, Trash2, Search, MoreVertical, X,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  cloneH2AutoTree, H2_AUTO_TREE_DEFAULT, H2_AUTO_DEFAULT_FOOTER, h2AutoTreeSchema, renderH2AutoNode,
  type H2AutoTree, type H2AutoTreeNode,
} from "@shared/h2AutoTree";
import {
  addConnectedStage, availableOptionKey, flowPath, flowRows, flowTitle,
  moveFlowOption, removeFlowOption, unlinkedStages, orderedFlowOptions, normalizeFlowTreeOptions, type FlowRow,
} from "@/lib/h2AutoFlowMap";

type Props = { id: string; revision: number; appliedRevision: number; initial?: H2AutoTree };
const field = "w-full min-w-0 rounded-xl border border-cyan-500/40 bg-[#061625] px-4 py-3 text-base text-white outline-none focus:border-emerald-300";
const card = "rounded-2xl border border-cyan-400/25 bg-[#091e30] p-4 md:p-5";
const modeLabel: Record<H2AutoTreeNode["mode"], string> = {
  question: "Pergunta com respostas",
  end: "Encerrar este caminho",
  human: "Encaminhar para atendente",
  order: "Consultar pedidos do sistema",
  referral: "Consultar minhas indicações e comissões (com e-mail confirmado)",
};
const newText = "📋 *NOVA PERGUNTA*\n\nEscreva aqui a pergunta para o cliente.";
const numLabel = (key: string) => key === "10" ? "🔟" : key + "️⃣";

export default function H2AutoTreeEditor({ id, revision, appliedRevision, initial }: Props) {
  const utils = trpc.useUtils();
  const [tree, setTree] = useState<H2AutoTree>(() => cloneH2AutoTree(initial || H2_AUTO_TREE_DEFAULT));
  const [selected, setSelected] = useState(tree.start);
  // Para telas grandes: NÃO à esquerda, SIM à direita; somente o ramo escolhido abre.
  const [focusedBranch, setFocusedBranch] = useState("1");
  // Editor simples no proprio mapa, sem procurar formularios no rodape.
  const [quickEditId, setQuickEditId] = useState<string | null>(null);
  const [creatingUnder, setCreatingUnder] = useState<string | null>(null);
  const [newMenuOption, setNewMenuOption] = useState("");
  const [newQuestion, setNewQuestion] = useState("");
  const [replyUnder, setReplyUnder] = useState<string | null>(null);
  const [newReplyOption, setNewReplyOption] = useState("");
  const [newReplyMessage, setNewReplyMessage] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [test, setTest] = useState<{ current: string; stack: string[] }>({ current: tree.start, stack: [] });
  const [dirty, setDirty] = useState(false);
  const [folded, setFolded] = useState<Set<string>>(() => new Set());
  const [existingTarget, setExistingTarget] = useState(tree.start);
  const loadedRevision = useRef(revision);
  const savedTree = useRef<H2AutoTree>(cloneH2AutoTree(initial || H2_AUTO_TREE_DEFAULT));
  const currentTreeRef = useRef(tree);
  currentTreeRef.current = tree;
  const editRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (dirty || revision <= loadedRevision.current) return;
    const fresh = cloneH2AutoTree(initial || H2_AUTO_TREE_DEFAULT);
    loadedRevision.current = revision;
    savedTree.current = cloneH2AutoTree(fresh);
    setTree(fresh);
    setSelected(fresh.start);
    setFocusedBranch("1");
    setQuickEditId(null);
    setCreatingUnder(null);
    setReplyUnder(null);
    setExistingTarget(fresh.start);
    setTest({ current: fresh.start, stack: [] });
    setFolded(new Set());
  }, [dirty, revision, initial]);

  const selectedNode = useMemo(() => tree.nodes.find(n => n.id === selected), [tree, selected]);
  const rootNode = useMemo(() => tree.nodes.find(node => node.id === tree.start), [tree]);
  // Cada resposta inicial tem um mapa independente, inclusive quando reutiliza etapas.
  const branches = useMemo(() => {
    const options = [...(rootNode?.options || [])].sort((left, right) => {
      const priority = (key: string) => key === "2" ? 0 : key === "1" ? 1 : Number(key) + 2;
      return priority(left.key) - priority(right.key);
    });
    return options.map(option => ({
      key: option.key,
      title: option.label,
      id: option.next,
      rows: flowRows({ ...tree, start: option.next }, folded).map((row, index): FlowRow => ({
        ...row,
        depth: row.depth + 1,
        viaKey: index === 0 ? option.key : row.viaKey,
        viaLabel: index === 0 ? option.label : row.viaLabel,
        parentId: index === 0 ? tree.start : row.parentId,
      })),
    }));
  }, [tree, rootNode, folded]);
  const selectedBranchKey = branches.some(branch => branch.key === focusedBranch)
    ? focusedBranch : branches[0]?.key || "";
  const path = useMemo(() => flowPath(tree, selected), [tree, selected]);
  const unlinked = useMemo(() => unlinkedStages(tree), [tree]);
  const currentTest = tree.nodes.find(n => n.id === test.current);
  // Global revision changes are expected when ADM safety/identity controls save.
  // The server compares the question tree itself before accepting this draft.
  const stale = false;
  const questionCount = tree.nodes.filter(n => n.mode === "question").length;
  const save = trpc.h2AutoAdmin.saveTree.useMutation({
    onSuccess: (result, variables) => {
      loadedRevision.current = result.revision;
      savedTree.current = cloneH2AutoTree(variables.tree);
      toast.success("SALVO NO ADM. Abra H2 Auto no celular e toque em SINCRONIZAR ADM para aplicar imediatamente.", { duration: 10000 });
      if (JSON.stringify(normalizeFlowTreeOptions(currentTreeRef.current)) === JSON.stringify(variables.tree)) {
        setDirty(false);
      }
      void utils.h2AutoAdmin.list.invalidate();
    },
    onError: error => toast.error("NÃO SALVOU: " + (error.message || "Verifique as perguntas e tente novamente.")),
  });

  function selectStage(stageId: string) {
    setSelected(stageId);
    setTest({ current: stageId, stack: [] });
    setCreatingUnder(null);
    setReplyUnder(null);
    setQuickEditId(null);
    setAdvancedOpen(true);
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
      toast.success("Etapa criada. Clique em SALVAR E SINCRONIZAR para gravar.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível criar a etapa.");
    }
  }

  function openNewQuestion(parentId: string) {
    const parent = tree.nodes.find(node => node.id === parentId);
    if (!parent || parent.mode !== "question") {
      toast.error("Esta etapa nao recebe perguntas. Escolha um menu com respostas.");
      return;
    }
    if (tree.nodes.length >= 100 || !availableOptionKey(parent.options)) {
      toast.error("Limite de perguntas ou respostas atingido.");
      return;
    }
    setCreatingUnder(parentId);
    setQuickEditId(null);
    setReplyUnder(null);
    setNewMenuOption("");
    setNewQuestion("");
  }

  function createQuestionInline(parentId: string) {
    const parent = tree.nodes.find(node => node.id === parentId);
    const label = newMenuOption.trim();
    const text = newQuestion.trim();
    if (!parent || parent.mode !== "question") {
      toast.error("Selecione um menu que recebe perguntas.");
      return;
    }
    const key = availableOptionKey(parent.options);
    if (!key || tree.nodes.length >= 100) {
      toast.error("Este menu nao permite mais perguntas.");
      return;
    }
    if (!label || !text) {
      toast.error("Preencha o nome da opcao e o texto da pergunta.");
      return;
    }
    if (label.length > 160 || text.length > 1800) {
      toast.error("O texto da pergunta ultrapassou o limite.");
      return;
    }
    const newStageId = newId();
    const updated: H2AutoTree = {
      ...tree,
      nodes: [...tree.nodes.map(node =>
        node.id === parentId
          ? { ...node, options: [...node.options, { key, label, next: newStageId }] }
          : node
      ), { id: newStageId, mode: "question" as const, text, options: [] }],
    };
    setTree(updated);
    setFolded(previous => {
      const next = new Set(previous);
      next.delete(parentId);
      return next;
    });
    setDirty(true);
    setSelected(newStageId);
    setQuickEditId(newStageId);
    setCreatingUnder(null);
    setNewMenuOption("");
    setNewQuestion("");
    const parsed = h2AutoTreeSchema.safeParse(normalizeFlowTreeOptions(updated));
    if (parsed.success) {
      save.mutate({ id, expectedRevision: loadedRevision.current, baseTree: savedTree.current, tree: parsed.data });
    } else {
      toast.error("Pergunta mantida na tela. Revise os campos e clique em SALVAR E SINCRONIZAR.");
    }
  }

  function createReplyInline(parentId: string) {
    const parent = tree.nodes.find(node => node.id === parentId);
    const label = newReplyOption.trim();
    const message = newReplyMessage.trim();
    if (!parent || parent.mode !== "question") return;
    if (!label || !message) {
      toast.error("Preencha a resposta e a mensagem que o cliente recebe.");
      return;
    }
    if (label.length > 160 || message.length > 1800) {
      toast.error("O texto ultrapassou o limite.");
      return;
    }
    const key = availableOptionKey(parent.options);
    if (!key || tree.nodes.length >= 100) {
      toast.error("Limite de respostas ou etapas atingido.");
      return;
    }
    const nextId = newId();
    setTree(previous => ({
      ...previous,
      nodes: [...previous.nodes.map(node =>
        node.id === parentId
          ? { ...node, options: [...node.options, { key, label, next: nextId }] }
          : node
      ), { id: nextId, mode: "end" as const, text: message, options: [] }],
    }));
    setDirty(true);
    setReplyUnder(null);
    setNewReplyOption("");
    setNewReplyMessage("");
    toast.success("Resposta adicionada na tela. Clique em SALVAR E SINCRONIZAR.");
  }

  function quickEditNode(node: H2AutoTreeNode) {
    if (quickEditId !== node.id) return null;
    return (
      <div className="mt-3 min-w-0 space-y-4 rounded-2xl border border-emerald-400/45 bg-[#0b2633] p-3 md:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-black text-emerald-200">✏️ EDITAR AQUI — {flowTitle(node, tree.start)}</span>
          <button type="button" className="rounded-lg border border-slate-400/40 px-3 py-2 text-xs font-bold text-slate-200"
            onClick={() => { setQuickEditId(null); setReplyUnder(null); }}>FECHAR</button>
        </div>
        <label className="block space-y-2 text-sm font-bold text-cyan-100">
          {node.mode === "question" ? "PERGUNTA QUE O CLIENTE RECEBE" : "MENSAGEM QUE O CLIENTE RECEBE"}
          <textarea className={field + " min-h-[115px] font-sans"} rows={4} maxLength={1800}
            value={node.text}
            onChange={event => changeNode(node.id, previous => ({ ...previous, text: event.target.value }))} />
        </label>
        {node.mode === "question" && (
          <div className="space-y-3">
            <h5 className="font-black text-violet-200">RESPOSTAS DESTA PERGUNTA</h5>
            {node.options.map(option => (
              <div key={option.key} className="space-y-2 rounded-xl border border-violet-400/25 bg-[#071827] p-3">
                <label className="block space-y-1.5 text-sm font-semibold text-white">
                  {numLabel(option.key)} O CLIENTE ESCOLHE
                  <input className={field} value={option.label} maxLength={160}
                    onChange={event => changeNode(node.id, old => ({
                      ...old, options: old.options.map(answer =>
                        answer.key === option.key ? { ...answer, label: event.target.value } : answer),
                    }))} />
                </label>
                <button type="button" className="rounded-lg border border-cyan-500/50 px-3 py-2 text-xs font-black text-cyan-200"
                  onClick={() => { setQuickEditId(option.next); setSelected(option.next); setTest({ current: option.next, stack: [] }); }}>
                  ✏️ EDITAR MENSAGEM SEGUINTE
                </button>
              </div>
            ))}
            {node.options.length === 0 && <p className="text-sm text-amber-200">Ainda nao tem respostas. Adicione a primeira abaixo.</p>}
            <button type="button" className="w-full rounded-xl bg-violet-500 px-4 py-3 text-sm font-black text-white disabled:opacity-40"
              disabled={node.options.length >= 10 || tree.nodes.length >= 100}
              onClick={() => { setReplyUnder(node.id); setNewReplyOption(""); setNewReplyMessage(""); }}>
              <Plus className="mr-1 inline h-4 w-4" /> ADICIONAR RESPOSTA
            </button>
            {replyUnder === node.id && (
              <div className="space-y-3 rounded-xl border border-violet-400/45 bg-violet-950/20 p-4">
                <label className="block space-y-2 text-sm font-bold text-violet-100">
                  RESPOSTA DO CLIENTE (EX.: SIM OU NAO)
                  <input className={field} maxLength={160} value={newReplyOption}
                    placeholder="Ex.: SIM" onChange={event => setNewReplyOption(event.target.value)} />
                </label>
                <label className="block space-y-2 text-sm font-bold text-violet-100">
                  MENSAGEM QUE SERA ENVIADA DEPOIS DA RESPOSTA
                  <textarea className={field} rows={3} maxLength={1800} value={newReplyMessage}
                    placeholder="Escreva a mensagem que o cliente vai receber."
                    onChange={event => setNewReplyMessage(event.target.value)} />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="rounded-xl bg-violet-500 px-4 py-3 font-black"
                    onClick={() => createReplyInline(node.id)}>CRIAR RESPOSTA</button>
                  <button type="button" className="rounded-xl border border-slate-400/30 px-4 py-3"
                    onClick={() => setReplyUnder(null)}>CANCELAR</button>
                </div>
              </div>
            )}
          </div>
        )}
        {node.id !== tree.start && node.mode === "question" && (
          <button type="button" className="w-full rounded-xl border border-emerald-400/60 px-4 py-3 text-sm font-black text-emerald-200"
            onClick={() => openNewQuestion(node.id)}>
            <Plus className="mr-1 inline h-4 w-4" /> CRIAR OUTRA PERGUNTA NESTE MENU
          </button>
        )}
        <div className="space-y-2 rounded-xl border border-cyan-400/40 bg-[#020d18] p-3">
          <p className="text-xs font-black text-cyan-200">📱 PRÉVIA DO WHATSAPP — ESTA ETAPA</p>
          <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-white">{renderH2AutoNode(node, tree.footer ?? H2_AUTO_DEFAULT_FOOTER)}</div>
          <p className="text-xs text-slate-400">A prévia acompanha sua edição. Salve no ADM para o celular receber o texto.</p>
        </div>
        <button type="button" onClick={submit} disabled={!dirty || stale || save.isPending}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-[#052016] disabled:opacity-40">
          <Save className="h-4 w-4" />
          {save.isPending ? "SALVANDO NO ADM..." : dirty ? "SALVAR ALTERAÇÕES DESTE ATENDIMENTO" : "ALTERAÇÕES SALVAS NO ADM"}
        </button>
        <p className="text-xs text-emerald-200/80">Após salvar, confira no topo se o celular confirmou esta versão. Se estiver pendente, sincronize no H2 Auto.</p>
      </div>
    );
  }

  function quickAddForm(parentId: string) {
    if (creatingUnder !== parentId) return null;
    return (
      <div className="mt-3 space-y-3 rounded-2xl border-2 border-violet-400/60 bg-[#1a153a] p-4">
        <h5 className="text-lg font-black text-white">➕ NOVA PERGUNTA NESTE CAMINHO</h5>
        <p className="text-sm text-violet-100">So dois campos. A pergunta entra neste menu, sem mudar as outras opcoes.</p>
        <label className="block space-y-2 text-sm font-bold text-white">
          1. NOME DA NOVA OPCAO NO MENU
          <input className={field} value={newMenuOption} maxLength={160}
            placeholder="Ex.: Tenho uma duvida"
            onChange={event => setNewMenuOption(event.target.value)} />
        </label>
        <label className="block space-y-2 text-sm font-bold text-white">
          2. QUAL PERGUNTA O CLIENTE VAI RECEBER?
          <textarea className={field} rows={3} maxLength={1800} value={newQuestion}
            placeholder="Ex.: Voce possui um indicador?"
            onChange={event => setNewQuestion(event.target.value)} />
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="rounded-xl bg-emerald-400 px-5 py-3 font-black text-[#052016]"
            onClick={() => createQuestionInline(parentId)}>CRIAR PERGUNTA</button>
          <button type="button" className="rounded-xl border border-slate-400/40 px-4 py-3 text-white"
            onClick={() => setCreatingUnder(null)}>CANCELAR</button>
        </div>
      </div>
    );
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
    savedTree.current = cloneH2AutoTree(fresh);
    setTree(fresh);
    setSelected(fresh.start);
    setFocusedBranch("1");
    setExistingTarget(fresh.start);
    setTest({ current: fresh.start, stack: [] });
    setDirty(false);
    setFolded(new Set());
  }

  function submit() {
    if (stale) { toast.error("O ADM foi atualizado em outro lugar. Recarregue para evitar sobrescrever."); return; }
    const parsed = h2AutoTreeSchema.safeParse(normalizeFlowTreeOptions(tree));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      toast.error("NÃO SALVOU: " + (issue?.message || "Revise as perguntas e os destinos."), { duration: 9000 });
      return;
    }
    save.mutate({ id, expectedRevision: loadedRevision.current, baseTree: savedTree.current, tree: parsed.data });
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


  function addCommissionOption(branchId: string) {
    const parent = tree.nodes.find(n => n.id === branchId);
    if (!parent || parent.mode !== "question") return;
    if (parent.options.some(o => tree.nodes.find(n => n.id === o.next)?.mode === "referral")) return;
    const key = availableOptionKey(parent.options);
    if (!key || tree.nodes.length >= 100) { toast.error("Limite de opções atingido."); return; }
    const id = newId();
    setTree(prev => ({ ...prev,
      nodes: [...prev.nodes.map(n => n.id === branchId
        ? { ...n, options: orderedFlowOptions([...n.options, {key,label:"Minhas indicações e comissões",next:id}]) }
        : n), {id, mode:"referral" as const,
          text:"💰 *MINHAS INDICAÇÕES E COMISSÕES*\n\nConfirme seu telefone e o código enviado ao e-mail cadastrado.",options:[]}],
    }));
    setDirty(true);
    setFolded(prev => { const next = new Set(prev); next.delete(branchId); return next; });
    toast.success("Consulta criada no menu SIM. Requer APK H2 Auto 1.23 para funcionar.");
  }

  function reorderInline(row: FlowRow, direction: -1 | 1) {
    if (!row.parentId || !row.viaKey) return;
    const parent = tree.nodes.find(node => node.id === row.parentId);
    if (!parent) return;
    const options = orderedFlowOptions(parent.options);
    const from = options.findIndex(option => option.key === row.viaKey && option.next === row.id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= options.length) return;
    changeNode(parent.id, node => ({
      ...node, options: moveFlowOption(orderedFlowOptions(node.options), from, to),
    }));
    toast.success("Ordem alterada. Clique em SALVAR E SINCRONIZAR.");
  }

  function renderMapRow(row: FlowRow, index: number, levelOffset = 0, showVia = true) {
    const node = tree.nodes.find(n => n.id === row.id);
    if (!node) return null;
    const active = selected === row.id;
    const expandable = node.options.length > 0 && !row.shared && row.depth > 0;
    const parent = row.parentId ? tree.nodes.find(candidate => candidate.id === row.parentId) : null;
    const siblings = orderedFlowOptions(parent?.options || []);
    const position = siblings.findIndex(option => option.key === row.viaKey && option.next === row.id);
    const indentation = Math.min(Math.max(row.depth - levelOffset, 0), 3) * 5;
    return (
      <div key={row.id + "-" + index}
        style={{ marginLeft: indentation }}
        className={"min-w-0 rounded-lg border-l-2 p-1.5 " +
          (active ? "border-l-emerald-300 bg-emerald-900/25" : "border-l-cyan-600/65 bg-slate-950/20")}>
        {showVia && row.viaKey !== null && (
          <div className="mb-1 flex min-w-0 items-start gap-2 pl-1 text-xs leading-snug text-violet-200">
            <span className="shrink-0 rounded-md border border-violet-400/40 bg-violet-950/60 px-2 py-1 font-black">{row.viaKey}</span>
            <span className="min-w-0 flex-1 break-words">{row.viaLabel}</span>
            <ArrowRight className="mt-1 h-4 w-4 shrink-0" />
          </div>
        )}
        <div className="flex min-w-0 items-stretch gap-2">
          <button type="button" onClick={() => selectStage(row.id)} aria-pressed={active}
            className={"min-w-0 flex-1 rounded-lg border px-3 py-2 text-left " +
              (active ? "border-emerald-300 bg-emerald-950/70 text-white" :
                "border-cyan-500/25 bg-[#092036] text-slate-100 hover:border-cyan-300")}>
            <span className="block text-[10px] font-bold uppercase tracking-wide text-cyan-300">
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
        <div className="mt-2 flex min-w-0 items-center gap-2">
          <button type="button" onClick={() => selectStage(node.id)}
            className="flex min-h-9 flex-1 items-center justify-center gap-1 rounded-lg border border-cyan-400/40 px-2 py-1.5 text-xs font-black text-cyan-100 hover:bg-cyan-900/30">
            ✏️ EDITAR
          </button>
          {position >= 0 && siblings.length > 1 && (
            <div className="flex items-center gap-1" aria-label="Ordenação">
              <button type="button" aria-label="Subir opção" title="Subir" disabled={position === 0}
                onClick={() => reorderInline(row,-1)}
                className="rounded-lg border border-cyan-400/30 p-2 text-cyan-200 disabled:opacity-25">
                <ArrowUp className="h-4 w-4" />
              </button>
              <button type="button" aria-label="Descer opção" title="Descer" disabled={position === siblings.length-1}
                onClick={() => reorderInline(row,1)}
                className="rounded-lg border border-cyan-400/30 p-2 text-cyan-200 disabled:opacity-25">
                <ArrowDown className="h-4 w-4" />
              </button>
            </div>
          )}
          <details className="relative shrink-0">
            <summary aria-label={"Mais ações para " + flowTitle(node,tree.start)}
              className="list-none cursor-pointer rounded-lg border border-slate-500/40 p-2 text-slate-200 [&::-webkit-details-marker]:hidden">
              <MoreVertical className="h-4 w-4"/>
            </summary>
            <div className="absolute right-0 z-10 mt-1 flex w-48 flex-col gap-1 rounded-xl border border-cyan-400/35 bg-[#081c30] p-2 shadow-2xl">
              {node.mode === "question" && node.id !== tree.start && (
                <button type="button" disabled={tree.nodes.length >= 100 || node.options.length >= 10}
                  onClick={() => openNewQuestion(node.id)}
                  className="rounded-lg px-3 py-2 text-left text-xs font-bold text-violet-200 disabled:opacity-30">➕ Criar pergunta</button>
              )}
              {node.id !== tree.start && (
                <button type="button" onClick={() => deleteStage(node.id)}
                  className="rounded-lg px-3 py-2 text-left text-xs font-bold text-rose-300">🗑 Excluir etapa</button>
              )}
              <button type="button" onClick={() => selectStage(node.id)}
                className="rounded-lg px-3 py-2 text-left text-xs font-bold text-cyan-200">✏️ Editar detalhes</button>
            </div>
          </details>
        </div>
        {quickAddForm(node.id)}

      </div>
    );
  }

  return (
    <section className="min-w-0 space-y-4 rounded-2xl border border-emerald-400/35 bg-[#061321] p-3 shadow-[0_0_30px_rgba(16,185,129,0.08)] md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h3 className="flex items-center gap-3 text-2xl font-black text-emerald-300 md:text-3xl">
            <GitBranch className="h-7 w-7" /> ÁRVORE DE ATENDIMENTO
          </h3>
          <p className="max-w-4xl text-sm leading-relaxed text-slate-300">
            Escolha SIM ou NÃO, encontre o menu e clique em <strong className="text-violet-300">CRIAR PERGUNTA AQUI</strong>. Tudo é editado no próprio caminho.
          </p>
        </div>
        <label className="flex items-center gap-3 rounded-xl border border-emerald-400/30 bg-emerald-900/20 px-4 py-3 text-sm font-bold text-emerald-200">
          <input type="checkbox" className="h-5 w-5" checked={tree.enabled}
            onChange={event => { setTree(prev => ({ ...prev, enabled: event.target.checked })); setDirty(true); }} />
          Árvore ativa no atendimento
        </label>
      </div>

      <div className="rounded-2xl border border-cyan-400/40 bg-gradient-to-r from-[#081c31] to-[#111935] p-4 md:p-5">
        <h4 className="text-lg font-black text-cyan-200">✏️ RODAPÉ DO WHATSAPP</h4>
        <p className="mt-1 mb-3 text-sm text-slate-300">Edite a orientação exibida abaixo das opções de cada menu. O texto é único para este aparelho e sincroniza pelo ADM. Para desativar, deixe vazio.</p>
        <textarea aria-label="Texto do rodapé do WhatsApp" className={field + " min-h-24 whitespace-pre-wrap"} rows={3}
          maxLength={400} value={tree.footer ?? H2_AUTO_DEFAULT_FOOTER}
          onChange={event => {setTree(previous => ({...previous, footer:event.target.value}));setDirty(true);}} />
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-xs text-slate-400">{(tree.footer ?? H2_AUTO_DEFAULT_FOOTER).length}/400 caracteres · Salve no botão SALVAR E SINCRONIZAR abaixo.</span>
          <button type="button" onClick={() => {setTree(previous => ({...previous,footer:H2_AUTO_DEFAULT_FOOTER}));setDirty(true);}}
            className="rounded-lg border border-cyan-400/50 px-3 py-2 text-xs font-black text-cyan-100">RESTAURAR PADRÃO</button>
        </div>
      </div>

      <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-400/40 bg-[#092436] p-3 shadow-xl">
        <div className="space-y-1">
          <span className="block text-sm font-semibold text-white">
            {stale ? "⚠️ Configuração alterada no ADM. Recarregue antes de salvar."
            : dirty ? "● Alterações não salvas na árvore" : "✓ Configuração salva no ADM"}
          </span>
          <span className={"block text-xs font-bold " + (appliedRevision >= revision ? "text-emerald-200" : "text-amber-200")}>
            {appliedRevision >= revision
              ? "✓ O CELULAR CONFIRMOU ESTA VERSÃO"
              : "⚠️ AINDA NÃO APLICADO NO CELULAR — Abra H2 Auto e toque em SINCRONIZAR ADM. Configuração ADM: " + revision + " / Celular: " + appliedRevision}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {stale && <button type="button" onClick={resetFromServer}
            className="rounded-lg border border-amber-400/60 px-3 py-2 text-sm font-semibold text-amber-200">
            RECARREGAR
          </button>}
          {saveButton}
        </div>
      </div>

      <div className="grid w-full min-w-0 grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <aside className={card + " w-full min-w-0 space-y-3 lg:max-h-[75vh] lg:overflow-y-auto"}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="flex items-center gap-2 text-lg font-black text-cyan-300">
                <MapIcon className="h-5 w-5" /> 1. MAPA DO ATENDIMENTO
              </h4>
              <p className="mt-1 text-sm text-slate-300">Selecione SIM ou NÃO. Para adicionar uma pergunta, use o botão roxo CRIAR PERGUNTA AQUI dentro do caminho.</p>
            </div>
          </div>
          <label className="flex items-center gap-2 rounded-xl border border-cyan-500/35 bg-[#061625] px-3 py-2 text-cyan-200">
            <Search className="h-4 w-4 shrink-0" />
            <input aria-label="Buscar etapa no atendimento" placeholder="Buscar pergunta ou destino..."
              value={search} onChange={event => setSearch(event.target.value)}
              className="w-full min-w-0 bg-transparent text-sm text-white outline-none placeholder:text-slate-500" />
          </label>
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

          <div className="w-full min-w-0 space-y-5" aria-label="Mapa do atendimento por SIM ou NÃO">
            {rootNode && <div className="w-full rounded-2xl border border-cyan-400/30 bg-cyan-950/10 p-3 md:p-4">
              {renderMapRow({ id: rootNode.id, depth: 0, viaKey: null, viaLabel: null, shared: false, parentId: null }, 0)}
            </div>}
            <div className="grid min-w-0 grid-cols-1 items-start gap-2">
              {branches.filter(branch => !search.trim() || branch.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) || branch.rows.some(row => flowTitle(tree.nodes.find(n => n.id === row.id) || rootNode!, tree.start).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))).map(branch => {
                const active = branch.key === selectedBranchKey;
                return <section key={branch.key} className={"min-w-0 rounded-xl border p-2 md:p-3 " + (active ? "border-emerald-400 bg-emerald-950/20" : "border-cyan-500/35 bg-[#0b172a]")}>
                  <button type="button" aria-expanded={active} aria-pressed={active}
                    onClick={() => { setFocusedBranch(branch.key); setSelected(branch.id); setTest({ current: branch.id, stack: [] }); setQuickEditId(null); }}
                    className={"flex w-full min-w-0 items-center gap-2 rounded-lg border px-3 py-2.5 text-left " + (active ? "border-emerald-300 bg-emerald-900/40" : "border-cyan-500/40 bg-[#092036] hover:border-cyan-300")}>
                    <span className={"flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-black " + (active ? "bg-emerald-400 text-[#052016]" : "bg-cyan-900 text-cyan-100")}>{numLabel(branch.key)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-black text-cyan-200">{"OPÇÃO " + branch.key + " · CAMINHO CONFIGURADO"}</span>
                      <span className="mt-1 block break-words text-sm font-black text-white">{branch.title}</span>
                      <span className="mt-1 block text-[11px] text-slate-400">{branch.rows.length} etapas no caminho</span>

                    </span>
                    {active ? <ChevronDown className="h-6 w-6 shrink-0 text-emerald-300" /> : <ChevronRight className="h-6 w-6 shrink-0 text-cyan-300" />}
                  </button>
                  {active ? <div className="mt-4 min-w-0 space-y-3">
                    {branch.key === "1" && !tree.nodes.some(n => n.id === branch.id && n.options.some(o => tree.nodes.find(x => x.id === o.next)?.mode === "referral")) && (
                      <button type="button" onClick={() => addCommissionOption(branch.id)}
                        className="w-full rounded-xl border border-amber-400/60 bg-amber-500/15 px-4 py-3 text-sm font-black text-amber-100">
                        💰 ADICIONAR CONSULTA DE INDICAÇÕES E COMISSÕES
                      </button>
                    )}
                    {branch.rows.filter(row => !search.trim() || branch.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) || flowTitle(tree.nodes.find(n => n.id === row.id) || rootNode!, tree.start).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) || String(row.viaLabel || "").toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())).map((row, index) => renderMapRow(row, index, 1, index !== 0))}
                  </div> : <p className="px-3 pt-4 text-sm text-slate-400">Selecione esta opção para ver suas etapas, uma abaixo da outra.</p>}
                </section>;
              })}
            </div>
            {!branches.length && <p className="p-3 text-sm text-amber-200">Crie as opções SIM e NÃO na primeira mensagem.</p>}
          </div>

          {unlinked.length > 0 && (
            <div className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-950/15 p-4">
              <h5 className="font-black text-amber-200">ETAPAS FORA DO CAMINHO ({unlinked.length})</h5>
              <p className="text-sm text-slate-300">Estas etapas ainda não são alcançadas por nenhuma resposta desde o início. Abra uma pergunta e escolha a etapa como destino.</p>
              {unlinked.map(node => (
                <div key={node.id} className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-950/10 p-2">
                  <button type="button" onClick={() => selectStage(node.id)}
                    className="block w-full rounded-lg border border-amber-500/30 px-3 py-2 text-left text-sm font-bold text-amber-100">
                    ✏️ EDITAR — {flowTitle(node, tree.start)}
                  </button>
                  {quickEditNode(node)}
                </div>
              ))}
            </div>
          )}
        </aside>

        <div className="min-w-0 lg:sticky lg:top-20 lg:max-h-[75vh] lg:overflow-y-auto">
        <button type="button" onClick={() => setAdvancedOpen(value => !value)}
          className="hidden w-full rounded-xl border border-slate-400/30 bg-[#071827] px-4 py-3 text-left text-sm font-bold text-slate-300">
          {advancedOpen ? "OCULTAR CONFIGURACOES AVANCADAS" : "⚙️ CONFIGURACOES AVANCADAS (OPCIONAL)"}
        </button>
        <div className={(advancedOpen ? "fixed inset-0 z-[100] overflow-y-auto bg-[#061321] p-3 " : "hidden ") + "min-w-0 space-y-4 rounded-xl border border-cyan-400/30 lg:static lg:block lg:max-h-none lg:bg-[#091e30] lg:p-4"} ref={editRef}>
          <div className="flex items-center justify-between gap-2 border-b border-cyan-400/20 pb-2">
            <h4 className="text-sm font-black text-emerald-200">✏️ EDITAR ETAPA SELECIONADA</h4>
            <button type="button" onClick={() => setAdvancedOpen(false)} aria-label="Fechar editor" className="rounded-lg border border-cyan-400/40 p-2 text-cyan-100 lg:hidden"><X className="h-5 w-5"/></button>
          </div>
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
                      {(selectedNode.mode === "order" || selectedNode.mode === "referral")
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
      </div>

      <section className={card + " w-full min-w-0 space-y-4"}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="flex items-center gap-2 text-lg font-black text-cyan-300">
              <Play className="h-5 w-5" /> 3. TESTAR O CAMINHO
            </h4>
            <p className="mt-1 text-sm text-slate-300">O simulador acompanha o item selecionado no mapa. Clique nas respostas para avançar. Não envia WhatsApp.</p>
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
            {currentTest ? renderH2AutoNode(currentTest, tree.footer ?? H2_AUTO_DEFAULT_FOOTER) : "Etapa indisponível."}
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
