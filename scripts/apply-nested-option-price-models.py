from pathlib import Path
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f"anchor not found: {label}")
    return text.replace(old, new, 1)

# 1) Wire the nested price-model router.
path = Path('server/routers.ts')
src = path.read_text(encoding='utf-8')
src = replace_once(
    src,
    'import { adCampaignsRouter } from "./routers/adCampaigns";',
    'import { adCampaignsRouter } from "./routers/adCampaigns";\nimport { optionPriceModelsRouter } from "./routers/optionPriceModels";',
    'router import',
)
src = replace_once(
    src,
    'export const appRouter = router({\n  system: systemRouter,',
    'export const appRouter = router({\n  system: systemRouter,\n  optionPriceModels: optionPriceModelsRouter,',
    'router registration',
)
path.write_text(src, encoding='utf-8')

# 2) Complete the canonical vehicle catalog with the exact list supplied by the user.
Path('shared/vehicleCatalog.ts').write_text(r'''export type VehicleQuestionKind = 'brand' | 'model' | 'year' | 'color' | null;

export const VEHICLE_MODELS: Record<string, string[]> = {
  VOLKSWAGEN: ['GOL', 'VOYAGE', 'POLO', 'VIRTUS', 'FOX', 'SPACEFOX', 'JETTA', 'T-CROSS', 'NIVUS', 'TAOS'],
  FIAT: ['MOBI', 'UNO', 'ARGO', 'CRONOS', 'GRAND SIENA', 'SIENA', 'PULSE', 'FASTBACK', 'TIPO'],
  CHEVROLET: ['ONIX', 'ONIX PLUS', 'PRISMA', 'COBALT', 'SPIN', 'CRUZE', 'TRACKER', 'JOY', 'JOY PLUS', 'EQUINOX'],
  HYUNDAI: ['HB20', 'HB20S', 'HB20X', 'CRETA', 'ELANTRA', 'I30', 'TUCSON', 'IX35', 'AZERA'],
  TOYOTA: ['ETIOS', 'ETIOS SEDAN', 'YARIS', 'YARIS SEDAN', 'COROLLA', 'COROLLA CROSS', 'PRIUS', 'RAV4'],
  RENAULT: ['KWID', 'SANDERO', 'LOGAN', 'DUSTER', 'CAPTUR', 'FLUENCE', 'KARDIAN'],
  NISSAN: ['MARCH', 'VERSA', 'V-DRIVE', 'SENTRA', 'KICKS', 'LEAF'],
  HONDA: ['FIT', 'CITY', 'CIVIC', 'HR-V', 'WR-V', 'ACCORD'],
  JEEP: ['RENEGADE', 'COMPASS', 'COMMANDER'],
  BYD: ['DOLPHIN MINI', 'DOLPHIN', 'DOLPHIN GS', 'KING', 'YUAN PLUS', 'SONG PLUS', 'SEAL'],
  'CAOA CHERY': ['ARRIZO 5', 'ARRIZO 5E', 'ARRIZO 6', 'TIGGO 2', 'TIGGO 3X', 'TIGGO 5X', 'TIGGO 7', 'TIGGO 8'],
  GWM: ['ORA 03', 'HAVAL H6', 'HAVAL H6 HEV', 'HAVAL H6 PHEV'],
  'CITROËN': ['C3', 'C3 AIRCROSS', 'C4 LOUNGE', 'C4 CACTUS', 'AIRCROSS'],
  PEUGEOT: ['208', '2008', '308', '408'],
  FORD: ['KA', 'KA SEDAN', 'FIESTA', 'FOCUS', 'FOCUS SEDAN', 'ECOSPORT', 'FUSION', 'TERRITORY'],
  KIA: ['RIO', 'CERATO', 'SOUL', 'SPORTAGE', 'STONIC', 'NIRO'],
  MITSUBISHI: ['LANCER', 'ASX', 'ECLIPSE CROSS', 'OUTLANDER'],
  'JAC MOTORS': ['T40', 'T50', 'T60', 'E-JS1', 'E-JS4', 'IEV20', 'IEV40'],
  GEELY: ['EX2', 'EX5'],
};

export const VEHICLE_BRANDS = Object.keys(VEHICLE_MODELS);
export const VEHICLE_YEARS = Array.from({ length: 11 }, (_, index) => String(2026 - index));
export const VEHICLE_COLORS = ['BRANCO', 'PRETO', 'PRATA', 'CINZA', 'VERMELHO', 'AZUL', 'VERDE', 'AMARELO', 'MARROM', 'BEGE', 'OUTRA'];

const normalize = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toUpperCase();

const VEHICLE_BRAND_ALIASES: Record<string, string> = {
  CITROEN: 'CITROËN',
  CHERY: 'CAOA CHERY',
  JAC: 'JAC MOTORS',
};

export function getVehicleQuestionKind(question: string): VehicleQuestionKind {
  const q = normalize(question);
  if (q.includes('QUAL A MARCA') || q === 'MARCA' || q.includes('MARCA DO VEICULO')) return 'brand';
  if (q.includes('MODELO DO VEICULO') || q.includes('QUAL MODELO') || q === 'MODELO') return 'model';
  if (q.includes('QUAL E O ANO') || q.includes('ANO DO VEICULO') || q === 'ANO') return 'year';
  if (q.includes('QUAL E A COR') || q.includes('COR DO VEICULO') || q === 'COR') return 'color';
  return null;
}

export function getVehicleModels(brand: string): string[] {
  const normalized = normalize(brand);
  const alias = VEHICLE_BRAND_ALIASES[normalized];
  const key = alias ?? Object.keys(VEHICLE_MODELS).find(item => normalize(item) === normalized);
  return key ? VEHICLE_MODELS[key] : [];
}
''', encoding='utf-8')

