import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Search, Plus, Minus, Star, ShoppingCart, Trash2, Edit3, CheckCircle, X, History, ShoppingBag, Package, ChevronDown, ChevronUp } from "lucide-react";

const BG = "linear-gradient(180deg, #0a0a0f 0%, #0d0a1a 100%)";
const S: Record<string, any> = {
  page: { minHeight: "100dvh", background: BG, fontFamily: "'DM Sans','Inter',sans-serif", paddingBottom: 100, color: "#fff" },
  header: { background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)", padding: "16px 16px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)" },
  select: { width: "100%", background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 14, padding: "12px 14px", color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box" as const, appearance: "none" as any, WebkitAppearance: "none" as any },
  input: { background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "8px 10px", color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box" as const, width: "100%" },
  btn: (bg: string) => ({ background: bg, border: "none", borderRadius: 14, padding: "12px 18px", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }),
  card: { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "12px 14px", marginBottom: 8 },
  label: { fontSize: 11, color: "rgba(255,255,255,0.5)", textTransform: "uppercase" as const, letterSpacing: 1, marginBottom: 6, display: "block" },
};

const CATEGORIAS = [
  "🥩 Açougue","🍎 Hortifruti","🥛 Laticínios","🥖 Padaria","🧴 Limpeza",
  "🧻 Higiene","🍝 Mercearia","🥤 Bebidas","🍦 Frios","🐟 Peixaria",
  "🌾 Grãos","🍬 Doces","🧊 Congelados","📦 Outros"
];

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// ─── Aba Produtos — fluxo inline simplificado ─────────────────────────────────
function AbaProdutos({ onAddToList }: { onAddToList: (p: any, qtd: number, valor: number | null) => void }) {
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editingProduto, setEditingProduto] = useState<any | null>(null);
  const [nome, setNome] = useState("");
  const [cat, setCat] = useState("");
  const [unid, setUnid] = useState("un");
  // Estado inline por produto: { [id]: { qtd, valorCents, open } }
  const [inline, setInline] = useState<Record<number, { qtd: string; valorCents: number; open: boolean }>>({})

  // Formata centavos para exibição: 400 → "4,00", 100000 → "1.000,00"
  const fmtCents = (cents: number): string => {
    if (!cents) return "0,00";
    const s = String(cents).padStart(3, "0");
    const intPart = s.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return (intPart || "0") + "," + s.slice(-2);
  };

  // Ao digitar: só aceita dígitos, empurra da direita (igual caixa de mercado)
  const handleValorInput = (id: number, raw: string) => {
    const digits = raw.replace(/\D/g, "");
    const cents = parseInt(digits || "0", 10);
    setInline(prev => ({ ...prev, [id]: { ...prev[id], valorCents: cents } }));
  };;

  const { data: produtos = [], refetch } = trpc.mercado.produtos.list.useQuery({ search: search || undefined }, { refetchOnWindowFocus: false });
  const createMut = trpc.mercado.produtos.create.useMutation({ onSuccess: () => { refetch(); setShowAdd(false); setNome(""); setCat(""); setUnid("un"); toast.success("Produto criado!"); } });
  const updateMut = trpc.mercado.produtos.update.useMutation({ onSuccess: () => { refetch(); setEditingProduto(null); toast.success("Atualizado!"); } });
  const deleteMut = trpc.mercado.produtos.delete.useMutation({ onSuccess: () => { refetch(); toast.success("Removido!"); } });
  const seedMut = trpc.mercado.produtos.seed.useMutation({ onSuccess: (r: any) => { refetch(); toast.success(`${r.criados} produtos adicionados!`); } });

  const openEdit = (p: any) => { setEditingProduto(p); setNome(p.nome); setCat(p.categoria || ""); setUnid(p.unidade || "un"); };

  const toggleInline = (id: number) => {
    setInline(prev => ({
      ...prev,
      [id]: prev[id]?.open
        ? { ...prev[id], open: false }
        : { qtd: "1", valorCents: 0, open: true }
    }));
  };

  const confirmAdd = (p: any) => {
    const state = inline[p.id];
    const qtd = parseFloat(state?.qtd || "1") || 1;
    const valor = state?.valorCents ? state.valorCents / 100 : null;
    onAddToList(p, qtd, valor);
    setInline(prev => ({ ...prev, [p.id]: { ...prev[p.id], open: false } }));
  };

  const maisComprados = produtos.filter((p: any) => p.vezesComprado > 0).sort((a: any, b: any) => b.vezesComprado - a.vezesComprado).slice(0, 6);

  return (
    <div style={{ padding: "12px 16px" }}>
      {/* Pesquisa */}
      <div style={{ position: "relative", marginBottom: 12 }}>
        <Search size={15} color="rgba(255,255,255,0.4)" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Pesquisar produto..." style={{ ...S.input, paddingLeft: 36, borderRadius: 14, padding: "11px 14px 11px 36px" }} />
      </div>

      {/* Mais comprados */}
      {!search && maisComprados.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>🔥 Mais comprados</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {maisComprados.map((p: any) => (
              <button key={p.id} onClick={() => toggleInline(p.id)} style={{ background: "rgba(124,58,237,0.2)", border: "1px solid rgba(124,58,237,0.3)", borderRadius: 20, padding: "5px 12px", color: "#a78bfa", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                {p.nome}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Lista de produtos */}
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
        {search ? `${produtos.length} resultado(s)` : "Todos os Produtos"}
      </div>

      {produtos.map((p: any) => {
        const state = inline[p.id];
        const isOpen = state?.open;
        return (
          <div key={p.id} style={{ ...S.card }}>
            {/* Linha principal */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.nome}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>{p.categoria} · {p.unidade}</div>
              </div>
              {/* Ações rápidas */}
              <button onClick={() => updateMut.mutate({ id: p.id, favorito: !p.favorito })} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, flexShrink: 0 }}>
                <Star size={14} color={p.favorito ? "#fbbf24" : "rgba(255,255,255,0.25)"} fill={p.favorito ? "#fbbf24" : "none"} />
              </button>
              <button onClick={() => openEdit(p)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, flexShrink: 0 }}>
                <Edit3 size={13} color="rgba(255,255,255,0.3)" />
              </button>
              <button onClick={() => { if (confirm(`Excluir "${p.nome}"?`)) deleteMut.mutate({ id: p.id }); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, flexShrink: 0 }}>
                <Trash2 size={13} color="rgba(239,68,68,0.5)" />
              </button>
              {/* Botão + Lista */}
              <button onClick={() => toggleInline(p.id)} style={{
                background: isOpen ? "rgba(239,68,68,0.2)" : "rgba(124,58,237,0.3)",
                border: `1px solid ${isOpen ? "rgba(239,68,68,0.4)" : "rgba(124,58,237,0.4)"}`,
                borderRadius: 10, padding: "6px 10px", color: isOpen ? "#f87171" : "#a78bfa",
                fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 3, flexShrink: 0
              }}>
                {isOpen ? <X size={13} /> : <Plus size={13} />}
                {isOpen ? "Fechar" : "Lista"}
              </button>
            </div>

            {/* Inline — quantidade + valor + confirmar */}
            {isOpen && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                  {/* Quantidade */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>QTDE ({p.unidade})</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <button onClick={() => setInline(prev => ({ ...prev, [p.id]: { ...prev[p.id], qtd: String(Math.max(1, parseFloat(prev[p.id]?.qtd || "1") - 1)) } }))}
                        style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(255,255,255,0.08)", border: "none", color: "#fff", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Minus size={14} />
                      </button>
                      <input
                        type="number"
                        value={state?.qtd ?? "1"}
                        onChange={e => setInline(prev => ({ ...prev, [p.id]: { ...prev[p.id], qtd: e.target.value } }))}
                        style={{ ...S.input, textAlign: "center", padding: "6px 4px", borderRadius: 8, fontSize: 15, fontWeight: 700 }}
                      />
                      <button onClick={() => setInline(prev => ({ ...prev, [p.id]: { ...prev[p.id], qtd: String(parseFloat(prev[p.id]?.qtd || "1") + 1) } }))}
                        style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(255,255,255,0.08)", border: "none", color: "#fff", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                  {/* Valor unitário com máscara monetária */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>VALOR (R$)</div>
                    <div style={{ position: "relative" }}>
                      <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "rgba(255,255,255,0.5)", pointerEvents: "none" }}>R$</span>
                      <input
                        type="tel"
                        inputMode="numeric"
                        value={fmtCents(state?.valorCents ?? 0)}
                        onChange={e => handleValorInput(p.id, e.target.value)}
                        style={{ ...S.input, padding: "8px 10px 8px 30px", borderRadius: 8, fontWeight: 700, fontSize: 15 }}
                      />
                    </div>
                  </div>
                  {/* Total calculado */}
                  {(state?.valorCents ?? 0) > 0 && (
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>TOTAL</div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: "#10b981" }}>
                        {fmt(parseFloat(state?.qtd || "1") * ((state?.valorCents ?? 0) / 100))}
                      </div>
                    </div>
                  )}
                </div>
                {/* Botão confirmar */}
                <button onClick={() => confirmAdd(p)} style={{ ...S.btn("linear-gradient(135deg,#7c3aed,#3b82f6)"), width: "100%", justifyContent: "center", marginTop: 10, padding: "10px" }}>
                  <ShoppingCart size={16} /> Adicionar à Lista
                </button>
              </div>
            )}
          </div>
        );
      })}

      {produtos.length === 0 && (
        <div style={{ textAlign: "center", padding: "32px 0", color: "rgba(255,255,255,0.3)" }}>
          <Package size={40} style={{ margin: "0 auto 12px", display: "block" }} />
          <div style={{ marginBottom: 16 }}>{search ? "Nenhum produto encontrado" : "Nenhum produto cadastrado"}</div>
          {!search && (
            <button onClick={() => seedMut.mutate()} disabled={seedMut.isPending} style={{ ...S.btn("linear-gradient(135deg,#10b981,#059669)"), margin: "0 auto" }}>
              {seedMut.isPending ? "Carregando..." : "📦 Carregar Lista Padrão"}
            </button>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button onClick={() => setShowAdd(true)} style={{ ...S.btn("linear-gradient(135deg,#7c3aed,#3b82f6)"), flex: 1, justifyContent: "center" }}>
          <Plus size={16} /> Novo Produto
        </button>
        {produtos.length === 0 && (
          <button onClick={() => seedMut.mutate()} disabled={seedMut.isPending} style={{ ...S.btn("linear-gradient(135deg,#10b981,#059669)"), flex: 1, justifyContent: "center" }}>
            📦 Lista Padrão
          </button>
        )}
      </div>

      {/* Sheet novo/editar produto */}
      {(showAdd || editingProduto) && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", alignItems: "flex-end" }}>
          <div style={{ background: "#0f0f1a", borderRadius: "24px 24px 0 0", padding: 24, width: "100%", border: "1px solid rgba(255,255,255,0.08)", maxHeight: "90dvh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
              <span style={{ fontWeight: 700, fontSize: 18 }}>{editingProduto ? "Editar Produto" : "Novo Produto"}</span>
              <button onClick={() => { setShowAdd(false); setEditingProduto(null); setNome(""); setCat(""); setUnid("un"); }} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer" }}><X size={20} /></button>
            </div>
            <label style={S.label}>NOME</label>
            <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Arroz Integral" style={{ ...S.input, borderRadius: 14, padding: "12px 14px", marginBottom: 12 }} />
            <label style={S.label}>CATEGORIA</label>
            <div style={{ position: "relative", marginBottom: 12 }}>
              <select value={cat} onChange={e => setCat(e.target.value)} style={S.select}>
                <option value="" style={{ background: "#1a1a2e", color: "#fff" }}>Selecione...</option>
                {CATEGORIAS.map(c => <option key={c} value={c} style={{ background: "#1a1a2e", color: "#fff" }}>{c}</option>)}
              </select>
              <ChevronDown size={14} color="rgba(255,255,255,0.4)" style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
            </div>
            <label style={S.label}>UNIDADE</label>
            <div style={{ position: "relative", marginBottom: 20 }}>
              <select value={unid} onChange={e => setUnid(e.target.value)} style={S.select}>
                {["un","kg","g","L","mL","cx","pct","dz","m"].map(u => <option key={u} value={u} style={{ background: "#1a1a2e", color: "#fff" }}>{u}</option>)}
              </select>
              <ChevronDown size={14} color="rgba(255,255,255,0.4)" style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
            </div>
            <button
              onClick={() => {
                if (!nome.trim()) return;
                if (editingProduto) updateMut.mutate({ id: editingProduto.id, nome: nome.trim(), categoria: cat || undefined, unidade: unid });
                else createMut.mutate({ nome: nome.trim(), categoria: cat || undefined, unidade: unid });
              }}
              disabled={createMut.isPending || updateMut.isPending}
              style={{ ...S.btn("linear-gradient(135deg,#7c3aed,#3b82f6)"), width: "100%", justifyContent: "center" }}>
              {(createMut.isPending || updateMut.isPending) ? "Salvando..." : editingProduto ? "Salvar Alterações" : "Criar Produto"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Aba Minha Lista ──────────────────────────────────────────────────────────
function AbaLista({ cartoes }: { cartoes: any[] }) {
  const [showFinalizar, setShowFinalizar] = useState(false);
  const [mercado, setMercado] = useState("");
  const [cartaoId, setCartaoId] = useState<number | undefined>();

  const { data: lista = [], refetch } = trpc.mercado.lista.get.useQuery(undefined, { refetchOnWindowFocus: false });
  const updateMut = trpc.mercado.lista.update.useMutation({ onSuccess: () => refetch() });
  const removeMut = trpc.mercado.lista.remove.useMutation({ onSuccess: () => refetch() });
  const finalizarMut = trpc.mercado.lista.finalizar.useMutation({
    onSuccess: (data: any) => {
      refetch(); setShowFinalizar(false);
      toast.success(`Compra finalizada! Total: ${fmt(data.totalCaixa)}`);
      if (data.diferenca > 0.01) toast.error(`⚠️ Diferença de ${fmt(data.diferenca)} encontrada!`);
    }
  });

  const grupos = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const item of lista) {
      const cat = (item as any).categoria || "📦 Outros";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(item);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [lista]);

  const totalGeral = lista.reduce((s: number, i: any) => {
    const preco = parseFloat(i.precoCaixa || i.precoPrateleira || "0");
    const qtd = parseFloat(i.quantidade || "1");
    return s + preco * qtd;
  }, 0);

  if (lista.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "48px 24px", color: "rgba(255,255,255,0.3)" }}>
        <ShoppingCart size={48} style={{ margin: "0 auto 16px", display: "block" }} />
        <div style={{ fontSize: 18, fontWeight: 700, color: "rgba(255,255,255,0.6)", marginBottom: 8 }}>Lista vazia</div>
        <div>Vá em "Produtos" e adicione itens</div>
      </div>
    );
  }

  return (
    <div style={{ padding: "12px 16px" }}>
      {/* Total geral */}
      <div style={{ background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.3)", borderRadius: 16, padding: "12px 16px", marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1 }}>Total da lista</div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>{fmt(totalGeral)}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{lista.length} produto(s)</div>
        </div>
      </div>

      {grupos.map(([cat, itens]) => {
        const totalCat = itens.reduce((s: number, i: any) => s + parseFloat(i.precoCaixa || i.precoPrateleira || "0") * parseFloat(i.quantidade || "1"), 0);
        return (
          <div key={cat} style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8 }}>{cat}</div>
              {totalCat > 0 && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{fmt(totalCat)}</div>}
            </div>
            {itens.map((item: any) => {
              const preco = parseFloat(item.precoCaixa || item.precoPrateleira || "0");
              const qtd = parseFloat(item.quantidade || "1");
              const total = preco * qtd;
              return (
                <div key={item.id} style={{ ...S.card }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{item.nomeProduto}</div>
                      <div style={{ display: "flex", gap: 8, marginTop: 4, alignItems: "center" }}>
                        {/* Qtde inline */}
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <button onClick={() => updateMut.mutate({ id: item.id, quantidade: Math.max(1, qtd - 1) })}
                            style={{ width: 24, height: 24, borderRadius: 6, background: "rgba(255,255,255,0.08)", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Minus size={11} />
                          </button>
                          <span style={{ fontSize: 13, fontWeight: 700, minWidth: 20, textAlign: "center" }}>{qtd % 1 === 0 ? qtd : qtd.toFixed(1)}</span>
                          <button onClick={() => updateMut.mutate({ id: item.id, quantidade: qtd + 1 })}
                            style={{ width: 24, height: 24, borderRadius: 6, background: "rgba(255,255,255,0.08)", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Plus size={11} />
                          </button>
                        </div>
                        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{item.unidade}</span>
                        {preco > 0 && <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>× {fmt(preco)}</span>}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      {total > 0 && <div style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>{fmt(total)}</div>}
                      {!preco && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>sem valor</div>}
                    </div>
                    <button onClick={() => removeMut.mutate({ id: item.id })} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, flexShrink: 0 }}>
                      <Trash2 size={14} color="rgba(239,68,68,0.5)" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      <button onClick={() => setShowFinalizar(true)} style={{ ...S.btn("linear-gradient(135deg,#10b981,#059669)"), width: "100%", justifyContent: "center", marginTop: 8 }}>
        <CheckCircle size={18} /> Finalizar Compra — {fmt(totalGeral)}
      </button>

      {showFinalizar && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", alignItems: "flex-end" }}>
          <div style={{ background: "#0f0f1a", borderRadius: "24px 24px 0 0", padding: 24, width: "100%", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
              <span style={{ fontWeight: 700, fontSize: 18 }}>✅ Finalizar Compra</span>
              <button onClick={() => setShowFinalizar(false)} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer" }}><X size={20} /></button>
            </div>
            <div style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 12, padding: "12px 14px", marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{lista.length} produtos</div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{fmt(totalGeral)}</div>
            </div>
            <label style={S.label}>MERCADO (opcional)</label>
            <input value={mercado} onChange={e => setMercado(e.target.value)} placeholder="Ex: Carrefour, Extra..." style={{ ...S.input, borderRadius: 14, padding: "12px 14px", marginBottom: 12 }} />
            <label style={S.label}>CARTÃO UTILIZADO (opcional)</label>
            <div style={{ position: "relative", marginBottom: 20 }}>
              <select value={cartaoId ?? ""} onChange={e => setCartaoId(e.target.value ? Number(e.target.value) : undefined)} style={S.select}>
                <option value="" style={{ background: "#1a1a2e", color: "#fff" }}>Nenhum</option>
                {cartoes.map((c: any) => <option key={c.id} value={c.id} style={{ background: "#1a1a2e", color: "#fff" }}>{c.nome}</option>)}
              </select>
              <ChevronDown size={14} color="rgba(255,255,255,0.4)" style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
            </div>
            <button onClick={() => finalizarMut.mutate({ mercado: mercado || undefined, cartaoId })} disabled={finalizarMut.isPending} style={{ ...S.btn("linear-gradient(135deg,#10b981,#059669)"), width: "100%", justifyContent: "center" }}>
              {finalizarMut.isPending ? "Finalizando..." : "✅ Confirmar e Finalizar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Aba Histórico ────────────────────────────────────────────────────────────
function AbaHistorico({ cartoes }: { cartoes: any[] }) {
  const { data: historico = [], refetch } = trpc.mercado.historico.list.useQuery(undefined, { refetchOnWindowFocus: false });
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const deleteMut = trpc.mercado.historico.delete.useMutation({ onSuccess: () => { refetch(); toast.success('Excluído!'); } });

  if (historico.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "48px 24px", color: "rgba(255,255,255,0.3)" }}>
        <History size={48} style={{ margin: "0 auto 16px", display: "block" }} />
        <div style={{ fontSize: 18, fontWeight: 700, color: "rgba(255,255,255,0.6)", marginBottom: 8 }}>Sem histórico</div>
        <div>Finalize uma compra para ver aqui</div>
      </div>
    );
  }

  return (
    <div style={{ padding: "12px 16px" }}>
      {historico.map((h: any) => {
        const itens = (() => { try { return JSON.parse(h.itens || "[]"); } catch { return []; } })();
        const cartao = cartoes.find((c: any) => c.id === h.cartaoId);
        const isExpanded = expandedId === h.id;
        return (
          <div key={h.id} style={S.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{h.mercado || "Compra"}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
                  {new Date(h.finalizadoEm).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                </div>
                {cartao && <div style={{ fontSize: 11, color: "#a78bfa", marginTop: 2 }}>💳 {cartao.nome}</div>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{fmt(parseFloat(h.totalCaixa || h.totalPrateleira || "0"))}</div>
                <button onClick={() => { if (confirm("Excluir este histórico?")) deleteMut.mutate({ id: h.id }); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
                  <Trash2 size={16} color="rgba(239,68,68,0.6)" />
                </button>
              </div>
            </div>
            <button onClick={() => setExpandedId(isExpanded ? null : h.id)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 4, padding: 0 }}>
              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />} {itens.length} itens
            </button>
            {isExpanded && (
              <div style={{ marginTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 10 }}>
                {itens.map((item: any, i: number) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <div>
                      <div style={{ fontSize: 13 }}>{item.nomeProduto}</div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{parseFloat(item.quantidade || "1")} {item.unidade}</div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>
                      {fmt(parseFloat(item.precoCaixa || item.precoPrateleira || "0") * parseFloat(item.quantidade || "1"))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function CartaoMercadoPage() {
  const [aba, setAba] = useState<"produtos" | "lista" | "historico">("produtos");
  const { data: cartoes = [] } = trpc.cartoes.cartoes.list.useQuery(undefined, { refetchOnWindowFocus: false });
  const utils = trpc.useUtils();

  const addToListMut = trpc.mercado.lista.add.useMutation({
    onSuccess: (data: any) => {
      utils.mercado.lista.get.invalidate();
      if (data.duplicate) toast.info("Produto já está na lista!");
      else { toast.success("Adicionado! 🛒"); setAba("lista"); }
    }
  });

  const { data: listaData } = trpc.mercado.lista.get.useQuery(undefined, { refetchOnWindowFocus: false });
  const qtdLista = listaData?.length || 0;

  const handleAddToList = (p: any, qtd: number, valor: number | null) => {
    addToListMut.mutate({
      produtoId: p.id,
      nomeProduto: p.nome,
      categoria: p.categoria || undefined,
      unidade: p.unidade || "un",
      quantidade: qtd,
      precoPrateleira: valor ?? (p.precoUltimo ? parseFloat(p.precoUltimo) : undefined),
    });
  };

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{ width: 36, height: 36, borderRadius: 12, background: "linear-gradient(135deg,#7c3aed,#3b82f6)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ShoppingBag size={18} color="#fff" />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>Lista de Compras</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Mercado inteligente</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {([
            { id: "produtos", label: "Produtos", icon: <Package size={13} /> },
            { id: "lista", label: `Lista${qtdLista > 0 ? ` (${qtdLista})` : ""}`, icon: <ShoppingCart size={13} /> },
            { id: "historico", label: "Histórico", icon: <History size={13} /> },
          ] as const).map(tab => (
            <button key={tab.id} onClick={() => setAba(tab.id)} style={{
              flex: 1, padding: "8px 4px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700,
              background: aba === tab.id ? "linear-gradient(135deg,#7c3aed,#3b82f6)" : "rgba(255,255,255,0.07)",
              color: aba === tab.id ? "#fff" : "rgba(255,255,255,0.5)",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
            }}>
              {tab.icon}{tab.label}
            </button>
          ))}
        </div>
      </div>

      {aba === "produtos" && <AbaProdutos onAddToList={handleAddToList} />}
      {aba === "lista" && <AbaLista cartoes={cartoes} />}
      {aba === "historico" && <AbaHistorico cartoes={cartoes} />}
    </div>
  );
}
