import { useState, useRef } from "react";
import AdminHeader from "@/components/AdminHeader";
import { MapPin, Search, Copy, CheckCircle, X, Clock } from "lucide-react";
import { toast } from "sonner";

interface CepResult {
  cep: string;
  logradouro: string;
  complemento: string;
  bairro: string;
  localidade: string;
  uf: string;
  ibge: string;
  ddd: string;
  erro?: boolean;
}

interface HistoryEntry {
  cep: string;
  result: CepResult;
  at: number;
}

export default function AdminCep() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CepResult | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const formatCep = (v: string) => {
    const digits = v.replace(/\D/g, "").slice(0, 8);
    if (digits.length > 5) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
    return digits;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(formatCep(e.target.value));
    setNotFound(false);
  };

  const search = async (cepRaw?: string) => {
    const digits = (cepRaw ?? input).replace(/\D/g, "");
    if (digits.length !== 8) {
      toast.error("Digite um CEP com 8 dígitos");
      return;
    }
    setLoading(true);
    setResult(null);
    setNotFound(false);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data: CepResult = await res.json();
      if (data.erro) {
        setNotFound(true);
      } else {
        setResult(data);
        setHistory(prev => {
          const filtered = prev.filter(h => h.cep !== digits);
          return [{ cep: digits, result: data, at: Date.now() }, ...filtered].slice(0, 10);
        });
      }
    } catch {
      toast.error("Erro ao consultar CEP. Verifique sua conexão.");
    } finally {
      setLoading(false);
    }
  };

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label);
      toast.success(`${label} copiado!`);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const copyAll = () => {
    if (!result) return;
    const parts = [
      result.logradouro,
      result.complemento,
      result.bairro,
      `${result.localidade} - ${result.uf}`,
      `CEP: ${result.cep}`,
    ].filter(Boolean).join(", ");
    copyText(parts, "Endereço completo");
  };

  const clear = () => {
    setInput("");
    setResult(null);
    setNotFound(false);
    inputRef.current?.focus();
  };

  const isSP = result?.uf === "SP";

  return (
    <div className="min-h-screen bg-background">
      <AdminHeader
        title="Consulta de CEP"
        icon={<MapPin className="w-5 h-5" />}
        backTo="/admin/codes"
      />

      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
        {/* Campo de busca */}
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            🔍 Buscar CEP
          </p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                ref={inputRef}
                type="text"
                inputMode="numeric"
                placeholder="00000-000"
                value={input}
                onChange={handleChange}
                onKeyDown={e => e.key === "Enter" && search()}
                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-lg font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/50 pr-10"
                maxLength={9}
              />
              {input && (
                <button
                  onClick={clear}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <button
              onClick={() => search()}
              disabled={loading}
              className="px-5 py-3 bg-primary hover:bg-primary/90 active:scale-95 text-primary-foreground font-bold rounded-xl transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              Buscar
            </button>
          </div>
        </div>

        {/* Não encontrado */}
        {notFound && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-5 text-center">
            <p className="text-red-400 font-bold text-base">CEP não encontrado</p>
            <p className="text-red-400/60 text-sm mt-1">Verifique se o CEP está correto e tente novamente.</p>
          </div>
        )}

        {/* Resultado */}
        {result && (
          <div className={`border-2 rounded-2xl overflow-hidden ${isSP ? "border-blue-500/50 shadow-[0_0_20px_rgba(59,130,246,0.2)]" : "border-border"}`}>
            {/* Header do resultado */}
            <div className={`px-5 py-3 flex items-center justify-between ${isSP ? "bg-blue-500/10 border-b border-blue-500/30" : "bg-muted/30 border-b border-border"}`}>
              <div className="flex items-center gap-2">
                <MapPin className={`w-4 h-4 ${isSP ? "text-blue-400" : "text-muted-foreground"}`} />
                <span className={`text-sm font-bold ${isSP ? "text-blue-300" : "text-foreground"}`}>
                  {result.localidade} — {result.uf}
                  {isSP && <span className="ml-2 text-[11px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full">São Paulo</span>}
                </span>
              </div>
              <button
                onClick={copyAll}
                className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground bg-muted/40 hover:bg-muted/70 px-3 py-1.5 rounded-lg transition-all"
              >
                {copied === "Endereço completo" ? <CheckCircle className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                Copiar tudo
              </button>
            </div>

            {/* Campos */}
            <div className="p-5 space-y-3">
              {[
                { label: "CEP", value: result.cep, key: "cep" },
                { label: "Logradouro", value: result.logradouro, key: "logradouro" },
                result.complemento ? { label: "Complemento", value: result.complemento, key: "complemento" } : null,
                { label: "Bairro", value: result.bairro, key: "bairro" },
                { label: "Cidade", value: result.localidade, key: "cidade" },
                { label: "Estado", value: result.uf, key: "uf" },
                { label: "DDD", value: result.ddd, key: "ddd" },
                { label: "IBGE", value: result.ibge, key: "ibge" },
              ].filter(Boolean).map((field: any) => (
                <div key={field.key} className="flex items-center justify-between gap-3 py-2 border-b border-border/40 last:border-0">
                  <div className="min-w-0">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">{field.label}</p>
                    <p className="text-sm font-medium text-foreground mt-0.5">{field.value || "—"}</p>
                  </div>
                  {field.value && (
                    <button
                      onClick={() => copyText(field.value, field.label)}
                      className="shrink-0 p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-all"
                      title={`Copiar ${field.label}`}
                    >
                      {copied === field.label ? <CheckCircle className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Histórico */}
        {history.length > 0 && (
          <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Histórico recente</p>
            </div>
            <div className="space-y-1">
              {history.map(h => (
                <button
                  key={h.cep}
                  onClick={() => {
                    setInput(formatCep(h.cep));
                    search(h.cep);
                  }}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl hover:bg-muted/40 transition-colors text-left group"
                >
                  <div className="min-w-0">
                    <span className="text-sm font-mono font-bold text-foreground">{formatCep(h.cep)}</span>
                    <span className="text-xs text-muted-foreground ml-2 truncate">
                      {h.result.logradouro ? `${h.result.logradouro}, ` : ""}{h.result.bairro} — {h.result.localidade}/{h.result.uf}
                    </span>
                  </div>
                  <Search className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0 transition-colors" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
