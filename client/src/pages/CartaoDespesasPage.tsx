import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, CheckCircle, RotateCcw, ChevronLeft, ChevronRight, AlertTriangle, Calendar, Tag } from "lucide-react";

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function fmt(v: number | string | null | undefined) {
  if (v === null || v === undefined) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v));
}

function diasParaVencer(dia: number | null | undefined): number | null {
  if (!dia) return null;
  const hoje = new Date();
  let venc = new Date(hoje.getFullYear(), hoje.getMonth(), dia);
  if (venc < hoje) venc = new Date(hoje.getFullYear(), hoje.getMonth() + 1, dia);
  return Math.ceil((venc.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
}

// ─── Componente Sheet ────────────────────────────────────────────────────────
function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} onClick={onClose} />
      <div style={{ position: "relative", background: "#0f0f1a", borderRadius: "24px 24px 0 0", border: "1px solid rgba(255,255,255,0.08)", borderBottom: "none", padding: "24px 20px 40px", display: "flex", flexDirection: "column", gap: 16, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontSize: 18, fontWeight: 700, color: "#fff", fontFamily: "'Inter', 'Roboto',sans-serif" }}>{title}</span>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 16, border: "none", background: "rgba(255,255,255,0.08)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.4)", letterSpacing: 0.6, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

function iStyle(): React.CSSProperties {
  return { width: "100%", height: 48, borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.06)", padding: "0 14px", fontSize: 15, color: "#fff", fontFamily: "'Inter', 'Roboto',sans-serif", outline: "none", boxSizing: "border-box" };
}

// ─── Formulário de Despesa ───────────────────────────────────────────────────
function DespesaForm({
  initial,
  cats,
  accent,
  onSubmit,
  onClose,
  isPending,
  title,
}: {
  initial?: { nome: string; valor: string; diaVencimento: string; categoriaId: number | null };
  cats: any[];
  accent: string;
  onSubmit: (d: { nome: string; valor: number | null; diaVencimento: number | null; categoriaId: number | null }) => void;
  onClose: () => void;
  isPending: boolean;
  title: string;
}) {
  const [nome, setNome] = useState(initial?.nome ?? "");
  const [valor, setValor] = useState(initial?.valor ?? "");
  const [diaVenc, setDiaVenc] = useState(initial?.diaVencimento ?? "");
  const [categoriaId, setCategoriaId] = useState<number | null>(initial?.categoriaId ?? null);
  const [showCats, setShowCats] = useState(false);

  const catSel = cats.find(c => c.id === categoriaId);

  const submit = () => {
    if (!nome.trim()) return toast.error("Nome obrigatório");
    const v = valor ? parseFloat(valor.replace(",", ".")) : null;
    if (valor && (!v || v <= 0)) return toast.error("Valor inválido");
    const dia = diaVenc ? parseInt(diaVenc) : null;
    if (diaVenc && (!dia || dia < 1 || dia > 31)) return toast.error("Dia de vencimento inválido (1-31)");
    onSubmit({ nome: nome.trim(), valor: v, diaVencimento: dia, categoriaId });
  };

  return (
    <Sheet title={title} onClose={onClose}>
      <Field label="NOME DA DESPESA">
        <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Conta de Luz, Internet..." style={iStyle()} />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="VALOR ESTIMADO (R$)">
          <input value={valor} onChange={e => setValor(e.target.value.replace(/[^\d,.]/g, ""))} placeholder="0,00" inputMode="decimal" style={iStyle()} />
        </Field>
        <Field label="DIA DE VENCIMENTO">
          <input value={diaVenc} onChange={e => setDiaVenc(e.target.value.replace(/\D/g, ""))} placeholder="Ex: 10" inputMode="numeric" style={iStyle()} />
        </Field>
      </div>
      <Field label="CATEGORIA (opcional)">
        <button type="button" onClick={() => setShowCats(v => !v)}
          style={{ ...iStyle(), display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
          <span style={{ color: catSel ? "#1C1B1F" : "#9E9E9E", fontSize: 14 }}>
            {catSel ? `${catSel.icone} ${catSel.nome}` : "Selecionar categoria..."}
          </span>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{showCats ? "▲" : "▼"}</span>
        </button>
        {showCats && (
          <div style={{ marginTop: 6, background: "#F4EFF4", borderRadius: 12, padding: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            <button type="button" onClick={() => { setCategoriaId(null); setShowCats(false); }}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 8, border: `2px solid ${!categoriaId ? accent : "#E7E0EC"}`, background: !categoriaId ? `${accent}15` : "#fff", color: !categoriaId ? accent : "#49454F", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Roboto',sans-serif" }}>
              🚫 Sem categoria
            </button>
            {cats.map((cat: any) => (
              <button key={cat.id} type="button" onClick={() => { setCategoriaId(cat.id); setShowCats(false); }}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 8, border: `2px solid ${categoriaId === cat.id ? accent : "#E7E0EC"}`, background: categoriaId === cat.id ? `${accent}15` : "#fff", color: categoriaId === cat.id ? accent : "#49454F", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Roboto',sans-serif" }}>
                {cat.icone} {cat.nome}
              </button>
            ))}
          </div>
        )}
      </Field>
      <button onClick={submit} disabled={isPending}
        style={{ width: "100%", height: 50, borderRadius: 50, border: "none", background: isPending ? "#CAC4D0" : accent, color: "#fff", fontSize: 16, fontWeight: 700, cursor: isPending ? "not-allowed" : "pointer", fontFamily: "'Roboto',sans-serif", marginTop: 4 }}>
        {isPending ? "Salvando..." : "Salvar"}
      </button>
    </Sheet>
  );
}

// ─── Página Principal ────────────────────────────────────────────────────────
export default function DespesasPage() {
  const hoje = new Date();
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [ano, setAno] = useState(hoje.getFullYear());
  const [showAdd, setShowAdd] = useState(false);
  const [editDespesa, setEditDespesa] = useState<any | null>(null);
  const [pagarDespesa, setPagarDespesa] = useState<any | null>(null);
  const [valorPagar, setValorPagar] = useState("");

  const accent = "#6750A4";

  const utils = trpc.useUtils();
  const { data: despesas = [], isLoading } = trpc.cartoes.despesas.list.useQuery({ mes, ano });
  const { data: cats = [] } = trpc.cartoes.categorias.list.useQuery();

  const createMut = trpc.cartoes.despesas.create.useMutation({
    onSuccess: () => { utils.despesas.list.invalidate(); setShowAdd(false); toast.success("Despesa adicionada!"); },
    onError: e => toast.error(e.message),
  });
  const updateMut = trpc.cartoes.despesas.update.useMutation({
    onSuccess: () => { utils.despesas.list.invalidate(); setEditDespesa(null); toast.success("Despesa atualizada!"); },
    onError: e => toast.error(e.message),
  });
  const deleteMut = trpc.cartoes.despesas.delete.useMutation({
    onSuccess: () => { utils.despesas.list.invalidate(); toast.success("Despesa removida!"); },
    onError: e => toast.error(e.message),
  });
  const marcarMut = trpc.cartoes.despesas.marcarPaga.useMutation({
    onSuccess: () => { utils.despesas.list.invalidate(); setPagarDespesa(null); setValorPagar(""); toast.success("Despesa marcada como paga!"); },
    onError: e => toast.error(e.message),
  });
  const desmarcarMut = trpc.cartoes.despesas.desmarcarPaga.useMutation({
    onSuccess: () => { utils.despesas.list.invalidate(); toast.success("Pagamento desfeito!"); },
    onError: e => toast.error(e.message),
  });

  const navMes = (dir: number) => {
    let nm = mes + dir;
    let na = ano;
    if (nm > 12) { nm = 1; na++; }
    if (nm < 1) { nm = 12; na--; }
    setMes(nm); setAno(na);
  };

  const totalEstimado = useMemo(() => despesas.reduce((s: number, d: any) => s + (d.valor ? Number(d.valor) : 0), 0), [despesas]);
  const totalPago = useMemo(() => despesas.filter((d: any) => d.pagamento).reduce((s: number, d: any) => s + (d.pagamento?.valorPago ? Number(d.pagamento.valorPago) : (d.valor ? Number(d.valor) : 0)), 0), [despesas]);
  const totalPendente = useMemo(() => despesas.filter((d: any) => !d.pagamento).reduce((s: number, d: any) => s + (d.valor ? Number(d.valor) : 0), 0), [despesas]);
  const pagas = despesas.filter((d: any) => d.pagamento).length;
  const pendentes = despesas.filter((d: any) => !d.pagamento).length;

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #0a0a0f 0%, #0d0a1a 100%)", fontFamily: "'Inter', 'Roboto',sans-serif", paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ background: `linear-gradient(135deg, ${accent} 0%, #9C27B0 100%)`, padding: "48px 20px 28px", color: "#fff" }}>
        <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: 1.5, opacity: 0.8, marginBottom: 4 }}>CONTROLE FINANCEIRO</div>
        <div style={{ fontSize: 26, fontWeight: 800, marginBottom: 20 }}>Despesas Fixas</div>

        {/* Navegação de mês */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(255,255,255,0.15)", borderRadius: 16, padding: "10px 16px" }}>
          <button onClick={() => navMes(-1)} style={{ background: "none", border: "none", cursor: "pointer", color: "#fff", display: "flex", alignItems: "center" }}>
            <ChevronLeft size={22} />
          </button>
          <span style={{ fontSize: 16, fontWeight: 700 }}>{MESES[mes - 1]} {ano}</span>
          <button onClick={() => navMes(1)} style={{ background: "none", border: "none", cursor: "pointer", color: "#fff", display: "flex", alignItems: "center" }}>
            <ChevronRight size={22} />
          </button>
        </div>

        {/* Resumo */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 16 }}>
          <div style={{ background: "rgba(255,255,255,0.15)", borderRadius: 14, padding: "12px 10px", textAlign: "center" }}>
            <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 4 }}>TOTAL</div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>{fmt(totalEstimado)}</div>
          </div>
          <div style={{ background: "rgba(255,255,255,0.15)", borderRadius: 14, padding: "12px 10px", textAlign: "center" }}>
            <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 4 }}>PAGO</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#A5D6A7" }}>{fmt(totalPago)}</div>
          </div>
          <div style={{ background: "rgba(255,255,255,0.15)", borderRadius: 14, padding: "12px 10px", textAlign: "center" }}>
            <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 4 }}>PENDENTE</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#FFCC80" }}>{fmt(totalPendente)}</div>
          </div>
        </div>
      </div>

      {/* Barra de progresso */}
      {despesas.length > 0 && (
        <div style={{ background: "#fff", padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>{pagas} de {despesas.length} pagas</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: accent }}>{despesas.length > 0 ? Math.round((pagas / despesas.length) * 100) : 0}%</span>
          </div>
          <div style={{ height: 8, background: "rgba(255,255,255,0.06)", borderRadius: 4, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${despesas.length > 0 ? (pagas / despesas.length) * 100 : 0}%`, background: `linear-gradient(90deg, ${accent}, #9C27B0)`, borderRadius: 4, transition: "width 400ms" }} />
          </div>
        </div>
      )}

      {/* Lista */}
      <div style={{ padding: "16px 16px 0" }}>
        {isLoading ? (
          <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.4)" }}>Carregando...</div>
        ) : despesas.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 24px", background: "rgba(255,255,255,0.05)", borderRadius: 20, border: "1px solid rgba(255,255,255,0.07)", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <Tag size={40} color="#CAC4D0" style={{ marginBottom: 12 }} />
            <div style={{ fontSize: 16, fontWeight: 600, color: "rgba(255,255,255,0.6)", marginBottom: 6 }}>Nenhuma despesa cadastrada</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Toque em + para adicionar água, luz, internet...</div>
          </div>
        ) : (
          <>
            {/* Pendentes primeiro */}
            {pendentes > 0 && <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: 1, marginBottom: 8 }}>PENDENTES ({pendentes})</div>}
            {despesas.filter((d: any) => !d.pagamento).map((d: any) => (
              <DespesaCard key={d.id} d={d} cats={cats} accent={accent} mes={mes} ano={ano}
                onPagar={() => { setPagarDespesa(d); setValorPagar(d.valor ? String(Number(d.valor).toFixed(2)).replace(".", ",") : ""); }}
                onEditar={() => setEditDespesa(d)}
                onExcluir={() => { if (confirm(`Excluir "${d.nome}"?`)) deleteMut.mutate({ id: d.id }); }}
                onDesmarcar={() => desmarcarMut.mutate({ despesaId: d.id, mes, ano })}
              />
            ))}

            {/* Pagas */}
            {pagas > 0 && <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: 1, margin: "16px 0 8px" }}>PAGAS ({pagas})</div>}
            {despesas.filter((d: any) => d.pagamento).map((d: any) => (
              <DespesaCard key={d.id} d={d} cats={cats} accent={accent} mes={mes} ano={ano}
                onPagar={() => {}}
                onEditar={() => setEditDespesa(d)}
                onExcluir={() => { if (confirm(`Excluir "${d.nome}"?`)) deleteMut.mutate({ id: d.id }); }}
                onDesmarcar={() => desmarcarMut.mutate({ despesaId: d.id, mes, ano })}
              />
            ))}
          </>
        )}
      </div>

      {/* FAB */}
      <button onClick={() => setShowAdd(true)}
        style={{ position: "fixed", bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28, background: accent, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 16px rgba(103,80,164,0.4)", zIndex: 100 }}>
        <Plus size={26} color="#fff" />
      </button>

      {/* Modal: Adicionar */}
      {showAdd && (
        <DespesaForm title="Nova Despesa" cats={cats} accent={accent} isPending={createMut.isPending}
          onClose={() => setShowAdd(false)}
          onSubmit={d => createMut.mutate(d)}
        />
      )}

      {/* Modal: Editar */}
      {editDespesa && (
        <DespesaForm title="Editar Despesa" cats={cats} accent={accent} isPending={updateMut.isPending}
          initial={{ nome: editDespesa.nome, valor: editDespesa.valor ? String(Number(editDespesa.valor).toFixed(2)).replace(".", ",") : "", diaVencimento: editDespesa.diaVencimento ? String(editDespesa.diaVencimento) : "", categoriaId: editDespesa.categoriaId }}
          onClose={() => setEditDespesa(null)}
          onSubmit={d => updateMut.mutate({ id: editDespesa.id, ...d })}
        />
      )}

      {/* Modal: Pagar */}
      {pagarDespesa && (
        <Sheet title={`Pagar: ${pagarDespesa.nome}`} onClose={() => setPagarDespesa(null)}>
          <Field label="VALOR PAGO (R$)">
            <input value={valorPagar} onChange={e => setValorPagar(e.target.value.replace(/[^\d,.]/g, ""))} placeholder="0,00" inputMode="decimal" style={iStyle()} autoFocus />
          </Field>
          <button onClick={() => {
            const v = valorPagar ? parseFloat(valorPagar.replace(",", ".")) : null;
            if (valorPagar && (!v || v <= 0)) return toast.error("Valor inválido");
            marcarMut.mutate({ despesaId: pagarDespesa.id, mes, ano, valorPago: v });
          }} disabled={marcarMut.isPending}
            style={{ width: "100%", height: 50, borderRadius: 50, border: "none", background: marcarMut.isPending ? "#CAC4D0" : accent, color: "#fff", fontSize: 16, fontWeight: 700, cursor: marcarMut.isPending ? "not-allowed" : "pointer", fontFamily: "'Roboto',sans-serif" }}>
            {marcarMut.isPending ? "Salvando..." : "Confirmar Pagamento"}
          </button>
        </Sheet>
      )}
    </div>
  );
}

