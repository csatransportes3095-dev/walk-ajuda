import { useEffect, useState } from "react";
import { ArrowLeft, BatteryFull, Calculator, ExternalLink, Globe2, Home, Info, Plus, Settings, Smartphone, StickyNote, Trash2 } from "lucide-react";

type Screen = "home" | "catalog" | "browser" | "notes" | "calculator" | "info";
type Shortcut = { id: string; title: string; url: string };
const STORAGE_KEY = "h2-android-html-webphone-v1";
const MAX_SHORTCUTS = 16;

function normalizeWebUrl(raw: string): string | null {
  try {
    const value = raw.trim();
    if (!value || value.length > 500) return null;
    const url = new URL(/^https:\/\//i.test(value) ? value : "https://" + value);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

function isShortcut(value: unknown): value is Shortcut {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<Shortcut>;
  return typeof item.id === "string" && item.id.length <= 64 &&
    typeof item.title === "string" && item.title.length <= 28 &&
    typeof item.url === "string" && normalizeWebUrl(item.url) === item.url;
}

const builtinApps: Array<{ screen: Screen; label: string; Icon: typeof Globe2; color: string }> = [
  { screen: "browser", label: "Navegador", Icon: Globe2, color: "bg-sky-500/25 text-sky-200" },
  { screen: "catalog", label: "Apps web", Icon: Plus, color: "bg-emerald-500/25 text-emerald-200" },
  { screen: "notes", label: "Notas", Icon: StickyNote, color: "bg-amber-500/25 text-amber-100" },
  { screen: "calculator", label: "Calculadora", Icon: Calculator, color: "bg-violet-500/25 text-violet-200" },
  { screen: "info", label: "Ajustes", Icon: Settings, color: "bg-slate-400/20 text-slate-100" },
];

export default function H2AndroidWebSimulator() {
  const [screen, setScreen] = useState<Screen>("home");
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);
  const [notes, setNotes] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [shortcutName, setShortcutName] = useState("");
  const [shortcutUrl, setShortcutUrl] = useState("");
  const [browserUrl, setBrowserUrl] = useState("https://");
  const [notice, setNotice] = useState("");
  const [numberA, setNumberA] = useState("");
  const [numberB, setNumberB] = useState("");
  const [operation, setOperation] = useState("+");

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved: unknown = JSON.parse(raw);
        if (saved && typeof saved === "object") {
          const data = saved as { shortcuts?: unknown; notes?: unknown };
          if (Array.isArray(data.shortcuts)) {
            setShortcuts(data.shortcuts.filter(isShortcut).slice(0, MAX_SHORTCUTS));
          }
          if (typeof data.notes === "string") setNotes(data.notes.slice(0, 12000));
        }
      }
    } catch {
      // Browser storage can be disabled; the HTML phone still works for this visit.
    }
    setLoaded(true);
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ shortcuts, notes }));
    } catch {
      // No server-side copy, credential, or automatic upload.
    }
  }, [loaded, shortcuts, notes]);

  const openPage = (next: Screen) => {
    setNotice("");
    setScreen(next);
  };

  const addShortcut = () => {
    const title = shortcutName.trim();
    const url = normalizeWebUrl(shortcutUrl);
    if (title.length < 2 || title.length > 28 || !url) {
      setNotice("Informe um nome de 2 a 28 caracteres e um endereço HTTPS válido.");
      return;
    }
    if (shortcuts.length >= MAX_SHORTCUTS) {
      setNotice("Limite de 16 atalhos web neste navegador.");
      return;
    }
    if (shortcuts.some(item => item.url === url)) {
      setNotice("Este site já está na tela inicial.");
      return;
    }
    setShortcuts(current => [...current, { id: String(Date.now()) + "-" + Math.random().toString(36).slice(2, 8), title, url }]);
    setShortcutName("");
    setShortcutUrl("");
    setNotice("Atalho web adicionado. Ele abre o site em outra aba.");
    setScreen("home");
  };

  const result = (() => {
    if (!numberA.trim() || !numberB.trim()) return null;
    const a = Number(numberA);
    const b = Number(numberB);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    const output = operation === "+" ? a + b : operation === "-" ? a - b : operation === "×" ? a * b : b === 0 ? NaN : a / b;
    return Number.isFinite(output) ? output : null;
  })();

  return (
    <section className="space-y-5" aria-label="Simulador de celular HTML">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-[#2b594e] bg-[#10231f] px-4 py-4">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#91e5c2]">H2 Android · versão web</p>
          <h2 className="mt-1 text-xl font-extrabold text-white">Celular HTML — sem instalar nada</h2>
          <p className="mt-2 max-w-2xl text-xs leading-relaxed text-[#b7cec6]">
            Funciona no próprio navegador: tela de celular, notas, calculadora, navegação e atalhos para sites.
            Não é um sistema Android e não instala APK, Google Play, Uber Motorista ou WhatsApp Android.
          </p>
        </div>
        <span className="rounded-full border border-[#6ac7a1]/35 bg-[#6ac7a1]/10 px-3 py-1 text-xs font-bold text-[#a8edd0]">100% HTML</span>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="rounded-2xl border border-white/10 bg-[#101a26] p-4 sm:p-6">
          <h3 className="text-sm font-bold text-white">Como funciona</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">
            Abra os apps pelo celular virtual. Em <strong>Apps web</strong>, cadastre qualquer site HTTPS para criar um atalho na tela inicial. O site será aberto em uma nova aba porque serviços externos podem bloquear exibição dentro de outro site.
          </p>
          <p className="mt-3 text-xs leading-relaxed text-slate-400">
            Seus atalhos e notas ficam apenas no armazenamento deste navegador. Não são enviados ao servidor e não aparecem automaticamente em outros computadores.
          </p>
          <div className="mt-5 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-3 text-xs leading-relaxed text-amber-100">
            Para executar aplicativos APK de verdade, é necessário um Android real. O sistema Hyper-V existente continua separado e não foi modificado por esta versão HTML.
          </div>
        </div>

        <div className="mx-auto w-full max-w-[340px] rounded-[40px] border-[7px] border-[#344050] bg-[#060a12] p-[5px] shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
          <div className="relative flex h-[675px] flex-col overflow-hidden rounded-[30px] bg-gradient-to-br from-[#19283c] via-[#14243a] to-[#0a1322] text-white">
            <div className="pointer-events-none absolute left-1/2 top-0 z-10 h-[18px] w-[100px] -translate-x-1/2 rounded-b-[15px] bg-[#05080f]" />
            <div className="relative z-10 flex h-[35px] shrink-0 items-end justify-between px-6 pb-1 text-[11px] font-semibold">
              <time>{now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</time>
              <div className="flex items-center gap-1.5"><span className="text-[9px] tracking-wide">WEB</span><BatteryFull className="h-4 w-4" /></div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-3 pt-4">
              {screen === "home" && (
                <div className="space-y-5">
                  <div className="rounded-[25px] bg-gradient-to-r from-[#316b77]/50 to-[#3c4f91]/45 px-4 py-6">
                    <div className="text-[39px] font-light leading-none tabular-nums">{now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div>
                    <p className="mt-2 text-xs capitalize text-slate-200">{now.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}</p>
                    <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#a8edd0]">H2 celular web</p>
                  </div>
                  {notice && <p className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-2 text-[11px] text-emerald-200" role="status">{notice}</p>}
                  <div className="grid grid-cols-4 gap-x-2 gap-y-5">
                    {builtinApps.map(({ screen: page, label, Icon, color }) => (
                      <button key={page} type="button" onClick={() => openPage(page)} className="flex min-w-0 flex-col items-center gap-2 text-center">
                        <span className={"flex h-12 w-12 items-center justify-center rounded-2xl shadow-lg " + color}><Icon className="h-6 w-6" /></span>
                        <span className="max-w-full truncate text-[10px] font-semibold">{label}</span>
                      </button>
                    ))}
                    {shortcuts.map(shortcut => (
                      <a key={shortcut.id} href={shortcut.url} target="_blank" rel="noopener noreferrer" className="flex min-w-0 flex-col items-center gap-2 text-center" title={"Abrir site " + shortcut.url}>
                        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#1d7a8d] text-xl font-black text-white shadow-lg">{shortcut.title.slice(0, 1).toUpperCase()}</span>
                        <span className="max-w-full truncate text-[10px] font-semibold">{shortcut.title}</span>
                      </a>
                    ))}
                  </div>
                  <p className="pt-2 text-center text-[10px] text-slate-400">Os ícones adicionados são links para sites web.</p>
                </div>
              )}

              {screen === "catalog" && (
                <div className="space-y-4">
                  <h3 className="text-xl font-extrabold">Adicionar app web</h3>
                  <p className="text-xs text-slate-300">Crie um atalho para um site HTTPS. Não instala APK.</p>
                  <label className="block space-y-1 text-xs font-semibold">Nome do atalho
                    <input value={shortcutName} maxLength={28} onChange={event => setShortcutName(event.target.value)} placeholder="Ex.: Meu sistema" className="w-full rounded-xl border border-white/20 bg-[#0c1728] px-3 py-3 text-sm text-white outline-none focus:border-emerald-300" />
                  </label>
                  <label className="block space-y-1 text-xs font-semibold">Endereço do site
                    <input value={shortcutUrl} maxLength={500} onChange={event => setShortcutUrl(event.target.value)} placeholder="https://exemplo.com" inputMode="url" className="w-full rounded-xl border border-white/20 bg-[#0c1728] px-3 py-3 text-sm text-white outline-none focus:border-emerald-300" />
                  </label>
                  <button type="button" onClick={addShortcut} className="w-full rounded-xl bg-[#8ce2bd] px-3 py-3 text-sm font-extrabold text-[#09241b]">Adicionar à tela inicial</button>
                  {notice && <p className="text-xs text-amber-200" role="status">{notice}</p>}
                  <div className="space-y-2 pt-3">
                    <p className="text-xs font-bold">Atalhos instalados ({shortcuts.length}/{MAX_SHORTCUTS})</p>
                    {shortcuts.length === 0 && <p className="text-xs text-slate-400">Nenhum atalho adicionado.</p>}
                    {shortcuts.map(shortcut => (
                      <div key={shortcut.id} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-bold">{shortcut.title}</p>
                          <p className="truncate text-[10px] text-slate-400">{shortcut.url}</p>
                        </div>
                        <button type="button" title={"Remover " + shortcut.title} aria-label={"Remover " + shortcut.title} onClick={() => setShortcuts(current => current.filter(item => item.id !== shortcut.id))} className="rounded-lg p-2 text-rose-300 hover:bg-white/10"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {screen === "browser" && (
                <div className="space-y-4">
                  <h3 className="flex items-center gap-2 text-xl font-extrabold"><Globe2 className="h-5 w-5 text-sky-300" /> Navegador</h3>
                  <p className="text-xs text-slate-300">Digite um endereço. Por segurança e compatibilidade, o site abre em outra aba.</p>
                  <label className="block space-y-1 text-xs font-semibold">URL HTTPS
                    <input value={browserUrl} maxLength={500} onChange={event => setBrowserUrl(event.target.value)} inputMode="url" className="w-full rounded-xl border border-white/20 bg-[#0c1728] px-3 py-3 text-xs text-white outline-none focus:border-sky-300" />
                  </label>
                  <a href={normalizeWebUrl(browserUrl) ?? "#"} target="_blank" rel="noopener noreferrer" onClick={event => { if (!normalizeWebUrl(browserUrl)) { event.preventDefault(); setNotice("Endereço HTTPS inválido."); } }} className="flex items-center justify-center gap-2 rounded-xl bg-[#83cbf4] px-3 py-3 text-sm font-extrabold text-[#072233]"><ExternalLink className="h-4 w-4" /> Abrir site</a>
                  <button type="button" onClick={() => { setShortcutUrl(browserUrl); openPage("catalog"); }} className="w-full rounded-xl border border-white/20 px-3 py-3 text-sm font-semibold">Criar atalho deste site</button>
                  {notice && <p className="text-xs text-amber-200" role="status">{notice}</p>}
                </div>
              )}

              {screen === "notes" && (
                <div className="space-y-3">
                  <h3 className="flex items-center gap-2 text-xl font-extrabold"><StickyNote className="h-5 w-5 text-amber-300" /> Notas</h3>
                  <p className="text-xs text-slate-300">Anotações salvas somente neste navegador.</p>
                  <textarea value={notes} onChange={event => setNotes(event.target.value)} maxLength={12000} placeholder="Escreva aqui..." className="h-[410px] w-full resize-none rounded-xl border border-white/20 bg-[#0c1728] p-3 text-sm leading-relaxed text-white outline-none focus:border-amber-300" />
                  <p className="text-right text-[10px] text-slate-400">{notes.length}/12000 caracteres</p>
                </div>
              )}

              {screen === "calculator" && (
                <div className="space-y-4">
                  <h3 className="flex items-center gap-2 text-xl font-extrabold"><Calculator className="h-5 w-5 text-violet-300" /> Calculadora</h3>
                  <label className="block space-y-1 text-xs">Primeiro número
                    <input type="number" value={numberA} onChange={event => setNumberA(event.target.value)} className="w-full rounded-xl border border-white/20 bg-[#0c1728] px-3 py-3 text-lg text-white" />
                  </label>
                  <label className="block space-y-1 text-xs">Operação
                    <select value={operation} onChange={event => setOperation(event.target.value)} className="w-full rounded-xl border border-white/20 bg-[#0c1728] px-3 py-3 text-lg text-white">
                      <option value="+">Somar (+)</option><option value="-">Subtrair (-)</option><option value="×">Multiplicar (×)</option><option value="÷">Dividir (÷)</option>
                    </select>
                  </label>
                  <label className="block space-y-1 text-xs">Segundo número
                    <input type="number" value={numberB} onChange={event => setNumberB(event.target.value)} className="w-full rounded-xl border border-white/20 bg-[#0c1728] px-3 py-3 text-lg text-white" />
                  </label>
                  <div className="rounded-xl border border-violet-300/30 bg-violet-400/10 p-4">
                    <p className="text-[11px] text-violet-200">Resultado</p>
                    <p className="mt-1 break-all text-2xl font-bold tabular-nums">{result === null ? "—" : result.toLocaleString("pt-BR", { maximumFractionDigits: 8 })}</p>
                  </div>
                </div>
              )}

              {screen === "info" && (
                <div className="space-y-4">
                  <h3 className="flex items-center gap-2 text-xl font-extrabold"><Info className="h-5 w-5 text-emerald-300" /> Sobre este celular</h3>
                  <div className="space-y-2 rounded-xl border border-white/10 bg-[#0c1728] p-4 text-xs leading-relaxed text-slate-300">
                    <p><strong className="text-white">Motor:</strong> HTML + JavaScript no navegador</p>
                    <p><strong className="text-white">Instalações:</strong> nenhuma no computador</p>
                    <p><strong className="text-white">Apps:</strong> notas, calculadora e atalhos web</p>
                    <p><strong className="text-white">APK/Google Play:</strong> não suportados</p>
                    <p><strong className="text-white">Proxy por aparelho:</strong> não suportado nesta versão web</p>
                    <p><strong className="text-white">Android real H2:</strong> não modificado</p>
                  </div>
                </div>
              )}
            </div>

            <nav className="flex h-[55px] shrink-0 items-center justify-around border-t border-white/10 bg-black/30 px-10" aria-label="Navegação do celular">
              <button type="button" onClick={() => openPage("home")} aria-label="Voltar" title="Voltar à tela inicial" className="rounded-lg p-2 text-slate-300 hover:bg-white/10"><ArrowLeft className="h-5 w-5" /></button>
              <button type="button" onClick={() => openPage("home")} aria-label="Início" title="Início" className="rounded-full border border-white/50 p-2 text-slate-100 hover:bg-white/10"><Home className="h-4 w-4" /></button>
              <button type="button" onClick={() => openPage("catalog")} aria-label="Aplicativos web" title="Aplicativos web" className="rounded-lg p-2 text-slate-300 hover:bg-white/10"><Smartphone className="h-5 w-5" /></button>
            </nav>
          </div>
        </div>
      </div>
    </section>
  );
}
