import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  AtSign,
  CheckCircle2,
  ClipboardCopy,
  Download,
  Globe2,
  History,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

const CONFIG_KEY = "h2_email_generator_config_v1";
const HISTORY_KEY = "h2_email_generator_history_v3";
const LEGACY_HISTORY_KEY = "h2_email_generator_random_v2";

type GeneratorConfig = {
  prefix: string;
  domains: string[];
  activeDomain: string;
  referenceInbox: string;
};

type HistoryItem = {
  id: string;
  email: string;
  domain: string;
  createdAt: string;
};

const DEFAULT_CONFIG: GeneratorConfig = {
  prefix: "h2walk",
  domains: ["h2colombiano.com"],
  activeDomain: "h2colombiano.com",
  referenceInbox: "h2walk@h2colombiano.com",
};

function normalizeDomain(value: string) {
  let normalized = value.trim().toLowerCase();
  normalized = normalized.replace(/^https?:\/\//, "");
  if (normalized.includes("@")) normalized = normalized.split("@").pop() || "";
  normalized = normalized.split("/")[0].replace(/^\.+|\.+$/g, "");
  return normalized;
}

function isValidDomain(value: string) {
  return /^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(value);
}

function normalizePrefix(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 48);
}

function parseConfig(raw?: string): GeneratorConfig {
  if (!raw) return DEFAULT_CONFIG;
  try {
    const parsed = JSON.parse(raw) as Partial<GeneratorConfig>;
    const domains = Array.isArray(parsed.domains)
      ? Array.from(new Set(parsed.domains.map(item => normalizeDomain(String(item))).filter(isValidDomain)))
      : [];
    const safeDomains = domains.length ? domains : DEFAULT_CONFIG.domains;
    const activeCandidate = normalizeDomain(String(parsed.activeDomain || ""));
    const activeDomain = safeDomains.includes(activeCandidate) ? activeCandidate : safeDomains[0];
    const prefix = normalizePrefix(String(parsed.prefix || DEFAULT_CONFIG.prefix)) || DEFAULT_CONFIG.prefix;
    const referenceInbox = String(parsed.referenceInbox || `${prefix}@${activeDomain}`).trim().toLowerCase();
    return { prefix, domains: safeDomains, activeDomain, referenceInbox };
  } catch {
    return DEFAULT_CONFIG;
  }
}

function loadHistory(): HistoryItem[] {
  if (typeof window === "undefined") return [];
  const read = (key: string) => {
    try {
      return JSON.parse(window.localStorage.getItem(key) || "null");
    } catch {
      return null;
    }
  };

  const current = read(HISTORY_KEY);
  if (current && Array.isArray(current.used)) {
    return current.used
      .filter((item: unknown): item is HistoryItem => Boolean(item && typeof item === "object" && typeof (item as HistoryItem).email === "string"))
      .map((item, index) => ({
        id: item.id || `saved-${index}-${item.createdAt || Date.now()}`,
        email: item.email,
        domain: item.domain || item.email.split("@")[1] || "",
        createdAt: item.createdAt || new Date().toISOString(),
      }));
  }

  const legacy = read(LEGACY_HISTORY_KEY);
  if (legacy && Array.isArray(legacy.used)) {
    return legacy.used
      .filter((item: unknown): item is { email: string; createdAt?: string } => Boolean(item && typeof item === "object" && typeof (item as { email?: unknown }).email === "string"))
      .map((item, index) => ({
        id: `legacy-${index}-${item.createdAt || Date.now()}`,
        email: item.email,
        domain: item.email.split("@")[1] || "",
        createdAt: item.createdAt || new Date().toISOString(),
      }));
  }

  return [];
}

function randomInt(min: number, max: number) {
  const values = new Uint32Array(1);
  globalThis.crypto.getRandomValues(values);
  return min + (values[0] % (max - min + 1));
}

function pick(value: string) {
  return value[randomInt(0, value.length - 1)];
}

