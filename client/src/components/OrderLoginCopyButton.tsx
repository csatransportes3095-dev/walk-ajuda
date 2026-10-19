import { useState } from "react";
import { toast } from "sonner";

/** Clipboard button rendered by React itself, not by a DOM observer.
 * This prevents the button from disappearing after order status rerenders. */
export async function copyLoginText(value: string): Promise<boolean> {
  const clean = value.trim();
  if (!clean) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(clean);
      return true;
    }
  } catch { /* Fall back to browser selection for restrictive contexts. */ }

  const textarea = document.createElement("textarea");
  textarea.value = clean;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  try {
    textarea.focus();
    textarea.select();
    return document.execCommand("copy");
  } finally {
    textarea.remove();
  }
}

export function OrderLoginCopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      if (!await copyLoginText(value)) throw new Error("clipboard_unavailable");
      setCopied(true);
      toast.success(`${label} copiado.`);
      window.setTimeout(() => setCopied(false), 1300);
    } catch {
      toast.error(`Não foi possível copiar ${label.toLowerCase()}. Selecione o campo e pressione Ctrl+C.`);
    }
  };
  return (
    <button type="button" onClick={handleCopy} disabled={!value.trim()}
      aria-label={`Copiar ${label.toLowerCase()}`}
      className="shrink-0 rounded-lg border border-violet-400/40 bg-violet-500/10 px-2.5 py-1.5 text-[11px] font-bold text-violet-200 hover:bg-violet-500/20 disabled:opacity-40"
    >{copied ? "✓ Copiado" : "📋 Copiar"}</button>
  );
}