# Keep the recovery helper aligned so a future rebuild cannot regress the brand list.
path = Path('scripts/rebuild-question-tree.mjs')
src = path.read_text(encoding='utf-8')
src = re.sub(
    r'const brands = \[[\s\S]*?\];\nconst colors =',
    '''const brands = [\n  "VOLKSWAGEN", "FIAT", "CHEVROLET", "HYUNDAI", "TOYOTA", "RENAULT",\n  "NISSAN", "HONDA", "JEEP", "BYD", "CAOA CHERY", "GWM", "CITROËN",\n  "PEUGEOT", "FORD", "KIA", "MITSUBISHI", "JAC MOTORS", "GEELY",\n];\nconst colors =''',
    src,
    count=1,
)
path.write_text(src, encoding='utf-8')

# 3) Admin editor: price categories live INSIDE one existing option.
path = Path('client/src/pages/AdminProducts.tsx')
src = path.read_text(encoding='utf-8')
editor = r'''
type OptionPriceModelType = {
  id: number; optionId: number; label: string; price: string; originalPrice: string | null;
  promoEndsAt: number | null; sortOrder: number; isActive: number;
};

function OptionPriceModelRow({ model, onChanged }: { model: OptionPriceModelType; onChanged: () => void }) {
  const [label, setLabel] = useState(model.label);
  const [price, setPrice] = useState(model.price);
  const [originalPrice, setOriginalPrice] = useState(model.originalPrice || '');
  const [promoEndsAt, setPromoEndsAt] = useState(model.promoEndsAt ? new Date(model.promoEndsAt).toISOString().slice(0, 16) : '');
  const [active, setActive] = useState(model.isActive === 1);
  const updateMut = trpc.optionPriceModels.update.useMutation({ onSuccess: onChanged });
  const deleteMut = trpc.optionPriceModels.delete.useMutation({ onSuccess: onChanged });

  return (
    <div className="rounded-lg border border-cyan-500/20 bg-black/30 p-3 space-y-2">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
        <div><label className="text-[10px] text-cyan-300 block mb-1">Modelo / Categoria</label><input value={label} onChange={e => setLabel(e.target.value)} style={{ ...whiteInputStyle, fontSize: '12px', padding: '6px 10px' }} /></div>
        <div><label className="text-[10px] text-orange-300 block mb-1">Valor Principal</label><input value={originalPrice} onChange={e => setOriginalPrice(e.target.value)} style={{ ...whiteInputStyle, fontSize: '12px', padding: '6px 10px' }} placeholder="Ex: 150,00" /></div>
        <div><label className="text-[10px] text-green-300 block mb-1">Valor Promocional</label><input value={price} onChange={e => setPrice(e.target.value)} style={{ ...whiteInputStyle, fontSize: '12px', padding: '6px 10px' }} placeholder="Ex: 100,00" /></div>
        <div><label className="text-[10px] text-red-300 block mb-1">Fim da promoção</label><input type="datetime-local" value={promoEndsAt} onChange={e => setPromoEndsAt(e.target.value)} style={{ ...whiteInputStyle, fontSize: '12px', padding: '6px 10px' }} /></div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-[11px] text-gray-300"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Ativo para o cliente</label>
        <div className="flex gap-2">
          <Button type="button" size="sm" className="bg-cyan-600 hover:bg-cyan-500 text-white" disabled={updateMut.isPending} onClick={() => updateMut.mutate({ id: model.id, optionId: model.optionId, label: label.trim(), price: price.trim(), originalPrice: originalPrice.trim(), promoEndsAt: promoEndsAt ? new Date(promoEndsAt).getTime() : null, sortOrder: model.sortOrder, isActive: active })}><Save className="w-3 h-3 mr-1" /> Salvar</Button>
          <Button type="button" size="sm" variant="destructive" disabled={deleteMut.isPending} onClick={() => { if (confirm(`Excluir a categoria ${model.label}?`)) deleteMut.mutate({ id: model.id }); }}><Trash2 className="w-3 h-3" /></Button>
        </div>
      </div>
    </div>
  );
}

function OptionPriceModelsEditor({ optionId }: { optionId: number }) {
  const utils = trpc.useUtils();
  const query = trpc.optionPriceModels.list.useQuery({ optionId });
  const [newLabel, setNewLabel] = useState('');
  const [newOriginalPrice, setNewOriginalPrice] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newPromoEndsAt, setNewPromoEndsAt] = useState('');
  const refresh = () => { utils.optionPriceModels.list.invalidate({ optionId }); utils.products.list.invalidate(); };
  const createMut = trpc.optionPriceModels.create.useMutation({ onSuccess: () => { setNewLabel(''); setNewOriginalPrice(''); setNewPrice(''); setNewPromoEndsAt(''); refresh(); toast.success('Categoria de preço criada!'); } });
  const models = (query.data || []) as OptionPriceModelType[];

  return (
    <div className="rounded-xl border-2 border-cyan-500/30 bg-cyan-950/10 p-3 space-y-3">
      <div>
        <p className="text-sm font-black text-cyan-300">MODELOS / CATEGORIAS DE PREÇO</p>
        <p className="text-[10px] text-gray-400">Ficam dentro desta Opção de Compra. Não criam outro produto e não duplicam perguntas ou documentos.</p>
      </div>
      {query.isLoading ? <div className="text-xs text-gray-400 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Carregando...</div> : models.length > 0 ? (
        <div className="space-y-2">{models.map(model => <OptionPriceModelRow key={model.id} model={model} onChanged={refresh} />)}</div>
      ) : <p className="text-xs text-gray-500">Nenhuma categoria cadastrada. O preço base da opção continua funcionando normalmente.</p>}
      <div className="rounded-lg border border-dashed border-cyan-500/30 p-3">
        <p className="text-[11px] font-bold text-cyan-300 mb-2">+ Adicionar categoria de preço</p>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
          <input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="Ex: SÓ PARA BLOCO" style={{ ...whiteInputStyle, fontSize: '12px', padding: '6px 10px' }} />
          <input value={newOriginalPrice} onChange={e => setNewOriginalPrice(e.target.value)} placeholder="Principal: 150,00" style={{ ...whiteInputStyle, fontSize: '12px', padding: '6px 10px' }} />
          <input value={newPrice} onChange={e => setNewPrice(e.target.value)} placeholder="Promocional: 100,00" style={{ ...whiteInputStyle, fontSize: '12px', padding: '6px 10px' }} />
          <input type="datetime-local" value={newPromoEndsAt} onChange={e => setNewPromoEndsAt(e.target.value)} style={{ ...whiteInputStyle, fontSize: '12px', padding: '6px 10px' }} />
        </div>
        <Button type="button" className="mt-2 w-full bg-cyan-600 hover:bg-cyan-500 text-white" disabled={createMut.isPending} onClick={() => { if (!newLabel.trim() || !newPrice.trim()) { toast.error('Informe categoria e valor.'); return; } createMut.mutate({ optionId, label: newLabel.trim(), price: newPrice.trim(), originalPrice: newOriginalPrice.trim(), promoEndsAt: newPromoEndsAt ? new Date(newPromoEndsAt).getTime() : null, sortOrder: models.length, isActive: true }); }}><Plus className="w-3 h-3 mr-1" /> Adicionar categoria</Button>
      </div>
    </div>
  );
}

'''
src = replace_once(src, '// Componente completo para cada opção: documentos dinâmicos + perguntas\n', editor + '// Componente completo para cada opção: documentos dinâmicos + perguntas\n', 'admin editor component')
src = replace_once(
    src,
    '          {/* === CONFIGURAÇÕES GERAIS DA OPÇÃO === */}\n          <div className="p-3 bg-black/40 rounded-lg border border-green-500/20 space-y-3">',
    '          <OptionPriceModelsEditor optionId={opt.id} />\n\n          {/* === CONFIGURAÇÕES GERAIS DA OPÇÃO === */}\n          <div className="p-3 bg-black/40 rounded-lg border border-green-500/20 space-y-3">',
    'admin editor render',
)
# Undo the misleading wording introduced in the previous production change. Existing option is NOT a version.
src = src.replace('Modelo / Versão</label><input value={newOptLabel}', 'Nome da Opção</label><input value={newOptLabel}')
src = src.replace('Cada opção funciona como uma versão do mesmo produto. Ela mantém preço, promoção, documentos, perguntas e garantia próprios.', 'Cada opção de compra é independente. Dentro dela você pode cadastrar várias categorias de preço acima.')
src = src.replace('Preencha a versão e o valor principal', 'Preencha o nome da opção e o valor principal')
path.write_text(src, encoding='utf-8')

