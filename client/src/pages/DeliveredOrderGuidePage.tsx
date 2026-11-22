import { useRoute } from "wouter";
import { useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { splitDeliveredGuideLinks } from "@/lib/deliveredGuideLinks";
import { resolveDeliveredGuideVideo } from "@/lib/deliveredGuideVideo";
import { BookOpenCheck, CheckCircle2, Image as ImageIcon, ShieldCheck } from "lucide-react";

function LinkedGuideText({ text }: { text: string }) {
  return <>
    {splitDeliveredGuideLinks(text).map((part, index) =>
      part.href
        ? <a key={index} href={part.href} target="_blank" rel="noopener noreferrer"
            className="break-all font-semibold text-cyan-300 underline underline-offset-4 hover:text-cyan-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-200"
          >{part.text}</a>
        : <span key={index}>{part.text}</span>
    )}
  </>;
}

export default function DeliveredOrderGuidePage() {
  const [, params] = useRoute("/pedido-entregue/:token");
  const token = params?.token || "";
  // A tela só é montada após o login pelo UnifiedCustomerAccessGate.
  // Enviar o token de sessão ao servidor, que revalida a identidade e o pedido.
  const customerSessionToken = typeof window !== "undefined" ? localStorage.getItem("cp_token") || "" : "";
  const validToken = /^[a-f0-9]{48}$/.test(token);
  const guideRequest = trpc.deliveredOrderGuide.getPublic.useMutation();
  useEffect(() => {
    if (!validToken || customerSessionToken.length < 32) return;
    // POST: o servidor valida a sessao e o titular sem expor o token na URL.
    guideRequest.mutate({ token, customerSessionToken });
  }, [token, customerSessionToken, validToken]);
  const guide = guideRequest.data?.found ? guideRequest.data : null;
  const isLoading = validToken && customerSessionToken.length >= 32
    && !guideRequest.isSuccess && !guideRequest.isError;
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
          {guide?.customerName && <p className="mt-2 text-sm text-slate-300">{guide.customerName}</p>}
          {guide?.orderNumber && <p className="text-xs text-cyan-200">Pedido #{guide.orderNumber}</p>}
        </header>
        {isLoading && <div role="status" className="rounded-xl border border-cyan-500/20 bg-slate-900/80 p-5 text-center text-sm">Carregando orientações...</div>}
        {!isLoading && !guide && (
          <section role="status" className="rounded-xl border border-amber-400/25 bg-slate-900 p-6 text-center text-sm text-amber-200">
            {guideRequest.isError ? guideRequest.error.message : "Este link não está disponível. Solicite à equipe H2 Colombiano o link atualizado."}
          </section>
        )}
        {guide && <>
          {guide.intro && <section className="rounded-xl border border-emerald-400/25 bg-emerald-950/50 p-5 text-sm leading-relaxed whitespace-pre-wrap"><LinkedGuideText text={guide.intro}/></section>}
          {guide.blocks.map((block, index) => (
            <section key={block.id} className="overflow-hidden rounded-2xl border border-cyan-400/30 bg-[#061913] shadow-lg">
              {block.mediaType === "video" ? (() => {
                const video = resolveDeliveredGuideVideo(block.videoUrl);
                if (!video) return null;
                return video.kind === "file" ? (
                  <video src={video.url} controls playsInline preload="metadata" className="aspect-video w-full bg-black object-contain" aria-label={block.title || "Vídeo de orientação " + (index + 1)} />
                ) : (
                  <iframe title={block.title || "Vídeo de orientação " + (index + 1)} src={video.url} loading="lazy" className="aspect-video w-full border-0 bg-black" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
                );
              })() : block.imageUrl && <img src={block.imageUrl} alt={block.title || "Exemplo visual " + (index + 1)} loading={index === 0 ? "eager" : "lazy"} className="max-h-[700px] w-full bg-black/50 object-contain"/>}
              <div className="space-y-2 p-4 sm:p-5">
                {block.title && <h2 className="flex items-start gap-2 text-lg font-black text-emerald-200"><ImageIcon className="mt-1 h-5 w-5 shrink-0"/>{block.title}</h2>}
                {block.text && <p className="whitespace-pre-wrap text-sm leading-7 text-slate-100 sm:text-base"><LinkedGuideText text={block.text}/></p>}
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
