import { useState } from "react";
import { toast } from "sonner";
import { Copy, RefreshCw, Trash2, CheckCheck, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { MONTADORAS_VIN, ANOS_VIN, gerarMultiplosVINs, getSessionHistorySize } from "@/lib/vinGenerator";
import { trpc } from "@/lib/trpc";

// ════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ════════════════════════════════════════════════════════════
export default function GeradorChassiPublico() {
  const { data: settings } = trpc.settings.getAll.useQuery();
  const logoUrl = settings?.login_image_url || '';
  const [montadoraIdx, setMontadoraIdx] = useState(0);
  const [anoCode, setAnoCode] = useState('S');
  const [quantidade, setQuantidade] = useState(1);
  const [resultados, setResultados] = useState<{ vin: string; key: string }[]>([]);
  const [copiados, setCopiados] = useState<Set<string>>(new Set());

  const montadora = MONTADORAS_VIN[montadoraIdx];
  const anoInfo = ANOS_VIN.find(a => a.code === anoCode)!;

  const gerar = () => {
    const vins = gerarMultiplosVINs(montadora.wmi, montadora.vds, anoCode, quantidade);
    const novos = vins.map((vin, i) => ({ vin, key: `${vin}-${i}-${Date.now()}` }));
    setResultados(novos);
    setCopiados(new Set());
  };

  const copiarUm = (key: string, vin: string) => {
    navigator.clipboard.writeText(vin);
    toast.success(`Chassi copiado: ${vin}`);
    setCopiados(prev => { const s = new Set(prev); s.add(key); return s; });
    setTimeout(() => setCopiados(prev => { const s = new Set(prev); s.delete(key); return s; }), 2000);
  };

  const copiarTodos = () => {
    navigator.clipboard.writeText(resultados.map(r => r.vin).join('\n'));
    toast.success(`${resultados.length} chassi${resultados.length > 1 ? 's' : ''} copiado${resultados.length > 1 ? 's' : ''}!`);
  };

  return (
    <div className="min-h-screen text-white" style={{ background: 'radial-gradient(ellipse at top, #1a0a2e 0%, #0d0d1a 40%, #050508 100%)' }}>
      {/* Header */}
      <div className="border-b border-purple-900/40 bg-black/40 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/">
            <button className="p-2 rounded-xl hover:bg-white/10 transition-colors text-zinc-400 hover:text-white">
              <ArrowLeft className="w-5 h-5" />
            </button>
          </Link>
          <div className="flex items-center gap-3">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="w-10 h-10 rounded-xl object-cover shadow-lg shadow-purple-900/40" />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center">
                <span className="text-lg">🚗</span>
              </div>
            )}
            <div>
              <h1 className="text-sm font-bold text-white">Gerador de Chassi VIN</h1>
              <p className="text-xs text-zinc-500">Fictício — apenas para testes</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">

        {/* Aviso */}
        <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-2xl px-4 py-3 flex items-start gap-3">
          <span className="text-lg mt-0.5">⚠️</span>
          <p className="text-xs text-yellow-200/80 leading-relaxed">
            Os chassi gerados são <strong>fictícios</strong> e válidos apenas no formato (dígito verificador calculado pelo algoritmo ISO 3779).
            Use somente para testes — não representam veículos reais.
          </p>
        </div>

        {/* Card principal */}
        <div className="bg-zinc-900/80 border border-zinc-700/50 rounded-2xl p-5 space-y-5">

          {/* Título */}
          <div className="flex items-center gap-2">
            <span className="text-xl">🚗</span>
            <div>
              <span className="text-base font-bold text-white">Gerar Chassi (VIN) Válido</span>
              <p className="text-xs text-zinc-500 mt-0.5">Algoritmo ISO 3779 — dígito verificador calculado automaticamente</p>
            </div>
          </div>

          {/* Configurações */}
          <div className="space-y-4">
            {/* Montadora */}
            <div>
              <label className="text-xs text-zinc-400 font-semibold mb-1.5 block">Montadora</label>
              <select
                value={montadoraIdx}
                onChange={e => setMontadoraIdx(Number(e.target.value))}
                className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white text-sm focus:outline-none focus:border-cyan-500 transition-colors"
              >
                {MONTADORAS_VIN.map((m, i) => (
                  <option key={m.wmi} value={i}>{m.nome}</option>
                ))}
              </select>
              <p className="text-xs text-zinc-500 mt-1.5">
                Código WMI: <span className="font-mono text-cyan-400">{montadora.wmi}</span>
                <span className="mx-2 text-zinc-700">|</span>
                Modelos: {montadora.modelos.join(', ')}
              </p>
            </div>

            {/* Ano + Quantidade */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-zinc-400 font-semibold mb-1.5 block">Ano do Veículo</label>
                <select
                  value={anoCode}
                  onChange={e => setAnoCode(e.target.value)}
                  className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white text-sm focus:outline-none focus:border-cyan-500 transition-colors"
                >
                  {ANOS_VIN.map(a => (
                    <option key={a.code} value={a.code}>{a.ano}</option>
                  ))}
                </select>
                <p className="text-xs text-zinc-500 mt-1.5">Posição 10: <span className="font-mono text-cyan-400">{anoCode}</span></p>
              </div>
              <div>
                <label className="text-xs text-zinc-400 font-semibold mb-1.5 block">Quantidade</label>
                <select
                  value={quantidade}
                  onChange={e => setQuantidade(Number(e.target.value))}
                  className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white text-sm focus:outline-none focus:border-cyan-500 transition-colors"
                >
                  {[1,2,3,5,10].map(n => (
                    <option key={n} value={n}>{n} chassi{n > 1 ? 's' : ''}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Estrutura explicativa */}
          <div className="bg-zinc-800/50 border border-zinc-700/40 rounded-xl p-3">
            <p className="text-xs text-zinc-400 font-semibold mb-2">📐 Estrutura do VIN (17 caracteres)</p>
            <div className="flex flex-wrap gap-1.5 font-mono text-xs">
              <span className="px-2 py-1 bg-cyan-900/50 border border-cyan-500/30 rounded text-cyan-300">{montadora.wmi} = Montadora</span>
              <span className="px-2 py-1 bg-purple-900/50 border border-purple-500/30 rounded text-purple-300">{montadora.vds} = Modelo/Motor</span>
              <span className="px-2 py-1 bg-yellow-900/50 border border-yellow-500/30 rounded text-yellow-300">? = Check digit</span>
              <span className="px-2 py-1 bg-green-900/50 border border-green-500/30 rounded text-green-300">{anoCode} = Ano {anoInfo.ano}</span>
              <span className="px-2 py-1 bg-orange-900/50 border border-orange-500/30 rounded text-orange-300">A = Fábrica</span>
              <span className="px-2 py-1 bg-zinc-700/80 border border-zinc-600/30 rounded text-zinc-300">XXXXXX = Sequencial</span>
            </div>
          </div>

          {/* Botão gerar */}
          <button
            onClick={gerar}
            className="w-full py-4 bg-gradient-to-r from-cyan-600 to-blue-600 hover:opacity-90 active:scale-[0.98] text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg text-base"
          >
            <RefreshCw className="w-5 h-5" />
            Gerar {quantidade > 1 ? `${quantidade} Chassi` : 'Chassi'}
          </button>
        </div>

        {/* Resultados */}
        {resultados.length > 0 && (
          <div className="bg-zinc-900/80 border border-zinc-700/50 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">
                {resultados.length} chassi{resultados.length > 1 ? 's' : ''} gerado{resultados.length > 1 ? 's' : ''}
              </h3>
              <div className="flex gap-2">
                {resultados.length > 1 && (
                  <button
                    onClick={copiarTodos}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600/20 border border-cyan-500/30 hover:bg-cyan-600/30 text-cyan-300 rounded-lg text-xs font-bold transition-colors"
                  >
                    <CheckCheck className="w-3.5 h-3.5" /> Copiar todos
                  </button>
                )}
                <button
                  onClick={() => setResultados([])}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/20 border border-red-500/30 hover:bg-red-600/30 text-red-300 rounded-lg text-xs font-bold transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Limpar
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {resultados.map(({ vin, key }) => (
                <div
                  key={key}
                  className={`flex items-center justify-between px-4 py-3.5 rounded-xl border transition-all ${
                    copiados.has(key)
                      ? 'bg-cyan-950/40 border-cyan-500/40'
                      : 'bg-zinc-800/60 border-zinc-700/50 hover:border-zinc-600'
                  }`}
                >
                  <div>
                    <p className="font-mono font-bold text-base tracking-widest">
                      <span className="text-cyan-400">{vin.slice(0,3)}</span>
                      <span className="text-purple-400">{vin.slice(3,8)}</span>
                      <span className="text-yellow-400">{vin[8]}</span>
                      <span className="text-green-400">{vin[9]}</span>
                      <span className="text-orange-400">{vin[10]}</span>
                      <span className="text-zinc-300">{vin.slice(11)}</span>
                    </p>
                    <p className="text-zinc-500 text-xs mt-0.5">
                      {montadora.nome} — {anoInfo.ano} — Check digit: <span className="text-yellow-400 font-mono font-bold">{vin[8]}</span>
                    </p>
                  </div>
                  <button
                    onClick={() => copiarUm(key, vin)}
                    className={`p-2.5 rounded-xl transition-colors ${
                      copiados.has(key)
                        ? 'text-cyan-400 bg-cyan-500/10'
                        : 'text-zinc-400 hover:text-white hover:bg-zinc-700'
                    }`}
                  >
                    {copiados.has(key) ? <CheckCheck className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Rodapé informativo */}
        <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-2xl p-4 space-y-3">
          <p className="text-xs text-zinc-400 font-semibold">ℹ️ Como funciona o VIN</p>
          <div className="space-y-1.5 text-xs text-zinc-500 leading-relaxed">
            <p>O <strong className="text-zinc-300">VIN (Vehicle Identification Number)</strong> é o número de chassi padrão internacional com 17 caracteres, definido pela norma ISO 3779.</p>
            <p>O <strong className="text-zinc-300">dígito verificador</strong> (posição 9) é calculado matematicamente: cada caractere tem um valor numérico e um peso por posição. A soma é dividida por 11 e o resto determina o dígito.</p>
            <p>Os chassi gerados aqui passam na validação de formato, mas são <strong className="text-zinc-300">fictícios</strong> — não correspondem a veículos reais cadastrados no DETRAN ou DENATRAN.</p>
          </div>
        </div>

        <div className="pb-6" />
      </div>
    </div>
  );
}
