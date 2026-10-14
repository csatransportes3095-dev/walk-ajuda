import { useRef, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import GeradorChassiPublico from "./GeradorChassiPublico";
import type { ChassisGenerationInput } from "@shared/chassisService";
import { prepareOrderUploadFile } from "@/lib/reliableOrderUpload";

const money = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (value: Date | string) => new Date(value).toLocaleString("pt-BR");
const field = "w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-white outline-none focus:border-cyan-400";
const button = "rounded-xl bg-cyan-600 px-4 py-3 text-sm font-bold text-white hover:bg-cyan-500 disabled:opacity-40";
const panel = "rounded-2xl border border-purple-500/25 bg-zinc-900/80 p-4 sm:p-5";

export default function ChassisCustomerPage() {
  const utils = trpc.useUtils();
  const me = trpc.chassisService.me.useQuery(undefined, { retry: false, refetchInterval: 10_000, refetchOnWindowFocus: true });
  const catalog = trpc.chassisService.catalog.useQuery(undefined, { refetchOnWindowFocus: true });
  const [view, setView] = useState<"generate" | "packages" | "history">("generate");
  const [registering, setRegistering] = useState(false);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [purchaseId, setPurchaseId] = useState<string | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofUploading, setProofUploading] = useState(false);
  const generating = useRef(false);
  const history = trpc.chassisService.history.useQuery(undefined, { enabled: Boolean(me.data) && view !== "generate", retry: false, refetchInterval: view === "packages" ? 10_000 : false });
  const login = trpc.chassisService.login.useMutation();
  const register = trpc.chassisService.register.useMutation();
  const logout = trpc.chassisService.logout.useMutation();
  const generation = trpc.chassisService.generate.useMutation();
  const buy = trpc.chassisService.buy.useMutation();
  const cancel = trpc.chassisService.cancelPurchase.useMutation();

  async function authenticate(event: React.FormEvent) {
    event.preventDefault();
    try {
      if (registering) await register.mutateAsync({ phone, password });
      await login.mutateAsync({ phone, password });
      setPassword("");
      await utils.chassisService.history.reset();
      await me.refetch();
      toast.success(registering ? "Seu acesso foi criado." : "Bem-vindo ao serviço.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível entrar."); }
  }
  async function signOut() {
    try {
      await logout.mutateAsync();
      utils.chassisService.me.setData(undefined, null);
      await utils.chassisService.history.reset();
      setPurchaseId(null); setSelected(null); setView("generate");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível sair."); }
  }
  async function generate(input: Omit<ChassisGenerationInput, "requestId">) {
    if (!me.data || generating.current) throw new Error("Aguarde a geração atual.");
    generating.current = true;
    const key = `h2-chassis-pending:${me.data.id}`;
    const fingerprint = JSON.stringify(input);
    let attempt: { requestId: string; fingerprint: string } | null = null;
    try { attempt = JSON.parse(sessionStorage.getItem(key) || "null"); } catch { /* armazenamento indisponível */ }
    const requestId = attempt?.fingerprint === fingerprint ? attempt.requestId : crypto.randomUUID();
    try { sessionStorage.setItem(key, JSON.stringify({ requestId, fingerprint })); } catch { /* proteção no servidor continua válida */ }
    try {
      const result = await generation.mutateAsync({ ...input, requestId });
      try { sessionStorage.removeItem(key); } catch { /* sem armazenamento */ }
      utils.chassisService.me.setData(undefined, current => current ? { ...current, balance: result.balance, totalUsed: current.totalUsed + (result.replayed ? 0 : result.quantity) } : current);
      void me.refetch();
      void utils.chassisService.history.invalidate();
      return result.vins;
    } finally { generating.current = false; }
  }
  async function requestPackage() {
    if (selected === null || buy.isPending) return;
    try {
      const purchase = await buy.mutateAsync({ packageId: selected, requestId: crypto.randomUUID() });
      setPurchaseId(purchase.id); setSelected(null); setProofFile(null);
      await history.refetch();
      toast.success("Solicitação criada. Envie o comprovante para o ADM conferir.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível solicitar o pacote."); }
  }

  async function uploadPaymentProof() {
    if (!purchase || !proofFile || proofUploading) return;
    setProofUploading(true);
    try {
      const prepared = await prepareOrderUploadFile(proofFile);
      if (prepared.size > 15 * 1024 * 1024) throw new Error("Arquivo muito grande. Máximo 15MB.");
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Não foi possível ler o comprovante."));
        reader.readAsDataURL(prepared);
      });
      const response = await fetch("/api/upload/chassis-payment-proof", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purchaseId: purchase.id, data, mimeType: prepared.type || proofFile.type || "image/jpeg", filename: prepared.name || proofFile.name }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || "Não foi possível enviar o comprovante.");
      setProofFile(null);
      await history.refetch();
      toast.success("Comprovante enviado. Aguarde a conferência do ADM.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar o comprovante.");
    } finally { setProofUploading(false); }
  }

  const user = me.data;
  const config = catalog.data?.config;
  const purchase = history.data?.purchases.find(item => item.id === purchaseId) || history.data?.purchases.find(item => item.status === "pending");
  const supportPhone = config?.supportPhone ? `55${config.supportPhone}` : "";
  const whatsapp = supportPhone ? `https://wa.me/${supportPhone}?text=${encodeURIComponent(user ? `Olá! Meu telefone no serviço é ${user.phone}.${purchase ? ` Solicitei ${purchase.credits} créditos por ${money(purchase.priceCents)}. Pedido ${purchase.id}.` : " Preciso de ajuda com meus créditos."}` : "Olá! Preciso de ajuda para acessar o serviço de chassis para testes.")}` : "";

  if (me.isLoading || catalog.isLoading) return <div className="flex min-h-screen items-center justify-center bg-[#0d0d1a] text-white">Carregando serviço...</div>;
  if (me.error || catalog.error) return <div className="flex min-h-screen items-center justify-center bg-[#0d0d1a] px-4 text-white"><div className={panel}><p>O serviço está temporariamente indisponível.</p><button className={`${button} mt-4`} onClick={() => { void me.refetch(); void catalog.refetch(); }}>Tentar novamente</button></div></div>;

  return <div className="min-h-screen bg-[#0d0d1a] text-white" style={{ background: "radial-gradient(ellipse at top, #1a0a2e 0%, #0d0d1a 40%, #050508 100%)" }}>
    <header className="border-b border-purple-900/40 bg-black/50"><div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4"><img src="/h2-brand-180.png" alt="H2 Colombiano" className="h-12 w-12 rounded-xl" /><div><h1 className="font-bold">H2 Colombiano · Chassis</h1><p className="text-xs text-zinc-400">Dados sintéticos para testes</p></div>{user && <button className="ml-auto text-sm text-zinc-300" disabled={logout.isPending} onClick={() => void signOut()}>Sair</button>}</div></header>
    {!user ? <main className="mx-auto max-w-md space-y-5 px-4 py-8">
      <section className={panel}><h2 className="text-xl font-bold">{registering ? "Crie seu acesso" : "Entre no serviço"}</h2><p className="mt-2 text-sm text-zinc-400">Use seu telefone com DDD e sua senha deste serviço.</p>
        <form className="mt-5 space-y-4" onSubmit={event => void authenticate(event)}>
          <label className="block text-sm">Telefone<input className={`${field} mt-2`} type="tel" inputMode="tel" autoComplete="username" value={phone} onChange={event => setPhone(event.target.value)} required /></label>
          <label className="block text-sm">Senha<input className={`${field} mt-2`} type="password" autoComplete={registering ? "new-password" : "current-password"} minLength={registering ? 8 : 1} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} required /></label>
          <button type="submit" className={`${button} w-full`} disabled={login.isPending || register.isPending}>{login.isPending || register.isPending ? "Aguarde..." : registering ? "Criar acesso" : "Entrar"}</button>
        </form>
        {(config?.registrationEnabled || registering) && <button className="mt-4 w-full text-sm text-cyan-300" onClick={() => { setRegistering(!registering); setPassword(""); }}>{registering ? "Já tenho acesso" : "Criar acesso com telefone e senha"}</button>}
        {registering && <p className="mt-4 text-xs text-zinc-400">Seu acesso começa com {config?.trialCredits || 0} créditos de teste. O benefício é concedido uma única vez por telefone.</p>}
        {whatsapp && <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="mt-4 block text-center text-sm text-green-300">Preciso de ajuda com o acesso</a>}
      </section>
      <p className="text-center text-xs leading-5 text-zinc-500">Os números gerados são sintéticos e destinados a testes. Não representam chassis oficiais de veículos.</p>
    </main> : <>
      <div className="mx-auto max-w-3xl space-y-4 px-3 pt-5 sm:px-4">
        <section className={panel}><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm text-zinc-400">{user.phone} · {user.accountType === "test" ? "Acesso de teste" : "Acesso pago"}</p><p className="mt-1 text-2xl font-bold text-cyan-300">{user.balance} créditos disponíveis</p></div><p className="text-sm text-zinc-400">{user.totalUsed} utilizados</p></div>
          {user.balance === 0 && <div role="status" className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">Seus créditos acabaram. Escolha um pacote para continuar.<button onClick={() => setView("packages")} className="mt-2 block font-bold text-cyan-300">Ver pacotes</button></div>}
        </section>
        <nav className="grid grid-cols-3 gap-2" aria-label="Serviço de chassis">{([["generate", "Gerador"], ["packages", "Comprar créditos"], ["history", "Histórico"]] as const).map(([key, label]) => <button key={key} onClick={() => setView(key)} aria-pressed={view === key} className={`rounded-xl px-2 py-3 text-xs font-bold sm:text-sm ${view === key ? "bg-purple-700" : "bg-zinc-900 text-zinc-400"}`}>{label}</button>)}</nav>
      </div>
      {view === "generate" ? <GeradorChassiPublico embedded customer={{ balance: user.balance, onGenerate: generate }} /> : <main className="mx-auto max-w-3xl space-y-5 px-3 py-5 sm:px-4">
        {view === "packages" ? <>
          <section className={panel}><h2 className="text-lg font-bold">Escolha seu pacote</h2><p className="mt-2 text-sm text-zinc-400">Cada número gerado com sucesso utiliza 1 crédito. O pagamento é confirmado pelo ADM.</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">{catalog.data?.packages.map(item => <button key={item.id} onClick={() => setSelected(item.id)} className={`rounded-xl border p-4 text-left ${selected === item.id ? "border-cyan-300 bg-cyan-400/10" : "border-white/10 bg-black/20"}`}><p className="font-bold">{item.title}</p><p className="mt-2 text-2xl font-bold text-cyan-300">{item.credits} créditos</p><p className="mt-2 font-bold">{money(item.priceCents)}</p><p className="mt-2 text-xs text-zinc-400">Selecionar pacote</p></button>)}</div>
            {!catalog.data?.packages.length && <p className="mt-5 text-sm text-zinc-400">Os pacotes ainda não estão disponíveis. Entre em contato com o ADM.</p>}
            {selected !== null && <div className="mt-5 rounded-xl border border-cyan-400/30 p-4"><p className="text-sm">{catalog.data?.packages.find(item => item.id === selected)?.title} · {money(catalog.data?.packages.find(item => item.id === selected)?.priceCents || 0)}</p><button className={`${button} mt-3`} disabled={buy.isPending} onClick={() => void requestPackage()}>{buy.isPending ? "Aguarde..." : "Solicitar este pacote"}</button></div>}
          </section>
          {purchase && <section className={panel}><h3 className="font-bold">Compra {purchase.status === "approved" ? "confirmada" : purchase.status === "cancelled" ? "cancelada" : purchase.proofStatus === "submitted" ? "comprovante em análise" : purchase.proofStatus === "rejected" ? "comprovante recusado" : "aguardando pagamento"}</h3><p className="mt-2">{purchase.credits} créditos · {money(purchase.priceCents)}</p><p className="mt-2 break-all font-mono text-xs text-zinc-500">Pedido: {purchase.id}</p>{purchase.status === "pending" && <><p className="mt-4 whitespace-pre-line text-sm leading-6 text-zinc-300">{config?.paymentInstructions || "Faça o pagamento e envie o comprovante abaixo."}</p>{purchase.proofStatus === "submitted" ? <div className="mt-4 rounded-xl border border-green-400/30 bg-green-400/10 p-3 text-sm text-green-200">✅ Comprovante enviado. Aguardando conferência do ADM.{purchase.proofUrl && <a className="mt-2 block text-cyan-300 underline" href={purchase.proofUrl} target="_blank" rel="noopener noreferrer">Ver comprovante enviado</a>}</div> : <div className="mt-4 rounded-xl border border-cyan-400/25 bg-black/20 p-4"><p className="text-sm font-bold">{purchase.proofStatus === "rejected" ? "O ADM recusou o comprovante. Envie outro arquivo." : "Enviar comprovante"}</p><input className="mt-3 block w-full text-sm text-zinc-300" type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf" onChange={event => setProofFile(event.target.files?.[0] || null)} /><button className={`${button} mt-3`} disabled={!proofFile || proofUploading} onClick={() => void uploadPaymentProof()}>{proofUploading ? "Enviando..." : "Enviar comprovante"}</button></div>}{whatsapp && <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={`${button} mt-4 inline-block bg-green-700`}>Falar com o ADM</a>}<button className="mt-4 block text-xs text-zinc-400" disabled={cancel.isPending || purchase.proofStatus === "submitted"} onClick={() => { void cancel.mutateAsync({ id: purchase.id }).then(() => history.refetch()).catch(error => toast.error(error.message)); }}>Cancelar solicitação</button></>}</section>}
        </> : <>
          <section className={panel}><h2 className="text-lg font-bold">Movimentações de créditos</h2>{history.isLoading ? <p className="mt-4">Carregando...</p> : history.error ? <p className="mt-4 text-amber-300">Entre novamente para consultar seu histórico.</p> : history.data?.ledger.map(item => <div key={item.id} className="flex justify-between gap-3 border-b border-white/10 py-3 text-sm"><div><p>{item.kind === "generation" ? "Geração" : item.kind === "purchase" ? "Compra de pacote" : item.kind === "trial" ? "Créditos de teste" : "Ajuste de créditos"}</p><p className="mt-1 text-xs text-zinc-500">{date(item.createdAt)}{item.note ? ` · ${item.note}` : ""}</p></div><div className="text-right"><p className={item.delta < 0 ? "text-amber-300" : "text-green-300"}>{item.delta > 0 ? "+" : ""}{item.delta}</p><p className="text-xs text-zinc-500">Saldo: {item.balanceAfter}</p></div></div>)}</section>
          <section className={panel}><h2 className="text-lg font-bold">Números já gerados</h2><p className="mt-2 text-xs text-zinc-400">Consultar ou copiar novamente não utiliza créditos.</p>{history.data?.generations.map(item => <div key={item.id} className="mt-4 rounded-xl bg-black/30 p-3"><p className="text-xs text-zinc-400">{item.marca} · {item.modelo} · {date(item.createdAt)}</p><pre className="mt-3 overflow-x-auto font-mono text-sm text-cyan-300">{item.vins.join("\n")}</pre><button className="mt-3 text-xs text-purple-300" onClick={() => { void navigator.clipboard.writeText(item.vins.join("\n")).then(() => toast.success("Números copiados.")).catch(() => toast.error("Não foi possível copiar.")); }}>Copiar números</button></div>)}{!history.isLoading && !history.data?.generations.length && <p className="mt-4 text-sm text-zinc-500">Nenhuma geração registrada.</p>}</section>
        </>}
      </main>}
    </>}
  </div>;
}
