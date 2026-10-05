import { prepareWhatsappMessage } from "@shared/whatsappMessageText";
import { buildWhatsappMessageUrl } from "@shared/whatsappUrl";
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Gift, Plus, Trash2, Play, Eye, EyeOff, Edit2, Trophy, Users, Shield, Key, Ticket, Package, Globe, Lock, ExternalLink, Save, Copy, MessageCircle, CalendarClock, ImageDown, CreditCard } from "lucide-react";
import AdminHeader from "@/components/AdminHeader";

type Raffle = {
  id: number;
  title: string;
  description: string | null;
  status: "open" | "closed" | "drawn";
  winnerNumber: number | null;
  winnerName: string | null;
  winnerPhone: string | null;
  winnerEmail?: string | null;
  winnerProfilePhotoUrl?: string | null;
  drawnAt: Date | null;
  createdAt: Date;
  maxNumbersPerPerson: number | null;
  drawMode?: "manual" | "automatic";
  scheduledDrawAt?: Date | null;
  drawEligibility?: "all" | "paid";
  autoDrawState?: "idle" | "scheduled" | "processing" | "completed" | "failed";
  autoDrawError?: string | null;
  prizeStatus?: "awaiting_contact" | "pix_requested" | "pix_received" | "paid" | null;
};

type RaffleEntry = {
  id: number;
  raffleId: number;
  number: number;
  customerName: string;
  customerPhone: string;
  paymentStatus: 'pending' | 'paid';
  createdAt: Date;
};