# 4) Storefront card: choose one nested category before checkout/cart.
path = Path('client/src/components/StorefrontProductCard.tsx')
src = path.read_text(encoding='utf-8')
src = replace_once(src, 'export type StorefrontOption = {', "export type StorefrontPriceModel = { id: number; optionId: number; label: string; price: string; originalPrice: string | null; promoEndsAt?: number | null; sortOrder: number; isActive: number; };\n\nexport type StorefrontOption = {", 'storefront model type')
src = replace_once(src, '  promoEndsAt?: number | null;\n  questions:', '  promoEndsAt?: number | null;\n  priceModels?: StorefrontPriceModel[];\n  questions:', 'storefront option models')
src = replace_once(src, '  onBuy: (tier: StorefrontWarrantyTier | null) => void;\n  onAddToCart: (tier: StorefrontWarrantyTier | null) => void;', '  onBuy: (tier: StorefrontWarrantyTier | null, priceModel: StorefrontPriceModel | null) => void;\n  onAddToCart: (tier: StorefrontWarrantyTier | null, priceModel: StorefrontPriceModel | null) => void;', 'storefront callbacks')
src = replace_once(src, '  const selectedTier = tiers.find((tier) => tier.id === tierId) || null;\n  const effectivePrice = selectedTier?.price || item.option.price;\n  const effectiveOriginalPrice = selectedTier?.originalPrice || item.option.originalPrice;', "  const selectedTier = tiers.find((tier) => tier.id === tierId) || null;\n  const priceModels = item.option.priceModels || [];\n  const [priceModelId, setPriceModelId] = useState<number | null>(priceModels[0]?.id ?? null);\n  const selectedPriceModel = priceModels.find((model) => model.id === priceModelId) || null;\n  const effectivePrice = selectedPriceModel?.price || selectedTier?.price || item.option.price;\n  const effectiveOriginalPrice = selectedPriceModel?.originalPrice || selectedTier?.originalPrice || item.option.originalPrice;", 'storefront effective price')
src = replace_once(src, '        {tiers.length > 0 && (', '''        {priceModels.length > 0 && (
          <label className="mt-4 block">
            <span className="mb-1.5 block text-xs font-bold text-cyan-200">Modelo / categoria</span>
            <select value={priceModelId ?? ""} onChange={(event) => setPriceModelId(Number(event.target.value))} className="w-full rounded-xl border border-cyan-300/30 bg-slate-950/55 px-3 py-2.5 text-sm font-black text-white outline-none focus:border-cyan-300">
              {priceModels.map(model => <option key={model.id} value={model.id}>{model.label} — {asMoney(model.price)}</option>)}
            </select>
          </label>
        )}

        {tiers.length > 0 && (''', 'storefront model selector')
