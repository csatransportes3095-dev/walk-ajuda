import { useState } from "react";
import { trpc } from "@/lib/trpc";
import AdminHeader from "@/components/AdminHeader";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock,
  ExternalLink,
  Image,
  Mic,
  Power,
  RefreshCw,
  Save,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";
import H2AutoHistoryPanel from "@/components/H2AutoHistoryPanel";
import H2AutoValidationBlocks from "@/components/H2AutoValidationBlocks";
import H2AutoSilencedContacts from "@/components/H2AutoSilencedContacts";
import H2AutoTreeEditor from "@/components/H2AutoTreeEditor";
import { H2_AUTO_CONFIRMATION_DEFAULTS as confirmationDefaults, H2_AUTO_CONFIRMATION_GROUPS as confirmationGroups } from "@shared/h2AutoConfirmation";

const Box = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-2xl border border-cyan-500/30 bg-slate-900/90 p-5 space-y-3">
    {children}
  </div>
);

const mediaDefaults = {
  enabled: false,
  transcribeAudio: false,
  audioFallback:
    "🎤 Recebemos seu áudio. Por favor, envie sua dúvida por escrito ou digite 6 para falar com um atendente.",
  photoReply:
    "📸 Recebemos sua foto. Descreva sua dúvida por escrito ou digite 6.",
  videoReply:
    "🎥 Recebemos seu vídeo. Descreva sua dúvida por escrito ou digite 6.",
  documentReply:
    "📄 Recebemos seu documento. Descreva sua solicitação por escrito ou digite 6.",
  stickerReply: "📎 Recebemos sua mídia. Digite MENU para escolher uma opção.",
  unknownReply: "📎 Recebemos sua mídia. Escreva sua dúvida ou digite MENU.",
  cooldownSeconds: 120,
  maxAudioSeconds: 30,
};

const statusLabels: Record<string, string> = {
  NOT_CHECKED: "Ainda não verificado",
  NOT_CONFIGURED: "Mídia/transcrição não configurada",
  UNSUPPORTED_ANDROID: "Android não compatível",
  PERMISSION_REQUIRED: "Permissão de microfone necessária",
  AUDIO_SOURCE_MISSING: "Fonte/URI de áudio indisponível",
  AUDIO_ACCESS_FAILED: "Falha ao acessar o áudio",
  AUDIO_FORMAT_UNSUPPORTED: "Formato de áudio não suportado",
  AUDIO_TOO_LONG: "Áudio acima do limite",
  RECOGNIZER_BUSY: "Reconhecedor ocupado",
  LOCAL_RECOGNIZER_UNAVAILABLE: "Reconhecedor local indisponível",
  LANGUAGE_MODEL_UNAVAILABLE: "Modelo de idioma indisponível",
  INPUT_UNSUPPORTED: "Entrada não suportada",
  TRANSCRIBING: "Transcrevendo",
  TRANSCRIBED: "Transcrito",
  TRANSCRIBED_NO_RULE: "Transcrito sem regra correspondente",
  TRANSCRIPTION_ERROR: "Erro de transcrição",
  TRANSCRIPTION_TIMEOUT: "Tempo de transcrição esgotado",
  EMPTY_TRANSCRIPT: "Transcrição vazia",
  COOLDOWN: "Aguardando intervalo da conversa",
  NO_REPLY_ACTION: "Nenhuma ação de resposta",
  MEDIA_DETECTED: "Mídia detectada",
  CONFIGURATION_DISABLED: "Configuração desabilitada",
  STALE_MESSAGE: "Mensagem antiga ignorada",
};
const replyLabels: Record<string, string> = {
  NOT_CHECKED: "Ainda não verificado",
  FALLBACK_SENT: "Fallback enviado",
  RULE_SENT: "Resposta de regra enviada",
  MEDIA_SENT: "Resposta de mídia enviada",
  NO_REPLY_ACTION: "WhatsApp não disponibilizou Responder",
  SEND_FAILED: "Falha ao enviar resposta",
  SKIPPED: "Ignorado",
};
const field =
  "w-full rounded-xl border border-cyan-500/30 bg-slate-950 px-3 py-2 text-white";
const dateLabel = (value: number | null | undefined) =>
  value == null || value <= 0 ? "Ainda não verificado" : new Date(value).toLocaleString("pt-BR");
const isStale = (value: number | null | undefined) =>
  value != null && Date.now() - value > 24 * 60 * 60 * 1000;

