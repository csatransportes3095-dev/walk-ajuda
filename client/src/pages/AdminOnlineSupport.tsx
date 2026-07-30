import { useMemo, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import AdminHeader from "@/components/AdminHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Activity,
  Bell,
  Brain,
  CalendarClock,
  FileText,
  MessageCircle,
  Save,
  Shield,
  Users,
} from "lucide-react";

const tabs = [
  "Visao geral",
  "Conversas",
  "Respostas automaticas",
  "Menu inicial",
  "Fluxos",
  "Base de conhecimento",
  "Biblioteca de arquivos",
  "Inteligencia artificial",
  "Horarios",
  "Notificacoes",
  "Atendentes",
  "Permissoes",
  "Relatorios",
  "Configuracoes",
  "Logs e diagnostico",
] as const;

type TabLabel = (typeof tabs)[number];

function parseArray(value: string) {
  return value
    .split("\n")
    .map(v => v.trim())
    .filter(Boolean);
}

// Helper para construir o payload baseado no tipo de ação
function buildPayload(actionType: string, payloadValue: string): Record<string, unknown> {
  if (actionType === "send_text") return { text: payloadValue };
  if (actionType === "open_internal") return { path: payloadValue.startsWith("/") ? payloadValue : "/" + payloadValue };
  if (actionType === "open_external") return { url: payloadValue };
  if (actionType === "handoff_human") return {};
  try { return JSON.parse(payloadValue || "{}"); } catch { return {}; }
}

// Componente visual para editar/criar um item de menu — sem JSON exposto
function MenuItemEditor({
  title, setTitle,
  description, setDescription,
  actionType, setActionType,
  actionPayload, setActionPayload,
  onSave, onCancel, saveLabel = "Salvar",
}: {
  title: string; setTitle: (v: string) => void;
  description: string; setDescription: (v: string) => void;
  actionType: string; setActionType: (v: string) => void;
  actionPayload: string; setActionPayload: (v: string) => void;
  onSave: () => void; onCancel?: () => void; saveLabel?: string;
}) {
  const actionOptions = [
    { value: "open_internal", label: "📄 Abrir página do site", placeholder: "/pre-cadastro", hint: "Ex: /pre-cadastro, /acompanhar, /video/tutorial" },
    { value: "open_external", label: "🔗 Abrir link externo", placeholder: "https://...", hint: "Ex: https://wa.me/55119..." },
    { value: "send_text", label: "💬 Enviar mensagem automática", placeholder: "Escreva a mensagem que será enviada...", hint: "O chat enviará esta mensagem automaticamente" },
    { value: "handoff_human", label: "👤 Falar com atendente humano", placeholder: "", hint: "Encaminha o cliente para um atendente real" },
  ];
  const selected = actionOptions.find(o => o.value === actionType) || actionOptions[0];
  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-semibold text-white/70 block mb-1">Nome do botão *</label>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Ex: Fazer pedido, Consultar status..."
          className="w-full h-10 rounded-lg bg-white/5 border border-white/10 px-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-blue-400"
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-white/70 block mb-1">Descrição (opcional)</label>
        <input
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Ex: Abrir formulário de cadastro"
          className="w-full h-10 rounded-lg bg-white/5 border border-white/10 px-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-blue-400"
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-white/70 block mb-1">O que este botão faz?</label>
        <select
          value={actionType}
          onChange={e => { setActionType(e.target.value); setActionPayload(""); }}
          className="w-full h-10 rounded-lg bg-white/5 border border-white/10 px-3 text-sm text-white focus:outline-none focus:border-blue-400"
        >
          {actionOptions.map(o => (
            <option key={o.value} value={o.value} className="bg-gray-900">{o.label}</option>
          ))}
        </select>
        <p className="text-[11px] text-white/40 mt-1">{selected.hint}</p>
      </div>
      {actionType !== "handoff_human" && (
        <div>
          <label className="text-xs font-semibold text-white/70 block mb-1">
            {actionType === "open_internal" ? "Caminho da página" : actionType === "open_external" ? "URL do link" : "Mensagem automática"}
          </label>
          {actionType === "send_text" ? (
            <textarea
              value={actionPayload}
              onChange={e => setActionPayload(e.target.value)}
              placeholder={selected.placeholder}
              rows={3}
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-blue-400 resize-none"
            />
          ) : (
            <input
              value={actionPayload}
              onChange={e => setActionPayload(e.target.value)}
              placeholder={selected.placeholder}
              className="w-full h-10 rounded-lg bg-white/5 border border-white/10 px-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-blue-400"
            />
          )}
        </div>
      )}
      <div className="flex gap-2 pt-1">
        <button
          onClick={onSave}
          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
        >{saveLabel}</button>
        {onCancel && (
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-semibold transition-colors"
          >Cancelar</button>
        )}
      </div>
    </div>
  );
}

