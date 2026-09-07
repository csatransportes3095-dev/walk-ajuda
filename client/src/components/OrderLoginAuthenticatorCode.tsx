import { useEffect, useState } from "react";
import { Copy, Eye, EyeOff, KeyRound, LockKeyhole, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

function normalizeText(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function normalizeBase32(value: string) {
  return String(value || "")
    .toUpperCase()
    .replace(/[\s-]+/g, "")
    .replace(/=+$/g, "");
}

function setNativeInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (setter) setter.call(input, value);
  else input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function findB2CodeInput() {
  const labels = Array.from(document.querySelectorAll<HTMLLabelElement>("label"));
  const label = labels.find((item) => {
    const text = normalizeText(item.textContent);
    return text === "CODIGO AUTENTICADOR" || text.startsWith("CODIGO AUTENTICADOR ");
  });
  if (!label) return null;

  let node: HTMLElement | null = label.parentElement;
  for (let depth = 0; node && depth < 5; depth += 1, node = node.parentElement) {
    const input = node.querySelector<HTMLInputElement>('input[type="text"], input:not([type])');
    if (input) return input;
  }
  return null;
}

export function OrderLoginAuthenticatorCode({ registrationId }: { registrationId: number }) {
  const utils = trpc.useUtils();
  const [isPageVisible, setIsPageVisible] = useState(() => typeof document === "undefined" ? true : !document.hidden);
  const [copiedEntryId, setCopiedEntryId] = useState<number | null>(null);
  const [issuer, setIssuer] = useState("");
  const [secret, setSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);

  const codeQuery = trpc.adminAuthenticator.getCodeForOrder.useQuery(
    { registrationId },
    { enabled: isPageVisible, staleTime: 0, gcTime: 0, refetchInterval: isPageVisible ? 5000 : false },
  );

  const createForOrder = trpc.adminAuthenticator.createForOrder.useMutation({
    onSuccess: async (result) => {
      setIssuer("");
      setSecret("");
      const b2 = findB2CodeInput();
      if (b2 && b2.value) setNativeInputValue(b2, "");
      setShowSecret(false);
      await utils.adminAuthenticator.getCodeForOrder.invalidate({ registrationId });
      await codeQuery.refetch();
      toast.success(`${result.label} criado e vinculado ao pedido.`);
    },
    onError: (error) => toast.error(error.message || "Não foi possível criar o autenticador neste pedido."),
  });

  const deleteEntry = trpc.adminAuthenticator.delete.useMutation({
    onSuccess: async () => {
      await utils.adminAuthenticator.getCodeForOrder.invalidate({ registrationId });
      await codeQuery.refetch();
      toast.success("Autenticador excluído.");
    },
    onError: (error) => toast.error(error.message || "Não foi possível excluir o autenticador."),
  });

  useEffect(() => {
    const onVisibilityChange = () => setIsPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  useEffect(() => {
    setSecret("");

    let boundInput: HTMLInputElement | null = null;
    let onB2Input: (() => void) | null = null;
    let initialized = false;

    const bind = () => {
      const b2 = findB2CodeInput();
      if (!b2) return;
      if (boundInput === b2) return;

      if (boundInput && onB2Input) boundInput.removeEventListener("input", onB2Input);
      boundInput = b2;

      // Cada abertura do pedido começa com os dois campos vazios.
      if (!initialized) {
        initialized = true;
        if (b2.value) setNativeInputValue(b2, "");
        setSecret("");
      }

      onB2Input = () => {
        const clean = normalizeBase32(b2.value);
        if (b2.value !== clean) {
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
          if (setter) setter.call(b2, clean);
          else b2.value = clean;
        }
        setSecret(clean);
      };
      b2.addEventListener("input", onB2Input);
    };

    bind();
    const observer = new MutationObserver(bind);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (boundInput && onB2Input) boundInput.removeEventListener("input", onB2Input);
    };
  }, [registrationId]);

  const syncSecretToB2 = (rawValue: string) => {
    const clean = normalizeBase32(rawValue);
    setSecret(clean);
    const b2 = findB2CodeInput();
    if (b2 && b2.value !== clean) setNativeInputValue(b2, clean);
  };

  const copy = async (entryId: number, code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedEntryId(entryId);
      toast.success("Código copiado.");
      window.setTimeout(() => setCopiedEntryId(null), 1600);
    } catch {
      toast.error("Não foi possível copiar o código.");
    }
  };

  const remove = (entryId: number) => {
    if (!window.confirm("Excluir este autenticador deste pedido?")) return;
    deleteEntry.mutate({ id: entryId });
  };

  const create = () => {
    if (!secret.trim()) {
      toast.error("Cole a chave secreta Base32 do autenticador.");
      return;
    }
    createForOrder.mutate({ registrationId, issuer: issuer.trim() || undefined, secret: secret.trim() });
  };

  return (
    <section className="rounded-xl border border-cyan-300/30 bg-cyan-400/[0.07] p-3">
      <div className="flex items-start gap-2">
        <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-cyan-200" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black text-cyan-100">AUTENTICADOR PRIVADO DO ADM</p>
          <p className="mt-0.5 text-[11px] text-cyan-100/70">Cole somente a chave real deste pedido. Ela fica cifrada e nunca é mostrada ao cliente nem entra no WhatsApp.</p>
        </div>
      </div>

      {codeQuery.data?.length ? (
        <div className="mt-3 space-y-2">
          {codeQuery.data.map((entry) => (
            <div key={entry.entryId} className="flex w-full items-center gap-2 rounded-lg border border-cyan-300/20 bg-slate-950/70 px-3 py-2">
              <button type="button" onClick={() => entry.code && copy(entry.entryId, entry.code)} disabled={!entry.code} className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left hover:opacity-90 disabled:cursor-default">
                <span className="min-w-0"><span className="block truncate text-xs font-bold text-slate-100">{entry.label}</span><span className="block truncate text-[10px] text-slate-400">{entry.issuer || "Conta vinculada a este pedido"}</span></span>
                {entry.code ? <span className="flex shrink-0 items-center gap-2 font-mono text-xl font-black tracking-[0.18em] text-cyan-100"><span>{entry.code}</span><Copy className="h-4 w-4 text-cyan-300" />{copiedEntryId === entry.entryId && <span className="text-[10px] font-sans tracking-normal text-emerald-300">Copiado</span>}</span> : <span className="text-xs text-red-300">Erro ao gerar</span>}
              </button>
              <button type="button" onClick={() => remove(entry.entryId)} disabled={deleteEntry.isPending} title="Excluir autenticador" className="shrink-0 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-red-300 hover:bg-red-500/20 disabled:opacity-40"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-[11px] text-slate-400">Nenhum autenticador vinculado a este pedido.</p>
      )}

      <div className="mt-3 rounded-lg border border-cyan-300/15 bg-slate-950/60 p-3">
        <div className="mb-2 flex items-center gap-2"><Plus className="h-3.5 w-3.5 text-cyan-300" /><p className="text-[11px] font-black text-cyan-100">CRIAR DIRETO NESTE PEDIDO</p></div>
        <div className="grid gap-2 md:grid-cols-2">
          <label className="space-y-1"><span className="text-[10px] font-semibold text-slate-400">Emissor — opcional</span><input value={issuer} onChange={(event) => setIssuer(event.target.value)} maxLength={128} placeholder="Ex.: Uber" autoComplete="off" className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white outline-none focus:border-cyan-300/50" /></label>
          <label className="space-y-1 md:col-span-2"><span className="text-[10px] font-semibold text-slate-400">Chave secreta Base32</span><div className="flex rounded-lg border border-white/10 bg-black/30 focus-within:border-cyan-300/50"><input value={secret} onChange={(event) => syncSecretToB2(event.target.value)} type={showSecret ? "text" : "password"} autoComplete="new-password" spellCheck={false} placeholder="Cole a chave do Google Authenticator" className="min-w-0 flex-1 bg-transparent px-3 py-2 font-mono text-xs text-white outline-none" /><button type="button" onClick={() => setShowSecret((value) => !value)} className="px-3 text-slate-400 hover:text-white" aria-label={showSecret ? "Ocultar chave" : "Mostrar chave"}>{showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></label>
        </div>
        <button type="button" onClick={create} disabled={createForOrder.isPending} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-cyan-300 px-3 py-2 text-[11px] font-black text-slate-950 hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"><KeyRound className="h-3.5 w-3.5" />{createForOrder.isPending ? "Criando e vinculando..." : "Criar e vincular"}</button>
        <p className="mt-2 text-[10px] leading-4 text-slate-500">Os dois campos começam limpos. Cole a chave aqui ou no Código Autenticador: ambos são preenchidos juntos e o QR é gerado automaticamente.</p>
      </div>
    </section>
  );
}
