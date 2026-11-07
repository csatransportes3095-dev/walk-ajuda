import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ArrowLeft, Home, Keyboard, MonitorPlay, Power, PowerOff, RefreshCcw, Router, Smartphone, Plus, MousePointerClick } from "lucide-react";

type Agent = {
  id: string;
  computerName: string;
  agentVersion: string;
  online: boolean;
  avdNames: string[];
  runningAvds: string[];
};
type Command = {
  id: string; agentId: string; avdName: string; commandType: string;
  status: string; resultText: string | null; createdAt: string;
};

const H2_NAME = /^H2Android_[0-9]{2,3}$/;

export default function H2AndroidLiveManager({
  agents, commands, refresh,
}: {
  agents: Agent[];
  commands: Command[];
  refresh: () => void;
}) {
  const [selectedKey, setSelectedKey] = useState("");
  const [frameTick, setFrameTick] = useState(0);
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [watching, setWatching] = useState(false);
  const [proxyHost, setProxyHost] = useState("");
  const [proxyPort, setProxyPort] = useState("");
  const [creating, setCreating] = useState(false);
  const utils = trpc.useUtils();
  const mutation = trpc.h2Android.control.useMutation({
    onSuccess: () => {
      toast.success("Comando enviado ao agente Windows.");
      void utils.h2Android.overview.invalidate();
      refresh();
    },
    onError: error => toast.error(error.message),
  });
  const ready = agents.filter(agent => agent.online && /^0\.(?:[2-9]|[1-9][0-9])\./.test(agent.agentVersion));
  const devices = ready.flatMap(agent =>
    agent.avdNames.filter(name => H2_NAME.test(name)).map(name => ({
      key: agent.id + ":" + name, agent, name, running: agent.runningAvds.includes(name),
    }))
  );
  const chosen = devices.find(d => d.key === selectedKey) ?? devices[0] ?? null;
  const latest = commands.filter(c => chosen && c.agentId === chosen.agent.id && c.avdName === chosen.name).slice(0, 3);

  useEffect(() => {
    if (!watching || !chosen?.running) return;
    const interval = window.setInterval(() => setFrameTick(t => t + 1), 3000);
    return () => window.clearInterval(interval);
  }, [watching, chosen?.running, chosen?.key]);

  useEffect(() => {
    setFrameLoaded(false);
  }, [chosen?.key]);

  const frameUrl = chosen && watching && chosen.running
    ? "/api/h2-android/screen/" + chosen.agent.id + "/" + chosen.name + "?t=" + frameTick
    : "";

  function sendKey(key: "BACK" | "HOME" | "ENTER" | "POWER") {
    if (!chosen || !chosen.running) return;
    mutation.mutate({ action: "key", agentId: chosen.agent.id, avdName: chosen.name, key });
  }

  function tap(event: React.MouseEvent<HTMLImageElement>) {
    if (!chosen || !chosen.running || !frameLoaded) return;
    const image = event.currentTarget;
    const bounds = image.getBoundingClientRect();
    if (!image.naturalWidth || !image.naturalHeight || !bounds.width || !bounds.height) return;
    const x = Math.max(0, Math.min(5000, Math.round((event.clientX - bounds.left) / bounds.width * image.naturalWidth)));
    const y = Math.max(0, Math.min(10000, Math.round((event.clientY - bounds.top) / bounds.height * image.naturalHeight)));
    mutation.mutate({ action: "tap", agentId: chosen.agent.id, avdName: chosen.name, x, y });
  }

  function createNext() {
    const agent = ready[0];
    if (!agent) return toast.error("Atualize o agente Windows primeiro.");
    const known = new Set(agent.avdNames);
    let next = "";
    for (let i = 1; i <= 999; i++) {
      const name = "H2Android_" + String(i).padStart(2, "0");
      if (!known.has(name)) { next = name; break; }
    }
    if (!next) return toast.error("Limite de nomes disponiveis.");
    mutation.mutate({ action: "create", agentId: agent.id, avdName: next });
    setCreating(false);
  }

  return (
    <section className="space-y-4 rounded-2xl border border-cyan-300/35 bg-[#0c1526] p-4 sm:p-5" aria-label="Controle real de Androids pelo site">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-black text-cyan-100">
            <MonitorPlay className="h-5 w-5" /> Androids virtuais — controle pelo site
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-300">
            Android real executado no computador pareado, com tela e toques pelo navegador.
            Nao e preciso abrir Android Studio.
          </p>
        </div>
        <button type="button" onClick={() => { refresh(); setFrameTick(t => t + 1); }}
          className="rounded-lg border border-white/20 px-3 py-2 text-xs font-bold hover:bg-white/10">
          <RefreshCcw className="mr-1 inline h-4 w-4" /> Atualizar
        </button>
      </div>

      {ready.length === 0 ? (
        <div className="rounded-xl border border-amber-400/25 bg-amber-400/10 p-4 text-sm text-amber-100">
          <p className="font-black">Atualizacao unica do agente Windows</p>
          <p className="mt-2 text-xs leading-relaxed">
            O agente antigo informa apenas diagnosticos. Baixe novamente o
            <strong> Instalador H2 Android ZIP</strong> na secao abaixo e execute
            <strong> Instalar-H2-Android.cmd</strong>. O pareamento existente sera preservado.
            Depois disso os comandos funcionarao pelo site, sem usar Android Studio.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setCreating(true)} disabled={mutation.isPending}
              className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-black text-slate-950 disabled:opacity-50">
              <Plus className="mr-1 inline h-4 w-4" /> Novo Android
            </button>
            {creating && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-300">Criar aparelho isolado com Android 15?</span>
                <button type="button" onClick={createNext} className="rounded-lg border border-emerald-400 px-3 py-2 text-xs font-bold text-emerald-200">Confirmar</button>
                <button type="button" onClick={() => setCreating(false)} className="rounded-lg border border-white/20 px-3 py-2 text-xs">Cancelar</button>
              </div>
            )}
          </div>
          {devices.length === 0 ? (
            <p className="rounded-xl border border-white/10 p-4 text-xs text-slate-300">
              Nenhum Android H2 detectado. Clique em <strong>Novo Android</strong> para criar o primeiro pelo site.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {devices.map(d => (
                  <button key={d.key} type="button"
                    onClick={() => { setSelectedKey(d.key); setWatching(false); setFrameLoaded(false); }}
                    className={"rounded-lg border px-3 py-2 text-xs font-bold " + (d.key === chosen?.key ? "border-cyan-300 bg-cyan-300/15 text-white" : "border-white/15 text-slate-300")}>
                    <Smartphone className="mr-1 inline h-3.5 w-3.5" />
                    {d.name} · {d.running ? "Ligado" : "Desligado"}
                  </button>
                ))}
              </div>
              {chosen && (
                <div className="grid gap-4 lg:grid-cols-[minmax(250px,390px)_minmax(0,1fr)]">
                  <div className="space-y-3">
                    <div className="mx-auto max-w-[360px] overflow-hidden rounded-[2rem] border-[7px] border-slate-600 bg-black shadow-2xl">
                      <div className="relative flex min-h-[410px] items-center justify-center bg-[#080c15]">
                        {frameUrl ? (
                          <img
                            key={frameUrl}
                            src={frameUrl}
                            alt={"Tela real do " + chosen.name}
                            onLoad={() => setFrameLoaded(true)}
                            onError={() => setFrameLoaded(false)}
                            onClick={tap}
                            draggable={false}
                            className="w-full cursor-crosshair select-none object-contain"
                          />
                        ) : (
                          <div className="p-6 text-center text-xs text-slate-400">
                            <Smartphone className="mx-auto mb-3 h-12 w-12 text-cyan-300/50" />
                            {chosen.running ? "Clique em Abrir tela para ver e tocar no Android." : "Android desligado."}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <button type="button" disabled={!chosen.running} onClick={() => { setWatching(w => !w); setFrameTick(t => t + 1); }}
                        className="rounded-lg border border-cyan-400/40 px-3 py-2 text-xs font-bold text-cyan-100 disabled:opacity-30">
                        {watching ? "Fechar tela" : "Abrir tela"}
                      </button>
                      <button type="button" disabled={!chosen.running} onClick={() => sendKey("BACK")} className="rounded-lg border border-white/20 p-2 disabled:opacity-30" title="Voltar"><ArrowLeft className="h-5 w-5" /></button>
                      <button type="button" disabled={!chosen.running} onClick={() => sendKey("HOME")} className="rounded-lg border border-white/20 p-2 disabled:opacity-30" title="Inicio"><Home className="h-5 w-5" /></button>
                      <button type="button" disabled={!chosen.running} onClick={() => sendKey("ENTER")} className="rounded-lg border border-white/20 p-2 disabled:opacity-30" title="Enter"><Keyboard className="h-5 w-5" /></button>
                      <button type="button" disabled={!chosen.running} onClick={() => sendKey("POWER")} className="rounded-lg border border-white/20 p-2 disabled:opacity-30" title="Botao de energia"><Power className="h-5 w-5" /></button>
                    </div>
                    <p className="text-center text-[11px] text-slate-400"><MousePointerClick className="mr-1 inline h-3 w-3" /> Clique ou toque diretamente na imagem para interagir.</p>
                  </div>
                  <div className="space-y-4">
                    <div className="rounded-xl border border-white/10 bg-black/25 p-4">
                      <p className="text-sm font-black">{chosen.name}</p>
                      <p className="mt-1 text-xs text-slate-400">Computador: {chosen.agent.computerName}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" disabled={chosen.running || mutation.isPending}
                          onClick={() => mutation.mutate({ action: "start", agentId: chosen.agent.id, avdName: chosen.name })}
                          className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-black text-slate-950 disabled:opacity-30">
                          <Power className="mr-1 inline h-4 w-4" /> Ligar
                        </button>
                        <button type="button" disabled={!chosen.running || mutation.isPending}
                          onClick={() => mutation.mutate({ action: "stop", agentId: chosen.agent.id, avdName: chosen.name })}
                          className="rounded-lg border border-rose-400/40 px-4 py-2 text-xs font-bold text-rose-200 disabled:opacity-30">
                          <PowerOff className="mr-1 inline h-4 w-4" /> Desligar
                        </button>
                      </div>
                    </div>
                    <form onSubmit={e => {
                      e.preventDefault();
                      const port = proxyPort.trim() ? Number(proxyPort) : 0;
                      mutation.mutate({ action: "proxy", agentId: chosen.agent.id, avdName: chosen.name, host: proxyHost.trim(), port });
                    }} className="rounded-xl border border-white/10 bg-black/25 p-4">
                      <h3 className="flex items-center gap-2 text-sm font-black"><Router className="h-4 w-4" /> Proxy individual HTTP</h3>
                      <p className="mt-1 text-[11px] text-slate-400">Configuracao por aparelho. Desligue antes de salvar; a configuracao vale na proxima inicializacao.</p>
                      <div className="mt-3 grid grid-cols-[1fr_95px] gap-2">
                        <input aria-label="Host do proxy" placeholder="IP ou dominio" value={proxyHost} onChange={e => setProxyHost(e.target.value)}
                          className="min-w-0 rounded-lg border border-white/20 bg-slate-950 px-3 py-2 text-sm" maxLength={253} />
                        <input aria-label="Porta do proxy" placeholder="Porta" value={proxyPort} onChange={e => setProxyPort(e.target.value)}
                          className="min-w-0 rounded-lg border border-white/20 bg-slate-950 px-3 py-2 text-sm" inputMode="numeric" maxLength={5} />
                      </div>
                      <button type="submit" disabled={chosen.running || mutation.isPending} className="mt-3 rounded-lg border border-cyan-400/40 px-3 py-2 text-xs font-bold text-cyan-100 disabled:opacity-30">
                        Salvar proxy / remover se vazio
                      </button>
                      <p className="mt-2 text-[11px] text-amber-200">
                        Nesta versao: proxy HTTP sem usuario/senha. SOCKS5 e roteamento integral ainda nao estao disponiveis.
                      </p>
                    </form>
                    <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                      <h3 className="text-xs font-black">Ultimos comandos do aparelho</h3>
                      {latest.length ? latest.map(c => (
                        <p key={c.id} className="mt-2 text-[11px] text-slate-300">
                          {c.commandType} · <strong>{c.status}</strong>{c.resultText ? " — " + c.resultText : ""}
                        </p>
                      )) : <p className="mt-2 text-[11px] text-slate-400">Nenhum comando enviado ainda.</p>}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
