import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Download, Shield, Wifi, RefreshCw, ChevronDown, ChevronUp, Smartphone, AlertCircle } from "lucide-react";

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(ts: number | null | undefined): string {
  if (!ts) return "";
  return new Date(ts).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function AppDownloadPage() {
  const [open, setOpen] = useState<number | null>(null);
  const { data: apk, isLoading } = trpc.apk.getLatest.useQuery();

  const steps = [
    { n: "1", title: "Baixe o aplicativo", desc: 'Toque no botão "BAIXAR APK" abaixo.' },
    { n: "2", title: "Abra o arquivo baixado", desc: 'Vá até a pasta "Downloads" do seu celular e toque no arquivo "Colombiano.apk".' },
    { n: "3", title: "Permita a instalação", desc: 'Se aparecer "Fonte desconhecida bloqueada", toque em Configurações → ative "Instalar apps desconhecidos" → volte e toque em Instalar.' },
    { n: "4", title: "Abra o app", desc: 'Após instalar, toque em "Abrir". O app Colombiano aparecerá na sua tela inicial.' },
  ];

  const faqs = [
    { q: "O app é seguro?", a: "Sim. O aplicativo é desenvolvido e distribuído diretamente pela equipe Colombiano. Ele apenas abre o site h2colombiano.com dentro de um ambiente seguro." },
    { q: "Preciso de internet para usar?", a: "Sim, o app requer conexão com a internet pois acessa o sistema online em tempo real." },
    { q: "Funciona em iPhone?", a: "O arquivo .apk é exclusivo para Android. Em iPhones, acesse diretamente pelo navegador Safari em h2colombiano.com." },
    { q: "Como atualizar o app?", a: "Não é necessário atualizar o app. Qualquer melhoria no sistema aparece automaticamente quando você abre o app, sem precisar reinstalar." },
    { q: "Posso instalar em mais de um celular?", a: "Sim. Baixe e instale em quantos celulares Android quiser." },
  ];

  return (
    <div className="min-h-screen bg-[#0f0f1a] text-white flex flex-col items-center px-4 py-10">
      {/* Header */}
      <div className="flex flex-col items-center mb-8">
        <div className="w-24 h-24 rounded-2xl overflow-hidden shadow-lg mb-4 border-2 border-yellow-500 bg-black flex items-center justify-center">
          <img
            src="/og-image.jpg"
            alt="Colombiano"
            className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        </div>
        <h1 className="text-3xl font-bold text-yellow-400 mb-1">Colombiano</h1>
        <p className="text-gray-400 text-sm">Aplicativo Android</p>
        {apk && (
          <div className="flex gap-3 mt-2 text-xs text-gray-500">
            {apk.version && <span>v{apk.version}</span>}
            {apk.fileSize && <span>· {formatBytes(apk.fileSize)}</span>}
            {apk.uploadedAt && <span>· Atualizado em {formatDate(apk.uploadedAt)}</span>}
          </div>
        )}
      </div>

      {/* Download Button */}
      {isLoading ? (
        <div className="w-8 h-8 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin mb-4" />
      ) : apk ? (
        <>
          <a
            href="/api/app/download"
            download="Colombiano.apk"
            className="flex items-center gap-3 bg-yellow-500 hover:bg-yellow-400 text-black font-bold text-lg px-8 py-4 rounded-2xl shadow-xl transition-all active:scale-95 mb-2 w-full max-w-sm justify-center"
          >
            <Download className="w-6 h-6" />
            BAIXAR APK
          </a>
          <p className="text-gray-500 text-xs mb-10">
            {apk.filename} {apk.fileSize ? `· ${formatBytes(apk.fileSize)}` : ""} · Android 7.0+
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
          { icon: <Shield className="w-5 h-5 text-green-400" />, label: "Seguro" },
          { icon: <Wifi className="w-5 h-5 text-blue-400" />, label: "Online" },
          { icon: <RefreshCw className="w-5 h-5 text-purple-400" />, label: "Sempre atualizado" },
        ].map((f, i) => (
          <div key={i} className="flex flex-col items-center bg-white/5 rounded-xl p-3 gap-2">
            {f.icon}
            <span className="text-xs text-gray-300 text-center">{f.label}</span>
          </div>
        ))}
      </div>

      {/* Steps */}
      <div className="w-full max-w-sm mb-10">
        <h2 className="text-lg font-bold text-white mb-4">Como instalar</h2>
        <div className="flex flex-col gap-3">
          {steps.map((s, i) => (
            <div key={i} className="flex gap-3 bg-white/5 rounded-xl p-4">
              <div className="w-8 h-8 rounded-full bg-yellow-500 text-black font-bold flex items-center justify-center flex-shrink-0 text-sm">
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

      {/* Footer */}
      <div className="text-center text-gray-600 text-xs">
        <Smartphone className="w-4 h-4 mx-auto mb-1" />
        <p>Colombiano · h2colombiano.com</p>
      </div>
    </div>
  );
}
