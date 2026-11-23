import { buildWhatsappMessageUrl } from "@shared/whatsappUrl";
import { useEffect, useState } from "react";

const OTP_DRAFT_KEY = "h2_customer_otp_login_draft";
const OTP_DRAFT_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_STORED_COOLDOWN_MS = 24 * 60 * 60 * 1000;
type OtpChannel = "email" | "whatsapp" | "both";
function cooldownKey(phone: string, channel: OtpChannel): string { return "h2_otp_cooldown_" + phone + "_" + channel; }
function savedCooldown(phone: string, channel: OtpChannel): number {
  if (!/^\d{11}$/.test(phone)) return 0;
  try { const until = Number(localStorage.getItem(cooldownKey(phone, channel)) || "0");
    const now = Date.now();
    return Number.isFinite(until) && until > now && until <= now + OTP_MAX_STORED_COOLDOWN_MS + 1000 ? until : 0;
  } catch { return 0; }
}
function storeCooldown(phone: string, channel: OtpChannel, until: number): void {
  if (!/^\d{11}$/.test(phone)) return;
  try { localStorage.setItem(cooldownKey(phone, channel), String(until)); } catch {}
}
function remainingSeconds(until: number, now: number): number { return Math.max(0, Math.ceil((until - now) / 1000)); }
export function formatOtpCooldown(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remaining = total % 60;
  const mmss = `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
  return hours > 0 ? `${String(hours).padStart(2, "0")}:${mmss}` : mmss;
}
function readOtpDraft(): {phone: string; step: "phone" | "code"; channel: OtpChannel} | null {
  try {
    const raw = sessionStorage.getItem(OTP_DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    if (typeof draft.phone === "string" && /^\d{11}$/.test(draft.phone) &&
        Number.isFinite(draft.expiresAt) && draft.expiresAt > Date.now() &&
        draft.expiresAt <= Date.now() + OTP_DRAFT_TTL_MS) {
      return {phone: draft.phone, step: draft.step === "code" ? "code" : "phone", channel: draft.channel === "both" ? "both" : draft.channel === "whatsapp" ? "whatsapp" : "email"};
    }
    sessionStorage.removeItem(OTP_DRAFT_KEY);
  } catch { /* Ignore malformed browser draft. */ }
  return null;
}
function saveOtpDraft(phone: string, step: "phone" | "code", channel: OtpChannel = "both") {
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
  if ((digits.length === 14 || digits.length === 15) && digits.startsWith("0055")) {
    digits = digits.slice(4);
  } else if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    digits = digits.slice(2);
  }
  return digits.slice(0, 11);
}

export function normalizeOtpWhatsappDestination(input: string): string {
  const raw = input.trim();
  const digits = raw.replace(/\D/g, "");
  // Explicit international prefixes and full international numbers stay intact.
  if (raw.startsWith("+")) return digits;
  if (digits.startsWith("00")) return digits.slice(2);
  // This product's unprefixed 10/11-digit support numbers are Brazilian.
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

export function CustomerOtpLogin({ title = "Acesso H2 Colombiano", initialPhone = "", onAuthenticated, onRegister }: Props) {
  const [initialState] = useState<{ phone: string; step: "phone" | "code"; channel: OtpChannel }>(() => {
    const draft = readOtpDraft();
    const selectedPhone = normalizeOtpPhone(initialPhone) || draft?.phone || "";
    const matchingDraft = draft?.phone === selectedPhone ? draft : null;
    if (draft && !matchingDraft) clearOtpDraft();
    return { phone: selectedPhone, step: matchingDraft?.step || "phone", channel: matchingDraft?.channel || "both" };
  });
  const [phone, setPhone] = useState(initialState.phone);
  const [step, setStep] = useState<"phone" | "code">(initialState.step);
  const [deliveryChannel, setDeliveryChannel] = useState<OtpChannel>(initialState.channel);
  const [code, setCode] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  const [showWhatsappFallback, setShowWhatsappFallback] = useState(initialState.step === "code" && initialState.channel !== "email");
  const [busy, setBusy] = useState(false);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [cooldowns, setCooldowns] = useState<{email:number;whatsapp:number}>(() => {
    const selectedPhone = initialState.phone;
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
  const supportNumber = normalizeOtpWhatsappDestination(String(supportSettings?.whatsapp_number || "5511978307371"));

  function rememberCooldown(channel: OtpChannel, seconds: number, scope: "all" | "channel" = "channel") {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    const until = Date.now() + Math.min(Math.ceil(seconds) * 1000, OTP_MAX_STORED_COOLDOWN_MS);
    if (scope === "all") {
      const emailUntil = Math.max(until, savedCooldown(cleanPhone, "email"));
      const whatsappUntil = Math.max(until, savedCooldown(cleanPhone, "whatsapp"));
      setCooldowns(previous => ({ email: Math.max(previous.email, emailUntil), whatsapp: Math.max(previous.whatsapp, whatsappUntil) }));
      storeCooldown(cleanPhone, "email", emailUntil);
      storeCooldown(cleanPhone, "whatsapp", whatsappUntil);
    } else {
      const channelUntil = Math.max(until, savedCooldown(cleanPhone, channel));
      setCooldowns(previous => ({ ...previous, [channel]: Math.max(previous[channel], channelUntil) }));
      storeCooldown(cleanPhone, channel, channelUntil);
    }
    setClockNow(Date.now());
  }

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

  // A aba precisa nascer dentro do clique do usuário. Se for aberta após
  // awaits, Safari/Chrome podem bloquear a nova aba e deixar o cliente sem código.
  function openWhatsappWaitingTab(): Window | null {
    let tab: Window | null = null;
    try {
      tab = window.open("", "_blank");
      if (!tab) return null;
      tab.opener = null;
      tab.document.title = "H2 Colombiano - preparando WhatsApp";
      tab.document.body.style.cssText = "margin:0;background:#050b1b;color:#fff;font-family:Arial,sans-serif;display:grid;place-items:center;min-height:100vh;text-align:center;padding:24px;box-sizing:border-box";
      tab.document.body.textContent = "H2 COLOMBIANO - Preparando seu código. Abriremos o WhatsApp automaticamente.";
      return tab;
    } catch {
      try { tab?.close(); } catch {}
      return null;
    }
  }

  async function send(channel: OtpChannel) {
    const remaining = channel === "both" ? Math.max(remainingEmail, remainingWhatsapp) : channel === "email" ? remainingEmail : remainingWhatsapp;
    if (remaining > 0) { toast.info("Aguarde " + formatOtpCooldown(remaining) + " para solicitar outro código por " + (channel === "email" ? "e-mail" : "WhatsApp") + "."); return; }
    if (cleanPhone.length !== 11) {
      toast.error("Informe um telefone com DDD e 11 números.");
      return;
    }
    if (channel === "whatsapp" && h2AutoDelivery?.available !== true) {
      toast.error("Recebimento pelo WhatsApp indisponível. Use o botão azul do e-mail.");
      return;
    }
    // Abrir imediatamente a segunda aba durante o clique, antes de consultar o
    // servidor. O envio da mensagem só pode acontecer APÓS o código existir.
    const whatsappTab = channel !== "email" && h2AutoDelivery?.available === true ? openWhatsappWaitingTab() : null;
    setShowWhatsappFallback(false);
    setBusy(true);
    try {
      // Check before requesting a code; the current OTP endpoint
      // intentionally returns a generic response for unknown numbers.
      const account = await checkCustomer.mutateAsync({ phone: cleanPhone });
      if (account.blocked || account.customerBlocked) {
        whatsappTab?.close();
        toast.error(account.customerBlocked
          ? "Este cadastro está bloqueado. Entre em contato com o atendimento."
          : "Consulta temporariamente bloqueada. Entre em contato com o atendimento.");
        return;
      }
      if (account.exists === false) {
        whatsappTab?.close();
        startRegistration();
        return;
      }
      if (account.exists !== true) {
        whatsappTab?.close();
        toast.error("Não foi possível consultar este número. Tente novamente.");
        return;
      }
      if (!account.customer?.email) {
        whatsappTab?.close();
        toast.error("Seu cadastro está sem e-mail. Entre em contato com o atendimento.");
        return;
      }
      const result = await requestCode.mutateAsync({phone: cleanPhone, channel});
      if (result.resendBlocked) {
        whatsappTab?.close();
        const wait = Math.max(0,result.retryAfterSeconds || 0);
        rememberCooldown(channel === "both" ? "email" : channel, wait,
          channel === "both" ? "all" : result.cooldownScope || (wait > 60 ? "all" : "channel"));
        toast.info(result.message || "Aguarde para solicitar outro código.");
        return;
      }
      if (channel === "both") {
        rememberCooldown("email", result.retryAfterSeconds || OTP_RESEND_COOLDOWN_MS / 1000, "all");
      } else {
        rememberCooldown(channel, result.retryAfterSeconds || OTP_RESEND_COOLDOWN_MS / 1000, result.cooldownScope || "channel");
      }
      setCode("");
      setDeliveryChannel(channel);
      setStep("code");
      setShowHelp(false);
      saveOtpDraft(cleanPhone, "code", channel);
      if (channel === "whatsapp" || (channel === "both" && result.whatsappPrepared)) {
        // O formulário de seis dígitos permanece na aba original.
        // A segunda aba recebe o destino somente depois de o OTP estar salvo.
        let redirected = false;
        if (whatsappTab && !whatsappTab.closed) {
          try {
            whatsappTab.location.replace(buildWhatsappMessageUrl(supportNumber, "Preciso receber meu código"));
            redirected = true;
          } catch {
            try { whatsappTab.close(); } catch {}
          }
        }
        setShowWhatsappFallback(!redirected);
        toast.info(redirected
          ? "Código enviado ao e-mail. Se desejar, toque em Enviar no WhatsApp e volte para esta tela."
          : "Código enviado ao e-mail. Se desejar receber também pelo WhatsApp, abra o link abaixo.");
      } else {
        try { whatsappTab?.close(); } catch {}
        toast.success(channel === "both"
          ? "Código solicitado por e-mail. Confira a caixa de entrada e o spam."
          : result.message || "Solicitação de código por e-mail realizada. Confira também a pasta de spam.");
      }
    } catch (err: any) {
      try { whatsappTab?.close(); } catch {}
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
          <form onSubmit={event => { event.preventDefault(); void send("both"); }} className="mt-7 space-y-4">
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
              required
            />
            <div className="space-y-3" aria-label="Recebimento do código">
              <button type="submit" disabled={busy || cleanPhone.length !== 11 || remainingEmail > 0 || remainingWhatsapp > 0}
                className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 p-4 font-black text-slate-950 transition-colors hover:bg-cyan-400 disabled:opacity-50">
                <ShieldCheck className="h-5 w-5" />
                {Math.max(remainingEmail, remainingWhatsapp) > 0
                  ? "AGUARDE " + formatOtpCooldown(Math.max(remainingEmail, remainingWhatsapp))
                  : busy ? "Solicitando..." : "RECEBER CÓDIGO"}
              </button>
              <p className="text-center text-xs leading-relaxed text-slate-300">
                Enviaremos o código ao e-mail cadastrado.
                {h2AutoDelivery?.available === true
                  ? " O WhatsApp também será aberto em outra aba: toque em Enviar para recebê-lo por lá."
                  : ""}
              </p>
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
              {deliveryChannel !== "email" ? <MessageCircle className="h-5 w-5 text-[#ff6060]" /> : <Mail className="h-5 w-5" />}
              <span>{deliveryChannel === "both"
                ? "Código solicitado por e-mail. Se o WhatsApp abriu, toque em Enviar na mensagem preparada para receber o mesmo código. Volte aqui para digitá-lo."
                : deliveryChannel === "whatsapp"
                ? "O WhatsApp abre automaticamente em outra aba. Toque em Enviar na mensagem preenchida no WhatsApp. O sistema responde com o código após receber a mensagem. Volte aqui para digitá-lo."
                : "Digite o código recebido no e-mail cadastrado. Confira também a pasta de spam."}</span>
            </div>
            {(deliveryChannel === "whatsapp" || deliveryChannel === "both") && showWhatsappFallback && (
              <div className="space-y-2 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3" data-testid="h2-otp-whatsapp-separate-tab">
                <a href={buildWhatsappMessageUrl(supportNumber, "Preciso receber meu código")}
                  target="_blank" rel="noopener noreferrer"
                  data-testid="h2-otp-open-whatsapp"
                  className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#128C4A] px-4 py-3 text-center text-sm font-black text-white hover:bg-[#0b783a]">
                  <MessageCircle className="h-5 w-5" /> ABRIR WHATSAPP (SE NÃO ABRIU)
                </a>
                <p className="text-center text-xs leading-relaxed text-slate-100">
                  O navegador impediu o redirecionamento automático. Abra pelo link acima, envie a mensagem e volte a esta tela.
                </p>
              </div>
            )}
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
            <button type="button" className="w-full py-2 text-sm text-cyan-300" disabled={busy}
              aria-expanded={showHelp} aria-controls="h2-otp-help"
              onClick={() => setShowHelp(previous => !previous)}>
              Não recebi o código
            </button>
            {showHelp && (
              <div id="h2-otp-help" role="region" aria-label="Ajuda para receber o código" className="space-y-3">
                <div className="space-y-2 rounded-xl border border-white/10 p-3" aria-label="Solicitar outro código">
                  <p className="text-center text-xs text-slate-300">Não chegou? Confira o e-mail ou solicite novamente.</p>
                  <button type="button" disabled={busy || remainingEmail > 0 || remainingWhatsapp > 0}
                    onClick={() => void send("both")}
                    className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 p-3 font-bold text-slate-950 disabled:opacity-50">
                    <Mail className="h-4 w-4" />
                    {Math.max(remainingEmail, remainingWhatsapp) > 0
                      ? "AGUARDE " + formatOtpCooldown(Math.max(remainingEmail, remainingWhatsapp))
                      : "SOLICITAR NOVO CÓDIGO"}
                  </button>
                </div>
                <button type="button" className="w-full py-2 text-sm text-cyan-300" disabled={busy}
                  onClick={() => { setStep("phone"); setCode(""); setShowHelp(false); saveOtpDraft(cleanPhone, "phone", deliveryChannel); }}>
                  Alterar telefone
                </button>
                <a href="https://h2colombiano.com/" className="block py-2 text-center text-sm text-cyan-300">
                  ← VOLTAR AO SITE
                </a>
              </div>
            )}
          </form>
        )}
        {step === "phone" && <a
          href="https://h2colombiano.com/"
          className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-cyan-400/40 bg-cyan-400/10 px-4 py-3 text-center text-sm font-bold text-cyan-200 transition-colors hover:bg-cyan-400/20"
        >
          ← VOLTAR AO SITE
        </a>}
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
    </main>
  );
}
