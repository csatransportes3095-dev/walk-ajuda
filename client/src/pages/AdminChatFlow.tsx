import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import AdminHeader from "@/components/AdminHeader";
import { Plus, Trash2, Edit2, ChevronRight, ChevronDown, ArrowLeft, GitBranch } from "lucide-react";

// Tipos de ação disponíveis
const ACTION_TYPES = [
  { value: "show_children", label: "📋 Mostrar sub-botões", field: null, placeholder: "", hint: "Mostra os botões filhos configurados abaixo" },
  { value: "send_text", label: "✉️ Responder com texto", field: "text", placeholder: "Digite a resposta final...", hint: "O bot envia este texto e encerra o fluxo" },
  { value: "open_internal", label: "📄 Abrir página do site", field: "path", placeholder: "/login", hint: "Ex: /login  /acompanhar  /planilha" },
  { value: "open_external", label: "🔗 Abrir link externo", field: "url", placeholder: "https://...", hint: "URL completa com https://" },
  { value: "open_video", label: "🎥 Abrir vídeo", field: "url", placeholder: "https://youtube.com/...", hint: "Link do YouTube ou outro vídeo" },
  { value: "open_whatsapp", label: "💬 Abrir WhatsApp", field: "phone", placeholder: "5511940239867", hint: "Número com código do país (55 + DDD + número)" },
  { value: "handoff_human", label: "👤 Falar com atendente", field: null, placeholder: "", hint: "Encaminha para atendente humano" },
];

function getActionInfo(type: string) {
  return ACTION_TYPES.find(a => a.value === type) || ACTION_TYPES[0];
}

function buildPayload(actionType: string, value: string): Record<string, unknown> {
  const info = getActionInfo(actionType);
  if (!info.field) return {};
  if (actionType === "open_internal") return { path: value.startsWith("/") ? value : "/" + value };
  if (actionType === "open_whatsapp") return { phone: value.replace(/\D/g, "") };
  return { [info.field]: value };
}

function extractValue(actionType: string, payload: Record<string, any> | null): string {
  if (!payload) return "";
  const info = getActionInfo(actionType);
  if (!info.field) return "";
  return String(payload[info.field] || "");
}

const TYPE_COLORS: Record<string, string> = {
  show_children: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  send_text: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  open_internal: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  open_external: "bg-green-500/20 text-green-300 border-green-500/30",
  open_video: "bg-red-500/20 text-red-300 border-red-500/30",
  open_whatsapp: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  handoff_human: "bg-orange-500/20 text-orange-300 border-orange-500/30",
};

