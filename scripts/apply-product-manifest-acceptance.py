from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Trecho nao encontrado: {label}")
    return text.replace(old, new, 1)

# 1) Componente ADM: manifesto editavel por produto.
Path("client/src/components/ProductManifestEditor.tsx").write_text(r'''import { useEffect, useState } from "react";
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

export default function ProductManifestEditor({ productId }: { productId: number }) {
  const key = `product_manifest_${productId}`;
  const utils = trpc.useUtils();
  const { data: settings } = trpc.settings.getAll.useQuery();
  const [enabled, setEnabled] = useState(false);
  const [title, setTitle] = useState(DEFAULT_CONFIG.title);
  const [body, setBody] = useState("");
  const [acceptLabel, setAcceptLabel] = useState(DEFAULT_CONFIG.acceptLabel);
  const [buttonLabel, setButtonLabel] = useState(DEFAULT_CONFIG.buttonLabel);

  useEffect(() => {
    const cfg = parseConfig((settings as Record<string, string> | undefined)?.[key]);
    setEnabled(cfg.enabled);
    setTitle(cfg.title);
    setBody(cfg.body);
    setAcceptLabel(cfg.acceptLabel);
    setButtonLabel(cfg.buttonLabel);
  }, [settings, key]);

  const saveMut = trpc.settings.update.useMutation({
    onSuccess: () => {
      void utils.settings.getAll.invalidate();
      toast.success("Manifesto do produto salvo!");
    },
  });

  const save = () => {
    if (enabled && !body.trim()) return toast.error("Digite o texto do manifesto antes de ativar.");
    if (!title.trim() || !acceptLabel.trim() || !buttonLabel.trim()) return toast.error("Preencha titulo, aceite e botao.");
    saveMut.mutate({ settings: { [key]: JSON.stringify({ enabled, title: title.trim(), body: body.trim(), acceptLabel: acceptLabel.trim(), buttonLabel: buttonLabel.trim() }) } });
  };

  return (
    <div className="rounded-xl border-2 border-amber-500/30 bg-amber-950/10 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-black text-amber-300">MANIFESTO / TERMO DE ACEITE</p>
          <p className="text-[10px] text-gray-400">Editavel por produto. Quando ativo, o cliente precisa ler e aceitar antes de continuar.</p>
        </div>
        <label className="flex items-center gap-2 text-xs font-bold text-white"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} /> Ativo</label>
      </div>
      <div><label className="text-[10px] text-amber-300 font-bold block mb-1">Titulo</label><input value={title} onChange={e => setTitle(e.target.value)} style={inputStyle} /></div>
      <div><label className="text-[10px] text-amber-300 font-bold block mb-1">Texto do manifesto</label><textarea value={body} onChange={e => setBody(e.target.value)} rows={7} style={{ ...inputStyle, resize: "vertical" }} placeholder="Digite as regras e condicoes deste produto..." /></div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <div><label className="text-[10px] text-amber-300 font-bold block mb-1">Frase do aceite</label><input value={acceptLabel} onChange={e => setAcceptLabel(e.target.value)} style={inputStyle} /></div>
        <div><label className="text-[10px] text-amber-300 font-bold block mb-1">Texto do botao</label><input value={buttonLabel} onChange={e => setButtonLabel(e.target.value)} style={inputStyle} /></div>
      </div>
      <Button type="button" onClick={save} disabled={saveMut.isPending} className="w-full bg-amber-500 hover:bg-amber-400 text-black font-black"><Save className="w-3 h-3 mr-1" /> Salvar Manifesto</Button>
    </div>
  );
}
''')

# 2) API de solicitacao do manifesto.
Path("client/src/lib/productManifest.ts").write_text(r'''export type ProductManifestRequest = {
  productId: number;
  actionKey: string;
  actionLabel: string;
  resolve: (accepted: boolean) => void;
};

export function requestProductManifest(productId: number, actionKey: string, actionLabel: string): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    window.dispatchEvent(new CustomEvent<ProductManifestRequest>("h2:product-manifest-request", { detail: { productId, actionKey, actionLabel, resolve } }));
  });
}
''')

