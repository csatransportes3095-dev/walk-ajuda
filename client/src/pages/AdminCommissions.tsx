import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { Download, CheckCircle, Clock, Users, ExternalLink, Hash, Package, TrendingUp, AlertCircle, Trash2, MessageCircle, Mail } from "lucide-react";
import AdminHeader from "@/components/AdminHeader";
import { useLocation } from "wouter";
import { toast } from "sonner";

function formatPhone(phone: string) {
  const d = phone.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return phone;
}

function formatDate(d: Date | number | null) {
  if (!d) return "—";
  const utcMs = typeof d === 'number' ? d : new Date(d).getTime();
  const spMs = utcMs - 3 * 60 * 60 * 1000;
  const sp = new Date(spMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(sp.getUTCDate())}/${pad(sp.getUTCMonth()+1)}/${String(sp.getUTCFullYear()).slice(-2)} ${pad(sp.getUTCHours())}:${pad(sp.getUTCMinutes())}`;
}

const STATUS_MAP_FALLBACK: Record<string, { label: string; color: string; bg: string }> = {
  recebido:             { label: "Recebido",              color: "text-blue-400",   bg: "bg-blue-500/10 border-blue-500/30" },
  pedido_recebido:      { label: "Pedido Recebido",       color: "text-blue-400",   bg: "bg-blue-500/10 border-blue-500/30" },
  em_andamento:         { label: "Em Andamento",          color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/30" },
  documentos_aprovados: { label: "Docs Aprovados",        color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/30" },
  conta_ativa:          { label: "Conta Ativa ✅",        color: "text-green-400",  bg: "bg-green-500/10 border-green-500/30" },
  cancelado:            { label: "Cancelado",             color: "text-red-400",    bg: "bg-red-500/10 border-red-500/30" },
};

export default function AdminCommissions() {
  useAdminAuth();
  const [, navigate] = useLocation();
  const [filterPaid, setFilterPaid] = useState<"all" | "pending" | "paid" | "invalid">("all");

  const commissionsQuery = trpc.orderStatus.listCommissions.useQuery();
  const statusTypesQuery = trpc.statusTypes.list.useQuery();
  const dynamicStatuses = statusTypesQuery.data ?? [];
  // Mapa dinâmico de status (prioriza banco, fallback para mapa estático)
  const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> =
    dynamicStatuses.length > 0
      ? Object.fromEntries(dynamicStatuses.map(s => [s.key, { label: s.label, color: s.color, bg: s.bgColor }]))
      : STATUS_MAP_FALLBACK;
  const toggleCommissionPaidMutation = trpc.orderStatus.toggleCommissionPaid.useMutation({
    onSuccess: (data, variables) => {
      commissionsQuery.refetch();
      if (variables.paid) {
        toast.success("Comissão marcada como paga! E-mail enviado ao indicador.");
        // Abrir WhatsApp automaticamente com mensagem de pagamento confirmado
        const wa = (data as any)?.whatsapp;
        if (wa?.phone) {
          const commText = wa.commissionValue > 0 ? `\n\n💰 Valor pago: R$ ${(wa.commissionValue / 100).toFixed(2).replace('.', ',')}` : '';
          const msg = `✅ Olá ${wa.name || 'indicador'}! Sua comissão pela indicação de ${wa.customerName} foi paga com sucesso!${commText}\n\nObrigado por indicar! 🎉`;
          window.open(`https://wa.me/55${wa.phone}?text=${encodeURIComponent(msg)}`, '_blank');
        }
      } else {
        toast.success("Comissão atualizada!");
      }
    },
    onError: () => toast.error("Erro ao atualizar comissão"),
  });
  const deleteCommissionMutation = trpc.orderStatus.deleteCommission.useMutation({
    onSuccess: () => { commissionsQuery.refetch(); toast.success("Indicação removida!"); setConfirmDelete(null); },
    onError: () => toast.error("Erro ao remover indicação"),
  });
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [confirmPayment, setConfirmPayment] = useState<number | null>(null);
  const [referralAction, setReferralAction] = useState<{ registrationId: number; mode: 'invalidate' | 'revalidate' } | null>(null);
  const [invalidReason, setInvalidReason] = useState('');
  const [resendingEmail, setResendingEmail] = useState<number | null>(null);

  const setReferralValidityMutation = trpc.orderStatus.setCommissionReferralValidity.useMutation({
    onSuccess: (data) => {
      commissionsQuery.refetch();
      setReferralAction(null);
      setInvalidReason('');
      toast.success((data as any).invalid ? 'Indicação marcada como não válida.' : 'Indicação revalidada.');
    },
    onError: (error) => toast.error(error.message),
  });

  const resendReferralEmailMutation = trpc.orderStatus.resendReferralEmail.useMutation({
    onSuccess: (data, variables) => {
      setResendingEmail(null);
      if ((data as any)?.success) toast.success("E-mail reenviado ao indicador!");
      else if ((data as any)?.reason === 'no_email') toast.error("Indicador sem e-mail cadastrado");
      else toast.error("Erro ao reenviar e-mail");
    },
    onError: () => { setResendingEmail(null); toast.error("Erro ao reenviar e-mail"); },
  });

  const all = commissionsQuery.data ?? [];

  // Filtrar por status de pagamento
  const filtered = all.filter(c => {
    const invalid = Boolean((c as any).referralInvalid);
    if (filterPaid === "all") return true;
    if (filterPaid === "paid") return c.commissionPaid === 1 && !invalid;
    if (filterPaid === "invalid") return invalid;
    return c.commissionPaid !== 1 && !invalid;
  });

  // Agrupar por indicador (nome + telefone)
  const grouped = filtered.reduce<Record<string, typeof filtered>>((acc, c) => {
    const key = `${c.referredBy}||${c.referredByPhone ?? ""}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(c);
    return acc;
  }, {});

  // Ordenar grupos: indicadores com mais pendentes primeiro
  const sortedGroups = Object.entries(grouped).sort(([, a], [, b]) => {
    const aPending = a.filter(x => x.commissionPaid !== 1 && !(x as any).referralInvalid).length;
    const bPending = b.filter(x => x.commissionPaid !== 1 && !(x as any).referralInvalid).length;
    return bPending - aPending;
  });

  const totalPending = all.filter(c => c.commissionPaid !== 1 && !(c as any).referralInvalid).length;
  const totalPaid = all.filter(c => c.commissionPaid === 1 && !(c as any).referralInvalid).length;
  const totalInvalid = all.filter(c => Boolean((c as any).referralInvalid)).length;

  // Contar indicadores únicos
  const uniqueReferrers = new Set(all.map(c => c.referredByPhone ?? c.referredBy)).size;

  // Totais financeiros
  const totalValuePending = all.filter(c => c.commissionPaid !== 1 && !(c as any).referralInvalid).reduce((sum, c) => sum + ((c as any).commissionValue ?? 0), 0);
  const totalValuePaid = all.filter(c => c.commissionPaid === 1 && !(c as any).referralInvalid).reduce((sum, c) => sum + ((c as any).commissionValue ?? 0), 0);

  function formatMoney(cents: number) {
    if (!cents) return "—";
    return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
  }

  function exportCSV() {
    const header = ["Indicador", "Tel. Indicador", "Total Indicações", "Cliente Indicado", "Tel. Cliente", "Serviço", "Opção", "Nº Pedido", "Status Pedido", "Comissão", "Data Pedido"];
    const rows = filtered.map(c => [
      c.referredBy,
      c.referredByPhone ?? "",
      String(c.totalReferrals ?? 0),
      c.customerName ?? c.phone,
      formatPhone(c.phone),
      c.serviceName ?? "",
      c.serviceOption ?? "",
      c.orderNumber ? String(c.orderNumber) : "",
      c.latestStatus ?? "Sem status",
      c.commissionPaid === 1 ? "Paga" : "Pendente",
      (c as any).commissionValue ? formatMoney((c as any).commissionValue) : "Não definido",
      formatDate(c.submittedAt),
    ]);
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `comissoes_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado!");
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AdminHeader title="Comissões / Indicações" backTo="/admin/orders" rightContent={
        <button onClick={exportCSV} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors">
          <Download className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">CSV</span>
        </button>
      } />

      <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">

        {/* Resumo em cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="bg-card border border-border rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-foreground">{all.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Total</p>
          </div>
          <div
            className={`bg-card border rounded-xl p-3 text-center cursor-pointer transition-all ${filterPaid === "pending" ? "border-red-500 ring-1 ring-red-500/50" : "border-red-500/30 hover:border-red-500/60"}`}
            onClick={() => setFilterPaid(filterPaid === "pending" ? "all" : "pending")}
          >
            <p className="text-2xl font-bold text-red-400">{totalPending}</p>
            {totalValuePending > 0 && <p className="text-[10px] text-red-300/80 font-mono">{formatMoney(totalValuePending)}</p>}
            <p className="text-xs text-muted-foreground mt-0.5">Pendentes</p>
          </div>
          <div
            className={`bg-card border rounded-xl p-3 text-center cursor-pointer transition-all ${filterPaid === "paid" ? "border-green-500 ring-1 ring-green-500/50" : "border-green-500/30 hover:border-green-500/60"}`}
            onClick={() => setFilterPaid(filterPaid === "paid" ? "all" : "paid")}
          >
            <p className="text-2xl font-bold text-green-400">{totalPaid}</p>
            {totalValuePaid > 0 && <p className="text-[10px] text-green-300/80 font-mono">{formatMoney(totalValuePaid)}</p>}
            <p className="text-xs text-muted-foreground mt-0.5">Pagas</p>
          </div>
          <div className="bg-card border border-zinc-500/30 rounded-xl p-3 text-center cursor-pointer" onClick={() => setFilterPaid(filterPaid === "invalid" ? "all" : "invalid")}>
            <p className="text-2xl font-bold text-zinc-300">{totalInvalid}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Não válidas</p>
          </div>
          <div className="bg-card border border-amber-500/30 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-amber-400">{uniqueReferrers}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Indicadores</p>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex gap-2 flex-wrap">
          {([
            { value: "all",     label: "Todas",       count: all.length },
            { value: "pending", label: "💰 Pendentes", count: totalPending },
            { value: "paid",    label: "✅ Pagas",     count: totalPaid },
            { value: "invalid", label: "⛔ Não válidas", count: totalInvalid },
          ] as const).map(f => (
            <button
              key={f.value}
              onClick={() => setFilterPaid(f.value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                filterPaid === f.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-border text-muted-foreground hover:border-primary/50"
              }`}
            >
              {f.label}
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${filterPaid === f.value ? "bg-white/20" : "bg-muted"}`}>
                {f.count}
              </span>
            </button>
          ))}
        </div>

        {/* Aviso se filtro ativo */}
        {filterPaid !== "all" && (
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border ${
            filterPaid === "pending"
              ? "bg-red-500/10 border-red-500/30 text-red-400"
              : filterPaid === "invalid"
                ? "bg-zinc-500/10 border-zinc-500/30 text-zinc-300"
                : "bg-green-500/10 border-green-500/30 text-green-400"
          }`}>
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            Mostrando apenas indicações {filterPaid === "pending" ? "pendentes" : filterPaid === "invalid" ? "não válidas" : "pagas"} — clique no card acima ou no filtro "Todas" para ver tudo
          </div>
        )}

        {/* Grupos por indicador */}
        {commissionsQuery.isLoading ? (
          <div className="text-center py-12 text-muted-foreground text-sm">Carregando...</div>
        ) : sortedGroups.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
            {filterPaid === "pending" ? "Nenhuma comissão pendente 🎉" : filterPaid === "paid" ? "Nenhuma comissão paga ainda" : "Nenhuma comissão encontrada"}
          </div>
        ) : (
          sortedGroups.map(([key, pedidos]) => {
            const pendentes = pedidos.filter(p => p.commissionPaid !== 1 && !(p as any).referralInvalid).length;
            const pagas = pedidos.filter(p => p.commissionPaid === 1 && !(p as any).referralInvalid).length;
            const invalidas = pedidos.filter(p => Boolean((p as any).referralInvalid)).length;
            const indicadorNome = pedidos[0]?.referredBy ?? "—";
            const indicadorPhone = pedidos[0]?.referredByPhone;
            const totalIndicacoes = pedidos[0]?.totalReferrals ?? pedidos.length;
            const totalPendenteValor = pedidos.filter(p => p.commissionPaid !== 1 && !(p as any).referralInvalid).reduce((s, p) => s + ((p as any).commissionValue ?? 0), 0);
            const totalPagoValor = pedidos.filter(p => p.commissionPaid === 1 && !(p as any).referralInvalid).reduce((s, p) => s + ((p as any).commissionValue ?? 0), 0);

            return (
              <div key={key} className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
                {/* Cabeçalho do indicador */}
                <div className={`px-4 py-3 border-b flex items-start justify-between gap-3 ${
                  pendentes > 0
                    ? "bg-amber-500/10 border-amber-500/20"
                    : "bg-green-500/5 border-green-500/15"
                }`}>
                  <div className="flex-shrink-0">
                    {pedidos[0]?.referrerPhotoUrl ? (
                      <img
                        src={pedidos[0].referrerPhotoUrl}
                        alt={indicadorNome}
                        className="w-12 h-12 rounded-full object-cover border-2 border-amber-400/40 shadow"
                        title={indicadorNome}
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-amber-500/20 border-2 border-amber-400/30 flex items-center justify-center">
                        <span className="text-amber-300 text-lg font-bold">{indicadorNome.charAt(0).toUpperCase()}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-sm text-amber-300">{indicadorNome}</p>
                      {indicadorPhone && (
                        <span className="text-xs text-muted-foreground font-mono">{formatPhone(indicadorPhone)}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <TrendingUp className="w-3 h-3" />
                        <span className="font-semibold text-foreground">{totalIndicacoes}</span> indicação{totalIndicacoes !== 1 ? "ões" : ""} no total
                      </span>
                      {totalPendenteValor > 0 && (
                        <span className="flex items-center gap-1 text-xs text-yellow-300 font-semibold">
                          💰 {formatMoney(totalPendenteValor)} a pagar
                        </span>
                      )}
                      {totalPagoValor > 0 && (
                        <span className="flex items-center gap-1 text-xs text-green-400 font-semibold">
                          ✅ {formatMoney(totalPagoValor)} pago
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                    {pendentes > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-red-500/20 border border-red-500/40 text-red-400 text-xs font-bold">
                        {pendentes} pendente{pendentes > 1 ? "s" : ""}
                      </span>
                    )}
                      {pagas > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-green-500/20 border border-green-500/40 text-green-400 text-xs font-bold">
                          {pagas} paga{pagas > 1 ? "s" : ""}
                        </span>
                      )}
                      {invalidas > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-zinc-500/20 border border-zinc-400/40 text-zinc-300 text-xs font-bold">
                          {invalidas} não válida{invalidas > 1 ? "s" : ""}
                        </span>
                      )}
                  </div>
                </div>

                {/* Pedidos do grupo */}
                <div className="divide-y divide-border">
                  {pedidos.map(c => {
                    const statusCfg = c.latestStatus ? STATUS_MAP[c.latestStatus] : null;
                    const isPaid = c.commissionPaid === 1;
                    const isInvalid = Boolean((c as any).referralInvalid);
                    const isReferralAction = referralAction?.registrationId === c.registrationId;
                    return (
                      <div key={c.registrationId} className={`px-4 py-3 flex items-start gap-3 ${isPaid ? "opacity-70" : ""}`}>
                        {/* Info do cliente indicado */}
                        <div className="flex-1 min-w-0 space-y-1">
                          {/* Nome e telefone do indicado */}
                          <div className="flex items-start gap-2 flex-wrap">
                            <div>
                              <p className="text-sm font-bold text-foreground leading-tight">
                                {c.customerName ?? "—"}
                              </p>
                              <p className="text-xs text-muted-foreground font-mono">{formatPhone(c.phone)}</p>
                            </div>
                          </div>

                          {/* Serviço e opção */}
                          {(c.serviceName || c.serviceOption) && (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Package className="w-3 h-3 text-primary/70 flex-shrink-0" />
                              <span className="text-xs text-primary/90 font-medium">{c.serviceName}</span>
                              {c.serviceOption && (
                                <>
                                  <span className="text-xs text-muted-foreground">›</span>
                                  <span className="text-xs text-muted-foreground">{c.serviceOption}</span>
                                </>
                              )}
                            </div>
                          )}

                          {/* Número do pedido + data */}
                          <div className="flex items-center gap-3 flex-wrap">
                            {c.orderNumber && (
                              <button
                                onClick={() => navigate(`/admin/orders/${c.registrationId}`)}
                                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                              >
                                <Hash className="w-3 h-3" />
                                <span className="font-mono font-bold">#{c.orderNumber}</span>
                                <ExternalLink className="w-2.5 h-2.5" />
                              </button>
                            )}
                            <span className="text-xs text-muted-foreground">{formatDate(c.submittedAt)}</span>
                          </div>

                          {/* Status do pedido + valor comissão — sempre visível */}
                          <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                            {c.latestStatus ? (
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                statusCfg ? `${statusCfg.bg} ${statusCfg.color}` : 'bg-zinc-500/10 border-zinc-500/30 text-zinc-400'
                              }`}>
                                <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80 flex-shrink-0" />
                                {statusCfg?.label ?? c.latestStatus}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border bg-zinc-500/10 border-zinc-500/30 text-zinc-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80 flex-shrink-0" />
                                Sem status
                              </span>
                            )}
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              isInvalid
                                ? 'bg-zinc-500/20 border-zinc-400/40 text-zinc-300'
                                : isPaid
                                  ? 'bg-green-500/20 border-green-500/40 text-green-400'
                                  : 'bg-red-500/20 border-red-500/40 text-red-400'
                            }`}>
                              {isInvalid ? '⛔ Indicação não válida' : <>💰 {(c as any).commissionValue > 0 ? formatMoney((c as any).commissionValue) : 'Valor não definido'}</>}
                            </span>
                            {isInvalid && (c as any).referralInvalidReason && (
                              <span className="text-[10px] text-zinc-400">Motivo: {(c as any).referralInvalidReason}</span>
                            )}
                          </div>
                        </div>

                        {/* Botões de ação */}
                        <div className="flex-shrink-0 flex flex-col items-end gap-1.5 pt-0.5">
                          {confirmPayment === c.registrationId ? (
                            <div className="w-full rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-2 space-y-1.5">
                              <p className="text-[10px] font-semibold text-emerald-300">Confirmar pagamento da comissão?</p>
                              <div className="flex gap-1.5">
                                <button onClick={() => toggleCommissionPaidMutation.mutate({ registrationId: c.registrationId, paid: true })} disabled={toggleCommissionPaidMutation.isPending} className="flex-1 rounded-md bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white disabled:opacity-50">Confirmar</button>
                                <button onClick={() => setConfirmPayment(null)} className="rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground">Cancelar</button>
                              </div>
                            </div>
                          ) : isPaid ? (
                            <button onClick={() => toggleCommissionPaidMutation.mutate({ registrationId: c.registrationId, paid: false })} disabled={toggleCommissionPaidMutation.isPending} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border bg-green-500/20 border-green-500/40 text-green-400 hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400 disabled:opacity-50" title="Clique para desfazer"><CheckCircle className="w-3.5 h-3.5" /> Paga</button>
                          ) : !isInvalid ? (
                            <button onClick={() => setConfirmPayment(c.registrationId)} disabled={toggleCommissionPaidMutation.isPending} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border bg-red-500/20 border-red-500/40 text-red-400 hover:bg-green-500/10 hover:border-green-500/30 hover:text-green-400 disabled:opacity-50" title="Marcar como paga"><Clock className="w-3.5 h-3.5" /> Pagar</button>
                          ) : null}
                          {isReferralAction ? (
                            <div className="w-full rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 space-y-1.5">
                              {referralAction?.mode === 'invalidate' ? <input value={invalidReason} onChange={e => setInvalidReason(e.target.value)} placeholder="Motivo obrigatório" className="w-full rounded-md border border-amber-500/30 bg-background px-2 py-1 text-[10px] text-foreground" autoFocus /> : <p className="text-[10px] font-semibold text-emerald-300">Revalidar esta indicação?</p>}
                              <div className="flex gap-1.5">
                                <button onClick={() => setReferralValidityMutation.mutate({ registrationId: c.registrationId, invalid: referralAction?.mode === 'invalidate', reason: referralAction?.mode === 'invalidate' ? invalidReason : undefined })} disabled={setReferralValidityMutation.isPending || (referralAction?.mode === 'invalidate' && !invalidReason.trim())} className="flex-1 rounded-md bg-amber-600 px-2 py-1 text-[10px] font-bold text-white disabled:opacity-50">Confirmar</button>
                                <button onClick={() => { setReferralAction(null); setInvalidReason(''); }} className="rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground">Cancelar</button>
                              </div>
                            </div>
                          ) : (
                            <button onClick={() => setReferralAction({ registrationId: c.registrationId, mode: isInvalid ? 'revalidate' : 'invalidate' })} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border ${isInvalid ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-zinc-500/40 bg-zinc-500/10 text-zinc-300 hover:bg-amber-500/10 hover:border-amber-500/40 hover:text-amber-300'}`} title={isInvalid ? 'Revalidar indicação' : 'Marcar como indicação não válida'}>{isInvalid ? '↺ Revalidar' : '⛔ Não válida'}</button>
                          )}
                          {/* Botão WhatsApp para o indicador */}
                          {indicadorPhone && (() => {
                            const waPhone = `55${indicadorPhone.replace(/\D/g, '')}`;
                            const commVal = (c as any).commissionValue;
                            const commText = commVal > 0 ? `\n\n💰 Comissão: R$ ${(commVal / 100).toFixed(2).replace('.', ',')}` : '';
                            const msg = `🎉 Olá ${indicadorNome}! Sua indicação deu certo!\n\nCliente: ${c.customerName ?? c.phone}\nTelefone: ${c.phone}${commText}\n\nA comissão será paga em breve. Obrigado!`;
                            return (
                              <a
                                href={`https://wa.me/${waPhone}?text=${encodeURIComponent(msg)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border bg-green-600/20 border-green-500/40 text-green-300 hover:bg-green-600/30 transition-colors"
                                title="Notificar indicador via WhatsApp"
                              >
                                <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                              </a>
                            );
                          })()}
                          {/* Botão WhatsApp solicitar PIX */}
                          {indicadorPhone && (() => {
                            const waPhone = `55${indicadorPhone.replace(/\D/g, '')}`;
                            const commVal = (c as any).commissionValue;
                            const commText = commVal > 0 ? ` de R$ ${(commVal / 100).toFixed(2).replace('.', ',')}` : '';
                            const msgPix = `Olá ${indicadorNome}! 🎉\n\nSua comissão${commText} está pronta para pagamento!\n\nPor favor, me informe sua chave PIX para realizar o pagamento. 💰\n\nObrigado!`;
                            return (
                              <a
                                href={`https://wa.me/${waPhone}?text=${encodeURIComponent(msgPix)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border bg-amber-600/20 border-amber-500/40 text-amber-300 hover:bg-amber-600/30 transition-colors"
                                title="Solicitar chave PIX via WhatsApp"
                              >
                                <MessageCircle className="w-3.5 h-3.5" /> Pedir PIX
                              </a>
                            );
                          })()}
                          {/* Botão Reenviar E-mail ao indicador */}
                          {indicadorPhone && (
                            <button
                              onClick={() => {
                                setResendingEmail(c.registrationId);
                                resendReferralEmailMutation.mutate({
                                  referrerPhone: indicadorPhone,
                                  referredName: c.customerName ?? c.phone,
                                  referredPhone: c.phone,
                                  commissionValue: (c as any).commissionValue ?? 0,
                                });
                              }}
                              disabled={resendingEmail === c.registrationId || resendReferralEmailMutation.isPending}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border bg-blue-600/20 border-blue-500/40 text-blue-300 hover:bg-blue-600/30 transition-colors disabled:opacity-50"
                              title="Reenviar e-mail de notificação ao indicador"
                            >
                              <Mail className="w-3.5 h-3.5" />
                              {resendingEmail === c.registrationId ? "Enviando..." : "Reenviar E-mail"}
                            </button>
                          )}
                          {confirmDelete === c.registrationId ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => deleteCommissionMutation.mutate({ registrationId: c.registrationId })}
                                disabled={deleteCommissionMutation.isPending}
                                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-red-600 text-white hover:bg-red-700 transition-colors"
                              >
                                Confirmar
                              </button>
                              <button
                                onClick={() => setConfirmDelete(null)}
                                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-card border border-border text-muted-foreground hover:text-foreground transition-colors"
                              >
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDelete(c.registrationId)}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium border border-red-500/30 text-red-400/70 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/50 transition-colors"
                              title="Remover indicação"
                            >
                              <Trash2 className="w-3 h-3" />
                              Deletar
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