// ─── FORMULÁRIO DE NÓ ────────────────────────────────────────────────────────
function NodeForm({
  label, setLabel,
  botResponse, setBotResponse,
  botImageUrl, setBotImageUrl,
  actionType, setActionType,
  actionValue, setActionValue,
  onSave, onCancel, saveLabel = "Salvar",
}: {
  label: string; setLabel: (v: string) => void;
  botResponse: string; setBotResponse: (v: string) => void;
  botImageUrl?: string; setBotImageUrl?: (v: string) => void;
  actionType: string; setActionType: (v: string) => void;
  actionValue: string; setActionValue: (v: string) => void;
  onSave: () => void; onCancel: () => void; saveLabel?: string;
}) {
  const info = getActionInfo(actionType);
  return (
    <div className="space-y-3 p-4 bg-[#0d1829] rounded-xl border border-blue-500/30">
      <div>
        <label className="text-xs font-bold text-white/60 block mb-1">NOME DO BOTÃO *</label>
        <input
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder="Ex: Documento do carro, Toyota, Corolla..."
          className="w-full h-10 rounded-lg bg-black/30 border border-white/15 px-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-blue-400"
          autoFocus
        />
      </div>
      <div>
        <label className="text-xs font-bold text-white/60 block mb-1">RESPOSTA DO BOT (quando o cliente clicar)</label>
        <textarea
          value={botResponse}
          onChange={e => setBotResponse(e.target.value)}
          placeholder="Ex: Qual a marca do veículo? Selecione abaixo:"
          rows={2}
          className="w-full rounded-lg bg-black/30 border border-white/15 px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-blue-400 resize-none"
        />
      </div>
      {setBotImageUrl && (
        <div>
          <label className="text-xs font-bold text-white/60 block mb-1">FOTO / IMAGEM NA RESPOSTA (opcional)</label>
          <input
            value={botImageUrl || ""}
            onChange={e => setBotImageUrl(e.target.value)}
            placeholder="https://... (URL da imagem)"
            className="w-full h-10 rounded-lg bg-black/30 border border-white/15 px-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-blue-400"
          />
          {botImageUrl && (
            <img src={botImageUrl} alt="Preview" className="mt-2 max-h-32 rounded-lg border border-white/10 object-cover" onError={e => (e.currentTarget.style.display = 'none')} />
          )}
        </div>
      )}
      <div>
        <label className="text-xs font-bold text-white/60 block mb-1">AÇÃO DESTE BOTÃO</label>
        <select
          value={actionType}
          onChange={e => { setActionType(e.target.value); setActionValue(""); }}
          className="w-full h-10 rounded-lg bg-black/30 border border-white/15 px-3 text-sm text-white focus:outline-none focus:border-blue-400"
        >
          {ACTION_TYPES.map(a => (
            <option key={a.value} value={a.value} className="bg-gray-900">{a.label}</option>
          ))}
        </select>
        <p className="text-[11px] text-white/35 mt-1">{info.hint}</p>
      </div>
      {info.field && (
        <div>
          <label className="text-xs font-bold text-white/60 block mb-1">
            {actionType === "open_internal" ? "CAMINHO DA PÁGINA" :
             actionType === "open_whatsapp" ? "NÚMERO DO WHATSAPP" :
             actionType === "send_text" ? "TEXTO DA RESPOSTA FINAL" :
             "URL / LINK"}
          </label>
          {actionType === "send_text" ? (
            <textarea
              value={actionValue}
              onChange={e => setActionValue(e.target.value)}
              placeholder={info.placeholder}
              rows={3}
              className="w-full rounded-lg bg-black/30 border border-white/15 px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-blue-400 resize-none"
            />
          ) : (
            <input
              value={actionValue}
              onChange={e => setActionValue(e.target.value)}
              placeholder={info.placeholder}
              className="w-full h-10 rounded-lg bg-black/30 border border-white/15 px-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-blue-400"
            />
          )}
        </div>
      )}
      <div className="flex gap-2 pt-1">
        <button onClick={onSave} className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-colors">{saveLabel}</button>
        <button onClick={onCancel} className="px-5 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-sm font-bold transition-colors">Cancelar</button>
      </div>
    </div>
  );
}