# 3) Guard global do cliente.
Path("client/src/components/ProductManifestGuard.tsx").write_text(r'''import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { trpc } from "@/lib/trpc";
import type { ProductManifestRequest } from "@/lib/productManifest";

type Config = { enabled: boolean; title: string; body: string; acceptLabel: string; buttonLabel: string };
type Pending = ProductManifestRequest & { config: Config };

function parse(raw: unknown): Config | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const v = JSON.parse(raw);
    if (v?.enabled !== true || !String(v?.body || "").trim()) return null;
    return {
      enabled: true,
      title: String(v?.title || "Antes de continuar"),
      body: String(v?.body || ""),
      acceptLabel: String(v?.acceptLabel || "Li, entendi e aceito as condicoes acima."),
      buttonLabel: String(v?.buttonLabel || "ACEITAR E CONTINUAR"),
    };
  } catch { return null; }
}

export default function ProductManifestGuard() {
  const { data: settings } = trpc.settings.getAll.useQuery(undefined, { staleTime: 0, refetchOnWindowFocus: true });
  const settingsRef = useRef(settings);
  const queueRef = useRef<ProductManifestRequest[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => { settingsRef.current = settings; }, [settings]);

  const process = (req: ProductManifestRequest) => {
    const current = settingsRef.current as Record<string, string> | undefined;
    if (!current) { queueRef.current.push(req); return; }
    const cfg = parse(current[`product_manifest_${req.productId}`]);
    if (!cfg) { req.resolve(true); return; }
    setChecked(false);
    setPending({ ...req, config: cfg });
  };

  useEffect(() => {
    if (!settings || queueRef.current.length === 0) return;
    const queued = [...queueRef.current];
    queueRef.current = [];
    queued.forEach(process);
  }, [settings]);

  useEffect(() => {
    const handler = (event: Event) => process((event as CustomEvent<ProductManifestRequest>).detail);
    window.addEventListener("h2:product-manifest-request", handler as EventListener);
    return () => window.removeEventListener("h2:product-manifest-request", handler as EventListener);
  }, []);

  const modal = useMemo(() => {
    if (!pending) return null;
    return (
      <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/90 p-4 backdrop-blur-md">
        <div className="w-full max-w-lg overflow-hidden rounded-2xl border-2 border-amber-400/60 bg-[#060914] text-white shadow-[0_30px_100px_rgba(0,0,0,.8)]">
          <div className="border-b border-amber-400/20 bg-amber-500/10 px-5 py-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-300">LEITURA OBRIGATORIA</p>
            <h3 className="mt-1 text-xl font-black">{pending.config.title}</h3>
            <p className="mt-2 text-xs font-semibold text-white/60">Selecionado: <span className="text-cyan-300">{pending.actionLabel}</span></p>
          </div>
          <div className="space-y-4 p-5">
            <div className="max-h-[45vh] overflow-y-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/30 p-4 text-sm leading-6 text-slate-200">{pending.config.body}</div>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-amber-400/25 bg-amber-400/5 p-3 text-sm font-semibold"><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} className="mt-1 h-4 w-4" /><span>{pending.config.acceptLabel}</span></label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => { pending.resolve(false); setPending(null); setChecked(false); }} className="rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-black text-white/80">VOLTAR</button>
              <button type="button" disabled={!checked} onClick={() => { pending.resolve(true); setPending(null); setChecked(false); }} className="rounded-xl bg-amber-500 px-4 py-3 text-sm font-black text-black disabled:cursor-not-allowed disabled:opacity-35">{pending.config.buttonLabel}</button>
            </div>
          </div>
        </div>
      </div>
    );
  }, [pending, checked]);

  return modal ? createPortal(modal, document.body) : null;
}
''')

# 4) AdminProducts: importar e renderizar editor dentro do produto.
p = Path("client/src/pages/AdminProducts.tsx")
s = p.read_text()
if 'ProductManifestEditor' not in s:
    s = replace_once(s, 'import AdminHeader from "@/components/AdminHeader";\n', 'import AdminHeader from "@/components/AdminHeader";\nimport ProductManifestEditor from "@/components/ProductManifestEditor";\n', 'import ProductManifestEditor')
    s = replace_once(s, '                    <h4 className="text-sm font-bold text-purple-400">Editar Card</h4>\n', '                    <h4 className="text-sm font-bold text-purple-400">Editar Card</h4>\n                    <ProductManifestEditor productId={product.id} />\n', 'render ProductManifestEditor')
p.write_text(s)

# 5) main: montar guard global.
p = Path("client/src/main.tsx")
s = p.read_text()
if 'ProductManifestGuard' not in s:
    s = replace_once(s, 'import QuestionBlockingManifestGuard from "./components/QuestionBlockingManifestGuard";\n', 'import QuestionBlockingManifestGuard from "./components/QuestionBlockingManifestGuard";\nimport ProductManifestGuard from "./components/ProductManifestGuard";\n', 'import ProductManifestGuard')
    s = replace_once(s, '      <QuestionBlockingManifestGuard />\n', '      <QuestionBlockingManifestGuard />\n      <ProductManifestGuard />\n', 'render ProductManifestGuard')
p.write_text(s)

