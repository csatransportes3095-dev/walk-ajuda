import React, { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Search, Plus, Minus, Star, ShoppingCart, Trash2, Edit3, CheckCircle, X, History, ShoppingBag, Package, ChevronDown, ChevronUp, LayoutList, AlignJustify } from "lucide-react";

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
  "🍎 Hortifruti", "🥩 Açougue", "🐟 Peixaria", "🥖 Padaria", "🍦 Frios", "🥛 Laticínios",
  "🍝 Mercearia", "🌾 Grãos", "🥤 Bebidas", "🍬 Doces", "🧊 Congelados", "🧴 Limpeza",
  "🧻 Higiene", "📦 Outros"
];

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// A compra segue a mesma sequência no catálogo e na lista, evitando que as
// categorias mudem de lugar durante a montagem do carrinho.
const ordemCategoria = (categoria: string) => {
  const index = CATEGORIAS.indexOf(categoria);
  return index >= 0 ? index : CATEGORIAS.length;
};

// ─── Card de produto reutilizável ─────────────────────────────────────────────
function ProdutoCard({ p, inline, setInline, onFav, onEdit, onDelete, onConfirm }: {
  p: any;
  inline: Record<number, { qtd: string; valorCents: number; open: boolean }>;
  setInline: React.Dispatch<React.SetStateAction<Record<number, { qtd: string; valorCents: number; open: boolean }>>>;
  onFav: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onConfirm: () => void;
}) {
  const state = inline[p.id];
  const isOpen = state?.open;
  const [showOptions, setShowOptions] = React.useState(false);

  const fmtCents = (cents: number): string => {
    if (!cents) return "0,00";
    const s = String(cents).padStart(3, "0");
    const intPart = s.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return (intPart || "0") + "," + s.slice(-2);
  };

  const handleValorInput = (raw: string) => {
    const digits = raw.replace(/\D/g, "");
    const cents = parseInt(digits || "0", 10);
    setInline(prev => ({ ...prev, [p.id]: { ...prev[p.id], valorCents: cents } }));
  };

  const toggleOpen = () => {
    setInline(prev => ({
      ...prev,
      [p.id]: prev[p.id]?.open
        ? { ...prev[p.id], open: false }
        : { qtd: "1", valorCents: 0, open: true }
    }));
  };

  return (
    <div style={S.card}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.nome}</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>{p.categoria} · {p.unidade}</div>
        </div>
        <button onClick={onConfirm} style={{
          background: "linear-gradient(135deg,#7c3aed,#3b82f6)", border: "none", borderRadius: 10,
          padding: "7px 10px", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 4, flexShrink: 0
        }}>
          <Plus size={14} /> Adicionar
        </button>
        <button onClick={toggleOpen} aria-label="Ajustar quantidade e valor" style={{
          background: isOpen ? "rgba(124,58,237,0.3)" : "rgba(255,255,255,0.07)",
          border: `1px solid ${isOpen ? "rgba(124,58,237,0.5)" : "rgba(255,255,255,0.12)"}`,
          borderRadius: 10, padding: "7px", color: isOpen ? "#c4b5fd" : "rgba(255,255,255,0.65)",
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
        }}>
          {isOpen ? <X size={14} /> : <Edit3 size={14} />}
        </button>
        <button onClick={() => setShowOptions(v => !v)} aria-label="Opções do produto" style={{ background: "none", border: "none", cursor: "pointer", padding: 5, color: "rgba(255,255,255,0.5)", fontSize: 18, lineHeight: 1, flexShrink: 0 }}>⋮</button>
      </div>

      {showOptions && (
        <div style={{ marginTop: 10, display: "flex", gap: 8, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <button onClick={onFav} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 9, padding: "7px 10px", color: "rgba(255,255,255,0.75)", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}><Star size={13} color={p.favorito ? "#fbbf24" : "currentColor"} fill={p.favorito ? "#fbbf24" : "none"} /> {p.favorito ? "Favorito" : "Favoritar"}</button>
          <button onClick={onEdit} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 9, padding: "7px 10px", color: "rgba(255,255,255,0.75)", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}><Edit3 size={13} /> Editar produto</button>
          <button onClick={onDelete} style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 9, padding: "7px 10px", color: "#fca5a5", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}><Trash2 size={13} /> Excluir</button>
        </div>
      )}

      {isOpen && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#c4b5fd", marginBottom: 8 }}>Ajustar quantidade e valor antes de adicionar</div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>QTDE ({p.unidade})</div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <button onClick={() => setInline(prev => ({ ...prev, [p.id]: { ...prev[p.id], qtd: String(Math.max(1, parseFloat(prev[p.id]?.qtd || "1") - 1)) } }))}
                  style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(255,255,255,0.08)", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Minus size={14} />
                </button>
                <input type="number" value={state?.qtd ?? "1"}
                  onChange={e => setInline(prev => ({ ...prev, [p.id]: { ...prev[p.id], qtd: e.target.value } }))}
                  style={{ ...S.input, textAlign: "center", padding: "6px 4px", borderRadius: 8, fontSize: 15, fontWeight: 700 }} />
                <button onClick={() => setInline(prev => ({ ...prev, [p.id]: { ...prev[p.id], qtd: String(parseFloat(prev[p.id]?.qtd || "1") + 1) } }))}
                  style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(255,255,255,0.08)", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Plus size={14} />
                </button>
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>VALOR (R$)</div>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "rgba(255,255,255,0.5)", pointerEvents: "none" }}>R$</span>
                <input type="tel" inputMode="numeric"
                  value={fmtCents(state?.valorCents ?? 0)}
                  onChange={e => handleValorInput(e.target.value)}
                  style={{ ...S.input, padding: "8px 10px 8px 30px", borderRadius: 8, fontWeight: 700, fontSize: 15 }} />
              </div>
            </div>
            {(state?.valorCents ?? 0) > 0 && (
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>TOTAL</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: "#10b981" }}>
                  {fmt(parseFloat(state?.qtd || "1") * ((state?.valorCents ?? 0) / 100))}
                </div>
              </div>
            )}
          </div>
          <button onClick={onConfirm} style={{ ...S.btn("linear-gradient(135deg,#7c3aed,#3b82f6)"), width: "100%", justifyContent: "center", marginTop: 10, padding: "10px" }}>
            <ShoppingCart size={16} /> Adicionar com ajustes
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Aba Produtos ─────────────────────────────────────────────────────────────
function AbaProdutos({ onAddToList }: { onAddToList: (p: any, qtd: number, valor: number | null) => void }) {
  const [search, setSearch] = useState("");
  const [modo, setModo] = useState<"todos" | "categoria">("categoria");
  const [showAdd, setShowAdd] = useState(false);
  const [editingProduto, setEditingProduto] = useState<any | null>(null);
  const [nome, setNome] = useState("");
  const [cat, setCat] = useState("");
  const [unid, setUnid] = useState("un");
  const [inline, setInline] = useState<Record<number, { qtd: string; valorCents: number; open: boolean }>>({}); 
  const [suggestion, setSuggestion] = useState<{ categoria: string; unidade: string } | null>(null);
  const [suggestionLoading, setSuggestionLoading] = useState(false);

  const { data: produtos = [], refetch } = trpc.mercado.produtos.list.useQuery({ search: search || undefined }, { refetchOnWindowFocus: false });
  const suggestMut = trpc.mercado.produtos.suggestCategory.useMutation();
  const createMut = trpc.mercado.produtos.create.useMutation({ onSuccess: () => { refetch(); setShowAdd(false); setNome(""); setCat(""); setUnid("un"); toast.success("Produto criado!"); } });
  const updateMut = trpc.mercado.produtos.update.useMutation({ onSuccess: () => { refetch(); setEditingProduto(null); toast.success("Atualizado!"); } });
  const deleteMut = trpc.mercado.produtos.delete.useMutation({ onSuccess: () => { refetch(); toast.success("Removido!"); } });
  const seedMut = trpc.mercado.produtos.seed.useMutation({ onSuccess: (r: any) => { refetch(); toast.success(`${r.criados} produtos adicionados!`); } });

  const openEdit = (p: any) => { setEditingProduto(p); setNome(p.nome); setCat(p.categoria || ""); setUnid(p.unidade || "un"); };

  const confirmAdd = (p: any) => {
    const state = inline[p.id];
    const qtd = parseFloat(state?.qtd || "1") || 1;
    const valor = state?.valorCents ? state.valorCents / 100 : null;
    onAddToList(p, qtd, valor);
    setInline(prev => ({ ...prev, [p.id]: { ...prev[p.id], open: false } }));
  };

  const maisComprados = produtos.filter((p: any) => p.vezesComprado > 0).sort((a: any, b: any) => b.vezesComprado - a.vezesComprado).slice(0, 6);

  // Sugestão automática quando busca retorna 0 resultados
  useEffect(() => {
    if (search.trim().length < 2) { setSuggestion(null); return; }
    if (produtos.length > 0) { setSuggestion(null); return; }
    const timer = setTimeout(async () => {
      setSuggestionLoading(true);
      try {
        const s = await suggestMut.mutateAsync({ nome: search.trim() });
        setSuggestion(s);
      } catch { setSuggestion({ categoria: "📦 Outros", unidade: "un" }); }
      finally { setSuggestionLoading(false); }
    }, 600);
    return () => clearTimeout(timer);
  }, [search, produtos.length]);

  const cardProps = (p: any) => ({
    p, inline, setInline,
    onFav: () => updateMut.mutate({ id: p.id, favorito: !p.favorito }),
    onEdit: () => openEdit(p),
    onDelete: () => { if (confirm(`Excluir "${p.nome}"?`)) deleteMut.mutate({ id: p.id }); },
    onConfirm: () => confirmAdd(p),
  });

  return (
    <div style={{ padding: "12px 16px" }}>
      {/* Pesquisa */}
      <div style={{ position: "relative", marginBottom: 10 }}>
        <Search size={15} color="rgba(255,255,255,0.4)" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Pesquisar produto..." style={{ ...S.input, paddingLeft: 36, borderRadius: 14, padding: "11px 14px 11px 36px" }} />
      </div>

      {/* Toggle modo de visualização */}
      {!search && (
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          <button onClick={() => setModo("categoria")} style={{
            flex: 1, padding: "7px 8px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700,
            background: modo === "categoria" ? "linear-gradient(135deg,#7c3aed,#3b82f6)" : "rgba(255,255,255,0.07)",
            color: modo === "categoria" ? "#fff" : "rgba(255,255,255,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
          }}>
            <LayoutList size={13} /> Por Categoria
          </button>
          <button onClick={() => setModo("todos")} style={{
            flex: 1, padding: "7px 8px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700,
            background: modo === "todos" ? "linear-gradient(135deg,#7c3aed,#3b82f6)" : "rgba(255,255,255,0.07)",
            color: modo === "todos" ? "#fff" : "rgba(255,255,255,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
          }}>
            <AlignJustify size={13} /> Todos
          </button>
        </div>
      )}

      {/* Mais comprados */}
      {!search && maisComprados.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>🔥 Mais comprados</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {maisComprados.map((p: any) => (
              <button key={p.id} onClick={() => confirmAdd(p)}
                style={{ background: "rgba(124,58,237,0.2)", border: "1px solid rgba(124,58,237,0.3)", borderRadius: 20, padding: "5px 12px", color: "#c4b5fd", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                + {p.nome}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Modo busca — lista simples */}
      {search && (
        <>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>{produtos.length} resultado(s)</div>
          {produtos.map((p: any) => <ProdutoCard key={p.id} {...cardProps(p)} />)}
        </>
      )}

      {/* Modo TODOS */}
      {!search && modo === "todos" && (
        <>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Todos os Produtos ({produtos.length})</div>
          {produtos.map((p: any) => <ProdutoCard key={p.id} {...cardProps(p)} />)}
        </>
      )}

      {/* Modo POR CATEGORIA */}
      {!search && modo === "categoria" && (
        <>
          {CATEGORIAS.map(cat => {
            const grupo = produtos
              .filter((p: any) => p.categoria === cat)
              .sort((a: any, b: any) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));
            if (grupo.length === 0) return null;
            return (
              <div key={cat} style={{ marginBottom: 4 }}>
                <div style={{
                  background: "linear-gradient(135deg, rgba(124,58,237,0.25) 0%, rgba(59,130,246,0.15) 100%)",
                  border: "1px solid rgba(124,58,237,0.35)",
                  borderRadius: 12,
                  padding: "8px 14px",
                  marginBottom: 8,
                  marginTop: 14,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}>
                  <span style={{ fontWeight: 800, fontSize: 13, letterSpacing: 0.5, color: "#e2d9f3" }}>{cat}</span>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.08)", borderRadius: 20, padding: "2px 8px" }}>{grupo.length}</span>
                </div>
                {grupo.map((p: any) => <ProdutoCard key={p.id} {...cardProps(p)} />)}
              </div>
            );
          })}
          {/* Produtos sem categoria reconhecida */}
          {(() => {
            const semCat = produtos
              .filter((p: any) => !p.categoria || !CATEGORIAS.includes(p.categoria))
              .sort((a: any, b: any) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));
            if (semCat.length === 0) return null;
            return (
              <div style={{ marginBottom: 4 }}>
                <div style={{
                  background: "linear-gradient(135deg, rgba(100,100,120,0.25) 0%, rgba(80,80,100,0.15) 100%)",
                  border: "1px solid rgba(150,150,180,0.25)",
                  borderRadius: 12,
                  padding: "8px 14px",
                  marginBottom: 8,
                  marginTop: 14,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}>
                  <span style={{ fontWeight: 800, fontSize: 13, letterSpacing: 0.5, color: "#e2d9f3" }}>📦 Outros</span>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.08)", borderRadius: 20, padding: "2px 8px" }}>{semCat.length}</span>
                </div>
                {semCat.map((p: any) => <ProdutoCard key={p.id} {...cardProps(p)} />)}
              </div>
            );
          })()}
        </>
      )}

      {produtos.length === 0 && (
        <div style={{ textAlign: "center", padding: "24px 0", color: "rgba(255,255,255,0.3)" }}>
          {!search && <Package size={40} style={{ margin: "0 auto 12px", display: "block" }} />}
          {search && !suggestion && !suggestionLoading && (
            <Package size={40} style={{ margin: "0 auto 12px", display: "block" }} />
          )}
          {search && suggestionLoading && (
            <div style={{ marginBottom: 12, fontSize: 13, color: "rgba(255,255,255,0.5)" }}>🤖 Identificando categoria...</div>
          )}
          {search && suggestion && !suggestionLoading && (
            <div style={{ background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.4)", borderRadius: 16, padding: "16px", textAlign: "left", marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 8 }}>Produto não encontrado. Adicionar?</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: "#fff" }}>{search.trim()}</div>
                  <div style={{ fontSize: 12, color: "#a78bfa", marginTop: 2 }}>🤖 {suggestion.categoria} · {suggestion.unidade}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={async () => {
                    const result = await createMut.mutateAsync({ nome: search.trim(), categoria: suggestion.categoria, unidade: suggestion.unidade });
                    const novoProduto = { id: result.id, nome: search.trim(), categoria: suggestion.categoria, unidade: suggestion.unidade, favorito: 0, vezesComprado: 0 };
                    onAddToList(novoProduto, 1, null);
                    setSearch("");
                    setSuggestion(null);
                    toast.success(`"${search.trim()}" adicionado à lista!`);
                  }}
                  disabled={createMut.isPending}
                  style={{ ...S.btn("linear-gradient(135deg,#7c3aed,#3b82f6)"), flex: 1, justifyContent: "center", fontSize: 13 }}
                >
                  <CheckCircle size={15} /> {createMut.isPending ? "Adicionando..." : "✓ Confirmar e Adicionar"}
                </button>
                <button
                  onClick={() => { setNome(search.trim()); setCat(suggestion.categoria); setUnid(suggestion.unidade); setShowAdd(true); }}
                  style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 14, padding: "12px 14px", color: "rgba(255,255,255,0.7)", fontSize: 13, cursor: "pointer" }}
                >
                  ✏️
                </button>
              </div>
            </div>
          )}
          {!search && <div style={{ marginBottom: 16 }}>Nenhum produto cadastrado</div>}
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
    return Array.from(map.entries()).sort(([a], [b]) => {
      const ordem = ordemCategoria(a) - ordemCategoria(b);
      return ordem !== 0 ? ordem : a.localeCompare(b);
    });
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
      <div style={{ background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.3)", borderRadius: 16, padding: "12px 16px", marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1 }}>Total da lista</div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>{fmt(totalGeral)}</div>
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{lista.length} produto(s)</div>
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
                <div key={item.id} style={S.card}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{item.nomeProduto}</div>
                      <div style={{ display: "flex", gap: 8, marginTop: 4, alignItems: "center" }}>
                        <button onClick={() => updateMut.mutate({ id: item.id, quantidade: Math.max(1, qtd - 1) })}
                          style={{ width: 24, height: 24, borderRadius: 6, background: "rgba(255,255,255,0.08)", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Minus size={11} />
                        </button>
                        <span style={{ fontSize: 13, fontWeight: 700, minWidth: 20, textAlign: "center" }}>{qtd % 1 === 0 ? qtd : qtd.toFixed(1)}</span>
                        <button onClick={() => updateMut.mutate({ id: item.id, quantidade: qtd + 1 })}
                          style={{ width: 24, height: 24, borderRadius: 6, background: "rgba(255,255,255,0.08)", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Plus size={11} />
                        </button>
                        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{item.unidade}</span>
                        {preco > 0 && <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>× {fmt(preco)}</span>}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      {total > 0 && <div style={{ fontSize: 15, fontWeight: 800 }}>{fmt(total)}</div>}
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
        <CheckCircle size={18} /> Finalizar — {fmt(totalGeral)}
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
            <button onClick={() => finalizarMut.mutate({ mercado: mercado || undefined, cartaoId })} disabled={finalizarMut.isPending}
              style={{ ...S.btn("linear-gradient(135deg,#10b981,#059669)"), width: "100%", justifyContent: "center" }}>
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
  const deleteMut = trpc.mercado.historico.delete.useMutation({ onSuccess: () => { refetch(); toast.success("Excluído!"); } });

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
      if (data.duplicate) toast.info("Este produto já está na sua lista. Ajuste a quantidade na aba Lista.");
      else toast.success("Adicionado à lista! Continue escolhendo seus produtos.");
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
