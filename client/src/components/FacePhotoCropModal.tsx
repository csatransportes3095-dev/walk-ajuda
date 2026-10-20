import { useEffect, useRef, useState } from "react";
import ReactCrop, { type PercentCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { Check, Crop, X } from "lucide-react";
import { faceCropToPixels } from "@/lib/facePhotoCropMath";

type FacePhotoCropModalProps = {
  file: File;
  onConfirm: (croppedFile: File) => void;
  onCancel: () => void;
};

const INITIAL_CROP: PercentCrop = {
  unit: "%",
  x: 8,
  y: 8,
  width: 84,
  height: 84,
};

/**
 * Recorte manual e opcional da Foto Mestre ou candidata.
 * Processa exclusivamente no navegador: não envia a foto para serviços externos.
 * Não altera o motor nem o cálculo de similaridade do H2 Face.
 */
export default function FacePhotoCropModal({
  file,
  onConfirm,
  onCancel,
}: FacePhotoCropModalProps) {
  const [imageUrl, setImageUrl] = useState("");
  const [crop, setCrop] = useState<PercentCrop>(INITIAL_CROP);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    setCrop(INITIAL_CROP);
    setError("");
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !processing) onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel, processing]);

  const confirm = async () => {
    const image = imageRef.current;
    if (!image || processing) return;

    setError("");
    setProcessing(true);
    try {
      const rect = faceCropToPixels(
        { x: crop.x, y: crop.y, width: crop.width, height: crop.height },
        image.naturalWidth,
        image.naturalHeight,
      );
      if (rect.width < 120 || rect.height < 150) {
        throw new Error("O recorte é muito pequeno. Inclua o rosto inteiro para preservar a nitidez.");
      }

      const canvas = document.createElement("canvas");
      canvas.width = rect.width;
      canvas.height = rect.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Não foi possível preparar o recorte da foto.");

      context.drawImage(
        image,
        rect.x,
        rect.y,
        rect.width,
        rect.height,
        0,
        0,
        rect.width,
        rect.height,
      );

      const mimeType = file.type === "image/png" ? "image/png" : "image/jpeg";
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (result) => result
            ? resolve(result)
            : reject(new Error("Não foi possível salvar o recorte.")),
          mimeType,
          0.95,
        );
      });
      const originalName = file.name.replace(/\.[^.]+$/, "") || "foto";
      const extension = mimeType === "image/png" ? "png" : "jpg";
      const croppedFile = new File(
        [blob],
        originalName + "_recorte." + extension,
        { type: mimeType, lastModified: Date.now() },
      );
      onConfirm(croppedFile);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao recortar a imagem.");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/85 p-3 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Recortar foto facial"
    >
      <div className="flex max-h-[95vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-cyan-400/30 bg-[#0b101c] shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 p-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-black text-white">
              <Crop className="h-5 w-5 text-cyan-300" /> Ajustar recorte facial
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Mantenha todo o rosto visível. O motor H2 Face continua o mesmo.
            </p>
          </div>
          <button
            type="button"
            disabled={processing}
            onClick={onCancel}
            className="rounded-lg p-2 text-slate-300 hover:bg-white/10 disabled:opacity-40"
            aria-label="Fechar recorte"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 overflow-auto bg-black/40 p-3 text-center sm:p-5">
          {imageUrl && (
            <ReactCrop
              crop={crop}
              onChange={(_pixels, percent) => setCrop(percent)}
              minWidth={80}
              minHeight={80}
            >
              <img
                ref={imageRef}
                src={imageUrl}
                alt="Foto original para recorte"
                className="mx-auto max-h-[58vh] max-w-full object-contain"
              />
            </ReactCrop>
          )}
        </div>

        <div className="space-y-3 border-t border-white/10 p-4">
          <p className="text-xs text-slate-400">
            Arraste as bordas para selecionar apenas a pessoa desejada.
            Nenhuma imagem é enviada a terceiros.
          </p>
          {error && <p role="alert" className="text-xs font-bold text-red-300">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              disabled={processing}
              onClick={onCancel}
              className="rounded-lg border border-white/15 px-4 py-2.5 text-xs font-bold text-slate-200 hover:bg-white/5 disabled:opacity-40"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={processing || !imageUrl}
              onClick={() => void confirm()}
              className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2.5 text-xs font-black text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Check className="h-4 w-4" />
              {processing ? "Preparando..." : "Usar este recorte"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