// ─── Card de Despesa ─────────────────────────────────────────────────────────
function DespesaCard({ d, cats, accent, mes, ano, onPagar, onEditar, onExcluir, onDesmarcar }: {
  d: any; cats: any[]; accent: string; mes: number; ano: number;
  onPagar: () => void; onEditar: () => void; onExcluir: () => void; onDesmarcar: () => void;
}) {
  const pago = !!d.pagamento;
  const cat = cats.find((c: any) => c.id === d.categoriaId);
  const diasVenc = diasParaVencer(d.diaVencimento);
  const venceHoje = diasVenc === 0;
  const venceEmBreve = diasVenc !== null && diasVenc <= 3 && diasVenc > 0;
  const valorExibido = pago && d.pagamento?.valorPago ? Number(d.pagamento.valorPago) : (d.valor ? Number(d.valor) : null);

  return (
    <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 16, border: "1px solid rgba(255,255,255,0.07)", padding: "14px 16px", marginBottom: 10, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", borderLeft: pago ? `4px solid #4CAF50` : (venceHoje || venceEmBreve) ? `4px solid #FF9800` : `4px solid #E7E0EC`, opacity: pago ? 0.85 : 1 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        {/* Ícone status */}
        <div style={{ width: 44, height: 44, borderRadius: 22, background: pago ? "#E8F5E9" : `${accent}15`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {pago ? <CheckCircle size={22} color="#4CAF50" /> : <Calendar size={20} color={accent} />}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.nome}</span>
            {(venceHoje || venceEmBreve) && !pago && <AlertTriangle size={14} color="#FF9800" />}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
            {cat && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", background: "#F4EFF4", borderRadius: 20, padding: "1px 8px", fontWeight: 600 }}>{cat.icone} {cat.nome}</span>}
            {d.diaVencimento && (
              <span style={{ fontSize: 11, color: pago ? "#4CAF50" : (venceHoje ? "#E65100" : venceEmBreve ? "#FF9800" : "#79747E"), background: pago ? "#E8F5E9" : (venceHoje ? "#FFF3E0" : venceEmBreve ? "#FFF8E1" : "#F4EFF4"), borderRadius: 20, padding: "1px 8px", fontWeight: 600 }}>
                {pago ? `✓ Pago dia ${new Date(d.pagamento.dataPagamento).getDate()}` : venceHoje ? "⚠️ Vence hoje!" : venceEmBreve ? `⚠️ Vence em ${diasVenc}d` : `Vence dia ${d.diaVencimento}`}
              </span>
            )}
          </div>
        </div>

        {/* Valor e ações */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: pago ? "#4CAF50" : "#C62828" }}>
            {valorExibido !== null ? fmt(valorExibido) : "—"}
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            {!pago ? (
              <button onClick={onPagar}
                style={{ height: 30, padding: "0 12px", borderRadius: 15, border: "none", background: accent, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'Roboto',sans-serif" }}>
                ✓ Pagar
              </button>
            ) : (
              <button onClick={onDesmarcar}
                style={{ height: 30, padding: "0 10px", borderRadius: 15, border: `1px solid #E7E0EC`, background: "#fff", color: "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "'Roboto',sans-serif", display: "flex", alignItems: "center", gap: 4 }}>
                <RotateCcw size={11} /> Desfazer
              </button>
            )}
            <button onClick={onEditar}
              style={{ width: 30, height: 30, borderRadius: 15, border: `1px solid ${accent}40`, background: `${accent}10`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Pencil size={13} color={accent} />
            </button>
            <button onClick={onExcluir}
              style={{ width: 30, height: 30, borderRadius: 15, border: "1px solid #FFCDD2", background: "rgba(239,68,68,0.1)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Trash2 size={13} color="#C62828" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