src = src.replace('onClick={() => onBuy(selectedTier)}', 'onClick={() => onBuy(selectedTier, selectedPriceModel)}')
src = src.replace('onClick={() => onAddToCart(selectedTier)}', 'onClick={() => onAddToCart(selectedTier, selectedPriceModel)}')
path.write_text(src, encoding='utf-8')

# 5) Home: attach models to options, preserve selection through checkout, cart and order name/price.
path = Path('client/src/pages/Home.tsx')
src = path.read_text(encoding='utf-8')
src = replace_once(src, 'type ProductOption = {', "type OptionPriceModel = { id: number; optionId: number; label: string; price: string; originalPrice: string | null; promoEndsAt?: number | null; sortOrder: number; isActive: number; };\n\ntype ProductOption = {", 'home model type')
src = replace_once(src, '  promoEndsAt?: number | null;\n  cardBorderColor?', '  promoEndsAt?: number | null;\n  priceModels?: OptionPriceModel[];\n  cardBorderColor?', 'home option model list')
src = replace_once(src, 'type CartItem = {\n  id: string; // unique key\n  product: Product;\n  option: ProductOption | null;\n};', 'type CartItem = {\n  id: string; // unique key\n  product: Product;\n  option: ProductOption | null;\n  priceModel: OptionPriceModel | null;\n};', 'cart item type')
src = replace_once(src, '  const products = rawProducts as unknown as Product[] | undefined;\n  const { data: settings }', '''  const baseProducts = rawProducts as unknown as Product[] | undefined;
  const optionIds = useMemo(() => (baseProducts || []).flatMap(product => product.options.map(option => option.id)), [baseProducts]);
  const { data: activeOptionPriceModels = [] } = trpc.optionPriceModels.listActive.useQuery(
    { optionIds },
    { enabled: optionIds.length > 0, staleTime: 30_000, refetchOnWindowFocus: true }
  );
  const products = useMemo(() => {
    if (!baseProducts) return undefined;
    const byOption = new Map<number, OptionPriceModel[]>();
    (activeOptionPriceModels as OptionPriceModel[]).forEach(model => {
      const list = byOption.get(model.optionId) || [];
      list.push(model);
      byOption.set(model.optionId, list);
    });
    return baseProducts.map(product => ({
      ...product,
      options: product.options.map(option => ({ ...option, priceModels: byOption.get(option.id) || [] })),
    }));
  }, [baseProducts, activeOptionPriceModels]);
  const { data: settings }''', 'home price model query')
