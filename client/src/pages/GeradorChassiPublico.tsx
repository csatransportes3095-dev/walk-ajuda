import { useRef, useState } from "react";
import { toast } from "sonner";
import { Copy, RefreshCw, Trash2, CheckCheck, ArrowLeft, Download, QrCode } from "lucide-react";
import { Link } from "wouter";
import QRCode from "qrcode";
import { MONTADORAS_VIN, ANOS_VIN, gerarMultiplosVINs } from "@/lib/vinGenerator";
import { trpc } from "@/lib/trpc";

const QR_FINAL_W = 230;
const QR_FINAL_H = 229;
const QR_INNER = 203;
const QR_MARGIN_LEFT = 14;
const QR_MARGIN_TOP = 12;

const normalizeLabel = (value: string) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const QR_FIELD_ALIASES: Array<{ code: string; labels: string[] }> = [
  { code: "REN", labels: ["renavam", "codigo renavam"] },
  { code: "PLA", labels: ["placa"] },
  { code: "EXE", labels: ["exercicio"] },
  { code: "FAB", labels: ["ano fabricacao", "ano de fabricacao", "ano fab"] },
  { code: "MOD", labels: ["ano modelo", "ano mod"] },
  { code: "CRV", labels: ["numero do crv", "numero crv", "num crv", "crv"] },
  { code: "CLA", labels: ["codigo de seguranca do cla", "codigo seguranca cla", "codigo cla", "cla"] },
  { code: "UF", labels: ["uf"] },
  { code: "RNT", labels: ["rntrc"] },
  { code: "NOM", labels: ["nome", "proprietario", "nome proprietario"] },
  { code: "CPF", labels: ["cpf cnpj", "cpf", "cnpj"] },
  { code: "CHA", labels: ["chassi"] },
  { code: "ESP", labels: ["especie"] },
  { code: "TIP", labels: ["tipo", "tipo veiculo", "tipo de veiculo"] },
  { code: "CAR", labels: ["carroceria"] },
  { code: "COM", labels: ["combustivel"] },
  { code: "MAR", labels: ["marca modelo versao", "marca modelo", "marca modelo versao"] },
  { code: "LOT", labels: ["lotacao"] },
  { code: "POT", labels: ["potencia", "potencia cv"] },
  { code: "CIL", labels: ["cilindradas", "cilindrada"] },
  { code: "CAT", labels: ["categoria"] },
  { code: "MOT", labels: ["motor"] },
  { code: "CCG", labels: ["capacidade maxima de carga", "capacidade max carga", "capacidade carga", "capacidade"] },
  { code: "PBT", labels: ["peso bruto total", "pbt"] },
  { code: "CTR", labels: ["capacidade maxima de tracao", "capacidade max tracao", "capacidade tracao", "cmt"] },
  { code: "EIX", labels: ["eixos"] },
  { code: "LOC", labels: ["local", "municipio", "cidade"] },
  { code: "DAT", labels: ["data", "data emissao", "data de emissao"] },
  { code: "OBS", labels: ["observacoes", "observacoes do veiculo"] },
];

