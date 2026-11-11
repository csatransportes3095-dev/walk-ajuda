import { Check, Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

/**
 * Marcadores manuais independentes: nao mudam status, agenda, confirmacao
 * da foto nem notificam o cliente.
 */
export default function OrderPhotoMarkers({
  registrationId,
  subOrderIndex,
}: {
  registrationId: number;
  subOrderIndex: number;
}) {
  const utils = trpc.useUtils();
  const input = { registrationId, subOrderIndex };
  const query = trpc.orderPhotoAttempts.get.useQuery(input, {
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });
  const save = trpc.orderPhotoAttempts.save.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.orderPhotoAttempts.get.invalidate(input),
        utils.orderPhotoAttempts.overview.invalidate(),
      ]);
    },
    onError: error => toast.error(error.message || "Não foi possível salvar a marcação."),
  });
  const records = query.data ?? [];
  const marked = records.filter(item => item.completed).length;

  return (
    <section
      aria-label="Controle manual de fotos realizadas"
      className="min-w-0 rounded-2xl border border-cyan-400/30 bg-slate-950/65 p-3 shadow-[0_0_18px_rgba(34,211,238,0.06)]"
      onClick={event => event.stopPropagation()}
      onKeyDown={event => event.stopPropagation()}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-black text-cyan-200">
          <Camera className="h-4 w-4" />
          CONTROLE DE FOTOS
        </div>
        <span className="rounded-full border border-cyan-400/35 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-extrabold tabular-nums text-cyan-100">
          {query.isLoading ? "..." : marked + "/3 marcadas"}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {([1, 2, 3] as const).map(slot => {
          const item = records.find(record => record.slot === slot);
          const completed = Boolean(item?.completed);
          const pending = save.isPending && save.variables?.slot === slot;
          return (
            <button
              key={slot}
              type="button"
              aria-pressed={completed}
              aria-label={"Foto " + slot + (completed ? ": realizada, clique para desmarcar" : ": não realizada, clique para marcar")}
              disabled={query.isLoading || query.isError || save.isPending}
              onClick={() => {
                save.mutate({
                  registrationId,
                  subOrderIndex,
                  slot,
                  completed: !completed,
                  completedAt: !completed ? new Date().toISOString() : null,
                  note: item?.note || "",
                });
              }}
              className={
                "flex min-h-[84px] flex-col items-center justify-center gap-1.5 rounded-xl border-2 px-2 py-3 text-center transition-colors disabled:cursor-wait disabled:opacity-60 " +
                (completed
                  ? "border-emerald-400 bg-emerald-500/25 text-emerald-200 shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                  : "border-white/15 bg-white/[0.04] text-slate-300 hover:border-cyan-400/65 hover:bg-cyan-400/10")
              }
            >
              <span className="text-xs font-black">FOTO {slot}</span>
              {pending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : completed ? (
                <Check className="h-5 w-5" />
              ) : (
                <span className="flex h-5 w-5 items-center justify-center rounded-md border-2 border-slate-400" />
              )}
              <span className="text-[10px] font-semibold leading-tight">
                {completed ? "FEITA" : "PENDENTE"}
              </span>
            </button>
          );
        })}
      </div>
      {query.isError && (
        <p role="alert" className="mt-2 text-xs text-rose-300">Falha ao consultar as marcações. Reabra o pedido para tentar novamente.</p>
      )}
      <p className="mt-2 text-[10px] text-slate-400">
        Marcação manual do ADM. Não altera status nem envia mensagens.
      </p>
    </section>
  );
}
