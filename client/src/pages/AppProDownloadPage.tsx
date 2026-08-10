import { useState } from "react";
import { Download, Shield, Wifi, RefreshCw, ChevronDown, ChevronUp, Smartphone, AlertCircle, BarChart2 } from "lucide-react";

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AppProDownloadPage() {
  const [open, setOpen] = useState<number | null>(null);
  const [apkInfo, setApkInfo] = useState<{ fileSize?: number; filename?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  // Tenta buscar info do APK Pro via HEAD request
  useState(() => {
    setLoading(true);
    fetch("/api/app/download-pro", { method: "HEAD" })
      .then((r) => {
        if (r.ok) {
          const size = r.headers.get("content-length");
          setApkInfo({ fileSize: size ? parseInt(size) : undefined, filename: "H2DriverPro.apk" });
        } else {
          setNotFound(true);
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  });

  const steps = [
    { n: "1", title: "Baixe o aplicativo", desc: 'Toque no botão "BAIXAR APK" abaixo.' },
    { n: "2", title: "Abra o arquivo baixado", desc: 'Vá até a pasta "Downloads" do seu celular e toque no arquivo "H2DriverPro.apk".' },
    { n: "3", title: "Libere configurações restritas", desc: 'Vá em Configurações → Apps → H2 Driver Pro → (⋮) → Permitir configurações restritas. Isso é necessário para ativar o analisador de corridas.' },
    { n: "4", title: "Configure o analisador", desc: 'Abra o app → toque em "Analisador" → conceda as permissões → configure seu veículo e ative a bolha.' },
  ];

  const faqs = [
    { q: "Qual a diferença para o app Colombiano?", a: "O H2 Driver Pro é focado na planilha de gastos, empréstimos e no analisador de corridas com bolha flutuante. O app Colombiano dá acesso ao sistema completo." },
    { q: "O que é a bolha flutuante?", a: "Quando uma corrida tocar no Uber ou 99, uma bolha aparece automaticamente na tela com o valor, nota de rentabilidade e botão para registrar na planilha — sem precisar abrir nenhum app." },
    { q: "Precisa de internet?", a: "Sim, o app acessa o sistema online em tempo real." },
    { q: "Funciona em iPhone?", a: "O arquivo .apk é exclusivo para Android. Em iPhones, acesse h2colombiano.com/gastos pelo navegador." },
    { q: "Como atualizar?", a: "O app avisa automaticamente quando há uma versão nova disponível." },
  ];

  return (
    <div className="min-h-screen bg-[#0f0f1a] text-white flex flex-col items-center px-4 py-10">
      {/* Header */}
      <div className="flex flex-col items-center mb-8">
        <div className="w-24 h-24 rounded-2xl overflow-hidden shadow-lg mb-4 border-2 border-blue-500 bg-[#0a0a1a] flex items-center justify-center">
          <img
            src="/og-image-pro.png"
            alt="H2 Driver Pro"
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
              (e.target as HTMLImageElement).parentElement!.innerHTML = '<div style="color:#3b82f6;font-size:2rem;font-weight:bold">H2</div>';
            }}
          />
        </div>
        <h1 className="text-3xl font-bold text-blue-400 mb-1">H2 Driver Pro</h1>
        <p className="text-gray-400 text-sm">Gestor de Gastos · Analisador de Corridas</p>
        <div className="flex gap-2 mt-3">
          <span className="bg-blue-500/20 text-blue-300 text-xs px-2 py-1 rounded-full border border-blue-500/30">Planilha</span>
          <span className="bg-purple-500/20 text-purple-300 text-xs px-2 py-1 rounded-full border border-purple-500/30">Bolha Flutuante</span>
          <span className="bg-green-500/20 text-green-300 text-xs px-2 py-1 rounded-full border border-green-500/30">GPS</span>
        </div>
      </div>

      {/* Download Button */}
      {loading ? (
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
      ) : !notFound ? (
        <>
          <a
            href="/api/app/download-pro"
            download="H2DriverPro.apk"
            className="flex items-center gap-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-lg px-8 py-4 rounded-2xl shadow-xl transition-all active:scale-95 mb-2 w-full max-w-sm justify-center"
          >
            <Download className="w-6 h-6" />
            BAIXAR APK
          </a>
          <p className="text-gray-500 text-xs mb-10">
            H2DriverPro.apk {apkInfo?.fileSize ? `· ${formatBytes(apkInfo.fileSize)}` : ""} · Android 7.0+
          </p>
        </>
      ) : (
        <div className="flex items-center gap-2 bg-red-900/30 border border-red-500/30 rounded-xl px-4 py-3 mb-10 text-red-400 text-sm max-w-sm w-full">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          APK ainda não disponível. Aguarde a publicação.
        </div>
      )}

      {/* Features */}
      <div className="grid grid-cols-3 gap-4 w-full max-w-sm mb-10">
        {[
          { icon: <BarChart2 className="w-5 h-5 text-blue-400" />, label: "Analisador" },
          { icon: <Wifi className="w-5 h-5 text-green-400" />, label: "Bolha Auto" },
          { icon: <RefreshCw className="w-5 h-5 text-purple-400" />, label: "GPS Real" },
        ].map((f, i) => (
          <div key={i} className="flex flex-col items-center bg-white/5 rounded-xl p-3 gap-2">
            {f.icon}
            <span className="text-xs text-gray-300 text-center">{f.label}</span>
          </div>
        ))}
      </div>

      {/* Steps */}
      <div className="w-full max-w-sm mb-10">
        <h2 className="text-lg font-bold text-white mb-4">Como instalar e configurar</h2>
        <div className="flex flex-col gap-3">
          {steps.map((s, i) => (
            <div key={i} className="flex gap-3 bg-white/5 rounded-xl p-4">
              <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center flex-shrink-0 text-sm">
                {s.n}
              </div>
              <div>
                <p className="font-semibold text-white text-sm">{s.title}</p>
                <p className="text-gray-400 text-xs mt-1">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* FAQ */}
      <div className="w-full max-w-sm mb-10">
        <h2 className="text-lg font-bold text-white mb-4">Dúvidas frequentes</h2>
        <div className="flex flex-col gap-2">
          {faqs.map((f, i) => (
            <div key={i} className="bg-white/5 rounded-xl overflow-hidden">
              <button
                className="w-full flex items-center justify-between p-4 text-left"
                onClick={() => setOpen(open === i ? null : i)}
              >
                <span className="font-medium text-sm text-white">{f.q}</span>
                {open === i ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
              </button>
              {open === i && <div className="px-4 pb-4 text-gray-400 text-xs leading-relaxed">{f.a}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* Link para app principal */}
      <div className="w-full max-w-sm mb-6">
        <a
          href="/app"
          className="flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl p-3 text-gray-400 text-sm transition-all"
        >
          <Smartphone className="w-4 h-4" />
          Baixar app Colombiano (sistema completo)
        </a>
      </div>

      {/* Footer */}
      <div className="text-center text-gray-600 text-xs">
        <Shield className="w-4 h-4 mx-auto mb-1" />
        <p>H2 Driver Pro · h2colombiano.com</p>
      </div>
    </div>
  );
}
