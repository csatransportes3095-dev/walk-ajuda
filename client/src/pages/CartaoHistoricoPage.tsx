import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, ChevronDown, ChevronUp, CheckCircle, Clock, TrendingUp, AlertTriangle } from "lucide-react";

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
}

const STATUS_CONFIG = {
  paga:     { label: "Paga",     color: "#10b981", bg: "rgba(16,185,129,0.15)",  icon: <CheckCircle size={13} /> },
  aberta:   { label: "Aberta",   color: "#3b82f6", bg: "rgba(59,130,246,0.15)",  icon: <Clock size={13} /> },
  pendente: { label: "Pendente", color: "#f59e0b", bg: "rgba(245,158,11,0.15)",  icon: <AlertTriangle size={13} /> },
  prevista: { label: "Prevista", color: "rgba(255,255,255,0.4)", bg: "rgba(255,255,255,0.06)", icon: <TrendingUp size={13} /> },
  vazia:    { label: "Vazia",    color: "rgba(255,255,255,0.25)", bg: "rgba(255,255,255,0.04)", icon: null },
};

export default function CartaoHistoricoPage() {
  const [, navigate] = useLocation();
  const fullPath = typeof window !== 'undefined' ? window.location.pathname : '';
  const idMatch = fullPath.match(/\/cartoes\/historico\/(\d+)/);
  const cartaoId = parseInt(idMatch?.[1] || "0");
  const [expandido, setExpandido] = useState<string | null>(null);

  const { data: cartao } = trpc.cartoes.cartoes.get.useQuery({ id: cartaoId }, { enabled: !!cartaoId });
  const { data: historico = [], isLoading } = trpc.cartoes.cartoes.historico.useQuery(
    { cartaoId, meses: 12 },
    { enabled: !!cartaoId }
  );

  return (
    <div style={{
      minHeight: "100dvh",
      background: "linear-gradient(180deg, #0a0a0f 0%, #0d0a1a 100%)",
      fontFamily: "'Inter', 'Roboto', sans-serif",
      paddingBottom: 40,
    }}>
      {/* Header */}
      <div style={{
        background: "rgba(255,255,255,0.03)",
        backdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        padding: "16px 20px",
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <button onClick={() => navigate(`/cartoes/cartao/${cartaoId}`)}
          style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(255,255,255,0.08)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <ArrowLeft size={20} color="#fff" />
        </button>
        <div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{(cartao as any)?.nome || "Cartão"}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>Histórico de Faturas</div>
        </div>
      </div>

      <div style={{ padding: "20px 16px 0" }}>
        {isLoading ? (
          [1,2,3,4].map(i => (
            <div key={i} style={{ height: 72, borderRadius: 16, background: "rgba(255,255,255,0.05)", marginBottom: 10, animation: "pulse 1.5s infinite" }} />
          ))
        ) : historico.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 24px", color: "rgba(255,255,255,0.4)" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Nenhum histórico ainda</div>
          </div>
        ) : (
          historico.map((fatura: any) => {
            const cfg = STATUS_CONFIG[fatura.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.vazia;
            const isOpen = expandido === fatura.mesStr;
            const mesNome = MESES[fatura.mes - 1];
            return (
              <div key={fatura.mesStr} style={{ marginBottom: 10 }}>
                {/* Card do mês */}
                <div
                  onClick={() => fatura.status !== 'vazia' && setExpandido(isOpen ? null : fatura.mesStr)}
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: `1px solid ${isOpen ? cfg.color + '40' : 'rgba(255,255,255,0.07)'}`,
                    borderRadius: isOpen ? "16px 16px 0 0" : 16,
                    padding: "14px 16px",
                    display: "flex", alignItems: "center", gap: 12,
                    cursor: fatura.status !== 'vazia' ? "pointer" : "default",
                    transition: "border-color 200ms",
                  }}>
                  {/* Badge status */}
                  <div style={{
                    display: "flex", alignItems: "center", gap: 5,
                    background: cfg.bg, borderRadius: 8, padding: "5px 10px",
                    color: cfg.color, fontSize: 11, fontWeight: 700, flexShrink: 0,
                    minWidth: 80, justifyContent: "center",
                  }}>
                    {cfg.icon}
                    {cfg.label}
                  </div>
                  {/* Info */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{mesNome} {fatura.ano}</div>
                    {fatura.totalPago > 0 && fatura.status === 'paga' && (
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
                        Pago: {fmt(fatura.totalPago)}
                      </div>
                    )}
                  </div>
                  {/* Valor */}
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 17, fontWeight: 800, color: fatura.total > 0 ? "#fff" : "rgba(255,255,255,0.25)" }}>
                      {fatura.total > 0 ? fmt(fatura.total) : "—"}
                    </div>
                    {fatura.gastos?.length > 0 && (
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{fatura.gastos.length} lançamento{fatura.gastos.length !== 1 ? 's' : ''}</div>
                    )}
                  </div>
                  {fatura.status !== 'vazia' && (
                    <div style={{ color: "rgba(255,255,255,0.3)", flexShrink: 0 }}>
                      {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                  )}
                </div>

                {/* Detalhes expandidos */}
                {isOpen && (
                  <div style={{
                    background: "rgba(255,255,255,0.03)",
                    border: `1px solid ${cfg.color}30`,
                    borderTop: "none",
                    borderRadius: "0 0 16px 16px",
                    padding: "12px 16px",
                  }}>
                    {fatura.gastos?.length > 0 && (
                      <>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Lançamentos</div>
                        {fatura.gastos.map((g: any) => (
                          <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {g.parcelDescricao || g.descricao}
                              </div>
                              {g.numeroParcela && (
                                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>Parcela {g.numeroParcela}/{g.totalParcelas}</div>
                              )}
                              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{new Date(g.data).toLocaleDateString("pt-BR")}{g.paga === 1 ? " • Pago" : ""}</div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                              {g.paga === 1 && <CheckCircle size={12} color="#10b981" />}
                              <span style={{ fontSize: 14, fontWeight: 700, color: g.paga === 1 ? "#10b981" : "#ef4444" }}>{fmt(g.valor)}</span>
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                    {fatura.pagamentos?.length > 0 && (
                      <>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.8, marginTop: 12, marginBottom: 8 }}>Pagamentos</div>
                        {fatura.pagamentos.map((p: any) => (
                          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0" }}>
                            <CheckCircle size={16} color="#10b981" />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: "#10b981" }}>Pagamento realizado</div>
                              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{new Date(p.dataPagamento).toLocaleDateString("pt-BR")}</div>
                            </div>
                            <span style={{ fontSize: 15, fontWeight: 800, color: "#10b981" }}>{fmt(p.valorPago)}</span>
                          </div>
                        ))}
                      </>
                    )}
                    {/* Resumo */}
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Total da fatura</span>
                      <span style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>{fmt(fatura.total)}</span>
                    </div>
                    {fatura.totalPago > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Total pago</span>
                        <span style={{ fontSize: 14, fontWeight: 800, color: "#10b981" }}>{fmt(fatura.totalPago)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}`}</style>
    </div>
  );
}
