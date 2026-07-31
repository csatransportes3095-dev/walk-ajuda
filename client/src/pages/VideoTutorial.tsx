import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";

export default function VideoTutorial() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [devToolsWarning, setDevToolsWarning] = useState(false);

  // Buscar URL assinada do vídeo via tRPC (streaming direto do CloudFront)
  const { data: videoData, isLoading, error } = trpc.video.getTutorialUrl.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: 1000 * 60 * 8, // 8 minutos (URL expira em ~10min)
    retry: 2,
  });

  // Proteção básica contra DevTools
  useEffect(() => {
    const threshold = 160;
    const checkDevTools = () => {
      const widthDiff = window.outerWidth - window.innerWidth > threshold;
      const heightDiff = window.outerHeight - window.innerHeight > threshold;
      setDevToolsWarning(widthDiff || heightDiff);
    };
    const interval = setInterval(checkDevTools, 1000);
    return () => clearInterval(interval);
  }, []);

  // Bloquear atalhos de teclado para DevTools e salvar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "F12" ||
        (e.ctrlKey && e.shiftKey && (e.key === "I" || e.key === "J" || e.key === "C")) ||
        (e.ctrlKey && (e.key === "u" || e.key === "U" || e.key === "s" || e.key === "S"))
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, []);

  return (
    <div
      className="min-h-screen bg-black flex flex-col items-center justify-start select-none py-6 px-4"
      onContextMenu={e => e.preventDefault()}
    >
      {devToolsWarning && (
        <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
          <div className="text-center px-8">
            <div className="text-6xl mb-4">�xa�</div>
            <h1 className="text-white text-2xl font-bold mb-2">Acesso Bloqueado</h1>
            <p className="text-gray-400 text-sm">Feche as ferramentas de desenvolvedor para continuar.</p>
          </div>
        </div>
      )}

      {/* Título */}
      <div className="text-center mb-5 w-full max-w-sm">
        <h1 className="text-white text-xl font-bold tracking-wide">
          �x}� Tutorial de Ativação
        </h1>
        <p className="text-gray-400 text-xs mt-1">Assista para aprender como ativar sua conta</p>
      </div>

      {/* Player de Vídeo � formato vertical 9:16 */}
      <div
        className="relative rounded-2xl overflow-hidden shadow-2xl bg-gray-900 border border-gray-700 w-full"
        style={{ maxWidth: 360 }}
      >
        {isLoading ? (
          <div
            className="flex items-center justify-center bg-gray-900"
            style={{ aspectRatio: "9/16" }}
          >
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-gray-400 text-sm">Carregando...</p>
            </div>
          </div>
        ) : error || !videoData?.url ? (
          <div
            className="flex items-center justify-center bg-gray-900"
            style={{ aspectRatio: "9/16" }}
          >
            <div className="text-center px-4">
              <div className="text-4xl mb-2">�a�️</div>
              <p className="text-red-400 text-sm">Erro ao carregar vídeo.</p>
              <button
                onClick={() => window.location.reload()}
                className="mt-3 px-4 py-2 bg-white text-black text-xs font-bold rounded-lg"
              >
                Tentar novamente
              </button>
            </div>
          </div>
        ) : (
          <video
            ref={videoRef}
            src={videoData.url}
            controls
            playsInline
            controlsList="nodownload"
            disablePictureInPicture
            onContextMenu={e => e.preventDefault()}
            className="w-full block"
            style={{
              userSelect: "none",
              WebkitUserSelect: "none",
              background: "#000",
              display: "block",
              width: "100%",
              aspectRatio: "9/16",
              objectFit: "contain",
            }}
          />
        )}
      </div>

      {/* Rodapé */}
      <div className="text-center mt-5">
        <p className="text-gray-600 text-xs">© H2 COLOMBIANO � Conteúdo exclusivo para clientes</p>
      </div>
    </div>
  );
}