src = replace_once(src, '  const [selectedOption, setSelectedOption] = useState<ProductOption | null>(null);\n  const [selectedProduct', '  const [selectedOption, setSelectedOption] = useState<ProductOption | null>(null);\n  const [selectedPriceModel, setSelectedPriceModel] = useState<OptionPriceModel | null>(null);\n  const [selectedProduct', 'home selected model state')
src = replace_once(src, '      optionId: selectedOption?.id ?? null,\n      questionAnswers,', '      optionId: selectedOption?.id ?? null,\n      priceModelId: selectedPriceModel?.id ?? null,\n      questionAnswers,', 'save model progress')
src = replace_once(src, '        if (opt) setSelectedOption(opt);\n      }\n      if (saved.questionAnswers)', '        if (opt) {\n          setSelectedOption(opt);\n          if (saved.priceModelId) setSelectedPriceModel(opt.priceModels?.find(model => model.id === saved.priceModelId) || null);\n        }\n      }\n      if (saved.questionAnswers)', 'restore model progress')
src = replace_once(src, '  const addToCart = (product: Product, option: ProductOption | null) => {\n    const id = `${product.id}-${option?.id ?? \'none\'}-${Date.now()}`;\n    setCart(prev => [...prev, { id, product, option }]);', '  const addToCart = (product: Product, option: ProductOption | null, priceModel: OptionPriceModel | null = null) => {\n    const id = `${product.id}-${option?.id ?? \'none\'}-${priceModel?.id ?? \'base\'}-${Date.now()}`;\n    setCart(prev => [...prev, { id, product, option, priceModel }]);', 'cart add model')
src = replace_once(src, '    setSelectedOption(first.option);\n    // Limpar uploads anteriores', '    setSelectedOption(first.option);\n    setSelectedPriceModel(first.priceModel);\n    // Limpar uploads anteriores', 'cart checkout model')
src = replace_once(src, '  const startDirectOptionCheckout = (product: Product, option: ProductOption, tier: WarrantyTier | null = null) => {', '  const startDirectOptionCheckout = (product: Product, option: ProductOption, tier: WarrantyTier | null = null, priceModel: OptionPriceModel | null = null) => {', 'direct checkout signature')
src = replace_once(src, '    setSelectedOption(option);\n    setSelectedTier(tier);', '    setSelectedOption(option);\n    setSelectedTier(tier);\n    setSelectedPriceModel(priceModel);', 'direct checkout selected model')
src = replace_once(src, '    if (selectedTier) return selectedTier.price;\n    if (selectedOption) return selectedOption.price;', '    if (selectedPriceModel) return selectedPriceModel.price;\n    if (selectedTier) return selectedTier.price;\n    if (selectedOption) return selectedOption.price;', 'current service model price')
src = replace_once(src, '    // Se tem tier selecionado, verifica se o tier tem promoção\n    if (selectedTier)', '    if (selectedPriceModel) return !!selectedPriceModel.originalPrice;\n    // Se tem tier selecionado, verifica se o tier tem promoção\n    if (selectedTier)', 'active model promotion')
src = replace_once(src, '      const nameOptionWithTier = selectedOption\n        ? (selectedTier', '      const optionNameWithModel = selectedOption ? `${selectedOption.label}${selectedPriceModel ? ` — ${selectedPriceModel.label}` : \'\'}` : \'N/A\';\n      const nameOptionWithTier = selectedOption\n        ? (selectedTier', 'submit option name model setup')
src = src.replace('          ? `${selectedOption.label} - Garantia:', '          ? `${optionNameWithModel} - Garantia:', 1)
src = src.replace('          : selectedOption.label)\n        : \'N/A\';', '          : optionNameWithModel)\n        : \'N/A\';', 1)
src = replace_once(src, "          const price = item.option?.price || '0';", "          const price = item.priceModel?.price || item.option?.price || '0';", 'cart total model')
src = replace_once(src, '          const itemRawPrice = item.option?.price || undefined;', '          const itemRawPrice = item.priceModel?.price || item.option?.price || undefined;', 'cart submit model price')
src = replace_once(src, "              nameOption: item.option?.label || 'N/A',", "              nameOption: item.option ? `${item.option.label}${item.priceModel ? ` — ${item.priceModel.label}` : ''}` : 'N/A',", 'cart submit model name')
src = replace_once(src, '                        onBuy={(tier) => startDirectOptionCheckout(item.product, item.option, tier as unknown as WarrantyTier | null)}\n                        onAddToCart={() => addToCart(item.product, item.option)}', '                        onBuy={(tier, priceModel) => startDirectOptionCheckout(item.product, item.option, tier as unknown as WarrantyTier | null, priceModel as OptionPriceModel | null)}\n                        onAddToCart={(_tier, priceModel) => addToCart(item.product, item.option, priceModel as OptionPriceModel | null)}', 'storefront callbacks home')
# Cart visual: show model and model price when present.
src = src.replace("{item.option?.price && (", "{(item.priceModel?.price || item.option?.price) && (", 1)
src = src.replace("{item.option.originalPrice && item.option.originalPrice.trim() !== '' && (", "{(item.priceModel?.originalPrice || item.option?.originalPrice) && (", 1)
src = src.replace("<span className=\"text-gray-500 text-xs line-through\">{item.option.originalPrice}</span>", "<span className=\"text-gray-500 text-xs line-through\">{item.priceModel?.originalPrice || item.option?.originalPrice}</span>", 1)
src = src.replace("<p className=\"text-green-400 font-bold text-sm\">{resellerPriceMap[item.option.id] || item.option.price}</p>", "<p className=\"text-green-400 font-bold text-sm\">{item.priceModel?.price || resellerPriceMap[item.option.id] || item.option.price}</p>", 1)
# Summary option line: append selected price model.
src = src.replace('{selectedOption.label}</span>', "{selectedOption.label}{selectedPriceModel ? ` — ${selectedPriceModel.label}` : ''}</span>", 1)
path.write_text(src, encoding='utf-8')

