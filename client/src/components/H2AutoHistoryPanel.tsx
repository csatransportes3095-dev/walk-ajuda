import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ChevronDown,
  Clock3,
  Eye,
  Filter,
  History,
  Inbox,
  Search,
  ShieldAlert,
  Smartphone,
  Sparkles,
} from "lucide-react";
import {
  getH2AutoHistoryCategory,
  getInitialHistoryCursor,
  getUnreadHistoryCount,
  h2AutoHistoryCategoryLabel,
  historyCursorStorageKey,
  normalizeH2AutoHistory,
  resolveHistoryCursor,
  sortH2AutoHistoryEvents,
  type H2AutoHistory,
  type H2AutoHistoryCategory,
} from "@/lib/h2AutoHistoryView";

type H2AutoHistoryPanelProps = {
  deviceId: string;
  label: string;
  history?: H2AutoHistory | null;
  receivedAt?: number | null;
};

type FilterValue = "todos" | H2AutoHistoryCategory;
type StorageState = "ready" | "unknown";

const filterOptions: Array<{ value: FilterValue; label: string }> = [
  { value: "todos", label: "Todos" },
  { value: "menu", label: "Menu" },
  { value: "regras", label: "Regras" },
  { value: "atendimento", label: "Atendimento" },
  { value: "midia", label: "Mídia" },
];

const formatDate = (value: number | null | undefined): string | null => {
  if (value == null || value <= 0 || !Number.isFinite(value)) return null;
  return new Date(value).toLocaleString("pt-BR");
};

const eventDateLabel = (time: string, occurredAt: number): string =>
  time.trim() || formatDate(occurredAt) || "Data não informada";

const isDocumentVisible = (): boolean =>
  typeof document === "undefined" || document.visibilityState === "visible";

const readCursor = (key: string): number | null => {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(key);
  return raw == null ? null : Number(raw);
};

