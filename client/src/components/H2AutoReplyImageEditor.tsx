import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { H2_AUTO_REPLY_IMAGE_MAX_BYTES, type H2AutoReplyImage } from "@shared/h2AutoReplyImage";

type Props = {
  deviceId: string;
  image?: H2AutoReplyImage;
  disabled?: boolean;
  onChange: (image: H2AutoReplyImage | undefined) => void;
  onBusyChange: (busy: boolean) => void;
};

function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === "string" ? reader.result.split(",")[1] : "";
      value ? resolve(value) : reject(new Error("Não foi possível ler a imagem. Selecione o arquivo novamente."));
    };
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem. Selecione o arquivo novamente."));
    reader.readAsDataURL(file);
  });
}

/** Upload changes only this FAQ draft. Its existing Save action publishes the association. */
export default function H2AutoReplyImageEditor({ deviceId, image, disabled, onChange, onBusyChange }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  const busyCallback = useRef(onBusyChange);
  busyCallback.current = onBusyChange;
  const operation = useRef(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [previewFailed, setPreviewFailed] = useState(false);
  const upload = trpc.h2AutoAdmin.uploadReplyImage.useMutation();

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      operation.current += 1;
      busyCallback.current(false);
    };
  }, []);
  useEffect(() => setPreviewFailed(false), [image?.id]);

  const selectImage = async (file?: File) => {
    if (!file || busy || disabled) return;
    setError("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Escolha uma imagem JPG, PNG ou WebP.");
      return;
    }
    if (file.size === 0 || file.size > H2_AUTO_REPLY_IMAGE_MAX_BYTES) {
      setError("A imagem deve ter até 5 MB e não pode estar vazia.");
      return;
    }
    const currentOperation = ++operation.current;
    setBusy(true);
    busyCallback.current(true);
    try {
      const imageBase64 = await readImage(file);
      if (!mounted.current || operation.current !== currentOperation) return;
      const result = await upload.mutateAsync({ id: deviceId, imageBase64, mimeType: file.type as "image/jpeg" | "image/png" | "image/webp" });
      if (mounted.current && operation.current === currentOperation) onChange(result.image);
    } catch (cause) {
      if (mounted.current && operation.current === currentOperation)
        setError(cause instanceof Error ? cause.message : "Não foi possível anexar a imagem. Tente novamente.");
    } finally {
      if (mounted.current && operation.current === currentOperation) {
        setBusy(false);
        busyCallback.current(false);
      }
    }
  };

  return <div role="group" aria-label="Imagem da resposta" aria-busy={busy}
    className="space-y-3 rounded-xl border border-cyan-400/30 bg-cyan-950/15 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0 space-y-1">
        <p className="text-xs font-black text-cyan-100">IMAGEM ANEXADA · OPCIONAL</p>
        <p className="text-xs leading-relaxed text-slate-300">O H2 Auto carrega a imagem para responder com uma foto no WhatsApp.</p>
      </div>
      <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp"
        className="hidden" aria-label="Selecionar imagem da resposta" disabled={busy || disabled}
        onChange={event => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          void selectImage(file);
        }} />
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy || disabled} onClick={() => fileInput.current?.click()}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-cyan-400/50 bg-cyan-500/15 px-3 py-2 text-xs font-black text-cyan-100 disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : image ? <RefreshCw className="h-4 w-4" /> : <ImagePlus className="h-4 w-4" />}
          {busy ? "CARREGANDO IMAGEM..." : image ? "TROCAR IMAGEM" : "ANEXAR IMAGEM"}
        </button>
        {image && <button type="button" disabled={busy || disabled} onClick={() => { setError(""); onChange(undefined); }}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-rose-400/40 px-3 py-2 text-xs font-bold text-rose-200 disabled:opacity-50">
          <Trash2 className="h-4 w-4" /> REMOVER IMAGEM
        </button>}
      </div>
    </div>
    {image && <figure className="flex flex-col gap-3 rounded-lg bg-slate-950/80 p-2 sm:flex-row sm:items-center">
      {previewFailed ? <p className="rounded-lg border border-amber-400/30 p-3 text-xs text-amber-200">A imagem está anexada, mas a prévia não carregou. Tente atualizar a página após salvar.</p>
        : <img src={image.downloadPath} alt="Imagem anexada à resposta" onError={() => setPreviewFailed(true)}
          className="max-h-64 w-full rounded-lg bg-slate-900 object-contain sm:max-h-44 sm:w-56" />}
      <figcaption className="min-w-0 space-y-1 text-xs text-slate-300">
        <p className="font-bold text-cyan-200">Foto selecionada</p>
        <p>{image.width} × {image.height} · {Math.max(1, Math.round(image.fileSize / 1024))} KB</p>
        <p>Salve a pergunta para o APK receber esta imagem.</p>
        <p>O texto acima pode ficar vazio para enviar somente a foto.</p>
      </figcaption>
    </figure>}
    {!image && <p className="text-xs text-slate-400">JPG, PNG ou WebP · até 5 MB. Você pode usar texto, imagem ou os dois.</p>}
    {error && <p role="alert" className="rounded-lg border border-red-400/35 bg-red-950/30 p-2 text-xs text-red-200">{error}</p>}
  </div>;
}