# 6) Colombia Bot: ask nested category after the existing option and use its price/name.
path = Path('client/src/components/ColombiaBot.tsx')
src = path.read_text(encoding='utf-8')
src = replace_once(src, 'type ProductOption = {\n  id: number; name: string; price?: string; label?: string; type?: string; isPdfOnly?: number;', "type OptionPriceModel = { id: number; optionId: number; label: string; price: string; originalPrice?: string | null; promoEndsAt?: number | null; sortOrder: number; isActive: number; };\ntype ProductOption = {\n  id: number; name: string; price?: string; label?: string; type?: string; isPdfOnly?: number; priceModels?: OptionPriceModel[];", 'bot model type')
src = replace_once(src, '    option: ProductOption | null;\n    answers:', '    option: ProductOption | null;\n    priceModel: OptionPriceModel | null;\n    answers:', 'bot flow model')
src = replace_once(src, "  }>({ product: null, option: null, answers:", "  }>({ product: null, option: null, priceModel: null, answers:", 'bot flow init')
src = replace_once(src, '        optionId: fs.option?.id ?? null,\n        questionAnswers:', '        optionId: fs.option?.id ?? null,\n        priceModelId: fs.priceModel?.id ?? null,\n        questionAnswers:', 'bot save model')
src = replace_once(src, '    fs.option = null;\n    fs.answers = {};', '    fs.option = null;\n    fs.priceModel = null;\n    fs.answers = {};', 'bot reset model')
src = replace_once(src, '        option,\n        answers,', '        option,\n        priceModel: option.priceModels?.find(model => model.id === saved.priceModelId) || null,\n        answers,', 'bot restore model')
# When restoring at payment, price model is already in flowState and askPix reads it.
src = replace_once(src, '        } else if (product.options.length === 1) {\n          flowState.current.option = product.options[0];\n          setTimeout(() => askQuestions(product, product.options[0], {}), 300);', "        } else if (product.options.length === 1) {\n          flowState.current.option = product.options[0];\n          setTimeout(() => startOptionPricing(product, product.options[0]), 300);", 'bot single option pricing')
src = replace_once(src, '      setTimeout(() => askQuestions(product, option, {}), 300);\n    };\n    addMsgs(\n      { type: "bot", id: uid(), text: `Qual opção de ${product.name} você quer?` },', '      setTimeout(() => startOptionPricing(product, option), 300);\n    };\n    addMsgs(\n      { type: "bot", id: uid(), text: `Qual opção de ${product.name} você quer?` },', 'bot multi option pricing')
insert_anchor = '  const askQuestions = (product: Product, option: ProductOption, currentAnswers: Record<number, string>) => {'
pricing_fn = r'''  const startOptionPricing = (product: Product, option: ProductOption) => {
    const models = option.priceModels || [];
    if (models.length === 0) {
      flowState.current.priceModel = null;
      setTimeout(() => askQuestions(product, option, {}), 200);
      return;
    }
    if (models.length === 1) {
      flowState.current.priceModel = models[0];
      saveBotProgress('questions', 'dados');
      setTimeout(() => askQuestions(product, option, {}), 200);
      return;
    }
    saveSnapshot();
    const msgId = uid();
    callbacks.current[msgId] = (answer: string) => {
      markAnswered(msgId);
      addMsgs({ type: 'user', id: uid(), text: answer });
      const model = models.find(item => `${item.label} — R$ ${item.price}` === answer);
      if (!model) return;
      flowState.current.priceModel = model;
      saveBotProgress('questions', 'dados');
      setTimeout(() => askQuestions(product, option, {}), 250);
    };
    addMsgs(
      { type: 'bot', id: uid(), text: 'Qual modelo / categoria de preço você deseja?' },
      { type: 'options', id: msgId, options: models.map(model => `${model.label} — R$ ${model.price}`), answered: false }
    );
  };

'''
src = replace_once(src, insert_anchor, pricing_fn + insert_anchor, 'bot pricing function')
src = replace_once(src, "    const price = option?.price || '';", "    const price = flowState.current.priceModel?.price || option?.price || '';", 'bot pix model price')
src = replace_once(src, "          nameOption: option?.label || option?.name || 'N/A',", "          nameOption: option ? `${option.label || option.name || 'N/A'}${flowState.current.priceModel ? ` — ${flowState.current.priceModel.label}` : ''}` : 'N/A',", 'bot submit model name')
src = replace_once(src, '            const rawPrice = option?.price;', '            const rawPrice = flowState.current.priceModel?.price || option?.price;', 'bot submit model price')
path.write_text(src, encoding='utf-8')

