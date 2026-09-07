import { ArrowLeft, CheckCircle2, Copy, Crown, LockKeyhole, MessageCircle, ShieldCheck, Sparkles, Timer } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

function parsePrice(value: string | undefined) {
  const raw = String(value || "").trim().replace(/R\$/gi, "").replace(/\s/g, "");
  if (!raw) return 0;
  if (raw.includes(",")) return Number(raw.replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, "")) || 0;
  return Number(raw.replace(/[^0-9.-]/g, "")) || 0;
}

function money(value: number) {
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

export default function VipPage() {
  const { data: settings, isLoading } = trpc.settings.getAll.useQuery();
  const { data: activePix } = trpc.pix.getActive.useQuery();

  const enabled = settings?.vip_membership_enabled !== "0";
  const title = settings?.vip_membership_title || "H2 VIP";
  const subtitle = settings?.vip_membership_subtitle || "Pague menos nos modelos e categorias com benefício VIP.";
  const priceValue = parsePrice(settings?.vip_membership_price);
  const durationDays = Math.max(1, Number(settings?.vip_membership_days || 30) || 30);
  const benefit1 = settings?.vip_membership_benefit_1 || "Preços especiais em modelos e categorias selecionados";
  const benefit2 = settings?.vip_membership_benefit_2 || "Acesso a opções exclusivas marcadas como SOMENTE VIP";
  const benefit3 = settings?.vip_membership_benefit_3 || "O valor VIP aparece antes da compra para você comparar";
  const isVip = typeof window !== "undefined" && localStorage.getItem("walk_access_type") === "vip";
  const expiresAt = typeof window !== "undefined" ? localStorage.getItem("walk_access_expires") : null;
  const phone = typeof window !== "undefined" ? localStorage.getItem("walk_client_phone") || "" : "";
  const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const requestedReturn = params.get("returnTo") || "/";
  const returnTo = requestedReturn.startsWith("/") && !requestedReturn.startsWith("//") ? requestedReturn : "/";
  const whatsapp = String(settings?.whatsapp_number || "5511978307371").replace(/\D/g, "");
  const priceLabel = priceValue > 0 ? money(priceValue) : "VALOR EM CONFIGURAÇÃO";
  const pixKey = String(activePix?.pixKey || "").trim();
  const canPay = enabled && priceValue > 0 && Boolean(pixKey);
  const message = encodeURIComponent(
    `Olá! Quero ativar o H2 VIP.\nPlano: ${durationDays} dias\nValor: ${priceLabel}${phone ? `\nMeu telefone: ${phone}` : ""}\nJá fiz o PIX e vou enviar o comprovante.`
  );
  const whatsappHref = `https://wa.me/${whatsapp}?text=${message}`;

  const copyPix = async () => {
    if (!pixKey) return;
    try {
      await navigator.clipboard.writeText(pixKey);
      toast.success("Chave PIX copiada!");
    } catch {
      toast.error("Não foi possível copiar. Selecione a chave manualmente.");
    }
  };

  if (isLoading) {
    return <div className="min-h-screen bg-[#050715] grid place-items-center text-white">Carregando VIP...</div>;
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_15%_0%,rgba(124,58,237,.30),transparent_30%),radial-gradient(circle_at_100%_20%,rgba(34,211,238,.16),transparent_28%),linear-gradient(180deg,#050715_0%,#090827_48%,#050715_100%)] px-4 py-6 text-white sm:py-10">
      <div className="mx-auto w-full max-w-xl">
        <div className="mb-4 flex items-center justify-between gap-3">
<a href={returnTo} className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.05] px-4 py-2 text-xs font-black uppercase tracking-wide text-slate-200">
  <ArrowLeft className="h-4 w-4" /> Voltar
</a>
<span className="inline-flex items-center gap-2 rounded-full border border-amber-300/45 bg-amber-400/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-amber-200">
  <Crown className="h-4 w-4" /> Clube H2
</span>
        </div>

        <section className="overflow-hidden rounded-[30px] border border-violet-400/60 bg-[#080a20]/90 shadow-[0_24px_80px_rgba(0,0,0,.55),0_0_50px_rgba(124,58,237,.20)]">
<div className="relative overflow-hidden border-b border-violet-400/30 bg-[linear-gradient(135deg,rgba(76,29,149,.55),rgba(8,10,32,.92))] px-6 py-7 text-center">
  <div className="pointer-events-none absolute -right-5 -top-8 text-[110px] font-black text-violet-300/[0.04]">VIP</div>
  <img src="/h2-brand-180.png" alt="H2" className="relative mx-auto mb-4 h-20 w-20 object-contain drop-shadow-[0_0_18px_rgba(167,139,250,.45)]" />
  <div className="relative mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-amber-300/50 bg-amber-400/10 text-amber-300 shadow-[0_0_25px_rgba(251,191,36,.18)]">
    <Crown className="h-7 w-7" />
  </div>
  <h1 className="relative mt-4 text-4xl font-black uppercase tracking-tight">{title}</h1>
  <p className="relative mx-auto mt-3 max-w-md text-sm font-semibold leading-6 text-slate-300">{subtitle}</p>
</div>

<div className="p-5 sm:p-7">
  {isVip && (
    <div className="mb-5 rounded-2xl border border-emerald-400/45 bg-emerald-500/10 p-4 text-center">
      <p className="text-sm font-black uppercase text-emerald-300">Seu VIP está ativo</p>
      {expiresAt && <p className="mt-1 text-xs text-emerald-100/75">Validade atual: {new Date(expiresAt).toLocaleString("pt-BR")}</p>}
    </div>
  )}

  {!enabled ? (
    <div className="rounded-2xl border border-rose-400/35 bg-rose-500/10 p-5 text-center">
      <LockKeyhole className="mx-auto h-8 w-8 text-rose-300" />
      <p className="mt-3 font-black uppercase">VIP temporariamente indisponível</p>
    </div>
  ) : (
    <>
      <div className="rounded-[24px] border border-amber-300/45 bg-[linear-gradient(135deg,rgba(120,53,15,.22),rgba(17,24,39,.78))] p-5 text-center shadow-[0_0_28px_rgba(251,191,36,.10)]">
        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-amber-200">Assinatura H2 VIP</p>
        <p className={`mt-2 font-black tracking-tight ${priceValue > 0 ? "text-5xl text-amber-300" : "text-2xl text-slate-200"}`}>{priceLabel}</p>
        <p className="mt-2 inline-flex items-center gap-2 text-sm font-bold text-slate-300"><Timer className="h-4 w-4 text-violet-300" /> {durationDays} dias de acesso VIP</p>
      </div>

      <div className="mt-5 grid gap-3">
        {[benefit1, benefit2, benefit3].filter(Boolean).map((benefit, index) => (
          <div key={index} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
            <p className="text-sm font-semibold leading-5 text-slate-200">{benefit}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-[24px] border border-cyan-400/35 bg-cyan-500/[0.07] p-5">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-7 w-7 text-cyan-300" />
          <div>
            <p className="text-sm font-black uppercase text-cyan-100">Contrate aqui</p>
            <p className="text-xs text-cyan-100/65">Pagamento via PIX e ativação pela equipe H2.</p>
          </div>
        </div>

        {canPay ? (
          <>
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-4">
              <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Chave PIX</p>
              <p className="mt-1 break-all text-sm font-black text-white">{pixKey}</p>
              {activePix?.pixName && <p className="mt-1 text-xs text-slate-400">{activePix.pixName}{activePix.pixBank ? ` • ${activePix.pixBank}` : ""}</p>}
            </div>
            <button type="button" onClick={copyPix} className="mt-3 inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl border border-cyan-300/60 bg-cyan-400/10 px-4 text-sm font-black uppercase text-cyan-100">
              <Copy className="h-5 w-5" /> Copiar chave PIX
            </button>
            <a href={whatsappHref} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-[58px] w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-amber-300 via-yellow-300 to-amber-400 px-4 text-center text-sm font-black uppercase text-[#251600] shadow-[0_0_28px_rgba(251,191,36,.25)]">
              <MessageCircle className="h-6 w-6" /> Já paguei — ativar VIP
            </a>
            <p className="mt-3 text-center text-[11px] leading-4 text-slate-400">Depois do PIX, envie o comprovante no WhatsApp. A equipe H2 libera o acesso VIP.</p>
          </>
        ) : (
          <a href={whatsappHref} target="_blank" rel="noreferrer" className="mt-4 inline-flex min-h-[58px] w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 text-center text-sm font-black uppercase text-white">
            <MessageCircle className="h-6 w-6" /> Falar com a H2 para contratar
          </a>
        )}
      </div>

      <div className="mt-5 flex items-start gap-3 rounded-2xl border border-violet-300/25 bg-violet-500/[0.06] p-4 text-xs leading-5 text-slate-400">
        <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-violet-300" />
        <p>Nos produtos, você verá o preço normal e o preço VIP lado a lado. Assim fica claro quanto economiza antes de contratar.</p>
      </div>
    </>
  )}
</div>
        </section>
      </div>
    </main>
  );
}