export default function AdminRaffles() {
  const utils = trpc.useUtils();
  const { data: raffles, isLoading } = trpc.raffles.list.useQuery(undefined, {
  });
  const createMutation = trpc.raffles.create.useMutation({ onSuccess: () => utils.raffles.list.invalidate() });
  const updateMutation = trpc.raffles.update.useMutation({ onSuccess: () => { utils.raffles.list.invalidate(); utils.raffles.getById.invalidate(); } });
  const deleteMutation = trpc.raffles.delete.useMutation({ onSuccess: () => utils.raffles.list.invalidate() });
  const drawMutation = trpc.raffles.draw.useMutation({ onSuccess: () => { utils.raffles.list.invalidate(); utils.raffles.getById.invalidate(); } });
  const updateEntryPaymentMutation = trpc.raffles.updateEntryPayment.useMutation({
    onSuccess: () => { utils.raffles.getById.invalidate(); toast.success('Status atualizado!'); },
    onError: () => toast.error('Erro ao atualizar status'),
  });
  const prizeStatusMutation = trpc.raffles.updatePrizeStatus.useMutation({
    onSuccess: () => { utils.raffles.list.invalidate(); utils.raffles.getById.invalidate(); },
    onError: () => toast.error("Erro ao atualizar pagamento do prêmio"),
  });
  const removeEntryMutation = trpc.raffles.removeEntry.useMutation({
    onSuccess: () => {
      utils.raffles.getById.invalidate();
      utils.raffles.list.invalidate();
      toast.success('Número liberado com sucesso!');
      setConfirmRemoveEntry(null);
    },
    onError: (error) => toast.error(error.message || 'Erro ao liberar número'),
  });

  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newMaxNumbers, setNewMaxNumbers] = useState(1);
  const [newDrawMode, setNewDrawMode] = useState<"manual" | "automatic">("manual");
  const [newScheduledAt, setNewScheduledAt] = useState("");
  const [newDrawEligibility, setNewDrawEligibility] = useState<"all" | "paid">("paid");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editMaxNumbers, setEditMaxNumbers] = useState(1);
  const [editDrawMode, setEditDrawMode] = useState<"manual" | "automatic">("manual");
  const [editScheduledAt, setEditScheduledAt] = useState("");
  const [editDrawEligibility, setEditDrawEligibility] = useState<"all" | "paid">("paid");
  const [viewingId, setViewingId] = useState<number | null>(null);
  const [confirmRemoveEntry, setConfirmRemoveEntry] = useState<{ entryId: number; raffleId: number; number: number; name: string } | null>(null);
  const [releasingEntry, setReleasingEntry] = useState(false);
  const [whatsappListMode, setWhatsappListMode] = useState<"all" | "paid" | "pending">("all");

  // Configuração de senha do sorteio
  const { data: raffleConfig, refetch: refetchRaffleConfig } = trpc.raffleAccess.getConfig.useQuery();
  const saveRaffleConfigMutation = trpc.raffleAccess.saveConfig.useMutation({
    onSuccess: () => { toast.success('Configurações salvas!'); refetchRaffleConfig(); },
    onError: () => toast.error('Erro ao salvar configurações'),
  });
  const [rafflePassword, setRafflePassword] = useState('');
  const [rafflePasswordEnabled, setRafflePasswordEnabled] = useState('0');
  const [raffleTitle, setRaffleTitle] = useState('');
  const [raffleSubtitle, setRaffleSubtitle] = useState('');
  const [showRafflePassword, setShowRafflePassword] = useState(false);
  useEffect(() => {
    if (raffleConfig) {
      setRafflePassword(raffleConfig.password || '');
      setRafflePasswordEnabled(raffleConfig.enabled || '0');
      setRaffleTitle(raffleConfig.title || 'SORTEIO');
      setRaffleSubtitle(raffleConfig.subtitle || 'Participe do nosso sorteio exclusivo!');
    }
  }, [raffleConfig]);

  const { data: viewingRaffle } = trpc.raffles.getById.useQuery(
    { id: viewingId! },
    { enabled: viewingId !== null }
  );

  // Auth checks
  if (isLoading) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><div className="text-white/60">Carregando...</div></div>;
  }
  const releasePendingNumber = async () => {
    if (!confirmRemoveEntry || releasingEntry) return;
    setReleasingEntry(true);
    try {
      const response = await fetch("/api/admin/raffle/release-number", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryId: confirmRemoveEntry.entryId,
          raffleId: confirmRemoveEntry.raffleId,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || data?.success !== true) {
        throw new Error(data?.error || `Falha ao liberar número (HTTP ${response.status}).`);
      }
      await utils.raffles.getById.invalidate();
      await utils.raffles.list.invalidate();
      toast.success(`Número #${confirmRemoveEntry.number} liberado com sucesso!`);
      setConfirmRemoveEntry(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao liberar número");
    } finally {
      setReleasingEntry(false);
    }
  };

  const handleCreate = async () => {
    if (!newTitle.trim()) { toast.error("Informe o título do sorteio"); return; }
    if (newDrawMode === "automatic" && !newScheduledAt) { toast.error("Informe data e hora do sorteio automático."); return; }
    await createMutation.mutateAsync({
      title: newTitle.trim(),
      description: newDescription.trim() || undefined,
      maxNumbersPerPerson: newMaxNumbers,
      drawMode: newDrawMode,
      scheduledDrawAt: newDrawMode === "automatic" ? saoPauloInputToDate(newScheduledAt) : null,
      drawEligibility: newDrawEligibility,
    });
    setNewTitle("");
    setNewDescription("");
    setNewMaxNumbers(1);
    setNewDrawMode("manual");
    setNewScheduledAt("");
    setNewDrawEligibility("paid");
    toast.success("Sorteio criado!");
  };

  const handleUpdate = async (id: number) => {
    if (editDrawMode === "automatic" && !editScheduledAt) { toast.error("Informe data e hora do sorteio automático."); return; }
    await updateMutation.mutateAsync({
      id,
      title: editTitle.trim() || undefined,
      description: editDescription.trim() || undefined,
      maxNumbersPerPerson: editMaxNumbers,
      drawMode: editDrawMode,
      scheduledDrawAt: editDrawMode === "automatic" ? saoPauloInputToDate(editScheduledAt) : null,
      drawEligibility: editDrawEligibility,
    });
    setEditingId(null);
    toast.success("Sorteio atualizado!");
  };

  const handleToggleStatus = async (raffle: Raffle) => {
    const newStatus = raffle.status === "open" ? "closed" : "open";
    await updateMutation.mutateAsync({ id: raffle.id, status: newStatus });
    toast.success(newStatus === "open" ? "Sorteio ativado!" : "Sorteio desativado!");
  };

  const handleDraw = async (id: number) => {
    if (!confirm("Tem certeza que deseja realizar o sorteio? Esta ação não pode ser desfeita.")) return;
    const res = await drawMutation.mutateAsync({ id });
    if (res.success && res.winner) {
      toast.success(`Sorteio realizado! Ganhador: ${res.winner.name} - Número ${res.winner.number}`);
    } else {
      toast.error(res.error || "Erro ao realizar sorteio");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Excluir este sorteio e todos os números escolhidos?")) return;
    await deleteMutation.mutateAsync({ id });
    toast.success("Sorteio excluído!");
  };

  const toSaoPauloInput = (value?: Date | string | null) => {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(d);
    const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
    return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}`;
  };

  const saoPauloInputToDate = (value: string) => value ? new Date(`${value}:00-03:00`) : null;

  const formatDrawDate = (value?: Date | string | null) => value
    ? new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "Não programado";

  const buildWinnerWhatsapp = (raffle: Raffle, askPix = false) => {
    const base = [
      "🏆 *H2 COLOMBIANO — GANHADOR DO SORTEIO*",
      `Olá, ${raffle.winnerName || "ganhador"}!`,
      `Número sorteado: *#${raffle.winnerNumber}*`,
      `Sorteio: *${raffle.title}*`,
      `Data/Hora: *${formatDrawDate(raffle.drawnAt)}*`,
      "",
      "Parabéns! 🎉",
    ];
    if (askPix) base.push("", "Para realizarmos o pagamento do prêmio, envie sua *chave PIX* e o *nome do titular* por aqui.");
    else base.push("", "A equipe H2 entrará em contato para concluir a entrega do prêmio.");
    return base.join("\n");
  };

  const openWinnerWhatsapp = (raffle: Raffle, askPix = false) => {
    if (!raffle.winnerPhone) return toast.error("Telefone do ganhador não disponível.");
    const url = buildWhatsappMessageUrl(raffle.winnerPhone, prepareWhatsappMessage(buildWinnerWhatsapp(raffle, askPix)));
    window.open(url, "_blank", "noopener,noreferrer");
    if (askPix) prizeStatusMutation.mutate({ id: raffle.id, status: "pix_requested" });
  };

  const downloadWinnerCard = async (raffle: Raffle) => {
    if (!raffle.winnerName || !raffle.winnerNumber || !raffle.drawnAt) return toast.error("Resultado ainda não disponível.");
    const canvas = document.createElement("canvas");
    canvas.width = 1080; canvas.height = 1920;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const gradient = ctx.createLinearGradient(0, 0, 1080, 1920);
    gradient.addColorStop(0, "#090914"); gradient.addColorStop(0.55, "#24104a"); gradient.addColorStop(1, "#7c4a03");
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1080, 1920);
    ctx.textAlign = "center";
    ctx.fillStyle = "#facc15"; ctx.font = "900 58px Arial"; ctx.fillText("H2 COLOMBIANO", 540, 150);
    ctx.fillStyle = "#ffffff"; ctx.font = "900 82px Arial"; ctx.fillText("GANHADOR DO SORTEIO", 540, 260);

    const drawPhotoFallback = () => {
      ctx.fillStyle = "#312e81"; ctx.beginPath(); ctx.arc(540, 650, 220, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ffffff"; ctx.font = "900 130px Arial";
      ctx.fillText((raffle.winnerName || "H2").split(/\s+/).slice(0,2).map(x => x[0]).join("").toUpperCase(), 540, 700);
    };

    if (raffle.winnerProfilePhotoUrl) {
      try {
        const img = new Image();
        img.crossOrigin = "anonymous";
        await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(); img.src = raffle.winnerProfilePhotoUrl!; });
        ctx.save(); ctx.beginPath(); ctx.arc(540, 650, 220, 0, Math.PI * 2); ctx.clip();
        const scale = Math.max(440 / img.width, 440 / img.height);
        const w = img.width * scale, h = img.height * scale;
        ctx.drawImage(img, 540 - w/2, 650 - h/2, w, h); ctx.restore();
        ctx.strokeStyle = "#facc15"; ctx.lineWidth = 14; ctx.beginPath(); ctx.arc(540,650,225,0,Math.PI*2); ctx.stroke();
      } catch { drawPhotoFallback(); }
    } else drawPhotoFallback();

    ctx.fillStyle = "#ffffff"; ctx.font = "900 60px Arial";
    const winnerName = (raffle.winnerName || "").toUpperCase();
    const maxWidth = 930;
    let fontSize = 60;
    while (ctx.measureText(winnerName).width > maxWidth && fontSize > 36) { fontSize -= 2; ctx.font = `900 ${fontSize}px Arial`; }
    ctx.fillText(winnerName, 540, 1010);
    ctx.fillStyle = "#facc15"; ctx.font = "900 170px Arial"; ctx.fillText(`#${raffle.winnerNumber}`, 540, 1240);
    ctx.fillStyle = "#e5e7eb"; ctx.font = "700 44px Arial"; ctx.fillText(raffle.title.toUpperCase(), 540, 1360);
    ctx.fillStyle = "#ffffff"; ctx.font = "700 50px Arial"; ctx.fillText(formatDrawDate(raffle.drawnAt), 540, 1480);
    ctx.fillStyle = "#facc15"; ctx.font = "900 54px Arial"; ctx.fillText("PARABÉNS! 🎉", 540, 1630);
    ctx.fillStyle = "#a1a1aa"; ctx.font = "600 34px Arial"; ctx.fillText("h2colombiano.com", 540, 1775);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `ganhador-sorteio-${raffle.id}-${raffle.winnerNumber}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, "image/png");
  };

  const formatPhone = (phone: string) => {
    const digits = String(phone || "").replace(/\D/g, "");
    if (digits.length === 13 && digits.startsWith("55")) return `+55 (${digits.slice(2,4)}) ${digits.slice(4,9)}-${digits.slice(9)}`;
    if (digits.length === 11) return `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`;
    if (digits.length === 10) return `(${digits.slice(0,2)}) ${digits.slice(2,6)}-${digits.slice(6)}`;
    return phone;
  };

  // Emoticons do texto do WhatsApp são montados por code point, sem caracteres
  // emoji literais no bundle. Isso evita o U+FFFD (losango com ?) visto no WhatsApp.
  const whatsappEmoji = {
    ticket: String.fromCodePoint(0x1f39f) + String.fromCharCode(0xfe0f),
    trophy: String.fromCodePoint(0x1f3c6),
    clipboard: String.fromCodePoint(0x1f4cb),
    paid: String.fromCharCode(0x2705),
    pending: String.fromCharCode(0x23f3),
    chart: String.fromCodePoint(0x1f4ca),
    numbers: String.fromCodePoint(0x1f522),
    link: String.fromCodePoint(0x1f517),
  };

  const buildWhatsappRaffleList = (raffle: Raffle, entries: RaffleEntry[], mode: "all" | "paid" | "pending") => {
    const allEntries = [...entries].sort((a, b) => a.number - b.number);
    const filtered = mode === "all"
      ? allEntries
      : allEntries.filter(entry => entry.paymentStatus === mode);

    const paidCount = allEntries.filter(entry => entry.paymentStatus === "paid").length;
    const pendingCount = allEntries.filter(entry => entry.paymentStatus === "pending").length;
    const availableCount = Math.max(0, 100 - allEntries.length);
    const modeLabel = mode === "paid" ? "SOMENTE PAGOS" : mode === "pending" ? "AGUARDANDO PAGAMENTO" : "TODOS OS ESCOLHIDOS";

    const lines = filtered.map(entry => {
      const number = String(entry.number).padStart(2, "0");
      const icon = entry.paymentStatus === "paid" ? whatsappEmoji.paid : whatsappEmoji.pending;
      const payment = entry.paymentStatus === "paid" ? `${whatsappEmoji.paid} PAGO` : `${whatsappEmoji.pending} AGUARDANDO`;
      return `${icon} *${number}* — ${entry.customerName} — ${formatPhone(entry.customerPhone)} — ${payment}`;
    });

    return [
      `${whatsappEmoji.ticket} *SORTEIO H2 COLOMBIANO — LISTA ATUALIZADA*`,
      `${whatsappEmoji.trophy} *${raffle.title}*`,
      `${whatsappEmoji.clipboard} *${modeLabel}*`,
      "",
      ...(lines.length ? lines : ["Nenhum número nesta categoria."]),
      "",
      `${whatsappEmoji.chart} *RESUMO*`,
      `${whatsappEmoji.ticket} Escolhidos: *${allEntries.length}*`,
      `${whatsappEmoji.paid} Pagos: *${paidCount}*`,
      `${whatsappEmoji.pending} Aguardando: *${pendingCount}*`,
      `${whatsappEmoji.numbers} Disponíveis: *${availableCount}*`,
      "",
      `${whatsappEmoji.link} https://h2colombiano.com/sorteio`,
    ].join("\n").normalize("NFC");
  };

  const copyWhatsappRaffleList = async (raffle: Raffle, entries: RaffleEntry[]) => {
    const message = buildWhatsappRaffleList(raffle, entries, whatsappListMode);
    try {
      await navigator.clipboard.writeText(prepareWhatsappMessage(message));
      toast.success("Lista do WhatsApp copiada!");
    } catch {
      toast.error("Não foi possível copiar a lista.");
    }
  };

  const openWhatsappRaffleList = (raffle: Raffle, entries: RaffleEntry[]) => {
    const message = buildWhatsappRaffleList(raffle, entries, whatsappListMode);
    const whatsappUrl = buildWhatsappMessageUrl(null, message);
    window.open(whatsappUrl, "_blank");
  };

  return (
    <>
    <div className="min-h-screen bg-background">
      <AdminHeader title="Sorteios" icon={<Gift className="w-5 h-5 text-yellow-400" />} />

      <div className="container py-6 px-4 space-y-6">
        {/* Navigation Links */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          <a href="/admin/codes" className="bg-purple-600/20 border border-purple-500/40 rounded-xl p-3 text-center hover:bg-purple-600/30 transition-all">
            <Key className="w-5 h-5 text-purple-400 mx-auto mb-1" />
            <span className="text-xs font-bold text-white">Senhas Cadastro</span>
          </a>
          <a href="/admin/coupons" className="bg-green-600/20 border border-green-500/30 rounded-xl p-3 text-center hover:bg-green-600/30 transition-all">
            <Ticket className="w-5 h-5 text-green-400 mx-auto mb-1" />
            <span className="text-xs font-bold text-white">Cupons</span>
          </a>
          <a href="/admin/products" className="bg-blue-600/20 border border-blue-500/30 rounded-xl p-3 text-center hover:bg-blue-600/30 transition-all">
            <Package className="w-5 h-5 text-blue-400 mx-auto mb-1" />
            <span className="text-xs font-bold text-white">Cards</span>
          </a>
          <a href="/admin/customers" className="bg-cyan-600/20 border border-cyan-500/30 rounded-xl p-3 text-center hover:bg-cyan-600/30 transition-all">
            <Users className="w-5 h-5 text-cyan-400 mx-auto mb-1" />
            <span className="text-xs font-bold text-white">Clientes</span>
          </a>
          <a href="/admin/raffles" className="bg-yellow-600/20 border border-yellow-500/30 rounded-xl p-3 text-center hover:bg-yellow-600/30 transition-all ring-2 ring-yellow-500/50">
            <Gift className="w-5 h-5 text-yellow-400 mx-auto mb-1" />
            <span className="text-xs font-bold text-white">Sorteios</span>
          </a>
          <a href="/admin/settings" className="bg-orange-600/20 border border-orange-500/30 rounded-xl p-3 text-center hover:bg-orange-600/30 transition-all">
            <Globe className="w-5 h-5 text-orange-400 mx-auto mb-1" />
            <span className="text-xs font-bold text-white">Configurações</span>
          </a>
        </div>

        {/* Configuração de Senha do Sorteio */}
        <div className="bg-black/40 backdrop-blur-md border border-yellow-500/30 rounded-2xl p-4 md:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Lock className="w-5 h-5 text-yellow-400" /> Acesso à Página de Sorteio
            </h3>
            <a href="/sorteio" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-yellow-400 hover:text-yellow-300 transition-colors">
              <ExternalLink className="w-3.5 h-3.5" /> Ver página
            </a>
          </div>
          <div className="space-y-4">

            {/* Seletor de modo de acesso */}
            <div>
              <label className="text-white/70 text-sm mb-2 block font-semibold">Modo de Acesso</label>
              <div className="grid grid-cols-2 gap-3">
                {/* Acesso Livre */}
                <button
                  type="button"
                  onClick={() => setRafflePasswordEnabled('0')}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                    rafflePasswordEnabled === '0'
                      ? 'bg-green-500/20 border-green-500 text-green-300'
                      : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:border-white/20'
                  }`}
                >
                  <Globe className="w-6 h-6" />
                  <div className="text-center">
                    <p className="font-bold text-sm">Acesso Livre</p>
                    <p className="text-xs opacity-70">Link direto, sem senha</p>
                  </div>
                  {rafflePasswordEnabled === '0' && (
                    <span className="text-xs font-bold bg-green-500/30 px-2 py-0.5 rounded-full">ATIVO</span>
                  )}
                </button>

                {/* Com Senha */}
                <button
                  type="button"
                  onClick={() => setRafflePasswordEnabled('1')}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                    rafflePasswordEnabled === '1'
                      ? 'bg-yellow-500/20 border-yellow-500 text-yellow-300'
                      : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:border-white/20'
                  }`}
                >
                  <Lock className="w-6 h-6" />
                  <div className="text-center">
                    <p className="font-bold text-sm">Com Senha</p>
                    <p className="text-xs opacity-70">Exige senha para entrar</p>
                  </div>
                  {rafflePasswordEnabled === '1' && (
                    <span className="text-xs font-bold bg-yellow-500/30 px-2 py-0.5 rounded-full">ATIVO</span>
                  )}
                </button>
              </div>

              {/* Status atual */}
              <div className={`mt-3 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold ${
                rafflePasswordEnabled === '0'
                  ? 'bg-green-500/10 border border-green-500/30 text-green-300'
                  : 'bg-yellow-500/10 border border-yellow-500/30 text-yellow-300'
              }`}>
                {rafflePasswordEnabled === '0' ? (
                  <><Globe className="w-3.5 h-3.5" /> Qualquer pessoa com o link <span className="font-mono">/sorteio</span> entra direto, sem precisar de senha.</>
                ) : (
                  <><Lock className="w-3.5 h-3.5" /> Clientes precisam digitar a senha abaixo para acessar o sorteio.</>
                )}
              </div>
            </div>

            {/* Senha (só aparece quando modo = com senha) */}
            {rafflePasswordEnabled === '1' && (
            <div>
              <label className="text-white/70 text-sm mb-1 block">Senha de acesso</label>
              <div className="relative">
                <input
                  type={showRafflePassword ? 'text' : 'password'}
                  value={rafflePassword}
                  onChange={(e) => setRafflePassword(e.target.value)}
                  placeholder="Digite a senha exclusiva do sorteio"
                  className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 focus:border-yellow-500 focus:outline-none pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowRafflePassword(!showRafflePassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
                >
                  {showRafflePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            )}

            {/* Título e subtitulo da página */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-white/70 text-sm mb-1 block">Título da página</label>
                <input
                  type="text"
                  value={raffleTitle}
                  onChange={(e) => setRaffleTitle(e.target.value)}
                  placeholder="SORTEIO"
                  className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 focus:border-yellow-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-white/70 text-sm mb-1 block">Subtítulo</label>
                <input
                  type="text"
                  value={raffleSubtitle}
                  onChange={(e) => setRaffleSubtitle(e.target.value)}
                  placeholder="Participe do nosso sorteio exclusivo!"
                  className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 focus:border-yellow-500 focus:outline-none"
                />
              </div>
            </div>

            <button
              onClick={() => saveRaffleConfigMutation.mutate({
                password: rafflePassword,
                enabled: rafflePasswordEnabled,
                title: raffleTitle,
                subtitle: raffleSubtitle,
              })}
              disabled={saveRaffleConfigMutation.isPending}
              className="flex items-center gap-2 px-5 py-2 rounded-lg font-bold text-black bg-gradient-to-r from-yellow-400 to-yellow-600 hover:from-yellow-500 hover:to-yellow-700 transition-all disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saveRaffleConfigMutation.isPending ? 'Salvando...' : 'Salvar Configurações'}
            </button>
          </div>
        </div>

        {/* Criar novo sorteio */}
        <div className="bg-black/40 backdrop-blur-md border border-yellow-500/30 rounded-2xl p-4 md:p-6">
          <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
            <Plus className="w-5 h-5 text-yellow-400" /> Criar Novo Sorteio
          </h3>
          <div className="space-y-3">
            <div>
              <label className="text-white/70 text-sm mb-1 block">Título *</label>
              <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
                className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 focus:border-yellow-500 focus:outline-none"
                placeholder="Ex: Sorteio de Natal 2026" />
            </div>
            <div>
              <label className="text-white/70 text-sm mb-1 block">Descrição / Regras (opcional)</label>
              <textarea value={newDescription} onChange={(e) => setNewDescription(e.target.value)}
                className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 focus:border-yellow-500 focus:outline-none resize-none whitespace-pre-wrap"
                rows={8} placeholder="Regras, prêmio, data do sorteio...\nUse Enter para quebras de linha." />
            </div>
            <div>
              <label className="text-white/70 text-sm mb-1 block">Números por pessoa (máx.)</label>
              <div className="flex items-center gap-3">
                <input type="number" min={1} max={10} value={newMaxNumbers} onChange={(e) => setNewMaxNumbers(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                  className="w-24 px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white focus:border-yellow-500 focus:outline-none text-center font-bold text-lg" />
                <span className="text-white/50 text-sm">número(s) por cadastro</span>
              </div>
            </div>
            <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 p-4 space-y-3">
              <div className="flex items-center gap-2 text-purple-200 font-bold"><CalendarClock className="w-4 h-4" /> Modo do sorteio</div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setNewDrawMode("manual")} className={`rounded-lg border px-3 py-2 text-sm font-bold ${newDrawMode === "manual" ? "border-yellow-400 bg-yellow-500/20 text-yellow-200" : "border-white/10 bg-white/5 text-white/60"}`}>Manual</button>
                <button type="button" onClick={() => setNewDrawMode("automatic")} className={`rounded-lg border px-3 py-2 text-sm font-bold ${newDrawMode === "automatic" ? "border-fuchsia-400 bg-fuchsia-500/20 text-fuchsia-200" : "border-white/10 bg-white/5 text-white/60"}`}>Automático</button>
              </div>
              {newDrawMode === "automatic" && <>
                <div><label className="text-white/70 text-xs mb-1 block">Data e hora — São Paulo</label><input type="datetime-local" value={newScheduledAt} onChange={e => setNewScheduledAt(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-black/30 border border-fuchsia-400/30 text-white" /></div>
                <div><label className="text-white/70 text-xs mb-1 block">Quem participa do automático</label><select value={newDrawEligibility} onChange={e => setNewDrawEligibility(e.target.value as "all"|"paid")} className="w-full px-3 py-2 rounded-lg bg-black/30 border border-fuchsia-400/30 text-white"><option value="paid">Somente números PAGOS</option><option value="all">Todos os números ocupados</option></select></div>
              </>}
            </div>
            <button onClick={handleCreate} disabled={createMutation.isPending}
              className="px-6 py-2 rounded-lg font-bold text-black bg-gradient-to-r from-yellow-400 to-yellow-600 hover:from-yellow-500 hover:to-yellow-700 transition-all disabled:opacity-50">
              {createMutation.isPending ? "Criando..." : "Criar Sorteio"}
            </button>
          </div>
        </div>

        {/* Lista de sorteios */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Gift className="w-5 h-5 text-yellow-400" /> Sorteios ({raffles?.length || 0})
          </h3>

          {isLoading && <p className="text-white/50 text-center py-8">Carregando...</p>}

          {!isLoading && (!raffles || raffles.length === 0) && (
            <p className="text-white/50 text-center py-8">Nenhum sorteio criado ainda.</p>
          )}

          {raffles?.map((raffle: Raffle) => (
            <div key={raffle.id} className="bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl p-4">
              {editingId === raffle.id ? (
                /* Modo edição */
                <div className="space-y-3">
                  <div>
                    <label className="text-white/70 text-sm mb-1 block">Título</label>
                    <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white focus:border-yellow-500 focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-white/70 text-sm mb-1 block">Descrição / Regras</label>
                    <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white focus:border-yellow-500 focus:outline-none resize-none whitespace-pre-wrap" rows={8} />
                  </div>
                  <div>
                    <label className="text-white/70 text-sm mb-1 block">Números por pessoa (máx.)</label>
                    <div className="flex items-center gap-3">
                      <input type="number" min={1} max={10} value={editMaxNumbers} onChange={(e) => setEditMaxNumbers(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                        className="w-24 px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white focus:border-yellow-500 focus:outline-none text-center font-bold text-lg" />
                      <span className="text-white/50 text-sm">número(s) por cadastro</span>
                    </div>
                  </div>
                  <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 p-4 space-y-3">
                    <div className="flex items-center gap-2 text-purple-200 font-bold"><CalendarClock className="w-4 h-4" /> Execução do sorteio</div>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => setEditDrawMode("manual")} className={`rounded-lg border px-3 py-2 text-sm font-bold ${editDrawMode === "manual" ? "border-yellow-400 bg-yellow-500/20 text-yellow-200" : "border-white/10 bg-white/5 text-white/60"}`}>Manual</button>
                      <button type="button" onClick={() => setEditDrawMode("automatic")} className={`rounded-lg border px-3 py-2 text-sm font-bold ${editDrawMode === "automatic" ? "border-fuchsia-400 bg-fuchsia-500/20 text-fuchsia-200" : "border-white/10 bg-white/5 text-white/60"}`}>Automático</button>
                    </div>
                    {editDrawMode === "automatic" && <>
                      <div><label className="text-white/70 text-xs mb-1 block">Data e hora — São Paulo</label><input type="datetime-local" value={editScheduledAt} onChange={e => setEditScheduledAt(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-black/30 border border-fuchsia-400/30 text-white" /></div>
                      <div><label className="text-white/70 text-xs mb-1 block">Participantes elegíveis</label><select value={editDrawEligibility} onChange={e => setEditDrawEligibility(e.target.value as "all"|"paid")} className="w-full px-3 py-2 rounded-lg bg-black/30 border border-fuchsia-400/30 text-white"><option value="paid">Somente números PAGOS</option><option value="all">Todos os números ocupados</option></select></div>
                    </>}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleUpdate(raffle.id)} className="px-4 py-1.5 rounded-lg bg-yellow-500 text-black font-bold text-sm">Salvar</button>
                    <button onClick={() => setEditingId(null)} className="px-4 py-1.5 rounded-lg bg-white/10 text-white text-sm">Cancelar</button>
                  </div>
                </div>
              ) : (
                /* Modo visualização */
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-bold text-white text-lg">{raffle.title}</h4>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                        raffle.status === "open" ? "bg-green-500/20 text-green-400 border border-green-500/40" :
                        raffle.status === "closed" ? "bg-red-500/20 text-red-400 border border-red-500/40" :
                        "bg-yellow-500/20 text-yellow-400 border border-yellow-500/40"
                      }`}>
                        {raffle.status === "open" ? "Ativo" : raffle.status === "closed" ? "Desativado" : "Sorteado"}
                      </span>
                    </div>
                    <span className="text-white/40 text-xs">{new Date(raffle.createdAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</span>
                  </div>

                  {raffle.description && <p className="text-white/60 text-sm mb-3 whitespace-pre-line">{raffle.description}</p>}
                  {raffle.status !== "drawn" && (
                    <div className={`mb-3 rounded-lg border p-3 text-sm ${raffle.drawMode === "automatic" ? "border-fuchsia-500/30 bg-fuchsia-500/10" : "border-white/10 bg-white/5"}`}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-white">{raffle.drawMode === "automatic" ? "⏰ SORTEIO AUTOMÁTICO" : "▶ SORTEIO MANUAL"}</span>
                        {raffle.drawMode === "automatic" && <span className="text-fuchsia-200">{formatDrawDate(raffle.scheduledDrawAt)}</span>}
                        {raffle.drawMode === "automatic" && <span className="text-xs text-white/50">• {raffle.drawEligibility === "all" ? "todos os números" : "somente pagos"}</span>}
                        {raffle.autoDrawState === "failed" && <span className="text-red-300 text-xs">⚠ {raffle.autoDrawError || "Falha no automático"}</span>}
                      </div>
                    </div>
                  )}

                  {/* Resultado do sorteio */}
                  {raffle.status === "drawn" && raffle.winnerName && (
                    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 mb-3">
                      <div className="flex flex-col md:flex-row gap-4">
                        {raffle.winnerProfilePhotoUrl ? <img src={raffle.winnerProfilePhotoUrl} alt="Foto do ganhador" className="w-24 h-24 rounded-full object-cover border-4 border-yellow-400 self-center md:self-start" /> : <div className="w-24 h-24 rounded-full bg-yellow-500/20 border-4 border-yellow-400 flex items-center justify-center text-3xl self-center md:self-start">🏆</div>}
                        <div className="flex-1">
                          <p className="text-yellow-400 font-black flex items-center gap-1 text-lg"><Trophy className="w-5 h-5" /> GANHADOR CONFIRMADO</p>
                          <p className="text-white font-bold text-xl">{raffle.winnerName}</p>
                          <p className="text-yellow-300 text-3xl font-black">#{raffle.winnerNumber}</p>
                          <p className="text-white/60 text-sm">{raffle.winnerPhone && formatPhone(raffle.winnerPhone)}</p>
                          <p className="text-white/60 text-sm">{formatDrawDate(raffle.drawnAt)}</p>
                          <p className="text-xs text-white/40 mt-1">Status do prêmio: {raffle.prizeStatus === "pix_requested" ? "PIX solicitado" : raffle.prizeStatus === "pix_received" ? "PIX recebido" : raffle.prizeStatus === "paid" ? "Prêmio pago" : "Aguardando contato"}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 mt-4">
                        <button type="button" onClick={() => openWinnerWhatsapp(raffle, false)} className="rounded-lg bg-green-600/20 border border-green-500/30 text-green-200 px-3 py-2 text-xs font-bold flex items-center justify-center gap-1"><MessageCircle className="w-4 h-4" /> WhatsApp</button>
                        <button type="button" onClick={() => openWinnerWhatsapp(raffle, true)} className="rounded-lg bg-emerald-600/20 border border-emerald-500/30 text-emerald-200 px-3 py-2 text-xs font-bold flex items-center justify-center gap-1"><CreditCard className="w-4 h-4" /> Pedir PIX</button>
                        <button type="button" onClick={() => void downloadWinnerCard(raffle)} className="rounded-lg bg-purple-600/20 border border-purple-500/30 text-purple-200 px-3 py-2 text-xs font-bold flex items-center justify-center gap-1"><ImageDown className="w-4 h-4" /> Arte do ganhador</button>
                        <button type="button" onClick={() => prizeStatusMutation.mutate({ id: raffle.id, status: raffle.prizeStatus === "paid" ? "awaiting_contact" : "paid" })} className="rounded-lg bg-yellow-600/20 border border-yellow-500/30 text-yellow-200 px-3 py-2 text-xs font-bold">{raffle.prizeStatus === "paid" ? "Reabrir prêmio" : "✓ Marcar pago"}</button>
                      </div>
                    </div>
                  )}

                  {/* Ações */}
                  <div className="flex flex-wrap gap-2 mt-3">
                    {raffle.status !== "drawn" && (
                      <button onClick={() => handleToggleStatus(raffle)}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                          raffle.status === "open" 
                            ? "bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30" 
                            : "bg-green-500/20 text-green-400 hover:bg-green-500/30 border border-green-500/30"
                        }`}>
                        {raffle.status === "open" ? <><EyeOff className="w-4 h-4" /> Desativar</> : <><Eye className="w-4 h-4" /> Ativar</>}
                      </button>
                    )}

                    {raffle.status === "open" && (
                      <button onClick={() => handleDraw(raffle.id)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 border border-yellow-500/30 transition-all">
                        <Play className="w-4 h-4" /> Sortear
                      </button>
                    )}

                    <button onClick={() => { setViewingId(viewingId === raffle.id ? null : raffle.id); }}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 border border-blue-500/30 transition-all">
                      <Users className="w-4 h-4" /> Ver Números
                    </button>

                    {raffle.status !== "drawn" && (
                      <button onClick={() => { setEditingId(raffle.id); setEditTitle(raffle.title); setEditDescription(raffle.description || ""); setEditMaxNumbers(raffle.maxNumbersPerPerson ?? 1); setEditDrawMode(raffle.drawMode || "manual"); setEditScheduledAt(toSaoPauloInput(raffle.scheduledDrawAt)); setEditDrawEligibility(raffle.drawEligibility || "paid"); }}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium bg-white/10 text-white/70 hover:bg-white/20 border border-white/20 transition-all">
                        <Edit2 className="w-4 h-4" /> Editar
                      </button>
                    )}

                    <button onClick={() => handleDelete(raffle.id)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-all">
                      <Trash2 className="w-4 h-4" /> Excluir
                    </button>
                  </div>

                  {/* Tabela de números escolhidos */}
                  {viewingId === raffle.id && viewingRaffle && (
                    <div className="mt-4 bg-black/30 border border-white/10 rounded-lg p-4">
                      <h5 className="font-bold text-white mb-3 flex items-center gap-2">
                        <Users className="w-4 h-4 text-blue-400" /> Números Escolhidos ({viewingRaffle.entries?.length || 0})
                      </h5>

                      <div className="mb-4 rounded-xl border border-green-500/25 bg-green-500/[0.07] p-3">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <div>
                            <p className="flex items-center gap-2 text-sm font-black text-green-300">
                              <MessageCircle className="h-4 w-4" /> Lista para WhatsApp
                            </p>
                            <p className="mt-1 text-xs text-white/50">Somente leitura: usa a lista atual deste sorteio sem alterar números, pagamentos ou participantes.</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={() => setWhatsappListMode("all")}
                              className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition-all ${whatsappListMode === "all" ? "border-blue-400/50 bg-blue-500/20 text-blue-200" : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10"}`}>
                              Todos
                            </button>
                            <button type="button" onClick={() => setWhatsappListMode("paid")}
                              className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition-all ${whatsappListMode === "paid" ? "border-green-400/50 bg-green-500/20 text-green-200" : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10"}`}>
                              Pagos
                            </button>
                            <button type="button" onClick={() => setWhatsappListMode("pending")}
                              className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition-all ${whatsappListMode === "pending" ? "border-orange-400/50 bg-orange-500/20 text-orange-200" : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10"}`}>
                              Aguardando
                            </button>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void copyWhatsappRaffleList(raffle, (viewingRaffle.entries ?? []) as RaffleEntry[])}
                            disabled={!viewingRaffle.entries?.length}
                            className="inline-flex items-center gap-2 rounded-lg border border-cyan-400/30 bg-cyan-500/15 px-3 py-2 text-xs font-black text-cyan-200 transition hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Copy className="h-4 w-4" /> COPIAR LISTA
                          </button>
                          <button
                            type="button"
                            onClick={() => openWhatsappRaffleList(raffle, (viewingRaffle.entries ?? []) as RaffleEntry[])}
                            disabled={!viewingRaffle.entries?.length}
                            className="inline-flex items-center gap-2 rounded-lg border border-green-400/30 bg-green-500/20 px-3 py-2 text-xs font-black text-green-100 transition hover:bg-green-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <MessageCircle className="h-4 w-4" /> ABRIR WHATSAPP
                          </button>
                        </div>
                      </div>
                      {(!viewingRaffle.entries || viewingRaffle.entries.length === 0) ? (
                        <p className="text-white/50 text-sm">Nenhum número escolhido ainda.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-white/50 border-b border-white/10">
                                <th className="text-left py-2 px-2">Nº</th>
                                <th className="text-left py-2 px-2">Nome</th>
                                <th className="text-left py-2 px-2">Telefone</th>
                                <th className="text-left py-2 px-2">Data/Hora</th>
                                <th className="text-left py-2 px-2">Pagamento</th>
                                <th className="text-left py-2 px-2">Ação</th>
                              </tr>
                            </thead>
                            <tbody>
                              {viewingRaffle.entries.map((entry: RaffleEntry) => (
                                <tr key={entry.id} className={`border-b border-white/5 ${raffle.winnerNumber === entry.number ? 'bg-yellow-500/10' : ''}`}>
                                  <td className={`py-2 px-2 font-bold ${raffle.winnerNumber === entry.number ? 'text-yellow-400' : 'text-white'}`}>
                                    {entry.number} {raffle.winnerNumber === entry.number && <Trophy className="w-3 h-3 inline text-yellow-400" />}
                                  </td>
                                  <td className="py-2 px-2 text-white/80">{entry.customerName}</td>
                                  <td className="py-2 px-2 text-white/60">{formatPhone(entry.customerPhone)}</td>
                                  <td className="py-2 px-2 text-white/40">
                                    <div>{new Date(entry.createdAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</div>
                                    <div className="text-[10px] text-white/30">{new Date(entry.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}</div>
                                  </td>
                                  <td className="py-2 px-2">
                                    <button
                                      onClick={() => updateEntryPaymentMutation.mutate({ entryId: entry.id, paymentStatus: entry.paymentStatus === 'paid' ? 'pending' : 'paid' })}
                                      disabled={updateEntryPaymentMutation.isPending}
                                      className={`px-2 py-1 rounded text-xs font-semibold transition-colors border ${
                                        entry.paymentStatus === 'paid'
                                          ? 'bg-green-600/30 hover:bg-green-600/60 text-green-300 border-green-500/30'
                                          : 'bg-orange-600/30 hover:bg-orange-600/60 text-orange-300 border-orange-500/30'
                                      }`}
                                    >
                                      {entry.paymentStatus === 'paid' ? '✓ Pago' : 'Aguardando'}
                                    </button>
                                  </td>
                                  <td className="py-2 px-2">
                                    {raffle.status === 'open' && raffle.winnerNumber !== entry.number && entry.paymentStatus === 'pending' ? (
                                      <button
                                        onClick={() => setConfirmRemoveEntry({ entryId: entry.id, raffleId: raffle.id, number: entry.number, name: entry.customerName })}
                                        className="inline-flex items-center gap-1 rounded-lg border border-red-400/40 bg-red-500/15 px-2.5 py-1.5 text-xs font-black text-red-200 transition hover:bg-red-500/30 hover:text-white"
                                        title="Remover reserva não paga e devolver o número para disponível"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" /> LIBERAR Nº
                                      </button>
                                    ) : entry.paymentStatus === 'paid' ? (
                                      <span className="inline-flex items-center gap-1 rounded-lg border border-green-500/20 bg-green-500/10 px-2 py-1 text-[10px] font-bold text-green-300">
                                        <Lock className="w-3 h-3" /> PROTEGIDO
                                      </span>
                                    ) : null}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Grid visual dos números */}
                      <div className="mt-4">
                        <p className="text-white/50 text-xs mb-2">Mapa de números:</p>
                        <div className="grid grid-cols-10 gap-1">
                          {Array.from({ length: 100 }, (_, i) => i + 1).map(num => {
                            const entry = viewingRaffle.entries?.find((e: RaffleEntry) => e.number === num);
                            const isWinner = raffle.winnerNumber === num;
                            const isPending = entry?.paymentStatus === 'pending';
                            const canReleasePending = Boolean(entry && isPending && raffle.status === 'open' && !isWinner);
                            return (
                              <button
                                type="button"
                                key={num}
                                disabled={!canReleasePending}
                                onClick={() => {
                                  if (!entry || !canReleasePending) return;
                                  setConfirmRemoveEntry({ entryId: entry.id, raffleId: raffle.id, number: entry.number, name: entry.customerName });
                                }}
                                title={entry
                                  ? `${entry.customerName} - ${formatPhone(entry.customerPhone)} - ${entry.paymentStatus === 'paid' ? 'PAGO' : 'NÃO PAGO'}${canReleasePending ? ' — clique para liberar' : ''}`
                                  : `Número ${num} - Disponível`}
                                className={`aspect-square rounded text-[10px] flex items-center justify-center font-bold border transition ${
                                  isWinner ? 'bg-yellow-500 text-black ring-2 ring-yellow-300 border-yellow-300' :
                                  entry?.paymentStatus === 'paid' ? 'bg-green-600/50 text-white border-green-400/30 cursor-default' :
                                  entry ? 'bg-orange-600/45 text-orange-100 border-orange-400/40 hover:bg-red-600/60 hover:border-red-400 cursor-pointer' :
                                  'bg-white/5 text-white/30 border-white/5 cursor-default'
                                }`}
                              >
                                {num}
                              </button>
                            );
                          })}
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-[10px] text-white/50">
                          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-white/5"></span> Disponível</span>
                          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-orange-600/60"></span> Não pago — clique para liberar</span>
                          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-green-600/60"></span> Pago</span>
                          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-yellow-500"></span> Ganhador</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
    {/* Modal de confirmação: liberar número */}
      {confirmRemoveEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setConfirmRemoveEntry(null)}>
          <div className="bg-gray-900 border border-red-500/40 rounded-2xl shadow-2xl max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-2">Liberar número {confirmRemoveEntry.number}?</h3>
            <p className="text-white/60 text-sm mb-6">
              O número <span className="text-yellow-400 font-bold">#{confirmRemoveEntry.number}</span>, reservado por <span className="text-white font-semibold">{confirmRemoveEntry.name}</span>, está sem pagamento e será liberado imediatamente para outro cliente escolher.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmRemoveEntry(null)} className="flex-1 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm transition-colors">Cancelar</button>
              <button
                onClick={() => void releasePendingNumber()}
                disabled={releasingEntry}
                className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-bold transition-colors disabled:opacity-50"
              >
                {releasingEntry ? 'Liberando...' : 'LIBERAR NÚMERO'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
