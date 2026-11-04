import { type ReactNode, useState } from "react";
import { BatteryFull, Globe2, LockKeyhole, Signal, Wifi, WifiOff } from "lucide-react";

/**
 * Camada 100% ilustrativa. Nunca envia ações ao Worker, troca proxy,
 * interage com o Chrome ou altera o estado de qualquer instância.
 */
export default function H2AdsPhoneFrame({
  children,
  title,
  mode = "preview",
}: {
  children: ReactNode;
  title: string;
  mode?: "preview" | "remote";
}) {
  const [battery, setBattery] = useState(95);
  const [wifi, setWifi] = useState(true);
  const [signal, setSignal] = useState(4);
  return (
    <div className="mx-auto w-full max-w-[390px]" data-testid="h2ads-phone-frame">
      <div className="relative flex h-[min(78dvh,800px)] min-h-[475px] flex-col overflow-hidden rounded-[38px] border-[7px] border-[#252A35] bg-[#05090f] shadow-[0_0_0_2px_#607085,0_24px_80px_#000a,inset_0_0_0_1px_#8190a2] sm:rounded-[46px]">
        <div aria-hidden="true" className="absolute left-1/2 top-1 z-20 h-4 w-24 -translate-x-1/2 rounded-full bg-black shadow-inner" />
        <div className="relative z-10 flex min-h-9 shrink-0 items-center justify-between gap-2 bg-[#111927] px-6 pt-2 text-[11px] font-bold text-white">
          <span>09:41</span>
          <div className="flex items-center gap-2">
            <Signal aria-label="Sinal ilustrativo" className={signal > 0 ? "h-3.5 w-3.5" : "h-3.5 w-3.5 opacity-30"} />
            {wifi ? <Wifi aria-label="Wi-Fi ilustrativo" className="h-3.5 w-3.5" /> : <WifiOff aria-label="Wi-Fi ilustrativo desligado" className="h-3.5 w-3.5 opacity-45" />}
            <BatteryFull className="h-4 w-4" />
            <span>{battery}%</span>
          </div>
        </div>
        <div className="z-10 flex shrink-0 items-center gap-2 border-b border-white/10 bg-[#151d2b] px-3 py-2.5 text-white">
          <Globe2 className="h-4 w-4 shrink-0 text-blue-300" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate rounded-full bg-[#263346] px-3 py-1.5 text-[11px] font-semibold text-slate-200">
            <LockKeyhole className="mr-1 inline h-3 w-3" aria-hidden="true" /> Navegador Chrome · {title}
          </span>
          <span className="text-xs text-slate-400" aria-hidden="true">⋮</span>
        </div>
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[#090f1a]">
          {children}
        </div>
        <div className="z-10 flex h-12 shrink-0 items-center justify-evenly border-t border-white/10 bg-[#131923] text-slate-300" aria-label="Barra de navegação ilustrativa; não envia comandos">
          <span aria-hidden="true" className="text-xl leading-none">‹</span>
          <span aria-hidden="true" className="h-3 w-3 rounded-full border-2 border-slate-300" />
          <span aria-hidden="true" className="h-3 w-3 rounded-sm border-2 border-slate-300" />
        </div>
      </div>
      <div className="mt-3 rounded-2xl border border-white/10 bg-[#0d1420] px-3 py-3 text-slate-200">
        <div className="mb-2 flex justify-between gap-2">
          <strong className="text-xs">Aparência do aparelho</strong>
          <span className="text-[10px] text-amber-200">Somente visual</span>
        </div>
        <label className="flex items-center gap-2 text-xs">
          Bateria: <input aria-label="Bateria ilustrativa" type="range" min="0" max="100"
            value={battery} onChange={e => setBattery(Number(e.target.value))}
            className="min-w-0 flex-1 accent-blue-400" /> <span className="w-9 text-right">{battery}%</span>
        </label>
        <div className="mt-2 flex items-center justify-between gap-2 text-xs">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={wifi} onChange={e => setWifi(e.target.checked)}
              className="accent-blue-400" /> Wi-Fi visual
          </label>
          <label className="flex items-center gap-2">
            Sinal visual
            <select aria-label="Barras do sinal ilustrativo" className="rounded-md border border-white/20 bg-[#172235] p-1 text-white"
              value={signal} onChange={e => setSignal(Number(e.target.value))}>
              {[0, 1, 2, 3, 4].map(value => <option key={value} value={value}>{value}/4</option>)}
            </select>
          </label>
        </div>
        <p className="mt-2 text-[10px] leading-4 text-slate-400">
          {mode === "remote"
            ? "A barra de status e os ícones são decorativos. O controle remoto continua usando os comandos existentes."
            : "A tela é uma representação da instância. O Chrome real continua no Windows. Wi-Fi, bateria e botões não alteram o aparelho nem o proxy."}
        </p>
      </div>
    </div>
  );
}