export default function AdminH2Auto() {
  const utils = trpc.useUtils();
  const { data = [], isLoading } = trpc.h2AutoAdmin.list.useQuery(undefined, {
    refetchInterval: 15000,
  });
  const [label, setLabel] = useState("Celular principal");
  const [pair, setPair] = useState<{ id: string; code: string } | null>(null);
  const [editing, setEditing] = useState<
    Record<string, { config: any; revision: number }>
  >({});
  const [conflicts, setConflicts] = useState<Record<string, boolean>>({});
  const clearDraft = (id: string) =>
    setEditing(previous => {
      const next = { ...previous };
      delete next[id];
      return next;
    });
  const refreshDevice = (id: string) => {
    clearDraft(id);
    setConflicts(previous => ({ ...previous, [id]: false }));
    void utils.h2AutoAdmin.list.invalidate();
  };
  const create = trpc.h2AutoAdmin.create.useMutation({
    onSuccess: x => {
      setPair({ id: x.id, code: x.code });
      void utils.h2AutoAdmin.list.invalidate();
    },
    onError: () => toast.error("Falha ao criar aparelho"),
  });
  const pairCode = trpc.h2AutoAdmin.pairCode.useMutation({
    onSuccess: (x, variables) => setPair({ id: variables.id, code: x.code }),
    onError: () => toast.error("Falha ao gerar código"),
  });
  const save = trpc.h2AutoAdmin.save.useMutation({
    onSuccess: (_result, variables) => {
      clearDraft(variables.id);
      setConflicts(previous => ({ ...previous, [variables.id]: false }));
      toast.success(
        "Configuração geral salva; aguardando sincronização do celular"
      );
      void utils.h2AutoAdmin.list.invalidate();
    },
    onError: (error, variables) => {
      if (error.data?.code === "CONFLICT")
        setConflicts(previous => ({ ...previous, [variables.id]: true }));
      toast.error(error.message || "Falha ao salvar");
    },
  });
  const saveReplyRules = trpc.h2AutoAdmin.saveReplyRules.useMutation({
    onSuccess: (result, variables) => {
      setEditing(previous => {
        const draft = previous[variables.id];
        if (!draft || draft.revision !== variables.expectedRevision) return previous;
        return { ...previous, [variables.id]: { ...draft, revision: result.revision } };
      });
      setConflicts(previous => ({ ...previous, [variables.id]: false }));
      toast.success("Respostas antigas preservadas e salvas. Aguardando sincronização do aparelho.");
      void utils.h2AutoAdmin.list.invalidate();
    },
    onError: (error, variables) => {
      if (error.data?.code === "CONFLICT") setConflicts(previous => ({ ...previous, [variables.id]: true }));
      toast.error(error.message || "Não foi possível salvar as respostas.");
    },
  });
  const saveConfirmation = trpc.h2AutoAdmin.saveConfirmation.useMutation({
    onSuccess: (_result, variables) => {
      clearDraft(variables.id);
      setConflicts(previous => ({ ...previous, [variables.id]: false }));
      toast.success("Textos de confirmação salvos no servidor. O H2 Auto receberá a atualização na sincronização.");
      void utils.h2AutoAdmin.list.invalidate();
    },
    onError: (error, variables) => {
      if (error.data?.code === "CONFLICT")
        setConflicts(previous => ({ ...previous, [variables.id]: true }));
      toast.error(error.message || "Falha ao salvar textos de confirmação.");
    },
  });
  const [validityDraft, setValidityDraft] = useState<Record<string,string>>({});
  const validity = trpc.h2AutoAdmin.saveIdentificationValidity.useMutation({
    onSuccess: (_result, variables) => {
      toast.success("Validade da identificação atualizada no servidor");
      void utils.h2AutoAdmin.list.invalidate();
    },
    onError: error => toast.error(error.message || "Não foi possível alterar validade"),
  });
  const safety = trpc.h2AutoAdmin.saveSafetySwitch.useMutation({
    onSuccess: () => { toast.success("Controle atualizado imediatamente no servidor"); void utils.h2AutoAdmin.list.invalidate(); },
    onError: e => toast.error(e.message || "Falha ao atualizar controle"),
  });
  const saveMedia = trpc.h2AutoAdmin.saveMedia.useMutation({
    onSuccess: (result, variables) => {
      // Only media was persisted. Keep unsaved menus/rules and any edits made
      // while the request was in flight; advance only the matching draft lease.
      setEditing(previous => {
        const draft = previous[variables.id];
        if (!draft || draft.revision !== variables.expectedRevision) return previous;
        return { ...previous, [variables.id]: { ...draft, revision: result.revision } };
      });
      setConflicts(previous => ({ ...previous, [variables.id]: false }));
      toast.success("Configuração de mídia salva separadamente");
      void utils.h2AutoAdmin.list.invalidate();
    },
    onError: (error, variables) => {
      if (error.data?.code === "CONFLICT")
        setConflicts(previous => ({ ...previous, [variables.id]: true }));
      toast.error(error.message || "Falha ao salvar mídia");
    },
  });
  const merge = trpc.h2AutoAdmin.mergeLocal.useMutation({
    onSuccess: () => {
      toast.success("Configurações locais mescladas sem apagar as atuais");
      void utils.h2AutoAdmin.list.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const revoke = trpc.h2AutoAdmin.revoke.useMutation({
    onSuccess: (_result, variables) => {
      clearDraft(variables.id);
      toast.success(
        "Celular desvinculado. Configurações preservadas e diagnóstico limpo."
      );
      void utils.h2AutoAdmin.list.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const remove = trpc.h2AutoAdmin.remove.useMutation({
    onSuccess: () => {
      toast.success("Celular removido do H2 AUTO.");
      void utils.h2AutoAdmin.list.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  return (
    <div className="min-h-screen bg-[#050c18] text-white">
      <AdminHeader
        title="H2 AUTO — CONTROLE REMOTO"
        icon={<Bot className="h-5 w-5" />}
      />
      <main className="mx-auto max-w-[1600px] p-4 space-y-5">
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-950/30 p-4 text-sm text-emerald-200">
          <ShieldCheck className="inline h-4 w-4 mr-2" />
          Sem API do WhatsApp e sem áudio no servidor. Apenas configurações e
          diagnóstico seguro sincronizados com o APK; o aparelho continua
          responsável por responder.
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cyan-400/30 bg-cyan-950/25 p-4">
          <div>
            <p className="font-black text-cyan-200">
              APK H2 AUTO 1.17 — histórico neon
            </p>
            <p className="text-xs text-slate-300">
              Instalador oficial e manifesto versionado. A permissão do Android
              continua sendo local.
            </p>
          </div>
          <a
            href="/baixar-h2-auto"
            className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2 text-sm font-black text-slate-950 hover:bg-cyan-300"
          >
            <ExternalLink className="h-4 w-4" />
            BAIXAR APK 1.17
          </a>
        </div>
        <Box>
          <h2 className="font-black text-cyan-300 flex gap-2">
            <Smartphone /> VINCULAR APARELHO
          </h2>
          <div className="flex gap-2">
            <input
              className={field}
              value={label}
              maxLength={80}
              onChange={e => setLabel(e.target.value)}
              placeholder="Nome do aparelho"
            />
            <button
              className="rounded-xl bg-cyan-500 px-4 font-bold text-slate-950"
              disabled={!label.trim() || create.isPending}
              onClick={() => create.mutate({ label })}
            >
              ADICIONAR
            </button>
          </div>
          {pair && (
            <div className="rounded-xl border border-yellow-400/40 p-4">
              <p className="text-yellow-300 font-black">
                CÓDIGO TEMPORÁRIO — 10 MINUTOS
              </p>
              <p className="text-3xl tracking-widest font-black">{pair.code}</p>
              <p className="text-xs opacity-70">
                Aparelho: {pair.id}. Insira este código no H2 AUTO. Ele aparece
                somente agora.
              </p>
            </div>
          )}
        </Box>
        {isLoading && <p>Carregando aparelhos...</p>}
        {data.map((d: any) => {
          const draft = editing[d.id];
          const value = draft?.config || d.config;
          const expectedRevision = draft?.revision ?? d.revision;
          const media = { ...mediaDefaults, ...(value.media || {}) };
          const confirmation = { ...confirmationDefaults, ...(value.confirmation || {}) };
          const mediaDirty =
            Boolean(draft) &&
            JSON.stringify(media) !==
              JSON.stringify({ ...mediaDefaults, ...(d.config.media || {}) });
          const staleDraft = Boolean(draft) && draft.revision !== d.revision;
          const needsRefresh = Boolean(conflicts[d.id] || staleDraft);
          const diagnostic = d.diagnostics;
          const diagnosticsStale = isStale(d.diagnosticsReceivedAt);
          const change = (fieldName: string, nextValue: any) =>
            setEditing(previous => {
              const current = previous[d.id]?.config || d.config;
              const revision = previous[d.id]?.revision ?? d.revision;
              return {
                ...previous,
                [d.id]: {
                  config: { ...current, [fieldName]: nextValue },
                  revision,
                },
              };
            });
          const updateMedia = (key: string, nextValue: any) =>
            change("media", { ...media, [key]: nextValue });
          const saveGeneral = () => {
            if (mediaDirty) {
              toast.warning(
                "Salve a Central de Áudios e Mídias pelo botão próprio antes da configuração geral."
              );
              return;
            }
            if (needsRefresh) return;
            save.mutate({
              id: d.id,
              config: { ...value, media: d.config.media, welcome: "", menu: Array(9).fill(""), rules: [] },
              expectedRevision,
            });
          };
          const saveOnlyMedia = () => {
            if (!mediaDirty || needsRefresh) return;
            saveMedia.mutate({ id: d.id, media, expectedRevision });
          };
          return (
            <Box key={d.id}>
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <h3 className="text-lg font-black">{d.label}</h3>
                  <p className="text-xs opacity-65">
                    {d.paired ? "VINCULADO" : "AGUARDANDO VÍNCULO"} · Config.{" "}
                    {d.revision} · Aplicada {d.appliedRevision} ·{" "}
                    {d.lastSeen
                      ? "Última sincronização: " + dateLabel(d.lastSeen)
                      : "Nunca sincronizado"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="rounded-lg border border-cyan-500/40 px-3 py-2 text-xs"
                    onClick={() => pairCode.mutate({ id: d.id })}
                  >
                    NOVO CÓDIGO
                  </button>
                  <button
                    disabled={!d.paired || revoke.isPending}
                    className="rounded-lg border border-amber-500/50 px-3 py-2 text-xs font-bold text-amber-300 disabled:opacity-40"
                    onClick={() => {
                      if (
                        confirm(
                          "DESVINCULAR " +
                            d.label +
                            "?\nO celular perderá a autorização de sincronizar e consultar pedidos. As configurações do ADM serão preservadas."
                        )
                      )
                        revoke.mutate({ id: d.id });
                    }}
                  >
                    DESVINCULAR CELULAR
                  </button>
                  <button
                    disabled={remove.isPending}
                    className="rounded-lg border border-red-500/50 px-3 py-2 text-xs font-bold text-red-300 disabled:opacity-40"
                    onClick={() => {
                      if (
                        confirm(
                          "REMOVER DEFINITIVAMENTE " +
                            d.label +
                            "?\nIsso apagará somente o aparelho H2 AUTO, sua cópia local armazenada no ADM, diagnóstico e sessões de consulta. Não apaga pedidos, clientes nem outros serviços."
                        )
                      )
                        remove.mutate({ id: d.id });
                    }}
                  >
                    REMOVER APARELHO
                  </button>
                </div>
              </div>
              {needsRefresh && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/50 bg-amber-950/30 p-3 text-sm text-amber-100">
                  <span>
                    <AlertTriangle className="mr-2 inline h-4 w-4" />
                    Este rascunho começou na revisão {draft?.revision}; o
                    servidor está na revisão {d.revision}. Nada foi mesclado
                    automaticamente.
                  </span>
                  <button
                    className="inline-flex items-center gap-2 rounded-lg bg-amber-300 px-3 py-2 text-xs font-black text-slate-950"
                    onClick={() => refreshDevice(d.id)}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    RECARREGAR E DESCARTAR RASCUNHO
                  </button>
                </div>
              )}
              {d.snapshotConfig && (
                <div className="rounded-xl border border-amber-400/30 bg-amber-950/20 p-3 space-y-2">
                  <div className="font-bold text-amber-200">
                    CÓPIA DAS CONFIGURAÇÕES DO CELULAR DISPONÍVEL
                  </div>
                  <p className="text-xs text-white/70">
                    Recebida em{" "}
                    {d.snapshotReceivedAt
                      ? dateLabel(d.snapshotReceivedAt)
                      : "data desconhecida"}
                    . A cópia original fica preservada. Mesclar preenche os
                    campos vazios e adiciona regras que ainda não existem no
                    ADM.
                  </p>
                  <button
                    className="rounded-lg bg-amber-400 px-4 py-2 text-xs font-black text-black"
                    disabled={merge.isPending}
                    onClick={() => {
                      if (
                        confirm(
                          "Mesclar dados locais sem apagar configurações atuais do ADM?"
                        )
                      )
                        merge.mutate({
                          id: d.id,
                          expectedRevision: d.revision,
                        });
                    }}
                  >
                    IMPORTAR CONFIGURAÇÕES DO CELULAR
                  </button>
                </div>
              )}
              <section className="rounded-2xl border border-rose-400/40 bg-rose-950/25 p-4 space-y-3">
                <h4 className="font-black text-rose-200 flex items-center gap-2"><Power className="h-5 w-5"/> CONTROLES IMEDIATOS DO ROBÔ</h4>
                <p className="text-xs text-slate-300">A atualização é aplicada no servidor sem aguardar a sincronização do celular. Se não houver internet, o APK deve bloquear envios por segurança.</p>
                <p className="text-xs text-amber-200">Ao desativar a identificação, ficam disponíveis apenas os caminhos públicos de novos clientes. Dados de clientes continuam protegidos.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <button type="button" disabled={safety.isPending} onClick={() => safety.mutate({id:d.id,key:"enabled",value:!d.config.enabled})}
                    className={`rounded-xl p-4 font-black border ${d.config.enabled?"border-red-400 bg-red-700 text-white":"border-emerald-400 bg-emerald-800 text-white"}`}>
                    {d.config.enabled ? "⛔ DESLIGAR TODAS AS RESPOSTAS" : "✅ ATIVAR RESPOSTAS"}
                  </button>
                  <button type="button" disabled={safety.isPending} onClick={() => safety.mutate({id:d.id,key:"identificationEnabled",value:d.config.identificationEnabled===false})}
                    className="rounded-xl p-4 font-black border border-cyan-500/50 bg-slate-800 text-white">
                    {d.config.identificationEnabled===false?"ATIVAR IDENTIFICAÇÃO INICIAL":"DESATIVAR IDENTIFICAÇÃO INICIAL"}
                  </button>
                </div>
                <div className="rounded-xl border border-cyan-400/40 bg-slate-950/50 p-4 space-y-2">
                  <label className="flex flex-wrap items-center gap-2 text-sm font-bold text-cyan-200">
                    <Clock className="h-4 w-4"/> RECONFIRMAR IDENTIDADE APÓS (HORAS)
                  </label>
                  <div className="flex flex-wrap gap-2 items-center">
                    <input type="number" min={1} max={720} step={1}
                      className="w-28 rounded-lg bg-slate-900 border border-cyan-500/40 p-2 text-white"
                      value={validityDraft[d.id] ?? String(d.config.identificationSessionHours ?? 24)}
                      onChange={e => setValidityDraft(old => ({...old,[d.id]:e.target.value}))}/>
                    <button type="button" disabled={validity.isPending || !Number.isInteger(Number(validityDraft[d.id] ?? d.config.identificationSessionHours ?? 24)) || Number(validityDraft[d.id] ?? d.config.identificationSessionHours ?? 24)<1 || Number(validityDraft[d.id] ?? d.config.identificationSessionHours ?? 24)>720}
                      onClick={() => validity.mutate({id:d.id,hours:Number(validityDraft[d.id] ?? d.config.identificationSessionHours ?? 24)})}
                      className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-black text-white disabled:opacity-40">SALVAR VALIDADE</button>
                  </div>
                  <p className="text-xs text-slate-300">Padrão: 24 horas. De 1 a 720 horas (30 dias). Mudar de opção, digitar MENU ou 0 não exige um novo código durante a validade. Bloqueio de cadastro revoga o acesso.</p>
                </div>
              </section>
              <section className="rounded-2xl border border-cyan-400/40 bg-gradient-to-br from-cyan-950/40 to-slate-950 p-4 space-y-3">
                <h4 className="text-lg font-black text-cyan-200">🖥️ MODO WHATSAPP DESKTOP — SOMENTE LEITURA</h4>
                <p className="text-sm text-slate-300">Deixe o WhatsApp aberto no PC para acompanhar mensagens. O robô tenta usar somente notificações Android ainda ativas; leitura no computador não cancela a pausa manual nem os contatos silenciados.</p>
                <p className="text-xs text-amber-200">Não garante respostas quando o WhatsApp remove a notificação antes do Android receber a mensagem. A resposta pelo PC não é identificada como atendimento manual; pause o contato no ADM antes de responder.</p>
                <button type="button" disabled={safety.isPending}
                  onClick={() => safety.mutate({id:d.id,key:"desktopReadOnly",value:d.config.desktopReadOnly!==true})}
                  className={`w-full rounded-xl border px-4 py-3 font-black ${d.config.desktopReadOnly?"border-cyan-400 bg-cyan-800 text-white":"border-slate-600 bg-slate-800 text-slate-200"}`}>
                  {d.config.desktopReadOnly?"✅ DESKTOP SOMENTE LEITURA — ATIVADO":"ATIVAR DESKTOP SOMENTE LEITURA"}
                </button>
                <p className={d.paired && d.appliedRevision===d.revision?"text-emerald-300 text-xs":"text-amber-200 text-xs"}>
                  {d.paired && d.appliedRevision===d.revision?"Configuração sincronizada com o APK":"Após ativar, sincronize o H2 AUTO no celular para aplicar."}
                </p>
                <div className="rounded-lg border border-white/10 bg-black/25 p-3 space-y-1 text-xs text-slate-300">
                  <p><strong>Diagnóstico Android:</strong> {diagnostic?.desktopLastCode ?? "Sem registro"}</p>
                  <p><strong>Último evento:</strong> {dateLabel(diagnostic?.desktopLastAt)}</p>
                  <p><strong>Modo no APK:</strong> {diagnostic?.desktopReadOnly?"Ativado":diagnostic?"Desativado":"Não informado"}</p>
                </div>
              </section>
              <H2AutoTreeEditor id={d.id} revision={d.revision} appliedRevision={d.appliedRevision} initial={d.config.tree} />
              <H2AutoValidationBlocks deviceId={d.id} deviceLabel={d.label} />
              <H2AutoSilencedContacts deviceId={d.id} deviceLabel={d.label} />
              <H2AutoHistoryPanel
                deviceId={d.id}
                label={d.label}
                history={d.history}
                receivedAt={d.historyReceivedAt}
              />
              <section className="rounded-2xl border border-fuchsia-400/30 bg-fuchsia-950/20 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Image className="h-5 w-5 text-fuchsia-300" />
                  <h4 className="font-black text-fuchsia-200">
                    DIAGNÓSTICO REPORTADO PELO APK
                  </h4>
                </div>
                {diagnostic ? (
                  <>
                    <div className="grid gap-2 text-xs sm:grid-cols-2">
                      <p>
                        APK reportado:{" "}
                        <strong>
                          {diagnostic.apkVersion || "versão não informada"}
                        </strong>{" "}
                        (código {diagnostic.apkVersionCode})
                        {diagnosticsStale && (
                          <span className="ml-1 text-amber-300">
                            · relatório antigo
                          </span>
                        )}
                      </p>
                      <p>
                        Recebido pelo ADM:{" "}
                        <strong>{dateLabel(d.diagnosticsReceivedAt)}</strong>
                      </p>
                      <p>
                        Mídias:{" "}
                        <strong>
                          {diagnostic.mediaEnabled
                            ? "habilitadas"
                            : "desabilitadas"}
                        </strong>{" "}
                        · transcrição configurada:{" "}
                        <strong>
                          {diagnostic.transcribeConfigured ? "sim" : "não"}
                        </strong>
                      </p>
                      <p>
                        Permissão de microfone:{" "}
                        <strong>
                          {diagnostic.recordAudioPermission
                            ? "concedida"
                            : "necessária"}
                        </strong>{" "}
                        · listener:{" "}
                        <strong>
                          {diagnostic.listenerConnected
                            ? "conectado"
                            : "desconectado"}
                        </strong>
                      </p>
                      <p>
                        Último estado:{" "}
                        <strong>
                          {statusLabels[diagnostic.statusCode] ||
                            diagnostic.statusCode}
                        </strong>{" "}
                        <span className="opacity-60">
                          ({diagnostic.statusCode})
                        </span>{" "}
                        em {dateLabel(diagnostic.statusAt)}
                      </p>
                      <p>
                        Última resposta:{" "}
                        <strong>
                          {replyLabels[diagnostic.replyStatusCode] ||
                            diagnostic.replyStatusCode}
                        </strong>{" "}
                        <span className="opacity-60">
                          ({diagnostic.replyStatusCode})
                        </span>{" "}
                        em {dateLabel(diagnostic.replyStatusAt)}
                      </p>
                      <p>
                        Último erro Android:{" "}
                        <strong>
                          {diagnostic.androidErrorCode === -1
                            ? "nenhum código seguro reportado"
                            : `código ${diagnostic.androidErrorCode}`}
                        </strong>
                      </p>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-slate-300">
                    Nenhum relatório recebido. Versão instalada:{" "}
                    <strong>desconhecida</strong>; o ADM não presume 1.15 nem
                    qualquer outra versão.
                  </p>
                )}
                <p className="text-xs text-slate-300">
                  Permissão de microfone não garante acesso à fonte do áudio ou
                  à notificação. A captura de áudio de notificações é uma
                  tentativa de melhor esforço; se a fonte/URI estiver
                  indisponível, o ADM não consegue corrigir isso remotamente —
                  aguarde o APK atualizado. Nenhuma configuração é ativada
                  automaticamente.
                </p>
              </section>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-xs flex flex-col gap-2">
                  APLICATIVO WHATSAPP
                  <select
                    className={field}
                    value={value.whatsappMode}
                    onChange={e =>
                      change("whatsappMode", Number(e.target.value))
                    }
                  >
                    <option value={-1}>Manter seleção do celular</option>
                    <option value={0}>WhatsApp Normal</option>
                    <option value={1}>WhatsApp Business</option>
                  </select>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={value.enabled}
                    onChange={e => change("enabled", e.target.checked)}
                  />
                  <Power className="h-4 w-4" /> Robô habilitado remotamente
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(value.ordersEnabled)}
                    onChange={e => change("ordersEnabled", e.target.checked)}
                  />
                  Consulta de pedidos por WhatsApp (exige APK atualizado e
                  teste)
                </label>
                <div className="col-span-full rounded-2xl border border-violet-400/40 bg-violet-950/20 p-3 sm:p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h4 className="text-base font-black text-violet-200">
                        📝 TODOS OS TEXTOS DE CONFIRMAÇÃO — H2 AUTO
                      </h4>
                      <p className="mt-1 text-xs text-slate-300">
                        Edite cada mensagem separadamente. O conteúdo salvo passa a ser usado pelo atendimento automático deste aparelho.
                        Os números do menu, os limites de tentativas, os bloqueios e a verificação de e-mail continuam obrigatórios.
                      </p>
                    </div>
                    <span className="rounded-lg border border-violet-400/30 px-3 py-2 text-xs font-bold text-violet-200">
                      {confirmationGroups.reduce((total, group) => total + group.fields.length, 0)} campos editáveis
                    </span>
                  </div>
                  {confirmationGroups.map((group, groupIndex) => (
                    <details key={group.id} open={groupIndex === 0} className="rounded-xl border border-violet-400/20 bg-slate-950/60 p-3 sm:p-4">
                      <summary className="cursor-pointer select-none text-sm font-black text-violet-200">
                        {groupIndex + 1}. {group.title} ({group.fields.length})
                      </summary>
                      <p className="mt-2 text-xs text-slate-400">{group.description}</p>
                      <div className="mt-3 space-y-4">
                        {group.fields.map(({ key, label, help }) => (
                          <div key={key} className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <label htmlFor={`h2-confirm-${d.id}-${key}`} className="text-xs font-bold text-white">
                                {label}
                              </label>
                              <button type="button" className="rounded-lg border border-slate-500/40 px-2 py-1 text-[11px] font-bold text-slate-300 hover:bg-slate-800"
                                onClick={() => change("confirmation", { ...confirmation, [key]: confirmationDefaults[key] })}>
                                Restaurar padrão
                              </button>
                            </div>
                            {help && <p className="text-[11px] text-amber-200">{help}</p>}
                            <textarea id={`h2-confirm-${d.id}-${key}`}
                              rows={key === "identificationWelcome" || key === "customerProfileUpdate" ? 9 : 4}
                              maxLength={2000}
                              className={field + " min-h-24 resize-y whitespace-pre-wrap"}
                              value={confirmation[key]}
                              onChange={e => change("confirmation", { ...confirmation, [key]: e.target.value })}
                            />
                            <div className="text-right text-[11px] text-slate-400">{confirmation[key].length}/2000 caracteres</div>
                            <details className="rounded-lg border border-cyan-500/20 bg-cyan-950/20 px-3 py-2">
                              <summary className="cursor-pointer text-xs font-bold text-cyan-200">Visualizar mensagem no WhatsApp</summary>
                              <div className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-[#0b1d18] p-3 text-xs leading-5 text-emerald-100">{confirmation[key]}</div>
                            </details>
                          </div>
                        ))}
                      </div>
                    </details>
                  ))}
                  {needsRefresh && <p role="alert" className="text-xs font-bold text-amber-200">Configuração alterada em outro lugar. Atualize os dados antes de salvar.</p>}
                  <button type="button" disabled={saveConfirmation.isPending || needsRefresh}
                    onClick={() => {
                      const invalid = Object.entries(confirmation).find(([, message]) => !String(message).trim());
                      if (invalid) { toast.error("Preencha todos os textos de confirmação antes de salvar."); return; }
                      saveConfirmation.mutate({ id: d.id, confirmation, expectedRevision });
                    }}
                    className="w-full rounded-xl border border-emerald-400/60 bg-emerald-700 px-4 py-3 text-sm font-black text-white transition hover:bg-emerald-600 disabled:opacity-50">
                    {saveConfirmation.isPending ? "SALVANDO..." : "💾 SALVAR TODOS OS TEXTOS DE CONFIRMAÇÃO"}
                  </button>
                  <p className="text-xs text-slate-400">O salvamento atualiza somente os textos deste aparelho, sem sobrescrever outras configurações.</p>
                </div>
                <div className="col-span-full rounded-xl border border-cyan-400/30 bg-cyan-950/20 p-3 space-y-3">
                  <h4 className="font-black text-cyan-300">
                    INTEGRAÇÃO COM PEDIDOS DO SITE
                  </h4>
                  <p className="text-xs text-white/60">
                    Ative somente após instalar e testar o APK compatível.
                    Código de e-mail sempre obrigatório.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <label className="text-xs">
                      Sessão autenticada (horas)
                      <input
                        type="number"
                        min={1}
                        max={72}
                        className={field}
                        value={value.orderSessionHours ?? 24}
                        onChange={e =>
                          change("orderSessionHours", Number(e.target.value))
                        }
                      />
                    </label>
                    <label className="text-xs">
                      Validade do código (minutos)
                      <input
                        type="number"
                        min={5}
                        max={30}
                        className={field}
                        value={value.orderCodeTtlMinutes ?? 10}
                        onChange={e =>
                          change("orderCodeTtlMinutes", Number(e.target.value))
                        }
                      />
                    </label>
                    <label className="text-xs">
                      Tentativas de código
                      <input
                        type="number"
                        min={3}
                        max={10}
                        className={field}
                        value={value.orderCodeMaxAttempts ?? 5}
                        onChange={e =>
                          change("orderCodeMaxAttempts", Number(e.target.value))
                        }
                      />
                    </label>
                  </div>
                  <label className="block text-xs">
                    Mensagem para cliente sem pedidos
                    <textarea
                      rows={3}
                      className={field}
                      maxLength={600}
                      value={
                        value.orderNoOrdersMessage ??
                        "Cadastro localizado com sucesso, mas não encontramos nenhum pedido associado a este cadastro no momento."
                      }
                      onChange={e =>
                        change("orderNoOrdersMessage", e.target.value)
                      }
                    />
                  </label>
                </div>
                <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-3 text-xs space-y-1">
                  <p className="font-bold text-cyan-200">PAUSA DO ATENDENTE — 24 HORAS</p>
                  <p>Tempo configurado no ADM: <strong>{d.config.pauseMinutes} min</strong>{draft && value.pauseMinutes !== d.config.pauseMinutes ? ` · Novo valor ainda não salvo: ${value.pauseMinutes} min` : ""}</p>
                  <p className={d.paired && d.appliedRevision === d.revision ? "text-emerald-300" : "text-amber-300"}>
                    {d.paired && d.appliedRevision === d.revision
                      ? `Revisão ${d.appliedRevision} confirmada pelo APK`
                      : !d.paired ? "Celular não vinculado — tempo ainda não aplicado"
                        : `Sincronização pendente: servidor ${d.revision}, APK ${d.appliedRevision}`}
                  </p>
                  <p className="text-muted-foreground">A pausa não depende dos horários ativos. A confirmação da revisão não garante que o WhatsApp tenha informado a resposta manual.</p>
                </div>
                <label className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Pausa atendente (min)
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    className={field}
                    value={value.pauseMinutes}
                    onChange={e =>
                      change("pauseMinutes", Number(e.target.value))
                    }
                  />
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={value.scheduleOn}
                    onChange={e => change("scheduleOn", e.target.checked)}
                  />{" "}
                  Horários ativos
                </label>
                <div className="flex gap-2">
                  <input
                    className={field}
                    value={value.scheduleStart}
                    onChange={e => change("scheduleStart", e.target.value)}
                    placeholder="09:00"
                  />
                  <input
                    className={field}
                    value={value.scheduleEnd}
                    onChange={e => change("scheduleEnd", e.target.value)}
                    placeholder="18:00"
                  />
                </div>
              </div>
              <section className="rounded-2xl border border-fuchsia-400/40 bg-fuchsia-950/20 p-4 space-y-4">
                <div>
                  <h4 className="text-lg font-black text-fuchsia-200">📨 RESPOSTAS WHATSAPP ANTIGAS — H2 AUTO</h4>
                  <p className="mt-1 text-xs text-slate-300">Área recuperada das configurações existentes do robô. Exibe as mensagens previamente salvas, inclusive regras relacionadas a status, quando houver. Não altera o fluxo de pedidos nem ativa envio automático de notificações.</p>
                  <p className="mt-2 text-sm font-semibold text-fuchsia-200">{(value.rules || []).length} resposta(s) no servidor · {(d.snapshotConfig?.rules || []).length} na cópia original do celular</p>
                </div>
                {(!value.rules || value.rules.length === 0) && <p className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 text-xs text-amber-200">Não há respostas antigas na configuração atual do aparelho. Confira a cópia local abaixo antes de cadastrar uma nova.</p>}
                {(value.rules || []).map((rule: any, i: number) => (
                  <div key={i} className="grid gap-3 rounded-xl border border-fuchsia-400/20 bg-slate-950/65 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="text-xs font-bold text-white">
                        <input type="checkbox" className="mr-2" checked={rule.enabled}
                          onChange={e => change("rules", value.rules.map((x: any, j: number) => j === i ? { ...x, enabled: e.target.checked } : x))}/>
                        Resposta {i + 1} habilitada
                      </label>
                      <button type="button" className="rounded-lg border border-red-500/30 px-3 py-1 text-xs text-red-200"
                        onClick={() => { if (window.confirm("Excluir esta resposta? Só será removida ao clicar em SALVAR RESPOSTAS.")) change("rules", value.rules.filter((_x: any, j: number) => i !== j)); }}>
                        Remover
                      </button>
                    </div>
                    <label className="text-xs text-fuchsia-100">Palavra-chave / gatilho
                      <input className={field} maxLength={120} value={rule.trigger}
                        onChange={e => change("rules", value.rules.map((x: any, j: number) => j === i ? { ...x, trigger: e.target.value } : x))}/>
                    </label>
                    <label className="text-xs text-fuchsia-100">Tipo de correspondência
                      <select className={field} value={rule.mode}
                        onChange={e => change("rules", value.rules.map((x: any, j: number) => j === i ? { ...x, mode: e.target.value } : x))}>
                        <option value="exact">Mensagem exata</option>
                        <option value="contains">Contém palavras</option>
                      </select>
                    </label>
                    <label className="text-xs text-fuchsia-100">Resposta enviada no WhatsApp
                      <textarea className={field} rows={4} maxLength={6000} value={rule.reply}
                        onChange={e => change("rules", value.rules.map((x: any, j: number) => j === i ? { ...x, reply: e.target.value } : x))}/>
                    </label>
                  </div>
                ))}
                <button type="button" className="w-full rounded-xl border border-fuchsia-400/45 bg-fuchsia-500/15 px-3 py-3 text-sm font-black text-fuchsia-100"
                  onClick={() => change("rules", [...(value.rules || []), { trigger: "", reply: "", mode: "exact", enabled: false }])}>
                  + ADICIONAR RESPOSTA (DESATIVADA)
                </button>
                {d.snapshotConfig?.rules?.length > 0 && (
                  <details className="rounded-xl border border-amber-400/35 bg-amber-950/20 p-3">
                    <summary className="cursor-pointer text-sm font-bold text-amber-200">📦 Ver cópia de segurança anterior do celular ({d.snapshotConfig.rules.length})</summary>
                    <p className="my-2 text-xs text-slate-300">A cópia é apenas para consulta. A recuperação importa somente regras ausentes, sem substituir as já salvas.</p>
                    {d.snapshotConfig.rules.map((rule: any, i: number) => (
                      <div key={i} className="mt-2 rounded-lg border border-white/10 p-2 text-xs">
                        <p className="font-bold text-white">Gatilho: {rule.trigger || "(vazio)"}</p>
                        <p className="mt-1 whitespace-pre-wrap break-words text-slate-300">{rule.reply}</p>
                      </div>
                    ))}
                    <button type="button" className="mt-3 w-full rounded-lg bg-amber-400 px-3 py-2 text-xs font-black text-slate-950"
                      onClick={() => {
                        const current = value.rules || [];
                        const keys = new Set(current.map((x: any) => x.trigger.trim().toLowerCase() + "|" + x.mode));
                        const missing = d.snapshotConfig.rules.filter((x: any) => x.trigger && !keys.has(x.trigger.trim().toLowerCase() + "|" + x.mode));
                        if (!missing.length) { toast.info("Todas as respostas da cópia já estão listadas."); return; }
                        if (!window.confirm(`Recuperar ${missing.length} resposta(s) ausente(s) sem substituir as existentes? Elas só serão aplicadas depois de SALVAR RESPOSTAS.`)) return;
                        change("rules", [...current, ...missing].slice(0, 100));
                        toast.success("Respostas recuperadas no formulário. Revise antes de salvar.");
                      }}
                    >RECUPERAR SOMENTE RESPOSTAS AUSENTES</button>
                  </details>
                )}
                <button type="button" className="w-full rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950 disabled:opacity-50"
                  disabled={needsRefresh || saveReplyRules.isPending}
                  onClick={() => {
                    const rules = value.rules || [];
                    if (rules.some((x: any) => !x.trigger?.trim() || !x.reply?.trim())) { toast.error("Preencha o gatilho e a resposta de todas as regras."); return; }
                    saveReplyRules.mutate({ id: d.id, rules, expectedRevision });
                  }}>
                  <Save className="mr-1 inline h-4 w-4"/> {saveReplyRules.isPending ? "SALVANDO..." : "SALVAR SOMENTE RESPOSTAS WHATSAPP"}
                </button>
              </section>
              <section className="rounded-2xl border border-sky-400/35 bg-sky-950/25 p-4 space-y-3">
                <h4 className="font-black text-sky-300 flex items-center gap-2">
                  <Mic className="h-5 w-5" /> CENTRAL DE ÁUDIOS E MÍDIAS
                </h4>
                <p className="text-xs text-slate-300">
                  Esta área tem salvamento próprio e não altera menu, pedidos ou
                  regras. O fallback vazio continua independente de corrigir ou
                  não a transcrição do APK.
                </p>
                <label className="flex gap-2 items-center text-sm">
                  <input
                    type="checkbox"
                    checked={media.enabled}
                    onChange={e => updateMedia("enabled", e.target.checked)}
                  />
                  Responder mídias recebidas
                </label>
                <label className="flex gap-2 items-center text-sm">
                  <input
                    type="checkbox"
                    checked={media.transcribeAudio}
                    onChange={e =>
                      updateMedia("transcribeAudio", e.target.checked)
                    }
                  />
                  Tentar transcrever áudio localmente quando acessível
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs">
                    Intervalo por conversa (segundos)
                    <input
                      type="number"
                      min={15}
                      max={3600}
                      className={field}
                      value={media.cooldownSeconds}
                      onChange={e =>
                        updateMedia("cooldownSeconds", Number(e.target.value))
                      }
                    />
                  </label>
                  <label className="text-xs">
                    Duração máxima de áudio (segundos)
                    <input
                      type="number"
                      min={5}
                      max={120}
                      className={field}
                      value={media.maxAudioSeconds}
                      onChange={e =>
                        updateMedia("maxAudioSeconds", Number(e.target.value))
                      }
                    />
                  </label>
                </div>
                {(
                  [
                    ["audioFallback", "ÁUDIO NÃO TRANSCRITO"],
                    ["photoReply", "FOTO"],
                    ["videoReply", "VÍDEO"],
                    ["documentReply", "DOCUMENTO"],
                    ["stickerReply", "FIGURINHA"],
                    ["unknownReply", "MÍDIA DESCONHECIDA"],
                  ] as const
                ).map(([key, label]) => (
                  <label
                    key={key}
                    className="block text-xs font-bold text-sky-200"
                  >
                    {label}
                    <textarea
                      className={field}
                      rows={2}
                      maxLength={3000}
                      value={media[key]}
                      onChange={e => updateMedia(key, e.target.value)}
                    />
                  </label>
                ))}
                <button
                  className="w-full rounded-xl bg-sky-300 p-3 text-slate-950 font-black disabled:opacity-40"
                  disabled={!mediaDirty || needsRefresh || saveMedia.isPending}
                  onClick={saveOnlyMedia}
                >
                  <Save className="inline h-4 w-4 mr-1" />
                  SALVAR SOMENTE ÁUDIOS E MÍDIAS
                </button>
              </section>
              <label className="block text-xs">
                CONTATOS BLOQUEADOS (um por linha)
                <textarea
                  className={field}
                  rows={2}
                  value={value.blocked}
                  onChange={e => change("blocked", e.target.value)}
                />
              </label>
              <button
                className="w-full rounded-xl bg-emerald-400 p-3 text-slate-950 font-black disabled:opacity-40"
                disabled={needsRefresh || save.isPending || mediaDirty}
                onClick={saveGeneral}
              >
                <Save className="inline h-4 w-4 mr-1" />
                SALVAR CONFIGURAÇÃO GERAL
              </button>
            </Box>
          );
        })}
        <p className="text-xs text-slate-500">
          <CheckCircle2 className="mr-1 inline h-4 w-4" />
          Alterações só funcionam quando o APK atualizado está vinculado e
          conectado à internet. As permissões do Android não podem ser liberadas
          remotamente; o fallback pode continuar ativo mesmo quando a
          transcrição local estiver indisponível.
        </p>
      </main>
    </div>
  );
}
