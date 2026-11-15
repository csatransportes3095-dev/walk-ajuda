import { encodeWhatsappMessage } from "@shared/whatsappMessageText";
import { useEffect, useState } from "react";

const OTP_DRAFT_KEY = "h2_customer_otp_login_draft";
const OTP_DRAFT_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
type OtpChannel = "email" | "whatsapp";
type WhatsappApp = "normal" | "business";

// Only used by the explicit app-selection links on Android; no APK or
// server change is necessary. Chrome targets the chosen installed package.
function whatsappOtpAppHref(phone: string, app: WhatsappApp, android: boolean): string {
  const message = encodeWhatsappMessage("Preciso receber meu código");
  if (!android) return `https://wa.me/${phone}?text=${message}`;
  const pkg = app === "normal" ? "com.whatsapp" : "com.whatsapp.w4b";
  return `intent://send?phone=${phone}&text=${message}#Intent;scheme=whatsapp;package=${pkg};end`;
}
function cooldownKey(phone: string, channel: OtpChannel): string { return "h2_otp_cooldown_" + phone + "_" + channel; }
function savedCooldown(phone: string, channel: OtpChannel): number {
  if (!/^\d{11}$/.test(phone)) return 0;
  try { const until = Number(localStorage.getItem(cooldownKey(phone, channel)) || "0");
    return Number.isFinite(until) && until > Date.now() && until < Date.now() + OTP_RESEND_COOLDOWN_MS + 1000 ? until : 0;
  } catch { return 0; }
}
function storeCooldown(phone: string, channel: OtpChannel, until: number): void {
  if (!/^\d{11}$/.test(phone)) return;
  try { localStorage.setItem(cooldownKey(phone, channel), String(until)); } catch {}
}
function remainingSeconds(until: number, now: number): number { return Math.max(0, Math.ceil((until - now) / 1000)); }
function readOtpDraft(): {phone: string; step: "phone" | "code"; channel: "email" | "whatsapp"} | null {
  try {
    const raw = sessionStorage.getItem(OTP_DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    if (typeof draft.phone === "string" && /^\d{11}$/.test(draft.phone) &&
        Number.isFinite(draft.expiresAt) && draft.expiresAt > Date.now() &&
        draft.expiresAt <= Date.now() + OTP_DRAFT_TTL_MS) {
      return {phone: draft.phone, step: draft.step === "code" ? "code" : "phone", channel: draft.channel === "whatsapp" ? "whatsapp" : "email"};
    }
    sessionStorage.removeItem(OTP_DRAFT_KEY);
  } catch { /* Ignore malformed browser draft. */ }
  return null;
}
function saveOtpDraft(phone: string, step: "phone" | "code", channel: "email" | "whatsapp" = "email") {
  try { sessionStorage.setItem(OTP_DRAFT_KEY, JSON.stringify({phone, step, channel, expiresAt: Date.now() + OTP_DRAFT_TTL_MS})); } catch {}
}
function clearOtpDraft() { try { sessionStorage.removeItem(OTP_DRAFT_KEY); } catch {} }
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { CheckCircle2, Mail, MessageCircle, Phone, ShieldCheck } from "lucide-react";

export type CustomerOtpResult = {
  token: string;
  phone: string;
  profileUpdateRequired: boolean;
  profileUpdateFields: string[];
};

type Props = {
  title?: string;
  initialPhone?: string;
  onAuthenticated: (result: CustomerOtpResult) => void | Promise<void>;
  onRegister?: () => void;
};

export function normalizeOtpPhone(input: string): string {
  let digits = input.replace(/\D/g, "");
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    digits = digits.slice(2);
  }
  return digits.slice(0, 11);
}

