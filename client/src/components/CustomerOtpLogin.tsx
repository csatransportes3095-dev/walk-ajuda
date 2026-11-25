import { buildWhatsappMessageUrl } from "@shared/whatsappUrl";
import { useEffect, useState } from "react";
import { flushSync } from "react-dom";

const OTP_DRAFT_KEY = "h2_customer_otp_login_draft";
const OTP_DRAFT_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_STORED_COOLDOWN_MS = 24 * 60 * 60 * 1000;
type OtpChannel = "email" | "whatsapp" | "both";
type OtpDraft = { phone: string; step: "phone" | "code"; channel: OtpChannel; whatsappPrepared: boolean; remember: boolean };
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
// iOS in-app browsers may discard sessionStorage when returning from an app.
// Mirror only the non-authorizing phone/step for up to 10 minutes, never OTPs.
function readOtpDraft(): OtpDraft | null {
  for (const kind of ["session", "local"] as const) {
    try {
      const storage = kind === "session" ? window.sessionStorage : window.localStorage;
      const raw = storage.getItem(OTP_DRAFT_KEY);
      if (!raw) continue;
      const draft = JSON.parse(raw);
      if (typeof draft.phone === "string" && /^\d{11}$/.test(draft.phone) &&
          Number.isFinite(draft.expiresAt) && draft.expiresAt > Date.now() &&
          draft.expiresAt <= Date.now() + OTP_DRAFT_TTL_MS) {
        return {
          phone: draft.phone,
          step: draft.step === "code" ? "code" : "phone",
          channel: draft.channel === "both" ? "both" : draft.channel === "whatsapp" ? "whatsapp" : "email",
          whatsappPrepared: draft.whatsappPrepared === true,
          remember: draft.remember !== false,
        };
      }
      storage.removeItem(OTP_DRAFT_KEY);
    } catch { /* Storage may be restricted; login still works. */ }
  }
  return null;
}
function saveOtpDraft(phone: string, step: "phone" | "code", channel: OtpChannel = "both", whatsappPrepared = false, remember = true) {
  const draft = JSON.stringify({phone, step, channel, whatsappPrepared, remember, expiresAt: Date.now() + OTP_DRAFT_TTL_MS});
  for (const kind of ["session", "local"] as const) {
    try { (kind === "session" ? window.sessionStorage : window.localStorage).setItem(OTP_DRAFT_KEY, draft); } catch {}
  }
}
function clearOtpDraft() {
  for (const kind of ["session", "local"] as const) {
    try { (kind === "session" ? window.sessionStorage : window.localStorage).removeItem(OTP_DRAFT_KEY); } catch {}
  }
}
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { CheckCircle2, Fingerprint, Mail, MessageCircle, Phone, ShieldCheck } from "lucide-react";
import { browserSupportsWebAuthn, startAuthentication, startRegistration as startPasskeyRegistration } from "@simplewebauthn/browser";

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