# 7) Regression/static contract tests.
Path('server/optionPriceModelsFlow.test.ts').write_text(r'''import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const router = fs.readFileSync('server/routers/optionPriceModels.ts', 'utf8');
const appRouter = fs.readFileSync('server/routers.ts', 'utf8');
const admin = fs.readFileSync('client/src/pages/AdminProducts.tsx', 'utf8');
const card = fs.readFileSync('client/src/components/StorefrontProductCard.tsx', 'utf8');
const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const bot = fs.readFileSync('client/src/components/ColombiaBot.tsx', 'utf8');
const catalog = fs.readFileSync('shared/vehicleCatalog.ts', 'utf8');

describe('categorias de preco dentro da opcao existente', () => {
  it('nao cria novas productOptions para os tres precos', () => {
    expect(router).toContain('CREATE TABLE IF NOT EXISTS optionPriceModels');
    expect(router).toContain("'SÓ PARA BLOCO'");
    expect(router).toContain("'SOMENTE VIAGEM'");
    expect(router).toContain("'COMPLETO'");
    expect(router).toContain('FROM productOptions o');
    expect(appRouter).toContain('optionPriceModels: optionPriceModelsRouter');
  });

  it('edita as categorias dentro do card da opcao no ADM', () => {
    expect(admin).toContain('MODELOS / CATEGORIAS DE PREÇO');
    expect(admin).toContain('<OptionPriceModelsEditor optionId={opt.id} />');
    expect(admin).toContain('Não criam outro produto e não duplicam perguntas ou documentos.');
  });

  it('cliente escolhe categoria e checkout preserva a opcao original', () => {
    expect(card).toContain('Modelo / categoria');
    expect(card).toContain('selectedPriceModel');
    expect(home).toContain('selectedPriceModel?.price');
    expect(home).toContain('priceModelId: selectedPriceModel?.id');
    expect(home).toContain('item.priceModel?.price || item.option?.price');
    expect(home).toContain('selectedPriceModel.label');
  });

  it('assistente Colombia pergunta e cobra a categoria selecionada', () => {
    expect(bot).toContain('Qual modelo / categoria de preço você deseja?');
    expect(bot).toContain('flowState.current.priceModel?.price || option?.price');
    expect(bot).toContain('priceModelId: fs.priceModel?.id');
  });

  it('contem as 19 marcas e os modelos enviados pelo usuario', () => {
    for (const brand of ['VOLKSWAGEN','FIAT','CHEVROLET','HYUNDAI','TOYOTA','RENAULT','NISSAN','HONDA','JEEP','BYD','CAOA CHERY','GWM','CITROËN','PEUGEOT','FORD','KIA','MITSUBISHI','JAC MOTORS','GEELY']) {
      expect(catalog).toContain(brand);
    }
    for (const model of ['TAOS','TIPO','EQUINOX','AZERA','RAV4','KARDIAN','LEAF','ACCORD','DOLPHIN GS','TIGGO 8','HAVAL H6 PHEV','C3 AIRCROSS','408','FUSION','NIRO','OUTLANDER','E-JS4','EX5']) {
      expect(catalog).toContain(model);
    }
  });
});
''', encoding='utf-8')

print('Nested option price models patch applied.')
