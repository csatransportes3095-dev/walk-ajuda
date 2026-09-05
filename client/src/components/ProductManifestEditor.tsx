import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Save } from "lucide-react";
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
  acceptLabel: "Li, entendi e aceito as condições da garantia e todas as regras informadas.",
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
  const priceModelId = useMemo(() => {
    const match = storageKey.match(/^price_model_manifest_(\d+)$/);
    return match ? Number(match[1]) : null;
  }, [storageKey]);

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

  const movePriceModelMut = trpc.optionPriceModels.move.useMutation({
    onSuccess: async (result) => {
      await Promise.all([
        utils.optionPriceModels.list.invalidate(),
        utils.optionPriceModels.listActive.invalidate(),
        utils.products.list.invalidate(),
      ]);
      toast.success(result.moved ? "Posição atualizada!" : "Esta categoria já está no limite da lista.");
    },
    onError: (error) => toast.error(error.message || "Não foi possível alterar a posição."),
  });

  const save = () => {
    if (enabled && !body.trim()) return toast.error("Digite o texto do manifesto antes de ativar.");
    if (!title.trim() || !acceptLabel.trim() || !buttonLabel.trim()) return toast.error("Preencha título, aceite e botão.");
    saveMut.mutate({ settings: { [storageKey]: JSON.stringify({ enabled, title: title.trim(), body: body.trim(), acceptLabel: acceptLabel.trim(), buttonLabel: buttonLabel.trim() }) } });
  };

  return (
    <details className="rounded-lg border border-amber-500/30 bg-amber-950/10">
      <summary className="cursor-pointer list-none px-3 py-2 text-[11px] font-black text-amber-300">
        <span className="flex flex-wrap items-center justify-between gap-2">
          <span>MANIFESTO / TERMO DE ACEITE <span className="ml-2 font-semibold text-white/55">{scopeLabel}</span></span>
          {priceModelId && (
            <span className="flex items-center gap-1" onClick={(event) => { event.preventDefault(); event.stopPropagation(); }}>
              <button
                type="button"
                disabled={movePriceModelMut.isPending}
                onClick={() => movePriceModelMut.mutate({ id: priceModelId, direction: "up" })}
                className="inline-flex items-center gap-1 rounded-md border border-cyan-400/40 bg-cyan-500/10 px-2 py-1 text-[10px] font-black text-cyan-200 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                title="Mover esta categoria para cima"
              >
                <ChevronUp className="h-3 w-3" /> SUBIR
              </button>
              <button
                type="button"
                disabled={movePriceModelMut.isPending}
                onClick={() => movePriceModelMut.mutate({ id: priceModelId, direction: "down" })}
                className="inline-flex items-center gap-1 rounded-md border border-cyan-400/40 bg-cyan-500/10 px-2 py-1 text-[10px] font-black text-cyan-200 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                title="Mover esta categoria para baixo"
              >
                <ChevronDown className="h-3 w-3" /> DESCER
              </button>
            </span>
          )}
        </span>
      </summary>
      <div className="space-y-3 border-t border-amber-500/20 p-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] text-gray-400">Individual deste item. Não altera o produto principal nem os outros subprodutos.</p>
          <label className="flex items-center gap-2 text-xs font-bold text-white"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} /> Ativo</label>
        </div>
        <div><label className="text-[10px] text-amber-300 font-bold block mb-1">Título</label><input value={title} onChange={e => setTitle(e.target.value)} style={inputStyle} /></div>
        <div><label className="text-[10px] text-amber-300 font-bold block mb-1">Texto do manifesto</label><textarea value={body} onChange={e => setBody(e.target.value)} rows={6} style={{ ...inputStyle, resize: "vertical" }} placeholder="Digite as regras e condições deste item..." /></div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div><label className="text-[10px] text-amber-300 font-bold block mb-1">Frase de aceite</label><input value={acceptLabel} onChange={e => setAcceptLabel(e.target.value)} style={inputStyle} /></div>
          <div><label className="text-[10px] text-amber-300 font-bold block mb-1">Texto do botão</label><input value={buttonLabel} onChange={e => setButtonLabel(e.target.value)} style={inputStyle} /></div>
        </div>
        <Button type="button" onClick={save} disabled={saveMut.isPending} className="w-full bg-amber-500 hover:bg-amber-400 text-black font-black"><Save className="w-3 h-3 mr-1" /> Salvar Manifesto</Button>
      </div>
    </details>
  );
}
