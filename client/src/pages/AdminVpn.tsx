import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { ShieldX, RefreshCw, Globe, Wifi, Clock, Phone, User, ChevronLeft } from "lucide-react";
import { Link } from "wouter";

function timeAgo(date: Date | string): string {
  const d = new Date(date);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return `${diff}s atrás`;
  if (diff < 3600) return `${Math.floor(diff / 60)}min atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
  return `${Math.floor(diff / 86400)}d atrás`;
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  proxy: { label: "Proxy", color: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  vpn: { label: "VPN", color: "bg-red-500/20 text-red-400 border-red-500/30" },
  tor: { label: "TOR", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  hosting: { label: "Hosting", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  unknown: { label: "Desconhecido", color: "bg-gray-500/20 text-gray-400 border-gray-500/30" },
};

export default function AdminVpn() {
  const [search, setSearch] = useState("");
  const { data: attempts = [], isLoading, refetch } = trpc.vpn.attempts.useQuery({ limit: 500 });

  const filtered = attempts.filter((a) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      a.ip?.toLowerCase().includes(q) ||
      a.isp?.toLowerCase().includes(q) ||
      a.org?.toLowerCase().includes(q) ||
      a.country?.toLowerCase().includes(q) ||
      a.customerPhone?.toLowerCase().includes(q) ||
      a.customerName?.toLowerCase().includes(q)
    );
  });

  // Agrupar por IP para mostrar quantas tentativas cada IP fez
  const ipCounts = attempts.reduce<Record<string, number>>((acc, a) => {
    acc[a.ip] = (acc[a.ip] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-[#0a0a1a] text-white">
      {/* Header */}
      <div className="bg-black/40 backdrop-blur-md border-b border-red-500/20 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/codes">
              <button className="p-2 rounded-xl hover:bg-white/10 transition-colors">
                <ChevronLeft className="w-5 h-5 text-white/60" />
              </button>
            </Link>
            <div className="flex items-center gap-2">
              <ShieldX className="w-5 h-5 text-red-400" />
              <h1 className="text-lg font-black text-white">Tentativas com VPN</h1>
            </div>
          </div>
          <button
            onClick={() => refetch()}
            className="p-2 rounded-xl hover:bg-white/10 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 text-white/60 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 text-center">
            <p className="text-2xl font-black text-red-400">{attempts.length}</p>
            <p className="text-xs text-white/50 mt-1">Total tentativas</p>
          </div>
          <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-4 text-center">
            <p className="text-2xl font-black text-orange-400">{Object.keys(ipCounts).length}</p>
            <p className="text-xs text-white/50 mt-1">IPs únicos</p>
          </div>
          <div className="bg-purple-500/10 border border-purple-500/20 rounded-2xl p-4 text-center">
            <p className="text-2xl font-black text-purple-400">
              {attempts.filter(a => a.customerPhone).length}
            </p>
            <p className="text-xs text-white/50 mt-1">Com telefone</p>
          </div>
        </div>

        {/* Busca */}
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por IP, ISP, país, telefone..."
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-red-500/50 text-sm"
          />
        </div>

        {/* Lista */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <ShieldX className="w-12 h-12 text-white/20 mx-auto mb-3" />
            <p className="text-white/40 text-sm">
              {search ? "Nenhum resultado encontrado" : "Nenhuma tentativa com VPN registrada"}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((attempt) => {
              const typeInfo = TYPE_LABELS[attempt.detectionType || "unknown"] || TYPE_LABELS.unknown;
              const count = ipCounts[attempt.ip] || 1;
              return (
                <div
                  key={attempt.id}
                  className="bg-black/40 border border-red-500/15 rounded-2xl p-4 space-y-3"
                >
                  {/* Linha 1: IP + tipo + contagem */}
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-red-400 flex-shrink-0" />
                      <span className="font-mono text-white font-bold text-sm">{attempt.ip}</span>
                      {count > 1 && (
                        <span className="bg-red-500/20 text-red-400 border border-red-500/30 text-xs px-2 py-0.5 rounded-full font-bold">
                          {count}x
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-bold ${typeInfo.color}`}>
                        {typeInfo.label}
                      </span>
                      {attempt.country && (
                        <span className="text-xs text-white/40 bg-white/5 px-2 py-0.5 rounded-full">
                          {attempt.country}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Linha 2: ISP / Org */}
                  {(attempt.isp || attempt.org) && (
                    <div className="flex items-center gap-2">
                      <Wifi className="w-3.5 h-3.5 text-white/30 flex-shrink-0" />
                      <span className="text-xs text-white/50">
                        {attempt.isp || attempt.org}
                        {attempt.isp && attempt.org && attempt.isp !== attempt.org && ` · ${attempt.org}`}
                      </span>
                    </div>
                  )}

                  {/* Linha 3: Cliente (se identificado) */}
                  {(attempt.customerName || attempt.customerPhone) && (
                    <div className="flex items-center gap-3 bg-white/5 rounded-xl px-3 py-2">
                      {attempt.customerName && (
                        <div className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-white/40" />
                          <span className="text-xs text-white/70">{attempt.customerName}</span>
                        </div>
                      )}
                      {attempt.customerPhone && (
                        <div className="flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-white/40" />
                          <span className="text-xs text-white/70">{attempt.customerPhone}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Linha 4: Data */}
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-white/30" />
                    <span className="text-xs text-white/40">{formatDate(attempt.createdAt)} · {timeAgo(attempt.createdAt)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
