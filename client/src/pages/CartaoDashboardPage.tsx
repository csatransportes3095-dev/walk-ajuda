import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Plus, LogOut, AlertTriangle, ChevronRight, TrendingUp, CheckCircle, Repeat, Wallet, ShoppingCart } from "lucide-react";

import { BandeiraLogoPequena } from "@/components/BandeiraLogo";

const GRADIENTS: Record<string, string> = {
  purple: "linear-gradient(135deg, #5b21b6 0%, #7c3aed 45%, #a855f7 100%)",
  blue:   "linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 45%, #3b82f6 100%)",
  red:    "linear-gradient(135deg, #991b1b 0%, #dc2626 45%, #f43f5e 100%)",
  green:  "linear-gradient(135deg, #064e3b 0%, #15803d 45%, #10b981 100%)",
  orange: "linear-gradient(135deg, #7c2d12 0%, #c2410c 45%, #f97316 100%)",
  pink:   "linear-gradient(135deg, #831843 0%, #be185d 45%, #ec4899 100%)",
  teal:   "linear-gradient(135deg, #134e4a 0%, #0f766e 45%, #06b6d4 100%)",
  indigo: "linear-gradient(135deg, #1e1b4b 0%, #3730a3 45%, #6366f1 100%)",
};

const SHADOWS: Record<string, string> = {
  purple: "0 12px 40px rgba(124,58,237,0.5)",
  blue:   "0 12px 40px rgba(29,78,216,0.5)",
  red:    "0 12px 40px rgba(220,38,38,0.5)",
  green:  "0 12px 40px rgba(21,128,61,0.5)",
  orange: "0 12px 40px rgba(194,65,12,0.5)",
  pink:   "0 12px 40px rgba(190,24,93,0.5)",
  teal:   "0 12px 40px rgba(15,118,110,0.5)",
  indigo: "0 12px 40px rgba(55,48,163,0.5)",
};

const CORES = [
  { id: "purple", bg: "linear-gradient(135deg,#7c3aed,#a855f7)" },
  { id: "blue",   bg: "linear-gradient(135deg,#1d4ed8,#3b82f6)" },
  { id: "red",    bg: "linear-gradient(135deg,#dc2626,#f43f5e)" },
  { id: "green",  bg: "linear-gradient(135deg,#15803d,#10b981)" },
  { id: "orange", bg: "linear-gradient(135deg,#c2410c,#f97316)" },
  { id: "pink",   bg: "linear-gradient(135deg,#be185d,#ec4899)" },
  { id: "teal",   bg: "linear-gradient(135deg,#0f766e,#06b6d4)" },
  { id: "indigo", bg: "linear-gradient(135deg,#3730a3,#6366f1)" },
];

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
}

function diasParaVencer(dia: number) {
  const hoje = new Date();
  const diaHoje = hoje.getDate();
  let venc = new Date(hoje.getFullYear(), hoje.getMonth(), dia);
  if (dia < diaHoje) venc = new Date(hoje.getFullYear(), hoje.getMonth() + 1, dia);
  return Math.ceil((venc.getTime() - hoje.getTime()) / 86400000);
}

