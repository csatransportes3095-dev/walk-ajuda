import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, Edit3, CheckCircle, ShoppingBag, Calendar, TrendingUp, AlertTriangle, CreditCard, Repeat, X, ChevronDown, Pencil, ChevronRight } from "lucide-react";
import { BandeiraLogo } from "@/components/BandeiraLogo";

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

const ACCENT: Record<string, string> = {
  purple: "#6750A4", blue: "#1565C0", red: "#C62828", green: "#2E7D32",
  orange: "#E65100", pink: "#AD1457", teal: "#00695C", indigo: "#283593",
};

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
}

function diasParaVencer(dia: number) {
  const hoje = new Date();
  // Usa fim do dia (23:59:59) para não mostrar "vencida" antes de acabar o dia
  // NÃO avança para o próximo mês — retorna negativo quando já venceu
  const venc = new Date(hoje.getFullYear(), hoje.getMonth(), dia, 23, 59, 59);
  return Math.ceil((venc.getTime() - hoje.getTime()) / 86400000);
}

// Card de compra parcelada — estado local de expandido
function ParcelamentoCard({
  pid, parcelas, accent, id,
  cancelarParcelamentoMutation, excluirParcelamentoTudoMutation,
  marcarParcelaPagaMutation, cancelarPagamentoParcelaMutation,
  editarDataMutation, editarCompra,
  dataInicioParcelamento, numParcelasTotal,
}: {
  pid: number;
  parcelas: any[];
  accent: string;
  id: number;
  cancelarParcelamentoMutation: any;
  excluirParcelamentoTudoMutation: any;
  marcarParcelaPagaMutation: any;
  cancelarPagamentoParcelaMutation: any;
  editarDataMutation: any;
  editarCompra: any;
  dataInicioParcelamento?: string;
  numParcelasTotal?: number;
}) {
  const [expandido, setExpandido] = useState(false);
  const [showEditarData, setShowEditarData] = useState(false);
  const [showEditarCompra, setShowEditarCompra] = useState(false);
  const primeiraP = parcelas[0];
  const nomeProduto = (primeiraP.descricao as string).replace(/ \(\d+\/\d+\)$/, "");
  const totalParcelas = (primeiraP as any).totalParcelas ?? parcelas.length;
  const valorParcela = Number(primeiraP.valor);
  const valorTotal = valorParcela * totalParcelas;
  const pagas = parcelas.filter((p: any) => p.paga === 1).length;
  const responsavel = (primeiraP as any).responsavel;

  return (
    <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 16, marginBottom: 10, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", overflow: "hidden" }}>
      {/* Cabeçalho clicável */}
      <div onClick={() => setExpandido(e => !e)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px", cursor: "pointer" }}>
        <div style={{ width: 44, height: 44, borderRadius: 22, background: `${accent}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Repeat size={20} color={accent} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nomeProduto}</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>
            {pagas}/{totalParcelas} parcelas pagas · {fmt(valorParcela)}/mês
          </div>
          {responsavel && (
            <span style={{ fontSize: 11, color: "#fff", background: `linear-gradient(135deg, ${accent}, ${accent}cc)`, borderRadius: 20, padding: "1px 8px", fontWeight: 600, opacity: 0.85, display: "inline-block", marginTop: 3 }}>👤 {responsavel}</span>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{fmt(valorTotal)}</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: accent, background: `${accent}15`, borderRadius: 20, padding: "2px 8px" }}>{pagas}/{totalParcelas}x</span>
          <ChevronDown size={16} color="#79747E" style={{ transform: expandido ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 200ms" }} />
        </div>
      </div>

      {/* Barra de progresso */}
      <div style={{ padding: "0 14px 10px" }}>
        <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${Math.round((pagas / totalParcelas) * 100)}%`, borderRadius: 2, background: `linear-gradient(135deg, ${accent}, ${accent}cc)`, transition: "width 600ms ease" }} />
        </div>
      </div>

      {/* Botões de ação do parcelamento */}
      <div style={{ padding: "0 14px 12px", display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <button
          onClick={e => { e.stopPropagation(); setShowEditarCompra(true); }}
          style={{ display: "flex", alignItems: "center", gap: 4, height: 28, padding: "0 12px", borderRadius: 50, border: `1px solid ${accent}40`, background: `${accent}10`, color: accent, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "'Roboto',sans-serif" }}>
          <Edit3 size={11} /> Editar compra
        </button>
        <button
          onClick={e => { e.stopPropagation(); setShowEditarData(true); }}
          style={{ display: "flex", alignItems: "center", gap: 4, height: 28, padding: "0 12px", borderRadius: 50, border: `1px solid ${accent}40`, background: `${accent}10`, color: accent, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "'Roboto',sans-serif" }}>
          <Pencil size={11} /> Editar data
        </button>
        <button
          onClick={e => { e.stopPropagation(); if (confirm(`Cancelar as parcelas não pagas de "${nomeProduto}"?\nAs parcelas já pagas serão mantidas.`)) cancelarParcelamentoMutation.mutate({ id: pid, cartaoId: id }); }}
          disabled={cancelarParcelamentoMutation.isPending}
          style={{ display: "flex", alignItems: "center", gap: 4, height: 28, padding: "0 12px", borderRadius: 50, border: "1px solid #FFE0B2", background: "#FFF3E0", color: "#f97316", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "'Roboto',sans-serif" }}>
          <X size={11} /> Cancelar futuras
        </button>
        <button
          onClick={e => { e.stopPropagation(); if (confirm(`Excluir TODA a compra "${nomeProduto}"?\nRemove TODAS as parcelas, inclusive as já pagas.\n\nEsta ação não pode ser desfeita.`)) excluirParcelamentoTudoMutation.mutate({ id: pid, cartaoId: id }); }}
          disabled={excluirParcelamentoTudoMutation.isPending}
          style={{ display: "flex", alignItems: "center", gap: 4, height: 28, padding: "0 12px", borderRadius: 50, border: "1px solid #FFCDD2", background: "rgba(239,68,68,0.15)", color: "#ef4444", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "'Roboto',sans-serif" }}>
          <Trash2 size={11} /> Excluir tudo
        </button>
      </div>

      {/* Modal de editar data da compra */}
      {showEditarData && (
        <EditarDataSheet
          accent={accent}
          nomeProduto={nomeProduto}
          parcelamentoId={pid}
          cartaoId={id}
          editarDataMutation={editarDataMutation}
          onClose={() => setShowEditarData(false)}
        />
      )}

      {/* Modal de editar compra (nome, valor, parcelas, responsável) */}
      {showEditarCompra && (
        <EditarCompraSheet
          accent={accent}
          parcelamentoId={pid}
          cartaoId={id}
          nomeProdutoInicial={nomeProduto}
          valorTotalInicial={valorParcela * totalParcelas}
          numParcelasRestantesInicial={parcelas.filter((p: any) => p.paga === 0).length}
          responsavelInicial={responsavel ?? ""}
          dataCompraInicial={dataInicioParcelamento ?? new Date().toISOString().split("T")[0]}
          editarCompra={editarCompra}
          onClose={() => setShowEditarCompra(false)}
        />

      )}

      {/* Lista de parcelas expandida */}
      {expandido && (
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          {parcelas.map((g: any) => {
            const isPaga = g.paga === 1;
            return (
              <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: isPaga ? "#F9FBF9" : "#fff", borderBottom: "1px solid #F4EFF4" }}>
                <div style={{ width: 32, height: 32, borderRadius: 16, background: isPaga ? "#C8E6C9" : `${accent}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {isPaga ? <CheckCircle size={16} color="#2E7D32" /> : <Repeat size={16} color={accent} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: isPaga ? "#2E7D32" : "#1C1B1F" }}>Parcela {g.numeroParcela}/{totalParcelas}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#fff", background: isPaga ? "#2E7D32" : accent, borderRadius: 20, padding: "1px 6px" }}>{g.numeroParcela}/{totalParcelas}x</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 1 }}>
                    <Calendar size={10} color={isPaga ? "#4CAF50" : "#79747E"} />
                    <span style={{ fontSize: 11, color: isPaga ? "#4CAF50" : "#79747E" }}>
                      {new Date(g.data).toLocaleDateString("pt-BR")}{isPaga && " • Paga"}
                    </span>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: isPaga ? "#2E7D32" : "#C62828" }}>{fmt(Number(g.valor))}</span>
                  {isPaga ? (
                    <button
                      onClick={() => { if (confirm(`Cancelar pagamento da parcela ${g.numeroParcela}/${totalParcelas}?`)) cancelarPagamentoParcelaMutation.mutate({ id: g.id, cartaoId: id }); }}
                      disabled={cancelarPagamentoParcelaMutation.isPending}
                      style={{ display: "flex", alignItems: "center", gap: 3, height: 22, padding: "0 8px", borderRadius: 50, border: "1px solid #FFCDD2", background: "transparent", color: "#ef4444", fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "'Roboto',sans-serif" }}>
                      <X size={9} /> Desfazer
                    </button>
                  ) : (
                    <button
                      onClick={() => { if (confirm(`Marcar parcela ${g.numeroParcela}/${totalParcelas} como paga?`)) marcarParcelaPagaMutation.mutate({ id: g.id, cartaoId: id }); }}
                      disabled={marcarParcelaPagaMutation.isPending}
                      style={{ display: "flex", alignItems: "center", gap: 3, height: 22, padding: "0 8px", borderRadius: 50, border: "none", background: `linear-gradient(135deg, ${accent}, ${accent}cc)`, color: "#fff", fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "'Roboto',sans-serif" }}>
                      <CheckCircle size={9} /> Pagar
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function CartaoDetailPage() {
  const [, navigate] = useLocation();
  // Usar window.location.pathname para obter o path absoluto (wouter retorna relativo)
  const fullPath = typeof window !== 'undefined' ? window.location.pathname : '';
  const idMatch = fullPath.match(/\/cartoes\/cartao\/(\d+)/);
  const id = parseInt(idMatch?.[1] || "0");
  const utils = trpc.useUtils();

  const [showGasto, setShowGasto] = useState(false);
  const [showPagar, setShowPagar] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [tab, setTab] = useState<"gastos" | "pagamentos" | "parcelamentos">("gastos");

  const { data: cartao, isLoading: cartaoLoading } = trpc.cartoes.cartoes.get.useQuery({ id }, { enabled: !!id, refetchOnWindowFocus: true });
  const { data: gastos = [] } = trpc.cartoes.gastos.list.useQuery({ cartaoId: id }, { enabled: !!id });
  const { data: pagamentos = [] } = trpc.cartoes.pagamentos.list.useQuery({ cartaoId: id }, { enabled: !!id });
  const { data: parcelamentos = [] } = trpc.cartoes.parcelamentos.list.useQuery({ cartaoId: id }, { enabled: !!id });
  const { data: categoriasList = [] } = trpc.cartoes.categorias.list.useQuery();

  const deleteGastoMutation = trpc.cartoes.gastos.delete.useMutation({
    onSuccess: () => { utils.cartoes.cartoes.list.invalidate({ id }); utils.cartoes.gastos.list.invalidate({ cartaoId: id }); toast.success("Gasto removido"); },
    onError: e => toast.error(e.message),
  });

  const editarGastoMutation = trpc.cartoes.gastos.editar.useMutation({
    onSuccess: () => { utils.cartoes.cartoes.list.invalidate({ id }); utils.cartoes.gastos.list.invalidate({ cartaoId: id }); toast.success("Gasto atualizado!"); },
    onError: e => toast.error(e.message),
  });

  const [editarGastoData, setEditarGastoData] = useState<{ id: number; descricao: string; valor: string; data: string; responsavel: string } | null>(null);

  const deleteCartaoMutation = trpc.cartoes.cartoes.delete.useMutation({
    onSuccess: () => { navigate("/cartoes"); toast.success("Cartão excluído"); },
    onError: e => toast.error(e.message),
  });

  const cancelarPagamentoMutation = trpc.cartoes.pagamentos.cancelar.useMutation({
    onSuccess: () => { utils.cartoes.cartoes.list.invalidate({ id }); utils.cartoes.pagamentos.list.invalidate({ cartaoId: id }); toast.success("Pagamento cancelado"); },
    onError: e => toast.error(e.message),
  });

  const marcarParcelaPagaMutation = trpc.cartoes.gastos.marcarPaga.useMutation({
    onSuccess: () => { utils.cartoes.cartoes.list.invalidate({ id }); utils.cartoes.gastos.list.invalidate({ cartaoId: id }); utils.cartoes.parcelamentos.list.invalidate({ cartaoId: id }); toast.success("Parcela marcada como paga"); },
    onError: e => toast.error(e.message),
  });

  const cancelarPagamentoParcelaMutation = trpc.cartoes.gastos.cancelarPagamento.useMutation({
    onSuccess: () => { utils.cartoes.cartoes.list.invalidate({ id }); utils.cartoes.gastos.list.invalidate({ cartaoId: id }); utils.cartoes.parcelamentos.list.invalidate({ cartaoId: id }); toast.success("Pagamento da parcela cancelado"); },
    onError: e => toast.error(e.message),
  });

  const cancelarParcelamentoMutation = trpc.cartoes.parcelamentos.cancelar.useMutation({
    onSuccess: () => { utils.cartoes.cartoes.list.invalidate({ id }); utils.cartoes.gastos.list.invalidate({ cartaoId: id }); utils.cartoes.parcelamentos.list.invalidate({ cartaoId: id }); toast.success("Parcelas não pagas canceladas"); },
    onError: e => toast.error(e.message),
  });

  const editarParcelamentoMutation = trpc.cartoes.parcelamentos.editar.useMutation({
    onSuccess: () => { utils.cartoes.cartoes.list.invalidate({ id }); utils.cartoes.gastos.list.invalidate({ cartaoId: id }); utils.cartoes.parcelamentos.list.invalidate({ cartaoId: id }); toast.success("Compra atualizada com sucesso!"); },
    onError: e => toast.error(e.message),
  });

  const editarDataParcelamentoMutation = trpc.cartoes.parcelamentos.editarData.useMutation({
    onSuccess: () => { utils.cartoes.cartoes.list.invalidate({ id }); utils.cartoes.gastos.list.invalidate({ cartaoId: id }); utils.cartoes.parcelamentos.list.invalidate({ cartaoId: id }); toast.success("Data da compra atualizada! Parcelas recalculadas."); },
    onError: e => toast.error(e.message),
  });

  const excluirParcelamentoTudoMutation = trpc.cartoes.parcelamentos.excluirTudo.useMutation({
    onSuccess: () => { utils.cartoes.cartoes.list.invalidate({ id }); utils.cartoes.gastos.list.invalidate({ cartaoId: id }); utils.cartoes.parcelamentos.list.invalidate({ cartaoId: id }); toast.success("Compra parcelada excluída completamente"); },
    onError: e => toast.error(e.message),
  });

  if (cartaoLoading) {
    return (
      <div style={{ minHeight: "100dvh", background: "rgba(255,255,255,0.06)", fontFamily: "'Roboto',sans-serif" }}>
        <div style={{ height: 240, background: "rgba(255,255,255,0.06)", animation: "pulse 1.5s infinite" }} />
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          {[1,2,3].map(i => <div key={i} style={{ height: 64, borderRadius: 16, background: "rgba(255,255,255,0.06)", animation: "pulse 1.5s infinite" }} />)}
        </div>
        <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}`}</style>
      </div>
    );
  }

  if (!cartao) {
    return (
      <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.06)", fontFamily: "'Roboto',sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <CreditCard size={48} color="#CAC4D0" style={{ marginBottom: 16 }} />
          <div style={{ fontSize: 18, fontWeight: 600, color: "#fff", marginBottom: 8 }}>Cartão não encontrado</div>
          <button onClick={() => navigate("/cartoes")} style={{ height: 44, padding: "0 24px", borderRadius: 50, border: "none", background: "#6750A4", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "'Roboto',sans-serif" }}>Voltar</button>
        </div>
      </div>
    );
  }

  const grad = GRADIENTS[cartao.corCartao] || GRADIENTS.purple;
  const accent = ACCENT[cartao.corCartao] || "#6750A4";
  const totalAVista = Number((cartao as any).totalAVista ?? 0);
  const totalParcelado = Number((cartao as any).totalParcelado ?? 0);
  // Usar faturaAtual (competência atual) ou fallback para campos antigos
  const faturaDoMes = Number((cartao as any).faturaAtual ?? (cartao as any).faturaDoMes ?? (cartao as any).valorApagarCicloAtual ?? 0);
  const mesSeguinte = Number((cartao as any).proximaFatura ?? (cartao as any).parcelasMesSeguinte ?? 0);
  const limite = Number(cartao.limiteTotal ?? 0);
  const disponivel = Number((cartao as any).limiteDisponivel ?? 0);
  const fatura = faturaDoMes;
  const pct = Number((cartao as any).pctLimite ?? (cartao as any).percentualUsado ?? 0);
  const dias = diasParaVencer(cartao.vencimentoDia);

  // Fatura fechada: quando hoje > fechamentoDia, a fatura está fechada aguardando pagamento
  // Fatura em atraso: retornada diretamente pelo backend (calcCartao)
  const faturaEmAtrasoInfo = (cartao as any).faturaEmAtraso as {
    valor: number;
    competencia: string;
    vencimento: string;
    diasAtraso: number;
  } | null | undefined;
  const isFaturaEmAtraso = !!faturaEmAtrasoInfo && faturaEmAtrasoInfo.valor > 0;
  const faturaEmAtrasoValor = Number(faturaEmAtrasoInfo?.valor ?? 0);
  const faturaEmAtrasoVenc = faturaEmAtrasoInfo?.vencimento ? new Date(faturaEmAtrasoInfo.vencimento + 'T12:00:00') : null;
  const faturaEmAtrasoDias = Number(faturaEmAtrasoInfo?.diasAtraso ?? 0);
  const faturaEmAtrasoComp = faturaEmAtrasoInfo?.competencia ?? '';

  // Compatibilidade com campo antigo faturaFechada (mantido para não quebrar)
  const faturaFechadaInfo = (cartao as any).faturaFechada as {
    fechada: boolean;
    vencimento?: string;
    valor?: number;
  } | undefined;
  const isFaturaFechada = !isFaturaEmAtraso && faturaFechadaInfo?.fechada === true;
  const faturaFechadaVenc = faturaFechadaInfo?.vencimento ? new Date(faturaFechadaInfo.vencimento) : null;
  const faturaFechadaValor = Number(faturaFechadaInfo?.valor ?? 0);

  const pagamentosOrdenados = [...pagamentos].sort((a: any, b: any) => new Date(b.dataPagamento).getTime() - new Date(a.dataPagamento).getTime());
  const parcelamentosAtivos = parcelamentos.filter((p: any) => p.parcelasRestantes > 0);

  // Agrupa gastos: parcelados por parcelamentoId, avulsos separados
  const gastosAvulsos = gastos.filter((g: any) => !g.parcelamentoId).sort((a: any, b: any) => new Date(b.data).getTime() - new Date(a.data).getTime());
  const gastosPorParcelamento: Record<number, any[]> = {};
  for (const g of gastos) {
    const pid = (g as any).parcelamentoId;
    if (pid) {
      if (!gastosPorParcelamento[pid]) gastosPorParcelamento[pid] = [];
      gastosPorParcelamento[pid].push(g);
    }
  }
  for (const pid in gastosPorParcelamento) {
    gastosPorParcelamento[pid].sort((a: any, b: any) => (a.numeroParcela ?? 0) - (b.numeroParcela ?? 0));
  }
  const parcelamentoIds = Object.keys(gastosPorParcelamento).map(Number).sort((a, b) => {
    const dateA = new Date(gastosPorParcelamento[a][0]?.data ?? 0).getTime();
    const dateB = new Date(gastosPorParcelamento[b][0]?.data ?? 0).getTime();
    return dateB - dateA;
  });

  // Resumo por responsável — apenas gastos não pagos (paga=0) do ciclo atual
  const resumoResponsaveis = (() => {
    const vencDia = cartao.vencimentoDia;
    const fechDia = cartao.fechamentoDia ?? null;
    // Calcular ciclo atual no frontend (mesma lógica do backend)
    const hoje = new Date();
    const diaHoje = hoje.getDate();
    const mesHoje = hoje.getMonth();
    const anoHoje = hoje.getFullYear();
    let inicioCiclo: Date, proxVenc: Date;
    if (fechDia) {
      const ultimoFech = diaHoje < fechDia
        ? new Date(anoHoje, mesHoje - 1, fechDia, 23, 59, 59)
        : new Date(anoHoje, mesHoje, fechDia, 23, 59, 59);
      inicioCiclo = new Date(ultimoFech);
      inicioCiclo.setDate(inicioCiclo.getDate() + 1);
      inicioCiclo.setHours(0, 0, 0, 0);
      proxVenc = vencDia > fechDia
        ? new Date(ultimoFech.getFullYear(), ultimoFech.getMonth(), vencDia, 23, 59, 59)
        : new Date(ultimoFech.getFullYear(), ultimoFech.getMonth() + 1, vencDia, 23, 59, 59);
      if (proxVenc < hoje) { proxVenc = new Date(proxVenc); proxVenc.setMonth(proxVenc.getMonth() + 1); }
    } else {
      const vencEsteMes = new Date(anoHoje, mesHoje, vencDia, 23, 59, 59);
      const ultimoVenc = vencEsteMes < hoje
        ? vencEsteMes
        : new Date(anoHoje, mesHoje - 1, vencDia, 23, 59, 59);
      proxVenc = vencEsteMes < hoje
        ? new Date(anoHoje, mesHoje + 1, vencDia, 23, 59, 59)
        : vencEsteMes;
      inicioCiclo = new Date(ultimoVenc);
      inicioCiclo.setDate(inicioCiclo.getDate() + 1);
      inicioCiclo.setHours(0, 0, 0, 0);
    }
    const mapa: Record<string, { total: number; qtd: number }> = {};
    for (const g of gastos) {
      if ((g as any).paga === 1) continue; // já pago
      const dataGasto = new Date((g as any).data);
      if (dataGasto < inicioCiclo || dataGasto > proxVenc) continue; // fora do ciclo
      const nome = (g as any).responsavel || null;
      if (!nome) continue;
      if (!mapa[nome]) mapa[nome] = { total: 0, qtd: 0 };
      mapa[nome].total += Number(g.valor);
      mapa[nome].qtd += 1;
    }
    return Object.entries(mapa).sort((a, b) => b[1].total - a[1].total);
  })();

  const totalItensGastos = parcelamentoIds.length + gastosAvulsos.length;

  return (
    <div style={{ minHeight: "100dvh", background: "linear-gradient(180deg, #0a0a0f 0%, #0d0a1a 100%)", fontFamily: "'Inter', 'Roboto',sans-serif", paddingBottom: 100 }}>

      {/* ── Header ── */}
      <div style={{ background: grad, paddingTop: "env(safe-area-inset-top,0px)", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -32, right: -32, width: 120, height: 120, borderRadius: 60, background: "rgba(255,255,255,0.1)" }} />
        <div style={{ position: "absolute", bottom: -20, left: 40, width: 80, height: 80, borderRadius: 40, background: "rgba(255,255,255,0.07)" }} />
        {/* Logo da bandeira como marca d'agua no header */}
        {(cartao as any).bandeira && <BandeiraLogo bandeira={(cartao as any).bandeira} opacity={0.15} style={{ width: 110, height: 60, bottom: 16, right: 20 }} />}

        <div style={{ height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 12px", position: "relative" }}>
          <button onClick={() => navigate("/cartoes")} style={{ width: 40, height: 40, borderRadius: 20, background: "rgba(255,255,255,0.2)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ArrowLeft size={20} color="#fff" />
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setShowEdit(true)} style={{ width: 40, height: 40, borderRadius: 20, background: "rgba(255,255,255,0.2)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Edit3 size={18} color="#fff" />
            </button>
            <button onClick={() => { if (confirm(`Excluir "${cartao.nome}"? Todos os dados serão removidos.`)) deleteCartaoMutation.mutate({ id }); }}
              style={{ width: 40, height: 40, borderRadius: 20, background: "rgba(255,255,255,0.2)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Trash2 size={18} color="#fff" />
            </button>
          </div>
        </div>

        <div style={{ padding: "4px 20px 24px", position: "relative" }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>Cartão de Crédito</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "#fff", marginBottom: 4 }}>{cartao.nome}</div>
          {((cartao as any).banco || (cartao as any).bandeira) && (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 10 }}>
              {(cartao as any).banco}{(cartao as any).banco && (cartao as any).bandeira ? ' · ' : ''}{(cartao as any).bandeira ? (cartao as any).bandeira.charAt(0).toUpperCase() + (cartao as any).bandeira.slice(1) : ''}
            </div>
          )}

          {fatura > 0 && dias <= 3 && dias >= 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: dias <= 0 ? "rgba(244,67,54,0.9)" : "rgba(255,152,0,0.9)", borderRadius: 12, padding: "8px 12px", marginBottom: 14 }}>
              <AlertTriangle size={16} color="#fff" />
              <span style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>
                {dias <= 0 ? "Fatura vencida! Pague agora." : dias === 1 ? "Vence amanhã!" : `Vence em ${dias} dias`}
              </span>
            </div>
          )}

          {/* 6 métricas claras */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
            {[
              { label: "Total à Vista",    value: fmt(totalAVista),    color: "#fff",                                           icon: <ShoppingBag size={11} />,  hint: "Compras avulsas" },
              { label: "Total Parcelado",  value: fmt(totalParcelado), color: "#fff",                                           icon: <Repeat size={11} />,       hint: "Todas as parcelas" },
              { label: "Fatura do Mês",   value: fmt(faturaDoMes),    color: faturaDoMes > 0 ? "#FFCDD2" : "#C8E6C9",         icon: <TrendingUp size={11} />,   hint: "A pagar agora" },
              { label: "Mês Seguinte",    value: fmt(mesSeguinte),    color: mesSeguinte > 0 ? "#FFE082" : "rgba(255,255,255,0.6)", icon: <Calendar size={11} />, hint: "Próxima fatura" },
              { label: "Limite Total",     value: fmt(limite),         color: "#fff",                                           icon: <CreditCard size={11} />,   hint: undefined },
              { label: "Disponível",       value: fmt(disponivel),     color: disponivel < limite * 0.2 ? "#FFCDD2" : "#C8E6C9", icon: <CheckCircle size={11} />, hint: undefined },
            ].map((item, i) => (
              <div key={i} style={{ background: "rgba(0,0,0,0.2)", borderRadius: 14, padding: "10px 10px", display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: 14, background: "rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "rgba(255,255,255,0.7)" }}>
                  {item.icon}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 2 }}>{item.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: item.color, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.value}</div>
                  {(item as any).hint && <div style={{ fontSize: 8, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>{(item as any).hint}</div>}
                </div>
              </div>
            ))}
          </div>

          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>Limite usado: {pct.toFixed(0)}%</span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>
                {cartao.fechamentoDia ? `Fecha dia ${cartao.fechamentoDia} · ` : ""}Vence dia {cartao.vencimentoDia}
              </span>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: "rgba(255,255,255,0.25)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct}%`, borderRadius: 4, background: pct >= 90 ? "#EF9A9A" : pct >= 70 ? "#FFE082" : "rgba(255,255,255,0.85)", transition: "width 600ms ease" }} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Banner: FATURA EM ATRASO (novo sistema) ── */}
      {isFaturaEmAtraso && (
        <div style={{ margin: "12px 16px 0", background: "rgba(239,68,68,0.1)", borderRadius: 16, padding: "16px", border: "2px solid rgba(239,68,68,0.4)", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 20, background: "#ef4444", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <AlertTriangle size={20} color="#fff" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#ef4444", textTransform: "uppercase", letterSpacing: 0.5 }}>Fatura em Atraso</div>
              <div style={{ fontSize: 12, color: "rgba(239,68,68,0.8)", marginTop: 2 }}>
                Venceu em {faturaEmAtrasoVenc ? faturaEmAtrasoVenc.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—"}
                {faturaEmAtrasoDias > 0 ? ` · ${faturaEmAtrasoDias} dia${faturaEmAtrasoDias !== 1 ? 's' : ''} em atraso` : ''}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#ef4444" }}>{fmt(faturaEmAtrasoValor)}</div>
              <div style={{ fontSize: 10, color: "rgba(239,68,68,0.7)", textTransform: "uppercase" }}>a pagar</div>
            </div>
          </div>
          <button onClick={() => setShowPagar(true)}
            style={{ width: "100%", height: 50, borderRadius: 12, border: "none", background: "#ef4444", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "'Roboto',sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 4px 16px rgba(239,68,68,0.4)" }}>
            <CheckCircle size={18} />
            Paguei a Fatura — {fmt(faturaEmAtrasoValor)}
          </button>
        </div>
      )}

      {/* ── Banner: Fatura Fechada Aguardando Pagamento (sistema antigo — fallback) ── */}
      {!isFaturaEmAtraso && isFaturaFechada && faturaFechadaValor > 0 && (
        <div style={{ margin: "12px 16px 0", background: "rgba(245,158,11,0.1)", borderRadius: 16, padding: "14px 16px", border: "1px solid rgba(245,158,11,0.3)", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 36, height: 36, borderRadius: 18, background: "#FF9800", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <AlertTriangle size={18} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#f97316" }}>Fatura Fechada — Aguardando Pagamento</div>
              <div style={{ fontSize: 11, color: "rgba(249,115,22,0.7)" }}>
                Vencimento: {faturaFechadaVenc ? faturaFechadaVenc.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—"}
              </div>
            </div>
            <div style={{ marginLeft: "auto", textAlign: "right" }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#f97316" }}>{fmt(faturaFechadaValor)}</div>
              <div style={{ fontSize: 10, color: "rgba(249,115,22,0.7)" }}>a pagar</div>
            </div>
          </div>
          <div style={{ fontSize: 11, color: "#795548", background: "rgba(255,152,0,0.1)", borderRadius: 8, padding: "6px 10px" }}>
            Compras após o fechamento entrarão na próxima fatura. Clique em "Paguei a Fatura" para registrar o pagamento.
          </div>
        </div>
      )}

      {/* ── Botão Paguei (quando não há fatura em atraso) ── */}
      {!isFaturaEmAtraso && (
        <div style={{ padding: "12px 16px 0" }}>
          <button onClick={() => setShowPagar(true)}
            style={{ width: "100%", height: 52, borderRadius: 14, border: "none", background: isFaturaFechada ? "#E65100" : `linear-gradient(135deg, ${accent}, ${accent}cc)`, color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: "'Roboto',sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: `0 4px 16px ${isFaturaFechada ? "#E6510055" : accent + "55"}` }}>
            <CheckCircle size={20} />
            {isFaturaFechada ? `Pagar Fatura — ${fmt(faturaFechadaValor)}` : "Paguei a Fatura"}
          </button>
        </div>
      )}

      {/* ── Botão Histórico ── */}
      <div style={{ padding: "8px 16px 0" }}>
        <button onClick={() => navigate(`/cartoes/historico/${id}`)}
          style={{ width: "100%", height: 44, borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.7)", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          📋 Ver Histórico de Faturas
        </button>
      </div>
      {/* ── Fatura Mês Seguinte / Próxima Fatura ── */}
      {mesSeguinte > 0 && (
        <FaturaMesSeguinteCard
          accent={accent}
          mesSeguinte={mesSeguinte}
          gastos={gastos}
          vencimentoDia={cartao.vencimentoDia}
          fechamentoDia={cartao.fechamentoDia ?? null}
          titulo={isFaturaEmAtraso ? "Próxima Fatura" : "Fatura Mês Seguinte"}
        />
      )}

      {/* ── Tabs ── */}
      <div style={{ padding: "16px 16px 0" }}>
        <div style={{ display: "flex", background: "rgba(255,255,255,0.05)", borderRadius: 50, padding: 4, boxShadow: "0 1px 4px rgba(0,0,0,0.08)", gap: 2 }}>
          {(["gastos", "pagamentos", "parcelamentos"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ flex: 1, height: 38, borderRadius: 50, border: "none", background: tab === t ? accent : "transparent", color: tab === t ? "#fff" : "#79747E", fontSize: 12, fontWeight: tab === t ? 600 : 500, cursor: "pointer", fontFamily: "'Roboto',sans-serif", transition: "all 200ms", whiteSpace: "nowrap" }}>
              {t === "gastos" ? `Gastos (${totalItensGastos})` : t === "pagamentos" ? `Pagamentos (${pagamentos.length})` : `Parcelas${parcelamentosAtivos.length > 0 ? ` (${parcelamentosAtivos.length})` : ""}`}
            </button>
          ))}
        </div>
      </div>

      {/* ── Lista Gastos ── */}
      {tab === "gastos" && (
        <div style={{ padding: "12px 16px 0" }}>
          {gastos.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 24px", background: "rgba(255,255,255,0.05)", borderRadius: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
              <ShoppingBag size={40} color="#CAC4D0" style={{ marginBottom: 12 }} />
              <div style={{ fontSize: 16, fontWeight: 600, color: "rgba(255,255,255,0.6)", marginBottom: 6 }}>Nenhum gasto ainda</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Toque em "+" para adicionar um gasto</div>
            </div>
          ) : (
            <>
              {/* Cards de compras parceladas — um card por produto */}
              {parcelamentoIds.map(pid => {
                const pInfo = parcelamentos.find((p: any) => p.id === pid);
                return (
                  <ParcelamentoCard
                    key={pid}
                    pid={pid}
                    parcelas={gastosPorParcelamento[pid]}
                    accent={accent}
                    id={id}
                    cancelarParcelamentoMutation={cancelarParcelamentoMutation}
                    excluirParcelamentoTudoMutation={excluirParcelamentoTudoMutation}
                    marcarParcelaPagaMutation={marcarParcelaPagaMutation}
                    cancelarPagamentoParcelaMutation={cancelarPagamentoParcelaMutation}
                    editarDataMutation={editarDataParcelamentoMutation}
                    editarCompra={editarParcelamentoMutation}
                    dataInicioParcelamento={pInfo?.dataInicio ? new Date(pInfo.dataInicio).toISOString().split("T")[0] : undefined}
                    numParcelasTotal={pInfo?.totalParcelas ?? pInfo?.numParcelas}
                  />
                );
              })}

              {/* Gastos avulsos (sem parcelamento) */}
              {gastosAvulsos.map((g: any) => (
                <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 12, background: "rgba(255,255,255,0.05)", borderRadius: 16, padding: "14px", marginBottom: 8, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
                  <div style={{ width: 44, height: 44, borderRadius: 22, background: `${accent}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <ShoppingBag size={20} color={accent} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.descricao}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                      <Calendar size={11} color="#79747E" />
                      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{new Date(g.data).toLocaleDateString("pt-BR")}</span>
                    </div>
                    {g.responsavel && (
                      <span style={{ fontSize: 11, color: "#fff", background: `linear-gradient(135deg, ${accent}, ${accent}cc)`, borderRadius: 20, padding: "1px 8px", fontWeight: 600, opacity: 0.85, display: "inline-block", marginTop: 3 }}>👤 {g.responsavel}</span>
                    )}
                    {g.categoriaId && (() => {
                      const cat = categoriasList.find((c: any) => c.id === g.categoriaId);
                      if (!cat) return null;
                      return <span style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", background: "rgba(255,255,255,0.06)", borderRadius: 20, padding: "1px 8px", fontWeight: 600, display: "inline-block", marginTop: 3 }}>{cat.icone} {cat.nome}</span>;
                    })()}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: "#ef4444" }}>{fmt(Number(g.valor))}</span>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => setEditarGastoData({ id: g.id, descricao: g.descricao, valor: String(Number(g.valor)), data: new Date(g.data).toISOString().split("T")[0], responsavel: g.responsavel ?? "" })}
                        style={{ width: 32, height: 32, borderRadius: 16, background: `${accent}18`, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Pencil size={14} color={accent} />
                      </button>
                      <button onClick={() => { if (confirm("Excluir este gasto?")) deleteGastoMutation.mutate({ id: g.id, cartaoId: id }); }}
                        style={{ width: 32, height: 32, borderRadius: 16, background: "rgba(239,68,68,0.15)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Trash2 size={15} color="#C62828" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* ── Lista Pagamentos ── */}
      {tab === "pagamentos" && (
        <div style={{ padding: "12px 16px 0" }}>
          {pagamentosOrdenados.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 24px", background: "rgba(255,255,255,0.05)", borderRadius: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
              <CheckCircle size={40} color="#CAC4D0" style={{ marginBottom: 12 }} />
              <div style={{ fontSize: 16, fontWeight: 600, color: "rgba(255,255,255,0.6)", marginBottom: 6 }}>Nenhum pagamento ainda</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Use "Paguei a Fatura" para registrar</div>
            </div>
          ) : (
            pagamentosOrdenados.map((p: any) => (
              <div key={p.id} style={{ background: "rgba(255,255,255,0.05)", borderRadius: 16, padding: "14px", marginBottom: 8, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 22, background: "rgba(16,185,129,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <CheckCircle size={20} color="#2E7D32" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>Pagamento realizado</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                      <Calendar size={11} color="#79747E" />
                      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{new Date(p.dataPagamento).toLocaleDateString("pt-BR")}</span>
                    </div>
                    {p.observacao && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2, fontStyle: "italic" }}>{p.observacao}</div>}
                  </div>
                  <span style={{ fontSize: 16, fontWeight: 700, color: "#10b981", flexShrink: 0 }}>{fmt(Number(p.valorPago))}</span>
                </div>
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "flex-end" }}>
                  <button
                    onClick={() => { if (confirm(`Cancelar pagamento de ${fmt(Number(p.valorPago))}? O valor voltará para a fatura.`)) cancelarPagamentoMutation.mutate({ id: p.id, cartaoId: id }); }}
                    disabled={cancelarPagamentoMutation.isPending}
                    style={{ display: "flex", alignItems: "center", gap: 6, height: 32, padding: "0 14px", borderRadius: 50, border: "1px solid #FFCDD2", background: "transparent", color: "#ef4444", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Roboto',sans-serif" }}>
                    <X size={13} />
                    Cancelar pagamento
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Lista Parcelamentos ── */}
      {tab === "parcelamentos" && (
        <div style={{ padding: "12px 16px 0" }}>
          {parcelamentos.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 24px", background: "rgba(255,255,255,0.05)", borderRadius: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
              <Repeat size={40} color="#CAC4D0" style={{ marginBottom: 12 }} />
              <div style={{ fontSize: 16, fontWeight: 600, color: "rgba(255,255,255,0.6)", marginBottom: 6 }}>Nenhum parcelamento</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Toque em "+" e ative "Parcelado" para criar</div>
            </div>
          ) : (
            (parcelamentos as any[]).map((p: any) => {
              const parcelasPagas = p.parcelasPagas ?? 0;
              const totalParcelas = p.totalParcelas ?? p.numParcelas ?? 1;
              const progresso = Math.round((parcelasPagas / totalParcelas) * 100);
              const ativo = p.parcelasRestantes > 0;
              return (
                <div key={p.id} style={{ background: "rgba(255,255,255,0.05)", borderRadius: 16, padding: "16px", marginBottom: 10, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 18, background: ativo ? `${accent}18` : "#F4EFF4", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <Repeat size={18} color={ativo ? accent : "#79747E"} />
                        </div>
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 600, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 180 }}>{p.descricao}</div>
                          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
                            {fmt(p.valorParcela)}/mês · {totalParcelas}x de {fmt(p.valorTotal / totalParcelas)}
                          </div>
                          {p.responsavel && (
                            <span style={{ fontSize: 11, color: "#fff", background: `linear-gradient(135deg, ${accent}, ${accent}cc)`, borderRadius: 20, padding: "1px 8px", fontWeight: 600, opacity: 0.85, display: "inline-block", marginTop: 3 }}>
                              👤 {p.responsavel}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                      <span style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>{fmt(p.valorTotal)}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: ativo ? accent : "#79747E", background: ativo ? `${accent}15` : "#F4EFF4", borderRadius: 20, padding: "2px 8px" }}>
                        {parcelasPagas}/{totalParcelas}x
                      </span>
                    </div>
                  </div>

                  <div style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{parcelasPagas} parcela{parcelasPagas !== 1 ? "s" : ""} paga{parcelasPagas !== 1 ? "s" : ""}</span>
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{p.parcelasRestantes} restante{p.parcelasRestantes !== 1 ? "s" : ""}</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${progresso}%`, borderRadius: 3, background: ativo ? accent : "#CAC4D0", transition: "width 600ms ease" }} />
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <Calendar size={11} color="#79747E" />
                      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Início: {new Date(p.dataInicio).toLocaleDateString("pt-BR", { month: "short", year: "numeric" })}</span>
                    </div>
                    {ativo && (
                      <button
                        onClick={() => { if (confirm(`Cancelar parcelamento "${p.descricao}"? As parcelas futuras serão removidas.`)) cancelarParcelamentoMutation.mutate({ id: p.id, cartaoId: id }); }}
                        style={{ height: 30, padding: "0 12px", borderRadius: 50, border: `1px solid #FFCDD2`, background: "rgba(239,68,68,0.15)", color: "#ef4444", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Roboto',sans-serif", display: "flex", alignItems: "center", gap: 4 }}>
                        <X size={12} />
                        Cancelar
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── Resumo por Responsável ── */}
      {resumoResponsaveis.length > 0 && (
        <div style={{ padding: "12px 16px 0" }}>
          <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 16, padding: "14px 16px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 }}>Gastos por Responsável</div>
            {resumoResponsaveis.map(([nome, dados]) => (
              <div key={nome} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 8, marginBottom: 8, borderBottom: "1px solid #F4EFF4" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 16, background: `${accent}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>
                    👤
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>{nome}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{dados.qtd} compra{dados.qtd !== 1 ? "s" : ""}</div>
                  </div>
                </div>
                <span style={{ fontSize: 15, fontWeight: 700, color: accent }}>{fmt(dados.total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── FAB ── */}
      <button onClick={() => setShowGasto(true)}
        style={{ position: "fixed", bottom: "calc(24px + env(safe-area-inset-bottom,0px))", right: 16, width: 56, height: 56, borderRadius: 16, background: `linear-gradient(135deg, ${accent}, ${accent}cc)`, color: "#fff", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 4px 20px ${accent}66`, zIndex: 40 }}>
        <Plus size={26} />
      </button>

      {/* ── Modais ── */}
      {showGasto && <GastoSheet accent={accent} cartaoId={id} onClose={() => setShowGasto(false)} onSuccess={() => { setShowGasto(false); utils.cartoes.cartoes.list.invalidate({ id }); utils.cartoes.gastos.list.invalidate({ cartaoId: id }); utils.cartoes.parcelamentos.list.invalidate({ cartaoId: id }); toast.success("Gasto adicionado!"); }} />}
      {showPagar && <PagarSheet accent={accent} cartaoId={id} faturaAtual={isFaturaEmAtraso ? faturaEmAtrasoValor : fatura} competencia={isFaturaEmAtraso ? faturaEmAtrasoComp : (cartao as any).competenciaAtual} isFaturaEmAtraso={isFaturaEmAtraso} onClose={() => setShowPagar(false)} onSuccess={(data: any) => { setShowPagar(false); utils.cartoes.cartoes.get.invalidate({ id }); utils.cartoes.cartoes.list.invalidate(); utils.cartoes.pagamentos.list.invalidate({ cartaoId: id }); utils.cartoes.gastos.list.invalidate({ cartaoId: id }); utils.cartoes.parcelamentos.list.invalidate({ cartaoId: id }); if (data?.parcelasMarcadas > 0) { toast.success(`Pagamento registrado! ${data.parcelasMarcadas} parcela(s) baixada(s) da fatura.`); } else { toast.success("Pagamento registrado!"); } }} />}
      {showEdit && <EditCartaoSheet cartao={cartao} accent={accent} onClose={() => setShowEdit(false)} onSuccess={() => { setShowEdit(false); utils.cartoes.cartoes.list.invalidate({ id }); toast.success("Cartão atualizado!"); }} />}
      {editarGastoData && (
        <EditarGastoSheet
          accent={accent}
          data={editarGastoData}
          onClose={() => setEditarGastoData(null)}
          onSuccess={(vals) => {
            editarGastoMutation.mutate({ id: editarGastoData.id, cartaoId: id, ...vals });
            setEditarGastoData(null);
          }}
        />
      )}
    </div>
  );
}

function GastoSheet({ accent, cartaoId, onClose, onSuccess }: { accent: string; cartaoId: number; onClose: () => void; onSuccess: () => void }) {
  const [desc, setDesc] = useState("");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(new Date().toISOString().split("T")[0]);
  const [parcelado, setParcelado] = useState(false);
  const [numParcelas, setNumParcelas] = useState("2");
  const [responsavel, setResponsavel] = useState("");
  const [categoriaId, setCategoriaId] = useState<number | null>(null);
  const [showCatPicker, setShowCatPicker] = useState(false);
  const [showGerenciarCat, setShowGerenciarCat] = useState(false);
  const [editCatId, setEditCatId] = useState<number | null>(null);
  const [editCatNome, setEditCatNome] = useState("");
  const [novaCatNome, setNovaCatNome] = useState("");

  const utils = trpc.useUtils();
  const { data: cats = [] } = trpc.cartoes.categorias.list.useQuery();
  const createCat = trpc.cartoes.categorias.create.useMutation({ onSuccess: () => utils.categorias.list.invalidate() });
  const updateCat = trpc.cartoes.categorias.update.useMutation({ onSuccess: () => { utils.categorias.list.invalidate(); setEditCatId(null); } });
  const deleteCat = trpc.cartoes.categorias.delete.useMutation({ onSuccess: () => { utils.categorias.list.invalidate(); setCategoriaId(prev => prev === editCatId ? null : prev); } });

  const mutGasto = trpc.cartoes.gastos.create.useMutation({ onSuccess, onError: e => toast.error(e.message) });
  const mutParcelamento = trpc.cartoes.parcelamentos.criar.useMutation({ onSuccess, onError: e => toast.error(e.message) });

  const submit = () => {
    if (!desc.trim()) return toast.error("Descrição obrigatória");
    const v = parseFloat(valor.replace(",", "."));
    if (!v || v <= 0) return toast.error("Valor inválido");
    const resp = responsavel.trim() || undefined;

    if (parcelado) {
      const n = parseInt(numParcelas);
      if (!n || n < 2 || n > 48) return toast.error("Número de parcelas inválido (2–48)");
      mutParcelamento.mutate({ cartaoId, descricao: desc.trim(), valorTotal: v, numParcelas: n, dataInicio: data, responsavel: resp });
    } else {
      mutGasto.mutate({ cartaoId, descricao: desc.trim(), valor: v, data, responsavel: resp, categoriaId });
    }
  };

  const catSelecionada = cats.find(c => c.id === categoriaId);

  const isPending = mutGasto.isPending || mutParcelamento.isPending;
  const valorParcela = parcelado && valor && parseInt(numParcelas) >= 2
    ? (parseFloat(valor.replace(",", ".")) / parseInt(numParcelas))
    : null;

  return (
    <Sheet title="Adicionar Gasto" onClose={onClose}>
      <Field label="DESCRIÇÃO">
        <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Ex: Supermercado, Restaurante..." style={iStyle(accent)} onFocus={e => (e.target.style.borderColor = accent)} onBlur={e => (e.target.style.borderColor = "#E7E0EC")} />
      </Field>
      <Field label="RESPONSÁVEL (opcional)">
        <input value={responsavel} onChange={e => setResponsavel(e.target.value)} placeholder="Ex: Jony, Maria, Eu..." style={iStyle(accent)} onFocus={e => (e.target.style.borderColor = accent)} onBlur={e => (e.target.style.borderColor = "#E7E0EC")} />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="VALOR TOTAL (R$)">
          <input value={valor} onChange={e => setValor(e.target.value.replace(/[^\d,.]/g, ""))} placeholder="0,00" inputMode="decimal" style={iStyle(accent)} onFocus={e => (e.target.style.borderColor = accent)} onBlur={e => (e.target.style.borderColor = "#E7E0EC")} />
        </Field>
        <Field label="DATA">
          <input value={data} onChange={e => setData(e.target.value)} type="date" style={iStyle(accent)} onFocus={e => (e.target.style.borderColor = accent)} onBlur={e => (e.target.style.borderColor = "#E7E0EC")} />
        </Field>
      </div>

      {/* Categoria */}
      {!parcelado && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.4)", letterSpacing: 0.6 }}>CATEGORIA (opcional)</div>
            <button type="button" onClick={() => setShowGerenciarCat(v => !v)}
              style={{ fontSize: 11, color: accent, fontWeight: 600, background: "none", border: "none", cursor: "pointer", fontFamily: "'Roboto',sans-serif" }}>
              {showGerenciarCat ? "Fechar" : "✏️ Gerenciar"}
            </button>
          </div>

          {/* Seletor */}
          {!showGerenciarCat && (
            <>
              <button
                type="button"
                onClick={() => setShowCatPicker(v => !v)}
                style={{ ...iStyle(accent), display: "flex", alignItems: "center", gap: 8, cursor: "pointer", textAlign: "left", justifyContent: "space-between" }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 8, color: catSelecionada ? "#1C1B1F" : "#9E9E9E", fontSize: 14 }}>
                  {catSelecionada ? <>{catSelecionada.icone} {catSelecionada.nome}</> : "Selecionar categoria..."}
                </span>
                <ChevronDown size={16} color="#79747E" style={{ transform: showCatPicker ? "rotate(180deg)" : "none", transition: "transform 150ms", flexShrink: 0 }} />
              </button>
              {showCatPicker && (
                <div style={{ marginTop: 6, background: "rgba(255,255,255,0.06)", borderRadius: 12, padding: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  <button type="button" onClick={() => { setCategoriaId(null); setShowCatPicker(false); }}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 8, border: `2px solid ${!categoriaId ? accent : "#E7E0EC"}`, background: !categoriaId ? `${accent}10` : "#fff", color: !categoriaId ? accent : "#49454F", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Roboto',sans-serif" }}>
                    🚫 Sem categoria
                  </button>
                  {cats.map(cat => (
                    <button key={cat.id} type="button" onClick={() => { setCategoriaId(cat.id); setShowCatPicker(false); }}
                      style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 8, border: `2px solid ${categoriaId === cat.id ? accent : "#E7E0EC"}`, background: categoriaId === cat.id ? `${accent}10` : "#fff", color: categoriaId === cat.id ? accent : "#49454F", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Roboto',sans-serif" }}>
                      {cat.icone} {cat.nome}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Gerenciar categorias */}
          {showGerenciarCat && (
            <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 14, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              {cats.map(cat => (
                <div key={cat.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {editCatId === cat.id ? (
                    <>
                      <input value={editCatNome} onChange={e => setEditCatNome(e.target.value)}
                        style={{ flex: 1, height: 36, borderRadius: 8, border: `2px solid ${accent}`, background: "rgba(255,255,255,0.05)", padding: "0 10px", fontSize: 13, color: "#fff", fontFamily: "'Roboto',sans-serif", outline: "none" }} />
                      <button type="button" onClick={() => updateCat.mutate({ id: cat.id, nome: editCatNome })}
                        style={{ height: 36, padding: "0 12px", borderRadius: 8, border: "none", background: `linear-gradient(135deg, ${accent}, ${accent}cc)`, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'Roboto',sans-serif" }}>OK</button>
                      <button type="button" onClick={() => setEditCatId(null)}
                        style={{ height: 36, padding: "0 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)", fontSize: 12, cursor: "pointer", fontFamily: "'Roboto',sans-serif" }}>X</button>
                    </>
                  ) : (
                    <>
                      <span style={{ flex: 1, fontSize: 13, color: "#fff", fontWeight: 600 }}>{cat.icone} {cat.nome}</span>
                      <button type="button" onClick={() => { setEditCatId(cat.id); setEditCatNome(cat.nome); }}
                        style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${accent}40`, background: `${accent}10`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Pencil size={13} color={accent} />
                      </button>
                      <button type="button" onClick={() => { if (confirm(`Excluir categoria "${cat.nome}"?`)) deleteCat.mutate({ id: cat.id }); }}
                        style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #FFCDD2", background: "rgba(239,68,68,0.15)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Trash2 size={13} color="#C62828" />
                      </button>
                    </>
                  )}
                </div>
              ))}
              {/* Nova categoria */}
              <div style={{ display: "flex", gap: 8, marginTop: 4, paddingTop: 8, borderTop: "1px solid #E7E0EC" }}>
                <input value={novaCatNome} onChange={e => setNovaCatNome(e.target.value)} placeholder="Nova categoria..."
                  style={{ flex: 1, height: 36, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", padding: "0 10px", fontSize: 13, color: "#fff", fontFamily: "'Roboto',sans-serif", outline: "none" }} />
                <button type="button" disabled={!novaCatNome.trim()} onClick={() => { createCat.mutate({ nome: novaCatNome.trim(), icone: "🏷️", cor: "gray" }); setNovaCatNome(""); }}
                  style={{ height: 36, padding: "0 14px", borderRadius: 8, border: "none", background: novaCatNome.trim() ? accent : "#CAC4D0", color: "#fff", fontSize: 13, fontWeight: 700, cursor: novaCatNome.trim() ? "pointer" : "not-allowed", fontFamily: "'Roboto',sans-serif" }}>+</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Toggle Parcelado */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: parcelado ? `${accent}10` : "#F4EFF4", borderRadius: 14, padding: "14px 16px", border: `2px solid ${parcelado ? accent : "transparent"}`, transition: "all 200ms" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Repeat size={20} color={parcelado ? accent : "#79747E"} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: parcelado ? accent : "#49454F" }}>Compra Parcelada</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Dividir em várias parcelas mensais</div>
          </div>
        </div>
        <button
          onClick={() => setParcelado(p => !p)}
          style={{ width: 44, height: 24, borderRadius: 12, border: "none", background: parcelado ? accent : "#CAC4D0", cursor: "pointer", position: "relative", transition: "background 200ms", flexShrink: 0 }}>
          <div style={{ position: "absolute", top: 2, left: parcelado ? 22 : 2, width: 20, height: 20, borderRadius: 10, background: "rgba(255,255,255,0.05)", transition: "left 200ms", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
        </button>
      </div>

      {parcelado && (
        <>
          <Field label="NÚMERO DE PARCELAS">
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {["2","3","4","6","10","12"].map(n => (
                <button key={n} onClick={() => setNumParcelas(n)}
                  style={{ height: 34, padding: "0 14px", borderRadius: 50, border: `2px solid ${numParcelas === n ? accent : "#E7E0EC"}`, background: numParcelas === n ? `${accent}15` : "#fff", color: numParcelas === n ? accent : "#49454F", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'Roboto',sans-serif" }}>
                  {n}x
                </button>
              ))}
              <input value={numParcelas} onChange={e => setNumParcelas(e.target.value.replace(/\D/g, ""))} placeholder="outro" inputMode="numeric"
                style={{ ...iStyle(accent), width: 70, height: 34, padding: "0 10px", textAlign: "center" }}
                onFocus={e => (e.target.style.borderColor = accent)} onBlur={e => (e.target.style.borderColor = "#E7E0EC")} />
            </div>
          </Field>
          {valorParcela !== null && valorParcela > 0 && (
            <div style={{ background: `${accent}10`, borderRadius: 12, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>Valor por parcela</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: accent }}>{fmt(valorParcela)}</span>
            </div>
          )}
        </>
      )}

      <button onClick={submit} disabled={isPending}
        style={{ width: "100%", height: 50, borderRadius: 50, border: "none", background: isPending ? "#CAC4D0" : accent, color: "#fff", fontSize: 16, fontWeight: 700, cursor: isPending ? "not-allowed" : "pointer", fontFamily: "'Roboto',sans-serif", marginTop: 4 }}>
        {isPending ? "Salvando..." : parcelado ? "Criar Parcelamento" : "Adicionar Gasto"}
      </button>
    </Sheet>
  );
}

function PagarSheet({ accent, cartaoId, faturaAtual, competencia, isFaturaEmAtraso, onClose, onSuccess }: { accent: string; cartaoId: number; faturaAtual: number; competencia?: string; isFaturaEmAtraso?: boolean; onClose: () => void; onSuccess: (data?: any) => void }) {
  const [valor, setValor] = useState(faturaAtual > 0 ? faturaAtual.toFixed(2).replace(".", ",") : "");
  const [data, setData] = useState(new Date().toISOString().split("T")[0]);
  const [obs, setObs] = useState("");
  const mut = trpc.cartoes.pagamentos.pagar.useMutation({ onSuccess: (data) => onSuccess(data), onError: e => toast.error(e.message) });

  const submit = () => {
    const v = parseFloat(valor.replace(",", "."));
    if (!v || v <= 0) return toast.error("Valor inválido");
    // Quando há fatura em atraso, passa a competência para baixar apenas os gastos daquela fatura
    mut.mutate({ cartaoId, valorPago: v, observacao: obs.trim() || undefined, competencia });
  };

  return (
    <Sheet title="Registrar Pagamento" onClose={onClose}>
      <div style={{ background: isFaturaEmAtraso ? "rgba(239,68,68,0.1)" : `${accent}10`, borderRadius: 14, padding: "12px 16px", marginBottom: 4, display: "flex", justifyContent: "space-between", alignItems: "center", border: isFaturaEmAtraso ? "1px solid rgba(239,68,68,0.3)" : "none" }}>
        <span style={{ fontSize: 13, color: isFaturaEmAtraso ? "#ef4444" : "rgba(255,255,255,0.6)" }}>{isFaturaEmAtraso ? "Fatura em atraso" : "Fatura atual"}</span>
        <span style={{ fontSize: 18, fontWeight: 700, color: isFaturaEmAtraso ? "#ef4444" : accent }}>{fmt(faturaAtual)}</span>
      </div>
      <Field label="VALOR PAGO (R$)">
        <input value={valor} onChange={e => setValor(e.target.value.replace(/[^\d,.]/g, ""))} placeholder="0,00" inputMode="decimal" style={iStyle(accent)} onFocus={e => (e.target.style.borderColor = accent)} onBlur={e => (e.target.style.borderColor = "#E7E0EC")} />
      </Field>
      <Field label="DATA DO PAGAMENTO">
        <input value={data} onChange={e => setData(e.target.value)} type="date" style={iStyle(accent)} onFocus={e => (e.target.style.borderColor = accent)} onBlur={e => (e.target.style.borderColor = "#E7E0EC")} />
      </Field>
      <Field label="OBSERVAÇÃO (opcional)">
        <input value={obs} onChange={e => setObs(e.target.value)} placeholder="Ex: Pagamento mínimo, débito automático..." style={iStyle(accent)} onFocus={e => (e.target.style.borderColor = accent)} onBlur={e => (e.target.style.borderColor = "#E7E0EC")} />
      </Field>
      <button onClick={submit} disabled={mut.isPending}
        style={{ width: "100%", height: 50, borderRadius: 50, border: "none", background: mut.isPending ? "#CAC4D0" : "#2E7D32", color: "#fff", fontSize: 16, fontWeight: 700, cursor: mut.isPending ? "not-allowed" : "pointer", fontFamily: "'Roboto',sans-serif", marginTop: 4 }}>
        {mut.isPending ? "Registrando..." : "Confirmar Pagamento"}
      </button>
    </Sheet>
  );
}

function EditCartaoSheet({ cartao, accent, onClose, onSuccess }: { cartao: any; accent: string; onClose: () => void; onSuccess: () => void }) {
  const [nome, setNome] = useState(cartao.nome);
  const [limiteTotal, setLimiteTotal] = useState(String(cartao.limiteTotal));
  const [vencimentoDia, setVencimentoDia] = useState(String(cartao.vencimentoDia));
  const [fechamentoDia, setFechamentoDia] = useState(String(cartao.fechamentoDia ?? ""));
  const [corCartao, setCorCartao] = useState(cartao.corCartao);
  const [banco, setBanco] = useState((cartao as any).banco ?? "");
  const [bandeira, setBandeira] = useState((cartao as any).bandeira ?? "");
  const mut = trpc.cartoes.cartoes.update.useMutation({ onSuccess, onError: e => toast.error(e.message) });

  const CORES = ["purple","blue","red","green","orange","pink","teal","indigo"];
  const BANDEIRAS = [
    { value: "visa", label: "Visa" },
    { value: "mastercard", label: "Mastercard" },
    { value: "elo", label: "Elo" },
    { value: "amex", label: "American Express" },
    { value: "hipercard", label: "Hipercard" },
    { value: "outro", label: "Outra" },
  ];

  const submit = () => {
    if (!nome.trim()) return toast.error("Nome obrigatório");
    const lim = parseFloat(limiteTotal.replace(",", "."));
    if (!lim || lim <= 0) return toast.error("Limite inválido");
    const dia = parseInt(vencimentoDia);
    if (!dia || dia < 1 || dia > 31) return toast.error("Dia de vencimento inválido (1–31)");
    const fech = fechamentoDia ? parseInt(fechamentoDia) : null;
    if (fech !== null && (fech < 1 || fech > 31)) return toast.error("Dia de fechamento inválido (1–31)");
    mut.mutate({ id: cartao.id, nome: nome.trim(), limiteTotal: lim, vencimentoDia: dia, fechamentoDia: fech, corCartao, banco: banco.trim() || undefined, bandeira: bandeira || undefined } as any);
  };

  const selStyle: React.CSSProperties = { ...iStyle(accent), appearance: "none" as any, WebkitAppearance: "none" as any };

  return (
    <Sheet title="Editar Cartão" onClose={onClose}>
      <Field label="NOME DO CARTÃO">
        <input value={nome} onChange={e => setNome(e.target.value)} style={iStyle(accent)} onFocus={e => (e.target.style.borderColor = accent)} onBlur={e => (e.target.style.borderColor = "#E7E0EC")} />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="LIMITE (R$)">
          <input value={limiteTotal} onChange={e => setLimiteTotal(e.target.value.replace(/[^\d,.]/g, ""))} inputMode="decimal" style={iStyle(accent)} onFocus={e => (e.target.style.borderColor = accent)} onBlur={e => (e.target.style.borderColor = "#E7E0EC")} />
        </Field>
        <Field label="VENCE DIA">
          <input value={vencimentoDia} onChange={e => setVencimentoDia(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="Ex: 2" style={iStyle(accent)} onFocus={e => (e.target.style.borderColor = accent)} onBlur={e => (e.target.style.borderColor = "#E7E0EC")} />
        </Field>
      </div>
      <Field label="FECHA DIA (opcional)">
        <input value={fechamentoDia} onChange={e => setFechamentoDia(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="Ex: 25 (compras após este dia vão para próx. fatura)" style={iStyle(accent)} onFocus={e => (e.target.style.borderColor = accent)} onBlur={e => (e.target.style.borderColor = "#E7E0EC")} />
      </Field>
      <Field label="BANCO (opcional)">
        <input value={banco} onChange={e => setBanco(e.target.value)} placeholder="Ex: Nubank, Itaú, Bradesco..." style={iStyle(accent)} onFocus={e => (e.target.style.borderColor = accent)} onBlur={e => (e.target.style.borderColor = "#E7E0EC")} />
      </Field>
      <Field label="BANDEIRA">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {BANDEIRAS.map(b => (
            <button key={b.value} onClick={() => setBandeira(b.value)}
              style={{ padding: "6px 14px", borderRadius: 20, border: `2px solid ${bandeira === b.value ? accent : "rgba(255,255,255,0.15)"}`, background: bandeira === b.value ? accent + "33" : "rgba(255,255,255,0.05)", color: bandeira === b.value ? "#fff" : "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: bandeira === b.value ? 700 : 400, cursor: "pointer", transition: "all 150ms" }}>
              {b.label}
            </button>
          ))}
        </div>
      </Field>
      <Field label="COR DO CARTÃO">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {CORES.map(c => (
            <button key={c} onClick={() => setCorCartao(c)}
              style={{ width: 32, height: 32, borderRadius: 16, border: `3px solid ${corCartao === c ? "#1C1B1F" : "transparent"}`, background: GRADIENTS[c], cursor: "pointer", transition: "border 150ms" }} />
          ))}
        </div>
      </Field>
      <button onClick={submit} disabled={mut.isPending}
        style={{ width: "100%", height: 50, borderRadius: 50, border: "none", background: mut.isPending ? "#CAC4D0" : accent, color: "#fff", fontSize: 16, fontWeight: 700, cursor: mut.isPending ? "not-allowed" : "pointer", fontFamily: "'Roboto',sans-serif", marginTop: 4 }}>
        {mut.isPending ? "Salvando..." : "Salvar Alterações"}
      </button>
    </Sheet>
  );
}

function EditarDataSheet({ accent, nomeProduto, parcelamentoId, cartaoId, editarDataMutation, onClose }: {
  accent: string;
  nomeProduto: string;
  parcelamentoId: number;
  cartaoId: number;
  editarDataMutation: any;
  onClose: () => void;
}) {
  const [novaData, setNovaData] = useState(new Date().toISOString().split("T")[0]);

  const submit = () => {
    if (!novaData) return toast.error("Selecione uma data");
    editarDataMutation.mutate(
      { id: parcelamentoId, cartaoId, novaDataCompra: novaData },
      { onSuccess: () => onClose() }
    );
  };

  return (
    <Sheet title="Editar Data da Compra" onClose={onClose}>
      <div style={{ background: `${accent}10`, borderRadius: 14, padding: "12px 16px", marginBottom: 4 }}>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", fontWeight: 500 }}>{nomeProduto}</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>A 1ª parcela e todas as seguintes serão recalculadas automaticamente a partir da nova data de compra, respeitando o dia de vencimento do cartão.</div>
      </div>
      <Field label="NOVA DATA DA COMPRA">
        <input
          value={novaData}
          onChange={e => setNovaData(e.target.value)}
          type="date"
          style={iStyle(accent)}
          onFocus={e => (e.target.style.borderColor = accent)}
          onBlur={e => (e.target.style.borderColor = "#E7E0EC")}
        />
      </Field>
      <button
        onClick={submit}
        disabled={editarDataMutation.isPending}
        style={{ width: "100%", height: 50, borderRadius: 50, border: "none", background: editarDataMutation.isPending ? "#CAC4D0" : accent, color: "#fff", fontSize: 16, fontWeight: 700, cursor: editarDataMutation.isPending ? "not-allowed" : "pointer", fontFamily: "'Roboto',sans-serif", marginTop: 4 }}>
        {editarDataMutation.isPending ? "Recalculando..." : "Recalcular Parcelas"}
      </button>
    </Sheet>
  );
}

function EditarCompraSheet({ accent, parcelamentoId, cartaoId, nomeProdutoInicial, valorTotalInicial, numParcelasRestantesInicial, responsavelInicial, dataCompraInicial, editarCompra, onClose }: {
  accent: string;
  parcelamentoId: number;
  cartaoId: number;
  nomeProdutoInicial: string;
  valorTotalInicial: number;
  numParcelasRestantesInicial: number;
  responsavelInicial: string;
  dataCompraInicial: string;
  editarCompra: any;
  onClose: () => void;
}) {
  const [descricao, setDescricao] = useState(nomeProdutoInicial);
  const [valorTotal, setValorTotal] = useState(valorTotalInicial.toFixed(2).replace(".", ","));
  const [numParcelas, setNumParcelas] = useState(String(numParcelasRestantesInicial || 1));
  const [responsavel, setResponsavel] = useState(responsavelInicial);
  const [dataCompra, setDataCompra] = useState(dataCompraInicial);

  const nParcelas = parseInt(numParcelas) || 1;
  const vTotal = parseFloat(valorTotal.replace(",", ".")) || 0;
  const valorParcela = nParcelas > 0 && vTotal > 0 ? vTotal / nParcelas : 0;

  const submit = () => {
    if (!descricao.trim()) return toast.error("Nome obrigatório");
    if (vTotal <= 0) return toast.error("Valor inválido");
    if (nParcelas < 1) return toast.error("Número de parcelas inválido");
    editarCompra.mutate(
      { id: parcelamentoId, cartaoId, descricao: descricao.trim(), valorTotal: vTotal, numParcelas: nParcelas, responsavel: responsavel.trim() || null, dataCompra },
      { onSuccess: () => onClose() }
    );
  };

  return (
    <Sheet title="Editar Compra Parcelada" onClose={onClose}>
      <Field label="NOME DO PRODUTO">
        <input value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Ex: Farmácia, TV, Notebook..." style={iStyle(accent)} onFocus={e => (e.target.style.borderColor = accent)} onBlur={e => (e.target.style.borderColor = "#E7E0EC")} />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="VALOR TOTAL (R$)">
          <input value={valorTotal} onChange={e => setValorTotal(e.target.value.replace(/[^\d,.]/g, ""))} inputMode="decimal" placeholder="0,00" style={iStyle(accent)} onFocus={e => (e.target.style.borderColor = accent)} onBlur={e => (e.target.style.borderColor = "#E7E0EC")} />
        </Field>
        <Field label="PARCELAS RESTANTES">
          <input value={numParcelas} onChange={e => setNumParcelas(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="Ex: 3" style={iStyle(accent)} onFocus={e => (e.target.style.borderColor = accent)} onBlur={e => (e.target.style.borderColor = "#E7E0EC")} />
        </Field>
      </div>
      {valorParcela > 0 && (
        <div style={{ background: `${accent}10`, borderRadius: 12, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>Valor por parcela</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: accent }}>{fmt(valorParcela)}</span>
        </div>
      )}
      <Field label="DATA DA COMPRA">
        <input value={dataCompra} onChange={e => setDataCompra(e.target.value)} type="date" style={iStyle(accent)} onFocus={e => (e.target.style.borderColor = accent)} onBlur={e => (e.target.style.borderColor = "#E7E0EC")} />
      </Field>
      <Field label="RESPONSÁVEL (opcional)">
        <input value={responsavel} onChange={e => setResponsavel(e.target.value)} placeholder="Ex: João, Maria..." style={iStyle(accent)} onFocus={e => (e.target.style.borderColor = accent)} onBlur={e => (e.target.style.borderColor = "#E7E0EC")} />
      </Field>
      <button
        onClick={submit}
        disabled={editarCompra.isPending}
        style={{ width: "100%", height: 50, borderRadius: 50, border: "none", background: editarCompra.isPending ? "#CAC4D0" : accent, color: "#fff", fontSize: 16, fontWeight: 700, cursor: editarCompra.isPending ? "not-allowed" : "pointer", fontFamily: "'Roboto',sans-serif", marginTop: 4 }}>
        {editarCompra.isPending ? "Salvando..." : "Salvar Alterações"}
      </button>
    </Sheet>
  );
}

// ── Helpers de UI ─────────────────────────────────────────────────────────────
function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "flex-end" }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} onClick={onClose} />
      <div style={{ position: "relative", width: "100%", background: "#0f0f1a", borderRadius: "24px 24px 0 0", padding: "0 0 calc(24px + env(safe-area-inset-bottom,0px))", maxHeight: "90dvh", overflowY: "auto", border: "1px solid rgba(255,255,255,0.08)", borderBottom: "none" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 20px 16px" }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>{title}</div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 16, border: "none", background: "rgba(255,255,255,0.06)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={16} color="#49454F" />
          </button>
        </div>
        <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 14 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function EditarGastoSheet({ accent, data, onClose, onSuccess }: {
  accent: string;
  data: { id: number; descricao: string; valor: string; data: string; responsavel: string };
  onClose: () => void;
  onSuccess: (vals: { descricao: string; valor: number; data: string; responsavel: string | null }) => void;
}) {
  const [descricao, setDescricao] = useState(data.descricao);
  const [valor, setValor] = useState(data.valor);
  const [dataVal, setDataVal] = useState(data.data);
  const [responsavel, setResponsavel] = useState(data.responsavel);

  const submit = () => {
    if (!descricao.trim()) return toast.error("Descrição obrigatória");
    const v = parseFloat(valor.replace(",", "."));
    if (!v || v <= 0) return toast.error("Valor inválido");
    onSuccess({ descricao: descricao.trim(), valor: v, data: dataVal, responsavel: responsavel.trim() || null });
  };

  return (
    <Sheet title="Editar Gasto à Vista" onClose={onClose}>
      <Field label="DESCRIÇÃO">
        <input value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Ex: Mercado" style={iStyle(accent)} onFocus={e => (e.target.style.borderColor = accent)} onBlur={e => (e.target.style.borderColor = "#E7E0EC")} />
      </Field>
      <Field label="VALOR (R$)">
        <input value={valor} onChange={e => setValor(e.target.value)} type="text" inputMode="decimal" placeholder="0,00" style={iStyle(accent)} onFocus={e => (e.target.style.borderColor = accent)} onBlur={e => (e.target.style.borderColor = "#E7E0EC")} />
      </Field>
      <Field label="DATA">
        <input value={dataVal} onChange={e => setDataVal(e.target.value)} type="date" style={iStyle(accent)} onFocus={e => (e.target.style.borderColor = accent)} onBlur={e => (e.target.style.borderColor = "#E7E0EC")} />
      </Field>
      <Field label="RESPONSÁVEL (opcional)">
        <input value={responsavel} onChange={e => setResponsavel(e.target.value)} placeholder="Ex: João" style={iStyle(accent)} onFocus={e => (e.target.style.borderColor = accent)} onBlur={e => (e.target.style.borderColor = "#E7E0EC")} />
      </Field>
      <button onClick={submit} style={{ width: "100%", height: 50, borderRadius: 50, border: "none", background: `linear-gradient(135deg, ${accent}, ${accent}cc)`, color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: "'Roboto',sans-serif", marginTop: 4 }}>
        Salvar Alterações
      </button>
    </Sheet>
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

function iStyle(accent: string): React.CSSProperties {
  return { width: "100%", height: 48, borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", padding: "0 14px", fontSize: 15, color: "#fff", fontFamily: "'Roboto',sans-serif", outline: "none", boxSizing: "border-box", transition: "border-color 150ms" };
}

// ── Fatura Mês Seguinte Card ──────────────────────────────────────────────────
function FaturaMesSeguinteCard({
  accent,
  mesSeguinte,
  gastos,
  vencimentoDia,
  fechamentoDia,
  titulo,
}: {
  accent: string;
  mesSeguinte: number;
  gastos: any[];
  vencimentoDia: number;
  fechamentoDia: number | null;
  titulo?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  // Calcular o ciclo do MÊS SEGUINTE (proxVenc → proxProxVenc)
  const calcularProximoCiclo = () => {
    const hoje = new Date();
    const diaHoje = hoje.getDate();
    const mesHoje = hoje.getMonth();
    const anoHoje = hoje.getFullYear();

    let proxVenc: Date;

    if (fechamentoDia) {
      const ultimoFech = diaHoje < fechamentoDia
        ? new Date(anoHoje, mesHoje - 1, fechamentoDia, 23, 59, 59)
        : new Date(anoHoje, mesHoje, fechamentoDia, 23, 59, 59);
      proxVenc = vencimentoDia > fechamentoDia
        ? new Date(ultimoFech.getFullYear(), ultimoFech.getMonth(), vencimentoDia, 23, 59, 59)
        : new Date(ultimoFech.getFullYear(), ultimoFech.getMonth() + 1, vencimentoDia, 23, 59, 59);
      if (proxVenc < hoje) { proxVenc = new Date(proxVenc); proxVenc.setMonth(proxVenc.getMonth() + 1); }
    } else {
      const vencEsteMes = new Date(anoHoje, mesHoje, vencimentoDia, 23, 59, 59);
      proxVenc = vencEsteMes < hoje
        ? new Date(anoHoje, mesHoje + 1, vencimentoDia, 23, 59, 59)
        : vencEsteMes;
    }

    // Próximo ciclo: de proxVenc+1 até proxProxVenc
    const inicioCicloProx = new Date(proxVenc);
    inicioCicloProx.setDate(inicioCicloProx.getDate() + 1);
    inicioCicloProx.setHours(0, 0, 0, 0);

    const proxProxVenc = new Date(proxVenc);
    proxProxVenc.setMonth(proxProxVenc.getMonth() + 1);
    proxProxVenc.setHours(23, 59, 59);

    return { inicioCicloProx, proxProxVenc, proxVenc };
  };

  const { inicioCicloProx, proxProxVenc, proxVenc } = calcularProximoCiclo();

  // Filtrar gastos do próximo ciclo (parcelas não pagas com data entre proxVenc+1 e proxProxVenc)
  const gastosProxCiclo = gastos.filter((g: any) => {
    if (g.paga === 1) return false;
    if (!g.parcelamentoId) return false; // só parcelas entram no mês seguinte
    const dataG = new Date(g.data);
    return dataG > proxVenc && dataG <= proxProxVenc;
  }).sort((a: any, b: any) => new Date(a.data).getTime() - new Date(b.data).getTime());

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const fmtData = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

  return (
    <div style={{ margin: "12px 16px 0", borderRadius: 16, background: "rgba(255,255,255,0.05)", boxShadow: "0 2px 8px rgba(0,0,0,0.08)", overflow: "hidden" }}>
      {/* Header clicável */}
      <button
        onClick={() => setExpanded(e => !e)}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: "none", border: "none", cursor: "pointer", fontFamily: "'Roboto',sans-serif" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 18, background: `${accent}22`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Calendar size={18} color={accent} />
          </div>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{titulo ?? "Fatura Mês Seguinte"}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>
              {fmtData(inicioCicloProx)} → {fmtData(proxProxVenc)} · {gastosProxCiclo.length} parcela(s)
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: accent }}>{fmt(mesSeguinte)}</div>
          <ChevronDown size={18} color="#79747E" style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 200ms ease" }} />
        </div>
      </button>

      {/* Lista expandida */}
      {expanded && (
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "8px 0 4px" }}>
          {gastosProxCiclo.length === 0 ? (
            <div style={{ padding: "12px 16px", fontSize: 13, color: "rgba(255,255,255,0.4)", textAlign: "center" }}>
              Nenhuma parcela encontrada para o próximo ciclo.
            </div>
          ) : (
            gastosProxCiclo.map((g: any, i: number) => (
              <div key={g.id ?? i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: i < gastosProxCiclo.length - 1 ? "1px solid #F4EFF4" : "none" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {g.descricao}
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
                    {g.numeroParcela && g.totalParcelas ? `${g.numeroParcela}/${g.totalParcelas} · ` : ""}
                    Vence {new Date(g.data).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                    {g.responsavel ? ` · ${g.responsavel}` : ""}
                  </div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: accent, marginLeft: 12, whiteSpace: "nowrap" }}>
                  {fmt(Number(g.valor))}
                </div>
              </div>
            ))
          )}
          {/* Totalizador */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", background: `${accent}11`, margin: "4px 8px 8px", borderRadius: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.6)" }}>Total Mês Seguinte</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: accent }}>{fmt(mesSeguinte)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
