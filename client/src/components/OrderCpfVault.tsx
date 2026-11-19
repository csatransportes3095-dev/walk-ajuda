import { useState } from "react";
import { LockKeyhole } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import CpfVaultCheck from "@/components/CpfVaultCheck";
import CpfVaultRecords from "@/components/CpfVaultRecords";

type Props = { registrationId: number; subOrderIndex?: number; customerName?: string | null; orderNumber?: number | null; orderRootId?: number | null };
type OrderTarget = { registrationId: number; subOrderIndex: number; customerName: string | null; orderNumber: number | null; orderRootId: number | null };

export default function OrderCpfVault({ registrationId, subOrderIndex = 0, customerName, orderNumber, orderRootId }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState<OrderTarget | null>(null);
  const cardChanged = Boolean(target && (
    target.registrationId !== registrationId || target.subOrderIndex !== subOrderIndex ||
    target.orderNumber !== (orderNumber ?? null) || target.orderRootId !== (orderRootId ?? null)
  ));
  const hasOrderIdentity = Boolean(target?.orderRootId && target.orderRootId > 0);

  const changeOpen = (next: boolean) => {
    if (busy) return;
    // Order cards are reused after list refreshes; keep the opened order fixed.
    setTarget(next ? { registrationId, subOrderIndex, customerName: customerName ?? null, orderNumber: orderNumber ?? null, orderRootId: orderRootId ?? null } : null);
    setOpen(next);
  };

  return <span onClick={event => event.stopPropagation()} onKeyDown={event => {
    if (event.key === "Enter" || event.key === " ") event.stopPropagation();
  }}>
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <button type="button" className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-2.5 py-1.5 text-[11px] font-bold text-cyan-200 hover:bg-cyan-500/20"
          title="Consultar e registrar CPF neste pedido"><LockKeyhole className="h-3.5 w-3.5" />Cofre de CPF</button>
      </DialogTrigger>
      {open && target && <DialogContent showCloseButton={!busy} className="max-h-[90dvh] overflow-y-auto rounded-2xl border-cyan-400/25 bg-[#090b16] text-white sm:max-w-xl"
        onInteractOutside={event => { if (busy) event.preventDefault(); }} onEscapeKeyDown={event => { if (busy) event.preventDefault(); }}>
        <DialogHeader className="pr-6">
          <DialogTitle className="flex items-center gap-2 text-cyan-200"><LockKeyhole className="h-5 w-5" />Cofre de CPF</DialogTitle>
          <DialogDescription className="break-words text-slate-400">{target.customerName ? `${target.customerName} · ` : ""}{target.orderNumber ? `Pedido #${target.orderNumber}` : "Pedido selecionado"}{target.subOrderIndex > 0 ? ` · item ${target.subOrderIndex + 1}` : ""}. Ao registrar, o CPF fica usado e vinculado a este pedido.</DialogDescription>
        </DialogHeader>
        {cardChanged && <p role="alert" className="rounded-xl border border-amber-400/35 bg-amber-400/10 p-3 text-sm text-amber-200">O pedido deste card mudou. Feche esta janela, atualize a lista e abra o cofre no pedido correto antes de registrar um CPF.</p>}
        {!hasOrderIdentity && !cardChanged && <p role="alert" className="rounded-xl border border-amber-400/35 bg-amber-400/10 p-3 text-sm text-amber-200">Não foi possível confirmar a identificação deste pedido. Feche esta janela, atualize a lista de pedidos e abra o cofre novamente.</p>}
        <fieldset disabled={cardChanged || !hasOrderIdentity} className="min-w-0 disabled:opacity-60">
          <CpfVaultCheck registrationId={target.registrationId} subOrderIndex={target.subOrderIndex} orderNumber={target.orderNumber} orderRootId={target.orderRootId} onBusyChange={setBusy} />
        </fieldset>
        {hasOrderIdentity && <div className="border-t border-white/10 pt-5"><CpfVaultRecords registrationId={target.registrationId} subOrderIndex={target.subOrderIndex} orderNumber={target.orderNumber} orderRootId={target.orderRootId} /></div>}
        <a href="/adm/cpf" target="_blank" rel="noopener noreferrer" className="text-center text-xs font-semibold text-cyan-300 underline underline-offset-4">Abrir cofre completo e consulta em lote</a>
      </DialogContent>}
    </Dialog>
  </span>;
}