function buildQrPayloadFromText(rawText: string) {
  const trimmed = rawText.trim();
  if (!trimmed) throw new Error("Cole os dados do veículo antes de gerar o QR Code.");
  if (trimmed.startsWith("WDCRLV1;")) return trimmed;

  const values = new Map<string, string>();
  const lines = rawText.split(/\r?\n/).map(line => line.trim()).filter(Boolean);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    let label = "";
    let value = "";
    if (line.includes(":")) {
      const splitAt = line.indexOf(":");
      label = line.slice(0, splitAt).trim();
      value = line.slice(splitAt + 1).trim();
    } else if (i + 1 < lines.length && !lines[i + 1].includes(":")) {
      label = line;
      value = lines[i + 1].trim();
    }
    if (!label || !value) continue;
    values.set(normalizeLabel(label), value);
  }

  const get = (labels: string[]) => {
    for (const label of labels) {
      const found = values.get(normalizeLabel(label));
      if (found) return found;
    }
    return "";
  };

  let local = get(["local", "municipio", "cidade"]);
  let uf = get(["uf"]);
  if (!uf && local) {
    const match = local.toUpperCase().match(/\b([A-Z]{2})$/);
    if (match) {
      uf = match[1];
      local = local.replace(new RegExp(`\\s+${match[1]}$`, "i"), "").trim();
    }
  }

  const combinedSpecies = get(["especie tipo", "especie / tipo"]);
  let especie = get(["especie"]);
  let tipo = get(["tipo", "tipo veiculo", "tipo de veiculo"]);
  if (!especie && combinedSpecies) {
    const parts = combinedSpecies.trim().split(/\s+/);
    if (parts.length >= 2 && parts[0].toUpperCase() === "PASSAGEIRO" && parts[1].toUpperCase() === "AUTOMOVEL") {
      especie = "PASSAGEIRO";
      tipo = tipo || "AUTOMOVEL";
    } else {
      especie = combinedSpecies;
    }
  }

  const potCil = get(["potencia cilindrada", "potencia/cilindrada"]);
  let potencia = get(["potencia", "potencia cv"]);
  let cilindrada = get(["cilindradas", "cilindrada"]);
  if (potCil) {
    const match = potCil.match(/\s*([0-9]+)\s*CV?\s*\/\s*([0-9]+)/i);
    if (match) {
      potencia = potencia || match[1];
      cilindrada = cilindrada || match[2];
    }
  }

  const resolved = new Map<string, string>();
  for (const field of QR_FIELD_ALIASES) resolved.set(field.code, get(field.labels));
  resolved.set("UF", uf);
  resolved.set("LOC", local);
  resolved.set("ESP", especie);
  resolved.set("TIP", tipo);
  resolved.set("POT", potencia);
  resolved.set("CIL", cilindrada);

  const compact = QR_FIELD_ALIASES
    .map(field => {
      let value = (resolved.get(field.code) || "").trim();
      if (!value) return null;
      if (field.code === "CPF") value = value.replace(/\D/g, "");
      return `${field.code}=${value}`;
    })
    .filter(Boolean);

  if (compact.length === 0) throw new Error("Não encontrei campos reconhecidos nos dados colados.");
  return `WDCRLV1;${compact.join(";")}`;
}

