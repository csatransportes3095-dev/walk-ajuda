import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export function ProfilePhotoRecovery({ customerId, onSaved }: { customerId: number; onSaved: (id: number, url: string) => void }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Set<string>>(new Set());
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const dialog = useRef<HTMLDialogElement>(null);
  const photos = trpc.customers.getProfilePhotoRecoveryCandidates.useQuery({ customerId }, {
    enabled: open, staleTime: 0, retry: false, refetchOnWindowFocus: false,
  });
  const restore = trpc.customers.restoreProfilePhoto.useMutation({
    onSuccess: data => {
      onSaved(data.customerId, data.url);
      toast.success("Foto recuperada e vinculada ao cadastro!");
      setOpen(false);
    },
    onError: error => toast.error(error.message || "Não foi possível recuperar a foto."),
  });
  useEffect(() => {
    if (open) dialog.current?.showModal(); else dialog.current?.close();
  }, [open]);
  const choose = () => {
    if (!selected || !photos.data || !loaded.has(selected) || restore.isPending) return;
    restore.mutate({ customerId, key: selected, expectedPhotoUrl: photos.data.expectedPhotoUrl });
  };
  return <>
    <button type="button" className="block text-xs text-primary hover:underline my-2" onClick={() => {
      setSelected(null); setLoaded(new Set()); setFailed(new Set()); setOpen(true);
    }}>Buscar foto já enviada</button>
    {open && <dialog ref={dialog}
      className="m-auto w-[min(94vw,680px)] max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-background text-foreground p-5 backdrop:bg-black/70"
      aria-labelledby={`recover-photo-title-${customerId}`}
      onCancel={event => { if (restore.isPending) event.preventDefault(); else setOpen(false); }}
      onClose={() => setOpen(false)}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 id={`recover-photo-title-${customerId}`} className="font-bold">Recuperar foto de perfil</h2>
        <button type="button" disabled={restore.isPending} onClick={() => setOpen(false)} className="px-3 py-1 rounded border border-border">Fechar</button>
      </div>
      <p className="text-sm text-muted-foreground mb-4">Confira visualmente se a imagem pertence a este cliente. Só a foto selecionada será vinculada ao cadastro; nenhum outro dado será alterado.</p>
      {photos.isFetching && <p role="status">Buscando fotos armazenadas...</p>}
      {photos.isError && <div role="alert" className="text-sm text-red-400">
        {photos.error.message}
        <button type="button" className="ml-2 underline" onClick={() => void photos.refetch()}>Tentar novamente</button>
      </div>}
      {!photos.isFetching && !photos.isError && photos.data?.candidates.length === 0 && <p className="text-sm">Nenhuma foto recuperável foi localizada no armazenamento atual. O arquivo antigo pode não estar mais disponível; nesse caso, envie o arquivo original pelo botão da câmera.</p>}
      {!photos.isFetching && !photos.isError && <div className="grid grid-cols-2 gap-3">
        {photos.data?.candidates.map(photo => <button type="button" key={photo.key}
          disabled={restore.isPending || failed.has(photo.key)}
          aria-pressed={selected === photo.key}
          onClick={() => setSelected(photo.key)}
          className={`p-2 rounded-lg border text-left disabled:opacity-50 ${selected === photo.key ? "border-primary ring-2 ring-primary" : "border-border"}`}>
          {!failed.has(photo.key) ? <img src={photo.url} alt="Foto disponível para conferência"
            className="w-full h-40 object-contain rounded bg-muted"
            onLoad={() => setLoaded(previous => new Set(previous).add(photo.key))}
            onError={() => { setFailed(previous => new Set(previous).add(photo.key)); setLoaded(previous => { const next = new Set(previous); next.delete(photo.key); return next; }); }} />
            : <div className="h-40 flex items-center text-sm">Não foi possível carregar esta imagem.</div>}
          <span className="block text-xs mt-2">{new Date(photo.uploadedAt).toLocaleString("pt-BR")}</span>
          <span className="block text-xs mt-1">{selected === photo.key ? "Selecionada" : "Selecionar para conferir"}</span>
        </button>)}
      </div>}
      {photos.data?.truncated && <p className="text-xs text-muted-foreground mt-3">A busca atingiu o limite de páginas. Esta é uma lista parcial.</p>}
      <p className="text-xs text-muted-foreground mt-3">São exibidas até 12 fotos encontradas. Nenhuma imagem é escolhida automaticamente.</p>
      <button type="button" onClick={choose} disabled={!selected || !loaded.has(selected) || photos.isFetching || photos.isError || restore.isPending}
        className="mt-4 w-full rounded-lg bg-primary text-primary-foreground font-semibold py-2 disabled:opacity-40">
        {restore.isPending ? "Recuperando e confirmando..." : "Confirmar: usar esta foto"}
      </button>
    </dialog>}
  </>;
}
