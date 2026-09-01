import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

type ProductManifestConfig = {
  enabled: boolean;
  title: string;
  body: string;
  acceptLabel: string;
  buttonLabel: string;
};

const DEFAULT_CONFIG: ProductManifestConfig = {
  enabled: false,
  title: "Antes de continuar",
  body: "",
  acceptLabel: "Li, entendi e aceito as condicoes acima.",
  buttonLabel: "ACEITAR E CONTINUAR",
};

function parseConfig(raw: unknown): ProductManifestConfig {
  if (typeof raw !== "string" || !raw.trim()) return DEFAULT_CONFIG;
  try {
    const value = JSON.parse(raw);
    return {
      enabled: value?.enabled === true,
      title: String(value?.title || DEFAULT_CONFIG.title),
      body: String(value?.body || ""),
      acceptLabel: String(value?.acceptLabel || DEFAULT_CONFIG.acceptLabel),
      buttonLabel: String(value?.buttonLabel || DEFAULT_CONFIG.buttonLabel),
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

const inputStyle = { backgroundColor: "#fff", color: "#000", border: "2px solid #555", borderRadius: 8, padding: "8px 10px", width: "100%", fontSize: 12, fontWeight: 500 } as const;

export default function ProductManifestEditor({ storageKey, scopeLabel }: { storageKey: string; scopeLabel: string }) {
  const utils = trpc.useUtils();
  const { data: settings } = trpc.settings.getAll.useQuery();
  const [enabled, setEnabled] = useState(false);
  const [title, setTitle] = useState(DEFAULT_CONFIG.title);
  const [body, setBody] = useState("");
  const [acceptLabel, setAcceptLabel] = useState(DEFAULT_CONFIG.acceptLabel);
  const [buttonLabel, setButtonLabel] = useState(DEFAULT_CONFIG.buttonLabel);

  useEffect(() => {
    const cfg = parseConfig((settings as Record<string, string> | undefined)?.[storageKey]);
    setEnabled(cfg.enabled);
    setTitle(cfg.title);
    setBody(cfg.body);
    setAcceptLabel(cfg.acceptLabel);
    setButtonLabel(cfg.buttonLabel);
  }, [settings, storageKey]);

  const saveMut = trpc.settings.update.useMutation({
    onSuccess: () => {
      void utils.settings.getAll.invalidate();
      toast.success("Manifesto salvo!");
    },
  });

  const save = () => {
    if (enabled && !body.trim()) return toast.error("Digite o texto do manifesto antes de ativar.");
    if (!title.trim() || !acceptLabel.trim() || !buttonLabel.trim()) return toast.error("Preencha titulo, aceite e botao.");
    saveMut.mutate({ settings: { [storageKey]: JSON.stringify({ enabled, title: title.trim(), body: body.trim(), acceptLabel: acceptLabel.trim(), buttonLabel: buttonLabel.trim() }) } });
  };

  return (
    <details className="rounded-lg border border-amber-500/30 bg-amber-950/10">
      <summary className="cursor-pointer list-none px-3 py-2 text-[11px] font-black text-amber-300">
        MANIFESTO / TERMO DE ACEITE <span className="ml-2 font-semibold text-white/55">{scopeLabel}</span>
      </summary>
      <div className="space-y-3 border-t border-amber-500/20 p-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] text-gray-400">Individual deste item. Nao altera o produto principal nem os outros subprodutos.</p>
          <label className="flex items-center gap-2 text-xs font-bold text-white"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} /> Ativo</label>
        </div>
        <div><label className="text-[10px] text-amber-300 font-bold block mb-1">Titulo</label><input value={title} onChange={e => setTitle(e.target.value)} style={inputStyle} /></div>
        <div><label className="text-[10px] text-amber-300 font-bold block mb-1">Texto do manifesto</label><textarea value={body} onChange={e => setBody(e.target.value)} rows={6} style={{ ...inputStyle, resize: "vertical" }} placeholder="Digite as regras e condicoes deste item..." /></div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div><label className="text-[10px] text-amber-300 font-bold block mb-1">Frase do aceite</label><input value={acceptLabel} onChange={e => setAcceptLabel(e.target.value)} style={inputStyle} /></div>
          <div><label className="text-[10px] text-amber-300 font-bold block mb-1">Texto do botao</label><input value={buttonLabel} onChange={e => setButtonLabel(e.target.value)} style={inputStyle} /></div>
        </div>
        <Button type="button" onClick={save} disabled={saveMut.isPending} className="w-full bg-amber-500 hover:bg-amber-400 text-black font-black"><Save className="w-3 h-3 mr-1" /> Salvar Manifesto</Button>
      </div>
    </details>
  );
}
