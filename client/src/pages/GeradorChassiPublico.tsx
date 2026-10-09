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
import {
  gerarMultiplosVINs,
  gerarVINsDeTestePorChassiOriginal,
  obterPerfilFabricanteOficial,
} from "@/lib/vinGenerator";
import { trpc } from "@/lib/trpc";

const FIPE_BASE = "https://fipe.parallelum.com.br/api/v2/cars";

const ANOS_GERADOR_PUBLICO = [
  { code: "G", ano: 2016 },
  { code: "H", ano: 2017 },
  { code: "J", ano: 2018 },
  { code: "K", ano: 2019 },
  { code: "L", ano: 2020 },
  { code: "M", ano: 2021 },
  { code: "N", ano: 2022 },
  { code: "P", ano: 2023 },
  { code: "R", ano: 2024 },
  { code: "S", ano: 2025 },
  { code: "T", ano: 2026 },
];

type FipeBrand = {
  code: string;
  name: string;
};

type FipeYear = {
  code: string;
  name: string;
};

type FipeModel = {
  code: string;
  name: string;
};

type ResultadoVIN = {
  vin: string;
  key: string;
  marca: string;
  modelo: string;
  ano: number;
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

  const [marcas, setMarcas] = useState<FipeBrand[]>([]);
  const [marcaCode, setMarcaCode] = useState("59");
  const [buscaMarca, setBuscaMarca] = useState("");
  const [modelos, setModelos] = useState<FipeModel[]>([]);
  const [buscaModelo, setBuscaModelo] = useState("");
  const [modelo, setModelo] = useState("");
  const [anoCode, setAnoCode] = useState("G");
  const [usarChassiOriginal, setUsarChassiOriginal] = useState(false);
  const [chassiOriginal, setChassiOriginal] = useState("");
  const [quantidade, setQuantidade] = useState(1);
  const [resultados, setResultados] = useState<ResultadoVIN[]>([]);
  const [copiados, setCopiados] = useState<Set<string>>(new Set());
  const [detalhesAbertos, setDetalhesAbertos] = useState(false);
  const [carregandoMarcas, setCarregandoMarcas] = useState(true);
  const [carregandoModelos, setCarregandoModelos] = useState(false);
  const [erroCatalogo, setErroCatalogo] = useState("");

  const anoInfo =
    ANOS_GERADOR_PUBLICO.find((item) => item.code === anoCode) ||
    ANOS_GERADOR_PUBLICO[0];

  const marca = marcas.find((item) => item.code === marcaCode);

  const marcasFiltradas = useMemo(() => {
    const termo = buscaMarca.trim().toLowerCase();
    if (!termo) return marcas;

    return marcas.filter((item) => item.name.toLowerCase().includes(termo));
  }, [buscaMarca, marcas]);

  const modelosFiltrados = useMemo(() => {
    const termo = buscaModelo.trim().toLowerCase();
    if (!termo) return modelos;

    return modelos.filter((item) =>
      item.name.toLowerCase().includes(termo),
    );
  }, [buscaModelo, modelos]);

  useEffect(() => {
    let cancelado = false;

    async function carregarMarcas() {
      setCarregandoMarcas(true);
      setErroCatalogo("");

      try {
        const resposta = await fetch(`${FIPE_BASE}/brands`);
        if (!resposta.ok) throw new Error("Falha ao consultar marcas");

        const dados = (await resposta.json()) as FipeBrand[];
        if (cancelado) return;

        const ordenadas = [...dados].sort((a, b) =>
          a.name.localeCompare(b.name, "pt-BR"),
        );

        setMarcas(ordenadas);

        if (!ordenadas.some((item) => item.code === marcaCode)) {
          const volkswagen = ordenadas.find((item) =>
            item.name.toLowerCase().includes("volkswagen"),
          );
          setMarcaCode(volkswagen?.code || ordenadas[0]?.code || "");
        }
      } catch {
        if (!cancelado) {
          setErroCatalogo("Não foi possível carregar o catálogo FIPE agora.");
          setMarcas([]);
        }
      } finally {
        if (!cancelado) setCarregandoMarcas(false);
      }
    }

    carregarMarcas();
    return () => {
      cancelado = true;
    };
  }, []);

  useEffect(() => {
    if (
      marcasFiltradas.length > 0 &&
      !marcasFiltradas.some((item) => item.code === marcaCode)
    ) {
      setMarcaCode(marcasFiltradas[0].code);
    }
  }, [marcasFiltradas, marcaCode]);

  useEffect(() => {
    if (
      modelosFiltrados.length > 0 &&
      !modelosFiltrados.some((item) => item.name === modelo)
    ) {
      setModelo(modelosFiltrados[0].name);
    }
  }, [modelosFiltrados, modelo]);

  useEffect(() => {
    if (!marcaCode || !anoInfo) {
      setModelos([]);
      setBuscaModelo("");
      setModelo("");
      return;
    }

    let cancelado = false;

    async function carregarModelosDoAno() {
      setCarregandoModelos(true);
      setErroCatalogo("");
      setModelos([]);
      setBuscaModelo("");
      setModelo("");

      try {
        const respostaAnos = await fetch(
          `${FIPE_BASE}/brands/${encodeURIComponent(marcaCode)}/years`,
        );
        if (!respostaAnos.ok) throw new Error("Falha ao consultar anos");

        const anos = (await respostaAnos.json()) as FipeYear[];
        const anosDoVeiculo = anos.filter((item) => {
          const ano = Number.parseInt(item.name, 10);
          return ano === anoInfo.ano;
        });

        if (anosDoVeiculo.length === 0) {
          if (!cancelado) {
            setModelos([]);
            setModelo("");
          }
          return;
        }

        const respostas = await Promise.all(
          anosDoVeiculo.map(async (item) => {
            const resposta = await fetch(
              `${FIPE_BASE}/brands/${encodeURIComponent(marcaCode)}/years/${encodeURIComponent(item.code)}/models`,
            );
            if (!resposta.ok) return [] as FipeModel[];
            return (await resposta.json()) as FipeModel[];
          }),
        );

        if (cancelado) return;

        const unicos = new Map<string, FipeModel>();
        respostas.flat().forEach((item) => {
          const chave = item.name.trim().toLocaleLowerCase("pt-BR");
          if (!unicos.has(chave)) unicos.set(chave, item);
        });

        const ordenados = [...unicos.values()].sort((a, b) =>
          a.name.localeCompare(b.name, "pt-BR", { numeric: true }),
        );

        setModelos(ordenados);
        setModelo(ordenados[0]?.name || "");
      } catch {
        if (!cancelado) {
          setErroCatalogo("Não foi possível carregar os modelos desta marca/ano.");
          setModelos([]);
          setModelo("");
        }
      } finally {
        if (!cancelado) setCarregandoModelos(false);
      }
    }

    carregarModelosDoAno();

    return () => {
      cancelado = true;
    };
  }, [marcaCode, anoInfo.ano]);

  const gerar = () => {
    if (!marca || !modelo || !anoInfo) {
      toast.error("Selecione marca, ano e modelo antes de gerar.");
      return;
    }

    try {
      const chassiBase = chassiOriginal.toUpperCase().replace(/[\s-]/g, "");
      let vins: string[];

      if (usarChassiOriginal) {
        if (chassiBase[9] !== anoCode) {
          toast.error("O ano selecionado precisa ser o mesmo do chassi original.");
          return;
        }

        vins = gerarVINsDeTestePorChassiOriginal(chassiBase, quantidade);
      } else {
        const perfilTeste = obterPerfilFabricanteOficial(marca.name, modelo);
        vins = gerarMultiplosVINs(
          perfilTeste.wmi,
          perfilTeste.vds,
          anoCode,
          quantidade,
          perfilTeste.plant,
        );
      }

      const agora = Date.now();
      setResultados(
        vins.map((vin, i) => ({
          vin,
          key: `${vin}-${i}-${agora}`,
          marca: marca.name,
          modelo,
          ano: anoInfo.ano,
        })),
      );
      setCopiados(new Set());
    } catch (error) {
      const mensagem = error instanceof Error ? error.message : "Não foi possível gerar VIN válido.";
      toast.error(mensagem);
    }
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

    toast.success(
      `${resultados.length} chassi${resultados.length > 1 ? "s" : ""} copiado${resultados.length > 1 ? "s" : ""}.`,
    );
  };

  return (
    <div
      className="min-h-screen text-white"
      style={{
        background:
          "radial-gradient(ellipse at top, #1a0a2e 0%, #0d0d1a 40%, #050508 100%)",
      }}
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
              <h1 className="truncate text-sm font-bold text-white sm:text-base">
                Gerador de Chassi — VIN
              </h1>
              <p className="text-xs text-zinc-500">
                Catálogo de veículos a partir de 2016
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-5 px-3 py-5 sm:px-4 sm:py-6">
        <section className="rounded-2xl border border-yellow-500/25 bg-yellow-900/15 px-4 py-3">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-yellow-300" />
            <div className="space-y-1 text-xs leading-relaxed text-yellow-100/80">
              <p>
                <strong className="text-yellow-100">Catálogo FIPE.</strong>{" "}
                Marca, ano e modelo são carregados da base de veículos.
              </p>
              <p className="text-yellow-200/60">
                O VIN gerado é sintético para testes; seu serial não é emitido pela montadora. Use o modo por chassi original para preservar o descritor do veículo.
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-5 rounded-2xl border border-zinc-700/50 bg-zinc-900/80 p-4 sm:p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-400">
              Configuração
            </p>
            <h2 className="mt-1 text-lg font-bold text-white">
              Marca → Ano → Modelo
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-1 rounded-xl bg-zinc-950 p-1">
            <button
              type="button"
              aria-pressed={!usarChassiOriginal}
              onClick={() => setUsarChassiOriginal(false)}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${usarChassiOriginal ? "text-zinc-400 hover:text-white" : "bg-zinc-700 text-white"}`}
            >
              Perfil FIPE
            </button>
            <button
              type="button"
              aria-pressed={usarChassiOriginal}
              onClick={() => setUsarChassiOriginal(true)}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${usarChassiOriginal ? "bg-cyan-700 text-white" : "text-zinc-400 hover:text-white"}`}
            >
              Chassi original
            </button>
          </div>

          <div className="space-y-4">
            {usarChassiOriginal && (
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-zinc-300">
                  Chassi original para usar como perfil
                </label>
                <input
                  value={chassiOriginal}
                  onChange={(event) =>
                    setChassiOriginal(event.target.value.toUpperCase().replace(/[\s-]/g, ""))
                  }
                  maxLength={17}
                  placeholder="Ex.: 9BRB29BT0J2189102"
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2.5 font-mono text-sm text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-cyan-500"
                />
                <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">
                  Preserva as posições 1–8, 10 e 11; troca o serial 12–17 e recalcula a posição 9. Selecione abaixo a mesma marca, modelo e ano do original.
                </p>
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-zinc-300">
                Buscar marca
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <input
                  value={buscaMarca}
                  onChange={(e) => setBuscaMarca(e.target.value)}
                  placeholder="Ex.: Ford, Chevrolet, Volkswagen, BYD..."
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-800 py-2.5 pl-9 pr-3 text-sm text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-cyan-500"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-zinc-300">
                Marca
              </label>
              <select
                value={marcaCode}
                onChange={(e) => setMarcaCode(e.target.value)}
                disabled={carregandoMarcas || marcasFiltradas.length === 0}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-cyan-500 disabled:opacity-50"
              >
                {marcasFiltradas.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.name}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-zinc-500">
                {carregandoMarcas
                  ? "Carregando marcas..."
                  : `${marcas.length} marcas disponíveis no catálogo.`}
              </p>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-zinc-300">
                Ano do veículo
              </label>
              <select
                value={anoCode}
                onChange={(e) => setAnoCode(e.target.value)}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-cyan-500"
              >
                {ANOS_GERADOR_PUBLICO.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.ano}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-zinc-300">
                Buscar modelo
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <input
                  value={buscaModelo}
                  onChange={(e) => setBuscaModelo(e.target.value)}
                  placeholder="Ex.: Ka, EcoSport, Focus, Fusion..."
                  disabled={carregandoModelos || modelos.length === 0}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-800 py-2.5 pl-9 pr-3 text-sm text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-cyan-500 disabled:opacity-50"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-zinc-300">
                Modelo / versão
              </label>
              <select
                value={modelo}
                onChange={(e) => setModelo(e.target.value)}
                disabled={carregandoModelos || modelos.length === 0}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-cyan-500 disabled:opacity-50"
              >
                {modelosFiltrados.length === 0 && (
                  <option value="">
                    {carregandoModelos
                      ? "Carregando modelos..."
                      : buscaModelo.trim()
                        ? "Nenhum modelo encontrado na busca"
                        : "Nenhum modelo encontrado neste ano"}
                  </option>
                )}
                {modelosFiltrados.map((item) => (
                  <option key={`${item.code}-${item.name}`} value={item.name}>
                    {item.name}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-zinc-500">
                {carregandoModelos
                  ? "Consultando os modelos disponíveis para a marca e o ano..."
                  : buscaModelo.trim()
                    ? `${modelosFiltrados.length} de ${modelos.length} opções encontradas para ${anoInfo.ano}.`
                    : `${modelos.length} opções encontradas para ${anoInfo.ano}.`}
              </p>
            </div>

            {erroCatalogo && (
              <div className="rounded-xl border border-red-500/30 bg-red-950/30 px-3 py-2.5 text-xs text-red-200">
                {erroCatalogo}
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-zinc-300">
                Quantidade
              </label>
              <select
                value={quantidade}
                onChange={(e) => setQuantidade(Number(e.target.value))}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-cyan-500"
              >
                {[1, 2, 3, 5, 10].map((n) => (
                  <option key={n} value={n}>
                    {n} chassi{n > 1 ? "s" : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="button"
            onClick={gerar}
            disabled={
              carregandoMarcas ||
              carregandoModelos ||
              !marca ||
              !modelo ||
              modelosFiltrados.length === 0 ||
              (usarChassiOriginal && chassiOriginal.length !== 17)
            }
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 py-3.5 text-base font-bold text-white shadow-lg transition-all hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RefreshCw
              className={`h-5 w-5 ${carregandoModelos ? "animate-spin" : ""}`}
            />
            Gerar {quantidade > 1 ? `${quantidade} chassis` : "chassi"}
          </button>

          <div className="overflow-hidden rounded-xl border border-zinc-700/50 bg-zinc-950/35">
            <button
              type="button"
              onClick={() => setDetalhesAbertos((aberto) => !aberto)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
            >
              <span className="text-xs font-semibold text-zinc-300">
                Ver detalhes do VIN
              </span>
              <ChevronDown
                className={`h-4 w-4 text-zinc-500 transition-transform ${detalhesAbertos ? "rotate-180" : ""}`}
              />
            </button>

            {detalhesAbertos && marca && modelo && (
              <div className="grid gap-2 border-t border-zinc-800 px-4 py-3 text-xs text-zinc-400 sm:grid-cols-2">
                <p>
                  Marca: <span className="text-zinc-200">{marca.name}</span>
                </p>
                <p>
                  Ano: <span className="text-zinc-200">{anoInfo.ano}</span>
                </p>
                <p className="sm:col-span-2">
                  Modelo: <span className="text-zinc-200">{modelo}</span>
                </p>
                <p>
                  WMI da marca (referência):{" "}
                  <span className="font-mono text-cyan-300">
                    {obterPerfilFabricanteOficial(marca.name, modelo).wmi}
                  </span>
                </p>
                <p>
                  VDS de teste:{" "}
                  <span className="font-mono text-purple-300">
                    {obterPerfilFabricanteOficial(marca.name, modelo).vds}
                  </span>
                </p>
                <p>
                  Dígito verificador:{" "}
                  <span className="text-zinc-200">posição 9</span>
                </p>
                <p>
                  Ano VIN:{" "}
                  <span className="text-zinc-200">
                    posição 10 ({anoCode})
                  </span>
                </p>
                <p className="sm:col-span-2 text-zinc-500">
                  {usarChassiOriginal
                    ? "O padrão do VIN original é preservado para manter a identificação do modelo no decodificador; o serial gerado é sintético e serve somente para testes."
                    : "Marca, modelo e ano são referências do catálogo FIPE. A sequência gerada é sintética e não confirma um veículo real nem seus dados no decodificador."}
                </p>
              </div>
            )}
          </div>
        </section>

        {resultados.length > 0 && (
          <section className="space-y-4 rounded-2xl border border-zinc-700/50 bg-zinc-900/80 p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-400">
                  Resultados
                </p>
                <h2 className="mt-1 text-base font-bold text-white">
                  {resultados.length} chassi
                  {resultados.length > 1 ? "s" : ""} gerado
                  {resultados.length > 1 ? "s" : ""}
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
              {resultados.map(({ vin, key, marca: marcaResultado, modelo: modeloResultado, ano }) => (
                <article
                  key={key}
                  className={`rounded-xl border p-4 transition-all ${copiados.has(key) ? "border-cyan-500/40 bg-cyan-950/30" : "border-zinc-700/50 bg-zinc-800/60"}`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                        Chassi gerado
                      </p>
                      <p className="mt-1 break-all font-mono text-base font-bold tracking-[0.08em] text-white sm:text-lg sm:tracking-[0.14em]">
                        {vin}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {marcaResultado} • {modeloResultado} • {ano} • 17 caracteres
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => copiarUm(key, vin)}
                      className={`flex w-full shrink-0 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-colors sm:w-auto ${copiados.has(key) ? "bg-cyan-500/10 text-cyan-300" : "bg-zinc-700/70 text-zinc-200 hover:bg-zinc-700"}`}
                    >
                      {copiados.has(key) ? (
                        <CheckCheck className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                      {copiados.has(key) ? "Copiado" : "Copiar chassi"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-zinc-800/60 bg-zinc-900/40 p-4 text-xs leading-relaxed text-zinc-500">
          <p>
            <strong className="text-zinc-300">Fonte do catálogo:</strong>{" "}
            Tabela FIPE via API pública. O gerador usa os nomes de veículos para organizar os testes; o VIN produzido não é um chassi oficial.
          </p>
        </section>

        <div className="pb-5" />
      </main>
    </div>
  );
}
