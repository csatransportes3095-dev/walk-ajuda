import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

/** Somente quando o pedido estiver fechado; nao altera o modelo aberto. */
export default function CompactOrderPhotoMarkers({
  registrationId,
  subOrderIndex,
  completedSlots,
  loading = false,
  error = false,
}: {
  registrationId: number;
  subOrderIndex: number;
  completedSlots: readonly number[];
  loading?: boolean;
  error?: boolean;
}) {
  const utils = trpc.useUtils();
  const save = trpc.orderPhotoAttempts.save.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.orderPhotoAttempts.overview.invalidate(),
        utils.orderPhotoAttempts.get.invalidate({ registrationId, subOrderIndex }),
      ]);
    },
    onError: err => toast.error(err.message || "Erro ao salvar foto."),
  });

  return (
    <div
      className="mx-auto mt-1 w-full max-w-[360px] rounded-xl border border-cyan-400/20 bg-slate-950/55 px-2 py-2"
      onClick={event => event.stopPropagation()}
      onKeyDown={event => event.stopPropagation()}
      aria-label="Marcadores manuais de fotos do pedido"
    >
      <div className="mb-1.5 flex items-center justify-between gap-2 text-[10px] font-bold text-cyan-200">
        <span>CONTROLE DE FOTOS</span>
        <span className="tabular-nums text-slate-300">{loading ? "..." : completedSlots.length + "/3"}</span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {([1, 2, 3] as const).map(slot => {
          const marked = completedSlots.includes(slot);
          const pending = save.isPending && save.variables?.slot === slot;
          return (
            <button
              key={slot}
              type="button"
              aria-pressed={marked}
              aria-label={`Foto ${slot}: ${marked ? "marcada" : "pendente"}. Clique para ${marked ? "desmarcar" : "marcar"}`}
              disabled={loading || error || save.isPending}
              onClick={event => {
                event.stopPropagation();
                save.mutate({
                  registrationId,
                  subOrderIndex,
                  slot,
                  completed: !marked,
                  completedAt: marked ? null : new Date().toISOString(),
                });
              }}
              className={
                "flex min-h-[38px] items-center justify-center gap-1 rounded-lg border px-1 py-1.5 text-[11px] font-extrabold transition-colors disabled:opacity-50 " +
                (marked
                  ? "border-emerald-400/80 bg-emerald-500/25 text-emerald-200"
                  : "border-slate-600/60 bg-slate-900/80 text-slate-300 hover:border-cyan-400/60")
              }
            >
              <span>F{slot}</span>
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : marked
                ? <Check className="h-3.5 w-3.5" />
                : <span className="h-3 w-3 rounded-full border border-slate-400" />}
            </button>
          );
        })}
      </div>
      {error && <p className="mt-1 text-[10px] text-rose-300" role="alert">Não foi possível consultar as fotos.</p>}
    </div>
  );
}
