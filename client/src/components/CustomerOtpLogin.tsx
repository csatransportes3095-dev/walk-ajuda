import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { CheckCircle2, Mail, Phone, ShieldCheck } from "lucide-react";

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
  const [phone, setPhone] = useState(() => normalizeOtpPhone(initialPhone));
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const requestCode = trpc.customerPassword.requestCustomerCode.useMutation();
  const verifyCode = trpc.customerPassword.verifyCustomerCode.useMutation();
  const cleanPhone = normalizeOtpPhone(phone);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (cleanPhone.length !== 11) {
      toast.error("Informe um telefone com DDD e 11 números.");
      return;
    }
    setBusy(true);
    try {
      const result = await requestCode.mutateAsync({ phone: cleanPhone });
      setCode("");
      setStep("code");
      toast.success(result.message || "Confira o e-mail cadastrado.");
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
      toast.error("Informe os 6 números enviados ao seu e-mail.");
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
      toast.success("Identidade confirmada!");
    } catch (err: any) {
      toast.error(err?.message || "Falha ao verificar o código.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#050b1b] text-white flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md rounded-3xl border border-cyan-400/30 bg-slate-950 p-6 sm:p-8 shadow-[0_0_35px_rgba(6,182,212,0.12)]">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-400/50 bg-cyan-400/10">
          <ShieldCheck className="h-9 w-9 text-cyan-300" aria-hidden />
        </div>
        <h1 className="text-center text-2xl font-black">{title}</h1>
        <p className="mt-2 text-center text-sm text-slate-300">
          Acesso seguro com telefone e código do e-mail cadastrado. Nenhuma senha é necessária.
        </p>

        {step === "phone" ? (
          <form onSubmit={send} className="mt-7 space-y-4">
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
              onChange={e => setPhone(normalizeOtpPhone(e.target.value))}
              disabled={busy}
              maxLength={11}
              required
            />
            <button type="submit" disabled={busy || cleanPhone.length !== 11}
              className="w-full rounded-xl bg-cyan-500 p-4 font-black text-slate-950 disabled:opacity-50">
              {busy ? "Solicitando..." : "RECEBER CÓDIGO NO E-MAIL"}
            </button>
            {onRegister && (
              <button type="button" className="w-full py-2 text-sm text-cyan-300" onClick={onRegister}>
                Ainda não tenho cadastro
              </button>
            )}
          </form>
        ) : (
          <form onSubmit={confirm} className="mt-7 space-y-4">
            <div className="flex items-center gap-2 text-sm text-cyan-100">
              <Mail className="h-5 w-5" />
              <span>Código enviado ao e-mail cadastrado para o telefone informado.</span>
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
            <button type="button" className="w-full py-2 text-sm text-cyan-300" disabled={busy}
              onClick={() => { setStep("phone"); setCode(""); }}>
              Alterar telefone / solicitar outro código
            </button>
          </form>
        )}
        <a
          href="https://h2colombiano.com/"
          className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-cyan-400/40 bg-cyan-400/10 px-4 py-3 text-center text-sm font-bold text-cyan-200 transition-colors hover:bg-cyan-400/20"
        >
          ← VOLTAR AO SITE
        </a>
        <p className="mt-4 text-center text-xs text-slate-400">
          O código expira em 10 minutos. Nunca compartilhe o código recebido.
        </p>
      </div>
    </main>
  );
}
