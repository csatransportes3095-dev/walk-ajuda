import { useState, useRef, useCallback, useEffect } from "react";
import ReactCrop, { type Crop, type PixelCrop, centerCrop, makeAspectCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { X, Crop as CropIcon, Check } from "lucide-react";

interface ImageCropModalProps {
  imageSrc: string;
  mimeType: string;
  onConfirm: (base64: string, mimeType: string) => void;
  onCancel: () => void;
}

const ASPECT = 1200 / 630; // 1.905... ≈ 1.91:1

function centerAspectCrop(mediaWidth: number, mediaHeight: number, aspect: number): Crop {
  return centerCrop(
    makeAspectCrop({ unit: "%", width: 90 }, aspect, mediaWidth, mediaHeight),
    mediaWidth,
    mediaHeight
  );
}

function getCroppedCanvas(image: HTMLImageElement, pixelCrop: PixelCrop): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;
  canvas.width = pixelCrop.width * scaleX;
  canvas.height = pixelCrop.height * scaleY;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(
    image,
    pixelCrop.x * scaleX,
    pixelCrop.y * scaleY,
    pixelCrop.width * scaleX,
    pixelCrop.height * scaleY,
    0,
    0,
    canvas.width,
    canvas.height
  );
  return canvas;
}

export function ImageCropModal({ imageSrc, mimeType, onConfirm, onCancel }: ImageCropModalProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [isProcessing, setIsProcessing] = useState(false);

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    setCrop(centerAspectCrop(width, height, ASPECT));
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!imgRef.current || !completedCrop) return;
    setIsProcessing(true);
    try {
      const canvas = getCroppedCanvas(imgRef.current, completedCrop);
      const outputMime = mimeType === "image/png" ? "image/png" : "image/jpeg";
      const dataUrl = canvas.toDataURL(outputMime, 0.92);
      const base64 = dataUrl.split(",")[1];
      onConfirm(base64, outputMime);
    } finally {
      setIsProcessing(false);
    }
  }, [completedCrop, mimeType, onConfirm]);

  // Fechar com Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#111128] border border-purple-500/30 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <CropIcon className="w-4 h-4 text-purple-400" />
            <h3 className="text-sm font-bold text-white">Recortar Imagem</h3>
            <span className="text-xs text-white/40 bg-white/5 px-2 py-0.5 rounded-full">proporção 1.91:1 (ideal para WhatsApp)</span>
          </div>
          <button onClick={onCancel} className="p-1.5 text-white/40 hover:text-white transition-colors rounded-lg hover:bg-white/10">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Área de crop */}
        <div className="p-5 flex justify-center bg-black/30 max-h-[60vh] overflow-auto">
          <ReactCrop
            crop={crop}
            onChange={(c) => setCrop(c)}
            onComplete={(c) => setCompletedCrop(c)}
            aspect={ASPECT}
            minWidth={100}
          >
            <img
              ref={imgRef}
              src={imageSrc}
              alt="Recortar"
              onLoad={onImageLoad}
              style={{ maxHeight: "50vh", maxWidth: "100%", objectFit: "contain" }}
            />
          </ReactCrop>
        </div>

        {/* Informações e botões */}
        <div className="px-5 py-4 border-t border-white/10 flex items-center justify-between gap-3">
          <p className="text-xs text-white/40">
            Arraste as alças para ajustar o recorte. A área selecionada será enviada como miniatura.
          </p>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-xs font-semibold text-white/60 border border-white/10 rounded-lg hover:bg-white/5 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              disabled={!completedCrop || isProcessing}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {isProcessing ? (
                <span className="flex items-center gap-1.5">
                  <span className="animate-spin w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" />
                  Processando...
                </span>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  Usar este recorte
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
