import { useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { BookOpenCheck, CheckCircle2, Image as ImageIcon, ShieldCheck } from "lucide-react";

export default function DeliveredOrderGuidePage() {
  const [, params] = useRoute("/pedido-entregue/:token");
  const token = params?.token || "";
  const query = trpc.deliveredOrderGuide.getPublic.useQuery(
    { token }, { enabled: /^[a-f0-9]{48}$/.test(token), refetchOnWindowFocus: true }
  );
  const guide = query.data?.found ? query.data : null;
  const isLoading = query.isLoading;
  return (
    <main className="min-h-screen bg-[#030b11] px-3 py-6 text-white sm:px-5">
      <div className="mx-auto max-w-2xl space-y-4">
        <header className="overflow-hidden rounded-2xl border border-cyan-400/35 bg-gradient-to-br from-[#05172a] to-[#08251b] p-5 shadow-2xl">
          <div className="mb-3 flex items-center gap-2 text-lg font-black text-cyan-300">
            <BookOpenCheck className="h-6 w-6"/> H2 COLOMBIANO
          </div>
          <div className="mb-2 h-1 rounded-full bg-gradient-to-r from-cyan-400 via-blue-500 to-emerald-500"/>
          <p className="text-xs font-bold uppercase tracking-widest text-emerald-300">Orientações do cliente</p>
          <h1 className="mt-2 text-2xl font-black text-white sm:text-3xl">{guide?.title || "PEDIDO ENTREGUE"}</h1>
        </header>
        {isLoading && <div role="status" className="rounded-xl border border-cyan-500/20 bg-slate-900/80 p-5 text-center text-sm">Carregando orientações...</div>}
        {!isLoading && !guide && (
          <section role="status" className="rounded-xl border border-amber-400/25 bg-slate-900 p-6 text-center text-sm text-amber-200">
            Este link não está disponível. Solicite à equipe H2 Colombiano o link atualizado.
          </section>
        )}
        {guide && <>
          {guide.intro && <section className="rounded-xl border border-emerald-400/25 bg-emerald-950/50 p-5 text-sm leading-relaxed whitespace-pre-wrap">{guide.intro}</section>}
          {guide.blocks.map((block, index) => (
            <section key={block.id} className="overflow-hidden rounded-2xl border border-cyan-400/30 bg-[#061913] shadow-lg">
              {block.imageUrl && <img src={block.imageUrl} alt={block.title || "Exemplo visual " + (index + 1)} loading={index === 0 ? "eager" : "lazy"} className="max-h-[700px] w-full bg-black/50 object-contain"/>}
              <div className="space-y-2 p-4 sm:p-5">
                {block.title && <h2 className="flex items-start gap-2 text-lg font-black text-emerald-200"><ImageIcon className="mt-1 h-5 w-5 shrink-0"/>{block.title}</h2>}
                {block.text && <p className="whitespace-pre-wrap text-sm leading-7 text-slate-100 sm:text-base">{block.text}</p>}
              </div>
            </section>
          ))}
          <footer className="rounded-xl border border-emerald-400/25 bg-black/20 p-4 text-center text-xs text-emerald-200">
            <CheckCircle2 className="mr-2 inline h-4 w-4"/> Orientações disponibilizadas pela equipe H2 Colombiano.
            <p className="mt-2 text-slate-400"><ShieldCheck className="mr-1 inline h-3 w-3"/>Esta página é apenas informativa. Não altera dados do seu pedido.</p>
          </footer>
        </>}
      </div>
    </main>
  );
}