function randomName() {
  const consonants = "bcdfghjklmnpqrstvwxyz";
  const vowels = "aeiou";
  const length = randomInt(3, 5);
  let result = "";
  let useConsonant = randomInt(0, 1) === 1;
  for (let index = 0; index < length; index += 1) {
    result += useConsonant ? pick(consonants) : pick(vowels);
    useConsonant = !useConsonant;
  }
  return result;
}

function randomNumber() {
  const length = randomInt(2, 4);
  return randomInt(10 ** (length - 1), 10 ** length - 1);
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("pt-BR");
}

export default function AdminEmailGenerator({ onBack }: { onBack: () => void }) {
  const utils = trpc.useUtils();
  const configQuery = trpc.config.get.useQuery(undefined, { staleTime: 30_000 });
  const saveConfigMutation = trpc.config.set.useMutation({
    onSuccess: async () => {
      await utils.config.get.invalidate();
      toast.success("Configurações do gerador salvas.");
    },
    onError: () => toast.error("Não foi possível salvar as configurações."),
  });

  const hydrated = useRef(false);
  const [config, setConfig] = useState<GeneratorConfig>(DEFAULT_CONFIG);
  const [newDomain, setNewDomain] = useState("");
  const [batchSize, setBatchSize] = useState(1);
  const [currentEmail, setCurrentEmail] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>(() => loadHistory());
  const [search, setSearch] = useState("");
  const [historyDomain, setHistoryDomain] = useState("all");

  useEffect(() => {
    if (hydrated.current || !configQuery.data) return;
    setConfig(parseConfig(configQuery.data[CONFIG_KEY]));
    hydrated.current = true;
  }, [configQuery.data]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify({ used: history }));
  }, [history]);

  const activeDomain = config.domains.includes(config.activeDomain) ? config.activeDomain : config.domains[0];
  const safePrefix = normalizePrefix(config.prefix) || DEFAULT_CONFIG.prefix;
  const formatExample = `${safePrefix}.${randomName()}.${randomNumber()}@${activeDomain}`;

  const filteredHistory = useMemo(() => {
    const term = search.trim().toLowerCase();
    return history.filter(item => {
      if (historyDomain !== "all" && item.domain !== historyDomain) return false;
      if (term && !item.email.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [history, historyDomain, search]);

  const todayCount = useMemo(() => {
    const today = new Date().toDateString();
    return history.filter(item => new Date(item.createdAt).toDateString() === today).length;
  }, [history]);

  const addDomain = () => {
    const domain = normalizeDomain(newDomain);
    if (!isValidDomain(domain)) {
      toast.error("Digite um domínio válido. Ex.: h2colombiano.com");
      return;
    }
    if (config.domains.includes(domain)) {
      setConfig(current => ({ ...current, activeDomain: domain }));
      setNewDomain("");
      toast.info("Esse domínio já existe e foi selecionado.");
      return;
    }
    setConfig(current => ({ ...current, domains: [...current.domains, domain], activeDomain: domain }));
    setNewDomain("");
    toast.success("Domínio adicionado. Clique em Salvar configurações.");
  };

  const removeDomain = (domain: string) => {
    if (config.domains.length <= 1) {
      toast.error("Mantenha pelo menos um domínio cadastrado.");
      return;
    }
    const nextDomains = config.domains.filter(item => item !== domain);
    setConfig(current => ({
      ...current,
      domains: nextDomains,
      activeDomain: current.activeDomain === domain ? nextDomains[0] : current.activeDomain,
    }));
  };

  const saveConfiguration = () => {
    const prefix = normalizePrefix(config.prefix);
    if (!prefix) {
      toast.error("Defina um prefixo válido.");
      return;
    }
    if (!config.domains.length || config.domains.some(domain => !isValidDomain(domain))) {
      toast.error("Revise os domínios cadastrados.");
      return;
    }
    const normalized: GeneratorConfig = {
      ...config,
      prefix,
      activeDomain,
      referenceInbox: config.referenceInbox.trim().toLowerCase(),
    };
    setConfig(normalized);
    saveConfigMutation.mutate({ key: CONFIG_KEY, value: JSON.stringify(normalized) });
  };

  const generate = () => {
    const count = Math.min(50, Math.max(1, Math.trunc(batchSize || 1)));
    const used = new Set(history.map(item => item.email.toLowerCase()));
    const generated: HistoryItem[] = [];

    while (generated.length < count) {
      const email = `${safePrefix}.${randomName()}.${randomNumber()}@${activeDomain}`.toLowerCase();
      if (used.has(email)) continue;
      used.add(email);
      generated.push({
        id: `${Date.now()}-${generated.length}-${randomInt(1000, 9999)}`,
        email,
        domain: activeDomain,
        createdAt: new Date().toISOString(),
      });
    }

    setBatchSize(count);
    setCurrentEmail(generated[0].email);
    setHistory(current => [...generated, ...current]);
    toast.success(count === 1 ? "Novo e-mail gerado." : `${count} e-mails gerados.`);
  };

  const copyEmail = async (email: string) => {
    try {
      await navigator.clipboard.writeText(email);
      setCurrentEmail(email);
      toast.success("E-mail copiado.");
    } catch {
      toast.error("Não foi possível copiar automaticamente.");
    }
  };

  const exportHistory = () => {
    if (!history.length) {
      toast.info("O histórico está vazio.");
      return;
    }
    const lines = history
      .slice()
      .reverse()
      .map((item, index) => `${index + 1}\t${item.email}\t${item.createdAt}`)
      .join("\n");
    const blob = new Blob([lines], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `historico_emails_h2_${new Date().toISOString().slice(0, 10)}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const clearHistory = () => {
    if (!history.length) return;
    if (!window.confirm("Apagar todo o histórico deste navegador?")) return;
    setHistory([]);
    setCurrentEmail("");
    toast.success("Histórico apagado.");
  };

  const deleteHistoryItem = (id: string) => {
    setHistory(current => current.filter(item => item.id !== id));
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#15213a_0,#090d14_42%,#06080d_100%)] text-white">
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-200 transition hover:border-white/20 hover:bg-white/10"
              aria-label="Voltar ao Hub Central"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[#FFD400]">
                <AtSign className="h-4 w-4" /> Ferramenta interna
              </div>
              <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Gerador de E-mails H2</h1>
              <p className="mt-1 text-sm text-slate-400">Gere endereços Catch-All, controle domínios e evite repetições neste navegador.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={saveConfiguration}
            disabled={saveConfigMutation.isPending}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#FFD400] px-4 py-3 text-sm font-black text-[#171003] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saveConfigMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar configurações
          </button>
        </div>

        <div className="grid gap-5 lg:grid-cols-[0.9fr_1.4fr]">
          <section className="space-y-5">
            <div className="rounded-2xl border border-white/10 bg-[#111827]/90 p-4 shadow-2xl sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-sky-300">Configuração</p>
                  <h2 className="mt-1 text-lg font-black">Domínios e formato</h2>
                </div>
                <Globe2 className="h-6 w-6 text-sky-300" />
              </div>

              <label className="mt-5 block text-xs font-bold text-slate-400">Prefixo dos endereços</label>
              <input
                value={config.prefix}
                onChange={event => setConfig(current => ({ ...current, prefix: event.target.value }))}
                onBlur={() => setConfig(current => ({ ...current, prefix: normalizePrefix(current.prefix) || DEFAULT_CONFIG.prefix }))}
                className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-[#090f1a] px-3 text-sm font-bold text-white outline-none transition focus:border-[#FFD400]/70"
                placeholder="h2walk"
              />

              <label className="mt-4 block text-xs font-bold text-slate-400">Caixa de referência / destino do Catch-All</label>
              <input
                value={config.referenceInbox}
                onChange={event => setConfig(current => ({ ...current, referenceInbox: event.target.value }))}
                className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-[#090f1a] px-3 text-sm font-bold text-white outline-none transition focus:border-[#FFD400]/70"
                placeholder="h2walk@h2colombiano.com"
              />

              <label className="mt-4 block text-xs font-bold text-slate-400">Domínio usado agora</label>
              <select
                value={activeDomain}
                onChange={event => setConfig(current => ({ ...current, activeDomain: event.target.value }))}
                className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-[#090f1a] px-3 text-sm font-bold text-white outline-none focus:border-[#FFD400]/70"
              >
                {config.domains.map(domain => <option key={domain} value={domain}>{domain}</option>)}
              </select>

              <div className="mt-4 flex gap-2">
                <input
                  value={newDomain}
                  onChange={event => setNewDomain(event.target.value)}
                  onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); addDomain(); } }}
                  className="h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-[#090f1a] px-3 text-sm text-white outline-none transition focus:border-sky-400/70"
                  placeholder="novo-dominio.com"
                />
                <button type="button" onClick={addDomain} className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-sky-400/30 bg-sky-400/10 px-3 text-xs font-black text-sky-200 hover:bg-sky-400/15">
                  <Plus className="h-4 w-4" /> Adicionar
                </button>
              </div>

              <div className="mt-4 space-y-2">
                {config.domains.map(domain => (
                  <div key={domain} className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 ${domain === activeDomain ? "border-[#FFD400]/45 bg-[#FFD400]/10" : "border-white/8 bg-black/15"}`}>
                    <AtSign className={`h-4 w-4 ${domain === activeDomain ? "text-[#FFD400]" : "text-slate-500"}`} />
                    <span className="min-w-0 flex-1 truncate text-sm font-bold">{domain}</span>
                    {domain !== activeDomain && <button type="button" onClick={() => setConfig(current => ({ ...current, activeDomain: domain }))} className="rounded-lg px-2 py-1 text-[11px] font-black text-sky-300 hover:bg-sky-400/10">Usar</button>}
                    <button type="button" onClick={() => removeDomain(domain)} className="grid h-8 w-8 place-items-center rounded-lg text-rose-300 hover:bg-rose-400/10" aria-label={`Remover ${domain}`}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-3 text-xs leading-5 text-amber-100/80">
                Adicionar um domínio aqui não cria o Catch-All no provedor de e-mail. O domínio precisa estar configurado para entregar os aliases na caixa de referência.
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#111827]/90 p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-5 w-5 text-emerald-300" />
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-emerald-300">Formato ativo</p>
                  <p className="mt-1 break-all text-sm font-bold text-slate-200">{safePrefix}.nome.numero@{activeDomain}</p>
                </div>
              </div>
              <div className="mt-3 rounded-xl border border-white/8 bg-black/20 p-3">
                <p className="text-[11px] font-bold uppercase text-slate-500">Exemplo</p>
                <p className="mt-1 break-all text-sm font-black text-white">{formatExample}</p>
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-400">Nome aleatório com 3 a 5 letras e número variável com 2 a 4 dígitos.</p>
            </div>
          </section>

          <section className="space-y-5">
            <div className="rounded-2xl border border-[#FFD400]/20 bg-[#111827]/95 p-4 shadow-2xl sm:p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[#FFD400]">E-mail gerado</p>
                  <p className="mt-2 min-h-7 break-all text-xl font-black sm:text-2xl">{currentEmail || "Clique em Gerar"}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => currentEmail && copyEmail(currentEmail)}
                    disabled={!currentEmail}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs font-black text-white hover:bg-white/10 disabled:opacity-40"
                  >
                    <ClipboardCopy className="h-4 w-4" /> Copiar
                  </button>
                </div>
              </div>

              <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-white/8 bg-black/20 p-3 sm:flex-row sm:items-end">
                <div className="sm:w-32">
                  <label className="text-[11px] font-bold uppercase text-slate-500">Quantidade</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={batchSize}
                    onChange={event => setBatchSize(Math.min(50, Math.max(1, Number(event.target.value) || 1)))}
                    className="mt-1.5 h-11 w-full rounded-xl border border-white/10 bg-[#090f1a] px-3 text-center text-sm font-black text-white outline-none focus:border-[#FFD400]/70"
                  />
                </div>
                <button type="button" onClick={generate} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#FFD400] px-5 text-sm font-black text-[#171003] transition hover:brightness-105">
                  <RefreshCw className="h-4 w-4" /> {batchSize > 1 ? `Gerar ${batchSize}` : "Gerar novo"}
                </button>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-white/8 bg-black/20 p-3"><p className="text-[10px] font-black uppercase text-slate-500">Total</p><p className="mt-1 text-lg font-black">{history.length}</p></div>
                <div className="rounded-xl border border-white/8 bg-black/20 p-3"><p className="text-[10px] font-black uppercase text-slate-500">Hoje</p><p className="mt-1 text-lg font-black">{todayCount}</p></div>
                <div className="rounded-xl border border-white/8 bg-black/20 p-3"><p className="text-[10px] font-black uppercase text-slate-500">Domínios</p><p className="mt-1 text-lg font-black">{config.domains.length}</p></div>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#111827]/95">
              <div className="border-b border-white/8 p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <History className="h-5 w-5 text-sky-300" />
                    <div><p className="font-black">Histórico</p><p className="text-xs text-slate-500">Salvo automaticamente neste navegador.</p></div>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={exportHistory} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-[11px] font-black text-slate-200 hover:bg-white/10"><Download className="h-3.5 w-3.5" /> Exportar</button>
                    <button type="button" onClick={clearHistory} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-400/20 bg-rose-400/[0.07] px-2.5 py-2 text-[11px] font-black text-rose-200 hover:bg-rose-400/10"><Trash2 className="h-3.5 w-3.5" /> Limpar</button>
                  </div>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_210px]">
                  <label className="relative block">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <input value={search} onChange={event => setSearch(event.target.value)} className="h-10 w-full rounded-xl border border-white/10 bg-[#090f1a] pl-9 pr-3 text-sm text-white outline-none focus:border-sky-400/60" placeholder="Buscar e-mail..." />
                  </label>
                  <select value={historyDomain} onChange={event => setHistoryDomain(event.target.value)} className="h-10 rounded-xl border border-white/10 bg-[#090f1a] px-3 text-xs font-bold text-white outline-none focus:border-sky-400/60">
                    <option value="all">Todos os domínios</option>
                    {config.domains.map(domain => <option key={domain} value={domain}>{domain}</option>)}
                  </select>
                </div>
              </div>

              <div className="max-h-[460px] overflow-y-auto">
                {!filteredHistory.length ? (
                  <div className="p-8 text-center text-sm text-slate-500">Nenhum e-mail encontrado.</div>
                ) : filteredHistory.map((item, index) => (
                  <div key={item.id} className="grid grid-cols-[42px_1fr_auto] items-center gap-2 border-b border-white/[0.055] px-3 py-3 last:border-0 sm:grid-cols-[58px_1fr_165px_auto] sm:px-4">
                    <span className="text-xs font-bold text-slate-600">#{history.length - history.indexOf(item)}</span>
                    <button type="button" onClick={() => copyEmail(item.email)} className="min-w-0 text-left">
                      <span className="block break-all text-sm font-bold text-slate-100 hover:text-[#FFD400]">{item.email}</span>
                      <span className="mt-1 block text-[10px] font-medium text-slate-600 sm:hidden">{formatDate(item.createdAt)}</span>
                    </button>
                    <span className="hidden text-right text-[11px] text-slate-500 sm:block">{formatDate(item.createdAt)}</span>
                    <button type="button" onClick={() => deleteHistoryItem(item.id)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-600 hover:bg-rose-400/10 hover:text-rose-300" aria-label="Excluir do histórico"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.045] p-4 text-xs leading-5 text-slate-300">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
              <p>Os domínios e o prefixo são salvos no sistema do ADM. O histórico dos endereços gerados permanece local neste navegador para evitar repetição sem transformar o banco de configurações em uma lista crescente de e-mails.</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
