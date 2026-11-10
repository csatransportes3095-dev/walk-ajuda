import { useEffect, useRef, useState } from "react";
import { startAndroidScreenStream, type AndroidScreenFrame, type AndroidScreenStream } from "@/lib/androidScreenStream";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ArrowLeft, Home, Keyboard, MonitorPlay, Power, PowerOff, RefreshCcw, Smartphone, MousePointerClick } from "lucide-react";

type Agent = {
  id: string;
  computerName: string;
  agentVersion: string;
  online: boolean;
  hyperVReady: boolean;
  hyperVReason: string;
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
  refresh: () => Promise<unknown>;
}) {
  const [selectedKey, setSelectedKey] = useState("");
  const [frame, setFrame] = useState<(AndroidScreenFrame & { deviceKey: string }) | null>(null);
  const screenStream = useRef<AndroidScreenStream | null>(null);
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [screenError, setScreenError] = useState<string | null>(null);
  const [watching, setWatching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const mutation = trpc.h2Android.control.useMutation({
    onSuccess: () => {
      toast.success("Comando enviado ao agente Windows.");
      void utils.h2Android.overview.invalidate();
      void refresh().catch(() => {});
    },
    onError: error => toast.error(error.message),
  });
  const ready = agents.filter(agent => agent.online && agent.agentVersion.startsWith("0.3.") && agent.agentVersion.includes("-native") && agent.hyperVReady);
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
    setScreenError(null);
    if (!watching || !chosen?.running || chosen.agent.agentVersion !== "0.3.5-native-screen") return;
    const deviceKey = chosen.key;
    const url = "/api/h2-android/screen/" + chosen.agent.id + "/" + chosen.name;
    const stream = startAndroidScreenStream(url, next => {
      setScreenError(null);
      setFrame({ ...next, deviceKey });
    }, { onError: message => setScreenError(message) });
    screenStream.current = stream;
    return () => {
      stream.stop();
      if (screenStream.current === stream) screenStream.current = null;
    };
  }, [watching, chosen?.running, chosen?.key, chosen?.agent.id, chosen?.name]);

  // O agente 0.3.4 publica somente capturas reais WMI autenticadas.
  const nativeScreenAvailable = chosen?.agent.agentVersion === "0.3.5-native-screen";
  const visibleFrame = nativeScreenAvailable && watching && chosen?.running && frame?.deviceKey === chosen.key ? frame : null;
  const screenActive = nativeScreenAvailable && watching;

  function sendKey(key: "BACK" | "HOME" | "ENTER" | "POWER") {
    if (!chosen || !chosen.running) return;
    mutation.mutate({ action: "key", agentId: chosen.agent.id, avdName: chosen.name, key });
  }

  function tap(event: React.MouseEvent<HTMLImageElement>) {
    if (!chosen || !chosen.running || !frameLoaded) return;
    const image = event.currentTarget;
    const bounds = image.getBoundingClientRect();
    if (!image.naturalWidth || !image.naturalHeight || !bounds.width || !bounds.height) return;
    const x = Math.max(0, Math.min(10000, Math.round((event.clientX - bounds.left) / bounds.width * 10000)));
    const y = Math.max(0, Math.min(10000, Math.round((event.clientY - bounds.top) / bounds.height * 10000)));
    mutation.mutate({ action: "tap", agentId: chosen.agent.id, avdName: chosen.name, x, y });
  }

  async function refreshStatus() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await refresh();
      screenStream.current?.refresh();
      setLastRefreshedAt(new Date().toLocaleTimeString("pt-BR"));
      toast.success("Consulta dos aparelhos concluida.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao atualizar o painel H2 Android.");
    } finally {
      setRefreshing(false);
    }
  }


  return (
    <section className="space-y-4 rounded-2xl border border-[#8ce2bd]/35 bg-[#0c1526] p-4 sm:p-5" aria-label="Controle real de Androids pelo site">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-black text-[#b5ecd6]">
            <MonitorPlay className="h-5 w-5" /> H2 Android — máquinas virtuais nativas
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-300">
            Instancias Hyper-V locais, sem Android Studio, SDK ou ADB.
            Ligue e desligue as VMs existentes. A tela real pode ser testada com o agente 0.3.4; a criacao de novos Androids independentes e o proxy ainda exigem validacao.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button type="button" onClick={() => void refreshStatus()} disabled={refreshing}
            aria-label="Atualizar estado dos aparelhos"
            className="rounded-lg border border-white/20 px-3 py-2 text-xs font-bold hover:bg-white/10 disabled:cursor-wait disabled:opacity-60">
            <RefreshCcw className={"mr-1 inline h-4 w-4 " + (refreshing ? "animate-spin" : "")} />
            {refreshing ? "Atualizando..." : "Atualizar"}
          </button>
          <span aria-live="polite" className="text-[10px] text-slate-400">
            {refreshing ? "Consultando o painel..." : lastRefreshedAt ? "Consulta realizada as " + lastRefreshedAt : "Dados verificados automaticamente"}
          </span>
        </div>
      </div>

      {ready.length === 0 ? (
        <div className="rounded-xl border border-amber-400/25 bg-amber-400/10 p-4 text-sm text-amber-100">
          <p className="font-black">Atualizacao unica do agente Windows</p>
          <p className="mt-2 text-xs leading-relaxed">
            O agente antigo usa ADB/emulador e nao controla maquinas Hyper-V.
            Baixe <strong>H2 Android Nativo — substituir agente antigo</strong> na secao de downloads
            do ADM, execute <strong>Instalar-H2-Android-Nativo.cmd</strong> e preserve o pareamento existente.
            {agents.some(agent => agent.online && agent.agentVersion.startsWith("0.3.") && agent.agentVersion.includes("-native") && !agent.hyperVReady)
              ? "O agente nativo está conectado, mas o Hyper-V está pendente: " + (agents.find(agent => agent.online && agent.agentVersion.startsWith("0.3.") && agent.agentVersion.includes("-native"))?.hyperVReason || "Verifique Windows e administrador.")
              : "O motor nativo ainda precisa ser validado no Windows; tela e proxy permanecem indisponíveis."}
          </p>
        </div>
      ) : (
        <>
          <div role="status" className="rounded-xl border border-amber-400/25 bg-amber-400/[0.05] p-3 text-xs leading-relaxed text-amber-100">
            Criacao independente em preparacao: novos Androids precisarao de uma imagem-base limpa e identificadores proprios.
            A copia direta de um aparelho existente esta desativada para evitar duplicacao de dados.
          </div>
          {devices.length === 0 ? (
            <p className="rounded-xl border border-white/10 p-4 text-xs text-slate-300">
              Nenhuma VM H2 nativa detectada. Prepare o primeiro Android antes de criar copias pelo site.
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
                            {screenActive ? screenError ? "Captura indisponivel: " + screenError : "Aguardando imagem do Android..." : chosen.running ? "Android ligado. Abra a pre-visualizacao real quando o agente estiver conectado." : "Android desligado."}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <button type="button" disabled={!nativeScreenAvailable || !chosen?.running} title="Abrir pre-visualizacao real da VM" onClick={() => setWatching(w => !w)}
                        className="rounded-lg border border-[#80dcb5]/40 px-3 py-2 text-xs font-bold text-[#b5ecd6] disabled:opacity-30">
                        {watching ? "Fechar tela" : "Abrir tela"}
                      </button>
                      <button type="button" disabled={!nativeScreenAvailable || !chosen?.running} title="Tecla Escape / voltar" onClick={() => sendKey("BACK")} className="rounded-lg border border-white/20 p-2 disabled:opacity-30"><ArrowLeft className="h-5 w-5" /></button>
                      <button type="button" disabled={!nativeScreenAvailable || !chosen?.running} title="Tecla Home" onClick={() => sendKey("HOME")} className="rounded-lg border border-white/20 p-2 disabled:opacity-30"><Home className="h-5 w-5" /></button>
                      <button type="button" disabled={!nativeScreenAvailable || !chosen?.running} title="Tecla Enter" onClick={() => sendKey("ENTER")} className="rounded-lg border border-white/20 p-2 disabled:opacity-30"><Keyboard className="h-5 w-5" /></button>
                      <button type="button" disabled title="Botao de energia — indisponivel no Hyper-V" onClick={() => sendKey("POWER")} className="rounded-lg border border-white/20 p-2 disabled:opacity-30"><Power className="h-5 w-5" /></button>
                    </div>
                    <p className="text-center text-[11px] text-slate-400"><MousePointerClick className="mr-1 inline h-3 w-3" /> {nativeScreenAvailable ? "Previa WMI real; toque depende do suporte do Android ao mouse virtual." : "Tela e toques exigem agente de video nativo."}</p>
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
