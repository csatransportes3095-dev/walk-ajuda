import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Search, Plus, Star, ShoppingCart, Trash2, Edit3, CheckCircle, X, History, ShoppingBag, TrendingUp, Package, ChevronDown, ChevronUp } from "lucide-react";

const BG = "linear-gradient(180deg, #0a0a0f 0%, #0d0a1a 100%)";
const S: Record<string, any> = {
  page: { minHeight: "100dvh", background: BG, fontFamily: "'DM Sans','Inter',sans-serif", paddingBottom: 100, color: "#fff" },
  header: { background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)", padding: "16px 16px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)" },
  input: { width: "100%", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, padding: "12px 14px", color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box" as const },
  btn: (bg: string) => ({ background: bg, border: "none", borderRadius: 14, padding: "12px 18px", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }),
  card: { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "14px 16px", marginBottom: 10 },
};

const CATEGORIAS = ["🥩 Açougue","🍎 Hortifruti","🥛 Laticínios","🥖 Padaria","🧴 Limpeza","🧻 Higiene","🍝 Mercearia","🥤 Bebidas","🍦 Frios","🐟 Peixaria","🌾 Grãos","🍬 Doces","🧊 Congelados","📦 Outros"];
const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// ─── Aba Produtos ─────────────────────────────────────────────────────────────
function AbaProdutos({ onAddToList }: { onAddToList: (p: any) => void }) {
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [nome, setNome] = useState("");
  const [cat, setCat] = useState("");
  const [unid, setUnid] = useState("un");

  const { data: produtos = [], refetch } = trpc.mercado.produtos.list.useQuery({ search: search || undefined }, { refetchOnWindowFocus: false });
  const createMut = trpc.mercado.produtos.create.useMutation({ onSuccess: () => { refetch(); setShowAdd(false); setNome(""); setCat(""); setUnid("un"); toast.success("Produto criado!"); } });
  const updateMut = trpc.mercado.produtos.update.useMutation({ onSuccess: () => refetch() });
  const deleteMut = trpc.mercado.produtos.delete.useMutation({ onSuccess: () => { refetch(); toast.success("Removido!"); } });

  const favoritos = produtos.filter((p: any) => p.favorito);
  const maisComprados = produtos.filter((p: any) => p.vezesComprado > 0).sort((a: any, b: any) => b.vezesComprado - a.vezesComprado).slice(0, 5);

  return (
    <div style={{ padding: "12px 16px" }}>
      {/* Pesquisa */}
      <div style={{ position: "relative", marginBottom: 12 }}>
        <Search size={16} color="rgba(255,255,255,0.4)" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Pesquisar produto..." style={{ ...S.input, paddingLeft: 36 }} />
      </div>

      {/* Mais comprados */}
      {!search && maisComprados.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>🔥 Mais Comprados</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {maisComprados.map((p: any) => (
              <button key={p.id} onClick={() => onAddToList(p)} style={{ background: "rgba(124,58,237,0.2)", border: "1px solid rgba(124,58,237,0.3)", borderRadius: 20, padding: "6px 12px", color: "#a78bfa", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                {p.nome}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Favoritos */}
      {!search && favoritos.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>⭐ Favoritos</div>
          {favoritos.map((p: any) => <ProdutoCard key={p.id} p={p} onAdd={() => onAddToList(p)} onFav={() => updateMut.mutate({ id: p.id, favorito: !p.favorito })} onDelete={() => deleteMut.mutate({ id: p.id })} />)}
        </div>
      )}

      {/* Lista geral */}
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
        {search ? `${produtos.length} resultado(s)` : "Todos os Produtos"}
      </div>
      {produtos.filter((p: any) => !p.favorito || search).map((p: any) => (
        <ProdutoCard key={p.id} p={p} onAdd={() => onAddToList(p)} onFav={() => updateMut.mutate({ id: p.id, favorito: !p.favorito })} onDelete={() => deleteMut.mutate({ id: p.id })} />
      ))}
      {produtos.length === 0 && (
        <div style={{ textAlign: "center", padding: "32px 0", color: "rgba(255,255,255,0.3)" }}>
          <Package size={40} style={{ margin: "0 auto 12px", display: "block" }} />
          <div>{search ? "Nenhum produto encontrado" : "Nenhum produto cadastrado"}</div>
        </div>
      )}

      {/* Botão adicionar */}
      <button onClick={() => setShowAdd(true)} style={{ ...S.btn("linear-gradient(135deg,#7c3aed,#3b82f6)"), width: "100%", justifyContent: "center", marginTop: 16 }}>
        <Plus size={18} /> Novo Produto
      </button>

      {/* Sheet novo produto */}
      {showAdd && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", alignItems: "flex-end" }}>
          <div style={{ background: "#0f0f1a", borderRadius: "24px 24px 0 0", padding: 24, width: "100%", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
              <span style={{ fontWeight: 700, fontSize: 18 }}>Novo Produto</span>
              <button onClick={() => setShowAdd(false)} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer" }}><X size={20} /></button>
            </div>
            <label style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 1 }}>NOME</label>
            <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Arroz Integral" style={{ ...S.input, marginTop: 6, marginBottom: 12 }} />
            <label style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 1 }}>CATEGORIA</label>
            <select value={cat} onChange={e => setCat(e.target.value)} style={{ ...S.input, marginTop: 6, marginBottom: 12, appearance: "none" as any }}>
              <option value="">Selecione...</option>
              {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <label style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 1 }}>UNIDADE</label>
            <select value={unid} onChange={e => setUnid(e.target.value)} style={{ ...S.input, marginTop: 6, marginBottom: 20, appearance: "none" as any }}>
              {["un","kg","g","L","mL","cx","pct","dz","m"].map(u => <option key={u} value={u}>{u}</option>)}
            </select>
            <button onClick={() => { if (!nome.trim()) return; createMut.mutate({ nome: nome.trim(), categoria: cat || undefined, unidade: unid }); }} disabled={createMut.isPending} style={{ ...S.btn("linear-gradient(135deg,#7c3aed,#3b82f6)"), width: "100%", justifyContent: "center" }}>
              {createMut.isPending ? "Salvando..." : "Criar Produto"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ProdutoCard({ p, onAdd, onFav, onDelete }: { p: any; onAdd: () => void; onFav: () => void; onDelete: () => void }) {
  return (
    <div style={{ ...S.card, display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{p.nome}</div>
        {p.categoria && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{p.categoria} · {p.unidade}</div>}
        {p.precoUltimo && <div style={{ fontSize: 12, color: "#10b981", marginTop: 2 }}>Último: {fmt(parseFloat(p.precoUltimo))}</div>}
      </div>
      <button onClick={onFav} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
        <Star size={16} color={p.favorito ? "#fbbf24" : "rgba(255,255,255,0.3)"} fill={p.favorito ? "#fbbf24" : "none"} />
      </button>
      <button onClick={onDelete} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
        <Trash2 size={14} color="rgba(239,68,68,0.6)" />
      </button>
      <button onClick={onAdd} style={{ ...S.btn("rgba(124,58,237,0.3)"), padding: "8px 12px", fontSize: 12, borderRadius: 10, border: "1px solid rgba(124,58,237,0.4)" }}>
        <Plus size={14} /> Lista
      </button>
    </div>
  );
}

// ─── Aba Minha Lista ──────────────────────────────────────────────────────────
function AbaLista({ cartoes }: { cartoes: any[] }) {
  const [showFinalizar, setShowFinalizar] = useState(false);
  const [mercado, setMercado] = useState("");
  const [cartaoId, setCartaoId] = useState<number | undefined>();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editData, setEditData] = useState<any>({});

  const { data: lista = [], refetch } = trpc.mercado.lista.get.useQuery(undefined, { refetchOnWindowFocus: false });
  const updateMut = trpc.mercado.lista.update.useMutation({ onSuccess: () => { refetch(); setEditingId(null); } });
  const removeMut = trpc.mercado.lista.remove.useMutation({ onSuccess: () => refetch() });
  const finalizarMut = trpc.mercado.lista.finalizar.useMutation({
    onSuccess: (data) => {
      refetch();
      setShowFinalizar(false);
      toast.success(`Compra finalizada! Total: ${fmt(data.totalCaixa)}`);
      if (data.diferenca > 0.01) toast.error(`⚠️ Diferença de ${fmt(data.diferenca)} encontrada!`);
    }
  });

  // Agrupar por categoria
  const grupos = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const item of lista) {
      const cat = (item as any).categoria || "📦 Outros";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(item);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [lista]);

  const totalPrateleira = lista.reduce((s: number, i: any) => s + (parseFloat(i.precoPrateleira || "0") * parseFloat(i.quantidade || "1")), 0);
  const totalCaixa = lista.reduce((s: number, i: any) => s + (parseFloat(i.precoCaixa || i.precoPrateleira || "0") * parseFloat(i.quantidade || "1")), 0);
  const diferenca = totalCaixa - totalPrateleira;
  const qtdProdutos = lista.length;

  if (lista.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "48px 24px", color: "rgba(255,255,255,0.3)" }}>
        <ShoppingCart size={48} style={{ margin: "0 auto 16px", display: "block" }} />
        <div style={{ fontSize: 18, fontWeight: 700, color: "rgba(255,255,255,0.6)", marginBottom: 8 }}>Lista vazia</div>
        <div style={{ fontSize: 14 }}>Vá em "Produtos" e adicione itens à lista</div>
      </div>
    );
  }

  return (
    <div style={{ padding: "12px 16px" }}>
      {/* Totais em tempo real */}
      <div style={{ background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.3)", borderRadius: 16, padding: "14px 16px", marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{qtdProdutos} produto(s)</span>
          {diferenca > 0.01 && <span style={{ fontSize: 12, color: "#ef4444", fontWeight: 700 }}>⚠ Diferença: {fmt(diferenca)}</span>}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1 }}>Estimado</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{fmt(totalPrateleira)}</div>
          </div>
          {totalCaixa !== totalPrateleira && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1 }}>Cobrado</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: diferenca > 0 ? "#ef4444" : "#10b981" }}>{fmt(totalCaixa)}</div>
            </div>
          )}
        </div>
      </div>

      {/* Itens agrupados por categoria */}
      {grupos.map(([cat, itens]) => (
        <div key={cat} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", fontWeight: 700, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8 }}>{cat}</div>
          {itens.map((item: any) => (
            <div key={item.id} style={{ ...S.card }}>
              {editingId === item.id ? (
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 10 }}>{item.nomeProduto}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>QTDE</div>
                      <input type="number" value={editData.quantidade ?? item.quantidade} onChange={e => setEditData({ ...editData, quantidade: parseFloat(e.target.value) })} style={{ ...S.input, padding: "8px 10px" }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>UNIDADE</div>
                      <select value={editData.unidade ?? item.unidade} onChange={e => setEditData({ ...editData, unidade: e.target.value })} style={{ ...S.input, padding: "8px 10px", appearance: "none" as any }}>
                        {["un","kg","g","L","mL","cx","pct","dz","m"].map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>PREÇO PRATELEIRA</div>
                      <input type="number" step="0.01" value={editData.precoPrateleira ?? item.precoPrateleira ?? ""} onChange={e => setEditData({ ...editData, precoPrateleira: parseFloat(e.target.value) })} style={{ ...S.input, padding: "8px 10px" }} placeholder="R$ 0,00" />
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>PREÇO CAIXA</div>
                      <input type="number" step="0.01" value={editData.precoCaixa ?? item.precoCaixa ?? ""} onChange={e => setEditData({ ...editData, precoCaixa: parseFloat(e.target.value) })} style={{ ...S.input, padding: "8px 10px" }} placeholder="R$ 0,00" />
                    </div>
                  </div>
                  <input value={editData.observacoes ?? item.observacoes ?? ""} onChange={e => setEditData({ ...editData, observacoes: e.target.value })} placeholder="Observações..." style={{ ...S.input, marginBottom: 10 }} />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => { updateMut.mutate({ id: item.id, ...editData }); }} style={{ ...S.btn("linear-gradient(135deg,#7c3aed,#3b82f6)"), flex: 1, justifyContent: "center" }}>Salvar</button>
                    <button onClick={() => { setEditingId(null); setEditData({}); }} style={{ ...S.btn("rgba(255,255,255,0.1)"), flex: 1, justifyContent: "center" }}>Cancelar</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{item.nomeProduto}</div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
                      {parseFloat(item.quantidade || "1")} {item.unidade}
                      {item.precoPrateleira && ` · Prateleira: ${fmt(parseFloat(item.precoPrateleira))}`}
                    </div>
                    {item.precoCaixa && (
                      <div style={{ fontSize: 12, marginTop: 2 }}>
                        Caixa: <span style={{ color: parseFloat(item.precoCaixa) > parseFloat(item.precoPrateleira || "0") ? "#ef4444" : "#10b981", fontWeight: 700 }}>{fmt(parseFloat(item.precoCaixa))}</span>
                        {parseFloat(item.precoCaixa) > parseFloat(item.precoPrateleira || "0") && <span style={{ color: "#ef4444", fontSize: 11 }}> 🔴 Diferença!</span>}
                        {parseFloat(item.precoCaixa) <= parseFloat(item.precoPrateleira || "0") && <span style={{ color: "#10b981", fontSize: 11 }}> 🟢 OK</span>}
                      </div>
                    )}
                    {item.observacoes && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>{item.observacoes}</div>}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", minWidth: 70, textAlign: "right" }}>
                    {fmt(parseFloat(item.precoCaixa || item.precoPrateleira || "0") * parseFloat(item.quantidade || "1"))}
                  </div>
                  <button onClick={() => { setEditingId(item.id); setEditData({}); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
                    <Edit3 size={14} color="rgba(255,255,255,0.4)" />
                  </button>
                  <button onClick={() => removeMut.mutate({ id: item.id })} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
                    <Trash2 size={14} color="rgba(239,68,68,0.5)" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      ))}

      {/* Botão finalizar */}
      <button onClick={() => setShowFinalizar(true)} style={{ ...S.btn("linear-gradient(135deg,#10b981,#059669)"), width: "100%", justifyContent: "center", marginTop: 8 }}>
        <CheckCircle size={18} /> Finalizar Compra
      </button>

      {/* Sheet finalizar */}
      {showFinalizar && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", alignItems: "flex-end" }}>
          <div style={{ background: "#0f0f1a", borderRadius: "24px 24px 0 0", padding: 24, width: "100%", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
              <span style={{ fontWeight: 700, fontSize: 18 }}>✅ Finalizar Compra</span>
              <button onClick={() => setShowFinalizar(false)} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer" }}><X size={20} /></button>
            </div>
            <div style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 12, padding: "12px 14px", marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{qtdProdutos} produtos · Total estimado</div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{fmt(totalPrateleira)}</div>
            </div>
            <label style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 1 }}>MERCADO (opcional)</label>
            <input value={mercado} onChange={e => setMercado(e.target.value)} placeholder="Ex: Carrefour, Extra..." style={{ ...S.input, marginTop: 6, marginBottom: 12 }} />
            <label style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 1 }}>CARTÃO UTILIZADO (opcional)</label>
            <select value={cartaoId ?? ""} onChange={e => setCartaoId(e.target.value ? Number(e.target.value) : undefined)} style={{ ...S.input, marginTop: 6, marginBottom: 20, appearance: "none" as any }}>
              <option value="">Nenhum</option>
              {cartoes.map((c: any) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
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
  const { data: historico = [] } = trpc.mercado.historico.list.useQuery(undefined, { refetchOnWindowFocus: false });
  const [expandedId, setExpandedId] = useState<number | null>(null);

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
        const dif = parseFloat(h.diferenca || "0");
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
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{fmt(parseFloat(h.totalCaixa || h.totalPrateleira || "0"))}</div>
                {Math.abs(dif) > 0.01 && (
                  <div style={{ fontSize: 11, color: dif > 0 ? "#ef4444" : "#10b981" }}>
                    {dif > 0 ? `🔴 +${fmt(dif)}` : `🟢 ${fmt(dif)}`}
                  </div>
                )}
              </div>
            </div>
            <button onClick={() => setExpandedId(isExpanded ? null : h.id)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 4, padding: 0 }}>
              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {itens.length} itens
            </button>
            {isExpanded && (
              <div style={{ marginTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 10 }}>
                {itens.map((item: any, i: number) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <div>
                      <div style={{ fontSize: 13 }}>{item.nomeProduto}</div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{parseFloat(item.quantidade || "1")} {item.unidade}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      {item.precoPrateleira && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Prat: {fmt(parseFloat(item.precoPrateleira))}</div>}
                      {item.precoCaixa && <div style={{ fontSize: 12, fontWeight: 700, color: parseFloat(item.precoCaixa) > parseFloat(item.precoPrateleira || "0") ? "#ef4444" : "#10b981" }}>Cx: {fmt(parseFloat(item.precoCaixa))}</div>}
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
    onSuccess: (data) => {
      utils.mercado.lista.get.invalidate();
      if (data.duplicate) toast.info("Produto já está na lista!");
      else { toast.success("Adicionado à lista! 🛒"); setAba("lista"); }
    }
  });

  const handleAddToList = (p: any) => {
    addToListMut.mutate({
      produtoId: p.id,
      nomeProduto: p.nome,
      categoria: p.categoria || undefined,
      unidade: p.unidade || "un",
      precoPrateleira: p.precoUltimo ? parseFloat(p.precoUltimo) : undefined,
    });
  };

  const { data: listaCount } = trpc.mercado.lista.get.useQuery(undefined, { refetchOnWindowFocus: false });
  const qtdLista = listaCount?.length || 0;

  return (
    <div style={S.page}>
      {/* Header */}
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
        {/* Abas */}
        <div style={{ display: "flex", gap: 6 }}>
          {([
            { id: "produtos", label: "Produtos", icon: <Package size={14} /> },
            { id: "lista", label: `Minha Lista${qtdLista > 0 ? ` (${qtdLista})` : ""}`, icon: <ShoppingCart size={14} /> },
            { id: "historico", label: "Histórico", icon: <History size={14} /> },
          ] as const).map(tab => (
            <button key={tab.id} onClick={() => setAba(tab.id)} style={{
              flex: 1, padding: "8px 6px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700,
              background: aba === tab.id ? "linear-gradient(135deg,#7c3aed,#3b82f6)" : "rgba(255,255,255,0.07)",
              color: aba === tab.id ? "#fff" : "rgba(255,255,255,0.5)",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
            }}>
              {tab.icon}{tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Conteúdo */}
      {aba === "produtos" && <AbaProdutos onAddToList={handleAddToList} />}
      {aba === "lista" && <AbaLista cartoes={cartoes} />}
      {aba === "historico" && <AbaHistorico cartoes={cartoes} />}
    </div>
  );
}
