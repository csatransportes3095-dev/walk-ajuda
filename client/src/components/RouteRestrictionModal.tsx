import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, X } from 'lucide-react';

const RESTRICTION_PRESETS = [
  {
    id: 'temporario',
    label: 'Bloqueio temporário',
    text: 'Acesso temporariamente desativado pela administração. Aguarde novas orientações para a liberação.',
  },
  {
    id: 'pagamento',
    label: 'Pagamento pendente',
    text: 'Pagamento pendente. Regularize a pendência e entre em contato com a administração para solicitar a liberação.',
  },
  {
    id: 'cadastro',
    label: 'Cadastro incompleto',
    text: 'Cadastro incompleto. Atualize os dados solicitados e aguarde a liberação pela administração.',
  },
  {
    id: 'vencido',
    label: 'Acesso vencido',
    text: 'O período de acesso venceu. Entre em contato com a administração para solicitar a renovação.',
  },
  {
    id: 'analise',
    label: 'Em análise',
    text: 'O acesso está temporariamente em análise pela administração. Aguarde novas orientações.',
  },
  {
    id: 'regras',
    label: 'Descumprimento das regras',
    text: 'Acesso suspenso por descumprimento das regras de uso. Entre em contato com a administração para mais informações.',
  },
  {
    id: 'outro',
    label: 'Outro motivo',
    text: '',
  },
] as const;

type Props = {
  open: boolean;
  routeLabel: string;
  customerName?: string;
  isSubmitting?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void | Promise<void>;
};

export function RouteRestrictionModal({
  open,
  routeLabel,
  customerName,
  isSubmitting = false,
  onClose,
  onConfirm,
}: Props) {
  const [presetId, setPresetId] = useState<string>(RESTRICTION_PRESETS[0].id);
  const [reason, setReason] = useState<string>(RESTRICTION_PRESETS[0].text);

  useEffect(() => {
    if (!open) return;
    setPresetId(RESTRICTION_PRESETS[0].id);
    setReason(RESTRICTION_PRESETS[0].text);
  }, [open, routeLabel, customerName]);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  const choosePreset = (id: string, text: string) => {
    setPresetId(id);
    setReason(text);
  };

  const cleanReason = reason.trim();

  const modal = (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-red-500/35 bg-[#0b1020] shadow-2xl shadow-black/60"
        role="dialog"
        aria-modal="true"
        aria-label={`Desativar acesso a ${routeLabel}`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/10 bg-red-950/20 px-5 py-4">
          <div className="flex min-w-0 gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-red-400/30 bg-red-500/10 text-red-300">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-red-300">Desativar acesso</p>
              <h3 className="mt-1 text-lg font-black text-white">Escolha o motivo que o cliente receberá</h3>
              <p className="mt-1 text-xs text-slate-400">
                Área: <strong className="text-slate-200">{routeLabel}</strong>
                {customerName ? <> · Cliente: <strong className="text-slate-200">{customerName}</strong></> : null}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[75vh] overflow-y-auto p-5">
          <p className="mb-3 text-sm font-bold text-slate-200">Motivos prontos</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {RESTRICTION_PRESETS.map((preset) => {
              const selected = presetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => choosePreset(preset.id, preset.text)}
                  className={`flex min-h-[54px] items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${selected ? 'border-red-400/70 bg-red-500/15 text-white' : 'border-slate-700 bg-slate-900/70 text-slate-300 hover:border-slate-500 hover:bg-slate-800'}`}
                >
                  <span className="text-sm font-bold">{preset.label}</span>
                  <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${selected ? 'border-red-300 bg-red-400 text-slate-950' : 'border-slate-600'}`}>
                    {selected ? <Check className="h-3.5 w-3.5 stroke-[3]" /> : null}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between gap-3">
              <label className="text-sm font-bold text-slate-200" htmlFor="route-restriction-reason">Mensagem que será exibida ao cliente</label>
              <span className="text-[11px] font-medium text-slate-500">{reason.length}/500</span>
            </div>
            <textarea
              id="route-restriction-reason"
              value={reason}
              onChange={(event) => {
                setReason(event.target.value.slice(0, 500));
                if (presetId !== 'outro') setPresetId('outro');
              }}
              rows={5}
              maxLength={500}
              placeholder="Digite o motivo da desativação..."
              className="w-full resize-y rounded-xl border border-slate-600 bg-slate-950 px-3 py-3 text-sm leading-6 text-white outline-none transition-colors placeholder:text-slate-600 focus:border-red-400"
            />
            <p className="mt-2 rounded-lg border border-cyan-400/15 bg-cyan-500/5 px-3 py-2 text-xs leading-5 text-cyan-100/75">
              Esse texto ficará salvo para esta área e será mostrado automaticamente ao cliente enquanto o acesso estiver bloqueado.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-white/10 bg-black/15 p-4 sm:px-5">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="h-11 rounded-xl border border-slate-600 bg-slate-800 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!cleanReason || isSubmitting}
            onClick={() => void onConfirm(cleanReason)}
            className="h-11 rounded-xl border border-red-400/50 bg-red-600 text-sm font-black text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSubmitting ? 'Salvando...' : 'Desativar acesso'}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
