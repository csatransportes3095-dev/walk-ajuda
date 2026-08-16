import { useState } from "react";
import { ArrowLeft, ShieldCheck, UserCheck, UsersRound } from "lucide-react";
import { trpc } from "@/lib/trpc";

type Screen = "phone" | "referral" | "blocked";

const digits = (value: string) => value.replace(/\D/g, "");

// Ao colar +55/DDDnúmero, remove somente o código internacional.
// Um telefone brasileiro com DDD 55 tem 10 ou 11 dígitos e nunca perde o próprio DDD.
const normalizeBrazilPhone = (value: string) => {
  const clean = digits(value);
  const withoutCountryCode = clean.startsWith("55") && (clean.length === 12 || clean.length === 13)
    ? clean.slice(2)
    : clean;
  return withoutCountryCode.slice(0, 11);
};

const formatPhone = (value: string) => {
  const clean = normalizeBrazilPhone(value);
  if (clean.length <= 2) return clean;
  if (clean.length <= 6) return `(${clean.slice(0, 2)}) ${clean.slice(2)}`;
  if (clean.length <= 10) return `(${clean.slice(0, 2)}) ${clean.slice(2, 6)}-${clean.slice(6)}`;
  return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`;
};

export function HomeAccessManifest({ onGranted }: { onGranted: () => void }) {
  const [screen, setScreen] = useState<Screen>("phone");
  const [phone, setPhone] = useState("");
  const [referralPhone, setReferralPhone] = useState("");
  const [message, setMessage] = useState("");
  const start = trpc.onlineSupport.entryStartByPhone.useMutation();

  const validatePhone = async () => {
    const normalized = digits(phone);
    if (normalized.length < 10 || normalized.length > 11) {
      setMessage("Informe um telefone válido com DDD.");
      return;
    }
    try {
      setMessage("");
      const result = await start.mutateAsync({ phone: normalized });
      if (result.status === "existing") {
        // O telefone já foi validado no manifesto: a tela de senha o reutiliza sem pedir de novo.
        sessionStorage.setItem("walk_home_existing_phone", normalizeBrazilPhone((result as any).phone || normalized));
        onGranted();
        return;
      }
      if (result.status === "blocked") {
        setScreen("blocked");
        setMessage("Este cadastro não possui acesso ao sistema.");
        return;
      }
      setPhone(normalized);
      setScreen("referral");
    } catch {
      setMessage("Não foi possível verificar o telefone. Tente novamente.");
    }
  };

  const validateReferral = async () => {
    const normalizedReferral = digits(referralPhone);
    if (normalizedReferral.length < 10 || normalizedReferral.length > 11) {
      setMessage("Informe o telefone com DDD de quem indicou você.");
      return;
    }
    try {
      setMessage("");
      const result = await start.mutateAsync({ phone: digits(phone), referralPhone: normalizedReferral });
      if (result.status !== "referral_valid") {
        setScreen("blocked");
        setMessage("Sem indicação válida, não é possível acessar o sistema.");
        return;
      }
      sessionStorage.setItem("walk_home_referral_phone", result.referralPhone);
      sessionStorage.setItem("walk_home_new_phone", result.phone);
      onGranted();
    } catch {
      setScreen("blocked");
      setMessage("Sem indicação válida, não é possível acessar o sistema.");
    }
  };

  const retryReferral = () => {
    setScreen("referral");
    setMessage("");
    setReferralPhone("");
  };

  const pending = start.isPending;
  const title = screen === "phone" ? "Antes de continuar" : screen === "referral" ? "Quem indicou você?" : "Acesso não liberado";
  const description = screen === "phone"
    ? "Informe seu telefone com DDD para acessar o sistema."
    : screen === "referral"
      ? "Para um novo acesso, informe o telefone com DDD de quem indicou você."
      : message || "Sem indicação válida, não é possível acessar o sistema.";

  return <div className="min-h-screen bg-[#0a0a1a] flex flex-col items-center justify-center relative overflow-hidden px-6 py-8">
    <div className="absolute inset-0 bg-gradient-to-br from-purple-900/15 via-transparent to-blue-900/15" />
    <div className="relative z-10 w-full max-w-sm mx-auto">
      <div className="flex flex-col items-center text-center mb-6">
        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 shadow-lg ${screen === "blocked" ? "bg-red-500/15 border border-red-400/35" : "bg-violet-500/15 border border-violet-400/35"}`}>
          {screen === "phone" ? <UserCheck className="w-8 h-8 text-violet-300" /> : screen === "referral" ? <UsersRound className="w-8 h-8 text-violet-300" /> : <ShieldCheck className="w-8 h-8 text-red-300" />}
        </div>
        <h1 className="text-2xl font-black text-white">{title}</h1>
        <p className="text-white/60 text-sm mt-2 leading-relaxed max-w-xs">{description}</p>
      </div>

      <div className={`rounded-2xl border p-5 shadow-2xl ${screen === "blocked" ? "bg-red-950/25 border-red-400/35" : "bg-white/[0.045] border-white/10"}`}>
        {screen === "phone" && <>
          <label className="text-white/80 text-sm font-bold">Seu telefone</label>
          <input value={formatPhone(phone)} onChange={event => { setPhone(normalizeBrazilPhone(event.target.value)); setMessage(""); }} inputMode="numeric" placeholder="(00) 00000-0000" className="mt-2 w-full rounded-xl bg-black/25 border border-white/15 px-4 py-3.5 text-white outline-none focus:border-violet-400" />
          {message && <p className="text-red-300 text-xs mt-2">{message}</p>}
          <button onClick={validatePhone} disabled={pending} className="mt-4 w-full rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 py-3.5 text-white font-black disabled:opacity-60">{pending ? "Verificando..." : "Continuar"}</button>
        </>}

        {screen === "referral" && <>
          <button onClick={() => { setScreen("phone"); setMessage(""); }} className="mb-4 text-white/60 text-sm flex items-center gap-1"><ArrowLeft size={15} /> Alterar telefone</button>
          <label className="text-white/80 text-sm font-bold">Telefone de quem indicou</label>
          <input value={formatPhone(referralPhone)} onChange={event => { setReferralPhone(normalizeBrazilPhone(event.target.value)); setMessage(""); }} inputMode="numeric" placeholder="(00) 00000-0000" className="mt-2 w-full rounded-xl bg-black/25 border border-white/15 px-4 py-3.5 text-white outline-none focus:border-violet-400" />
          {message && <p className="text-red-300 text-xs mt-2">{message}</p>}
          <button onClick={validateReferral} disabled={pending} className="mt-4 w-full rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 py-3.5 text-white font-black disabled:opacity-60">{pending ? "Verificando..." : "Continuar"}</button>
        </>}

        {screen === "blocked" && <>
          <p className="text-red-200 text-sm text-center leading-relaxed">{description}</p>
          <button onClick={retryReferral} className="mt-4 w-full rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 py-3.5 text-white font-black">Informar outra indicação</button>
        </>}
      </div>
      <p className="text-white/30 text-xs text-center mt-5">A indicação precisa pertencer a um cliente cadastrado e ativo.</p>
    </div>
  </div>;
}
