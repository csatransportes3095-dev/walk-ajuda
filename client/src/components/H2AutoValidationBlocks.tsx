import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

type Props = { deviceId: string; deviceLabel: string };
export default function H2AutoValidationBlocks({ deviceId, deviceLabel }: Props) {
  const [busy, setBusy] = useState(false);
  const utils = trpc.useUtils();
  const list = trpc.h2AutoAdmin.validationBlocks.useQuery({ id: deviceId }, { refetchInterval: 15000 });
  const release = trpc.h2AutoAdmin.releaseValidationBlock.useMutation();
  const releaseAll = trpc.h2AutoAdmin.releaseAllValidationBlocks.useMutation();
  const refresh = async () => {
    await utils.h2AutoAdmin.validationBlocks.invalidate({ id: deviceId });
  };
  const single = async (sessionId: string, restart: boolean) => {
    if (busy) return;
    if (!window.confirm(restart ? "Reiniciar o atendimento desta conversa?" : "Liberar esta conversa e repetir a pergunta do telefone?")) return;
    setBusy(true);
    try {
      const result = await release.mutateAsync({ id: deviceId, sessionId, restart });
      if (!result.success) throw new Error("Bloqueio não encontrado ou já liberado.");
      toast.success(restart ? "Atendimento reiniciado." : "Cliente liberado.");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível liberar a conversa.");
    } finally { setBusy(false); }
  };
  const all = async () => {
    if (busy || !list.data?.length) return;
    if (!window.confirm("LIBERAR TODOS os clientes bloqueados em " + deviceLabel + "? Esta ação não poderá ser desfeita.")) return;
    setBusy(true);
    try {
      const response = await releaseAll.mutateAsync({ id: deviceId, confirmed: true });
      toast.success(response.released + " conversa(s) liberada(s).");
      await refresh();
    } catch {
      toast.error("Não foi possível liberar todos os clientes.");
    } finally { setBusy(false); }
  };
  return (
    <section className="rounded-2xl border-2 border-rose-500/40 bg-slate-950 p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-black text-rose-300">⛔ CONTROLE DE BLOQUEIOS</h3>
          <p className="text-sm text-slate-300">Aparelho: {deviceLabel} · As conversas bloqueadas não respondem a MENU ou 0.</p>
        </div>
        <button type="button" onClick={all} disabled={busy || !list.data?.length}
          className="rounded-xl bg-rose-600 px-4 py-3 font-bold text-white disabled:opacity-40">
          LIBERAR TODOS
        </button>
      </div>
      {list.isLoading ? <p className="text-slate-300">Consultando bloqueios...</p> : null}
      {list.isError ? <p role="alert" className="text-rose-300">Falha ao consultar bloqueios.</p> : null}
      {list.data?.length === 0 ? <p className="text-emerald-300">Nenhuma conversa bloqueada.</p> : null}
      <div className="space-y-3">
        {list.data?.map(item => (
          <article key={item.sessionId} className="rounded-xl border border-rose-500/30 bg-slate-900 p-4 space-y-2">
            <div className="font-bold text-white">{item.contactLabel || "Conversa identificada"} · {new Date(item.blockedAt).toLocaleString("pt-BR")}</div>
            <p className="text-sm text-slate-300">Motivo: {item.reason}</p>
            <p className="break-all text-sm text-slate-300">Resposta inválida: {item.invalidAnswer || "Não informada"}</p>
            <p className="text-xs text-slate-400">Identificador seguro: {item.conversationId.slice(0, 16)}...</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={() => single(item.sessionId, false)}
                className="rounded-lg bg-emerald-400 px-4 py-2 font-black text-slate-950 disabled:opacity-40">LIBERAR CLIENTE</button>
              <button type="button" disabled={busy} onClick={() => single(item.sessionId, true)}
                className="rounded-lg bg-cyan-400 px-4 py-2 font-black text-slate-950 disabled:opacity-40">REINICIAR ATENDIMENTO</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