// On iPhone and Android, WhatsApp's native scheme avoids creating an empty
// Safari/webview tab. Desktop retains the usual web link.
export function buildNativeOtpWhatsappUrl(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, "");
  return `whatsapp://send?phone=${encodeURIComponent(digits)}&text=${encodeURIComponent(message)}`;
}
function supportsNativeOtpWhatsappHandoff(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod|Android/i.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function CustomerOtpLogin({ title = "Acesso H2 Colombiano", initialPhone = "", onAuthenticated, onRegister }: Props) {
  const [initialState] = useState<OtpDraft>(() => {
    const draft = readOtpDraft();
    const selectedPhone = normalizeOtpPhone(initialPhone) || draft?.phone || "";
    const matchingDraft = draft?.phone === selectedPhone ? draft : null;
    if (draft && !matchingDraft) clearOtpDraft();
    return { phone: selectedPhone, step: matchingDraft?.step || "phone", channel: matchingDraft?.channel || "both", whatsappPrepared: matchingDraft?.whatsappPrepared === true, remember: matchingDraft?.remember !== false };
  });
  const [phone, setPhone] = useState(initialState.phone);
  const [step, setStep] = useState<"phone" | "code">(initialState.step);
  const [deliveryChannel, setDeliveryChannel] = useState<OtpChannel>(initialState.channel);
  const [code, setCode] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  const [showWhatsappLink, setShowWhatsappLink] = useState(initialState.step === "code" && initialState.whatsappPrepared);
  const [busy, setBusy] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [remember, setRemember] = useState(initialState.remember);
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
  const enrollmentAvailability = trpc.customerPassword.passkeyEnrollmentAvailable.useQuery(undefined, { retry: false });
  const finishEnrollment = trpc.customerPassword.finishPasskeyEnrollment.useMutation();
  const [enrollPasskey, setEnrollPasskey] = useState(false);
  const [pendingEnrollment, setPendingEnrollment] = useState<null | { result: CustomerOtpResult; challengeId: string; options: Parameters<typeof startPasskeyRegistration>[0]["optionsJSON"] }>(null);
  const [enrollmentFailure, setEnrollmentFailure] = useState<CustomerOtpResult | null>(null);
  const canEnrollPasskey = enrollmentAvailability.data?.available === true && browserSupportsWebAuthn();
  const loginAvailability = trpc.customerPassword.passkeyLoginAvailable.useQuery(undefined, { retry: false, refetchOnWindowFocus: true });
  const beginPasskey = trpc.customerPassword.beginPasskeyLogin.useMutation();
  const finishPasskey = trpc.customerPassword.finishPasskeyLogin.useMutation();
  const canLoginWithPasskey = loginAvailability.data?.available === true && browserSupportsWebAuthn();
  const cleanPhone = normalizeOtpPhone(phone);
  const remainingEmail = remainingSeconds(Math.max(cooldowns.email,savedCooldown(cleanPhone,"email")),clockNow);
  const remainingWhatsapp = remainingSeconds(Math.max(cooldowns.whatsapp,savedCooldown(cleanPhone,"whatsapp")),clockNow);
  const { data: supportSettings } = trpc.settings.getAll.useQuery();
  const loginSettings = supportSettings;
  const supportNumber = normalizeOtpWhatsappDestination(String(supportSettings?.whatsapp_number || "5511978307371"));
  const nativeWhatsapp = supportsNativeOtpWhatsappHandoff();
  const whatsappUrl = nativeWhatsapp
    ? buildNativeOtpWhatsappUrl(supportNumber, "Preciso receber meu código")
    : buildWhatsappMessageUrl(supportNumber, "Preciso receber meu código");

  function rememberCooldown(channel: "email" | "whatsapp", seconds: number, scope: "all" | "channel" = "channel") {
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

  // No popup, placeholder tab or automatic navigation. The customer remains
  // on the code-entry page and explicitly launches WhatsApp AFTER OTP creation.
  async function send(channel: OtpChannel) {
    const remaining = channel === "both" ? Math.max(remainingEmail, remainingWhatsapp) : channel === "email" ? remainingEmail : remainingWhatsapp;
    if (remaining > 0) { toast.info("Aguarde " + formatOtpCooldown(remaining) + " para solicitar outro código."); return; }
    if (cleanPhone.length !== 11) {
      toast.error("Informe um telefone com DDD e 11 números.");
      return;
    }
    if (channel === "whatsapp" && h2AutoDelivery?.available !== true) {
      toast.error("WhatsApp temporariamente indisponível. Use o código enviado ao e-mail.");
      return;
    }
    setBusy(true);
    try {
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
        const wait = Math.max(0, result.retryAfterSeconds || 0);
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
      const whatsappPrepared = channel !== "email" && result.whatsappPrepared === true;
      // Commit and persist the OTP input BEFORE handing off to WhatsApp.
      // This must be the page Safari shows when the customer returns.
      saveOtpDraft(cleanPhone, "code", channel, whatsappPrepared, remember);
      flushSync(() => {
        setCode("");
        setDeliveryChannel(channel);
        setStep("code");
        setShowHelp(false);
        setShowWhatsappLink(false);
      });
      if (whatsappPrepared) {
        // On phones, use the native app URI IN THIS TAB. This does not
        // create an about:blank tab or replace the /login document on success.
        // The OTP challenge already exists: the robot can answer immediately.
        if (nativeWhatsapp) {
          let switchedToWhatsapp = document.visibilityState === "hidden";
          const recordSwitch = () => {
            if (document.visibilityState === "hidden") switchedToWhatsapp = true;
          };
          document.addEventListener("visibilitychange", recordSwitch);
          try {
            window.location.assign(whatsappUrl);
          } catch {
            setShowWhatsappLink(true);
          }
          // Some iOS in-app browsers refuse app links after an async request.
          // Only in that case reveal a small recovery link; no intermediary page.
          window.setTimeout(() => {
            document.removeEventListener("visibilitychange", recordSwitch);
            if (!switchedToWhatsapp && document.visibilityState === "visible") {
              setShowWhatsappLink(true);
            }
          }, 1600);
        } else {
          // Desktop keeps the original code page while opening the WhatsApp
          // destination directly. No blank waiting tab is ever created.
          const chatWindow = window.open(whatsappUrl, "_blank");
          if (chatWindow) {
            try { chatWindow.opener = null; } catch {}
          } else {
            setShowWhatsappLink(true);
          }
        }
      }
    } catch (err: any) {
      toast.error(err?.message || "Não foi possível solicitar o código.");
    } finally {
      setBusy(false);
    }
  }

  async function completeLogin(result: CustomerOtpResult) {
    // Keep the existing route-specific authorization before caching the token.
    await onAuthenticated(result);
    localStorage.setItem("cp_token", result.token);
    localStorage.setItem("walk_client_phone", cleanPhone);
    clearOtpDraft();
    toast.success("Identidade confirmada!");
  }

  async function enterWithPasskey() {
    if (!canLoginWithPasskey || busy || cleanPhone.length !== 11) return;
    setBusy(true);
    setPasskeyBusy(true);
    try {
      const challenge = await beginPasskey.mutateAsync({phone:cleanPhone,remember});
      const assertion = await startAuthentication({optionsJSON:challenge.options});
      if (!assertion.response.userHandle) throw new Error("Missing discoverable credential user handle");
      const result = await finishPasskey.mutateAsync({
        phone:cleanPhone,challengeId:challenge.challengeId,
        response:{
          id:assertion.id,rawId:assertion.rawId,type:"public-key",
          response:{
            clientDataJSON:assertion.response.clientDataJSON,
            authenticatorData:assertion.response.authenticatorData,
            signature:assertion.response.signature,
            userHandle:assertion.response.userHandle,
          },
          clientExtensionResults:{},
        },
      });
      if (!result.token || result.phone !== cleanPhone) {
        throw new Error("Passkey response does not match the selected account");
      }
      await completeLogin(result);
    } catch {
      toast.error("Não foi possível entrar com biometria. Você pode continuar pelo código.");
    } finally {
      setPasskeyBusy(false);
      setBusy(false);
    }
  }

  async function confirmEnrollment(activate: boolean) {
    if (!pendingEnrollment || busy) return;
    const pending = pendingEnrollment;
    setBusy(true);
    try {
      if (activate) {
        try {
          const response = await startPasskeyRegistration({ optionsJSON: pending.options });
          // The server requests no client extensions; send only the bounded
          // registration proof fields needed to verify the WebAuthn ceremony.
          await finishEnrollment.mutateAsync({
            token: pending.result.token, challengeId: pending.challengeId,
            response: {
              id: response.id, rawId: response.rawId, type: "public-key",
              response: {
                clientDataJSON: response.response.clientDataJSON,
                attestationObject: response.response.attestationObject,
              },
              clientExtensionResults: {},
            },
          });
          toast.success("Chave de acesso cadastrada!");
        } catch {
          setEnrollmentFailure(pending.result);
          setPendingEnrollment(null);
          return;
        }
      }
      await completeLogin(pending.result);
      setPendingEnrollment(null);
    } catch (err: any) {
      toast.error(err?.message || "Não foi possível concluir o acesso.");
    } finally { setBusy(false); }
  }

  async function continueAfterEnrollmentFailure() {
    if (!enrollmentFailure || busy) return;
    setBusy(true);
    try {
      await completeLogin(enrollmentFailure);
      setEnrollmentFailure(null);
    } catch (err: any) {
      toast.error(err?.message || "Não foi possível concluir o acesso.");
    } finally { setBusy(false); }
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
      const result = await verifyCode.mutateAsync({ phone: cleanPhone, code: digits, remember, enrollPasskey: enrollPasskey && canEnrollPasskey });
      if (!result.success) {
        toast.error(result.message || "Código inválido ou expirado.");
        return;
      }
      if (!result.token) {
        toast.error("Não foi possível confirmar o acesso.");
        return;
      }
      const loginResult: CustomerOtpResult = {
        token: result.token, phone: cleanPhone,
        profileUpdateRequired: result.profileUpdateRequired,
        profileUpdateFields: result.profileUpdateFields || [],
      };
      if ("enrollment" in result && result.enrollment) {
        setPendingEnrollment({ result: loginResult, ...result.enrollment });
        clearOtpDraft();
        setCode("");
        return;
      }
      if (enrollPasskey) {
        // OTP succeeded, but enrollment did not. Do not silently navigate.
        // Retain the verified result only in component state until the
        // customer explicitly continues without registering a credential.
        setEnrollmentFailure(loginResult);
        clearOtpDraft();
        setCode("");
        return;
      }
      await completeLogin(loginResult);
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

        {!pendingEnrollment && !enrollmentFailure && <label className="mt-5 flex items-start gap-3 rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm">
          <input type="checkbox" checked={remember} disabled={busy} className="mt-1 h-4 w-4 accent-emerald-500"
            onChange={event => {
              const checked = event.target.checked;
              setRemember(checked);
              if (cleanPhone.length === 11) saveOtpDraft(cleanPhone, step, deliveryChannel, showWhatsappLink, checked);
            }} />
          <span>Manter conectado neste aparelho
            <span className="mt-1 block text-xs text-slate-400">
              {remember ? "Prazo definido pela administração." : "Sessão de até 1 hora, mesmo ao reabrir o navegador."}
            </span>
          </span>
        </label>}
        {enrollmentFailure ? (
          <section aria-label="Cadastro biométrico não concluído" className="mt-7 space-y-4 rounded-2xl border-2 border-amber-400 bg-amber-950/40 p-5">
            <h2 role="alert" className="text-lg font-black text-amber-200">BIOMETRIA NÃO CADASTRADA</h2>
            <p className="text-sm text-slate-100">Seu código foi confirmado, mas não foi possível cadastrar a chave neste aparelho.</p>
            <p className="text-sm text-slate-300">Você pode continuar com segurança pelo código. Para tentar cadastrar a biometria novamente, saia da conta e solicite um novo código.</p>
            <button type="button" disabled={busy} onClick={() => void continueAfterEnrollmentFailure()} className="min-h-12 w-full rounded-xl bg-emerald-500 p-3 font-bold text-slate-950 disabled:opacity-50">CONTINUAR SEM BIOMETRIA</button>
          </section>
        ) : pendingEnrollment ? (
          <section aria-label="Cadastrar chave de acesso" className="mt-7 space-y-4 rounded-xl border border-emerald-500/30 bg-slate-900 p-4">
            <p className="text-sm text-emerald-200">Código confirmado. Cadastre a chave protegida pelo seu aparelho. Esta escolha é opcional.</p>
            <button type="button" disabled={busy} onClick={() => void confirmEnrollment(true)} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 p-3 font-bold text-slate-950 disabled:opacity-50"><Fingerprint className="h-5 w-5" /> CADASTRAR BIOMETRIA</button>
            <button type="button" disabled={busy} onClick={() => void confirmEnrollment(false)} className="w-full rounded-xl border border-slate-600 p-3 text-sm font-semibold disabled:opacity-50">Continuar sem cadastrar</button>
            <p className="text-xs text-slate-400">O H2 não recebe seu rosto, digital ou PIN. O acesso por código continua disponível.</p>
          </section>
        ) : step === "phone" ? (
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
              onChange={e => { const next = normalizeOtpPhone(e.target.value); setPhone(next); setCooldowns({email:savedCooldown(next,"email"),whatsapp:savedCooldown(next,"whatsapp")}); saveOtpDraft(next, "phone", deliveryChannel, false, remember); }}
              disabled={busy}
              required
            />
            {canLoginWithPasskey && (
              <section className="space-y-2" aria-label="Acesso com biometria">
                <button type="button" onClick={() => void enterWithPasskey()}
                  disabled={busy || cleanPhone.length !== 11}
                  data-testid="customer-passkey-login"
                  className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 p-4 font-black text-slate-950 transition-colors hover:bg-emerald-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:opacity-50">
                  <Fingerprint className="h-6 w-6 shrink-0" aria-hidden />
                  {passkeyBusy ? "CONFIRMANDO BIOMETRIA..." : "ENTRAR COM BIOMETRIA"}
                </button>
                <p className="text-center text-xs leading-relaxed text-slate-300">Use o Face ID, digital ou PIN do seu aparelho, se já cadastrou uma chave de acesso.</p>
                <div className="flex items-center gap-3 text-xs text-slate-400" aria-hidden><span className="h-px flex-1 bg-slate-700" /> ou <span className="h-px flex-1 bg-slate-700" /></div>
              </section>
            )}
            <div className="space-y-3" aria-label="Recebimento do código">
              <button type="submit" disabled={busy || cleanPhone.length !== 11 || remainingEmail > 0 || remainingWhatsapp > 0}
                className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 p-4 font-black text-slate-950 transition-colors hover:bg-cyan-400 disabled:opacity-50">
                <ShieldCheck className="h-5 w-5" />
                {Math.max(remainingEmail, remainingWhatsapp) > 0
                  ? "AGUARDE " + formatOtpCooldown(Math.max(remainingEmail, remainingWhatsapp))
                  : busy ? "Solicitando..." : "RECEBER CÓDIGO"}
              </button>
              <p className="text-center text-xs leading-relaxed text-slate-300">
                O código será enviado ao e-mail cadastrado.
                {h2AutoDelivery?.available === true
                  ? " O WhatsApp abrirá automaticamente quando o código estiver pronto."
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
                ? "Digite os 6 números do código aqui. Ele também foi enviado ao e-mail cadastrado."
                : deliveryChannel === "whatsapp"
                ? "Envie a mensagem pronta no WhatsApp e volte aqui para digitar os 6 números."
                : "Digite o código recebido no e-mail cadastrado. Confira também a pasta de spam."}</span>
            </div>
            <label htmlFor="h2-otp-code" className="block text-sm font-semibold">Código de 6 números</label>
            <input id="h2-otp-code" type="text" inputMode="numeric" autoComplete="one-time-code"
              pattern="[0-9]{6}" maxLength={6} value={code} autoFocus
              onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              disabled={busy}
              className="w-full rounded-xl border border-white/20 bg-slate-900 p-4 text-center text-2xl tracking-[.4em] font-black outline-none focus:border-cyan-400"
              placeholder="000000" required />
            {showWhatsappLink && (
              <div className="space-y-2 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3" data-testid="h2-otp-whatsapp-direct">
                <a href={whatsappUrl}
                  target={nativeWhatsapp ? undefined : "_blank"}
                  rel={nativeWhatsapp ? undefined : "noopener noreferrer"}
                  data-testid="h2-otp-open-whatsapp"
                  className="flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-emerald-400/40 px-3 py-2 text-center text-xs font-bold text-emerald-100 hover:bg-emerald-500/20">
                  <MessageCircle className="h-4 w-4" /> WhatsApp não abriu? Abrir novamente
                </a>
                <p className="text-center text-xs text-slate-100">
                  Volte ao campo acima para digitar o código recebido.
                </p>
              </div>
            )}
            {canEnrollPasskey && <label className="flex min-h-20 cursor-pointer items-center gap-3 rounded-2xl border-2 border-emerald-400 bg-emerald-950 p-4 text-emerald-50 shadow-md shadow-emerald-500/20 transition-colors hover:bg-emerald-900 focus-within:ring-2 focus-within:ring-emerald-300">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-400 text-emerald-950">
                <Fingerprint className="h-7 w-7" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1 space-y-1">
                <span className="block text-base font-black leading-tight text-emerald-200">ATIVAR BIOMETRIA</span>
                <span className="block text-xs font-medium leading-snug">Face ID, digital ou PIN do aparelho</span>
                <span className="block text-xs leading-snug text-emerald-100">Cadastrar biometria neste aparelho após confirmar o código (opcional)</span>
              </span>
              <input type="checkbox" checked={enrollPasskey} disabled={busy} onChange={event => setEnrollPasskey(event.target.checked)} className="h-6 w-6 shrink-0 cursor-pointer accent-emerald-400" />
            </label>}
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
                  onClick={() => { setStep("phone"); setCode(""); setShowHelp(false); saveOtpDraft(cleanPhone, "phone", deliveryChannel, false, remember); }}>
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