export default function H2AutoHistoryPanel({
  deviceId,
  label,
  history,
  receivedAt,
}: H2AutoHistoryPanelProps) {
  const normalizedHistory = useMemo(
    () => normalizeH2AutoHistory(history),
    [history]
  );
  const streamId = normalizedHistory?.streamId ?? null;
  const storageKey = streamId
    ? historyCursorStorageKey(deviceId, streamId)
    : null;
  const [cursor, setCursor] = useState<number | null>(() =>
    getInitialHistoryCursor(history)
  );
  const [storageState, setStorageState] = useState<StorageState>("ready");
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState<FilterValue>("todos");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!normalizedHistory || !storageKey) {
      setCursor(null);
      setStorageState("ready");
      return;
    }

    try {
      setCursor(
        resolveHistoryCursor(normalizedHistory, readCursor(storageKey))
      );
      setStorageState("ready");
    } catch {
      // A privacy mode or disabled storage must not make the UI claim a durable read state.
      setCursor(getInitialHistoryCursor(normalizedHistory));
      setStorageState("unknown");
    }
  }, [normalizedHistory?.baselineSequence, storageKey]);

  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    const onStorage = (event: StorageEvent) => {
      if (event.key !== storageKey) return;
      try {
        setCursor(resolveHistoryCursor(normalizedHistory, event.newValue));
      } catch {
        setStorageState("unknown");
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [normalizedHistory, storageKey]);

  const latestSequence = normalizedHistory?.latestSequence ?? 0;
  const unreadCount =
    normalizedHistory && storageState === "ready"
      ? getUnreadHistoryCount(normalizedHistory, cursor)
      : null;
  const sortedEvents = useMemo(
    () =>
      normalizedHistory
        ? sortH2AutoHistoryEvents(normalizedHistory.events).reverse()
        : [],
    [normalizedHistory]
  );
  const filteredEvents = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("pt-BR");
    return sortedEvents.filter(event => {
      const category = getH2AutoHistoryCategory(event);
      if (filter !== "todos" && category !== filter) return false;
      if (!needle) return true;
      return `${event.chat} ${event.rule} ${event.time}`
        .toLocaleLowerCase("pt-BR")
        .includes(needle);
    });
  }, [filter, search, sortedEvents]);

  const acknowledgeLatest = () => {
    if (!normalizedHistory || !storageKey || !isDocumentVisible()) return;
    const nextCursor = latestSequence;
    setCursor(nextCursor);
    try {
      window.localStorage.setItem(storageKey, String(nextCursor));
      setStorageState("ready");
    } catch {
      setStorageState("unknown");
    }
  };

  const receivedLabel = formatDate(receivedAt);
  const hasUnread = unreadCount != null && unreadCount > 0;
  const panelId = `h2-auto-history-${deviceId}-${streamId || "pending"}`;

  return (
    <section
      className={`h2-auto-history-panel relative overflow-hidden rounded-2xl border bg-[#071326] p-4 text-white shadow-[0_0_0_1px_rgba(34,211,238,0.08),0_14px_45px_rgba(8,47,73,0.25)] ${
        hasUnread && !isOpen
          ? "h2-auto-history-panel--new"
          : "border-cyan-400/30"
      }`}
    >
      <style>{`
        .h2-auto-history-panel { isolation: isolate; }
        .h2-auto-history-panel::before { content: ""; position: absolute; inset: 0; pointer-events: none; opacity: .08; background: repeating-linear-gradient(180deg, transparent 0, transparent 5px, rgba(103,232,249,.28) 6px); }
        .h2-auto-history-panel--new { border-color: rgba(34,211,238,.88); animation: h2AutoHistoryPulse 1.8s ease-in-out infinite; }
        @keyframes h2AutoHistoryPulse { 0%,100% { box-shadow: 0 0 0 1px rgba(34,211,238,.12), 0 0 18px rgba(34,211,238,.12), 0 14px 45px rgba(8,47,73,.25); } 50% { box-shadow: 0 0 0 1px rgba(217,70,239,.48), 0 0 30px rgba(34,211,238,.38), 0 14px 45px rgba(8,47,73,.3); } }
        @media (prefers-reduced-motion: reduce) { .h2-auto-history-panel--new { animation: none; } }
      `}</style>
      <div className="relative z-10 space-y-4">
        <header className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div
              className="mt-0.5 rounded-xl border border-cyan-300/35 bg-cyan-400/10 p-2 text-cyan-200"
              aria-hidden="true"
            >
              <History className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="font-black tracking-[0.12em] text-cyan-100">
                  HISTÓRICO DE ATENDIMENTO
                </h4>
                {hasUnread && (
                  <span className="rounded-full border border-fuchsia-300/50 bg-fuchsia-400/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-fuchsia-100">
                    NOVO
                  </span>
                )}
              </div>
              <p className="mt-1 break-words text-xs text-slate-300">
                Respostas processadas pelo telefone após sincronização para{" "}
                <strong className="text-cyan-200">{label}</strong>.
              </p>
              <p className="mt-1 text-[11px] text-slate-400">
                Não representa todas as notificações de qualquer aplicativo.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div
              className="rounded-xl border border-fuchsia-300/45 bg-fuchsia-400/10 px-3 py-2 text-center"
              title={
                unreadCount == null
                  ? "Contagem local indisponível"
                  : `${unreadCount} novos registros`
              }
            >
              <div className="font-mono text-lg font-black leading-none text-fuchsia-100">
                {unreadCount == null ? "—" : unreadCount}
              </div>
              <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-fuchsia-200">
                {unreadCount == null ? "estado local" : "novos"}
              </div>
            </div>
            <button
              type="button"
              aria-expanded={isOpen}
              aria-controls={panelId}
              onClick={() => {
                const next = !isOpen;
                if (next) {
                  setFilter("todos");
                  setSearch("");
                  acknowledgeLatest();
                }
                setIsOpen(next);
              }}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-cyan-300/35 bg-cyan-400/10 px-3 py-2 text-xs font-black text-cyan-100 transition hover:border-cyan-200 hover:bg-cyan-300/20 focus:outline-none focus:ring-2 focus:ring-cyan-300/60"
            >
              {isOpen ? "FECHAR" : "ABRIR"}
              <ChevronDown
                className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
                aria-hidden="true"
              />
            </button>
          </div>
        </header>

        <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="rounded-xl border border-cyan-300/15 bg-slate-950/45 p-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
              Registros retidos
            </p>
            <p className="mt-1 font-mono text-xl font-black text-cyan-100">
              {normalizedHistory ? normalizedHistory.events.length : "—"}
            </p>
          </div>
          <div className="rounded-xl border border-violet-300/15 bg-slate-950/45 p-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
              Leitura ADM
            </p>
            <p className="mt-1 text-sm font-bold text-violet-100">
              {unreadCount == null ? "desconhecida" : `${unreadCount} novos`}
            </p>
          </div>
          <div className="rounded-xl border border-cyan-300/15 bg-slate-950/45 p-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
              Recebido pelo ADM
            </p>
            <p className="mt-1 break-words text-xs font-bold text-cyan-100">
              {receivedLabel || "Aguardando APK atualizado e sincronização"}
            </p>
          </div>
        </div>

        {!normalizedHistory && (
          <div className="flex min-w-0 items-start gap-3 rounded-xl border border-amber-300/25 bg-amber-300/5 p-3 text-sm text-amber-100">
            <ShieldAlert
              className="mt-0.5 h-4 w-4 shrink-0"
              aria-hidden="true"
            />
            <p className="min-w-0 break-words">
              Aguardando APK atualizado e sincronização
            </p>
          </div>
        )}

        {isOpen && normalizedHistory && (
          <div
            id={panelId}
            className="min-w-0 space-y-4 border-t border-cyan-300/15 pt-4"
            role="region"
            aria-label={`Histórico de ${label}`}
          >
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-black text-violet-100">
                <Activity
                  className="h-4 w-4 text-fuchsia-300"
                  aria-hidden="true"
                />
                LINHA DO TEMPO
              </div>
              <button
                type="button"
                onClick={acknowledgeLatest}
                disabled={
                  !isDocumentVisible() || latestSequence <= (cursor ?? 0)
                }
                className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-emerald-300/40 bg-emerald-400/10 px-3 py-2 text-xs font-black text-emerald-100 transition hover:bg-emerald-300/20 disabled:cursor-not-allowed disabled:opacity-45"
                title="Salva a leitura somente neste navegador e neste painel administrativo"
              >
                <Eye className="h-4 w-4" aria-hidden="true" />
                MARCAR COMO VISTO
              </button>
            </div>

            <p className="text-xs leading-5 text-slate-300">
              O botão registra a leitura somente para este ADM/navegador e não
              altera a configuração do celular nem o cursor de leitura do
              Android.
            </p>

            {storageState === "unknown" && (
              <p className="rounded-lg border border-amber-300/25 bg-amber-300/5 p-2 text-xs text-amber-100">
                O armazenamento local está indisponível; a leitura permanece
                apenas nesta sessão e a contagem persistente é desconhecida.
              </p>
            )}

            <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div
                className="flex min-w-0 flex-wrap gap-2"
                role="group"
                aria-label="Filtrar histórico"
              >
                {filterOptions.map(option => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={filter === option.value}
                    onClick={() => setFilter(option.value)}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold transition focus:outline-none focus:ring-2 focus:ring-cyan-300/60 ${filter === option.value ? "border-cyan-200/70 bg-cyan-300/20 text-cyan-50" : "border-white/10 bg-white/5 text-slate-300 hover:border-cyan-300/40"}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <label className="relative block min-w-0 lg:w-64">
                <span className="sr-only">Pesquisar no histórico</span>
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="Pesquisar registro"
                  className="min-h-10 w-full min-w-0 rounded-xl border border-cyan-300/20 bg-slate-950/70 py-2 pl-9 pr-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/20"
                />
              </label>
            </div>

            {filteredEvents.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-cyan-300/25 bg-slate-950/35 p-8 text-center">
                <Inbox
                  className="mx-auto h-8 w-8 text-cyan-300/70"
                  aria-hidden="true"
                />
                <p className="mt-3 text-sm font-bold text-cyan-100">
                  Nenhum registro neste recorte
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  O histórico mostra somente respostas processadas pelo telefone
                  que chegaram ao ADM.
                </p>
              </div>
            ) : (
              <div className="min-w-0 space-y-2" aria-live="polite">
                {filteredEvents.map(event => {
                  const category = getH2AutoHistoryCategory(event);
                  const displayTime = eventDateLabel(
                    event.time,
                    event.occurredAt
                  );
                  const avatar =
                    event.chat.trim().charAt(0).toLocaleUpperCase("pt-BR") ||
                    "?";
                  return (
                    <article
                      key={`${event.id}-${event.sequence}`}
                      className="flex min-w-0 items-start gap-3 rounded-xl border border-white/10 bg-slate-950/55 p-3 transition hover:border-cyan-300/35"
                    >
                      <div
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-violet-300/35 bg-violet-400/10 font-black text-violet-100"
                        aria-hidden="true"
                      >
                        {avatar}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-xs font-black text-cyan-100">
                            Contato sincronizado
                          </span>
                          <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                            <Clock3 className="h-3 w-3" aria-hidden="true" />
                            <time>{displayTime}</time>
                          </span>
                        </div>
                        <p className="mt-1 break-words text-sm text-white">
                          {event.chat || "Mensagem sem texto"}
                        </p>
                        {event.rule && (
                          <p className="mt-1 break-words text-xs text-slate-400">
                            Regra processada: {event.rule}
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 rounded-full border border-cyan-300/30 bg-cyan-400/10 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-cyan-100">
                        {h2AutoHistoryCategoryLabel[category]}
                      </span>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {!isOpen && normalizedHistory && (
          <p className="flex items-center gap-2 text-[11px] text-slate-400">
            <Smartphone
              className="h-3.5 w-3.5 text-cyan-300"
              aria-hidden="true"
            />
            Retenção máxima de 80 registros; a consulta é atualizada junto com a
            sincronização do ADM.
            <Sparkles
              className="h-3.5 w-3.5 text-fuchsia-300"
              aria-hidden="true"
            />
          </p>
        )}
        {!isOpen && !normalizedHistory && (
          <p className="flex items-center gap-2 text-[11px] text-slate-500">
            <Filter className="h-3.5 w-3.5" aria-hidden="true" />
            Filtros e linha do tempo serão habilitados após a sincronização.
          </p>
        )}
      </div>
    </section>
  );
}
