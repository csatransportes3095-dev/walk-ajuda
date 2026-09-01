from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Trecho nao encontrado: {label}")
    return text.replace(old, new, 1)

# ProductManifestEditor agora trabalha com qualquer subproduto/acao/categoria.
p = Path("client/src/components/ProductManifestEditor.tsx")
p.write_text(r'''import { useEffect, useState } from "react";
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
''')

# API do manifesto: recebe chaves individuais em ordem de prioridade.
p = Path("client/src/lib/productManifest.ts")
p.write_text(r'''export type ProductManifestRequest = {
  manifestKeys: string[];
  actionKey: string;
  actionLabel: string;
  resolve: (accepted: boolean) => void;
};

export function requestProductManifest(manifestKeys: string[], actionKey: string, actionLabel: string): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    window.dispatchEvent(new CustomEvent<ProductManifestRequest>("h2:product-manifest-request", { detail: { manifestKeys, actionKey, actionLabel, resolve } }));
  });
}
''')

# Guard: procura primeiro o manifesto da categoria; se nao existir, usa o da acao/opcao.
p = Path("client/src/components/ProductManifestGuard.tsx")
s = p.read_text()
s = replace_once(s,
'''    const cfg = parse(current[`product_manifest_${req.productId}`]);
    if (!cfg) { req.resolve(true); return; }
    setChecked(false);
    setPending({ ...req, config: cfg });''',
'''    const cfg = req.manifestKeys.map(key => parse(current[key])).find(Boolean) || null;
    if (!cfg) { req.resolve(true); return; }
    setChecked(false);
    setPending({ ...req, config: cfg });''',
'guard por chave individual')
p.write_text(s)

# ADM: remover manifesto do produto principal e colocar em cada opcao e cada modelo/categoria.
p = Path("client/src/pages/AdminProducts.tsx")
s = p.read_text()
s = replace_once(s,
'''      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-[11px] text-gray-300"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Ativo para o cliente</label>
        <div className="flex gap-2">
          <Button type="button" size="sm" className="bg-cyan-600 hover:bg-cyan-500 text-white" disabled={updateMut.isPending} onClick={() => { const principal = principalPrice.trim(); const promotional = promotionalPrice.trim(); if (!label.trim() || (!principal && !promotional)) { toast.error('Informe categoria e pelo menos um valor.'); return; } updateMut.mutate({ id: model.id, optionId: model.optionId, label: label.trim(), price: promotional || principal, originalPrice: promotional ? principal : '', promoEndsAt: promotional && promoEndsAt ? new Date(promoEndsAt).getTime() : null, sortOrder: model.sortOrder, isActive: active }); }}><Save className="w-3 h-3 mr-1" /> Salvar</Button>
          <Button type="button" size="sm" variant="destructive" disabled={deleteMut.isPending} onClick={() => { if (confirm(`Excluir a categoria ${model.label}?`)) deleteMut.mutate({ id: model.id }); }}><Trash2 className="w-3 h-3" /></Button>
        </div>
      </div>''',
'''      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-[11px] text-gray-300"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Ativo para o cliente</label>
        <div className="flex gap-2">
          <Button type="button" size="sm" className="bg-cyan-600 hover:bg-cyan-500 text-white" disabled={updateMut.isPending} onClick={() => { const principal = principalPrice.trim(); const promotional = promotionalPrice.trim(); if (!label.trim() || (!principal && !promotional)) { toast.error('Informe categoria e pelo menos um valor.'); return; } updateMut.mutate({ id: model.id, optionId: model.optionId, label: label.trim(), price: promotional || principal, originalPrice: promotional ? principal : '', promoEndsAt: promotional && promoEndsAt ? new Date(promoEndsAt).getTime() : null, sortOrder: model.sortOrder, isActive: active }); }}><Save className="w-3 h-3 mr-1" /> Salvar</Button>
          <Button type="button" size="sm" variant="destructive" disabled={deleteMut.isPending} onClick={() => { if (confirm(`Excluir a categoria ${model.label}?`)) deleteMut.mutate({ id: model.id }); }}><Trash2 className="w-3 h-3" /></Button>
        </div>
      </div>
      <ProductManifestEditor storageKey={`price_model_manifest_${model.id}`} scopeLabel={`Modelo/Categoria: ${label || model.label}`} />''',
'manifesto por modelo/categoria')
s = replace_once(s,
'''        <div className="border-t border-gray-700/20 p-3 space-y-4">
          <OptionPriceModelsEditor optionId={opt.id} />''',
'''        <div className="border-t border-gray-700/20 p-3 space-y-4">
          <ProductManifestEditor storageKey={`option_manifest_${opt.id}`} scopeLabel={`Acao / Opcao: ${opt.label}`} />
          <OptionPriceModelsEditor optionId={opt.id} />''',
'manifesto por opcao')
s = replace_once(s,
'''                    <h4 className="text-sm font-bold text-purple-400">Editar Card</h4>
                    <ProductManifestEditor productId={product.id} />
                    <div>''',
'''                    <h4 className="text-sm font-bold text-purple-400">Editar Card</h4>
                    <div>''',
'remover manifesto produto principal')
p.write_text(s)

