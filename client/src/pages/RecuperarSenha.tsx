import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, CheckCircle2, KeyRound } from "lucide-react";

export default function RecuperarSenha() {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [step, setStep] = useState<"request" | "finish" | "done">("request");
  const [feedback, setFeedback] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const request = trpc.customerPassword.requestPasswordRecovery.useMutation();
  const finish = trpc.customerPassword.finishPasswordRecovery.useMutation();

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown(value => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const start = async () => {
    if (!/^\d{10,11}$/.test(phone.replace(/\D/g, ""))) return setFeedback("Informe o telefone com DDD.");
    try {
      const result = await request.mutateAsync({ phone });
      setFeedback(result.message);
      setCode("");
      setCooldown(60);
      setStep("finish");
    } catch (error: any) {
      setFeedback(error?.message || "Não foi possível solicitar o código. Tente novamente.");
    }
  };

  const change = async () => {
    if (password.length < 8 || password.length > 72 || password !== confirm) {
      return setFeedback("A senha precisa ter de 8 a 72 caracteres e coincidir com a confirmação.");
    }
    try {
      const result = await finish.mutateAsync({ phone, code, newPassword: password });
      if (!result.success) { setFeedback(result.message); return; }
      setPassword("");
      setConfirm("");
      setFeedback("Senha alterada. Entre novamente usando a nova senha.");
      setStep("done");
    } catch (error: any) {
      setFeedback(error?.message || "Não foi possível alterar a senha.");
    }
  };

  return <main className="min-h-screen bg-[#080d20] flex items-center justify-center px-4 py-8 text-white">
    <section className="w-full max-w-md space-y-5 rounded-3xl border border-sky-400/25 bg-[#101a30] p-5 shadow-[0_0_50px_rgba(56,189,248,0.12)] sm:p-7">
      <div className="flex items-center gap-3"><div className="rounded-2xl border border-sky-400/30 bg-sky-400/15 p-3"><KeyRound className="h-7 w-7 text-sky-300" /></div><div><p className="text-xs font-black uppercase tracking-widest text-sky-300">H2 COLOMBIANO</p><h1 className="text-2xl font-black tracking-tight">Recuperar senha</h1></div></div>
      <p className="text-sm leading-relaxed text-slate-300">Receba um código no seu e-mail cadastrado para definir uma nova senha.</p>
      {step !== "done" && <div className="space-y-3">
        <label className="block text-sm" htmlFor="recovery-phone">Telefone cadastrado</label>
        <input id="recovery-phone" className="w-full min-h-12 rounded-xl p-3 bg-black/25 border border-white/20 focus:border-sky-400 focus:outline-none" value={phone} disabled={step === "finish"} onChange={event => setPhone(event.target.value)} inputMode="tel" placeholder="Telefone com DDD" />
      </div>}
      {step === "request" && <button className="w-full min-h-12 rounded-xl bg-sky-500 p-3 font-black text-slate-950 transition-colors hover:bg-sky-400 disabled:opacity-50" disabled={request.isPending} onClick={start}>{request.isPending ? "Solicitando..." : "Enviar código ao e-mail cadastrado"}</button>}
      {step === "finish" && <>
        <label className="block text-sm" htmlFor="recovery-code">Código recebido no e-mail</label>
        <input id="recovery-code" className="w-full rounded-lg p-3 bg-black/30 border border-white/20" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="6 dígitos" />
        <label className="block text-sm" htmlFor="recovery-password">Nova senha</label>
        <input id="recovery-password" type="password" autoComplete="new-password" maxLength={72} className="w-full rounded-lg p-3 bg-black/30 border border-white/20" value={password} onChange={event => setPassword(event.target.value)} placeholder="Mínimo 8 caracteres" />
        <input type="password" autoComplete="new-password" aria-label="Confirme a nova senha" maxLength={72} className="w-full rounded-lg p-3 bg-black/30 border border-white/20" value={confirm} onChange={event => setConfirm(event.target.value)} placeholder="Confirme a nova senha" />
        <button className="w-full rounded-lg bg-blue-700 p-3 font-semibold" disabled={finish.isPending || request.isPending || code.length !== 6} onClick={change}>{finish.isPending ? "Validando..." : "Confirmar e alterar senha"}</button>
        <button className="w-full rounded-lg border border-blue-400/40 p-3 text-sm disabled:opacity-50" disabled={cooldown > 0 || request.isPending || finish.isPending} onClick={start}>{request.isPending ? "Reenviando..." : cooldown > 0 ? `Reenviar código em ${cooldown}s` : "Reenviar código"}</button>
        <button className="w-full text-sm underline text-slate-300" disabled={request.isPending || finish.isPending} onClick={() => { setStep("request"); setCode(""); setFeedback(""); }}>Voltar e conferir o telefone</button>
        <p className="text-xs leading-relaxed text-slate-400">Não recebeu? Verifique também a pasta de spam. Você pode solicitar outro código após 60 segundos.</p>
      </>}
      {feedback && <p role="status" className="rounded-xl border border-sky-400/20 bg-sky-400/10 p-3 text-sm leading-relaxed text-sky-100">{feedback}</p>}
      {step === "done" && <div className="flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-emerald-200"><CheckCircle2 className="h-5 w-5 shrink-0" /><span className="text-sm font-semibold">Sua nova senha está pronta para uso.</span></div>}
      <a href="/login" className="flex min-h-11 items-center justify-center gap-2 text-center text-sm font-semibold text-sky-300 underline-offset-4 hover:underline"><ArrowLeft className="h-4 w-4" /> Voltar ao login</a>
    </section>
  </main>;
}
