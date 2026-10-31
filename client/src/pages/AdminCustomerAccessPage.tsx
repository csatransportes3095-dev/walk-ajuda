import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ShieldCheck, Mail, Phone, Check, X } from "lucide-react";

/**
 * Replaces the customer password ADM only when OTP-only mode is enabled.
 * All permissions continue to be enforced by the existing adminProcedure
 * and the customerAccessRequests table on the backend.
 */
export function AdminCustomerAccessPage() {
  const [working,setWorking]=useState<number|null>(null);
  const pending=trpc.customerPassword.adminListPendingAccess.useQuery(undefined,{refetchInterval:30000});
  const decide=trpc.customerPassword.adminDecideAccess.useMutation();
  async function update(requestId:number,approved:boolean) {
    setWorking(requestId);
    try {
      await decide.mutateAsync({requestId,approved,adminName:"Administrador"});
      await pending.refetch();
      toast.success(approved?"Acesso à rota autorizado.":"Solicitação negada.");
    } catch(error:any) {
      toast.error(error?.message||"Não foi possível atualizar a autorização.");
    } finally {setWorking(null);}
  }
  // The ADM API returns row data from SQL (untyped). Type the UI rows
  // explicitly to prevent implicit-any regressions and unintended fields.
  type AccessRequestRow = { id: number; name: string; phone: string; route: string };
  const items: AccessRequestRow[] = pending.data || [];
  return <main className="mx-auto max-w-5xl px-4 py-8 text-white">
    <div className="rounded-3xl border border-cyan-400/30 bg-slate-950 p-6 shadow-2xl">
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-9 w-9 text-cyan-300"/>
        <div>
          <h1 className="text-2xl font-bold">Acesso de Clientes · H2 Colombiano</h1>
          <p className="text-sm text-slate-300">Autenticação única por telefone e código enviado ao e-mail cadastrado.</p>
        </div>
      </div>
      <div className="mt-5 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-4 text-sm">
        <p className="font-bold text-emerald-300">Sistema sem senha de cliente</p>
        <p className="mt-1">O cliente informa o telefone e confirma o código de e-mail.
          Não existem liberação manual de senha, senha automática, reset ou vencimento de senha.</p>
        <p className="mt-2 flex items-center gap-2"><Mail className="h-4 w-4"/> Código válido por 10 minutos e uso único.</p>
        <p className="mt-1 flex items-center gap-2"><Phone className="h-4 w-4"/> Acesso de sessão por até 24 horas.</p>
      </div>
      <div className="mt-7 flex items-center justify-between gap-4">
        <h2 className="text-lg font-bold">Autorizações de rota pendentes</h2>
        <span className="rounded-lg bg-slate-800 px-3 py-1 text-sm">{items.length} pendentes</span>
      </div>
      {pending.isLoading && <p className="mt-4 text-slate-300">Consultando solicitações...</p>}
      {pending.isError && <p className="mt-4 text-amber-300">Falha ao carregar solicitações. Tente novamente.</p>}
      {!pending.isLoading && !pending.isError && items.length===0 && <p className="mt-4 rounded-xl bg-slate-900 p-5 text-slate-300">Nenhuma autorização pendente.</p>}
      <div className="mt-4 space-y-3">
        {items.map(item => <div key={item.id} className="rounded-xl border border-slate-700 bg-slate-900 p-4">
          <div className="flex flex-wrap justify-between gap-4">
            <div>
              <p className="font-bold">{item.name}</p>
              <p className="text-sm text-slate-300">Telefone: {item.phone}</p>
              <p className="mt-1 text-sm text-cyan-300">Permissão solicitada: {item.route}</p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" disabled={working!==null}
                className="flex items-center gap-1 rounded-lg bg-emerald-600 px-4 py-3 font-bold disabled:opacity-50"
                onClick={()=>update(item.id,true)}><Check className="h-4 w-4"/> Liberar</button>
              <button type="button" disabled={working!==null}
                className="flex items-center gap-1 rounded-lg bg-rose-700 px-4 py-3 font-bold disabled:opacity-50"
                onClick={()=>update(item.id,false)}><X className="h-4 w-4"/> Negar</button>
            </div>
          </div>
        </div>)}
      </div>
      <p className="mt-7 text-xs text-slate-400">
        As permissões individuais e os bloqueios administrativos continuam ativos.
        Esta página não altera senhas de administrador ou segredos de serviços.
      </p>
    </div>
  </main>;
}
