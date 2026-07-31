import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { CreditCard, Plus, LogOut, AlertTriangle, Bell, ChevronRight, TrendingUp, CheckCircle, Repeat, Receipt } from "lucide-react";

const GRADIENTS: Record<string, string> = {
  purple: "linear-gradient(135deg, #6750A4 0%, #9C27B0 100%)",
  blue:   "linear-gradient(135deg, #1565C0 0%, #0288D1 100%)",
  red:    "linear-gradient(135deg, #C62828 0%, #E91E63 100%)",
  green:  "linear-gradient(135deg, #2E7D32 0%, #00897B 100%)",
  orange: "linear-gradient(135deg, #E65100 0%, #F9A825 100%)",
  pink:   "linear-gradient(135deg, #AD1457 0%, #E91E63 100%)",
  teal:   "linear-gradient(135deg, #00695C 0%, #0097A7 100%)",
  indigo: "linear-gradient(135deg, #283593 0%, #5C6BC0 100%)",
};

const SHADOWS: Record<string, string> = {
  purple: "0 8px 24px rgba(103,80,164,0.4)",
  blue:   "0 8px 24px rgba(21,101,192,0.4)",
  red:    "0 8px 24px rgba(198,40,40,0.4)",
  green:  "0 8px 24px rgba(46,125,50,0.4)",
  orange: "0 8px 24px rgba(230,81,0,0.4)",
  pink:   "0 8px 24px rgba(173,20,87,0.4)",
  teal:   "0 8px 24px rgba(0,105,92,0.4)",
  indigo: "0 8px 24px rgba(40,53,147,0.4)",
};

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
    onSuccess: () => utils.auth.me.invalidate(),
  });

  const nome = ((user as any)?.name || "Usuário").split(" ")[0];
  // Só alerta se tiver valor a pagar no ciclo atual
  const alertas = cartoes.filter(c => Number((c as any).faturaDoMes ?? (c as any).valorApagarCicloAtual ?? c.faturaAtual ?? 0) > 0 && diasParaVencer(c.vencimentoDia) <= 3);

  return (
    <div style={{ minHeight: "100dvh", background: "#F4EFF4", fontFamily: "'Roboto', sans-serif" }}>

      {/* ── App Bar ── */}
      <div style={{ background: "#6750A4", paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <div style={{ height: 64, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px" }}>
          <div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", fontWeight: 500 }}>Olá, {nome} 👋</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>Meus Cartões</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {alertas.length > 0 && (
              <div style={{ position: "relative" }}>
                <div style={{ width: 40, height: 40, borderRadius: 20, background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Bell size={20} color="#fff" />
                </div>
                <div style={{ position: "absolute", top: 6, right: 6, width: 12, height: 12, borderRadius: 6, background: "#F44336", border: "2px solid #6750A4", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: "#fff", fontWeight: 700 }}>
                  {alertas.length}
                </div>
              </div>
            )}
            <button onClick={() => { if (confirm("Sair da conta?")) logoutMutation.mutate(); }}
              style={{ width: 40, height: 40, borderRadius: 20, background: "rgba(255,255,255,0.15)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <LogOut size={18} color="#fff" />
            </button>
          </div>
        </div>

        {/* Sem resumo agregado — cada cartão exibe seus próprios dados individualmente */}
      </div>

      {/* ── Alertas ── */}
      {alertas.length > 0 && (
        <div style={{ padding: "12px 16px 0" }}>
          {alertas.map(c => {
            const dias = diasParaVencer(c.vencimentoDia);
            return (
              <div key={c.id} onClick={() => navigate(`/cartoes/cartao/${c.id}`)}
                style={{ display: "flex", alignItems: "center", gap: 12, background: dias <= 0 ? "#FFEBEE" : "#FFF3E0", borderRadius: 14, padding: "12px 14px", marginBottom: 8, cursor: "pointer", border: `1px solid ${dias <= 0 ? "#FFCDD2" : "#FFE0B2"}` }}>
                <div style={{ width: 36, height: 36, borderRadius: 18, background: dias <= 0 ? "#FFCDD2" : "#FFE0B2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <AlertTriangle size={18} color={dias <= 0 ? "#C62828" : "#E65100"} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: dias <= 0 ? "#C62828" : "#E65100", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.nome}</div>
                  <div style={{ fontSize: 12, color: dias <= 0 ? "#C62828" : "#E65100", opacity: 0.8 }}>
                    {dias <= 0 ? "Fatura vencida!" : dias === 1 ? "Vence amanhã!" : `Vence em ${dias} dias`}
                  </div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: dias <= 0 ? "#C62828" : "#E65100", flexShrink: 0 }}>{fmt(Number((c as any).faturaDoMes ?? (c as any).valorApagarCicloAtual ?? c.faturaAtual))}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Lista de Cartões ── */}
      <div style={{ padding: "16px 16px 0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: "#1C1B1F" }}>
            {cartoes.length > 0 ? `${cartoes.length} cartão${cartoes.length > 1 ? "ões" : ""}` : "Seus cartões"}
          </span>
          {cartoes.length > 0 && <span style={{ fontSize: 12, color: "#79747E" }}>Toque para gerenciar</span>}
        </div>

        {isLoading ? (
          [1, 2].map(i => <div key={i} style={{ height: 168, borderRadius: 20, background: "#E7E0EC", marginBottom: 16, animation: "pulse 1.5s infinite" }} />)
        ) : cartoes.length === 0 ? (
          <div style={{ textAlign: "center", padding: "56px 24px", background: "#fff", borderRadius: 24, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
            <div style={{ width: 80, height: 80, borderRadius: 40, background: "#EDE8F5", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
              <CreditCard size={40} color="#6750A4" />
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#1C1B1F", marginBottom: 8 }}>Nenhum cartão ainda</div>
            <div style={{ fontSize: 14, color: "#79747E", marginBottom: 28, lineHeight: 1.5 }}>Adicione seu primeiro cartão para começar a controlar seus gastos</div>
            <button onClick={() => setShowAdd(true)}
              style={{ height: 48, padding: "0 28px", borderRadius: 50, border: "none", background: "#6750A4", color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "'Roboto', sans-serif", boxShadow: "0 4px 16px rgba(103,80,164,0.35)" }}>
              + Adicionar Cartão
            </button>
          </div>
        ) : (
          cartoes.map((c, idx) => {
            const grad = GRADIENTS[c.corCartao] || GRADIENTS.purple;
            const shadow = SHADOWS[c.corCartao] || SHADOWS.purple;
            const faturaDoMes = Number((c as any).faturaDoMes ?? (c as any).valorApagarCicloAtual ?? c.faturaAtual ?? 0);
            const mesSeguinte = Number((c as any).parcelasMesSeguinte ?? 0);
            const limite = Number(c.limiteTotal ?? 0);
            const disponivel = Number(c.limiteDisponivel ?? 0);
            const pct = Number(c.percentualUsado ?? 0);
            const dias = diasParaVencer(c.vencimentoDia);

            return (
              <div key={c.id} onClick={() => navigate(`/cartoes/cartao/${c.id}`)}
                style={{ background: grad, borderRadius: 24, padding: "20px", marginBottom: 16, boxShadow: shadow, cursor: "pointer", position: "relative", overflow: "hidden", userSelect: "none", WebkitTapHighlightColor: "transparent" }}
                onTouchStart={e => (e.currentTarget.style.transform = "scale(0.98)")}
                onTouchEnd={e => (e.currentTarget.style.transform = "scale(1)")}>

                {/* Decoração */}
                <div style={{ position: "absolute", top: -24, right: -24, width: 96, height: 96, borderRadius: 48, background: "rgba(255,255,255,0.12)" }} />
                <div style={{ position: "absolute", bottom: -16, right: 48, width: 64, height: 64, borderRadius: 32, background: "rgba(255,255,255,0.07)" }} />

                <div style={{ position: "relative" }}>
                  {/* Cabeçalho */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                    <div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3 }}>Cartão de Crédito</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: "#fff" }}>{c.nome}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{
                        padding: "5px 10px", borderRadius: 50, fontSize: 11, fontWeight: 700,
                        background: faturaDoMes > 0 && dias <= 0 ? "rgba(244,67,54,0.9)" : faturaDoMes > 0 && dias <= 3 ? "rgba(255,152,0,0.9)" : "rgba(255,255,255,0.2)",
                        color: "#fff",
                      }}>
                        {faturaDoMes > 0 && dias <= 0 ? "⚠ VENCIDO" : faturaDoMes > 0 && dias <= 3 ? `⚠ ${dias}d` : (c as any).fechamentoDia ? `Fecha ${(c as any).fechamentoDia} · Vence ${c.vencimentoDia}` : `Dia ${c.vencimentoDia}`}
                      </div>
                    </div>
                  </div>

                  {/* 4 métricas claras no card do dashboard */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 14 }}>
                    {[
                      { label: "Fatura do Mês",  value: fmt(faturaDoMes),  color: faturaDoMes > 0 ? "#FFCDD2" : "#C8E6C9", icon: <TrendingUp size={10} /> },
                      { label: "Mês Seguinte",   value: fmt(mesSeguinte),  color: mesSeguinte > 0 ? "#FFE082" : "rgba(255,255,255,0.6)", icon: <Repeat size={10} /> },
                      { label: "Limite Total",    value: fmt(limite),       color: "#fff",    icon: <CreditCard size={10} /> },
                      { label: "Disponível",      value: fmt(disponivel),   color: disponivel < limite * 0.2 ? "#FFCDD2" : "#C8E6C9", icon: <CheckCircle size={10} /> },
                    ].map((item, i) => (
                      <div key={i} style={{ background: "rgba(0,0,0,0.18)", borderRadius: 10, padding: "7px 8px", display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ color: "rgba(255,255,255,0.6)", flexShrink: 0 }}>{item.icon}</div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 8, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: 0.4 }}>{item.label}</div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: item.color, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.value}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Barra de progresso */}
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>{pct.toFixed(0)}% do limite usado</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, color: "rgba(255,255,255,0.6)" }}>
                        <ChevronRight size={14} />
                      </div>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.25)", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, borderRadius: 3, background: pct >= 90 ? "#EF9A9A" : pct >= 70 ? "#FFE082" : "rgba(255,255,255,0.85)", transition: "width 600ms ease" }} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Espaçador para o último card não ficar atrás da barra de navegação */}
      <div style={{ height: "calc(120px + env(safe-area-inset-bottom, 0px))" }} />

      {/* ── Bottom Nav ── */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "rgba(255,255,255,0.95)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", borderTop: "1px solid rgba(231,224,236,0.8)", paddingBottom: "env(safe-area-inset-bottom, 0px)", zIndex: 50, boxShadow: "0 -4px 20px rgba(0,0,0,0.08)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px 10px" }}>

          {/* Card: Cartões (ativo) */}
          <div style={{ flex: 1, background: "linear-gradient(135deg, #6750A4 0%, #9C27B0 100%)", borderRadius: 18, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, boxShadow: "0 4px 16px rgba(103,80,164,0.35)", cursor: "default" }}>
            <div style={{ width: 36, height: 36, borderRadius: 12, background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <CreditCard size={18} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>Cartões</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", lineHeight: 1.2 }}>{cartoes.length} cadastrado{cartoes.length !== 1 ? "s" : ""}</div>
            </div>
          </div>

          {/* Card: Despesas */}
          <div onClick={() => navigate("/cartoes/despesas")} style={{ flex: 1, background: "linear-gradient(135deg, #2E7D32 0%, #00897B 100%)", borderRadius: 18, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, boxShadow: "0 4px 16px rgba(46,125,50,0.3)", cursor: "pointer", WebkitTapHighlightColor: "transparent" }}
            onTouchStart={e => (e.currentTarget.style.transform = "scale(0.97)")}
            onTouchEnd={e => (e.currentTarget.style.transform = "scale(1)")}>
            <div style={{ width: 36, height: 36, borderRadius: 12, background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Receipt size={18} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>Despesas</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", lineHeight: 1.2 }}>Controle fixo</div>
            </div>
          </div>

          {/* Botão Adicionar */}
          <div onClick={() => setShowAdd(true)} style={{ width: 52, height: 52, borderRadius: 16, background: "#F4EFF4", border: "2px solid #E7E0EC", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, WebkitTapHighlightColor: "transparent" }}
            onTouchStart={e => (e.currentTarget.style.background = "#E8DEF8")}
            onTouchEnd={e => (e.currentTarget.style.background = "#F4EFF4")}>
            <Plus size={22} color="#6750A4" />
          </div>
        </div>
      </div>

      {showAdd && <CartaoBottomSheet onClose={() => setShowAdd(false)} onSuccess={() => { setShowAdd(false); utils.cartoes.list.invalidate(); toast.success("Cartão adicionado!"); }} />}
    </div>
  );
}

function CartaoBottomSheet({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [nome, setNome] = useState("");
  const [dia, setDia] = useState("");
  const [limite, setLimite] = useState("");
  const [cor, setCor] = useState("purple");
  const createMutation = trpc.cartoes.cartoes.create.useMutation({ onSuccess, onError: e => toast.error(e.message) });

  const CORES = [
    { id: "purple", bg: "linear-gradient(135deg,#6750A4,#9C27B0)" },
    { id: "blue",   bg: "linear-gradient(135deg,#1565C0,#0288D1)" },
    { id: "red",    bg: "linear-gradient(135deg,#C62828,#E91E63)" },
    { id: "green",  bg: "linear-gradient(135deg,#2E7D32,#00897B)" },
    { id: "orange", bg: "linear-gradient(135deg,#E65100,#F9A825)" },
    { id: "pink",   bg: "linear-gradient(135deg,#AD1457,#E91E63)" },
    { id: "teal",   bg: "linear-gradient(135deg,#00695C,#0097A7)" },
    { id: "indigo", bg: "linear-gradient(135deg,#283593,#5C6BC0)" },
  ];

  const submit = () => {
    if (!nome.trim()) return toast.error("Nome obrigatório");
    const d = parseInt(dia);
    if (!d || d < 1 || d > 31) return toast.error("Dia inválido (1–31)");
    const l = parseFloat(limite.replace(",", "."));
    if (!l || l <= 0) return toast.error("Limite inválido");
    createMutation.mutate({ nome: nome.trim(), vencimentoDia: d, limiteTotal: l, corCartao: cor });
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "flex-end" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} onClick={onClose} />
      <div style={{ position: "relative", width: "100%", background: "#FFFBFE", borderRadius: "28px 28px 0 0", paddingBottom: "calc(env(safe-area-inset-bottom,0px) + 24px)", maxHeight: "92dvh", overflowY: "auto", animation: "slideUp 300ms cubic-bezier(0.23,1,0.32,1)" }}>
        <style>{`@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: "#CAC4D0", margin: "12px auto 0" }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px 8px" }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: "#1C1B1F" }}>Novo Cartão</span>
          <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: 18, background: "#F4EFF4", border: "none", cursor: "pointer", fontSize: 18, color: "#49454F", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>
        <div style={{ padding: "8px 20px 0", display: "flex", flexDirection: "column", gap: 16 }}>
          <Field label="NOME DO CARTÃO">
            <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Nubank, Bradesco Gold, Itaú" style={iStyle} onFocus={e => (e.target.style.borderColor = "#6750A4")} onBlur={e => (e.target.style.borderColor = "#E7E0EC")} />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="DIA VENCIMENTO">
              <input value={dia} onChange={e => setDia(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="Ex: 15" inputMode="numeric" style={iStyle} onFocus={e => (e.target.style.borderColor = "#6750A4")} onBlur={e => (e.target.style.borderColor = "#E7E0EC")} />
            </Field>
            <Field label="LIMITE (R$)">
              <input value={limite} onChange={e => setLimite(e.target.value.replace(/[^\d,.]/g, ""))} placeholder="Ex: 5000" inputMode="decimal" style={iStyle} onFocus={e => (e.target.style.borderColor = "#6750A4")} onBlur={e => (e.target.style.borderColor = "#E7E0EC")} />
            </Field>
          </div>
          <Field label="COR DO CARTÃO">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 8 }}>
              {CORES.map(c => (
                <button key={c.id} onClick={() => setCor(c.id)} style={{ height: 36, borderRadius: 10, background: c.bg, border: cor === c.id ? "3px solid #1C1B1F" : "3px solid transparent", cursor: "pointer", transition: "transform 150ms" }} />
              ))}
            </div>
          </Field>
          {/* Preview */}
          <div style={{ background: GRADIENTS[cor] || GRADIENTS.purple, borderRadius: 16, padding: "16px", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: -16, right: -16, width: 64, height: 64, borderRadius: 32, background: "rgba(255,255,255,0.12)" }} />
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.8 }}>Cartão de Crédito</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 8 }}>{nome || "Nome do Cartão"}</div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)" }}>Limite</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>
                  {limite ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(parseFloat(limite.replace(",", ".")) || 0) : "R$ 0,00"}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)" }}>Vence dia</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#fff" }}>{dia || "--"}</div>
              </div>
            </div>
          </div>
          <button onClick={submit} disabled={createMutation.isPending}
            style={{ height: 52, borderRadius: 50, border: "none", background: createMutation.isPending ? "#CAC4D0" : "#6750A4", color: "#fff", fontSize: 16, fontWeight: 600, cursor: createMutation.isPending ? "not-allowed" : "pointer", fontFamily: "'Roboto',sans-serif", boxShadow: createMutation.isPending ? "none" : "0 4px 16px rgba(103,80,164,0.35)", marginBottom: 8 }}>
            {createMutation.isPending ? "Salvando..." : "Adicionar Cartão"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 11, fontWeight: 700, color: "#6750A4", display: "block", marginBottom: 6, letterSpacing: 0.8, textTransform: "uppercase" }}>{label}</label>
      {children}
    </div>
  );
}

const iStyle: React.CSSProperties = {
  width: "100%", height: 52, padding: "0 14px", borderRadius: 12,
  border: "2px solid #E7E0EC", background: "#F4EFF4",
  fontSize: 16, color: "#1C1B1F", outline: "none",
  fontFamily: "'Roboto',sans-serif", boxSizing: "border-box",
  transition: "border-color 200ms",
};