export default function GeradorChassiPublico() {
  const { data: settings } = trpc.settings.getAll.useQuery();
  const logoUrl = settings?.login_image_url || "";
  const [montadoraIdx, setMontadoraIdx] = useState(0);
  const [anoCode, setAnoCode] = useState("S");
  const [quantidade, setQuantidade] = useState(1);
  const [resultados, setResultados] = useState<{ vin: string; key: string }[]>([]);
  const [copiados, setCopiados] = useState<Set<string>>(new Set());
  const [qrRawText, setQrRawText] = useState("");
  const [qrPayload, setQrPayload] = useState("");
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);

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
    navigator.clipboard.writeText(resultados.map(r => r.vin).join("\n"));
    toast.success(`${resultados.length} chassi${resultados.length > 1 ? "s" : ""} copiado${resultados.length > 1 ? "s" : ""}!`);
  };

  const gerarQr = async () => {
    try {
      const payload = buildQrPayloadFromText(qrRawText);
      const finalCanvas = qrCanvasRef.current;
      if (!finalCanvas) throw new Error("Área do QR Code não está disponível.");

      const sourceCanvas = document.createElement("canvas");
      await QRCode.toCanvas(sourceCanvas, payload, {
        errorCorrectionLevel: "L",
        margin: 0,
        width: QR_INNER,
        color: { dark: "#000000", light: "#ffffff" },
      });

      finalCanvas.width = QR_FINAL_W;
      finalCanvas.height = QR_FINAL_H;
      const ctx = finalCanvas.getContext("2d");
      if (!ctx) throw new Error("Navegador sem suporte ao Canvas.");
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, QR_FINAL_W, QR_FINAL_H);
      ctx.drawImage(sourceCanvas, QR_MARGIN_LEFT, QR_MARGIN_TOP, QR_INNER, QR_INNER);
      setQrPayload(payload);
      toast.success("QR Code gerado no padrão do WalkPro.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar o QR Code.");
    }
  };

  const baixarQr = () => {
    const canvas = qrCanvasRef.current;
    if (!canvas || !qrPayload) return toast.error("Gere o QR Code primeiro.");
    const link = document.createElement("a");
    link.download = `qr-crlv-${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const copiarQr = async () => {
    const canvas = qrCanvasRef.current;
    if (!canvas || !qrPayload) return toast.error("Gere o QR Code primeiro.");
    try {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
      if (!blob || !navigator.clipboard || typeof ClipboardItem === "undefined") throw new Error();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast.success("QR Code copiado como imagem.");
    } catch {
      toast.error("Este navegador não permite copiar a imagem. Use Baixar PNG.");
    }
  };

  return (
    <div className="min-h-screen text-white" style={{ background: "radial-gradient(ellipse at top, #1a0a2e 0%, #0d0d1a 40%, #050508 100%)" }}>
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
              <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center"><span className="text-lg">🚗</span></div>
            )}
            <div>
              <h1 className="text-sm font-bold text-white">Gerador de Chassi VIN + QR CRLV</h1>
              <p className="text-xs text-zinc-500">Ferramentas independentes</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-2xl px-4 py-3 flex items-start gap-3">
          <span className="text-lg mt-0.5">⚠️</span>
          <p className="text-xs text-yellow-200/80 leading-relaxed">Os chassi gerados são <strong>fictícios</strong> e válidos apenas no formato. Use somente para testes.</p>
        </div>

        <div className="bg-zinc-900/80 border border-zinc-700/50 rounded-2xl p-5 space-y-5">
          <div className="flex items-center gap-2">
            <span className="text-xl">🚗</span>
            <div><span className="text-base font-bold text-white">Gerar Chassi (VIN) Válido</span><p className="text-xs text-zinc-500 mt-0.5">Algoritmo ISO 3779 — dígito verificador calculado automaticamente</p></div>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-zinc-400 font-semibold mb-1.5 block">Montadora</label>
              <select value={montadoraIdx} onChange={e => setMontadoraIdx(Number(e.target.value))} className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white text-sm focus:outline-none focus:border-cyan-500 transition-colors">
                {MONTADORAS_VIN.map((m, i) => <option key={m.wmi} value={i}>{m.nome}</option>)}
              </select>
              <p className="text-xs text-zinc-500 mt-1.5">Código WMI: <span className="font-mono text-cyan-400">{montadora.wmi}</span><span className="mx-2 text-zinc-700">|</span>Modelos: {montadora.modelos.join(", ")}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-zinc-400 font-semibold mb-1.5 block">Ano do Veículo</label>
                <select value={anoCode} onChange={e => setAnoCode(e.target.value)} className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white text-sm focus:outline-none focus:border-cyan-500 transition-colors">
                  {ANOS_VIN.map(a => <option key={a.code} value={a.code}>{a.ano}</option>)}
                </select>
                <p className="text-xs text-zinc-500 mt-1.5">Posição 10: <span className="font-mono text-cyan-400">{anoCode}</span></p>
              </div>
              <div>
                <label className="text-xs text-zinc-400 font-semibold mb-1.5 block">Quantidade</label>
                <select value={quantidade} onChange={e => setQuantidade(Number(e.target.value))} className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white text-sm focus:outline-none focus:border-cyan-500 transition-colors">
                  {[1,2,3,5,10].map(n => <option key={n} value={n}>{n} chassi{n > 1 ? "s" : ""}</option>)}
                </select>
              </div>
            </div>
          </div>
          <div className="bg-zinc-800/50 border border-zinc-700/40 rounded-xl p-3">
            <p className="text-xs text-zinc-400 font-semibold mb-2">📐 Estrutura do VIN (17 caracteres)</p>
            <div className="flex flex-wrap gap-1.5 font-mono text-xs">
              <span className="px-2 py-1 bg-cyan-900/50 border border-cyan-500/30 rounded text-cyan-300">{montadora.wmi} = Montadora</span>
              <span className="px-2 py-1 bg-purple-900/50 border border-purple-500/30 rounded text-purple-300">{montadora.vds} = Modelo/Motor</span>
              <span className="px-2 py-1 bg-yellow-900/50 border border-yellow-500/30 rounded text-yellow-300">? = Check digit</span>
              <span className="px-2 py-1 bg-green-900/50 border border-green-500/30 rounded text-green-300">{anoCode} = Ano {anoInfo.ano}</span>
            </div>
          </div>
          <button onClick={gerar} className="w-full py-4 bg-gradient-to-r from-cyan-600 to-blue-600 hover:opacity-90 active:scale-[0.98] text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg text-base"><RefreshCw className="w-5 h-5" />Gerar {quantidade > 1 ? `${quantidade} Chassi` : "Chassi"}</button>
        </div>

        {resultados.length > 0 && (
          <div className="bg-zinc-900/80 border border-zinc-700/50 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">{resultados.length} chassi{resultados.length > 1 ? "s" : ""} gerado{resultados.length > 1 ? "s" : ""}</h3>
              <div className="flex gap-2">
                {resultados.length > 1 && <button onClick={copiarTodos} className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600/20 border border-cyan-500/30 hover:bg-cyan-600/30 text-cyan-300 rounded-lg text-xs font-bold transition-colors"><CheckCheck className="w-3.5 h-3.5" /> Copiar todos</button>}
                <button onClick={() => setResultados([])} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/20 border border-red-500/30 hover:bg-red-600/30 text-red-300 rounded-lg text-xs font-bold transition-colors"><Trash2 className="w-3.5 h-3.5" /> Limpar</button>
              </div>
            </div>
            <div className="space-y-2">
              {resultados.map(({ vin, key }) => (
                <div key={key} className={`flex items-center justify-between px-4 py-3.5 rounded-xl border transition-all ${copiados.has(key) ? "bg-cyan-950/40 border-cyan-500/40" : "bg-zinc-800/60 border-zinc-700/50 hover:border-zinc-600"}`}>
                  <div><p className="font-mono font-bold text-base tracking-widest"><span className="text-cyan-400">{vin.slice(0,3)}</span><span className="text-purple-400">{vin.slice(3,8)}</span><span className="text-yellow-400">{vin[8]}</span><span className="text-green-400">{vin[9]}</span><span className="text-orange-400">{vin[10]}</span><span className="text-zinc-300">{vin.slice(11)}</span></p><p className="text-zinc-500 text-xs mt-0.5">{montadora.nome} — {anoInfo.ano}</p></div>
                  <button onClick={() => copiarUm(key, vin)} className={`p-2.5 rounded-xl transition-colors ${copiados.has(key) ? "text-cyan-400 bg-cyan-500/10" : "text-zinc-400 hover:text-white hover:bg-zinc-700"}`}>{copiados.has(key) ? <CheckCheck className="w-5 h-5" /> : <Copy className="w-5 h-5" />}</button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-zinc-900/90 border border-cyan-500/35 rounded-2xl p-5 space-y-4 shadow-xl shadow-cyan-950/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center"><QrCode className="w-5 h-5 text-cyan-300" /></div>
            <div><h2 className="text-base font-black text-white">GERADOR QR CODE CRLV</h2><p className="text-xs text-zinc-400">Mesmo payload e padrão visual do gerador WalkPro do ZIP</p></div>
          </div>

          <div>
            <label className="text-xs text-zinc-300 font-bold mb-2 block">Cole os dados do veículo</label>
            <textarea value={qrRawText} onChange={e => setQrRawText(e.target.value)} rows={12} placeholder={"Placa: ABC1D23\nChassi: 9BW...\nRenavam: 01234567890\nMarca/Modelo: ...\nNome: ...\nCPF/CNPJ: ...\nLocal: SAO PAULO SP"} className="w-full resize-y px-4 py-3 bg-black/45 border border-zinc-700 rounded-xl text-sm text-white font-mono placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500" />
          </div>

          <button onClick={gerarQr} className="w-full py-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:opacity-90 active:scale-[0.99] text-white font-black rounded-xl flex items-center justify-center gap-2 transition-all"><QrCode className="w-5 h-5" /> GERAR QR CODE</button>

          <div className="grid md:grid-cols-[250px_1fr] gap-4 items-start">
            <div className="bg-white rounded-xl p-2 w-fit mx-auto md:mx-0 border border-zinc-300">
              <canvas ref={qrCanvasRef} width={QR_FINAL_W} height={QR_FINAL_H} className="block w-[230px] h-[229px] bg-white" />
            </div>
            <div className="space-y-3">
              <div className="rounded-xl border border-zinc-700 bg-black/30 p-3">
                <p className="text-[11px] uppercase tracking-wider text-zinc-500 font-bold mb-1">Padrão fixo</p>
                <p className="text-sm text-zinc-200">230×229 px • QR interno 203×203 px • margem 14×12 px • correção L • preto/branco</p>
              </div>
              {qrPayload && <div className="rounded-xl border border-cyan-900/60 bg-cyan-950/20 p-3"><p className="text-[11px] text-cyan-400 font-bold mb-1">PAYLOAD</p><p className="text-xs text-zinc-300 font-mono break-all max-h-28 overflow-auto">{qrPayload}</p></div>}
              <div className="grid grid-cols-2 gap-2">
                <button onClick={baixarQr} className="py-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 font-bold text-sm flex items-center justify-center gap-2"><Download className="w-4 h-4" /> Baixar PNG</button>
                <button onClick={copiarQr} className="py-3 rounded-xl border border-purple-500/30 bg-purple-500/10 text-purple-300 font-bold text-sm flex items-center justify-center gap-2"><Copy className="w-4 h-4" /> Copiar QR</button>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-2xl p-4 space-y-2">
          <p className="text-xs text-zinc-400 font-semibold">ℹ️ Ferramentas independentes</p>
          <p className="text-xs text-zinc-500 leading-relaxed">O gerador de QR não cria CRLV nem PDF. Ele apenas transforma os dados colados no mesmo payload compacto <strong className="text-zinc-300">WDCRLV1</strong> e gera a imagem no padrão fixo do programa Windows.</p>
        </div>

        <div className="pb-6" />
      </div>
    </div>
  );
}
