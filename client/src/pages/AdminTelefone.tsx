import { useState } from "react";
import { toast } from "sonner";
import { Phone, Copy, RefreshCw, Trash2, CheckCheck, CreditCard, FileText, Car } from "lucide-react";
import AdminHeader from "@/components/AdminHeader";
import { MONTADORAS_VIN, ANOS_VIN, gerarMultiplosVINs } from "@/lib/vinGenerator";

// ════════════════════════════════════════════════════════════
// GERADOR DE TELEFONE 90+
// ════════════════════════════════════════════════════════════

/** DDDs selecionados para geração */
const DDDS_VALIDOS = [
  "71","73","74","75","77","79",
  "81","82","83","84","85","86","87","88","89",
  "91","92","93","94","95","96","97","98","99",
];

/**
 * Gera inteiro aleatório em [min, max] com crypto.getRandomValues()
 * e rejection sampling para eliminar viés de módulo.
 */
function cryptoRandIntPhone(min: number, max: number): number {
  const range = max - min + 1;
  const bitsNeeded = Math.ceil(Math.log2(range + 1));
  const bytesNeeded = Math.ceil(bitsNeeded / 8);
  const maxValid = Math.floor(256 ** bytesNeeded / range) * range;
  while (true) {
    const bytes = new Uint8Array(bytesNeeded);
    crypto.getRandomValues(bytes);
    let value = 0;
    for (let i = 0; i < bytesNeeded; i++) {
      value = (value << 8) | bytes[i];
    }
    if (value < maxValid) return min + (value % range);
  }
}

/** Histórico de sessão — nunca repete o mesmo número */
const _phoneSessionHistory = new Set<string>();

/**
 * Gera um número de celular 90+ com DDD aleatório.
 * Formato: DDD + 9 + 0-9 + 7 dígitos aleatórios = 11 dígitos.
 * Nunca repete na mesma sessão.
 */
function gerarTelefone90Plus(): string {
  const MAX_ATTEMPTS = 1000;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const dddIdx = cryptoRandIntPhone(0, DDDS_VALIDOS.length - 1);
    const ddd = DDDS_VALIDOS[dddIdx];
    // Número começa com 9, segundo dígito 0-9, depois 7 dígitos
    const segundoDigito = cryptoRandIntPhone(0, 9);
    let resto = "";
    for (let j = 0; j < 7; j++) {
      resto += cryptoRandIntPhone(0, 9).toString();
    }
    const numero = `${ddd}9${segundoDigito}${resto}`;
    if (!_phoneSessionHistory.has(numero)) {
      _phoneSessionHistory.add(numero);
      return numero;
    }
  }
  // Fallback com timestamp (praticamente impossível chegar aqui)
  const ddd = DDDS_VALIDOS[cryptoRandIntPhone(0, DDDS_VALIDOS.length - 1)];
  const ts = Date.now().toString().slice(-8);
  return `${ddd}9${ts}`;
}

/** Gera telefone com DDD aleatório (para o Gerador Completo) */
function gerarTelefone(ddd?: string): string {
  const d = ddd ?? DDDS_VALIDOS[cryptoRandIntPhone(0, DDDS_VALIDOS.length - 1)];
  const segundoDigito = cryptoRandIntPhone(0, 9);
  let resto = "";
  for (let j = 0; j < 7; j++) {
    resto += cryptoRandIntPhone(0, 9).toString();
  }
  return `${d}9${segundoDigito}${resto}`;
}

function formatarTelefone(num: string): string {
  const ddd = num.slice(0, 2);
  const nove = num[2];
  const p1 = num.slice(3, 7);
  const p2 = num.slice(7, 11);
  return `(${ddd}) ${nove} ${p1}-${p2}`;
}

