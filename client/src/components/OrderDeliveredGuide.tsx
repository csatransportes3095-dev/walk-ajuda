import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { BookOpenCheck, CheckCircle2, ClipboardCopy, ExternalLink, ImagePlus, MessageCircle, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { publicSiteUrl } from "@shared/publicLinks";
import { buildWhatsappMessageUrl } from "@shared/whatsappUrl";

type Block = { id: string; title: string; text: string; imageUrl: string };
const newBlock = (): Block => ({ id: crypto.randomUUID(), title: "", text: "", imageUrl: "" });

export default function OrderDeliveredGuide({ registrationId, subOrderIndex, customerPhone, customerName, orderNumber }: {
  registrationId: number;
  subOrderIndex: number;
  customerPhone: string;
  customerName?: string | null;
  orderNumber?: number | null;
}) {
  const utils = trpc.useUtils();
  const key = { registrationId, subOrderIndex };
  const query = trpc.deliveredOrderGuide.getForOrder.useQuery(key, { staleTime: 0, refetchOnWindowFocus: true });
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("ATENÇÃO — PEDIDO ENTREGUE");
  const [intro, setIntro] = useState("Confira com atenção as orientações, imagens e prints enviados pela equipe.");
  const [blocks, setBlocks] = useState<Block[]>([newBlock()]);
  const [dirty, setDirty] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const record = query.data;
  const published = record?.status === "published";
  const link = published && record?.token ? publicSiteUrl("/pedido-entregue/" + record.token) : "";

  useEffect(() => {
    if (!record || dirty) return;
    setTitle(record.title);
    setIntro(record.intro);
    setBlocks(record.blocks?.length ? record.blocks as Block[] : [newBlock()]);
  }, [record?.id, record?.updatedAt, dirty]);
  const refresh = async () => {
    await utils.deliveredOrderGuide.getForOrder.invalidate(key);
    await query.refetch();
  };
  const save = trpc.deliveredOrderGuide.saveForOrder.useMutation({
    onSuccess: async () => { setDirty(false); toast.success("Orientações salvas."); await refresh(); },
    onError: e => toast.error(e.message),
  });
  const publish = trpc.deliveredOrderGuide.publish.useMutation({
    onSuccess: async () => { toast.success("Link publicado."); await refresh(); },
    onError: e => toast.error(e.message),
  });
  const unpublish = trpc.deliveredOrderGuide.unpublish.useMutation({
    onSuccess: async () => { toast.success("Link desativado."); await refresh(); },
    onError: e => toast.error(e.message),
  });
  function editBlock(id: string, patch: Partial<Block>) {
    setDirty(true);
    setBlocks(current => current.map(block => block.id === id ? { ...block, ...patch } : block));
  }
  function saveContent() {
    const clean = blocks.map(b => ({ ...b, title: b.title.trim(), text: b.text.trim(), imageUrl: b.imageUrl.trim() }))
      .filter(b => b.title || b.text || b.imageUrl);
    if (!clean.length) { toast.error("Adicione ao menos uma orientação ou imagem."); return; }
    save.mutate({
      ...key, customerPhone: customerPhone || "", customerName: customerName || null,
      orderNumber: orderNumber || null, title: title.trim(), intro: intro.trim(), blocks: clean,
    });
  }
  async function uploadImage(id: string, file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 15 * 1024 * 1024) {
      toast.error("Selecione uma imagem de até 15 MB."); return;
    }
    setUploading(id);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/upload/admin-image", { method: "POST", credentials: "include", body });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.url) throw new Error(data.error || "Não foi possível enviar a imagem.");
      editBlock(id, { imageUrl: String(data.url) });
      toast.success("Imagem enviada. Salve as orientações.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao enviar imagem.");
    } finally { setUploading(null); }
  }
  async function copyLink() {
    if (!link || dirty) return;
    try { await navigator.clipboard.writeText(link); toast.success("Link copiado."); }
    catch { toast.error("Não foi possível copiar."); }
  }
  function openWhatsapp() {
    if (!link || dirty) return;
    const digits = (customerPhone || "").replace(/\D/g, "");
    const local = digits.startsWith("55") && (digits.length === 12 || digits.length === 13) ? digits.slice(2) : digits;
    if (local.length !== 10 && local.length !== 11) { toast.error("Telefone do cliente inválido."); return; }
    const message = "Olá" + (customerName ? " " + customerName : "") + "! Seu pedido foi entregue. Confira as orientações, fotos e prints de exemplo neste link: " + link;
    window.open(buildWhatsappMessageUrl("55" + local, message), "_blank", "noopener,noreferrer");
  }

  const modal = open ? createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-2 sm:p-4" onClick={() => setOpen(false)}>
      <div className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-emerald-400/40 bg-[#08130e] p-4 text-white shadow-2xl" onClick={e => e.stopPropagation()}>
        <header className="mb-4 flex items-start justify-between gap-3 border-b border-emerald-400/20 pb-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-black text-emerald-200"><BookOpenCheck className="h-5 w-5"/> PEDIDO ENTREGUE</h2>
            <p className="text-xs text-slate-400">Orientações para {customerName || customerPhone} · Pedido {orderNumber || registrationId}</p>
            <p className="mt-2 text-xs text-amber-200">Textos, fotos e prints. Sem perguntas e sem alterar o status do pedido.</p>
          </div>
          <button type="button" aria-label="Fechar" onClick={() => setOpen(false)} className="rounded-lg border border-white/10 p-2"><X className="h-4 w-4"/></button>
        </header>
        <div className="space-y-4">
          <label className="block text-xs font-bold text-slate-300">TÍTULO
            <input value={title} maxLength={140} onChange={e => { setTitle(e.target.value); setDirty(true); }} className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 p-3 text-sm text-white"/>
          </label>
          <label className="block text-xs font-bold text-slate-300">EXPLICAÇÃO INICIAL
            <textarea value={intro} rows={3} maxLength={4000} onChange={e => { setIntro(e.target.value); setDirty(true); }} className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 p-3 text-sm text-white"/>
          </label>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-black text-emerald-200">FOTOS, PRINTS E ORIENTAÇÕES</h3>
            <button type="button" onClick={() => { setDirty(true); setBlocks(b => [...b, newBlock()]); }} className="rounded-lg bg-emerald-500/20 px-3 py-2 text-xs font-bold text-emerald-200"><Plus className="inline h-4 w-4"/> ADICIONAR BLOCO</button>
          </div>
          {blocks.map((block, index) => (
            <section key={block.id} className="space-y-2 rounded-xl border border-emerald-500/25 bg-black/25 p-3">
              <div className="flex items-center justify-between"><span className="text-xs font-black text-emerald-300">BLOCO {index + 1}</span>
                <button type="button" aria-label="Remover bloco" onClick={() => { setDirty(true); setBlocks(b => b.filter(x => x.id !== block.id)); }} className="rounded-md p-1 text-rose-300"><Trash2 className="h-4 w-4"/></button>
              </div>
              <input value={block.title} maxLength={160} placeholder="Título da orientação" onChange={e => editBlock(block.id, { title: e.target.value })} className="w-full rounded-lg border border-white/15 bg-slate-950 p-3 text-sm"/>
              <textarea value={block.text} rows={4} maxLength={4000} placeholder="Texto explicativo para o cliente" onChange={e => editBlock(block.id, { text: e.target.value })} className="w-full rounded-lg border border-white/15 bg-slate-950 p-3 text-sm"/>
              {block.imageUrl && <img src={block.imageUrl} alt={"Exemplo visual " + (index + 1)} className="max-h-72 w-full rounded-lg object-contain"/>}
              <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-cyan-400/45 bg-cyan-500/10 px-3 text-xs font-bold text-cyan-200">
                <ImagePlus className="h-4 w-4"/> {uploading === block.id ? "ENVIANDO..." : "ADICIONAR FOTO OU PRINT"}
                <input type="file" accept="image/*" className="hidden" disabled={uploading !== null} onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; void uploadImage(block.id, file); }}/>
              </label>
              <input value={block.imageUrl} placeholder="Ou cole a URL da imagem H2" onChange={e => editBlock(block.id, { imageUrl: e.target.value })} className="w-full rounded-lg border border-white/10 bg-slate-950 p-2 text-xs text-slate-300"/>
            </section>
          ))}
          {dirty && <p role="status" className="text-sm font-bold text-amber-200">Alterações não salvas. Salve antes de compartilhar.</p>}
          <button type="button" onClick={saveContent} disabled={save.isPending || uploading !== null} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 font-black text-slate-950 disabled:opacity-40">
            <Save className="h-5 w-5"/>{save.isPending ? "SALVANDO..." : "SALVAR ORIENTAÇÕES"}
          </button>
          {record && (
            <section className="space-y-3 rounded-xl border border-white/15 bg-black/20 p-3">
              <p className="text-xs font-black">{published ? "🟢 LINK PUBLICADO" : "🟡 RASCUNHO — CLIENTE NÃO VISUALIZA"}{record.openedAt ? " · Link já aberto" : ""}</p>
              {published && <p className="break-all text-xs text-cyan-200">{link}</p>}
              <button type="button" disabled={dirty || publish.isPending || unpublish.isPending} onClick={() => published ? unpublish.mutate(key) : publish.mutate(key)} className="min-h-10 w-full rounded-lg border border-emerald-400/40 bg-emerald-400/15 px-3 text-sm font-bold text-emerald-200 disabled:opacity-40">
                {published ? "DESATIVAR LINK" : "PUBLICAR ORIENTAÇÕES"}
              </button>
              {published && <div className="grid grid-cols-3 gap-2">
                <button type="button" disabled={dirty} onClick={() => void copyLink()} className="rounded-lg border border-cyan-400/30 p-2 text-xs font-bold text-cyan-200 disabled:opacity-40"><ClipboardCopy className="mx-auto mb-1 h-4 w-4"/>COPIAR</button>
                <button type="button" disabled={dirty || !customerPhone} onClick={openWhatsapp} className="rounded-lg border border-emerald-400/30 p-2 text-xs font-bold text-emerald-200 disabled:opacity-40"><MessageCircle className="mx-auto mb-1 h-4 w-4"/>WHATSAPP</button>
                <button type="button" disabled={dirty} onClick={() => window.open(link,"_blank","noopener,noreferrer")} className="rounded-lg border border-violet-400/30 p-2 text-xs font-bold text-violet-200 disabled:opacity-40"><ExternalLink className="mx-auto mb-1 h-4 w-4"/>ABRIR</button>
              </div>}
            </section>
          )}
        </div>
      </div>
    </div>, document.body
  ) : null;
  return <>
    <button type="button" onClick={e => { e.stopPropagation(); setOpen(true); }} className={"inline-flex min-h-8 items-center gap-1 rounded-lg border px-2.5 py-1 text-[10px] font-black sm:min-h-9 sm:text-[11px] " + (published ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-200" : "border-cyan-500/40 bg-cyan-500/15 text-cyan-200")}>
      {published ? <CheckCircle2 className="h-4 w-4"/> : <BookOpenCheck className="h-4 w-4"/>} PEDIDO ENTREGUE
    </button>
    {modal}
  </>;
}