# 6) Card: solicitar aceite ao selecionar categoria e antes de comprar/carrinho.
p = Path("client/src/components/StorefrontProductCard.tsx")
s = p.read_text()
if 'requestProductManifest' not in s:
    s = replace_once(s, 'import { useMemo, useState } from "react";\n', 'import { useMemo, useState } from "react";\nimport { requestProductManifest } from "@/lib/productManifest";\n', 'import requestProductManifest')
    s = replace_once(s, '  const [priceModelId, setPriceModelId] = useState<number | null>(null);\n', '  const [priceModelId, setPriceModelId] = useState<number | null>(null);\n  const [manifestAcceptedKey, setManifestAcceptedKey] = useState<string | null>(null);\n', 'manifestAcceptedKey')
    marker = '  const glassBackground = cardBackground\n    ? `linear-gradient(145deg, rgba(255,255,255,0.12) 0%, rgba(15,23,42,0.60) 42%, rgba(2,6,23,0.90) 100%), ${cardBackground}`\n    : "linear-gradient(145deg, rgba(30,41,59,0.72) 0%, rgba(8,15,32,0.88) 48%, rgba(2,6,23,0.96) 100%)";\n'
    addition = marker + '''\n  const handlePriceModelChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {\n    const select = event.currentTarget;\n    const previousId = priceModelId;\n    const nextId = select.value ? Number(select.value) : null;\n    if (!nextId) return;\n    const nextModel = priceModels.find(model => model.id === nextId);\n    const key = `price:${nextId}`;\n    const accepted = await requestProductManifest(item.product.id, key, nextModel?.label || item.option.label);\n    if (!accepted) { select.value = previousId ? String(previousId) : ""; return; }\n    setPriceModelId(nextId);\n    setManifestAcceptedKey(key);\n  };\n\n  const runProtectedAction = async (action: "buy" | "cart") => {\n    if (requiresPriceModelSelection && !selectedPriceModel) return;\n    const key = selectedPriceModel ? `price:${selectedPriceModel.id}` : `base:${item.option.id}`;\n    if (manifestAcceptedKey !== key) {\n      const accepted = await requestProductManifest(item.product.id, key, selectedPriceModel?.label || item.option.label);\n      if (!accepted) return;\n      setManifestAcceptedKey(key);\n    }\n    if (action === "buy") onBuy(selectedTier, selectedPriceModel);\n    else onAddToCart(selectedTier, selectedPriceModel);\n  };\n'''
    s = replace_once(s, marker, addition, 'handlers manifesto card')
    s = replace_once(s, '<select value={priceModelId ?? ""} onChange={(event) => setPriceModelId(event.target.value ? Number(event.target.value) : null)}', '<select value={priceModelId ?? ""} onChange={handlePriceModelChange}', 'select manifesto')
    s = replace_once(s, 'onClick={() => { if (!requiresPriceModelSelection || selectedPriceModel) onBuy(selectedTier, selectedPriceModel); }}', 'onClick={() => void runProtectedAction("buy")}', 'buy manifesto')
    s = replace_once(s, 'onClick={() => { if (!requiresPriceModelSelection || selectedPriceModel) onAddToCart(selectedTier, selectedPriceModel); }}', 'onClick={() => void runProtectedAction("cart")}', 'cart manifesto')
p.write_text(s)

# 7) Teste dirigido.
Path("server/productManifestFlow.test.ts").write_text(r'''import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const admin = fs.readFileSync('client/src/pages/AdminProducts.tsx', 'utf8');
const editor = fs.readFileSync('client/src/components/ProductManifestEditor.tsx', 'utf8');
const guard = fs.readFileSync('client/src/components/ProductManifestGuard.tsx', 'utf8');
const card = fs.readFileSync('client/src/components/StorefrontProductCard.tsx', 'utf8');
const main = fs.readFileSync('client/src/main.tsx', 'utf8');

describe('manifesto editavel por produto', () => {
  it('fica dentro do produto no ADM e salva configuracao individual', () => {
    expect(admin).toContain('ProductManifestEditor productId={product.id}');
    expect(editor).toContain('MANIFESTO / TERMO DE ACEITE');
    expect(editor).toContain('product_manifest_${productId}');
    expect(editor).toContain('Salvar Manifesto');
  });

  it('bloqueia cliente ate ler e aceitar', () => {
    expect(main).toContain('<ProductManifestGuard />');
    expect(guard).toContain('LEITURA OBRIGATORIA');
    expect(guard).toContain('disabled={!checked}');
    expect(card).toContain('requestProductManifest');
    expect(card).toContain('handlePriceModelChange');
    expect(card).toContain('runProtectedAction');
  });
});
''')
