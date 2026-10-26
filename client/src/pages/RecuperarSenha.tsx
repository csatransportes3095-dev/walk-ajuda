import { useState } from "react";
import { trpc } from "@/lib/trpc";

export default function RecuperarSenha() {
  const [phone,setPhone] = useState("");
  const [code,setCode] = useState("");
  const [password,setPassword] = useState("");
  const [confirm,setConfirm] = useState("");
  const [step,setStep] = useState<"request"|"finish"|"done">("request");
  const [feedback,setFeedback] = useState("");
  const request = trpc.customerPassword.requestPasswordRecovery.useMutation();
  const finish = trpc.customerPassword.finishPasswordRecovery.useMutation();
  const start = async () => {
    if (phone.replace(/\D/g,"").length < 10) return setFeedback("Informe o telefone com DDD.");
    try {
      const result=await request.mutateAsync({phone});
      setFeedback(result.message);
      setStep("finish");
    } catch (e:any) {setFeedback(e?.message || "Nao foi possivel solicitar o codigo.");}
  };
  const change = async () => {
    if (password.length<8 || password!==confirm) return setFeedback("A senha precisa ter ao menos 8 caracteres e coincidir com a confirmacao.");
    try {
      const result = await finish.mutateAsync({phone,code,newPassword:password});
      if (!result.success) { setFeedback(result.message); return; }
      setFeedback("Senha alterada. Entre novamente usando a nova senha.");
      setStep("done");
    } catch (e:any) {setFeedback(e?.message || "Nao foi possivel alterar a senha.");}
  };
  return <main className="min-h-screen bg-[#080d20] flex items-center justify-center p-4 text-white">
    <section className="w-full max-w-md rounded-2xl border border-white/15 bg-white/5 p-6 space-y-4">
      <h1 className="text-xl font-bold">H2 COLOMBIANO — Recuperar senha</h1>
      <p className="text-sm text-slate-300">Disponivel somente no modo automatico, para cadastro completo e com acesso vigente. No modo manual, procure o atendimento.</p>
      {step!=="done" && <>
        <label className="block text-sm">Telefone cadastrado</label>
        <input className="w-full rounded-lg p-3 bg-black/30 border border-white/20" value={phone} disabled={step==="finish"} onChange={e=>setPhone(e.target.value)} inputMode="tel" placeholder="Telefone com DDD" />
      </>}
      {step==="request" && <button className="w-full rounded-lg bg-blue-700 p-3 font-semibold" disabled={request.isPending} onClick={start}>{request.isPending?"Solicitando...":"Enviar codigo ao e-mail cadastrado"}</button>}
      {step==="finish" && <>
        <label className="block text-sm">Codigo recebido no e-mail</label>
        <input className="w-full rounded-lg p-3 bg-black/30 border border-white/20" value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,"").slice(0,6))} inputMode="numeric" placeholder="6 digitos" />
        <label className="block text-sm">Nova senha</label>
        <input type="password" className="w-full rounded-lg p-3 bg-black/30 border border-white/20" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Minimo 8 caracteres"/>
        <input type="password" className="w-full rounded-lg p-3 bg-black/30 border border-white/20" value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="Confirme a nova senha" />
        <button className="w-full rounded-lg bg-blue-700 p-3 font-semibold" disabled={finish.isPending||code.length!==6} onClick={change}>{finish.isPending?"Validando...":"Confirmar e alterar senha"}</button>
      </>}
      {feedback && <p role="status" className="text-sm text-amber-200">{feedback}</p>}
      <a href="/login" className="block text-center underline text-blue-300">Voltar ao login</a>
    </section>
  </main>;
}