export function CustomerOtpLogin({ title = "Acesso H2 Colombiano", initialPhone = "", onAuthenticated, onRegister }: Props) {
  const [draft] = useState(() => readOtpDraft());
  const [phone, setPhone] = useState(() => normalizeOtpPhone(initialPhone) || draft?.phone || "");
  const [step, setStep] = useState<"phone" | "code">(() => draft?.step || "phone");
  const [deliveryChannel, setDeliveryChannel] = useState<"email" | "whatsapp">(() => draft?.channel || "email");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [chooseWhatsappApp, setChooseWhatsappApp] = useState(false);
  const [isAndroid] = useState(() => typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent));
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [cooldowns, setCooldowns] = useState<{email:number;whatsapp:number}>(() => {
    const selectedPhone = normalizeOtpPhone(initialPhone) || draft?.phone || "";
    return {email:savedCooldown(selectedPhone,"email"),whatsapp:savedCooldown(selectedPhone,"whatsapp")};
  });
  useEffect(() => { const id = window.setInterval(() => setClockNow(Date.now()), 250); return () => window.clearInterval(id); }, []);
  const checkCustomer = trpc.customers.checkByPhoneMutation.useMutation();
  const requestCode = trpc.customerPassword.requestCustomerCode.useMutation();
  const {data: h2AutoDelivery} = trpc.customerPassword.h2AutoOtpAvailable.useQuery();
  const verifyCode = trpc.customerPassword.verifyCustomerCode.useMutation();
  const cleanPhone = normalizeOtpPhone(phone);
  const remainingEmail = remainingSeconds(Math.max(cooldowns.email,savedCooldown(cleanPhone,"email")),clockNow);
  const remainingWhatsapp = remainingSeconds(Math.max(cooldowns.whatsapp,savedCooldown(cleanPhone,"whatsapp")),clockNow);
  const { data: supportSettings } = trpc.settings.getAll.useQuery();
  const loginSettings = supportSettings;
  const supportNumber = String(supportSettings?.whatsapp_number || "5511978307371").replace(/\D/g, "");
  const supportHref = `https://wa.me/${supportNumber}?text=${encodeWhatsappMessage("Olá! Sou cliente do H2 Colombiano. Estou tentando acessar o site, mas não recebi o código de confirmação por e-mail. Preciso de ajuda para continuar meu pedido.")}`;

  function startRegistration() {
    clearOtpDraft();
    // Reuse the existing complete H2 customer registration, not /pre-cadastro.
    // The phone is only a draft field, never an authorization credential.
    if (cleanPhone.length === 11) {
      sessionStorage.setItem("h2_new_registration_phone", cleanPhone);
      sessionStorage.setItem("reg_phone_temp", cleanPhone);
    } else {
      sessionStorage.removeItem("h2_new_registration_phone");
      sessionStorage.removeItem("reg_phone_temp");
    }
    if (onRegister) onRegister();
    else window.location.assign("/cadastro");
  }

  async function send(channel: OtpChannel) {
    const remaining = channel === "email" ? remainingEmail : remainingWhatsapp;
    if (remaining > 0) { toast.info("Aguarde " + remaining + "s para solicitar outro código por " + (channel === "email" ? "e-mail" : "WhatsApp") + "."); return; }
    if (cleanPhone.length !== 11) {
      toast.error("Informe um telefone com DDD e 11 números.");
      return;
    }
    if (channel === "whatsapp" && h2AutoDelivery?.available !== true) {
      toast.error("Recebimento pelo WhatsApp indisponível. Use o botão azul do e-mail.");
      return;
    }
    setBusy(true);
    try {
      // Check before requesting a code; the current OTP endpoint
      // intentionally returns a generic response for unknown numbers.
      const account = await checkCustomer.mutateAsync({ phone: cleanPhone });
      if (account.blocked || account.customerBlocked) {
        toast.error(account.customerBlocked
          ? "Este cadastro está bloqueado. Entre em contato com o atendimento."
          : "Consulta temporariamente bloqueada. Entre em contato com o atendimento.");
        return;
      }
      if (account.exists === false) {
        startRegistration();
        return;
      }
      if (account.exists !== true) {
        toast.error("Não foi possível consultar este número. Tente novamente.");
        return;
      }
      if (!account.customer?.email) {
        toast.error("Seu cadastro está sem e-mail. Entre em contato com o atendimento.");
        return;
      }
      const result = await requestCode.mutateAsync({phone: cleanPhone, channel});
      if (result.resendBlocked) {
        const wait = Math.max(0,result.retryAfterSeconds || 0);
        if (wait > 0 && wait <= 60) { const until = Date.now() + wait * 1000;
          setCooldowns(prev => ({...prev,[channel]:until})); storeCooldown(cleanPhone,channel,until); }
        toast.info(result.message || "Aguarde para solicitar outro código.");
        return;
      }
      const until = Date.now() + (result.retryAfterSeconds || 60) * 1000;
      setCooldowns(prev => ({...prev,[channel]:until})); storeCooldown(cleanPhone,channel,until); setClockNow(Date.now());
      setCode("");
      setDeliveryChannel(channel);
      setStep("code");
      saveOtpDraft(cleanPhone, "code", channel);
      if (channel === "whatsapp") {
        // Only the way the customer opens WhatsApp changes. The request,
        // phone, generated OTP and cooldown are already saved above.
        // User must explicitly choose an app and tap Send in that chat.
        setChooseWhatsappApp(true);
      } else {
        toast.success(result.message || "Confira o e-mail cadastrado.");
      }
    } catch (err: any) {
      toast.error(err?.message || "Não foi possível solicitar o código.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm(event: React.FormEvent) {
    event.preventDefault();
    const digits = code.replace(/\D/g, "").slice(0, 6);
    if (digits.length !== 6) {
      toast.error("Informe os 6 números do código.");
      return;
    }
    setBusy(true);
    try {
      const result = await verifyCode.mutateAsync({ phone: cleanPhone, code: digits });
      if (!result.success) {
        toast.error(result.message || "Código inválido ou expirado.");
        return;
      }
      if (!result.token) {
        toast.error("Não foi possível confirmar o acesso.");
        return;
      }
      // Only the server can issue the session after consuming a valid code.
      // Local storage alone is never used to authorize a protected route.
      await onAuthenticated({
        token: result.token,
        phone: cleanPhone,
        profileUpdateRequired: result.profileUpdateRequired,
        profileUpdateFields: result.profileUpdateFields || [],
      });
      // Store only after the route-specific server authorization callback
      // succeeds, preventing failed permissions from leaving a cached token.
      localStorage.setItem("cp_token", result.token);
      // Order, raffle, appointments and old site modules still read the
      // canonical phone. It is NOT an authorization credential.
      localStorage.setItem("walk_client_phone", cleanPhone);
      clearOtpDraft();
      toast.success("Identidade confirmada!");
    } catch (err: any) {
      toast.error(err?.message || "Falha ao verificar o código.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-0 bg-[#050b1b] text-white flex flex-col items-center justify-start px-4 pt-3 pb-0 sm:pt-5">
      <div className="w-full max-w-md rounded-3xl border border-cyan-400/30 bg-slate-950 p-6 sm:p-8 shadow-[0_0_35px_rgba(6,182,212,0.12)]">
        {loginSettings?.login_show_image !== "0" && <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-cyan-400/50 bg-cyan-400/10">
          {loginSettings?.login_image_url ? <img src={loginSettings.login_image_url} alt="Logo do H2 Colombiano" className="h-full w-full object-contain" /> : <ShieldCheck className="h-9 w-9 text-cyan-300" aria-hidden />}
        </div>}
        {loginSettings?.login_show_title !== "0" && <h1 className="text-center text-2xl font-black">{loginSettings?.login_title?.trim() || title}</h1>}
        {loginSettings?.login_show_subtitle !== "0" && <p className="mt-2 whitespace-pre-line text-center text-sm text-slate-300">
          {loginSettings?.login_subtitle?.trim() || "Acesso seguro com telefone e código. Nenhuma senha é necessária."}
        </p>}

        {step === "phone" ? (
          <form onSubmit={event => { event.preventDefault(); void send("email"); }} className="mt-7 space-y-4">
            <label htmlFor="h2-otp-phone" className="flex items-center gap-2 text-sm font-semibold">
              <Phone className="h-4 w-4" /> Telefone com DDD
            </label>
            <input
              id="h2-otp-phone"
              type="tel"
              autoComplete="tel-national"
              inputMode="numeric"
              className="w-full rounded-xl border border-white/20 bg-slate-900 p-4 text-center text-xl font-bold outline-none focus:border-cyan-400"
              placeholder="(11) 99999-9999"
              value={phone}
              onChange={e => { const next = normalizeOtpPhone(e.target.value); setPhone(next); setCooldowns({email:savedCooldown(next,"email"),whatsapp:savedCooldown(next,"whatsapp")}); saveOtpDraft(next, "phone", deliveryChannel); }}
              disabled={busy}
              maxLength={11}
              required
            />
            <div className="space-y-3" aria-label="Escolha como receber o código">
              <button type="submit" disabled={busy || cleanPhone.length !== 11 || remainingEmail > 0}
                className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 p-4 font-black text-slate-950 transition-colors hover:bg-cyan-400 disabled:opacity-50">
                <Mail className="h-5 w-5" />
                {remainingEmail > 0 ? "E-MAIL · AGUARDE 00:" + String(remainingEmail).padStart(2,"0") : busy ? "Solicitando..." : "RECEBER POR E-MAIL"}
              </button>
              <button type="button" disabled={busy || cleanPhone.length !== 11 || h2AutoDelivery?.available !== true || remainingWhatsapp > 0}
                onClick={() => void send("whatsapp")}
                className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border border-[#c62828] bg-[#8B0000] p-4 font-black text-white shadow-[0_4px_18px_rgba(139,0,0,0.35)] transition-colors hover:bg-[#a30000] disabled:cursor-not-allowed disabled:opacity-50">
                <MessageCircle className="h-5 w-5" />
                {remainingWhatsapp > 0 ? "WHATSAPP · AGUARDE 00:" + String(remainingWhatsapp).padStart(2,"0") : "RECEBER PELO WHATSAPP"}
              </button>
              {h2AutoDelivery?.available !== true && (
                <p className="text-center text-xs text-slate-400">WhatsApp temporariamente indisponível. O e-mail continua funcionando.</p>
              )}
            </div>
            {onRegister && (
              <button type="button" className="flex min-h-12 w-full items-center justify-center rounded-xl border border-cyan-400/40 bg-cyan-400/10 px-4 py-3 text-center text-sm font-black text-cyan-200 transition-colors hover:bg-cyan-400/20" onClick={startRegistration}>
                Ainda não tenho cadastro
              </button>
            )}
          </form>
        ) : (
          <form onSubmit={confirm} className="mt-7 space-y-4">
            <div className="flex items-center gap-2 text-sm text-cyan-100">
              {deliveryChannel === "whatsapp" ? <MessageCircle className="h-5 w-5 text-[#ff6060]" /> : <Mail className="h-5 w-5" />}
              <span>{deliveryChannel === "whatsapp"
                ? "Envie a mensagem preparada no WhatsApp. O código será respondido lá."
                : "Código solicitado ao e-mail cadastrado."}</span>
            </div>
            <label htmlFor="h2-otp-code" className="block text-sm font-semibold">Código de 6 números</label>
            <input id="h2-otp-code" type="text" inputMode="numeric" autoComplete="one-time-code"
              pattern="[0-9]{6}" maxLength={6} value={code} autoFocus
              onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              disabled={busy}
              className="w-full rounded-xl border border-white/20 bg-slate-900 p-4 text-center text-2xl tracking-[.4em] font-black outline-none focus:border-cyan-400"
              placeholder="000000" required />
            <button type="submit" disabled={busy || code.length !== 6}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 p-4 font-black text-slate-950 disabled:opacity-50">
              <CheckCircle2 className="h-5 w-5" /> {busy ? "Validando..." : "CONFIRMAR E ACESSAR"}
            </button>
            {deliveryChannel === "email" ? (
              <a href={supportHref} target="_blank" rel="noopener noreferrer" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-emerald-400/50 bg-emerald-500/15 px-4 py-3 text-center text-sm font-black text-emerald-200 hover:bg-emerald-500/25">
                💬 NÃO RECEBI O CÓDIGO — PEDIR AJUDA NO WHATSAPP
              </a>
            ) : (
              <button type="button" onClick={() => setChooseWhatsappApp(true)}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#8B0000] px-4 py-3 text-center text-sm font-black text-white hover:bg-[#a30000]">
                <MessageCircle className="h-5 w-5" /> VOLTAR AO WHATSAPP
              </button>
            )}
            <div className="space-y-2 rounded-xl border border-white/10 p-3" aria-label="Solicitar outro código">
              <p className="text-center text-xs text-slate-300">Precisa de outro código? Escolha como receber:</p>
              <button type="button" disabled={busy || remainingEmail > 0}
                onClick={() => void send("email")}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 p-3 font-bold text-slate-950 disabled:opacity-50">
                <Mail className="h-4 w-4" />
                {remainingEmail > 0 ? "E-MAIL · AGUARDE 00:" + String(remainingEmail).padStart(2,"0") : "PEDIR OUTRO POR E-MAIL"}
              </button>
              <button type="button" disabled={busy || remainingWhatsapp > 0 || h2AutoDelivery?.available !== true}
                onClick={() => void send("whatsapp")}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#8B0000] p-3 font-bold text-white disabled:opacity-50">
                <MessageCircle className="h-4 w-4" />
                {remainingWhatsapp > 0 ? "WHATSAPP · AGUARDE 00:" + String(remainingWhatsapp).padStart(2,"0") : "PEDIR OUTRO PELO WHATSAPP"}
              </button>
            </div>
            <button type="button" className="w-full py-2 text-sm text-cyan-300" disabled={busy}
              onClick={() => { setStep("phone"); setCode(""); saveOtpDraft(cleanPhone, "phone", deliveryChannel); }}>
              Alterar telefone
            </button>
          </form>
        )}
        <a
          href="https://h2colombiano.com/"
          className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-cyan-400/40 bg-cyan-400/10 px-4 py-3 text-center text-sm font-bold text-cyan-200 transition-colors hover:bg-cyan-400/20"
        >
          ← VOLTAR AO SITE
        </a>
        {loginSettings?.login_show_footer !== "0" && <p className="mt-4 whitespace-pre-line text-center text-xs text-slate-400">
          {loginSettings?.login_footer?.trim() || "O código expira em 10 minutos. Nunca compartilhe o código recebido."}
        </p>}
      </div>
      <footer className="mt-5 w-full flex-1 flex flex-col justify-end overflow-hidden bg-[#050b1b]" aria-label="Rodapé H2 Colombiano">
        <div className="relative mx-auto w-full max-w-[1920px] overflow-hidden border-t border-cyan-400/30 bg-gradient-to-r from-[#07152d] via-[#11102c] to-[#07152d]">
          {supportSettings?.login_footer_banner_url?.trim() ? (
            <picture>
              {supportSettings.login_footer_banner_desktop_url?.trim() && <source media="(min-width: 768px)" srcSet={supportSettings.login_footer_banner_desktop_url} />}
              <img src={supportSettings.login_footer_banner_url} alt="Banner do rodapé H2 Colombiano" className="block w-full aspect-[3/1] md:aspect-[6/1] object-cover" />
            </picture>
          ) : (
            <div className="flex min-h-36 items-center justify-center px-4 py-6 text-center sm:min-h-40">
              <div className="space-y-1">
                <p className="text-lg font-black tracking-widest text-cyan-100">H2 COLOMBIANO 🇨🇴</p>
                <p className="text-xs font-semibold tracking-wide text-amber-300">Segurança, tecnologia e confiança</p>
              </div>
            </div>
          )}
        </div>
      </footer>
      {chooseWhatsappApp && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 px-4 py-6">
          <div role="dialog" aria-modal="true" aria-labelledby="h2-whatsapp-app-title"
            className="w-full max-w-sm space-y-3 rounded-2xl border border-white/20 bg-slate-950 p-5 text-white shadow-2xl">
            <h2 id="h2-whatsapp-app-title" className="text-center text-lg font-black">Escolha o WhatsApp</h2>
            <p className="text-center text-sm text-slate-300">
              Use o WhatsApp do número cadastrado. Depois, envie a mensagem já preenchida para receber o código.
            </p>
            {isAndroid ? (
              <div className="space-y-3">
                <a href={whatsappOtpAppHref(supportNumber, "normal", true)}
                  onClick={() => setChooseWhatsappApp(false)}
                  className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#147D4B] px-4 py-3 text-center font-black text-white">
                  <MessageCircle className="h-5 w-5" /> WHATSAPP NORMAL
                </a>
                <a href={whatsappOtpAppHref(supportNumber, "business", true)}
                  onClick={() => setChooseWhatsappApp(false)}
                  className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#085E41] px-4 py-3 text-center font-black text-white">
                  <MessageCircle className="h-5 w-5" /> WHATSAPP BUSINESS
                </a>
              </div>
            ) : (
              <a href={whatsappOtpAppHref(supportNumber, "normal", false)}
                onClick={() => setChooseWhatsappApp(false)}
                className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#147D4B] px-4 py-3 text-center font-black text-white">
                <MessageCircle className="h-5 w-5" /> ABRIR WHATSAPP
              </a>
            )}
            <button type="button" onClick={() => setChooseWhatsappApp(false)}
              className="min-h-11 w-full rounded-xl border border-white/20 px-4 py-2 text-sm font-bold text-slate-200">
              CANCELAR
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