// ─── NÓ DA ÁRVORE ────────────────────────────────────────────────────────────
function TreeNode({ node, depth = 0, allNodes, onRefresh }: {
  node: any;
  depth?: number;
  allNodes: any[];
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const [showAddChild, setShowAddChild] = useState(false);
  const [editing, setEditing] = useState(false);

  const [newLabel, setNewLabel] = useState("");
  const [newBotResponse, setNewBotResponse] = useState("");
  const [newActionType, setNewActionType] = useState("show_children");
  const [newActionValue, setNewActionValue] = useState("");

  const [editLabel, setEditLabel] = useState(node.label || "");
  const [editBotResponse, setEditBotResponse] = useState(node.botResponse || "");
  const [editActionType, setEditActionType] = useState(node.actionType || "show_children");
  const [editActionValue, setEditActionValue] = useState(extractValue(node.actionType, node.actionPayload));

  const saveMut = trpc.chatFlow.adminSave.useMutation({ onSuccess: () => { onRefresh(); setShowAddChild(false); setEditing(false); toast.success("Salvo!"); } });
  const deleteMut = trpc.chatFlow.adminDelete.useMutation({ onSuccess: () => { onRefresh(); toast.success("Removido"); } });

  const children = allNodes.filter(n => n.parentId === node.id).sort((a, b) => a.sortOrder - b.sortOrder);
  const info = getActionInfo(node.actionType);
  const colorClass = TYPE_COLORS[node.actionType] || "bg-white/10 text-white/50 border-white/20";
  const descValue = extractValue(node.actionType, node.actionPayload);

  const handleSaveEdit = () => {
    saveMut.mutate({
      id: node.id,
      parentId: node.parentId ?? null,
      label: editLabel.trim(),
      botResponse: editBotResponse.trim() || undefined,
      actionType: editActionType as any,
      actionPayload: buildPayload(editActionType, editActionValue),
      sortOrder: node.sortOrder,
      isActive: true,
    });
  };

  const handleAddChild = () => {
    if (!newLabel.trim()) { toast.error("Nome do botão é obrigatório"); return; }
    saveMut.mutate({
      parentId: node.id,
      label: newLabel.trim(),
      botResponse: newBotResponse.trim() || undefined,
      actionType: newActionType as any,
      actionPayload: buildPayload(newActionType, newActionValue),
      sortOrder: children.length,
      isActive: true,
    });
    setNewLabel(""); setNewBotResponse(""); setNewActionType("show_children"); setNewActionValue("");
  };

  return (
    <div className={`${depth > 0 ? "ml-5 border-l-2 border-white/10 pl-3" : ""}`}>
      {editing ? (
        <div className="mb-2">
          <NodeForm
            label={editLabel} setLabel={setEditLabel}
            botResponse={editBotResponse} setBotResponse={setEditBotResponse}
            actionType={editActionType} setActionType={setEditActionType}
            actionValue={editActionValue} setActionValue={setEditActionValue}
            onSave={handleSaveEdit}
            onCancel={() => setEditing(false)}
            saveLabel="Salvar Alterações"
          />
        </div>
      ) : (
        <div className={`flex items-start gap-2 mb-1 p-3 rounded-xl border transition-all ${node.isActive ? "bg-white/5 border-white/10" : "bg-black/20 border-white/5 opacity-50"}`}>
          {children.length > 0 && (
            <button onClick={() => setExpanded(!expanded)} className="mt-0.5 p-0.5 text-white/40 hover:text-white transition-colors flex-shrink-0">
              {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          )}
          {children.length === 0 && <div className="w-5 flex-shrink-0" />}
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm text-white">{node.label}</p>
            {node.botResponse && (
              <p className="text-xs text-white/50 mt-0.5 line-clamp-1">💬 {node.botResponse}</p>
            )}
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${colorClass}`}>{info.label}</span>
              {descValue && <span className="text-[11px] text-white/35 truncate max-w-[180px]">{descValue}</span>}
              {children.length > 0 && <span className="text-[11px] text-white/30">{children.length} sub-botão{children.length > 1 ? "s" : ""}</span>}
            </div>
          </div>
          <div className="flex gap-1 flex-shrink-0">
            <button onClick={() => { setEditing(true); setEditLabel(node.label); setEditBotResponse(node.botResponse || ""); setEditActionType(node.actionType); setEditActionValue(extractValue(node.actionType, node.actionPayload)); }} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-white/50 hover:text-white transition-colors" title="Editar">
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setShowAddChild(!showAddChild)} className="p-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/25 text-blue-400 hover:text-blue-300 transition-colors" title="Adicionar sub-botão">
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => { if (confirm(`Excluir "${node.label}" e todos os sub-botões?`)) deleteMut.mutate({ id: node.id }); }} className="p-1.5 rounded-lg bg-white/5 hover:bg-red-500/20 text-white/50 hover:text-red-400 transition-colors" title="Excluir">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {showAddChild && !editing && (
        <div className="ml-5 mb-2">
          <NodeForm
            label={newLabel} setLabel={setNewLabel}
            botResponse={newBotResponse} setBotResponse={setNewBotResponse}
            actionType={newActionType} setActionType={setNewActionType}
            actionValue={newActionValue} setActionValue={setNewActionValue}
            onSave={handleAddChild}
            onCancel={() => { setShowAddChild(false); setNewLabel(""); setNewBotResponse(""); setNewActionType("show_children"); setNewActionValue(""); }}
            saveLabel="Criar Sub-botão"
          />
        </div>
      )}

      {expanded && children.map(child => (
        <TreeNode key={child.id} node={child} depth={depth + 1} allNodes={allNodes} onRefresh={onRefresh} />
      ))}
    </div>
  );
}

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────────────────────
export default function AdminChatFlow() {
  const allNodesQ = trpc.chatFlow.adminListAll.useQuery();
  const saveMut = trpc.chatFlow.adminSave.useMutation({ onSuccess: () => { allNodesQ.refetch(); setShowNew(false); toast.success("Botão criado!"); } });

  const [showNew, setShowNew] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newBotResponse, setNewBotResponse] = useState("");
  const [newActionType, setNewActionType] = useState("show_children");
  const [newActionValue, setNewActionValue] = useState("");

  const allNodes = allNodesQ.data || [];
  const roots = allNodes.filter(n => !n.parentId).sort((a, b) => a.sortOrder - b.sortOrder);

  const handleSaveNew = () => {
    if (!newLabel.trim()) { toast.error("Nome do botão é obrigatório"); return; }
    saveMut.mutate({
      parentId: null,
      label: newLabel.trim(),
      botResponse: newBotResponse.trim() || undefined,
      actionType: newActionType as any,
      actionPayload: buildPayload(newActionType, newActionValue),
      sortOrder: roots.length,
      isActive: true,
    });
    setNewLabel(""); setNewBotResponse(""); setNewActionType("show_children"); setNewActionValue("");
  };

  return (
    <div className="min-h-screen bg-[#0b1222] text-white">
      <AdminHeader title="Fluxo de Botões" />
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <GitBranch className="w-6 h-6 text-blue-400" />
          <div>
            <h1 className="text-2xl font-black text-white">Fluxo de Botões</h1>
            <p className="text-sm text-white/50">Crie botões em árvore: cada botão pode ter resposta + sub-botões</p>
          </div>
          <button
            onClick={() => setShowNew(!showNew)}
            className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-colors"
          >
            <Plus className="w-4 h-4" />
            Novo Botão Raiz
          </button>
        </div>

        {/* Como funciona */}
        <div className="mb-4 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-200">
          <p className="font-bold mb-1">Como funciona:</p>
          <p>• <strong>Botão raiz</strong> = aparece no chat quando o cliente escreve algo</p>
          <p>• <strong>Sub-botão</strong> = aparece quando o cliente clica no botão pai</p>
          <p>• <strong>Ação "Mostrar sub-botões"</strong> = continua a árvore | <strong>Outras ações</strong> = finaliza o fluxo</p>
          <p>• Clique no <strong>+</strong> ao lado de qualquer botão para adicionar um sub-botão</p>
        </div>

        {showNew && (
          <div className="mb-4">
            <NodeForm
              label={newLabel} setLabel={setNewLabel}
              botResponse={newBotResponse} setBotResponse={setNewBotResponse}
              actionType={newActionType} setActionType={setNewActionType}
              actionValue={newActionValue} setActionValue={setNewActionValue}
              onSave={handleSaveNew}
              onCancel={() => { setShowNew(false); setNewLabel(""); setNewBotResponse(""); setNewActionType("show_children"); setNewActionValue(""); }}
              saveLabel="Criar Botão"
            />
          </div>
        )}

        {allNodesQ.isLoading && <p className="text-white/40 text-sm text-center py-8">Carregando...</p>}

        {roots.length === 0 && !allNodesQ.isLoading && (
          <div className="text-center py-12 text-white/30">
            <GitBranch className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm font-semibold">Nenhum botão criado ainda</p>
            <p className="text-xs mt-1">Clique em "Novo Botão Raiz" para começar</p>
          </div>
        )}

        <div className="space-y-2">
          {roots.map(node => (
            <TreeNode
              key={node.id}
              node={node}
              depth={0}
              allNodes={allNodes}
              onRefresh={() => allNodesQ.refetch()}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
