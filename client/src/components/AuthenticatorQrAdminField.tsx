import { useRef, useState } from 'react';
import { ClipboardPaste, ImagePlus, Maximize2, Trash2, Upload } from 'lucide-react';
import { trpc } from '@/lib/trpc';

type PendingQr = { data: string; mimeType: string } | null | undefined;

type Props = {
  registrationId: number;
  hasExistingQr: boolean;
  pendingValue: PendingQr;
  onPendingValueChange: (value: PendingQr) => void;
  disabled?: boolean;
};

const MAX_BYTES = 3 * 1024 * 1024;
const ACCEPTED = new Set(['image/png', 'image/jpeg', 'image/webp']);

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
    reader.readAsDataURL(file);
  });
}

export function AuthenticatorQrAdminField({ registrationId, hasExistingQr, pendingValue, onPendingValueChange, disabled }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const existingQuery = trpc.loginData.getAuthenticatorQrForAdmin.useQuery(
    { registrationId },
    { enabled: hasExistingQr && pendingValue === undefined, staleTime: 0 }
  );

  const previewData = pendingValue && typeof pendingValue === 'object'
    ? pendingValue.data
    : pendingValue === undefined
      ? (existingQuery.data ? `data:${existingQuery.data.mimeType};base64,${existingQuery.data.data}` : null)
      : null;

  const acceptFile = async (file?: File | null) => {
    setError(null);
    if (!file) return;
    if (!ACCEPTED.has(file.type)) {
      setError('Envie somente imagens PNG, JPG/JPEG ou WebP.');
      return;
    }
    if (file.size === 0 || file.size > MAX_BYTES) {
      setError('A imagem deve ter no máximo 3 MB.');
      return;
    }
    try {
      const data = await readAsDataUrl(file);
      onPendingValueChange({ data, mimeType: file.type });
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : 'Não foi possível preparar a imagem.');
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const item = Array.from(event.clipboardData.items).find(candidate => candidate.type.startsWith('image/'));
    if (!item) return;
    event.preventDefault();
    void acceptFile(item.getAsFile());
  };

  const handlePasteButton = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setError(null);
    if (!navigator.clipboard?.read) {
      setError('Este navegador não permite ler o print diretamente. Use CTRL+V dentro da área ou Selecione imagem.');
      return;
    }
    try {
      const clipboardItems = await navigator.clipboard.read();
      for (const clipboardItem of clipboardItems) {
        const imageType = clipboardItem.types.find(type => ACCEPTED.has(type));
        if (!imageType) continue;
        const blob = await clipboardItem.getType(imageType);
        const extension = imageType === 'image/png' ? 'png' : imageType === 'image/webp' ? 'webp' : 'jpg';
        await acceptFile(new File([blob], `print-autenticador.${extension}`, { type: imageType }));
        return;
      }
      setError('Nenhum print de imagem foi encontrado. Copie o print e toque em Colar print novamente.');
    } catch {
      setError('Não foi possível ler o print. Autorize a área de transferência ou use CTRL+V dentro da área.');
    }
  };

  const requestDelete = () => {
    if (window.confirm('Remover o QR Code do autenticador deste cliente?')) {
      setError(null);
      onPendingValueChange(null);
    }
  };

  return (
    <div className="rounded-xl border border-lime-500/25 bg-lime-500/[0.035] p-3 space-y-2.5">
      <div>
        <p className="text-xs font-semibold text-lime-300 flex items-center gap-1.5"><ImagePlus className="w-3.5 h-3.5" /> QR CODE / IMAGEM DO AUTENTICADOR</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">Dado protegido. Cole, arraste ou selecione a imagem; ela só será salva ao clicar em <strong>Salvar Dados de Login</strong>.</p>
      </div>

      {previewData ? (
        <div className="rounded-lg border border-lime-400/25 bg-black/20 p-2.5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-bold text-lime-300">QR CODE DO AUTENTICADOR</p>
            <span className="text-[10px] text-lime-300/70">{pendingValue && typeof pendingValue === 'object' ? 'Aguardando salvar' : 'Salvo com proteção'}</span>
          </div>
          <div className="flex justify-center rounded-md bg-white p-2">
            <img src={previewData} alt="QR Code do autenticador" className="max-h-44 max-w-full object-contain" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            <button type="button" onClick={() => setExpanded(true)} disabled={disabled} className="rounded-lg border border-white/15 bg-white/5 px-2 py-1.5 text-[11px] font-semibold text-white hover:bg-white/10 disabled:opacity-50"><Maximize2 className="inline w-3.5 h-3.5 mr-1" />Ampliar</button>
            <button type="button" onClick={handlePasteButton} disabled={disabled} className="rounded-lg border border-violet-300/50 bg-gradient-to-r from-violet-600 to-fuchsia-600 px-2 py-1.5 text-[11px] font-bold text-white shadow-lg shadow-violet-900/30 hover:brightness-110 disabled:opacity-50"><ClipboardPaste className="inline w-3.5 h-3.5 mr-1" />Colar print</button>
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={disabled} className="rounded-lg border border-lime-400/30 bg-lime-500/10 px-2 py-1.5 text-[11px] font-semibold text-lime-200 hover:bg-lime-500/20 disabled:opacity-50"><Upload className="inline w-3.5 h-3.5 mr-1" />Trocar</button>
            <button type="button" onClick={requestDelete} disabled={disabled} className="rounded-lg border border-red-400/30 bg-red-500/10 px-2 py-1.5 text-[11px] font-semibold text-red-300 hover:bg-red-500/20 disabled:opacity-50"><Trash2 className="inline w-3.5 h-3.5 mr-1" />Excluir</button>
          </div>
        </div>
      ) : (
        <div
          tabIndex={0}
          role="button"
          aria-label="Adicionar QR Code do autenticador"
          onPaste={handlePaste}
          onDrop={event => { event.preventDefault(); setIsDragging(false); void acceptFile(event.dataTransfer.files?.[0]); }}
          onDragOver={event => { event.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') fileInputRef.current?.click(); }}
          className={`rounded-lg border border-dashed p-4 text-center transition-colors ${isDragging ? 'border-lime-300 bg-lime-500/15' : 'border-lime-400/35 bg-black/10 hover:bg-lime-500/10'} ${disabled ? 'pointer-events-none opacity-50' : ''}`}
        >
          <ImagePlus className="w-6 h-6 text-lime-300 mx-auto mb-1.5" />
          <p className="text-xs font-semibold text-lime-200">Cole o print direto, arraste uma imagem ou escolha da galeria</p>
          <p className="text-[10px] text-muted-foreground mt-1">PNG, JPG/JPEG ou WebP · até 3 MB</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <button type="button" onClick={handlePasteButton} disabled={disabled} className="rounded-lg border border-violet-300/50 bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-2 text-xs font-extrabold text-white shadow-lg shadow-violet-900/30 hover:brightness-110 disabled:opacity-50"><ClipboardPaste className="inline w-4 h-4 mr-1.5" />Colar print</button>
            <button type="button" onClick={event => { event.stopPropagation(); fileInputRef.current?.click(); }} disabled={disabled} className="rounded-lg border border-lime-400/35 bg-lime-500/10 px-4 py-2 text-xs font-bold text-lime-200 hover:bg-lime-500/20 disabled:opacity-50"><Upload className="inline w-4 h-4 mr-1.5" />Selecionar imagem</button>
          </div>
        </div>
      )}

      <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" className="hidden" onChange={event => { void acceptFile(event.target.files?.[0]); event.currentTarget.value = ''; }} />
      {error && <p className="text-[11px] text-red-300">{error}</p>}
      {expanded && previewData && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4" onClick={() => setExpanded(false)}>
          <div className="max-h-full max-w-full rounded-xl bg-white p-4 shadow-2xl" onClick={event => event.stopPropagation()}>
            <img src={previewData} alt="QR Code do autenticador ampliado" className="max-h-[78vh] max-w-[86vw] object-contain" />
            <button type="button" onClick={() => setExpanded(false)} className="mt-3 w-full rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white">Fechar</button>
          </div>
        </div>
      )}
    </div>
  );
}

export type { PendingQr };