export default function DashboardPage() {
  const [, navigate] = useLocation();
  const [showAdd, setShowAdd] = useState(false);
  const utils = trpc.useUtils();

  const { data: user } = trpc.cartoes.auth.me.useQuery(undefined, { retry: false });
  const { data: cartoes = [], isLoading } = trpc.cartoes.cartoes.list.useQuery(undefined, { refetchOnWindowFocus: true });
  const logoutMutation = trpc.cartoes.auth.logout.useMutation({
    onSuccess: () => utils.cartoes.auth.me.invalidate(),
  });

  const nome = ((user as any)?.name || "Usuário").split(" ")[0];
  const alertas = cartoes.filter(c => Number((c as any).faturaAtual ?? (c as any).faturaDoMes ?? 0) > 0 && diasParaVencer(c.vencimentoDia) <= 3);
  const totalFatura = cartoes.reduce((s, c) => s + Number((c as any).faturaAtual ?? (c as any).faturaDoMes ?? 0), 0);

  return (
    <div style={{
      minHeight: "100dvh",
      background: "linear-gradient(180deg, #0a0a0f 0%, #0d0a1a 100%)",
      fontFamily: "'Inter', 'Roboto', sans-serif",
      paddingBottom: 100,
    }}>
      {/* Header */}
      <div style={{
        background: "rgba(255,255,255,0.03)",
        backdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        padding: "16px 20px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", fontWeight: 500 }}>Olá, {nome} 👋</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", letterSpacing: -0.5 }}>Meus Cartões</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {alertas.length > 0 && (
            <div style={{ position: "relative" }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <AlertTriangle size={18} color="#ef4444" />
              </div>
              <div style={{ position: "absolute", top: -4, right: -4, width: 18, height: 18, borderRadius: 9, background: "#ef4444", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#fff", fontWeight: 800 }}>{alertas.length}</div>
            </div>
          )}
          <button onClick={() => { if (confirm("Sair da conta?")) logoutMutation.mutate(); }}
            style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <LogOut size={17} color="rgba(255,255,255,0.5)" />
          </button>
        </div>
      </div>

      {/* Resumo total */}
      {cartoes.length > 0 && (
        <div style={{ padding: "20px 20px 0" }}>
          <div style={{
            background: "linear-gradient(135deg, rgba(124,58,237,0.2) 0%, rgba(59,130,246,0.15) 100%)",
            border: "1px solid rgba(124,58,237,0.25)",
            borderRadius: 20,
            padding: "18px 20px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", fontWeight: 500, marginBottom: 4 }}>Total em faturas abertas</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#fff", letterSpacing: -1 }}>{fmt(totalFatura)}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{cartoes.length} cartão{cartoes.length !== 1 ? "ões" : ""} cadastrado{cartoes.length !== 1 ? "s" : ""}</div>
            </div>
            <div style={{ width: 52, height: 52, borderRadius: 16, background: "linear-gradient(135deg, #7c3aed, #3b82f6)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 24px rgba(124,58,237,0.4)" }}>
              <Wallet size={24} color="#fff" />
            </div>
          </div>
        </div>
      )}

      {/* Alertas */}
      {alertas.length > 0 && (
        <div style={{ padding: "16px 20px 0" }}>
          {alertas.map(c => {
            const dias = diasParaVencer(c.vencimentoDia);
            return (
              <div key={c.id} onClick={() => navigate(`/cartoes/cartao/${c.id}`)}
                style={{ display: "flex", alignItems: "center", gap: 12, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 16, padding: "12px 14px", marginBottom: 8, cursor: "pointer" }}>
                <div style={{ width: 38, height: 38, borderRadius: 12, background: "rgba(239,68,68,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <AlertTriangle size={18} color="#ef4444" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#ef4444", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nome}</div>
                  <div style={{ fontSize: 12, color: "rgba(239,68,68,0.7)" }}>{dias <= 0 ? "Fatura vencida!" : dias === 1 ? "Vence amanhã!" : `Vence em ${dias} dias`}</div>
                </div>
                <div style={{ fontSize: 15, fontWeight: 800, color: "#ef4444", flexShrink: 0 }}>{fmt(Number((c as any).faturaAtual ?? (c as any).faturaDoMes ?? 0))}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Lista de cartões */}
      <div style={{ padding: "20px 20px 0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 0.8 }}>
            {cartoes.length > 0 ? "Seus cartões" : "Nenhum cartão"}
          </span>
          {cartoes.length > 0 && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>Toque para gerenciar</span>}
        </div>

        {isLoading ? (
          [1, 2].map(i => (
            <div key={i} style={{ height: 180, borderRadius: 24, background: "rgba(255,255,255,0.05)", marginBottom: 16, animation: "pulse 1.5s infinite" }} />
          ))
        ) : cartoes.length === 0 ? (
          <div style={{ textAlign: "center", padding: "56px 24px", background: "rgba(255,255,255,0.03)", borderRadius: 24, border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>💳</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#fff", marginBottom: 8 }}>Nenhum cartão ainda</div>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", marginBottom: 28, lineHeight: 1.6 }}>Adicione seu primeiro cartão para começar a controlar seus gastos</div>
            <button onClick={() => setShowAdd(true)} style={{ height: 48, padding: "0 28px", borderRadius: 14, border: "none", background: "linear-gradient(135deg, #7c3aed, #3b82f6)", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 8px 24px rgba(124,58,237,0.4)" }}>
              + Adicionar Cartão
            </button>
          </div>
        ) : (
          cartoes.map((c) => {
            const grad = GRADIENTS[c.corCartao] || GRADIENTS.purple;
            const shadow = SHADOWS[c.corCartao] || SHADOWS.purple;
            const faturaDoMes = Number((c as any).faturaAtual ?? (c as any).faturaDoMes ?? (c as any).valorApagarCicloAtual ?? 0);
            const mesSeguinte = Number((c as any).proximaFatura ?? (c as any).parcelasMesSeguinte ?? 0);
            const limite = Number(c.limiteTotal ?? 0);
            const disponivel = Number((c as any).limiteDisponivel ?? 0);
            const pct = Number((c as any).pctLimite ?? (c as any).percentualUsado ?? 0);
            const dias = diasParaVencer(c.vencimentoDia);

            return (
              <div key={c.id} onClick={() => navigate(`/cartoes/cartao/${c.id}`)}
                style={{ background: grad, borderRadius: 24, padding: "22px 20px", marginBottom: 16, boxShadow: shadow, cursor: "pointer", position: "relative", overflow: "hidden", userSelect: "none", WebkitTapHighlightColor: "transparent" }}
                onTouchStart={e => (e.currentTarget.style.transform = "scale(0.98)")}
                onTouchEnd={e => (e.currentTarget.style.transform = "scale(1)")}>

                {/* Decoração glassmorphism */}
                <div style={{ position: "absolute", top: -40, right: -40, width: 140, height: 140, borderRadius: 70, background: "rgba(255,255,255,0.12)" }} />
                <div style={{ position: "absolute", bottom: -30, left: -10, width: 100, height: 100, borderRadius: 50, background: "rgba(255,255,255,0.07)" }} />
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: "linear-gradient(135deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.02) 50%, transparent 100%)", borderRadius: 24 }} />


                <div style={{ position: "relative" }}>
                  {/* Cabeçalho do cartão */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                    <div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 4 }}>Cartão de Crédito</div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", letterSpacing: -0.5 }}>{c.nome}</div>
                    {((c as any).banco || (c as any).bandeira) && (
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
                        {(c as any).banco}{(c as any).banco && (c as any).bandeira ? ' · ' : ''}{(c as any).bandeira ? (c as any).bandeira.charAt(0).toUpperCase() + (c as any).bandeira.slice(1) : ''}
                      </div>
                    )}
                    </div>
                    <div style={{
                      padding: "6px 12px", borderRadius: 50, fontSize: 11, fontWeight: 700,
                      background: faturaDoMes > 0 && dias <= 0 ? "rgba(239,68,68,0.9)" : faturaDoMes > 0 && dias <= 3 ? "rgba(245,158,11,0.9)" : "rgba(255,255,255,0.15)",
                      color: "#fff", backdropFilter: "blur(8px)",
                    }}>
                      {faturaDoMes > 0 && dias <= 0 ? "⚠ VENCIDO" : faturaDoMes > 0 && dias <= 3 ? `⚠ ${dias}d` : (c as any).fechamentoDia ? `Fecha ${(c as any).fechamentoDia} · Vence ${c.vencimentoDia}` : `Dia ${c.vencimentoDia}`}
                    </div>
                  </div>



                  {/* 4 métricas */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
                    {[
                      { label: "Fatura do Mês", value: fmt(faturaDoMes), icon: <TrendingUp size={10} />, highlight: faturaDoMes > 0 },
                      { label: "Mês Seguinte", value: fmt(mesSeguinte), icon: <Repeat size={10} />, highlight: false },
                      { label: "Limite Total", value: fmt(limite), icon: null, highlight: false },
                      { label: "Disponível", value: fmt(disponivel), icon: <CheckCircle size={10} />, highlight: disponivel < limite * 0.2 },
                    ].map((item, i) => (
                      <div key={i} style={{ background: "rgba(0,0,0,0.25)", backdropFilter: "blur(8px)", borderRadius: 12, padding: "8px 10px" }}>
                        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 3, display: "flex", alignItems: "center", gap: 4 }}>
                          {item.icon}{item.label}
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: item.highlight ? "#fca5a5" : "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Barra de progresso + bandeira */}
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{pct.toFixed(0)}% do limite usado</span>
                      <ChevronRight size={14} color="rgba(255,255,255,0.4)" />
                    </div>
                    <div style={{ height: 5, borderRadius: 3, background: "rgba(255,255,255,0.15)", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, borderRadius: 3, background: pct >= 90 ? "#ef4444" : pct >= 70 ? "#f59e0b" : "rgba(255,255,255,0.8)", transition: "width 600ms ease" }} />
                    </div>
                    {/* Logo da bandeira abaixo da barra */}
                    {(c as any).bandeira && (
                      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                        <BandeiraLogoPequena bandeira={(c as any).bandeira} style={{ position: "static", display: "inline-flex" }} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Bottom Nav */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "rgba(10,10,15,0.97)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderTop: "1px solid rgba(255,255,255,0.06)", paddingBottom: "env(safe-area-inset-bottom, 0px)", zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px" }}>
          {/* Cartões */}
          <div style={{ flex: 1, background: "linear-gradient(135deg, #7c3aed, #3b82f6)", borderRadius: 14, padding: "10px 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, boxShadow: "0 4px 16px rgba(124,58,237,0.4)", minWidth: 0 }}>
            <span style={{ fontSize: 20 }}>💳</span>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#fff", textAlign: "center" }}>Cartões</div>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.6)", textAlign: "center" }}>{cartoes.length} cadastr.</div>
          </div>
          {/* Despesas */}
          <div onClick={() => navigate("/cartoes/despesas")}
            style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: "10px 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer", WebkitTapHighlightColor: "transparent", minWidth: 0 }}
            onTouchStart={e => (e.currentTarget.style.background = "rgba(255,255,255,0.1)")}
            onTouchEnd={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}>
            <span style={{ fontSize: 20 }}>📊</span>
            <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.8)", textAlign: "center" }}>Despesas</div>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", textAlign: "center" }}>Controle fixo</div>
          </div>
          {/* Mercado */}
          <div onClick={() => navigate("/cartoes/mercado")}
            style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: "10px 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer", WebkitTapHighlightColor: "transparent", minWidth: 0 }}
            onTouchStart={e => (e.currentTarget.style.background = "rgba(255,255,255,0.1)")}
            onTouchEnd={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}>
            <ShoppingCart size={20} color="#fbbf24" />
            <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.8)", textAlign: "center" }}>Mercado</div>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", textAlign: "center" }}>Lista</div>
          </div>
          {/* Botão + */}
          <button onClick={() => setShowAdd(true)}
            style={{ width: 48, height: 68, borderRadius: 14, background: "linear-gradient(135deg, #7c3aed, #3b82f6)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 16px rgba(124,58,237,0.5)", flexShrink: 0 }}>
            <Plus size={22} color="#fff" />
          </button>
        </div>
      </div>

      {showAdd && <CartaoBottomSheet onClose={() => setShowAdd(false)} onSuccess={() => { setShowAdd(false); utils.cartoes.cartoes.list.invalidate(); toast.success("Cartão adicionado!"); }} />}
    </div>
  );
}

function CartaoBottomSheet({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [nome, setNome] = useState("");
  const [dia, setDia] = useState("");
  const [fechamento, setFechamento] = useState("");
  const [limite, setLimite] = useState("");
  const [cor, setCor] = useState("purple");
  const [banco, setBanco] = useState("");
  const [bandeira, setBandeira] = useState("");
  const createMutation = trpc.cartoes.cartoes.create.useMutation({ onSuccess, onError: e => toast.error(e.message) });

  const submit = () => {
    const d = parseInt(dia);
    if (!nome.trim()) return toast.error("Nome obrigatório");
    if (!d || d < 1 || d > 31) return toast.error("Dia de vencimento inválido (1-31)");
    const l = parseFloat(limite.replace(",", "."));
    if (!l || l <= 0) return toast.error("Limite inválido");
    const f = fechamento ? parseInt(fechamento) : undefined;
    if (f && (f < 1 || f > 31)) return toast.error("Dia de fechamento inválido (1-31)");
    createMutation.mutate({ nome: nome.trim(), vencimentoDia: d, fechamentoDia: f ?? null, limiteTotal: l, corCartao: cor, banco: banco || null, bandeira: bandeira || null });
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "flex-end" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }} onClick={onClose} />
      <div style={{ position: "relative", width: "100%", background: "#0f0f1a", borderRadius: "24px 24px 0 0", border: "1px solid rgba(255,255,255,0.08)", borderBottom: "none", maxHeight: "90dvh", overflowY: "auto", animation: "slideUp 300ms ease" }}>
        <style>{`@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.2)", margin: "14px auto 0" }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px 8px" }}>
          <span style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>Novo Cartão</span>
          <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: 12, background: "rgba(255,255,255,0.08)", border: "none", cursor: "pointer", fontSize: 16, color: "rgba(255,255,255,0.6)", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>
        <div style={{ padding: "8px 20px 32px", display: "flex", flexDirection: "column", gap: 16 }}>
          <DField label="NOME DO CARTÃO">
            <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Nubank, Bradesco Gold" style={dInput} />
          </DField>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <DField label="DIA VENCIMENTO">
              <input value={dia} onChange={e => setDia(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="Ex: 15" inputMode="numeric" style={dInput} />
            </DField>
            <DField label="DIA FECHAMENTO">
              <input value={fechamento} onChange={e => setFechamento(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="Ex: 10" inputMode="numeric" style={dInput} />
            </DField>
            <DField label="LIMITE (R$)">
              <input value={limite} onChange={e => setLimite(e.target.value.replace(/[^\d,.]/g, ""))} placeholder="Ex: 5000" inputMode="decimal" style={dInput} />
            </DField>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <DField label="BANCO">
              <input value={banco} onChange={e => setBanco(e.target.value)} placeholder="Ex: Nubank, Itaú" style={dInput} />
            </DField>
            <DField label="BANDEIRA">
              <select value={bandeira} onChange={e => setBandeira(e.target.value)} style={{ ...dInput, appearance: "none" as any }}>
                <option value="">Selecionar</option>
                <option value="visa">Visa</option>
                <option value="mastercard">Mastercard</option>
                <option value="elo">Elo</option>
                <option value="amex">Amex</option>
                <option value="hipercard">Hipercard</option>
              </select>
            </DField>
          </div>
          <DField label="COR DO CARTÃO">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 8 }}>
              {CORES.map(c => (
                <button key={c.id} onClick={() => setCor(c.id)} style={{ height: 36, borderRadius: 10, background: c.bg, border: cor === c.id ? "3px solid #fff" : "3px solid transparent", cursor: "pointer", transition: "transform 150ms", boxShadow: cor === c.id ? "0 0 12px rgba(255,255,255,0.3)" : "none" }} />
              ))}
            </div>
          </DField>
          {/* Preview */}
          <div style={{ background: GRADIENTS[cor] || GRADIENTS.purple, borderRadius: 20, padding: "20px", position: "relative", overflow: "hidden", boxShadow: SHADOWS[cor] || SHADOWS.purple }}>
            <div style={{ position: "absolute", top: -20, right: -20, width: 80, height: 80, borderRadius: 40, background: "rgba(255,255,255,0.12)" }} />
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: "linear-gradient(135deg, rgba(255,255,255,0.08) 0%, transparent 60%)", borderRadius: 20 }} />
            <div style={{ position: "relative" }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 6 }}>Cartão de Crédito</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#fff", marginBottom: 12 }}>{nome || "Nome do Cartão"}</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <div style={{ width: 28, height: 20, borderRadius: 4, background: "linear-gradient(135deg, rgba(255,215,0,0.8), rgba(255,165,0,0.6))" }} />
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", letterSpacing: 2 }}>•••• ••••</div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 0.8 }}>Limite</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>
                    {limite ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(parseFloat(limite.replace(",", ".")) || 0) : "R$ 0,00"}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 0.8 }}>Vence dia</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>{dia || "--"}</div>
                </div>
              </div>
            </div>
          </div>
          <button onClick={submit} disabled={createMutation.isPending}
            style={{ height: 52, borderRadius: 14, border: "none", background: createMutation.isPending ? "rgba(255,255,255,0.1)" : "linear-gradient(135deg, #7c3aed, #3b82f6)", color: createMutation.isPending ? "rgba(255,255,255,0.4)" : "#fff", fontSize: 16, fontWeight: 700, cursor: createMutation.isPending ? "not-allowed" : "pointer", fontFamily: "inherit", boxShadow: createMutation.isPending ? "none" : "0 8px 24px rgba(124,58,237,0.4)" }}>
            {createMutation.isPending ? "Salvando..." : "Adicionar Cartão"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 8, letterSpacing: 1, textTransform: "uppercase" }}>{label}</label>
      {children}
    </div>
  );
}

const dInput: React.CSSProperties = {
  width: "100%", height: 50, padding: "0 14px", borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.06)",
  fontSize: 15, color: "#fff", outline: "none",
  fontFamily: "inherit", boxSizing: "border-box",
  transition: "border-color 200ms",
};
