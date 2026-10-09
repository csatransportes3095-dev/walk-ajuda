import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCheck,
  ChevronDown,
  Copy,
  Info,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { Link } from "wouter";
import { ANOS_VIN, MONTADORAS_VIN, gerarMultiplosVINs } from "@/lib/vinGenerator";
import { trpc } from "@/lib/trpc";

type ResultadoVIN = {
  vin: string;
  key: string;
};

async function copiarTexto(texto: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto);
      return true;
    }

    const textarea = document.createElement("textarea");
    textarea.value = texto;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copiado = document.execCommand("copy");
    document.body.removeChild(textarea);
    return copiado;
  } catch {
    return false;
  }
}

export default function GeradorChassiPublico() {
  const { data: settings } = trpc.settings.getAll.useQuery();
  const logoUrl = settings?.login_image_url || "";

  const ultimoAno = ANOS_VIN[ANOS_VIN.length - 1];
  const [montadoraIdx, setMontadoraIdx] = useState(0);
  const [buscaMontadora, setBuscaMontadora] = useState("");
  const [anoCode, setAnoCode] = useState(ultimoAno?.code || "T");
  const [quantidade, setQuantidade] = useState(1);
  const [resultados, setResultados] = useState<ResultadoVIN[]>([]);
  const [copiados, setCopiados] = useState<Set<string>>(new Set());
  const [detalhesAbertos, setDetalhesAbertos] = useState(false);

  const montadora = MONTADORAS_VIN[montadoraIdx] || MONTADORAS_VIN[0];
  const anoInfo = ANOS_VIN.find((a) => a.code === anoCode) || ultimoAno;

  const montadorasFiltradas = useMemo(() => {
    const termo = buscaMontadora.trim().toLowerCase();
    if (!termo) {
      return MONTADORAS_VIN.map((item, index) => ({ item, index }));
    }

    return MONTADORAS_VIN
      .map((item, index) => ({ item, index }))
      .filter(({ item }) =>
        [item.nome, item.wmi, ...item.modelos]
          .join(" ")
          .toLowerCase()
          .includes(termo),
      );
  }, [buscaMontadora]);

  useEffect(() => {
    if (
      montadorasFiltradas.length > 0 &&
      !montadorasFiltradas.some(({ index }) => index === montadoraIdx)
    ) {
      setMontadoraIdx(montadorasFiltradas[0].index);
    }
  }, [montadorasFiltradas, montadoraIdx]);

  const gerar = () => {
    if (!montadora || !anoInfo) {
      toast.error("Não foi possível carregar os dados do gerador.");
      return;
    }

    const vins = gerarMultiplosVINs(montadora.wmi, montadora.vds, anoCode, quantidade);
    const agora = Date.now();
    setResultados(vins.map((vin, i) => ({ vin, key: `${vin}-${i}-${agora}` })));
    setCopiados(new Set());
  };

  const copiarUm = async (key: string, vin: string) => {
    const copiado = await copiarTexto(vin);
    if (!copiado) {
      toast.error("O navegador bloqueou a cópia. Selecione o chassi manualmente.");
      return;
    }

    toast.success("Chassi copiado.");
    setCopiados((prev) => new Set(prev).add(key));
    window.setTimeout(() => {
      setCopiados((prev) => {
        const proximo = new Set(prev);
        proximo.delete(key);
        return proximo;
      });
    }, 2000);
  };

  const copiarTodos = async () => {
    const copiado = await copiarTexto(resultados.map((r) => r.vin).join("\n"));
    if (!copiado) {
      toast.error("O navegador bloqueou a cópia dos chassis.");
      return;
    }

    toast.success(`${resultados.length} chassi${resultados.length > 1 ? "s" : ""} copiado${resultados.length > 1 ? "s" : ""}.`);
  };

  return (
    <div
      className="min-h-screen text-white"
      style={{ background: "radial-gradient(ellipse at top, #1a0a2e 0%, #0d0d1a 40%, #050508 100%)" }}
    >
      <header className="sticky top-0 z-10 border-b border-purple-900/40 bg-black/50 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <Link href="/">
            <button
              type="button"
              aria-label="Voltar"
              className="rounded-xl p-2 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          </Link>

          <div className="flex min-w-0 items-center gap-3">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="H2 Colombiano"
                className="h-10 w-10 shrink-0 rounded-xl object-cover shadow-lg shadow-purple-900/40"
              />
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-purple-500/30 bg-purple-500/20">
                <span className="text-lg">🚗</span>
              </div>
            )}

            <div className="min-w-0">
              <h1 className="truncate text-sm font-bold text-white sm:text-base">Gerador de Chassi — VIN</h1>
              <p className="text-xs text-zinc-500">Gere números fictícios para testes</p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-5 px-3 py-5 sm:px-4 sm:py-6">
        <section className="rounded-2xl border border-yellow-500/25 bg-yellow-900/15 px-4 py-3">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-yellow-300" />
            <div className="space-y-1 text-xs leading-relaxed text-yellow-100/80">
              <p><strong className="text-yellow-100">Uso para testes.</strong> Os números gerados têm 17 caracteres e dígito verificador calculado.</p>
              <p className="text-yellow-200/60">Não representam veículo real e não confirmam cadastro em DETRAN/SENATRAN.</p>
            </div>
          </div>
        </section>

        <section className="space-y-5 rounded-2xl border border-zinc-700/50 bg-zinc-900/80 p-4 sm:p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-400">Configuração</p>
            <h2 className="mt-1 text-lg font-bold text-white">Gerar VIN fictício para testes</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-zinc-300">Buscar montadora</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <input
                  value={buscaMontadora}
                  onChange={(e) => setBuscaMontadora(e.target.value)}
                  placeholder="Ex.: Chevrolet, Volkswagen, BYD..."
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-800 py-2.5 pl-9 pr-3 text-sm text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-cyan-500"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-zinc-300">Montadora</label>
              <select
                value={montadoraIdx}
                onChange={(e) => setMontadoraIdx(Number(e.target.value))}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-cyan-500"
              >
                {montadorasFiltradas.map(({ item, index }) => (
                  <option key={`${item.wmi}-${index}`} value={index}>{item.nome}</option>
                ))}
              </select>
              {montadorasFiltradas.length === 0 && (
                <p className="mt-1.5 text-xs text-red-300">Nenhuma montadora encontrada. Limpe a busca para ver todas.</p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-zinc-300">Ano do veículo</label>
                <select
                  value={anoCode}
                  onChange={(e) => setAnoCode(e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-cyan-500"
                >
                  {ANOS_VIN.map((a) => (
                    <option key={a.code} value={a.code}>{a.ano}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-zinc-300">Quantidade</label>
                <select
                  value={quantidade}
                  onChange={(e) => setQuantidade(Number(e.target.value))}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-cyan-500"
                >
                  {[1, 2, 3, 5, 10].map((n) => (
                    <option key={n} value={n}>{n} chassi{n > 1 ? "s" : ""}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={gerar}
            disabled={montadorasFiltradas.length === 0}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 py-3.5 text-base font-bold text-white shadow-lg transition-all hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RefreshCw className="h-5 w-5" />
            Gerar {quantidade > 1 ? `${quantidade} chassis` : "chassi"}
          </button>

          <div className="overflow-hidden rounded-xl border border-zinc-700/50 bg-zinc-950/35">
            <button
              type="button"
              onClick={() => setDetalhesAbertos((aberto) => !aberto)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
            >
              <span className="text-xs font-semibold text-zinc-300">Ver detalhes do VIN</span>
              <ChevronDown className={`h-4 w-4 text-zinc-500 transition-transform ${detalhesAbertos ? "rotate-180" : ""}`} />
            </button>

            {detalhesAbertos && montadora && anoInfo && (
              <div className="grid gap-2 border-t border-zinc-800 px-4 py-3 text-xs text-zinc-400 sm:grid-cols-2">
                <p>WMI: <span className="font-mono text-cyan-300">{montadora.wmi}</span></p>
                <p>VDS: <span className="font-mono text-purple-300">{montadora.vds}</span></p>
                <p>Dígito verificador: <span className="text-zinc-200">posição 9</span></p>
                <p>Ano: <span className="text-zinc-200">{anoInfo.ano} ({anoCode})</span></p>
                <p>Fábrica: <span className="text-zinc-200">posição 11</span></p>
                <p>Sequencial: <span className="text-zinc-200">posições 12–17</span></p>
                <p className="sm:col-span-2">Modelos cadastrados como referência: <span className="text-zinc-300">{montadora.modelos.join(", ")}</span></p>
                <p className="sm:col-span-2 text-zinc-500">A associação de WMI/VDS nesta ferramenta é uma base interna de teste e não deve ser interpretada como consulta oficial.</p>
              </div>
            )}
          </div>
        </section>

        {resultados.length > 0 && (
          <section className="space-y-4 rounded-2xl border border-zinc-700/50 bg-zinc-900/80 p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-400">Resultados</p>
                <h2 className="mt-1 text-base font-bold text-white">
                  {resultados.length} chassi{resultados.length > 1 ? "s" : ""} gerado{resultados.length > 1 ? "s" : ""}
                </h2>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:flex">
                {resultados.length > 1 && (
                  <button
                    type="button"
                    onClick={copiarTodos}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-600/20 px-3 py-2 text-xs font-bold text-cyan-300 transition-colors hover:bg-cyan-600/30"
                  >
                    <CheckCheck className="h-3.5 w-3.5" /> Copiar todos
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setResultados([]);
                    setCopiados(new Set());
                  }}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-red-500/30 bg-red-600/20 px-3 py-2 text-xs font-bold text-red-300 transition-colors hover:bg-red-600/30"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Limpar
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {resultados.map(({ vin, key }) => (
                <article
                  key={key}
                  className={`rounded-xl border p-4 transition-all ${copiados.has(key) ? "border-cyan-500/40 bg-cyan-950/30" : "border-zinc-700/50 bg-zinc-800/60"}`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Chassi gerado</p>
                      <p className="mt-1 break-all font-mono text-base font-bold tracking-[0.08em] text-white sm:text-lg sm:tracking-[0.14em]">
                        {vin}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {montadora.nome} • {anoInfo?.ano} • 17 caracteres
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => copiarUm(key, vin)}
                      className={`flex w-full shrink-0 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-colors sm:w-auto ${copiados.has(key) ? "bg-cyan-500/10 text-cyan-300" : "bg-zinc-700/70 text-zinc-200 hover:bg-zinc-700"}`}
                    >
                      {copiados.has(key) ? <CheckCheck className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      {copiados.has(key) ? "Copiado" : "Copiar chassi"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-zinc-800/60 bg-zinc-900/40 p-4 text-xs leading-relaxed text-zinc-500">
          <p><strong className="text-zinc-300">VIN</strong> é o número de identificação veicular com 17 caracteres. Nesta ferramenta, o dígito verificador é calculado matematicamente para testes de formato.</p>
        </section>

        <div className="pb-5" />
      </main>
    </div>
  );
}
