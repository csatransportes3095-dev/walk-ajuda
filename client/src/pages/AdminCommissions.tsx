import { useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { Download, CheckCircle, Clock, Users, ExternalLink, Hash, Package, TrendingUp, AlertCircle, Trash2, MessageCircle, Mail } from "lucide-react";
import AdminHeader from "@/components/AdminHeader";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { encodeWhatsappMessage, repairCommissionWhatsappMessage } from "@shared/whatsappMessageText";
import { classifyAdminCommission, adminCommissionTotals, ADMIN_COMMISSION_FILTER_LABELS, type AdminCommissionFilter } from "@shared/adminCommissionFilters";

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

function parseCommissionReaisToCents(value: string) {
  const clean = value.trim().replace(/\s/g, "");
  if (!clean) return 0;
  const normalized = clean.includes(",")
    ? clean.replace(/\./g, "").replace(",", ".")
    : clean;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : 0;
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
  const utils = trpc.useUtils();
  const [, navigate] = useLocation();
  const [filterPaid, setFilterPaid] = useState<AdminCommissionFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [manualCommissionValue, setManualCommissionValue] = useState("");
  const [manualEdit, setManualEdit] = useState<number | null>(null);
  const [manualEditValue, setManualEditValue] = useState("");
  const [manualEditStatus, setManualEditStatus] = useState<"a_liberar" | "liberado">("a_liberar");
  const saveManualCommission = trpc.orderStatus.setCommissionManual.useMutation({
    onSuccess: () => {
      setManualEdit(null);
      setManualEditValue("");
      void utils.orderStatus.listCommissions.invalidate();
      toast.success("Valor e status atualizados no site e na consulta H2 AUTO.");
    },
    onError: error => toast.error(error.message),
  });

  const commissionsQuery = trpc.orderStatus.listCommissions.useQuery();
  const customersQuery = trpc.customers.list.useQuery(undefined, {
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
  const statusTypesQuery = trpc.statusTypes.list.useQuery();
  const dynamicStatuses = statusTypesQuery.data ?? [];
  // Mapa dinâmico de status (prioriza banco, fallback para mapa estático)
  const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> =
    dynamicStatuses.length > 0
      ? Object.fromEntries(dynamicStatuses.map(s => [s.key, { label: s.label, color: s.color, bg: s.bgColor }]))
      : STATUS_MAP_FALLBACK;

  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [confirmPayment, setConfirmPayment] = useState<number | null>(null);
  const [batchPayment, setBatchPayment] = useState<{ key: string; ids: number[] } | null>(null);
  const [batchSaving, setBatchSaving] = useState(false);
  const batchRunningRef = useRef(false);
  const [referralAction, setReferralAction] = useState<{ registrationId: number; mode: 'invalidate' | 'revalidate' } | null>(null);
  const [invalidReason, setInvalidReason] = useState('');
  const [resendingEmail, setResendingEmail] = useState<number | null>(null);

  const toggleCommissionPaidMutation = trpc.orderStatus.toggleCommissionPaid.useMutation({
    onSuccess: (data, variables) => {
      // Fecha a confirmação imediatamente e atualiza o cache local antes de abrir o WhatsApp.
      // Assim, ao voltar para a tela, não entra novamente no fluxo de confirmação.
      setConfirmPayment(null);
      setManualCommissionValue("");
      utils.orderStatus.listCommissions.setData(undefined, (current: any) => {
        if (!Array.isArray(current)) return current;
        return current.map((item: any) => item.registrationId === variables.registrationId
          ? {
              ...item,
              commissionPaid: variables.paid ? 1 : 0,
              commissionStatus: variables.paid ? 'paga' : 'elegivel',
              commissionValue: variables.manualCommissionValue || item.commissionValue,
            }
          : item);
      });
      void commissionsQuery.refetch();

      if (variables.paid) {
        if (!batchRunningRef.current) toast.success("Pagamento da comissão confirmado.");
        const wa = (data as any)?.whatsapp;
        if (wa?.phone && !batchRunningRef.current) {
          const valueLine = wa.commissionValue > 0
            ? `\n💰 *Valor pago:* R$ ${(wa.commissionValue / 100).toFixed(2).replace('.', ',')}`
            : '';
          const msg = [
            '✅ *COMISSÃO PAGA*',
            '',
            `Olá, ${wa.name || 'indicador'}!`,
            '',
            'Sua comissão foi paga com sucesso.',
            `👤 *Cliente indicado:* ${wa.customerName || 'Cliente'}`,
            valueLine.trim(),
            '',
            'Obrigado pela indicação! 🎉',
          ].filter(Boolean).join('\n');
          window.open(`https://wa.me/55${String(wa.phone).replace(/\D/g, '')}?text=${encodeWhatsappMessage(repairCommissionWhatsappMessage(msg))}`, '_blank', 'noopener,noreferrer');
        }
      } else {
        toast.success("Pagamento da comissão desmarcado.");
      }
    },
    onError: (error) => {
      setConfirmPayment(null);
      setManualCommissionValue("");
      toast.error(error.message || "Erro ao atualizar comissão");
      void commissionsQuery.refetch();
    },
  });

  const deleteCommissionMutation = trpc.orderStatus.deleteCommission.useMutation({
    onSuccess: () => { commissionsQuery.refetch(); toast.success("Indicação removida!"); setConfirmDelete(null); },
    onError: () => toast.error("Erro ao remover indicação"),
  });

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
  const mainCustomers = (customersQuery.data ?? []) as unknown as Array<{ phone: string; name?: string | null; customerNumber?: number | null; profilePhotoUrl?: string | null }>;
  const normalizePhoneKey = (phone?: string | null) => String(phone || "").replace(/\D/g, "");
  const profilePhotoByPhone = new Map(
    mainCustomers
      .filter(customer => normalizePhoneKey(customer.phone))
      .map(customer => [normalizePhoneKey(customer.phone), customer.profilePhotoUrl || null] as const),
  );

  // Busca por indicador ou cliente indicado: nome, telefone e número de cadastro.
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const searchDigits = searchTerm.replace(/\D/g, "");
  const filtered = all.filter(c => {
    const statusMatches = filterPaid === "all" || classifyAdminCommission(c) === filterPaid;
    if (!statusMatches) return false;
    if (!normalizedSearch) return true;

    const textFields = [
      c.referredBy,
      c.customerName,
      c.referredByPhone,
      c.phone,
      (c as any).referrerCustomerNumber,
      (c as any).customerNumber,
    ].map(value => String(value ?? "").toLowerCase());

    if (textFields.some(value => value.includes(normalizedSearch))) return true;
    if (searchDigits) {
      return [
        c.referredByPhone,
        c.phone,
        (c as any).referrerCustomerNumber,
        (c as any).customerNumber,
      ].some(value => String(value ?? "").replace(/\D/g, "").includes(searchDigits));
    }
    return false;
  });

  // Agrupar por indicador (nome + telefone)
  const grouped = filtered.reduce<Record<string, typeof filtered>>((acc, c) => {
    const key = `${c.referredBy}||${c.referredByPhone ?? ""}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(c);
    return acc;
  }, {});

  const {counts,values}=adminCommissionTotals(all);
  const totalPending=counts.a_liberar, totalPaid=counts.paid, totalInvalid=counts.invalid;
  const sortedGroups=Object.entries(grouped).sort(([,a],[,b])=>b.length-a.length);
  const uniqueReferrers=new Set(all.map(c=>c.referredByPhone??c.referredBy)).size;
  const totalValuePending=values.a_liberar,totalValuePaid=values.paid;
  const totalARelease=values.a_liberar,totalReleased=values.liberado;
  const totalCommission=values.a_liberar+values.liberado+values.paid;

  async function confirmBatchPayment(pedidos: typeof all, indicadorNome: string, indicadorPhone: string) {
    if (batchSaving || batchRunningRef.current) return;
    const eligible = pedidos.filter(p =>
      classifyAdminCommission(p) === "liberado" && Number((p as any).commissionValue) > 0
    );
    if (!batchPayment || eligible.length < 2 ||
        eligible.length !== batchPayment.ids.length ||
        eligible.some(p => !batchPayment.ids.includes(p.registrationId))) {
      toast.error("A lista mudou. Confira as comissões antes de confirmar.");
      setBatchPayment(null);
      return;
    }
    batchRunningRef.current = true;
    setBatchSaving(true);
    const completed: typeof eligible = [];
    try {
      // Usa a mesma validação e atualização individual existente, sem duplicar lógica no servidor.
      // Para no primeiro erro e informa pagamentos parciais, nunca anuncia total incorreto.
      for (const p of eligible) {
        await toggleCommissionPaidMutation.mutateAsync({ registrationId: p.registrationId, paid: true });
        completed.push(p);
      }
      const total = completed.reduce((sum, p) => sum + Number((p as any).commissionValue), 0);
      toast.success(`${completed.length} comissões confirmadas — ${formatMoney(total)}.`);
      const phone = indicadorPhone.replace(/\\D/g, "").replace(/^55(?=\\d{10,11}$)/, "");
      if (phone.length === 10 || phone.length === 11) {
        const details = completed.map((p, i) =>
          `${i+1}️⃣ *${p.customerName || "Cliente indicado"}*\n📋 Cadastro: ${(p as any).customerNumber || p.registrationId}\n💰 Comissão: ${formatMoney(Number((p as any).commissionValue))}`
        );
        const message = [
          "✅ *COMISSÕES PAGAS*",
          "🇨🇴 *H2 COLOMBIANO*",
          "",
          `Olá, ${indicadorNome}!`,
          `Confirmamos o pagamento de *${completed.length} indicações*:`,
          "",
          ...details.flatMap(detail => [detail, ""]),
          `💰 *TOTAL PAGO: ${formatMoney(total)}*`,
          "",
          "Obrigado pelas indicações! 🎉",
          "🛡️ *EQUIPE H2 COLOMBIANO* 🇨🇴",
        ].join("\n");
        window.open(`https://wa.me/55${phone}?text=${encodeWhatsappMessage(repairCommissionWhatsappMessage(message))}`, "_blank", "noopener,noreferrer");
      } else {
        toast.warning("Pagamento registrado. Confira o telefone do indicador para notificar.");
      }
    } catch (error) {
      toast.error(`Operação interrompida: ${completed.length} de ${eligible.length} comissões confirmadas. Confira as restantes antes de tentar novamente.`, { duration: 10000 });
    } finally {
      batchRunningRef.current = false;
      setBatchSaving(false);
      setBatchPayment(null);
      void commissionsQuery.refetch();
    }
  }

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
      ADMIN_COMMISSION_FILTER_LABELS[classifyAdminCommission(c)],
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
      <style>{`
        @keyframes commissionNeonPending {
          0%, 100% { box-shadow: inset 3px 0 0 rgba(239,68,68,.75), 0 0 8px rgba(239,68,68,.10); }
          50% { box-shadow: inset 3px 0 0 rgba(248,113,113,1), 0 0 22px rgba(239,68,68,.42); }
        }
        @keyframes commissionNeonPaid {
          0%, 100% { box-shadow: inset 3px 0 0 rgba(34,197,94,.75), 0 0 8px rgba(34,197,94,.10); }
          50% { box-shadow: inset 3px 0 0 rgba(74,222,128,1), 0 0 22px rgba(34,197,94,.38); }
        }
        .commission-neon-pending { animation: commissionNeonPending 1.65s ease-in-out infinite; }
        .commission-neon-paid { animation: commissionNeonPaid 2.05s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .commission-neon-pending, .commission-neon-paid { animation: none; }
        }
      `}</style>
      <AdminHeader title="Comissões / Indicações" backTo="/admin/orders" rightContent={
        <button onClick={exportCSV} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors">
          <Download className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">CSV</span>
        </button>
      } />

      <div className="max-w-6xl mx-auto px-3 sm:px-5 py-5 space-y-5">

        <div className="rounded-2xl border border-cyan-400/25 bg-gradient-to-r from-cyan-500/10 via-blue-500/5 to-fuchsia-500/10 px-4 py-4 shadow-[0_0_24px_rgba(6,182,212,.08)]">
          <p className="text-xs font-black uppercase tracking-[.24em] text-cyan-300">🇨🇴 H2 COLOMBIANO • CENTRAL DE COMISSÕES</p>
          <h2 className="mt-2 text-xl sm:text-2xl font-black tracking-tight text-white">⚡ INDICAÇÕES & CONTROLE FINANCEIRO</h2>
          <p className="mt-1 text-xs text-slate-300">Configure o valor de cada indicação. Escolha A LIBERAR ou LIBERADO sem marcar o pagamento.</p>
        </div>
        {/* Resumo em cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="rounded-2xl border border-cyan-400/30 bg-gradient-to-br from-cyan-500/15 to-slate-950 p-4 text-center shadow-[0_0_18px_rgba(6,182,212,.10)]">
            <p className="text-2xl font-bold text-foreground">{all.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Total</p>
          </div>
          <div
            className={`bg-card border rounded-xl p-3 text-center cursor-pointer transition-all ${filterPaid === "a_liberar" ? "border-red-500 ring-1 ring-red-500/50" : "border-red-500/30 hover:border-red-500/60"}`}
            onClick={() => setFilterPaid(filterPaid === "a_liberar" ? "all" : "a_liberar")}
          >
            <p className="text-2xl font-bold text-red-400">{totalPending}</p>
            {totalValuePending > 0 && <p className="text-[10px] text-red-300/80 font-mono">{formatMoney(totalValuePending)}</p>}
            <p className="text-xs text-muted-foreground mt-0.5">A liberar</p>
          </div>
          <div
            className={`bg-card border rounded-xl p-3 text-center cursor-pointer transition-all ${filterPaid === "paid" ? "border-green-500 ring-1 ring-green-500/50" : "border-green-500/30 hover:border-green-500/60"}`}
            onClick={() => setFilterPaid(filterPaid === "paid" ? "all" : "paid")}
          >
            <p className="text-2xl font-bold text-green-400">{totalPaid}</p>
            {totalValuePaid > 0 && <p className="text-[10px] text-green-300/80 font-mono">{formatMoney(totalValuePaid)}</p>}
            <p className="text-xs text-muted-foreground mt-0.5">Pagas</p>
          </div>
          <div className="rounded-2xl border border-zinc-500/40 bg-gradient-to-br from-zinc-500/15 to-slate-950 p-4 text-center cursor-pointer shadow-lg transition hover:border-zinc-300/50" onClick={() => setFilterPaid(filterPaid === "invalid" ? "all" : "invalid")}>
            <p className="text-2xl font-bold text-zinc-300">{totalInvalid}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Inválidas / Promoção</p>
          </div>
          <div className="rounded-2xl border border-amber-500/40 bg-gradient-to-br from-amber-500/15 to-slate-950 p-4 text-center shadow-[0_0_18px_rgba(245,158,11,.10)]">
            <p className="text-2xl font-bold text-amber-400">{uniqueReferrers}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Indicadores</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-2xl border border-amber-400/40 bg-gradient-to-br from-amber-500/15 to-slate-950 p-4 shadow-[0_0_16px_rgba(245,158,11,.12)]">
            <p className="text-xs font-black tracking-wider text-amber-300">⏳ VALOR A LIBERAR</p>
            <p className="mt-2 text-xl font-black tabular-nums text-white">{formatMoney(totalARelease)}</p>
          </div>
          <div className="rounded-2xl border border-emerald-400/40 bg-gradient-to-br from-emerald-500/15 to-slate-950 p-4 shadow-[0_0_16px_rgba(16,185,129,.12)]">
            <p className="text-xs font-black tracking-wider text-emerald-300">✅ VALOR LIBERADO</p>
            <p className="mt-2 text-xl font-black tabular-nums text-white">{formatMoney(totalReleased)}</p>
          </div>
          <div className="rounded-2xl border border-cyan-400/40 bg-gradient-to-br from-cyan-500/15 to-slate-950 p-4 shadow-[0_0_16px_rgba(6,182,212,.12)]">
            <p className="text-xs font-black tracking-wider text-cyan-300">💰 VALOR TOTAL</p>
            <p className="mt-2 text-xl font-black tabular-nums text-white">{formatMoney(totalCommission)}</p>
          </div>
        </div>

        {/* Busca rápida */}
        <div className="relative">
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Buscar por nome, telefone ou nº de cadastro..."
            className="w-full rounded-xl border border-cyan-500/30 bg-card px-4 py-3 pr-10 text-sm text-foreground outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs font-bold text-muted-foreground hover:text-foreground"
            >
              Limpar
            </button>
          )}
        </div>

        {/* Filtros */}
        <div className="flex gap-2 flex-wrap">
          {([
            {value:"all",label:"Todas",count:counts.all},
            {value:"a_liberar",label:"⏳ A liberar",count:counts.a_liberar},
            {value:"liberado",label:"✅ Liberado",count:counts.liberado},
            {value:"paid",label:"💵 Já pagas",count:counts.paid},
            {value:"invalid",label:"⛔ Inválidas / Promoção",count:counts.invalid},
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

        {filterPaid !== "all" && (
          <div className="flex items-center gap-2 rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100">
            <AlertCircle className="h-3.5 w-3.5 shrink-0"/>
            Exibindo somente: {ADMIN_COMMISSION_FILTER_LABELS[filterPaid]} — {counts[filterPaid]} indicação(ões).
          </div>
        )}
        {/* Grupos por indicador */}
        {commissionsQuery.isLoading ? (
          <div className="text-center py-12 text-muted-foreground text-sm">Carregando...</div>
        ) : sortedGroups.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
            {`Nenhuma indicação em ${ADMIN_COMMISSION_FILTER_LABELS[filterPaid].toLowerCase()}`}
          </div>
        ) : (
          sortedGroups.map(([key, pedidos]) => {
            const pendentes = pedidos.filter(p => classifyAdminCommission(p) === "a_liberar").length;
            const pagas = pedidos.filter(p => classifyAdminCommission(p) === "paid").length;
            const invalidas = pedidos.filter(p => classifyAdminCommission(p) === "invalid").length;
            const indicadorNome = pedidos[0]?.referredBy ?? "—";
            const indicadorPhone = pedidos[0]?.referredByPhone;
            const indicadorPhotoUrl = indicadorPhone
              ? (profilePhotoByPhone.get(normalizePhoneKey(indicadorPhone)) || null)
              : null;
            const totalIndicacoes = pedidos.length;
            const totalPendenteValor = pedidos.filter(p => classifyAdminCommission(p) === "a_liberar").reduce((s, p) => s + ((p as any).commissionValue ?? 0), 0);
            const totalPagoValor = pedidos.filter(p => classifyAdminCommission(p) === "paid").reduce((s, p) => s + ((p as any).commissionValue ?? 0), 0);
            const readyForBatch = pedidos.filter(p => classifyAdminCommission(p) === "liberado" && Number((p as any).commissionValue) > 0);
            const batchTotal = readyForBatch.reduce((sum, p) => sum + Number((p as any).commissionValue), 0);
            const isBatchConfirming = batchPayment?.key === key;

            return (
              <div key={key} className="overflow-hidden rounded-2xl border border-cyan-400/25 bg-gradient-to-b from-[#10172a] to-[#090e1d] shadow-[0_0_26px_rgba(14,165,233,.10)] transition-all hover:border-cyan-400/45">
                {/* Cabeçalho do indicador */}
                <div className={`px-4 py-4 border-b flex flex-wrap items-start justify-between gap-3 ${
                  pendentes > 0
                    ? "bg-amber-500/10 border-amber-500/20"
                    : "bg-green-500/5 border-green-500/15"
                }`}>
                  <div className="flex-shrink-0">
                    {indicadorPhotoUrl ? (
                      <img
                        src={indicadorPhotoUrl}
                        alt={indicadorNome}
                        className="w-12 h-12 rounded-full object-cover border-2 border-amber-400/40 shadow"
                        title={`${indicadorNome} — foto do cadastro principal`}
                        onError={(event) => {
                          event.currentTarget.style.display = "none";
                          const fallback = event.currentTarget.nextElementSibling as HTMLElement | null;
                          if (fallback) fallback.style.display = "flex";
                        }}
                      />
                    ) : null}
                    <div
                      className="w-12 h-12 rounded-full bg-amber-500/20 border-2 border-amber-400/30 items-center justify-center"
                      style={{ display: indicadorPhotoUrl ? "none" : "flex" }}
                    >
                      <span className="text-amber-300 text-lg font-bold">{indicadorNome.charAt(0).toUpperCase()}</span>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-sm text-amber-300">{indicadorNome}</p>
                      {indicadorPhone && (
                        <span className="text-xs text-muted-foreground font-mono">{formatPhone(indicadorPhone)}</span>
                      )}
                      {(pedidos[0] as any)?.referrerCustomerNumber && (
                        <span className="text-[10px] font-bold text-cyan-300">Cadastro *{(pedidos[0] as any).referrerCustomerNumber}</span>
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
                    {readyForBatch.length >= 2 && (
                      <div className="w-full sm:w-auto rounded-xl border border-emerald-400/40 bg-emerald-500/10 p-2">
                        <div className="text-xs font-bold text-emerald-300">
                          {readyForBatch.length} liberadas • {formatMoney(batchTotal)}
                        </div>
                        {isBatchConfirming ? (
                          <div className="mt-2 space-y-2">
                            <p className="text-xs text-white">Confirmar {readyForBatch.length} pagamentos de {formatMoney(batchTotal)}?</p>
                            <div className="max-h-36 overflow-y-auto text-[11px] text-slate-200">
                              {readyForBatch.map(p => <p key={p.registrationId}>{p.customerName || "Cliente"} — {formatMoney(Number((p as any).commissionValue))}</p>)}
                            </div>
                            <div className="flex gap-2">
                              <button disabled={batchSaving || toggleCommissionPaidMutation.isPending} onClick={() => void confirmBatchPayment(pedidos, indicadorNome, indicadorPhone || "")} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                                {batchSaving ? "Confirmando..." : "CONFIRMAR TODAS"}
                              </button>
                              <button disabled={batchSaving} onClick={() => setBatchPayment(null)} className="rounded-lg border border-slate-500 px-3 py-2 text-xs text-white disabled:opacity-50">Cancelar</button>
                            </div>
                          </div>
                        ) : (
                          <button disabled={batchSaving || toggleCommissionPaidMutation.isPending} onClick={() => { setConfirmPayment(null); setBatchPayment({ key, ids: readyForBatch.map(p => p.registrationId) }); }} className="mt-1 w-full rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50">💰 PAGAR TODAS</button>
                        )}
                      </div>
                    )}
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
                <div className="divide-y divide-cyan-500/15">
                  {pedidos.map(c => {
                    const statusCfg = c.latestStatus ? STATUS_MAP[c.latestStatus] : null;
                    const commissionStatus = (c as any).commissionStatus as string | undefined;
                    const isPaid = classifyAdminCommission(c) === "paid";
                    const isInvalid = classifyAdminCommission(c) === "invalid";
                    const isPromotion = Boolean((c as any).promotionNoCommission);
                    const isEligible = classifyAdminCommission(c) === "liberado";
                    const isUnderReview = classifyAdminCommission(c) === "a_liberar";
                    const manualState = (c as any).manualStatus as "a_liberar" | "liberado" | null;
                    const isReferralAction = referralAction?.registrationId === c.registrationId;
                    return (
                      <div
                        key={c.registrationId}
                        className={`px-4 py-4 flex flex-col xl:flex-row xl:items-start gap-4 rounded-xl transition-colors hover:bg-cyan-500/5 ${isInvalid ? "" : isPaid ? "commission-neon-paid" : "commission-neon-pending"}`}
                      >
                        {/* Info do cliente indicado */}
                        <div className="flex-1 min-w-0 space-y-1">
                          {/* Nome e telefone do indicado */}
                          <div className="flex items-start gap-2 flex-wrap">
                            <div>
                              <p className="text-sm font-bold text-foreground leading-tight">
                                {c.customerName ?? "—"}
                              </p>
                              <p className="text-xs text-muted-foreground font-mono">{formatPhone(c.phone)}</p>
                              {(c as any).customerNumber && (
                                <p className="text-[10px] font-bold text-cyan-300">Cadastro *{(c as any).customerNumber}</p>
                              )}
                            </div>
                          </div>

                          {/* Valor registrado no pedido, independente da comissão */}
                          <div className="text-xs font-bold text-sky-300">
                            🛒 Valor do produto: {(c as any).productPurchasePrice || "Não informado no pedido"}
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

                          {manualState && !isInvalid && !isPaid && (
                            <div className={`mt-2 rounded-lg border px-3 py-2 text-xs font-black ${manualState==="liberado"?"border-emerald-400/50 bg-emerald-500/10 text-emerald-300":"border-amber-400/50 bg-amber-500/10 text-amber-300"}`}>
                              {manualState==="liberado"?"✅ LIBERADO":"⏳ A LIBERAR"} · {formatMoney((c as any).commissionValue||0)}
                            </div>
                          )}
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
                              {isInvalid
                                ? (isPromotion || String((c as any).referralInvalidReason || "").toLowerCase().includes("promoção") ? '🏷️ PROMOÇÃO — SEM COMISSÃO' : '⛔ Indicação não válida')
                                : isPaid
                                  ? <>✅ Pagamento confirmado{(c as any).commissionValue > 0 ? ` · ${formatMoney((c as any).commissionValue)}` : ''}</>
                                  : isUnderReview
                                    ? <>🔎 Comissão em análise · {formatMoney((c as any).commissionValue)}</>
                                    : <>💰 {(c as any).paymentLabel || 'Aguardando confirmação'} · {(c as any).commissionValue > 0 ? formatMoney((c as any).commissionValue) : 'Valor não definido'}</>}
                            </span>
                            {isInvalid && (c as any).referralInvalidReason && (
                              <span className="text-[10px] text-zinc-400">Motivo: {(c as any).referralInvalidReason}</span>
                            )}
                          </div>
                        </div>

                        {/* Controle por indicação: o estado liberado não é pagamento */}
                        {!isInvalid && !isPaid && (
                          <div className="min-w-[180px] rounded-xl border border-cyan-400/30 bg-slate-950/90 p-3 space-y-2 shadow-[0_0_18px_rgba(34,211,238,.12)]">
                            {manualEdit === c.registrationId ? (
                              <>
                                <p className="text-xs font-black text-cyan-200">⚡ VALOR E STATUS</p>
                                <label className="block text-xs font-semibold text-slate-200">Comissão (R$)</label>
                                <input value={manualEditValue} inputMode="decimal"
                                  onChange={e=>setManualEditValue(e.target.value.replace(/[^0-9.,]/g,""))}
                                  placeholder="50,00"
                                  className="w-full rounded-lg border border-cyan-400/40 bg-slate-900 px-3 py-2 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-cyan-400/30" />
                                <div className="grid grid-cols-2 gap-2">
                                  <button type="button" onClick={()=>setManualEditStatus("a_liberar")}
                                    className={`rounded-lg border px-2 py-2 text-xs font-bold ${manualEditStatus==="a_liberar"?"border-amber-400 bg-amber-500/20 text-amber-200":"border-slate-700 text-slate-400"}`}>⏳ A LIBERAR</button>
                                  <button type="button" onClick={()=>setManualEditStatus("liberado")}
                                    className={`rounded-lg border px-2 py-2 text-xs font-bold ${manualEditStatus==="liberado"?"border-emerald-400 bg-emerald-500/20 text-emerald-200":"border-slate-700 text-slate-400"}`}>✅ LIBERADO</button>
                                </div>
                                <p className="text-[10px] text-slate-400">Liberado não é pago. O pagamento é separado.</p>
                                <div className="flex flex-wrap gap-2">
                                  <button type="button" disabled={saveManualCommission.isPending || parseCommissionReaisToCents(manualEditValue)<=0}
                                    onClick={()=>saveManualCommission.mutate({
                                      registrationId:c.registrationId,
                                      commissionValue:parseCommissionReaisToCents(manualEditValue),
                                      releaseStatus:manualEditStatus,
                                    })}
                                    className="rounded-lg bg-cyan-400 px-3 py-2 text-xs font-black text-slate-950 disabled:opacity-40">
                                    {saveManualCommission.isPending?"Salvando...":"SALVAR"}
                                  </button>
                                  <button type="button" onClick={()=>setManualEdit(null)}
                                    disabled={saveManualCommission.isPending}
                                    className="rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-200">Cancelar</button>
                                </div>
                              </>
                            ) : (
                              <button type="button"
                                onClick={()=>{
                                  setManualEdit(c.registrationId);
                                  setManualEditValue((Number((c as any).commissionValue||0)/100).toFixed(2).replace(".",","));
                                  setManualEditStatus((c as any).manualStatus==="liberado"?"liberado":"a_liberar");
                                }}
                                className="w-full rounded-lg border border-cyan-400/35 bg-cyan-500/10 px-3 py-2 text-xs font-black text-cyan-200 hover:bg-cyan-500/20">
                                ✎ DEFINIR VALOR E STATUS
                              </button>
                            )}
                          </div>
                        )}
                        {/* Botões de ação */}
                        <div className="w-full xl:w-auto flex-shrink-0 flex flex-row flex-wrap xl:flex-col items-start xl:items-stretch gap-2 pt-0.5">
                          {confirmPayment === c.registrationId ? (
                            <div className="w-full min-w-[220px] rounded-lg border border-emerald-500/50 bg-emerald-500/10 p-2 space-y-2 shadow-[0_0_18px_rgba(34,197,94,0.12)]">
                              <p className="text-[10px] font-semibold text-emerald-300">Autorizar pagamento da comissão?</p>
                              {(c as any).commissionValue > 0 ? (
                                <p className="text-xs font-black text-white">{formatMoney((c as any).commissionValue)}</p>
                              ) : (
                                <div className="space-y-1">
                                  <label className="block text-[10px] font-bold text-amber-300">Valor manual da comissão (R$)</label>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={manualCommissionValue}
                                    onChange={(event) => setManualCommissionValue(event.target.value.replace(/[^0-9.,]/g, ""))}
                                    placeholder="Ex: 50,00"
                                    className="w-full rounded-md border border-amber-500/40 bg-background px-2 py-1.5 text-xs font-bold text-foreground outline-none focus:border-amber-400"
                                    autoFocus
                                  />
                                  <p className="text-[9px] text-muted-foreground">Este valor vale somente para esta comissão.</p>
                                </div>
                              )}
                              <div className="flex gap-1.5">
                                <button
                                  onClick={() => {
                                    const cents = parseCommissionReaisToCents(manualCommissionValue);
                                    toggleCommissionPaidMutation.mutate({
                                      registrationId: c.registrationId,
                                      paid: true,
                                      ...((c as any).commissionValue > 0 ? {} : { manualCommissionValue: cents }),
                                    });
                                  }}
                                  disabled={
                                    toggleCommissionPaidMutation.isPending ||
                                    ((c as any).commissionValue <= 0 && parseCommissionReaisToCents(manualCommissionValue) <= 0)
                                  }
                                  className="flex-1 rounded-md bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white disabled:opacity-50"
                                >
                                  {toggleCommissionPaidMutation.isPending ? 'Salvando...' : 'AUTORIZAR'}
                                </button>
                                <button
                                  onClick={() => { setConfirmPayment(null); setManualCommissionValue(""); }}
                                  disabled={toggleCommissionPaidMutation.isPending}
                                  className="rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground disabled:opacity-50"
                                >
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          ) : isPaid ? (
                            <button onClick={() => toggleCommissionPaidMutation.mutate({ registrationId: c.registrationId, paid: false })} disabled={toggleCommissionPaidMutation.isPending} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border bg-green-500/20 border-green-500/40 text-green-400 hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400 disabled:opacity-50" title="Clique para desfazer"><CheckCircle className="w-3.5 h-3.5" /> Pagamento confirmado</button>
                          ) : !isInvalid && isEligible ? (
                            <button onClick={() => { setManualCommissionValue(""); setConfirmPayment(c.registrationId); }} disabled={toggleCommissionPaidMutation.isPending} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border bg-red-500/20 border-red-500/40 text-red-400 hover:bg-green-500/10 hover:border-green-500/30 hover:text-green-400 disabled:opacity-50" title="Marcar como paga"><Clock className="w-3.5 h-3.5" /> Pagar</button>
                          ) : null}
                          {!isPromotion && isReferralAction ? (
                            <div className="w-full rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 space-y-1.5">
                              {referralAction?.mode === 'invalidate' ? <input value={invalidReason} onChange={e => setInvalidReason(e.target.value)} placeholder="Motivo obrigatório" className="w-full rounded-md border border-amber-500/30 bg-background px-2 py-1 text-[10px] text-foreground" autoFocus /> : <p className="text-[10px] font-semibold text-emerald-300">Revalidar esta indicação?</p>}
                              <div className="flex gap-1.5">
                                <button onClick={() => setReferralValidityMutation.mutate({ registrationId: c.registrationId, invalid: referralAction?.mode === 'invalidate', reason: referralAction?.mode === 'invalidate' ? invalidReason : undefined })} disabled={setReferralValidityMutation.isPending || (referralAction?.mode === 'invalidate' && !invalidReason.trim())} className="flex-1 rounded-md bg-amber-600 px-2 py-1 text-[10px] font-bold text-white disabled:opacity-50">Confirmar</button>
                                <button onClick={() => { setReferralAction(null); setInvalidReason(''); }} className="rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground">Cancelar</button>
                              </div>
                            </div>
                          ) : isPromotion ? null : isUnderReview ? (
                            <div className="flex flex-wrap gap-2">
                              <button onClick={() => setReferralAction({ registrationId: c.registrationId, mode: 'revalidate' })} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20" title="Aprovar comissão"><CheckCircle className="w-3.5 h-3.5" /> Aprovar</button>
                              <button onClick={() => { setInvalidReason("Produto em promoção: sem comissão de indicação."); setReferralAction({ registrationId: c.registrationId, mode: 'invalidate' }); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20" title="Classificar promoção ou indicação inválida">⛔ Invalidar / Promoção</button>
                            </div>
                          ) : (
                            <button onClick={() => setReferralAction({ registrationId: c.registrationId, mode: isInvalid ? 'revalidate' : 'invalidate' })} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border ${isInvalid ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-zinc-500/40 bg-zinc-500/10 text-zinc-300 hover:bg-amber-500/10 hover:border-amber-500/40 hover:text-amber-300'}`} title={isInvalid ? 'Revalidar indicação' : 'Marcar como indicação não válida'}>{isInvalid ? '↺ Revalidar' : '⛔ Não válida'}</button>
                          )}
                          {/* Botão WhatsApp para o indicador */}
                          {indicadorPhone && (() => {
                            const waPhone = `55${indicadorPhone.replace(/\D/g, '')}`;
                            const commVal = (c as any).commissionValue;
                            const valueLine = commVal > 0 ? `💰 *Comissão:* R$ ${(commVal / 100).toFixed(2).replace('.', ',')}` : '';
                            const msg = [
                              '🎉 *INDICAÇÃO CONFIRMADA*',
                              '',
                              `Olá, ${indicadorNome}!`,
                              '',
                              'Sua indicação deu certo.',
                              `👤 *Cliente indicado:* ${c.customerName ?? c.phone}`,
                              `📱 *Telefone:* ${formatPhone(c.phone)}`,
                              valueLine,
                              '',
                              isPaid ? '✅ *Pagamento da comissão confirmado.*' : 'A comissão será paga em breve.',
                              '',
                              'Obrigado pela indicação!',
                            ].filter(Boolean).join('\n');
                            return (
                              <a
                                href={`https://wa.me/${waPhone}?text=${encodeWhatsappMessage(repairCommissionWhatsappMessage(msg))}`}
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
                            const valueLine = commVal > 0 ? `💰 *Valor da comissão:* R$ ${(commVal / 100).toFixed(2).replace('.', ',')}` : '';
                            const msgPix = [
                              '💳 *DADOS PARA PAGAMENTO DA COMISSÃO*',
                              '',
                              `Olá, ${indicadorNome}!`,
                              '',
                              'Sua comissão está pronta para pagamento.',
                              valueLine,
                              '',
                              'Por favor, envie sua *chave PIX* para realizarmos o pagamento.',
                              '',
                              'Obrigado!',
                            ].filter(Boolean).join('\n');
                            return (
                              <a
                                href={`https://wa.me/${waPhone}?text=${encodeWhatsappMessage(repairCommissionWhatsappMessage(msgPix))}`}
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
