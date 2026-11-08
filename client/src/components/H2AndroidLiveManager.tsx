import { useEffect, useRef, useState } from "react";
import { startAndroidScreenStream, type AndroidScreenFrame, type AndroidScreenStream } from "@/lib/androidScreenStream";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ArrowLeft, Home, Keyboard, MonitorPlay, Power, PowerOff, RefreshCcw, Smartphone, Plus, MousePointerClick } from "lucide-react";

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
  const [frame, setFrame] = useState<(AndroidScreenFrame & { deviceKey: string }) | null>(null);
  const screenStream = useRef<AndroidScreenStream | null>(null);
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [watching, setWatching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [isoPath, setIsoPath] = useState("");
  const [isoSha256, setIsoSha256] = useState("");
  const [allowUnsignedBoot, setAllowUnsignedBoot] = useState(false);
  const utils = trpc.useUtils();
  const mutation = trpc.h2Android.control.useMutation({
    onSuccess: () => {
      toast.success("Comando enviado ao agente Windows.");
      void utils.h2Android.overview.invalidate();
      refresh();
    },
    onError: error => toast.error(error.message),
  });
  const ready = agents.filter(agent => agent.online && agent.agentVersion === "0.3.0-native");
  const devices = ready.flatMap(agent =>
    agent.avdNames.filter(name => H2_NAME.test(name)).map(name => ({
      key: agent.id + ":" + name, agent, name, running: agent.runningAvds.includes(name),
    }))
  );
  const chosen = devices.find(d => d.key === selectedKey) ?? devices[0] ?? null;
  const latest = commands.filter(c => chosen && c.agentId === chosen.agent.id && c.avdName === chosen.name).slice(0, 3);

  useEffect(() => {
    setFrameLoaded(false);
    setFrame(null);
    if (!watching || !chosen?.running || !agents.some(agent => agent.agentVersion === "0.3.1-native-screen")) return;
    const deviceKey = chosen.key;
    const url = "/api/h2-android/screen/" + chosen.agent.id + "/" + chosen.name;
    const stream = startAndroidScreenStream(url, next => setFrame({ ...next, deviceKey }));
    screenStream.current = stream;
    return () => {
      stream.stop();
      if (screenStream.current === stream) screenStream.current = null;
    };
  }, [watching, chosen?.running, chosen?.key, chosen?.agent.id, chosen?.name]);

  // O motor Hyper-V ainda nao oferece captura grafica autenticada, logo nunca mostrar stream legado.
  const nativeScreenAvailable = agents.some(agent => agent.agentVersion === "0.3.1-native-screen");
  const visibleFrame = nativeScreenAvailable && watching && chosen?.running && frame?.deviceKey === chosen.key ? frame : null;
  const screenActive = false;

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
    if (!/^[A-Za-z]:[\\/].*\.iso$/i.test(isoPath.trim()) || !/^[a-fA-F0-9]{64}$/.test(isoSha256.trim())) {
      return toast.error("Informe caminho da ISO local no Windows e o SHA-256 valido.");
    }
    mutation.mutate({
      action: "create", agentId: agent.id, avdName: next,
      isoPath: isoPath.trim(), isoSha256: isoSha256.trim(), allowUnsignedBoot,
    });
    setCreating(false);
  }

  return (
    <section className="space-y-4 rounded-2xl border border-[#8ce2bd]/35 bg-[#0c1526] p-4 sm:p-5" aria-label="Controle real de Androids pelo site">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-black text-[#b5ecd6]">
            <MonitorPlay className="h-5 w-5" /> Androids virtuais — controle pelo site
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-300">
            Instancias Hyper-V locais, sem Android Studio, SDK ou ADB.
            O controle nativo inicial suporta criar, iniciar e desligar; tela interativa e proxy estao pendentes.
          </p>
        </div>
        <button type="button" onClick={() => { refresh(); screenStream.current?.refresh(); }}
          className="rounded-lg border border-white/20 px-3 py-2 text-xs font-bold hover:bg-white/10">
          <RefreshCcw className="mr-1 inline h-4 w-4" /> Atualizar
        </button>
      </div>

      {ready.length === 0 ? (
        <div className="rounded-xl border border-amber-400/25 bg-amber-400/10 p-4 text-sm text-amber-100">
          <p className="font-black">Atualizacao unica do agente Windows</p>
          <p className="mt-2 text-xs leading-relaxed">
            O agente antigo usa ADB/emulador e nao controla maquinas Hyper-V.
            Baixe <strong>H2 Android Nativo — substituir agente antigo</strong> na secao de downloads
            do ADM, execute <strong>Instalar-H2-Android-Nativo.cmd</strong> e preserve o pareamento existente.
            O motor nativo ainda precisa ser validado no Windows; tela e proxy permanecem indisponiveis.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setCreating(true)} disabled={mutation.isPending}
              className="rounded-lg bg-[#80dcb5] px-4 py-2 text-sm font-black text-slate-950 disabled:opacity-50">
              <Plus className="mr-1 inline h-4 w-4" /> Novo Android
            </button>
            {creating && (
              <div className="flex items-center gap-2">
                <div className="flex min-w-[280px] flex-col gap-2">
                  <span className="text-xs text-slate-300">Criar VM offline a partir de ISO local Android x86_64 UEFI</span>
                  <input aria-label="Caminho ISO no computador Windows" placeholder="C:\\Android\\android.iso" value={isoPath} onChange={e => setIsoPath(e.target.value)}
                    className="rounded-lg border border-white/20 bg-slate-950 px-2 py-2 text-xs" />
                  <input aria-label="SHA-256 da ISO Android" placeholder="SHA-256 oficial (64 caracteres)" value={isoSha256} onChange={e => setIsoSha256(e.target.value)}
                    className="rounded-lg border border-white/20 bg-slate-950 px-2 py-2 text-xs" />
                  <label className="flex items-center gap-2 text-xs text-amber-100">
                    <input type="checkbox" checked={allowUnsignedBoot} onChange={e => setAllowUnsignedBoot(e.target.checked)} />
                    Desativar Secure Boot somente nesta nova VM, se necessário
                  </label>
                </div>
                <button type="button" onClick={createNext} className="rounded-lg border border-[#80dcb5] px-3 py-2 text-xs font-bold text-[#a0e8cc]">Confirmar</button>
                <button type="button" onClick={() => setCreating(false)} className="rounded-lg border border-white/20 px-3 py-2 text-xs">Cancelar</button>
              </div>
            )}
          </div>
          {devices.length === 0 ? (
            <p className="rounded-xl border border-white/10 p-4 text-xs text-slate-300">
              Nenhuma VM H2 nativa detectada. Informe ISO local e SHA-256 para preparar uma nova maquina offline.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {devices.map(d => (
                  <button key={d.key} type="button"
                    onClick={() => { setSelectedKey(d.key); setWatching(false); setFrameLoaded(false); }}
                    className={"rounded-lg border px-3 py-2 text-xs font-bold " + (d.key === chosen?.key ? "border-[#8ce2bd] bg-[#8ce2bd]/15 text-white" : "border-white/15 text-slate-300")}>
                    <Smartphone className="mr-1 inline h-3.5 w-3.5" />
                    {d.name} · {d.running ? "Ligado" : "Desligado"}
                  </button>
                ))}
              </div>
              {chosen && (
                <div className="grid gap-4 lg:grid-cols-[minmax(250px,390px)_minmax(0,1fr)]">
                  <div className="space-y-3">
                    <div className="mx-auto max-w-[360px] overflow-hidden rounded-[2rem] border-[7px] border-slate-600 bg-black shadow-2xl">
                      <div className="relative w-full overflow-hidden bg-[#080c15]" style={{ aspectRatio: visibleFrame ? visibleFrame.width + " / " + visibleFrame.height : "9 / 20" }}>
                        {visibleFrame ? (
                          <img
                            src={visibleFrame.src}
                            alt={"Tela real do " + chosen.name}
                            onLoad={() => {
                              setFrameLoaded(true);
                              screenStream.current?.shown(visibleFrame.src);
                            }}
                            onClick={tap}
                            draggable={false}
                            className="absolute inset-0 h-full w-full cursor-crosshair select-none object-contain"
                          />
                        ) : (
                          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-xs text-slate-400">
                            <Smartphone className="mx-auto mb-3 h-12 w-12 text-[#8ce2bd]/50" />
                            {screenActive ? "Aguardando imagem do Android..." : chosen.running ? "Tela remota pendente para Hyper-V." : "Android desligado."}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <button type="button" disabled title="Tela remota nativa ainda indisponivel" onClick={() => setWatching(w => !w)}
                        className="rounded-lg border border-[#80dcb5]/40 px-3 py-2 text-xs font-bold text-[#b5ecd6] disabled:opacity-30">
                        {watching ? "Fechar tela" : "Abrir tela"}
                      </button>
                      <button type="button" disabled title="Teclas indisponiveis no motor Hyper-V" onClick={() => sendKey("BACK")} className="rounded-lg border border-white/20 p-2 disabled:opacity-30" title="Voltar"><ArrowLeft className="h-5 w-5" /></button>
                      <button type="button" disabled title="Teclas indisponiveis no motor Hyper-V" onClick={() => sendKey("HOME")} className="rounded-lg border border-white/20 p-2 disabled:opacity-30" title="Inicio"><Home className="h-5 w-5" /></button>
                      <button type="button" disabled title="Teclas indisponiveis no motor Hyper-V" onClick={() => sendKey("ENTER")} className="rounded-lg border border-white/20 p-2 disabled:opacity-30" title="Enter"><Keyboard className="h-5 w-5" /></button>
                      <button type="button" disabled title="Teclas indisponiveis no motor Hyper-V" onClick={() => sendKey("POWER")} className="rounded-lg border border-white/20 p-2 disabled:opacity-30" title="Botao de energia"><Power className="h-5 w-5" /></button>
                    </div>
                    <p className="text-center text-[11px] text-slate-400"><MousePointerClick className="mr-1 inline h-3 w-3" /> Tela e toques ainda nao disponiveis no motor nativo.</p>
                  </div>
                  <div className="space-y-4">
                    <div className="rounded-xl border border-white/10 bg-black/25 p-4">
                      <p className="text-sm font-black">{chosen.name}</p>
                      <p className="mt-1 text-xs text-slate-400">Computador: {chosen.agent.computerName}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" disabled={chosen.running || mutation.isPending}
                          onClick={() => mutation.mutate({ action: "start", agentId: chosen.agent.id, avdName: chosen.name })}
                          className="rounded-lg bg-[#74cfa9] px-4 py-2 text-xs font-black text-slate-950 disabled:opacity-30">
                          <Power className="mr-1 inline h-4 w-4" /> Ligar
                        </button>
                        <button type="button" disabled={!chosen.running || mutation.isPending}
                          onClick={() => mutation.mutate({ action: "stop", agentId: chosen.agent.id, avdName: chosen.name })}
                          className="rounded-lg border border-rose-400/40 px-4 py-2 text-xs font-bold text-rose-200 disabled:opacity-30">
                          <PowerOff className="mr-1 inline h-4 w-4" /> Desligar
                        </button>
                      </div>
                    </div>
                    <div className="rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-4">
                      <h3 className="text-sm font-black">Proxy individual</h3>
                      <p className="mt-2 text-xs text-amber-100">
                        Indisponível nesta versão nativa. Todas as VMs Hyper-V permanecem sem conexão de rede até validar isolamento, DNS e bloqueio de vazamentos.
                      </p>
                    </div>
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