# Vitrine: categoria usa manifesto proprio, com fallback para a opcao. Sem categoria, usa manifesto da opcao.
p = Path("client/src/components/StorefrontProductCard.tsx")
s = p.read_text()
s = replace_once(s,
'''    const accepted = await requestProductManifest(item.product.id, key, nextModel?.label || item.option.label);''',
'''    const accepted = await requestProductManifest([`price_model_manifest_${nextId}`, `option_manifest_${item.option.id}`], key, nextModel?.label || item.option.label);''',
'selecao categoria manifesto individual')
s = replace_once(s,
'''      const accepted = await requestProductManifest(item.product.id, key, selectedPriceModel?.label || item.option.label);''',
'''      const manifestKeys = selectedPriceModel
        ? [`price_model_manifest_${selectedPriceModel.id}`, `option_manifest_${item.option.id}`]
        : [`option_manifest_${item.option.id}`];
      const accepted = await requestProductManifest(manifestKeys, key, selectedPriceModel?.label || item.option.label);''',
'acao checkout manifesto individual')
p.write_text(s)

# Teste de regressao.
Path("server/productManifestFlow.test.ts").write_text(r'''import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const admin = fs.readFileSync('client/src/pages/AdminProducts.tsx', 'utf8');
const editor = fs.readFileSync('client/src/components/ProductManifestEditor.tsx', 'utf8');
const guard = fs.readFileSync('client/src/components/ProductManifestGuard.tsx', 'utf8');
const card = fs.readFileSync('client/src/components/StorefrontProductCard.tsx', 'utf8');
const main = fs.readFileSync('client/src/main.tsx', 'utf8');

describe('manifesto individual por subproduto', () => {
  it('nao fica mais no produto principal', () => {
    expect(admin).not.toContain('ProductManifestEditor productId={product.id}');
    expect(admin).toContain('storageKey={`option_manifest_${opt.id}`}');
  });

  it('cada modelo/categoria tem seu proprio manifesto no ADM', () => {
    expect(admin).toContain('storageKey={`price_model_manifest_${model.id}`}');
    expect(editor).toContain('Individual deste item');
    expect(editor).toContain('storageKey');
  });

  it('cliente prioriza manifesto da categoria e usa opcao como fallback', () => {
    expect(main).toContain('<ProductManifestGuard />');
    expect(guard).toContain('req.manifestKeys.map');
    expect(card).toContain('price_model_manifest_${nextId}');
    expect(card).toContain('option_manifest_${item.option.id}');
    expect(card).toContain('runProtectedAction');
  });
});
''')
