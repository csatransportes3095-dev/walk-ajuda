import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";

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

  return <main className="min-h-screen bg-[#080d20] flex items-center justify-center p-4 text-white">
    <section className="w-full max-w-md rounded-2xl border border-white/15 bg-white/5 p-6 space-y-4">
      <h1 className="text-xl font-bold">H2 COLOMBIANO — Recuperar senha</h1>
      <p className="text-sm text-slate-300">Disponível somente no modo automático, para cadastro completo e com acesso vigente. No modo manual, procure o atendimento.</p>
      {step !== "done" && <>
        <label className="block text-sm" htmlFor="recovery-phone">Telefone cadastrado</label>
        <input id="recovery-phone" className="w-full rounded-lg p-3 bg-black/30 border border-white/20" value={phone} disabled={step === "finish"} onChange={event => setPhone(event.target.value)} inputMode="tel" placeholder="Telefone com DDD" />
      </>}
      {step === "request" && <button className="w-full rounded-lg bg-blue-700 p-3 font-semibold" disabled={request.isPending} onClick={start}>{request.isPending ? "Solicitando..." : "Enviar código ao e-mail cadastrado"}</button>}
      {step === "finish" && <>
        <label className="block text-sm" htmlFor="recovery-code">Código recebido no e-mail</label>
        <input id="recovery-code" className="w-full rounded-lg p-3 bg-black/30 border border-white/20" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="6 dígitos" />
        <label className="block text-sm" htmlFor="recovery-password">Nova senha</label>
        <input id="recovery-password" type="password" autoComplete="new-password" maxLength={72} className="w-full rounded-lg p-3 bg-black/30 border border-white/20" value={password} onChange={event => setPassword(event.target.value)} placeholder="Mínimo 8 caracteres" />
        <input type="password" autoComplete="new-password" aria-label="Confirme a nova senha" maxLength={72} className="w-full rounded-lg p-3 bg-black/30 border border-white/20" value={confirm} onChange={event => setConfirm(event.target.value)} placeholder="Confirme a nova senha" />
        <button className="w-full rounded-lg bg-blue-700 p-3 font-semibold" disabled={finish.isPending || request.isPending || code.length !== 6} onClick={change}>{finish.isPending ? "Validando..." : "Confirmar e alterar senha"}</button>
        <button className="w-full rounded-lg border border-blue-400/40 p-3 text-sm disabled:opacity-50" disabled={cooldown > 0 || request.isPending || finish.isPending} onClick={start}>{request.isPending ? "Reenviando..." : cooldown > 0 ? `Reenviar código em ${cooldown}s` : "Reenviar código"}</button>
        <button className="w-full text-sm underline text-slate-300" disabled={request.isPending || finish.isPending} onClick={() => { setStep("request"); setCode(""); setFeedback(""); }}>Voltar e conferir o telefone</button>
        <p className="text-xs text-slate-400">Se não recebeu, confira o spam e tente reenviar após 60 segundos. Por segurança, esta página não confirma se o cadastro é elegível.</p>
      </>}
      {feedback && <p role="status" className="text-sm text-amber-200">{feedback}</p>}
      <a href="/login" className="block text-center underline text-blue-300">Voltar ao login</a>
    </section>
  </main>;
}