/** Componente do bloco Gerador de Números 90+ */
function GeradorTelefone90() {
  const [numeros, setNumeros] = useState<{ raw: string; key: string }[]>([]);
  const [copiados, setCopiados] = useState<Set<string>>(new Set());
  const [histSize, setHistSize] = useState(0);

  const gerar = () => {
    const novo = gerarTelefone90Plus();
    const key = `${novo}-${Date.now()}`;
    setNumeros(prev => [{ raw: novo, key }, ...prev]);
    setHistSize(_phoneSessionHistory.size);
  };

  const copiar = (key: string, raw: string) => {
    navigator.clipboard.writeText(formatarTelefone(raw));
    toast.success(`Copiado: ${formatarTelefone(raw)}`);
    setCopiados(prev => { const s = new Set(prev); s.add(key); return s; });
    setTimeout(() => setCopiados(prev => { const s = new Set(prev); s.delete(key); return s; }), 2000);
  };

  const limpar = () => {
    setNumeros([]);
    setCopiados(new Set());
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-1 h-5 rounded-full bg-green-400" />
        <h2 className="text-xs font-bold tracking-widest text-green-400 uppercase">Gerador de Números 90+</h2>
      </div>

      <div className="bg-zinc-900/80 border border-zinc-700/50 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Phone className="w-5 h-5 text-green-400" />
          <div>
            <span className="text-base font-bold text-white">Gerador de Celular 90+</span>
            <p className="text-xs text-zinc-500 mt-0.5">DDD aleatório + número começando com 9. Nunca repete na sessão.</p>
          </div>
        </div>

        {histSize > 0 && (
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
            {histSize} número{histSize !== 1 ? 's' : ''} gerado{histSize !== 1 ? 's' : ''} nesta sessão — nenhum se repetirá
          </div>
        )}

        <button
          onClick={gerar}
          className="w-full py-3.5 bg-gradient-to-r from-green-600 to-emerald-600 hover:opacity-90 active:scale-[0.98] text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg"
        >
          <RefreshCw className="w-5 h-5" />
          Gerar Aleatório
        </button>

        {numeros.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-400 font-semibold">{numeros.length} número{numeros.length !== 1 ? 's' : ''} gerado{numeros.length !== 1 ? 's' : ''}</span>
              <button
                onClick={limpar}
                className="flex items-center gap-1 px-2.5 py-1 bg-red-600/20 border border-red-500/30 hover:bg-red-600/30 text-red-300 rounded-lg text-xs font-bold transition-colors"
              >
                <Trash2 className="w-3 h-3" /> Limpar
              </button>
            </div>
            <div className="space-y-2">
              {numeros.map(({ raw, key }) => (
                <div
                  key={key}
                  className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${
                    copiados.has(key)
                      ? 'bg-green-950/40 border-green-500/40'
                      : 'bg-zinc-800/60 border-zinc-700/50 hover:border-zinc-600'
                  }`}
                >
                  <div>
                    <p className="font-mono font-bold text-base text-white">{formatarTelefone(raw)}</p>
                    <p className="text-zinc-500 text-xs mt-0.5">DDD <span className="text-green-400 font-mono">{raw.slice(0,2)}</span> · sem pontuação: <span className="font-mono text-zinc-400">{raw}</span></p>
                  </div>
                  <button
                    onClick={() => copiar(key, raw)}
                    className={`p-2 rounded-lg transition-colors ${
                      copiados.has(key) ? 'text-green-400' : 'text-zinc-400 hover:text-white hover:bg-zinc-700'
                    }`}
                  >
                    {copiados.has(key) ? <CheckCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// GERADOR DE CPF
// ════════════════════════════════════════════════════════════
const REGIOES_FISCAIS = [
  { regiao: 1, estados: ["DF", "GO", "MS", "MT", "TO"] },
  { regiao: 2, estados: ["AC", "AM", "AP", "PA", "RO", "RR"] },
  { regiao: 3, estados: ["CE", "MA", "PI"] },
  { regiao: 4, estados: ["AL", "PB", "PE", "RN"] },
  { regiao: 5, estados: ["BA", "SE"] },
  { regiao: 6, estados: ["MG"] },
  { regiao: 7, estados: ["ES", "RJ"] },
  { regiao: 8, estados: ["SP"] },
  { regiao: 9, estados: ["PR", "SC"] },
  { regiao: 0, estados: ["RS"] },
];

const ESTADOS_LIST = [
  { uf: "QUALQUER", nome: "Qualquer estado", regiao: -1 },
  { uf: "AC", nome: "Acre", regiao: 2 },
  { uf: "AL", nome: "Alagoas", regiao: 4 },
  { uf: "AM", nome: "Amazonas", regiao: 2 },
  { uf: "AP", nome: "Amapá", regiao: 2 },
  { uf: "BA", nome: "Bahia", regiao: 5 },
  { uf: "CE", nome: "Ceará", regiao: 3 },
  { uf: "DF", nome: "Distrito Federal", regiao: 1 },
  { uf: "ES", nome: "Espírito Santo", regiao: 7 },
  { uf: "GO", nome: "Goiás", regiao: 1 },
  { uf: "MA", nome: "Maranhão", regiao: 3 },
  { uf: "MG", nome: "Minas Gerais", regiao: 6 },
  { uf: "MS", nome: "Mato Grosso do Sul", regiao: 1 },
  { uf: "MT", nome: "Mato Grosso", regiao: 1 },
  { uf: "PA", nome: "Pará", regiao: 2 },
  { uf: "PB", nome: "Paraíba", regiao: 4 },
  { uf: "PE", nome: "Pernambuco", regiao: 4 },
  { uf: "PI", nome: "Piauí", regiao: 3 },
  { uf: "PR", nome: "Paraná", regiao: 9 },
  { uf: "RJ", nome: "Rio de Janeiro", regiao: 7 },
  { uf: "RN", nome: "Rio Grande do Norte", regiao: 4 },
  { uf: "RO", nome: "Rondônia", regiao: 2 },
  { uf: "RR", nome: "Roraima", regiao: 2 },
  { uf: "RS", nome: "Rio Grande do Sul", regiao: 0 },
  { uf: "SC", nome: "Santa Catarina", regiao: 9 },
  { uf: "SE", nome: "Sergipe", regiao: 5 },
  { uf: "SP", nome: "São Paulo", regiao: 8 },
  { uf: "TO", nome: "Tocantins", regiao: 1 },
];

function gerarCPF(regiao?: number): string {
  const n = Array.from({ length: 8 }, () => Math.floor(Math.random() * 10));
  const nono = regiao !== undefined && regiao >= 0 ? regiao : Math.floor(Math.random() * 10);
  const todos9 = [...n, nono];
  let soma = todos9.reduce((acc, v, i) => acc + v * (10 - i), 0);
  let d1 = (soma * 10) % 11;
  if (d1 === 10 || d1 === 11) d1 = 0;
  soma = [...todos9, d1].reduce((acc, v, i) => acc + v * (11 - i), 0);
  let d2 = (soma * 10) % 11;
  if (d2 === 10 || d2 === 11) d2 = 0;
  return [...todos9, d1, d2].join("");
}

function formatarCPF(cpf: string): string {
  return `${cpf.slice(0,3)}.${cpf.slice(3,6)}.${cpf.slice(6,9)}-${cpf.slice(9,11)}`;
}

// ════════════════════════════════════════════════════════════
// GERADOR DE RG
// ════════════════════════════════════════════════════════════
// Formato padrão SP: XX.XXX.XXX-D (dígito pode ser 0-9 ou X)
const ESTADOS_RG = [
  { uf: "SP", nome: "São Paulo", formato: "XX.XXX.XXX-D" },
  { uf: "RJ", nome: "Rio de Janeiro", formato: "XX.XXX.XXX-D" },
  { uf: "MG", nome: "Minas Gerais", formato: "M-XXX.XXX" },
  { uf: "RS", nome: "Rio Grande do Sul", formato: "XXXXXXXXX" },
  { uf: "PR", nome: "Paraná", formato: "X.XXX.XXX-D" },
  { uf: "SC", nome: "Santa Catarina", formato: "X.XXX.XXX" },
  { uf: "BA", nome: "Bahia", formato: "XX-XXXXXX" },
  { uf: "PE", nome: "Pernambuco", formato: "XXXXXXXXX" },
  { uf: "CE", nome: "Ceará", formato: "XXXXXXXXX" },
  { uf: "GO", nome: "Goiás", formato: "XXXXXXXXX" },
  { uf: "DF", nome: "Distrito Federal", formato: "XXXXXXXXX" },
  { uf: "OUTRO", nome: "Outro / Genérico", formato: "XX.XXX.XXX-D" },
];

function gerarRG(uf: string): string {
  const r = () => Math.floor(Math.random() * 10);
  const digito = () => {
    const d = Math.floor(Math.random() * 11);
    return d === 10 ? "X" : String(d);
  };

  switch (uf) {
    case "MG":
      return `M-${r()}${r()}${r()}.${r()}${r()}${r()}`;
    case "RS":
      return Array.from({ length: 9 }, r).join("");
    case "PR":
      return `${r()}.${r()}${r()}${r()}.${r()}${r()}${r()}-${digito()}`;
    case "SC":
      return `${r()}.${r()}${r()}${r()}.${r()}${r()}${r()}`;
    case "BA":
      return `${r()}${r()}-${r()}${r()}${r()}${r()}${r()}${r()}`;
    case "PE":
    case "CE":
    case "GO":
    case "DF":
      return Array.from({ length: 9 }, r).join("");
    // SP, RJ, OUTRO e demais: XX.XXX.XXX-D
    default:
      return `${r()}${r()}.${r()}${r()}${r()}.${r()}${r()}${r()}-${digito()}`;
  }
}

// ════════════════════════════════════════════════════════════
// GERADOR DE CNH
// ════════════════════════════════════════════════════════════
// O número de registro da CNH tem 11 dígitos + 2 dígitos verificadores (DSC1 e DSC2)
// Algoritmo oficial do DETRAN
function gerarCNH(): string {
  // Gera 9 dígitos base — primeiro dígito sempre 0
  const n = [0, ...Array.from({ length: 8 }, () => Math.floor(Math.random() * 10))];

  // Primeiro dígito verificador (DSC1)
  let soma = n.reduce((acc, v, i) => acc + v * (9 - i), 0);
  let dsc1 = soma % 11;
  let carry = 0;
  if (dsc1 >= 10) { dsc1 = 0; carry = 2; }

  // Segundo dígito verificador (DSC2)
  soma = n.reduce((acc, v, i) => acc + v * (1 + i), 0);
  let dsc2 = (soma % 11) - carry;
  if (dsc2 < 0) dsc2 += 11;
  if (dsc2 >= 10) dsc2 = 0;

  return [...n, dsc1, dsc2].join("");
}

function formatarCNH(cnh: string): string {
  // Formato: 11 dígitos sem espaço, ex: 08011477934
  return cnh;
}

// ════════════════════════════════════════════════════════════
// GERADOR DE CHASSI VIN — usa módulo compartilhado com entropia criptográfica
// ════════════════════════════════════════════════════════════
// MONTADORAS_VIN e ANOS_VIN importados de @/lib/vinGenerator

function GeradorChassi() {
  const [montadoraIdx, setMontadoraIdx] = useState(0);
  const [anoCode, setAnoCode] = useState('S');
  const [quantidade, setQuantidade] = useState(1);
  const [resultados, setResultados] = useState<{ vin: string; key: string }[]>([]);
  const [copiados, setCopiados] = useState<Set<string>>(new Set());

  const montadora = MONTADORAS_VIN[montadoraIdx];
  const anoInfo = ANOS_VIN.find(a => a.code === anoCode)!;

  const gerar = () => {
    const vins = gerarMultiplosVINs(montadora.wmi, montadora.vds, anoCode, quantidade);
    const novos = vins.map((vin, i) => ({ vin, key: `${vin}-${i}` }));
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
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-1 h-5 rounded-full bg-cyan-400" />
        <h2 className="text-xs font-bold tracking-widest text-cyan-400 uppercase">Gerador de Chassi VIN</h2>
      </div>

      <div className="bg-zinc-900/80 border border-zinc-700/50 rounded-2xl p-5 space-y-5">
        <div className="flex items-center gap-2">
          <span className="text-xl">🚗</span>
          <div>
            <span className="text-base font-bold text-white">Gerador de Chassi (VIN) Válido</span>
            <p className="text-xs text-zinc-500 mt-0.5">Gera chassi com dígito verificador calculado pelo algoritmo ISO 3779. Fictício — apenas para testes.</p>
          </div>
        </div>

        {/* Configurações */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-1">
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
            <p className="text-xs text-zinc-500 mt-1">WMI: <span className="font-mono text-cyan-400">{montadora.wmi}</span> — {montadora.modelos.join(', ')}</p>
          </div>

          <div>
            <label className="text-xs text-zinc-400 font-semibold mb-1.5 block">Ano do Veículo</label>
            <select
              value={anoCode}
              onChange={e => setAnoCode(e.target.value)}
              className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white text-sm focus:outline-none focus:border-cyan-500 transition-colors"
            >
              {ANOS_VIN.map(a => (
                <option key={a.code} value={a.code}>{a.ano} (código: {a.code})</option>
              ))}
            </select>
            <p className="text-xs text-zinc-500 mt-1">Posição 10 do VIN: <span className="font-mono text-cyan-400">{anoCode}</span></p>
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

        {/* Estrutura explicativa */}
        <div className="bg-zinc-800/50 border border-zinc-700/40 rounded-xl p-3">
          <p className="text-xs text-zinc-400 font-semibold mb-2">📐 Estrutura do VIN (17 caracteres)</p>
          <div className="flex flex-wrap gap-1 font-mono text-xs">
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
          className="w-full py-3.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:opacity-90 active:scale-[0.98] text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg"
        >
          <RefreshCw className="w-5 h-5" />
          Gerar Chassi{quantidade > 1 ? 's' : ''}
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
              <button
                onClick={copiarTodos}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600/20 border border-cyan-500/30 hover:bg-cyan-600/30 text-cyan-300 rounded-lg text-xs font-bold transition-colors"
              >
                <CheckCheck className="w-3.5 h-3.5" /> Copiar todos
              </button>
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
                className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${
                  copiados.has(key)
                    ? 'bg-cyan-950/40 border-cyan-500/40'
                    : 'bg-zinc-800/60 border-zinc-700/50 hover:border-zinc-600'
                }`}
              >
                <div>
                  <p className="font-mono font-bold text-sm text-white tracking-widest">
                    <span className="text-cyan-400">{vin.slice(0,3)}</span>
                    <span className="text-purple-400">{vin.slice(3,8)}</span>
                    <span className="text-yellow-400">{vin[8]}</span>
                    <span className="text-green-400">{vin[9]}</span>
                    <span className="text-orange-400">{vin[10]}</span>
                    <span className="text-zinc-300">{vin.slice(11)}</span>
                  </p>
                  <p className="text-zinc-500 text-xs mt-0.5">{montadora.nome} — {anoInfo.ano} — Dígito verificador: <span className="text-yellow-400 font-mono">{vin[8]}</span></p>
                </div>
                <button
                  onClick={() => copiarUm(key, vin)}
                  className={`p-2 rounded-lg transition-colors ${
                    copiados.has(key) ? 'text-cyan-400' : 'text-zinc-400 hover:text-white hover:bg-zinc-700'
                  }`}
                >
                  {copiados.has(key) ? <CheckCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// COMPONENTE AUXILIAR: Bloco de resultados genérico
// ════════════════════════════════════════════════════════════
function ResultadoLista({
  itens,
  copiados,
  onCopiarUm,
  onCopiarTodos,
  onLimpar,
  accentClass,
  accentBgClass,
}: {
  itens: { principal: string; secundario?: string; key: string }[];
  copiados: Set<string>;
  onCopiarUm: (key: string) => void;
  onCopiarTodos: () => void;
  onLimpar: () => void;
  accentClass: string;
  accentBgClass: string;
}) {
  return (
    <div className="bg-zinc-900/80 border border-zinc-700/50 rounded-2xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-white">
          {itens.length} resultado{itens.length > 1 ? "s" : ""} gerado{itens.length > 1 ? "s" : ""}
        </h3>
        <div className="flex gap-2">
          <button
            onClick={onCopiarTodos}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/20 border border-blue-500/30 hover:bg-blue-600/30 text-blue-300 rounded-lg text-xs font-bold transition-colors"
          >
            <CheckCheck className="w-3.5 h-3.5" /> Copiar todos
          </button>
          <button
            onClick={onLimpar}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/20 border border-red-500/30 hover:bg-red-600/30 text-red-300 rounded-lg text-xs font-bold transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" /> Limpar
          </button>
        </div>
      </div>
      <div className="space-y-2">
        {itens.map((item) => (
          <div
            key={item.key}
            className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${
              copiados.has(item.key)
                ? `${accentBgClass} border-opacity-40`
                : "bg-zinc-800/60 border-zinc-700/50 hover:border-zinc-600"
            }`}
          >
            <div>
              <p className="text-white font-mono font-bold text-sm">{item.principal}</p>
              {item.secundario && <p className="text-zinc-500 font-mono text-xs">{item.secundario}</p>}
            </div>
            <button
              onClick={() => onCopiarUm(item.key)}
              className={`p-2 rounded-lg transition-colors ${
                copiados.has(item.key)
                  ? `${accentClass} bg-opacity-10`
                  : "text-zinc-400 hover:text-white hover:bg-zinc-700"
              }`}
            >
              {copiados.has(item.key) ? <CheckCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// CONSULTA CEP
// ════════════════════════════════════════════════════════════
function ConsultaCep() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    cep: string; logradouro: string; complemento: string;
    bairro: string; localidade: string; uf: string;
    ibge: string; ddd: string; erro?: boolean;
  } | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [history, setHistory] = useState<{ cep: string; result: typeof result; at: number }[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  const formatCep = (v: string) => {
    const d = v.replace(/\D/g, "").slice(0, 8);
    return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
  };

  const searchCep = async (cepRaw?: string) => {
    const digits = (cepRaw ?? input).replace(/\D/g, "");
    if (digits.length !== 8) { toast.error("Digite um CEP com 8 dígitos"); return; }
    setLoading(true); setResult(null); setNotFound(false);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (data.erro) { setNotFound(true); }
      else {
        setResult(data);
        setHistory(prev => [{ cep: digits, result: data, at: Date.now() }, ...prev.filter(h => h.cep !== digits)].slice(0, 10));
      }
    } catch { toast.error("Erro ao consultar CEP."); }
    finally { setLoading(false); }
  };

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label); toast.success(`${label} copiado!`);
    setTimeout(() => setCopied(null), 2000);
  };

  const copyAll = () => {
    if (!result) return;
    const parts = [result.logradouro, result.complemento, result.bairro, `${result.localidade} - ${result.uf}`, `CEP: ${result.cep}`].filter(Boolean).join(", ");
    copyText(parts, "Endereço completo");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-1 h-5 rounded-full bg-teal-400" />
        <h2 className="text-xs font-bold tracking-widest text-teal-400 uppercase">Consulta de CEP</h2>
      </div>
      <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xl">📍</span>
          <span className="font-bold text-base text-foreground">Consulta de CEP</span>
        </div>
        {/* Input */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text" inputMode="numeric" placeholder="00000-000"
              value={input}
              onChange={e => { setInput(formatCep(e.target.value)); setNotFound(false); }}
              onKeyDown={e => e.key === "Enter" && searchCep()}
              className="w-full bg-background border border-border rounded-xl px-4 py-3 text-lg font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-teal-500/50 pr-10"
              maxLength={9}
            />
            {input && (
              <button onClick={() => { setInput(""); setResult(null); setNotFound(false); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                <span className="text-sm">✕</span>
              </button>
            )}
          </div>
          <button onClick={() => searchCep()} disabled={loading}
            className="px-5 py-3 bg-teal-600 hover:bg-teal-500 active:scale-95 text-white font-bold rounded-xl transition-all disabled:opacity-50 flex items-center gap-2">
            {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <span>🔍</span>}
            Buscar
          </button>
        </div>
        {/* Não encontrado */}
        {notFound && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-center">
            <p className="text-red-400 font-bold">CEP não encontrado</p>
            <p className="text-red-400/60 text-sm mt-1">Verifique se o CEP está correto.</p>
          </div>
        )}
        {/* Resultado */}
        {result && (
          <div className="border-2 border-teal-500/40 rounded-xl overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between bg-teal-500/10 border-b border-teal-500/30">
              <span className="text-sm font-bold text-teal-300">📍 {result.localidade} — {result.uf}</span>
              <button onClick={copyAll}
                className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground bg-muted/40 hover:bg-muted/70 px-3 py-1.5 rounded-lg transition-all">
                {copied === "Endereço completo" ? "✅" : "📋"} Copiar tudo
              </button>
            </div>
            <div className="p-4 space-y-2">
              {([
                { label: "CEP", value: result.cep },
                { label: "Logradouro", value: result.logradouro },
                result.complemento ? { label: "Complemento", value: result.complemento } : null,
                { label: "Bairro", value: result.bairro },
                { label: "Cidade", value: result.localidade },
                { label: "Estado", value: result.uf },
                { label: "DDD", value: result.ddd },
                { label: "IBGE", value: result.ibge },
              ] as ({ label: string; value: string } | null)[]).filter((f): f is { label: string; value: string } => f !== null).map(field => (
                <div key={field.label} className="flex items-center justify-between gap-3 py-1.5 border-b border-border/40 last:border-0">
                  <div className="min-w-0">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">{field.label}</p>
                    <p className="text-sm font-medium text-foreground">{field.value || "—"}</p>
                  </div>
                  {field.value && (
                    <button onClick={() => copyText(field.value, field.label)}
                      className="shrink-0 p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-all">
                      {copied === field.label ? "✅" : "📋"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Histórico */}
        {history.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">🕐 Histórico recente</p>
            <div className="space-y-1">
              {history.map(h => (
                <button key={h.cep}
                  onClick={() => { setInput(formatCep(h.cep)); searchCep(h.cep); }}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl hover:bg-muted/40 transition-colors text-left">
                  <span className="text-sm font-mono font-bold text-foreground">{formatCep(h.cep)}</span>
                  <span className="text-xs text-muted-foreground truncate">
                    {h.result?.logradouro ? `${h.result.logradouro}, ` : ""}{h.result?.bairro} — {h.result?.localidade}/{h.result?.uf}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// CONSULTA DE CIDADES POR ESTADO
// ════════════════════════════════════════════════════════════
const ESTADOS = [
  { sigla: "AC", nome: "Acre" }, { sigla: "AL", nome: "Alagoas" }, { sigla: "AP", nome: "Amapá" },
  { sigla: "AM", nome: "Amazonas" }, { sigla: "BA", nome: "Bahia" }, { sigla: "CE", nome: "Ceará" },
  { sigla: "DF", nome: "Distrito Federal" }, { sigla: "ES", nome: "Espírito Santo" }, { sigla: "GO", nome: "Goiás" },
  { sigla: "MA", nome: "Maranhão" }, { sigla: "MT", nome: "Mato Grosso" }, { sigla: "MS", nome: "Mato Grosso do Sul" },
  { sigla: "MG", nome: "Minas Gerais" }, { sigla: "PA", nome: "Pará" }, { sigla: "PB", nome: "Paraíba" },
  { sigla: "PR", nome: "Paraná" }, { sigla: "PE", nome: "Pernambuco" }, { sigla: "PI", nome: "Piauí" },
  { sigla: "RJ", nome: "Rio de Janeiro" }, { sigla: "RN", nome: "Rio Grande do Norte" }, { sigla: "RS", nome: "Rio Grande do Sul" },
  { sigla: "RO", nome: "Rondônia" }, { sigla: "RR", nome: "Roraima" }, { sigla: "SC", nome: "Santa Catarina" },
  { sigla: "SP", nome: "São Paulo" }, { sigla: "SE", nome: "Sergipe" }, { sigla: "TO", nome: "Tocantins" },
];

// Principais cidades por estado (capitais + maiores municípios)
const PRINCIPAIS_CIDADES: Record<string, string[]> = {
  AC: ["Rio Branco","Cruzeiro do Sul","Sena Madureira","Tarauacá","Feijó","Brasiléia","Epitaciolândia","Rodrigues Alves","Mâncio Lima","Plácido de Castro"],
  AL: ["Maceió","Arapiraca","Palmeira dos Índios","Rio Largo","Penedo","União dos Palmares","São Miguel dos Campos","Delmiro Gouveia","Marechal Deodoro","Coruripe","Santana do Ipanema","Murici"],
  AP: ["Macapá","Santana","Laranjal do Jari","Oiapoque","Mazagão","Porto Grande","Tartarugalzinho","Pedra Branca do Amapari","Amapá","Calçoene"],
  AM: ["Manaus","Parintins","Itacoatiara","Manacapuru","Coari","Tefé","Tabatinga","Maués","Humaitá","São Gabriel da Cachoeira","Iranduba","Presidente Figueiredo"],
  BA: ["Salvador","Feira de Santana","Vitória da Conquista","Camaçari","Juazeiro","Itabuna","Lauro de Freitas","Ilhéus","Jequié","Teixeira de Freitas","Barreiras","Alagoinhas","Porto Seguro","Paulo Afonso","Simões Filho","Eunápolis","Santo Antônio de Jesus","Valença","Cruz das Almas","Serrinha"],
  CE: ["Fortaleza","Caucaia","Juazeiro do Norte","Maracanaú","Sobral","Crato","Itapipoca","Maranguape","Iguatu","Quixadá","Canindé","Aquiraz","Pacatuba","Russas","Tianguá","Horizonte","Crateús","Aracati","Cascavel","Limoeiro do Norte"],
  DF: ["Brasília","Ceilândia","Taguatinga","Samambaia","Planaltina","Gama","Sobradinho","Recanto das Emas","Santa Maria","São Sebastião","Paranoá","Núcleo Bandeirante","Riacho Fundo","Lago Norte","Lago Sul"],
  ES: ["Vitória","Vila Velha","Serra","Cariacica","Linhares","Cachoeiro de Itapemirim","Colatina","Guarapari","São Mateus","Aracruz","Viana","Nova Venécia","Barra de São Francisco","Marataízes","Piúma"],
  GO: ["Goiânia","Aparecida de Goiânia","Anápolis","Rio Verde","Luziânia","Águas Lindas de Goiás","Valparaíso de Goiás","Trindade","Formosa","Novo Gama","Itumbiara","Senador Canedo","Catalão","Jataí","Planaltina","Caldas Novas","Santo Antônio do Descoberto","Goianésia","Mineiros","Inhumas"],
  MA: ["São Luís","Imperatriz","São José de Ribamar","Timon","Caxias","Codó","Paço do Lumiar","Açailândia","Bacabal","Balsas","Santa Inês","Barra do Corda","Pinheiro","Chapadinha","Coroatá","Viana","Pedreiras","São Mateus do Maranhão","Grajaú","Itapecuru Mirim"],
  MT: ["Cuiabá","Várzea Grande","Rondonópolis","Sinop","Tangará da Serra","Cáceres","Sorriso","Lucas do Rio Verde","Primavera do Leste","Barra do Garças","Alta Floresta","Nova Mutum","Colíder","Juara","Guarantã do Norte"],
  MS: ["Campo Grande","Dourados","Três Lagoas","Corumbá","Ponta Porã","Naviraí","Nova Andradina","Aquidauana","Sidrolândia","Paranaíba","Maracaju","Coxim","São Gabriel do Oeste","Amambai","Jardim"],
  MG: ["Belo Horizonte","Uberlândia","Contagem","Juiz de Fora","Betim","Montes Claros","Ribeirão das Neves","Uberaba","Governador Valadares","Ipatinga","Sete Lagoas","Divinópolis","Santa Luzia","Ibirité","Poços de Caldas","Patos de Minas","Pouso Alegre","Teófilo Otoni","Barbacena","Sabará","Vespasiano","Conselheiro Lafaiete","Varginha","Itabira","Coronel Fabriciano","Muriaé","Araguari","Ituiutaba","Passos","Ubá"],
  PA: ["Belém","Ananindeua","Santarém","Marabá","Castanhal","Parauapebas","Itaituba","Altamira","Abaetetuba","Cametá","Tucuruí","Barcarena","Bragança","Capanema","Paragominas","Redenção","Tailândia","Marituba","Benevides","Breves"],
  PB: ["João Pessoa","Campina Grande","Santa Rita","Patos","Bayeux","Sousa","Cajazeiras","Cabedelo","Guarabira","Sapé","Mamanguape","Queimadas","Esperança","Monteiro","Pombal"],
  PR: ["Curitiba","Londrina","Maringá","Ponta Grossa","Cascavel","São José dos Pinhais","Foz do Iguaçu","Colombo","Guarapuava","Paranaguá","Araucária","Toledo","Apucarana","Pinhais","Campo Largo","Arapongas","Almirante Tamandaré","Umuarama","Piraquara","Cambé","Sarandi","Francisco Beltrão","Fazenda Rio Grande","Pato Branco","Rolândia"],
  PE: ["Recife","Caruaru","Olinda","Petrolina","Paulista","Jaboatão dos Guararapes","Cabo de Santo Agostinho","Camaragibe","Garanhuns","Vitória de Santo Antão","Igarassu","Abreu e Lima","Santa Cruz do Capibaribe","Gravatá","Caetés","Bezerros","Carpina","Surubim","Araripina","Serra Talhada"],
  PI: ["Teresina","Parnaíba","Picos","Piripiri","Floriano","Campo Maior","Barras","União","Altos","José de Freitas","Oeiras","Esperantina","Pedro II","Batalha","Valença do Piauí"],
  RJ: ["Rio de Janeiro","São Gonçalo","Duque de Caxias","Nova Iguaçu","Niterói","Belford Roxo","São João de Meriti","Campos dos Goytacazes","Petrópolis","Volta Redonda","Magé","Itaboraí","Macaé","Mesquita","Nova Friburgo","Barra Mansa","Angra dos Reis","Nilópolis","Teresópolis","Cabo Frio","Queimados","Maricá","Resende","Rio das Ostras","Japeri"],
  RN: ["Natal","Mossoró","Parnamirim","São Gonçalo do Amarante","Macaíba","Ceará-Mirim","Caicó","Assu","Currais Novos","Santa Cruz","Nova Cruz","Pau dos Ferros","João Câmara","Apodi","Touros"],
  RS: ["Porto Alegre","Caxias do Sul","Pelotas","Canoas","Santa Maria","Gravataí","Viamão","Novo Hamburgo","São Leopoldo","Rio Grande","Alvorada","Passo Fundo","Sapucaia do Sul","Uruguaiana","Santa Cruz do Sul","Cachoeirinha","Bagé","Bento Gonçalves","Erechim","Guaíba","Cachoeira do Sul","Lajeado","Farroupilha","Santana do Livramento","Ijuí"],
  RO: ["Porto Velho","Ji-Paraná","Ariquemes","Vilhena","Cacoal","Rolim de Moura","Guajará-Mirim","Jaru","Ouro Preto do Oeste","Espigão d'Oeste","Pimenta Bueno","Machadinho d'Oeste","Buritis","Alta Floresta d'Oeste","Cerejeiras"],
  RR: ["Boa Vista","Rorainópolis","Caracaraí","Alto Alegre","Mucajaí","Cantá","Bonfim","Pacaraima","Amajari","Iracema"],
  SC: ["Florianópolis","Joinville","Blumenau","São José","Criciúma","Chapecó","Itajaí","Jaraguá do Sul","Palhoça","Balneário Camboriú","Biguaçu","São Francisco do Sul","Lages","Camboriú","Navegantes","Concórdia","Rio do Sul","Caçador","Tubarão","Brusque","Araranguá","Indaial","Gaspar","Mafra","Canoinhas"],
  SP: ["São Paulo","Guarulhos","Campinas","São Bernardo do Campo","Santo André","São José dos Campos","Ribeirão Preto","Osasco","Sorocaba","Mauá","São José do Rio Preto","Mogi das Cruzes","Santos","Diadema","Jundiaí","Piracicaba","Carapicuíba","Bauru","Itaquaquecetuba","São Vicente","Franca","Guarujá","Taubaté","Praia Grande","Limeira","Suzano","Taboão da Serra","Sumaré","Barueri","Embu das Artes","São Carlos","Indaiatuba","Cotia","Americana","Marília","Araraquara","Jacareí","Hortolândia","Presidente Prudente","Rio Claro"],
  SE: ["Aracaju","Nossa Senhora do Socorro","Lagarto","Itabaiana","São Cristóvão","Estância","Tobias Barreto","Simão Dias","Nossa Senhora da Glória","Propriá","Barra dos Coqueiros","Itaporanga d'Ajuda","Poço Redondo","Canindé de São Francisco","Neópolis"],
  TO: ["Palmas","Araguaína","Gurupi","Porto Nacional","Paraíso do Tocantins","Colinas do Tocantins","Guaraí","Tocantinópolis","Miracema do Tocantins","Formoso do Araguaia","Araguatins","Dianópolis","Pedro Afonso","Augustinópolis","Xambioá"],
};

function ConsultaCidades() {
  const [estado, setEstado] = useState("PR");
  const [busca, setBusca] = useState("");
  const [copiado, setCopiado] = useState("");

  const cidades = PRINCIPAIS_CIDADES[estado] || [];

  // Buscar automaticamente ao montar (sem necessidade de fetch)
  const [mounted] = useState(() => true);

  const cidadesFiltradas = cidades.filter(c => c.toLowerCase().includes(busca.toLowerCase()));

  const copiarCidade = (cidade: string) => {
    navigator.clipboard.writeText(cidade);
    setCopiado(cidade);
    setTimeout(() => setCopiado(""), 2000);
  };

  const copiarTodas = () => {
    navigator.clipboard.writeText(cidadesFiltradas.join("\n"));
    toast.success(`${cidadesFiltradas.length} cidades copiadas!`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-1 h-5 rounded-full bg-violet-400" />
        <h2 className="text-xs font-bold tracking-widest text-violet-400 uppercase">Consulta de Cidades por Estado</h2>
      </div>
      <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xl">🏙️</span>
          <span className="font-bold text-base text-foreground">Cidades por Estado</span>
        </div>
        {/* Seletor de estado */}
        <div className="flex gap-2">
          <select
            value={estado}
            onChange={e => { setEstado(e.target.value); setBusca(""); }}
            className="flex-1 bg-background border border-border rounded-xl px-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/50 text-sm"
          >
            {ESTADOS.map(e => (
              <option key={e.sigla} value={e.sigla}>{e.sigla} — {e.nome}</option>
            ))}
          </select>

        </div>
        {/* Resultado */}
        {cidades.length > 0 && (
          <>
            {/* Barra de busca + info */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Filtrar cidade..."
                value={busca}
                onChange={e => setBusca(e.target.value)}
                className="flex-1 bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
              />
              <button
                onClick={copiarTodas}
                className="flex items-center gap-1.5 px-3 py-2.5 bg-violet-500/20 border border-violet-500/40 text-violet-300 hover:bg-violet-500/30 rounded-xl text-xs font-bold transition-colors whitespace-nowrap"
              >
                📋 Copiar {cidadesFiltradas.length}
              </button>
            </div>
            {/* Info */}
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {ESTADOS.find(e => e.sigla === estado)?.nome} — <span className="text-violet-400 font-bold">{cidadesFiltradas.length} cidades</span>
                {busca && ` (filtro: "${busca}")`}
              </p>
            </div>
            {/* Lista */}
            <div className="border border-border rounded-xl overflow-hidden max-h-80 overflow-y-auto">
              {cidadesFiltradas.map((cidade, i) => (
                <div
                  key={cidade}
                  className={`flex items-center justify-between px-4 py-2.5 hover:bg-muted/30 transition-colors cursor-pointer group ${
                    i % 2 === 0 ? "bg-background" : "bg-muted/10"
                  }`}
                  onClick={() => copiarCidade(cidade)}
                >
                  <span className="text-sm text-foreground">{cidade}</span>
                  <span className={`text-xs font-bold transition-all ${
                    copiado === cidade ? "text-green-400" : "text-muted-foreground/0 group-hover:text-muted-foreground/60"
                  }`}>
                    {copiado === cidade ? "✅ Copiado" : "📋"}
                  </span>
                </div>
              ))}
              {cidadesFiltradas.length === 0 && (
                <div className="p-6 text-center text-muted-foreground text-sm">Nenhuma cidade encontrada para "{busca}"</div>
              )}
            </div>
          </>
        )}

      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// GERADOR DE PESSOA FICTÍCIA — dados auxiliares
// ════════════════════════════════════════════════════════════
const NOMES_MASCULINOS = ["JOAO","PEDRO","CARLOS","LUCAS","MATEUS","RAFAEL","FELIPE","BRUNO","RODRIGO","GUSTAVO","ANDERSON","MARCELO","DIEGO","THIAGO","EDUARDO","LEANDRO","RENATO","ALEXANDRE","FERNANDO","HENRIQUE","PAULO","ROBERTO","SERGIO","FABIO","MARCIO","ADRIANO","CRISTIANO","DANILO","EMERSON","GILSON","IAGO","JEFERSON","KLEBER","LEONARDO","MURILO","NELSON","OTAVIO","PATRICK","QUIRINO","RICARDO","SAMUEL","TIAGO","ULISSES","VAGNER","WESLEY","ALEX","YAGO","JOSE","ANTONIO","FRANCISCO","RAIMUNDO","MANOEL","BENEDITO","SEBASTIAO","WALMIR","ROGERIO","VALTER","CLEBERSON","EDSON","ELIAS"];
const NOMES_FEMININOS = ["MARIA","ANA","JULIANA","FERNANDA","CAMILA","PATRICIA","ALINE","BEATRIZ","CARLA","DANIELA","ELIANE","GABRIELA","HELENA","ISABELA","JESSICA","KAREN","LARISSA","MONICA","NATALIA","OLIVIA","PRISCILA","RAFAELA","SABRINA","TATIANA","URSULA","VANESSA","WANDA","YASMIN","ZILDA","ADRIANA","BRUNA","CRISTINA","DEBORA","EDUARDA","FLAVIA","GISELE","HELOISA","INGRID","JOANA","KATIA","LETICIA","MARIANA","NATHALIA","ODETE","PAULA","ROBERTA","SIMONE","TANIA","CLAUDIA","ROSANGELA","APARECIDA","FRANCISCA","RAIMUNDA","BENEDITA","SEBASTIANA","ELZA","IRENE","NEUZA","TEREZA","CONCEICAO"];
const SOBRENOMES = ["SILVA","SANTOS","OLIVEIRA","SOUZA","RODRIGUES","FERREIRA","ALVES","PEREIRA","LIMA","GOMES","COSTA","RIBEIRO","MARTINS","CARVALHO","ALMEIDA","LOPES","SOUSA","FERNANDES","VIEIRA","BARBOSA","ROCHA","DIAS","NASCIMENTO","ANDRADE","MOREIRA","NUNES","MARQUES","MACHADO","MENDES","FREITAS","CARDOSO","RAMOS","GONCALVES","ARAUJO","CRUZ","PINTO","TEIXEIRA","MONTEIRO","CORREIA","MELO","AZEVEDO","CAMPOS","CUNHA","MEDEIROS","CAVALCANTI","MOURA","FONSECA","PIRES","BORGES","TAVARES","BATISTA","BEZERRA","CAVALCANTE","DUARTE","ESTEVES","GUIMARAES","HENRIQUE","LACERDA","MACEDO","NOGUEIRA"];
const LOGRADOUROS = ["Rua","Avenida","Travessa","Alameda","Estrada","Rodovia","Viela","Beco"];
const NOMES_RUAS = ["das Flores","dos Pinheiros","das Acácias","do Ipê","das Palmeiras","da Saudade","do Sol","da Paz","das Rosas","do Cruzeiro","das Orquídeas","do Cedro","da Liberdade","dos Girassóis","do Progresso","da Esperança","dos Cravos","do Jacarandá","das Violetas","da Amizade","São João","Santa Maria","São Pedro","Nossa Senhora","São Paulo","Tiradentes","Getúlio Vargas","Sete de Setembro","Quinze de Novembro","Vinte e Um de Abril"];
const BAIRROS = ["Centro","Jardim América","Vila Nova","Bela Vista","Boa Vista","Alto da Serra","Parque Industrial","Jardim das Flores","Vila Esperança","Residencial","Jardim Primavera","Vila Operária","Bairro Novo","Santa Cruz","São Luís","Jardim Europa","Vila Rica","Parque São Jorge","Jardim Paulista","Vila Mariana","Mooca","Ipiranga","Lapa","Pinheiros","Consolação","Liberdade","Cambuci","Brás","Belém","Tatuapé"];
const EMAILS_DOMINIO = ["gmail.com","hotmail.com","yahoo.com.br","outlook.com","icloud.com","bol.com.br","uol.com.br"];

function rand<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min: number, max: number): number { return Math.floor(Math.random() * (max - min + 1)) + min; }

function gerarNome(genero: "M" | "F"): string {
  const primeiro = genero === "M" ? rand(NOMES_MASCULINOS) : rand(NOMES_FEMININOS);
  const sob1 = rand(SOBRENOMES);
  const sob2 = rand(SOBRENOMES);
  return `${primeiro} ${sob1} ${sob2}`;
}

function gerarDataNascimento(): string {
  const hoje = new Date();
  const anoMin = hoje.getFullYear() - 65;
  const anoMax = hoje.getFullYear() - 20;
  const ano = randInt(anoMin, anoMax);
  const mes = randInt(1, 12);
  const diasNoMes = new Date(ano, mes, 0).getDate();
  const dia = randInt(1, diasNoMes);
  return `${String(dia).padStart(2, "0")}/${String(mes).padStart(2, "0")}/${ano}`;
}

function gerarEndereco(uf: string): { logradouro: string; numero: string; bairro: string; cidade: string; cep: string } {
  const cidades = PRINCIPAIS_CIDADES[uf] || ["São Paulo"];
  const cidade = rand(cidades);
  const logradouro = `${rand(LOGRADOUROS)} ${rand(NOMES_RUAS)}`;
  const numero = String(randInt(1, 9999));
  const bairro = rand(BAIRROS);
  // CEP fictício mas formatado: 5 dígitos - 3 dígitos
  const cep = `${String(randInt(10000, 99999))}-${String(randInt(100, 999))}`;
  return { logradouro, numero, bairro, cidade, cep };
}

// Gera data futura para validade CNH (5-10 anos)
function gerarValidadeCNH(dataNasc: string): string {
  const hoje = new Date();
  const anos = randInt(5, 10);
  const validade = new Date(hoje.getFullYear() + anos, hoje.getMonth(), hoje.getDate());
  return `${String(validade.getDate()).padStart(2,"0")}/${String(validade.getMonth()+1).padStart(2,"0")}/${validade.getFullYear()}`;
}

// Gera data de primeira habilitação (5-20 anos atrás)
function gerarPrimeiraHabilitacao(): string {
  const hoje = new Date();
  const anos = randInt(5, 20);
  const data = new Date(hoje.getFullYear() - anos, randInt(0,11), randInt(1,28));
  return `${String(data.getDate()).padStart(2,"0")}/${String(data.getMonth()+1).padStart(2,"0")}/${data.getFullYear()}`;
}

// Gera RENACH (UF + 9 dígitos)
function gerarRENACH(uf: string): string {
  return `${uf}${Array.from({length:9},()=>randInt(0,9)).join("")}`;
}

// Gera Formulário CNH (10 dígitos)
function gerarFormularioCNH(): string {
  return Array.from({length:10},()=>randInt(0,9)).join("");
}

// Gera Número de Registro (11 dígitos)
function gerarNumeroRegistro(): string {
  return Array.from({length:11},()=>randInt(0,9)).join("");
}

// Gera PGU (9 zeros ou número)
function gerarPGU(): string {
  return "000000000";
}

const CATEGORIAS_CNH = ["A","B","AB","C","D","E","AC","AD","AE"];
const ORGAOS_EXPEDIDORES = ["SSP","DETRAN","SESP","PC","IIRGD"];
const CIDADES_NASCIMENTO: Record<string,string[]> = {
  SP:["SAO PAULO","CAMPINAS","SANTOS","SOROCABA","RIBEIRAO PRETO"],
  RJ:["RIO DE JANEIRO","NITEROI","CAMPOS DOS GOYTACAZES","PETROPOLIS","VOLTA REDONDA"],
  MG:["BELO HORIZONTE","UBERLANDIA","JUIZ DE FORA","CONTAGEM","BETIM"],
  BA:["SALVADOR","FEIRA DE SANTANA","VITORIA DA CONQUISTA","CAMACARI","ILHEUS"],
  RS:["PORTO ALEGRE","CAXIAS DO SUL","PELOTAS","CANOAS","SANTA MARIA"],
  PR:["CURITIBA","LONDRINA","MARINGA","PONTA GROSSA","CASCAVEL"],
  PE:["RECIFE","CARUARU","OLINDA","PETROLINA","PAULISTA"],
  CE:["FORTALEZA","CAUCAIA","JUAZEIRO DO NORTE","MARACANAU","SOBRAL"],
  PA:["BELEM","ANANINDEUA","SANTAREM","MARABA","CASTANHAL"],
  SC:["FLORIANOPOLIS","JOINVILLE","BLUMENAU","SAO JOSE","CRICIUMA"],
};
function gerarCidadeNascimento(uf: string): string {
  const lista = CIDADES_NASCIMENTO[uf] || CIDADES_NASCIMENTO["SP"];
  return rand(lista);
}

// ════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ════════════════════════════════════════════════════════════
export default function AdminTelefone() {

  // ── Gerador Completo ────────────────────────────────────
  const [gcEstado, setGcEstado] = useState("SP"); // estado para CPF + RG
  const [gcFormatCpf, setGcFormatCpf] = useState(true);
  const [gcFormatRg, setGcFormatRg] = useState(false); // padrão: sem pontos
  const [gcFormatCnh, setGcFormatCnh] = useState(false); // padrão: sem espaço
  const [gcNomeInput, setGcNomeInput] = useState(""); // nome opcional
  const [gcGenero, setGcGenero] = useState<"M" | "F" | "">("M");
  const [gcResult, setGcResult] = useState<{
    nome: string; genero: string; dataNasc: string;
    localNascimento: string; nacionalidade: string;
    nomePai: string; nomeMae: string;
    telefone: string; cpf: string;
    rg: string; orgaoExpedidor: string;
    cnh: string; categoriaCnh: string; validadeCnh: string;
    primeiraHabilitacao: string;
    renach: string; formularioCnh: string; numeroRegistro: string; pgu: string;
  } | null>(null);
  const [gcCopiados, setGcCopiados] = useState<Set<string>>(new Set());

  const gcEstadoInfo = ESTADOS_LIST.find(e => e.uf === gcEstado);
  const gcRegiaoFiscal = gcEstadoInfo && gcEstadoInfo.regiao >= 0 ? gcEstadoInfo.regiao : undefined;
  const gcEstadoRgUf = ESTADOS_RG.find(e => e.uf === gcEstado) ? gcEstado : "SP";

  const gerarCompleto = () => {
    const generoEfetivo: "M" | "F" = gcGenero === "" ? (Math.random() > 0.5 ? "M" : "F") : gcGenero;
    const nomeGerado = gcNomeInput.trim() !== "" ? gcNomeInput.trim() : gerarNome(generoEfetivo);
    const dataNasc = gerarDataNascimento();
    const categoria = rand(CATEGORIAS_CNH);
    const orgao = rand(ORGAOS_EXPEDIDORES);
    setGcResult({
      nome: nomeGerado.toUpperCase(),
      genero: generoEfetivo === "M" ? "MASCULINO" : "FEMININO",
      dataNasc,
      localNascimento: gerarCidadeNascimento(gcEstado),
      nacionalidade: "BRASILEIRO(A)",
      nomePai: gerarNome("M").toUpperCase(),
      nomeMae: gerarNome("F").toUpperCase(),
      telefone: gerarTelefone(),
      cpf: gerarCPF(gcRegiaoFiscal),
      rg: gerarRG(gcEstadoRgUf),
      orgaoExpedidor: `${orgao} - ${gcEstado}`,
      cnh: gerarCNH(),
      categoriaCnh: categoria,
      validadeCnh: gerarValidadeCNH(dataNasc),
      primeiraHabilitacao: gerarPrimeiraHabilitacao(),
      renach: gerarRENACH(gcEstado),
      formularioCnh: gerarFormularioCNH(),
      numeroRegistro: gerarNumeroRegistro(),
      pgu: gerarPGU(),
    });
    setGcCopiados(new Set());
  };

  const gcCopiar = (campo: string, valor: string) => {
    navigator.clipboard.writeText(valor);
    setGcCopiados(prev => { const s = new Set(prev); s.add(campo); return s; });
    toast.success(`Copiado: ${valor}`);
    setTimeout(() => setGcCopiados(prev => { const s = new Set(prev); s.delete(campo); return s; }), 2000);
  };

  const gcCopiarTudo = () => {
    if (!gcResult) return;
    const tel = formatarTelefone(gcResult.telefone);
    const cpf = gcFormatCpf ? formatarCPF(gcResult.cpf) : gcResult.cpf;
    const rg = gcFormatRg ? gcResult.rg : gcResult.rg.replace(/[^0-9X]/g, "");
    const cnh = gcFormatCnh ? formatarCNH(gcResult.cnh) : gcResult.cnh;
    navigator.clipboard.writeText(
`=== INFORMAÇÕES DA CNH ===
Categoria Atual: ${gcResult.categoriaCnh}
Categoria Autorizada: ${gcResult.categoriaCnh}
Validade: ${gcResult.validadeCnh}
Situação: CONFIRMADA
Permissionário: Não
=== INFORMAÇÕES PESSOAIS ===
Nome Completo: ${gcResult.nome}
CPF: ${cpf}
Data de Nascimento: ${gcResult.dataNasc}
Sexo: ${gcResult.genero}
Nacionalidade: ${gcResult.nacionalidade}
Local de Nascimento: ${gcResult.localNascimento}
Nome da Mãe: ${gcResult.nomeMae}
Nome do Pai: ${gcResult.nomePai}
=== DOCUMENTAÇÃO E REGISTROS ===
Documento: CARTEIRA IDENTIDADE
Número do Documento: ${rg}
Órgão Expedidor: ${gcResult.orgaoExpedidor}
Formulário CNH: ${gcResult.formularioCnh}
RENACH: ${gcResult.renach}
Número de Registro: ${gcResult.numeroRegistro}
PGU: ${gcResult.pgu}
=== HISTÓRICO DE HABILITAÇÃO ===
Primeira Habilitação: ${gcResult.primeiraHabilitacao} - UF: ${gcEstado}`
    );
    toast.success("Dados copiados no formato CNH!");
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <AdminHeader title="Geradores" backTo="/admin/codes" />

      <div className="max-w-4xl mx-auto px-4 py-6">

        <div className="grid grid-cols-1 gap-6">

        {/* ══ GERADOR COMPLETO ═══════════════════════════════════════════════════════════ */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-1 h-6 bg-gradient-to-b from-green-400 via-purple-500 to-orange-400 rounded-full" />
            <h2 className="text-sm font-bold text-zinc-300 uppercase tracking-widest">Gerador Completo</h2>
          </div>

          <div className="bg-zinc-900/80 border border-zinc-700/50 rounded-2xl p-5 space-y-5">
            <div className="flex items-center gap-2">
              <span className="text-xl">⚡</span>
              <span className="text-base font-bold text-white">Gerar Telefone + CPF + RG + CNH de uma vez</span>
            </div>

            {/* Configurações */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Campo nome opcional */}
              <div className="sm:col-span-2">
                <label className="text-xs text-zinc-400 font-semibold mb-1.5 block">Nome (opcional)</label>
                <input
                  type="text"
                  value={gcNomeInput}
                  onChange={e => setGcNomeInput(e.target.value)}
                  placeholder="Deixe vazio para gerar automaticamente..."
                  className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white text-sm placeholder:text-zinc-500 focus:outline-none focus:border-purple-500 transition-colors"
                />
                <p className="text-xs text-zinc-500 mt-1">Pode digitar apenas o primeiro nome ou o nome completo</p>
              </div>
              {/* Gênero */}
              <div>
                <label className="text-xs text-zinc-400 font-semibold mb-1.5 block">Gênero</label>
                <div className="flex gap-2">
                  <button onClick={() => setGcGenero("M")} className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${gcGenero === "M" ? "bg-blue-600 text-white" : "bg-zinc-800 text-zinc-400 border border-zinc-700"}`}>♂ Masculino</button>
                  <button onClick={() => setGcGenero("F")} className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${gcGenero === "F" ? "bg-pink-600 text-white" : "bg-zinc-800 text-zinc-400 border border-zinc-700"}`}>♀ Feminino</button>
                  <button onClick={() => setGcGenero("")} className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${gcGenero === "" ? "bg-purple-600 text-white" : "bg-zinc-800 text-zinc-400 border border-zinc-700"}`}>🎲 Aleatório</button>
                </div>
              </div>
              {/* Estado */}
              <div>
                <label className="text-xs text-zinc-400 font-semibold mb-1.5 block">Estado (CPF + RG + Endereço)</label>
                <select
                  value={gcEstado}
                  onChange={e => setGcEstado(e.target.value)}
                  className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white text-sm focus:outline-none focus:border-purple-500 transition-colors"
                >
                  {ESTADOS_LIST.filter(e => e.uf !== "QUALQUER").map(e => (
                    <option key={e.uf} value={e.uf}>{e.uf} — {e.nome}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Formatos */}
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-400 font-semibold">CPF:</span>
                <button onClick={() => setGcFormatCpf(true)} className={`px-2 py-1 rounded text-xs font-bold transition-all ${gcFormatCpf ? "bg-purple-600 text-white" : "bg-zinc-800 text-zinc-400 border border-zinc-700"}`}>000.000.000-00</button>
                <button onClick={() => setGcFormatCpf(false)} className={`px-2 py-1 rounded text-xs font-bold transition-all ${!gcFormatCpf ? "bg-purple-600 text-white" : "bg-zinc-800 text-zinc-400 border border-zinc-700"}`}>Sem pontos</button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-400 font-semibold">RG:</span>
                <button onClick={() => setGcFormatRg(true)} className={`px-2 py-1 rounded text-xs font-bold transition-all ${gcFormatRg ? "bg-blue-600 text-white" : "bg-zinc-800 text-zinc-400 border border-zinc-700"}`}>Com pontos</button>
                <button onClick={() => setGcFormatRg(false)} className={`px-2 py-1 rounded text-xs font-bold transition-all ${!gcFormatRg ? "bg-blue-600 text-white" : "bg-zinc-800 text-zinc-400 border border-zinc-700"}`}>Sem pontos</button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-400 font-semibold">CNH:</span>
                <button onClick={() => setGcFormatCnh(true)} className={`px-2 py-1 rounded text-xs font-bold transition-all ${gcFormatCnh ? "bg-orange-600 text-white" : "bg-zinc-800 text-zinc-400 border border-zinc-700"}`}>XXXXX XXXXXX</button>
                <button onClick={() => setGcFormatCnh(false)} className={`px-2 py-1 rounded text-xs font-bold transition-all ${!gcFormatCnh ? "bg-orange-600 text-white" : "bg-zinc-800 text-zinc-400 border border-zinc-700"}`}>Sem espaço</button>
              </div>
            </div>

            {/* Botão gerar */}
            <button
              onClick={gerarCompleto}
              className="w-full py-3.5 bg-gradient-to-r from-green-500 via-purple-600 to-orange-500 hover:opacity-90 active:scale-[0.98] text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg"
            >
              <RefreshCw className="w-5 h-5" />
              Gerar Tudo de Uma Vez
            </button>
          </div>

          {/* Resultado */}
          {gcResult && (
            <div className="bg-zinc-900/80 border border-zinc-700/50 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">Dados gerados</h3>
                <div className="flex gap-2">
                  <button
                    onClick={gcCopiarTudo}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/20 border border-blue-500/30 hover:bg-blue-600/30 text-blue-300 rounded-lg text-xs font-bold transition-colors"
                  >
                    <CheckCheck className="w-3.5 h-3.5" /> Copiar tudo
                  </button>
                  <button
                    onClick={() => setGcResult(null)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/20 border border-red-500/30 hover:bg-red-600/30 text-red-300 rounded-lg text-xs font-bold transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Limpar
                  </button>
                </div>
              </div>
              {/* Seções com título */}
              <div className="space-y-4">
                {/* CNH */}
                <div>
                  <p className="text-[10px] font-bold text-orange-400 uppercase tracking-widest mb-1.5">═══ INFORMAÇÕES DA CNH ═══</p>
                  <div className="space-y-2">
                  {[
                    { campo: "categoriaCnh", label: "Categoria Atual / Autorizada", valor: gcResult.categoriaCnh, accent: "text-orange-400", bg: "bg-orange-950/40 border-orange-500/40" },
                    { campo: "validadeCnh", label: "Validade", valor: gcResult.validadeCnh, accent: "text-orange-400", bg: "bg-orange-950/40 border-orange-500/40" },
                  ].map(({ campo, label, valor, accent, bg }) => (
                    <div key={campo} className={`flex items-center justify-between px-4 py-2.5 rounded-xl border transition-all ${gcCopiados.has(campo) ? bg : "bg-zinc-800/60 border-zinc-700/50 hover:border-zinc-600"}`}>
                      <div><p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">{label}</p><p className={`font-mono font-bold text-sm ${gcCopiados.has(campo) ? accent : "text-white"}`}>{valor}</p></div>
                      <button onClick={() => gcCopiar(campo, valor)} className={`p-2 rounded-lg transition-colors ${gcCopiados.has(campo) ? accent : "text-zinc-400 hover:text-white hover:bg-zinc-700"}`}>{gcCopiados.has(campo) ? <CheckCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />}</button>
                    </div>
                  ))}
                  </div>
                </div>
                {/* Pessoais */}
                <div>
                  <p className="text-[10px] font-bold text-purple-400 uppercase tracking-widest mb-1.5">═══ INFORMAÇÕES PESSOAIS ═══</p>
                  <div className="space-y-2">
                  {[
                    { campo: "nome", label: "Nome Completo", valor: gcResult.nome, accent: "text-white", bg: "bg-zinc-700/40 border-zinc-500/40" },
                    { campo: "cpf", label: "CPF", valor: gcFormatCpf ? formatarCPF(gcResult.cpf) : gcResult.cpf, accent: "text-purple-400", bg: "bg-purple-950/40 border-purple-500/40" },
                    { campo: "dataNasc", label: "Data de Nascimento", valor: gcResult.dataNasc, accent: "text-yellow-400", bg: "bg-yellow-950/40 border-yellow-500/40" },
                    { campo: "genero", label: "Sexo", valor: gcResult.genero, accent: "text-pink-400", bg: "bg-pink-950/40 border-pink-500/40" },
                    { campo: "nacionalidade", label: "Nacionalidade", valor: gcResult.nacionalidade, accent: "text-green-400", bg: "bg-green-950/40 border-green-500/40" },
                    { campo: "localNascimento", label: "Local de Nascimento", valor: gcResult.localNascimento, accent: "text-green-400", bg: "bg-green-950/40 border-green-500/40" },
                    { campo: "nomeMae", label: "Nome da Mãe", valor: gcResult.nomeMae, accent: "text-rose-400", bg: "bg-rose-950/40 border-rose-500/40" },
                    { campo: "nomePai", label: "Nome do Pai", valor: gcResult.nomePai, accent: "text-sky-400", bg: "bg-sky-950/40 border-sky-500/40" },
                    { campo: "telefone", label: "Telefone", valor: formatarTelefone(gcResult.telefone), accent: "text-green-400", bg: "bg-green-950/40 border-green-500/40" },
                  ].map(({ campo, label, valor, accent, bg }) => (
                    <div key={campo} className={`flex items-center justify-between px-4 py-2.5 rounded-xl border transition-all ${gcCopiados.has(campo) ? bg : "bg-zinc-800/60 border-zinc-700/50 hover:border-zinc-600"}`}>
                      <div><p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">{label}</p><p className={`font-mono font-bold text-sm ${gcCopiados.has(campo) ? accent : "text-white"}`}>{valor}</p></div>
                      <button onClick={() => gcCopiar(campo, valor)} className={`p-2 rounded-lg transition-colors ${gcCopiados.has(campo) ? accent : "text-zinc-400 hover:text-white hover:bg-zinc-700"}`}>{gcCopiados.has(campo) ? <CheckCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />}</button>
                    </div>
                  ))}
                  </div>
                </div>
                {/* Documentação */}
                <div>
                  <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-1.5">═══ DOCUMENTAÇÃO E REGISTROS ═══</p>
                  <div className="space-y-2">
                  {[
                    { campo: "rg", label: "Número do Documento (RG)", valor: gcFormatRg ? gcResult.rg : gcResult.rg.replace(/[^0-9X]/g, ""), accent: "text-blue-400", bg: "bg-blue-950/40 border-blue-500/40" },
                    { campo: "orgaoExpedidor", label: "Órgão Expedidor", valor: gcResult.orgaoExpedidor, accent: "text-blue-400", bg: "bg-blue-950/40 border-blue-500/40" },
                    { campo: "formularioCnh", label: "Formulário CNH", valor: gcResult.formularioCnh, accent: "text-cyan-400", bg: "bg-cyan-950/40 border-cyan-500/40" },
                    { campo: "renach", label: "RENACH", valor: gcResult.renach, accent: "text-cyan-400", bg: "bg-cyan-950/40 border-cyan-500/40" },
                    { campo: "numeroRegistro", label: "Número de Registro", valor: gcResult.numeroRegistro, accent: "text-cyan-400", bg: "bg-cyan-950/40 border-cyan-500/40" },
                    { campo: "pgu", label: "PGU", valor: gcResult.pgu, accent: "text-zinc-400", bg: "bg-zinc-700/40 border-zinc-500/40" },
                  ].map(({ campo, label, valor, accent, bg }) => (
                    <div key={campo} className={`flex items-center justify-between px-4 py-2.5 rounded-xl border transition-all ${gcCopiados.has(campo) ? bg : "bg-zinc-800/60 border-zinc-700/50 hover:border-zinc-600"}`}>
                      <div><p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">{label}</p><p className={`font-mono font-bold text-sm ${gcCopiados.has(campo) ? accent : "text-white"}`}>{valor}</p></div>
                      <button onClick={() => gcCopiar(campo, valor)} className={`p-2 rounded-lg transition-colors ${gcCopiados.has(campo) ? accent : "text-zinc-400 hover:text-white hover:bg-zinc-700"}`}>{gcCopiados.has(campo) ? <CheckCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />}</button>
                    </div>
                  ))}
                  </div>
                </div>
                {/* Histórico */}
                <div>
                  <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-1.5">═══ HISTÓRICO DE HABILITAÇÃO ═══</p>
                  <div className="space-y-2">
                  {[
                    { campo: "primeiraHabilitacao", label: `Primeira Habilitação - UF: ${gcEstado}`, valor: gcResult.primeiraHabilitacao, accent: "text-emerald-400", bg: "bg-emerald-950/40 border-emerald-500/40" },
                  ].map(({ campo, label, valor, accent, bg }) => (
                    <div key={campo} className={`flex items-center justify-between px-4 py-2.5 rounded-xl border transition-all ${gcCopiados.has(campo) ? bg : "bg-zinc-800/60 border-zinc-700/50 hover:border-zinc-600"}`}>
                      <div><p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">{label}</p><p className={`font-mono font-bold text-sm ${gcCopiados.has(campo) ? accent : "text-white"}`}>{valor}</p></div>
                      <button onClick={() => gcCopiar(campo, valor)} className={`p-2 rounded-lg transition-colors ${gcCopiados.has(campo) ? accent : "text-zinc-400 hover:text-white hover:bg-zinc-700"}`}>{gcCopiados.has(campo) ? <CheckCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />}</button>
                    </div>
                  ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        </div>{/* end grid */}

        {/* ══ GERADOR DE NÚM. 90+ ══════════════════════════════════════════════ */}
        <GeradorTelefone90 />

        {/* ══ GERADOR DE CHASSI VIN ══════════════════════════════════════════════ */}
        <GeradorChassi />

        {/* ══ CONSULTA DE CEP ══════════════════════════════════════════════════════════════ */}
        <ConsultaCep />

        {/* ══ CONSULTA DE CIDADES ══════════════════════════════════════════════════════════════ */}
        <ConsultaCidades />

        <div className="pb-8" />
      </div>
    </div>
  );
}