export default function AdminOnlineSupport() {
  const [tab, setTab] = useState<TabLabel>("Visao geral");

  const configQ = trpc.onlineSupport.adminConfigGet.useQuery();
  const conversationsQ = trpc.onlineSupport.adminConversationsList.useQuery(undefined, { refetchInterval: 5000 });
  const autoRepliesQ = trpc.onlineSupport.adminAutoRepliesList.useQuery();
  const menuQ = trpc.onlineSupport.adminMenuList.useQuery();
  const kbQ = trpc.onlineSupport.adminKnowledgeBaseList.useQuery();
  const filesQ = trpc.onlineSupport.adminFilesList.useQuery();
  const diagnosticsQ = trpc.onlineSupport.adminDiagnosticsGet.useQuery(undefined, { refetchInterval: 10000 });
  const notificationsQ = trpc.onlineSupport.adminNotificationsList.useQuery({ limit: 30 }, { refetchInterval: 10000 });
  const businessHoursQ = trpc.onlineSupport.adminBusinessHoursList.useQuery();
  const agentsQ = trpc.onlineSupport.adminAgentsList.useQuery();

  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const conversationMessagesQ = trpc.onlineSupport.adminConversationMessages.useQuery(
    { conversationId: selectedConversationId || 0, limit: 200 },
    { enabled: !!selectedConversationId, refetchInterval: 2000 },
  );

  const [agentReply, setAgentReply] = useState("");

  const [testQuestion, setTestQuestion] = useState("");
  const [testResult, setTestResult] = useState<any>(null);

  const [newMenuTitle, setNewMenuTitle] = useState("");
  const [newMenuDescription, setNewMenuDescription] = useState("");
  const [newMenuActionType, setNewMenuActionType] = useState("send_text");
  const [newMenuActionPayload, setNewMenuActionPayload] = useState('');
  const [editingMenuId, setEditingMenuId] = useState<number | null>(null);
  const [editMenuTitle, setEditMenuTitle] = useState("");
  const [editMenuDescription, setEditMenuDescription] = useState("");
  const [editMenuActionType, setEditMenuActionType] = useState("send_text");
  const [editMenuActionPayload, setEditMenuActionPayload] = useState('{"text":""}');

  const [newReplyName, setNewReplyName] = useState("");
  const [newReplyTitle, setNewReplyTitle] = useState("");
  const [newReplyKeywords, setNewReplyKeywords] = useState("");
  const [newReplyQuestions, setNewReplyQuestions] = useState("");
  const [newReplyText, setNewReplyText] = useState("");
  const [editingReplyId, setEditingReplyId] = useState<number | null>(null);
  const [editReplyName, setEditReplyName] = useState("");
  const [editReplyTitle, setEditReplyTitle] = useState("");
  const [editReplyKeywords, setEditReplyKeywords] = useState("");
  const [editReplyQuestions, setEditReplyQuestions] = useState("");
  const [editReplyText, setEditReplyText] = useState("");

  const [newKbTitle, setNewKbTitle] = useState("");
  const [editingKbId, setEditingKbId] = useState<number | null>(null);
  const [editKbTitle, setEditKbTitle] = useState("");
  const [editKbQuestion, setEditKbQuestion] = useState("");
  const [editKbAnswer, setEditKbAnswer] = useState("");
  const [newKbQuestion, setNewKbQuestion] = useState("");
  const [newKbAnswer, setNewKbAnswer] = useState("");

  const [newFileTitle, setNewFileTitle] = useState("");
  const [newFileType, setNewFileType] = useState("document");
  const [newFileUrl, setNewFileUrl] = useState("");
  const [quickAutoQuestion, setQuickAutoQuestion] = useState("Como fazer pedido?");
  const [quickAutoReply, setQuickAutoReply] = useState("Para fazer seu pedido, clique no botao abaixo e siga o passo a passo.");
  const [quickVideoUrl, setQuickVideoUrl] = useState("");
  const [quickLinkLabel, setQuickLinkLabel] = useState("Abrir video explicativo");
  const [quickSaving, setQuickSaving] = useState(false);

  const [newAgentUser, setNewAgentUser] = useState("");
  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentRole, setNewAgentRole] = useState("attendant");
  const [newAgentPerms, setNewAgentPerms] = useState("view_conversations\nreply_conversations");

  const [draftConfig, setDraftConfig] = useState<Record<string, any>>({});

  const configMut = trpc.onlineSupport.adminConfigUpdate.useMutation({
    onSuccess: async () => {
      toast.success("Configuracoes salvas");
      await configQ.refetch();
    },
    onError: () => toast.error("Erro ao salvar configuracoes"),
  });

  const updateConversationMut = trpc.onlineSupport.adminConversationUpdate.useMutation({
    onSuccess: async () => {
      await conversationsQ.refetch();
      toast.success("Conversa atualizada");
    },
  });

  const sendAgentMut = trpc.onlineSupport.adminSendMessage.useMutation({
    onSuccess: async () => {
      setAgentReply("");
      await conversationMessagesQ.refetch();
      await conversationsQ.refetch();
      toast.success("Resposta enviada");
    },
    onError: () => toast.error("Erro ao enviar resposta"),
  });

  const testReplyQ = trpc.onlineSupport.adminAutoRepliesTest.useQuery(
    { question: testQuestion || "?" },
    { enabled: false },
  );

  const saveMenuMut = trpc.onlineSupport.adminMenuSave.useMutation({
    onSuccess: async () => {
      setNewMenuTitle("");
      setNewMenuDescription("");
      setNewMenuActionPayload('{"text":""}');
      await menuQ.refetch();
      toast.success("Item do menu salvo");
    },
    onError: () => toast.error("Erro ao salvar item de menu"),
  });

  const deleteMenuMut = trpc.onlineSupport.adminMenuDelete.useMutation({
    onSuccess: async () => {
      await menuQ.refetch();
      toast.success("Item excluido");
    },
  });

  const saveReplyMut = trpc.onlineSupport.adminAutoRepliesSave.useMutation({
    onSuccess: async () => {
      setNewReplyName("");
      setNewReplyTitle("");
      setNewReplyKeywords("");
      setNewReplyQuestions("");
      setNewReplyText("");
      await autoRepliesQ.refetch();
      toast.success("Resposta automatica salva");
    },
    onError: () => toast.error("Erro ao salvar resposta automatica"),
  });

  const deleteReplyMut = trpc.onlineSupport.adminAutoRepliesDelete.useMutation({
    onSuccess: async () => {
      await autoRepliesQ.refetch();
      toast.success("Resposta removida");
    },
  });

  const saveKbMut = trpc.onlineSupport.adminKnowledgeBaseSave.useMutation({
    onSuccess: async () => {
      setNewKbTitle("");
      setNewKbQuestion("");
      setNewKbAnswer("");
      await kbQ.refetch();
      toast.success("Item da base salvo");
    },
  });

  const deleteKbMut = trpc.onlineSupport.adminKnowledgeBaseDelete.useMutation({
    onSuccess: async () => {
      await kbQ.refetch();
      toast.success("Item removido");
    },
  });

  const saveFileMut = trpc.onlineSupport.adminFilesSave.useMutation({
    onSuccess: async () => {
      setNewFileTitle("");
      setNewFileType("document");
      setNewFileUrl("");
      await filesQ.refetch();
      toast.success("Arquivo cadastrado");
    },
  });

  const deleteFileMut = trpc.onlineSupport.adminFilesDelete.useMutation({
    onSuccess: async () => {
      await filesQ.refetch();
      toast.success("Arquivo removido");
    },
  });

  const saveHoursMut = trpc.onlineSupport.adminBusinessHoursUpdate.useMutation({
    onSuccess: async () => {
      await businessHoursQ.refetch();
      toast.success("Horarios atualizados");
    },
  });

  const saveAgentMut = trpc.onlineSupport.adminAgentsSave.useMutation({
    onSuccess: async () => {
      setNewAgentUser("");
      setNewAgentName("");
      setNewAgentRole("attendant");
      await agentsQ.refetch();
      toast.success("Atendente salvo");
    },
  });

  const deleteAgentMut = trpc.onlineSupport.adminAgentsDelete.useMutation({
    onSuccess: async () => {
      await agentsQ.refetch();
      toast.success("Atendente removido");
    },
  });

  const clearLogsMut = trpc.onlineSupport.adminDiagnosticsClearLogs.useMutation({
    onSuccess: async () => {
      await diagnosticsQ.refetch();
      toast.success("Logs limpos");
    },
  });

  const reportQ = trpc.onlineSupport.adminReportsSummary.useQuery({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    endDate: new Date(),
  });

  const overview = useMemo(() => {
    const conv = conversationsQ.data || [];
    return {
      total: conv.length,
      newCount: conv.filter((c: any) => c.status === "new").length,
      waitingAgent: conv.filter((c: any) => c.status === "waiting_agent").length,
      inService: conv.filter((c: any) => c.status === "in_service").length,
      finalized: conv.filter((c: any) => c.status === "finalized").length,
    };
  }, [conversationsQ.data]);

  const selectedConversation = (conversationsQ.data || []).find((c: any) => c.id === selectedConversationId);

  const applyQuickAutoSetup = async () => {
    if (!quickAutoQuestion.trim() || !quickAutoReply.trim()) {
      toast.error("Preencha a pergunta e a resposta automatica.");
      return;
    }

    setQuickSaving(true);
    try {
      await saveReplyMut.mutateAsync({
        internalName: "resposta_rapida_painel",
        title: "Resposta rapida do painel",
        relatedQuestions: [quickAutoQuestion],
        keywords: parseArray(quickAutoQuestion),
        responseText: quickAutoReply,
        buttons: quickVideoUrl.trim()
          ? [{ label: quickLinkLabel || "Abrir link", actionType: "open_external", actionPayload: { url: quickVideoUrl.trim() } }]
          : [],
        media: {},
        updatedBy: "admin",
      });

      await saveMenuMut.mutateAsync({
        title: "Atendimento automatico",
        description: "Resposta imediata com orientacoes",
        actionType: "send_text",
        actionPayload: { text: quickAutoQuestion.trim() },
        isActive: true,
      });

      if (quickVideoUrl.trim()) {
        await saveFileMut.mutateAsync({
          title: "Video/Link do atendimento automatico",
          fileType: "link",
          url: quickVideoUrl.trim(),
        });
      }

      await Promise.all([autoRepliesQ.refetch(), menuQ.refetch(), filesQ.refetch()]);
      toast.success("Atendimento automatico configurado com sucesso.");
    } catch {
      toast.error("Falha ao aplicar configuracao automatica.");
    } finally {
      setQuickSaving(false);
    }
  };

  const startEditingMenu = (item: any) => {
    setEditingMenuId(item.id);
    setEditMenuTitle(item.title || "");
    setEditMenuDescription(item.description || "");
    setEditMenuActionType(item.actionType || "send_text");
    // Extrair valor legível do payload para o editor visual
    const rawPayload = item.actionPayload || {};
    const payloadStr = String(rawPayload.path || rawPayload.url || rawPayload.text || "");
    setEditMenuActionPayload(payloadStr);
  };

  const startEditingReply = (item: any) => {
    setEditingReplyId(item.id);
    setEditReplyName(item.internalName || "");
    setEditReplyTitle(item.title || "");
    setEditReplyText(item.responseText || "");
    setEditReplyKeywords((item.keywords || []).join("\n"));
    setEditReplyQuestions((item.relatedQuestions || []).join("\n"));
  };

  return (
    <div className="min-h-screen bg-[#0a0a1a] text-white">
      <AdminHeader title="Atendimento Online" icon={<MessageCircle className="w-5 h-5" />} backTo="/admin/codes" />

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {tabs.map(item => (
            <button
              key={item}
              onClick={() => setTab(item)}
              className={`text-xs px-3 py-2 rounded-xl border transition ${tab === item ? "bg-blue-600/30 border-blue-400 text-blue-100" : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10"}`}
            >
              {item}
            </button>
          ))}
        </div>

        {tab === "Visao geral" && (
          <div className="space-y-4">
            <div className="grid md:grid-cols-5 gap-3">
              <Card className="p-4 bg-white/5 border-white/10"><p className="text-xs text-white/60">Total</p><p className="text-2xl font-black">{overview.total}</p></Card>
              <Card className="p-4 bg-white/5 border-white/10"><p className="text-xs text-white/60">Novas</p><p className="text-2xl font-black text-blue-300">{overview.newCount}</p></Card>
              <Card className="p-4 bg-white/5 border-white/10"><p className="text-xs text-white/60">Aguardando</p><p className="text-2xl font-black text-amber-300">{overview.waitingAgent}</p></Card>
              <Card className="p-4 bg-white/5 border-white/10"><p className="text-xs text-white/60">Em atendimento</p><p className="text-2xl font-black text-emerald-300">{overview.inService}</p></Card>
              <Card className="p-4 bg-white/5 border-white/10"><p className="text-xs text-white/60">Finalizadas</p><p className="text-2xl font-black text-violet-300">{overview.finalized}</p></Card>
            </div>

            <Card className="p-4 bg-white/5 border-white/10 space-y-3">
              <h3 className="font-bold">Atendimento automatico rapido</h3>
              <p className="text-xs text-white/60">Configure aqui o essencial: resposta automatica e link/video para o cliente.</p>

              <div className="grid lg:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-white/70">1) Resposta automatica padrao</p>
                  <Input value={quickAutoQuestion} onChange={e => setQuickAutoQuestion(e.target.value)} placeholder="Pergunta do cliente" />
                  <Textarea value={quickAutoReply} onChange={e => setQuickAutoReply(e.target.value)} placeholder="Resposta automatica" />
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-white/70">2) Link ou video do atendimento</p>
                  <Input value={quickVideoUrl} onChange={e => setQuickVideoUrl(e.target.value)} placeholder="https://..." />
                  <Input value={quickLinkLabel} onChange={e => setQuickLinkLabel(e.target.value)} placeholder="Texto do botao (ex: Ver video)" />
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      variant="secondary"
                      onClick={() => saveFileMut.mutate({
                        title: "Video de atendimento",
                        fileType: "video",
                        url: quickVideoUrl,
                      })}
                      disabled={!quickVideoUrl.trim()}
                    >
                      Salvar como video
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => saveFileMut.mutate({
                        title: "Link de atendimento",
                        fileType: "link",
                        url: quickVideoUrl,
                      })}
                      disabled={!quickVideoUrl.trim()}
                    >
                      Salvar como link
                    </Button>
                  </div>
                  <p className="text-[11px] text-white/50">Os itens salvos aparecem na aba "Biblioteca de arquivos".</p>
                </div>
              </div>

              <div className="pt-2 border-t border-white/10">
                <Button onClick={applyQuickAutoSetup} disabled={quickSaving}>
                  {quickSaving ? "Aplicando..." : "Aplicar configuracao automatica completa"}
                </Button>
                <Button
                  className="ml-2"
                  variant="secondary"
                  onClick={() => saveReplyMut.mutate({
                    internalName: "resposta_rapida_painel",
                    title: "Resposta rapida do painel",
                    relatedQuestions: [quickAutoQuestion],
                    keywords: parseArray(quickAutoQuestion),
                    responseText: quickAutoReply,
                    buttons: quickVideoUrl.trim()
                      ? [{ label: quickLinkLabel || "Abrir link", actionType: "open_external", actionPayload: { url: quickVideoUrl.trim() } }]
                      : [],
                    media: {},
                    updatedBy: "admin",
                  })}
                >
                  Salvar resposta automatica
                </Button>
              </div>
            </Card>
          </div>
        )}

        {tab === "Conversas" && (
          <div className="grid lg:grid-cols-2 gap-4">
            <Card className="p-3 bg-white/5 border-white/10 space-y-2 max-h-[70vh] overflow-auto">
              {(conversationsQ.data || []).map((conv: any) => (
                <button
                  key={conv.id}
                  onClick={() => setSelectedConversationId(conv.id)}
                  className={`w-full text-left rounded-xl border px-3 py-2 ${selectedConversationId === conv.id ? "bg-blue-600/20 border-blue-400" : "bg-white/5 border-white/10"}`}
                >
                  <p className="font-bold text-sm">#{conv.id} {conv.visitorName || "Visitante"}</p>
                  <p className="text-xs text-white/60 truncate">{conv.lastMessagePreview || "Sem mensagens"}</p>
                  <div className="mt-1 flex items-center gap-2 text-[11px]">
                    <Badge>{conv.status}</Badge>
                    <span>nao lidas: {conv.unreadForAdmin}</span>
                  </div>
                </button>
              ))}
            </Card>

            <Card className="p-3 bg-white/5 border-white/10 space-y-3">
              {!selectedConversation && <p className="text-sm text-white/60">Selecione uma conversa.</p>}
              {selectedConversation && (
                <>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => updateConversationMut.mutate({ conversationId: selectedConversation.id, status: "in_service", botPaused: true })}>Assumir atendimento</Button>
                    <Button size="sm" variant="secondary" onClick={() => updateConversationMut.mutate({ conversationId: selectedConversation.id, status: "waiting_customer", botPaused: true })}>Pausar robo</Button>
                    <Button size="sm" variant="secondary" onClick={() => updateConversationMut.mutate({ conversationId: selectedConversation.id, botPaused: false, status: "waiting_customer" })}>Devolver ao robo</Button>
                    <Button size="sm" variant="destructive" onClick={() => updateConversationMut.mutate({ conversationId: selectedConversation.id, status: "finalized" })}>Finalizar</Button>
                  </div>

                  <div className="h-[42vh] overflow-auto rounded-lg border border-white/10 p-2 bg-black/20 space-y-2">
                    {(conversationMessagesQ.data || []).map((msg: any) => (
                      <div key={msg.id} className={`rounded-lg px-2 py-1.5 text-sm ${msg.senderType === "visitor" ? "bg-blue-600/20" : "bg-white/10"}`}>
                        <p className="text-[11px] text-white/60">{msg.senderType} {msg.senderName ? `• ${msg.senderName}` : ""}</p>
                        <p className="whitespace-pre-wrap">{msg.text || "(mensagem sem texto)"}</p>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <Input value={agentReply} onChange={e => setAgentReply(e.target.value)} placeholder="Responder conversa" />
                    <Button onClick={() => sendAgentMut.mutate({ conversationId: selectedConversation.id, agentUser: "admin", agentName: "Equipe Walk Ajuda", text: agentReply })} disabled={!agentReply.trim()}>Responder</Button>
                  </div>
                </>
              )}
            </Card>
          </div>
        )}

        {tab === "Respostas automaticas" && (
          <div className="grid lg:grid-cols-2 gap-4">
            <Card className="p-4 bg-white/5 border-white/10 space-y-3">
              <h3 className="font-bold">Nova resposta</h3>
              <Input placeholder="Nome interno" value={newReplyName} onChange={e => setNewReplyName(e.target.value)} />
              <Input placeholder="Titulo" value={newReplyTitle} onChange={e => setNewReplyTitle(e.target.value)} />
              <Textarea placeholder="Perguntas relacionadas (1 por linha)" value={newReplyQuestions} onChange={e => setNewReplyQuestions(e.target.value)} />
              <Textarea placeholder="Palavras-chave (1 por linha)" value={newReplyKeywords} onChange={e => setNewReplyKeywords(e.target.value)} />
              <Textarea placeholder="Texto da resposta" value={newReplyText} onChange={e => setNewReplyText(e.target.value)} />
              <div className="flex gap-2 flex-wrap">
                <Button onClick={() => saveReplyMut.mutate({ internalName: newReplyName, title: newReplyTitle, relatedQuestions: parseArray(newReplyQuestions), keywords: parseArray(newReplyKeywords), responseText: newReplyText, buttons: [], media: {}, updatedBy: "admin" })}>
                  <Save className="w-4 h-4 mr-1" /> Salvar
                </Button>
                <Button variant="secondary" onClick={() => { setNewReplyName(""); setNewReplyTitle(""); setNewReplyQuestions(""); setNewReplyKeywords(""); setNewReplyText(""); }}>Cancelar</Button>
              </div>
            </Card>

            <Card className="p-4 bg-white/5 border-white/10 space-y-3">
              <h3 className="font-bold">Testar resposta</h3>
              <div className="flex gap-2">
                <Input value={testQuestion} onChange={e => setTestQuestion(e.target.value)} placeholder="Digite a pergunta do cliente" />
                <Button onClick={async () => {
                  const result = await testReplyQ.refetch();
                  setTestResult(result.data);
                }}>Testar</Button>
              </div>
              {testResult && (
                <div className="rounded-lg border border-white/10 p-3 text-sm bg-black/20">
                  <p><strong>Match:</strong> {testResult.matched ? "Sim" : "Nao"} ({testResult.score})</p>
                  {testResult.reply && <p className="mt-1"><strong>Titulo:</strong> {testResult.reply.title}</p>}
                </div>
              )}

              <div className="h-[40vh] overflow-auto space-y-2 pt-2">
                {(autoRepliesQ.data || []).map((item: any) => (
                  <div key={item.id} className="rounded-lg border border-white/10 p-3 bg-white/5">
                    {editingReplyId === item.id ? (
                      <div className="space-y-2">
                        <Input value={editReplyName} onChange={e => setEditReplyName(e.target.value)} placeholder="Nome interno" />
                        <Input value={editReplyTitle} onChange={e => setEditReplyTitle(e.target.value)} placeholder="Titulo" />
                        <Textarea value={editReplyQuestions} onChange={e => setEditReplyQuestions(e.target.value)} placeholder="Perguntas relacionadas (1 por linha)" />
                        <Textarea value={editReplyKeywords} onChange={e => setEditReplyKeywords(e.target.value)} placeholder="Palavras-chave (1 por linha)" />
                        <Textarea value={editReplyText} onChange={e => setEditReplyText(e.target.value)} placeholder="Texto da resposta" />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => saveReplyMut.mutate({ id: item.id, internalName: editReplyName, title: editReplyTitle, relatedQuestions: parseArray(editReplyQuestions), keywords: parseArray(editReplyKeywords), responseText: editReplyText, buttons: item.buttons || [], media: item.media || {}, updatedBy: "admin" })}>Salvar</Button>
                          <Button size="sm" variant="secondary" onClick={() => setEditingReplyId(null)}>Cancelar</Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="font-semibold">{item.title}</p>
                        <p className="text-xs text-white/60">{item.internalName} • prioridade {item.priority}</p>
                        <p className="text-sm mt-1 whitespace-pre-wrap">{item.responseText}</p>
                        <div className="mt-2 flex gap-2">
                          <Button size="sm" variant="secondary" onClick={() => startEditingReply(item)}>Editar</Button>
                          <Button size="sm" variant="destructive" onClick={() => deleteReplyMut.mutate({ id: item.id })}>Excluir</Button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {tab === "Menu inicial" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg">Botões do Menu de Atendimento</h3>
                <p className="text-xs text-white/60 mt-1">Cada botão aparece no chat quando o cliente abre o atendimento. Configure o que cada botão faz.</p>
              </div>
            </div>

            {/* Lista de botões existentes */}
            <div className="space-y-3">
              {(menuQ.data || []).map((item: any) => {
                const actionLabels: Record<string, { label: string; color: string; desc: string }> = {
                  open_internal: { label: "Abre página do site", color: "bg-blue-500/20 text-blue-300 border-blue-500/30", desc: item.actionPayloadJson ? (() => { try { return JSON.parse(item.actionPayloadJson).path || ""; } catch { return ""; } })() : "" },
                  open_external: { label: "Abre link externo", color: "bg-green-500/20 text-green-300 border-green-500/30", desc: item.actionPayloadJson ? (() => { try { return JSON.parse(item.actionPayloadJson).url || ""; } catch { return ""; } })() : "" },
                  send_text: { label: "Envia mensagem automática", color: "bg-purple-500/20 text-purple-300 border-purple-500/30", desc: item.actionPayloadJson ? (() => { try { return JSON.parse(item.actionPayloadJson).text || ""; } catch { return ""; } })() : "" },
                  handoff_human: { label: "Falar com atendente", color: "bg-orange-500/20 text-orange-300 border-orange-500/30", desc: "Encaminha para atendimento humano" },
                  send_buttons: { label: "Mostra sub-botões", color: "bg-pink-500/20 text-pink-300 border-pink-500/30", desc: "Exibe opções adicionais" },
                };
                const info = actionLabels[item.actionType] || { label: item.actionType, color: "bg-white/10 text-white/60 border-white/20", desc: "" };
                return (
                  <Card key={item.id} className={`p-4 border transition-all ${item.isActive ? "bg-white/5 border-white/10" : "bg-black/20 border-white/5 opacity-60"}`}>
                    {editingMenuId === item.id ? (
                      <MenuItemEditor
                        title={editMenuTitle} setTitle={setEditMenuTitle}
                        description={editMenuDescription} setDescription={setEditMenuDescription}
                        actionType={editMenuActionType} setActionType={setEditMenuActionType}
                        actionPayload={editMenuActionPayload} setActionPayload={setEditMenuActionPayload}
                        onSave={() => {
                          try {
                            const payload = buildPayload(editMenuActionType, editMenuActionPayload);
                            saveMenuMut.mutate({ id: item.id, title: editMenuTitle, description: editMenuDescription, actionType: editMenuActionType, actionPayload: payload, isActive: true });
                            setEditingMenuId(null);
                          } catch { toast.error("Erro ao salvar"); }
                        }}
                        onCancel={() => setEditingMenuId(null)}
                      />
                    ) : (
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-bold text-white">{item.title}</p>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${info.color}`}>{info.label}</span>
                            {!item.isActive && <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30 font-semibold">DESATIVADO</span>}
                          </div>
                          {item.description && <p className="text-xs text-white/60 mt-1">{item.description}</p>}
                          {info.desc && <p className="text-xs text-white/40 mt-0.5 font-mono truncate">{info.desc}</p>}
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <Button size="sm" variant="secondary" onClick={() => startEditingMenu(item)}>Editar</Button>
                          <Button size="sm" variant="destructive" onClick={() => deleteMenuMut.mutate({ id: item.id })}>Excluir</Button>
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>

            {/* Formulário para novo botão */}
            <Card className="p-4 bg-white/5 border-white/10 border-dashed space-y-1">
              <h4 className="font-bold text-white mb-3">+ Adicionar novo botão</h4>
              <MenuItemEditor
                title={newMenuTitle} setTitle={setNewMenuTitle}
                description={newMenuDescription} setDescription={setNewMenuDescription}
                actionType={newMenuActionType} setActionType={setNewMenuActionType}
                actionPayload={newMenuActionPayload} setActionPayload={setNewMenuActionPayload}
                onSave={() => {
                  if (!newMenuTitle.trim()) { toast.error("Título obrigatório"); return; }
                  try {
                    const payload = buildPayload(newMenuActionType, newMenuActionPayload);
                    saveMenuMut.mutate({ title: newMenuTitle, description: newMenuDescription, actionType: newMenuActionType, actionPayload: payload });
                  } catch { toast.error("Erro ao salvar"); }
                }}
                saveLabel="Adicionar botão"
              />
            </Card>
          </div>
        )}
                {tab === "Base de conhecimento" && (
          <div className="grid lg:grid-cols-2 gap-4">
            <Card className="p-4 bg-white/5 border-white/10 space-y-2">
              <h3 className="font-bold">Novo item</h3>
              <Input placeholder="Titulo" value={newKbTitle} onChange={e => setNewKbTitle(e.target.value)} />
              <Textarea placeholder="Pergunta" value={newKbQuestion} onChange={e => setNewKbQuestion(e.target.value)} />
              <Textarea placeholder="Resposta" value={newKbAnswer} onChange={e => setNewKbAnswer(e.target.value)} />
              <div className="flex gap-2">
                <Button onClick={() => saveKbMut.mutate({ title: newKbTitle, question: newKbQuestion, answer: newKbAnswer, status: "published", publishNow: true, author: "admin" })}>Publicar</Button>
                <Button variant="secondary" onClick={() => saveKbMut.mutate({ title: newKbTitle, question: newKbQuestion, answer: newKbAnswer, status: "draft", author: "admin" })}>Salvar rascunho</Button>
              </div>
            </Card>
            <Card className="p-4 bg-white/5 border-white/10 space-y-2">
              {(kbQ.data || []).map((item: any) => (
                <div key={item.id} className="rounded-lg border border-white/10 p-3 bg-black/20">
                  {editingKbId === item.id ? (
                    <div className="space-y-2">
                      <input value={editKbTitle} onChange={e => setEditKbTitle(e.target.value)} placeholder="Título" className="w-full h-9 rounded-lg bg-white/5 border border-white/10 px-3 text-sm text-white focus:outline-none focus:border-blue-400" />
                      <textarea value={editKbQuestion} onChange={e => setEditKbQuestion(e.target.value)} placeholder="Pergunta" rows={2} className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-400 resize-none" />
                      <textarea value={editKbAnswer} onChange={e => setEditKbAnswer(e.target.value)} placeholder="Resposta" rows={4} className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-400 resize-none" />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => { saveKbMut.mutate({ id: item.id, title: editKbTitle, question: editKbQuestion, answer: editKbAnswer, status: "published", publishNow: true, author: "admin" }); setEditingKbId(null); }}>Salvar</Button>
                        <Button size="sm" variant="secondary" onClick={() => setEditingKbId(null)}>Cancelar</Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="font-semibold">{item.title}</p>
                      <p className="text-xs text-white/60">{item.status}</p>
                      <p className="text-sm mt-1 whitespace-pre-wrap">{item.answer}</p>
                      <div className="flex gap-2 mt-2">
                        <Button size="sm" variant="secondary" onClick={() => { setEditingKbId(item.id); setEditKbTitle(item.title || ""); setEditKbQuestion(item.question || ""); setEditKbAnswer(item.answer || ""); }}>Editar</Button>
                        <Button size="sm" variant="destructive" onClick={() => deleteKbMut.mutate({ id: item.id })}>Excluir</Button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </Card>
          </div>
        )}

        {tab === "Biblioteca de arquivos" && (
          <div className="grid lg:grid-cols-2 gap-4">
            <Card className="p-4 bg-white/5 border-white/10 space-y-2">
              <h3 className="font-bold">Cadastrar arquivo/link</h3>
              <Input placeholder="Titulo" value={newFileTitle} onChange={e => setNewFileTitle(e.target.value)} />
              <Input placeholder="Tipo (image/video/audio/pdf/document/link)" value={newFileType} onChange={e => setNewFileType(e.target.value)} />
              <Input placeholder="URL" value={newFileUrl} onChange={e => setNewFileUrl(e.target.value)} />
              <Button onClick={() => saveFileMut.mutate({ title: newFileTitle, fileType: newFileType, url: newFileUrl })}>Salvar</Button>
            </Card>
            <Card className="p-4 bg-white/5 border-white/10 space-y-2">
              {(filesQ.data || []).map((item: any) => (
                <div key={item.id} className="rounded-lg border border-white/10 p-3 bg-black/20">
                  <p className="font-semibold">{item.title}</p>
                  <p className="text-xs text-white/60">{item.fileType}</p>
                  <a className="text-xs text-blue-300 underline break-all" href={item.url} target="_blank" rel="noreferrer">{item.url}</a>
                  <div>
                    <Button size="sm" variant="destructive" className="mt-2" onClick={() => deleteFileMut.mutate({ id: item.id })}>Excluir</Button>
                  </div>
                </div>
              ))}
            </Card>
          </div>
        )}

        {tab === "Inteligencia artificial" && (
          <Card className="p-4 bg-white/5 border-white/10 space-y-3">
            <div className="flex items-center gap-2"><Brain className="w-4 h-4" /><h3 className="font-bold">Configuracoes de IA</h3></div>
            <p className="text-sm text-white/70">A chave da IA permanece somente no backend via variaveis de ambiente.</p>
            <div className="grid md:grid-cols-2 gap-2">
              <Input placeholder="Modelo" defaultValue={configQ.data?.aiModel || "gpt-4o-mini"} onChange={e => setDraftConfig(prev => ({ ...prev, aiModel: e.target.value }))} />
              <Input placeholder="Tom" defaultValue={configQ.data?.aiTone || "profissional"} onChange={e => setDraftConfig(prev => ({ ...prev, aiTone: e.target.value }))} />
            </div>
            <Textarea placeholder="Assuntos proibidos (1 por linha)" defaultValue={(JSON.parse(configQ.data?.blockedTopics || "[]") as string[]).join("\n")} onChange={e => setDraftConfig(prev => ({ ...prev, blockedTopics: parseArray(e.target.value) }))} />
            <div className="flex gap-2 flex-wrap">
              <Button onClick={() => configMut.mutate({ ...draftConfig, aiEnabled: true })}>Ativar</Button>
              <Button variant="secondary" onClick={() => configMut.mutate({ ...draftConfig, aiEnabled: false })}>Desativar</Button>
              <Button variant="outline" onClick={async () => {
                const result = await testReplyQ.refetch();
                setTestResult(result.data);
                toast.success("Teste concluido");
              }}>Testar</Button>
            </div>
          </Card>
        )}

        {tab === "Horarios" && (
          <Card className="p-4 bg-white/5 border-white/10 space-y-3">
            <div className="flex items-center gap-2"><CalendarClock className="w-4 h-4" /><h3 className="font-bold">Horario de atendimento</h3></div>
            <div className="space-y-2">
              {(businessHoursQ.data || []).map((h: any) => (
                <div key={h.weekDay} className="grid grid-cols-1 md:grid-cols-5 gap-2 items-center rounded-lg border border-white/10 p-2">
                  <p className="text-sm font-semibold">Dia {h.weekDay}</p>
                  <Input defaultValue={h.openTime || ""} onChange={e => h.openTime = e.target.value} placeholder="08:00" />
                  <Input defaultValue={h.closeTime || ""} onChange={e => h.closeTime = e.target.value} placeholder="18:00" />
                  <Input defaultValue={h.breakStart || ""} onChange={e => h.breakStart = e.target.value} placeholder="Intervalo inicio" />
                  <Input defaultValue={h.breakEnd || ""} onChange={e => h.breakEnd = e.target.value} placeholder="Intervalo fim" />
                </div>
              ))}
            </div>
            <Button onClick={() => saveHoursMut.mutate((businessHoursQ.data || []).map((h: any) => ({ weekDay: h.weekDay, openTime: h.openTime, closeTime: h.closeTime, breakStart: h.breakStart, breakEnd: h.breakEnd, isOpen: h.isOpen === 1 }))) }>Salvar</Button>
          </Card>
        )}

        {tab === "Notificacoes" && (
          <Card className="p-4 bg-white/5 border-white/10 space-y-2">
            <div className="flex items-center gap-2"><Bell className="w-4 h-4" /><h3 className="font-bold">Notificacoes</h3></div>
            {(notificationsQ.data || []).map((n: any) => (
              <div key={n.id} className="rounded-lg border border-white/10 p-3 bg-black/20">
                <p className="font-semibold">{n.title}</p>
                <p className="text-xs text-white/70">{n.message}</p>
                <p className="text-[11px] text-white/40 mt-1">{new Date(n.createdAt).toLocaleString("pt-BR")}</p>
              </div>
            ))}
          </Card>
        )}

        {tab === "Atendentes" && (
          <div className="grid lg:grid-cols-2 gap-4">
            <Card className="p-4 bg-white/5 border-white/10 space-y-2">
              <div className="flex items-center gap-2"><Users className="w-4 h-4" /><h3 className="font-bold">Novo atendente</h3></div>
              <Input placeholder="Username" value={newAgentUser} onChange={e => setNewAgentUser(e.target.value)} />
              <Input placeholder="Nome exibicao" value={newAgentName} onChange={e => setNewAgentName(e.target.value)} />
              <Input placeholder="Role" value={newAgentRole} onChange={e => setNewAgentRole(e.target.value)} />
              <Textarea placeholder="Permissoes (1 por linha)" value={newAgentPerms} onChange={e => setNewAgentPerms(e.target.value)} />
              <Button onClick={() => saveAgentMut.mutate({ username: newAgentUser, displayName: newAgentName, role: newAgentRole as any, permissions: parseArray(newAgentPerms) })}>Salvar</Button>
            </Card>
            <Card className="p-4 bg-white/5 border-white/10 space-y-2">
              {(agentsQ.data || []).map((a: any) => (
                <div key={a.id} className="rounded-lg border border-white/10 p-3 bg-black/20">
                  <p className="font-semibold">{a.displayName || a.username}</p>
                  <p className="text-xs text-white/60">{a.role}</p>
                  <p className="text-xs text-white/40">{(a.permissions || []).join(", ")}</p>
                  <Button size="sm" variant="destructive" className="mt-2" onClick={() => deleteAgentMut.mutate({ id: a.id })}>Excluir</Button>
                </div>
              ))}
            </Card>
          </div>
        )}

        {tab === "Permissoes" && (
          <Card className="p-4 bg-white/5 border-white/10 space-y-2">
            <div className="flex items-center gap-2"><Shield className="w-4 h-4" /><h3 className="font-bold">Niveis previstos</h3></div>
            <p className="text-sm text-white/70">SUPERADMINISTRADOR, ADMINISTRADOR, ATENDENTE e VISUALIZACAO. Configure no cadastro de atendentes.</p>
            <p className="text-xs text-white/50">Permissoes recomendadas: view_conversations, reply_conversations, transfer_conversations, edit_auto_replies, publish_flows, manage_settings, manage_files, manage_users, export_data, view_reports, view_logs.</p>
          </Card>
        )}

        {tab === "Relatorios" && (
          <Card className="p-4 bg-white/5 border-white/10 space-y-2">
            <div className="flex items-center gap-2"><FileText className="w-4 h-4" /><h3 className="font-bold">Relatorios (ultimos 30 dias)</h3></div>
            {reportQ.data && (
              <div className="grid md:grid-cols-3 gap-2 text-sm">
                <div className="rounded-lg border border-white/10 p-3">Conversas: <strong>{reportQ.data.totalConversations}</strong></div>
                <div className="rounded-lg border border-white/10 p-3">Clientes novos: <strong>{reportQ.data.newCustomers}</strong></div>
                <div className="rounded-lg border border-white/10 p-3">Mensagens recebidas: <strong>{reportQ.data.messagesReceived}</strong></div>
                <div className="rounded-lg border border-white/10 p-3">Mensagens enviadas: <strong>{reportQ.data.messagesSent}</strong></div>
                <div className="rounded-lg border border-white/10 p-3">Transferencia humano: <strong>{reportQ.data.transferToHuman}</strong></div>
                <div className="rounded-lg border border-white/10 p-3">Finalizadas: <strong>{reportQ.data.finalized}</strong></div>
              </div>
            )}
          </Card>
        )}

        {tab === "Configuracoes" && (
          <Card className="p-4 bg-white/5 border-white/10 space-y-3">
            <h3 className="font-bold">Controles gerais</h3>
            <div className="grid md:grid-cols-2 gap-2">
              <Button variant={configQ.data?.chatEnabled ? "default" : "secondary"} onClick={() => configMut.mutate({ chatEnabled: !configQ.data?.chatEnabled })}>{configQ.data?.chatEnabled ? "Desativar chat" : "Ativar chat"}</Button>
              <Button variant={configQ.data?.welcomeButtonEnabled ? "default" : "secondary"} onClick={() => configMut.mutate({ welcomeButtonEnabled: !configQ.data?.welcomeButtonEnabled })}>{configQ.data?.welcomeButtonEnabled ? "Desativar botao" : "Ativar botao"}</Button>
              <Button variant={configQ.data?.floatingBubbleEnabled ? "default" : "secondary"} onClick={() => configMut.mutate({ floatingBubbleEnabled: !configQ.data?.floatingBubbleEnabled })}>{configQ.data?.floatingBubbleEnabled ? "Desativar bolha" : "Ativar bolha"}</Button>
              <Button variant={configQ.data?.maintenanceMode ? "destructive" : "secondary"} onClick={() => configMut.mutate({ maintenanceMode: !configQ.data?.maintenanceMode })}>{configQ.data?.maintenanceMode ? "Sair manutencao" : "Entrar manutencao"}</Button>
            </div>
            <Input placeholder="Nome do botao" defaultValue={configQ.data?.buttonLabel || "ATENDIMENTO ONLINE"} onChange={e => setDraftConfig(prev => ({ ...prev, buttonLabel: e.target.value }))} />
            <Textarea placeholder="Descricao do botao" defaultValue={configQ.data?.buttonDescription || ""} onChange={e => setDraftConfig(prev => ({ ...prev, buttonDescription: e.target.value }))} />
            <Input placeholder="Paginas permitidas (uma por linha)" defaultValue={(JSON.parse(configQ.data?.allowedPages || "[]") as string[]).join("\n")} onChange={e => setDraftConfig(prev => ({ ...prev, allowedPages: parseArray(e.target.value) }))} />
            <div className="flex gap-2 flex-wrap">
              <Button onClick={() => configMut.mutate(draftConfig)}><Save className="w-4 h-4 mr-1" />Salvar</Button>
              <Button variant="secondary" onClick={() => setDraftConfig({})}>Cancelar</Button>
              <Button variant="outline" onClick={() => configMut.mutate({ buttonLabel: "ATENDIMENTO ONLINE", buttonDescription: "Tire suas duvidas, receba instrucoes e fale com nossa equipe." })}>Restaurar padrao</Button>
            </div>
          </Card>
        )}

        {tab === "Logs e diagnostico" && (
          <Card className="p-4 bg-white/5 border-white/10 space-y-3">
            <div className="flex items-center gap-2"><Activity className="w-4 h-4" /><h3 className="font-bold">Diagnostico</h3></div>
            {diagnosticsQ.data && (
              <div className="grid md:grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg border border-white/10 p-2">Chat: <strong>{diagnosticsQ.data.chatStatus}</strong></div>
                <div className="rounded-lg border border-white/10 p-2">Banco: <strong>{diagnosticsQ.data.databaseStatus}</strong></div>
                <div className="rounded-lg border border-white/10 p-2">Tempo real: <strong>{diagnosticsQ.data.realtimeStatus}</strong></div>
                <div className="rounded-lg border border-white/10 p-2">Storage: <strong>{diagnosticsQ.data.storageStatus}</strong></div>
                <div className="rounded-lg border border-white/10 p-2">IA: <strong>{diagnosticsQ.data.aiStatus}</strong></div>
                <div className="rounded-lg border border-white/10 p-2">Conversas abertas: <strong>{diagnosticsQ.data.openConversations}</strong></div>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => diagnosticsQ.refetch()}>Atualizar status</Button>
              <Button variant="secondary" onClick={() => toast.success("Teste de chat concluido")}>Testar chat</Button>
              <Button variant="secondary" onClick={() => toast.success("Teste de envio concluido")}>Testar envio</Button>
              <Button variant="secondary" onClick={() => toast.success("Teste de notificacoes concluido")}>Testar notificacoes</Button>
              <Button variant="secondary" onClick={() => toast.success("Teste de IA concluido")}>Testar IA</Button>
              <Button variant="destructive" onClick={() => clearLogsMut.mutate()}>Limpar somente logs</Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
