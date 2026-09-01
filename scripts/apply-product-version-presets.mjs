import fs from 'node:fs';

const path = 'client/src/pages/AdminProducts.tsx';
let src = fs.readFileSync(path, 'utf8');

function replaceOnce(from, to, label) {
  if (!src.includes(from)) throw new Error(`Anchor not found: ${label}`);
  src = src.replace(from, to);
}

replaceOnce(
`  const createOptMut = trpc.productOptions.create.useMutation({ onSuccess: () => { utils.products.list.invalidate(); resetOptForm(); toast.success("Opção criada!"); } });
  const updateOptMut = trpc.productOptions.update.useMutation({ onSuccess: () => { utils.products.list.invalidate(); toast.success("Opção salva!"); } });`,
`  const createOptMut = trpc.productOptions.create.useMutation({ onSuccess: () => { utils.products.list.invalidate(); resetOptForm(); toast.success("Opção criada!"); } });
  const createPresetOptMut = trpc.productOptions.create.useMutation();
  const copyPresetQuestionsMut = trpc.productQuestions.copyFromOption.useMutation();
  const [creatingPresetProductId, setCreatingPresetProductId] = useState<number | null>(null);
  const updateOptMut = trpc.productOptions.update.useMutation({ onSuccess: () => { utils.products.list.invalidate(); toast.success("Opção salva!"); } });`,
'bulk preset mutations');

replaceOnce(
`  const resetOptForm = () => {
    setNewOptLabel(""); setNewOptBasePrice(""); setNewOptPrice(""); setNewOptPromoEndsAt(""); setNewOptType("standard");
    setNewOptDocNameMode("none"); setNewOptDocCustomName("");
  };

  const startEdit = (p: ProductWithRelations) => {`,
`  const resetOptForm = () => {
    setNewOptLabel(""); setNewOptBasePrice(""); setNewOptPrice(""); setNewOptPromoEndsAt(""); setNewOptType("standard");
    setNewOptDocNameMode("none"); setNewOptDocCustomName("");
  };

  const vehiclePricePresets = [
    { label: 'SÓ PARA BLOCO', originalPrice: '150,00', price: '100,00' },
    { label: 'SOMENTE VIAGEM', originalPrice: '200,00', price: '150,00' },
    { label: 'COMPLETO', originalPrice: '350,00', price: '300,00' },
  ] as const;
  const normalizePresetLabel = (value: string) => value
    .normalize('NFD')
    .replace(/[\\u0300-\\u036f]/g, '')
    .replace(/\\s+/g, ' ')
    .trim()
    .toUpperCase();
  const isVehicleDocumentProduct = (name: string) => {
    const normalized = normalizePresetLabel(name);
    return normalized.includes('DOC') && normalized.includes('VEIC');
  };
  const createVehiclePricePresets = async (product: ProductWithRelations) => {
    const sourceOption = product.options[0] as any;
    if (!sourceOption) {
      toast.error('Crie ou mantenha uma opção base antes de gerar as três versões.');
      return;
    }
    const existingLabels = new Set(product.options.map(option => normalizePresetLabel(option.label)));
    const missing = vehiclePricePresets.filter(preset => !existingLabels.has(normalizePresetLabel(preset.label)));
    if (missing.length === 0) {
      toast.success('As três versões já estão criadas.');
      return;
    }
    setCreatingPresetProductId(product.id);
    try {
      let createdCount = 0;
      for (const [index, preset] of missing.entries()) {
        const created = await createPresetOptMut.mutateAsync({
          productId: product.id,
          label: preset.label,
          price: preset.price,
          originalPrice: preset.originalPrice,
          type: sourceOption.type || 'standard',
          sortOrder: product.options.length + index,
          requireProfilePhoto: sourceOption.requireProfilePhoto === 1,
          requireCarDocument: sourceOption.requireCarDocument === 1,
          requireAlvara: sourceOption.requireAlvara === 1,
          requireCondutaxi: sourceOption.requireCondutaxi === 1,
          requireVehicle2016: sourceOption.requireVehicle2016 === 1,
          isPdfOnly: sourceOption.isPdfOnly === 1,
          showYearField: sourceOption.showYearField === 1,
          docNameMode: sourceOption.docNameMode || 'none',
          docCustomName: sourceOption.docCustomName || '',
        });
        if (created?.id && (sourceOption.questions?.length || 0) > 0) {
          await copyPresetQuestionsMut.mutateAsync({
            fromOptionId: sourceOption.id,
            toOptionId: created.id,
            toProductId: product.id,
          });
        }
        createdCount += 1;
      }
      await utils.products.list.invalidate();
      toast.success(`${createdCount} versão(ões) criada(s) com os valores definidos.`);
    } catch (error: any) {
      toast.error(error?.message || 'Erro ao criar as versões do produto.');
    } finally {
      setCreatingPresetProductId(null);
    }
  };

  const startEdit = (p: ProductWithRelations) => {`,
'preset helpers');

replaceOnce(
`                      <p className="text-xs text-gray-500 mb-3">Cada opção tem seus próprios documentos e perguntas. Clique na seta para expandir e configurar.</p>

                      {product.options.length > 0 && (`,
`                      <p className="text-xs text-gray-500 mb-3">Cada opção tem seus próprios documentos e perguntas. Clique na seta para expandir e configurar.</p>

                      {isVehicleDocumentProduct(product.name) && (() => {
                        const existingLabels = new Set(product.options.map(option => normalizePresetLabel(option.label)));
                        const missingCount = vehiclePricePresets.filter(preset => !existingLabels.has(normalizePresetLabel(preset.label))).length;
                        const creating = creatingPresetProductId === product.id;
                        return (
                          <div className="mb-4 rounded-xl border-2 border-cyan-500/40 bg-cyan-950/20 p-3 space-y-3">
                            <div>
                              <p className="text-sm font-black text-cyan-300">MODELOS / VERSÕES DE PREÇO</p>
                              <p className="text-[10px] text-gray-400">As três versões pertencem ao mesmo produto. O valor maior é o principal e o menor é o promocional.</p>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                              {vehiclePricePresets.map(preset => {
                                const exists = existingLabels.has(normalizePresetLabel(preset.label));
                                return (
                                  <div key={preset.label} className={`rounded-lg border p-3 ${exists ? 'border-green-500/40 bg-green-950/20' : 'border-white/15 bg-black/30'}`}>
                                    <div className="flex items-start justify-between gap-2">
                                      <p className="text-xs font-black text-white">{preset.label}</p>
                                      <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${exists ? 'bg-green-500/20 text-green-300' : 'bg-yellow-500/20 text-yellow-300'}`}>
                                        {exists ? 'CRIADA' : 'FALTA CRIAR'}
                                      </span>
                                    </div>
                                    <div className="mt-2 flex items-baseline gap-2">
                                      <span className="text-xs text-gray-500 line-through">R$ {preset.originalPrice}</span>
                                      <span className="text-lg font-black text-green-400">R$ {preset.price}</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            <Button
                              onClick={() => createVehiclePricePresets(product)}
                              disabled={creating || missingCount === 0}
                              className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:bg-green-800 text-white font-black"
                            >
                              {creating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> CRIANDO VERSÕES...</> : missingCount === 0 ? 'AS 3 VERSÕES JÁ ESTÃO CRIADAS' : `CRIAR ${missingCount === 3 ? 'AS 3' : `${missingCount}`} VERSÃO(ÕES) FALTANTE(S)`}
                            </Button>
                          </div>
                        );
                      })()}

                      {product.options.length > 0 && (`,
'preset visual block');

fs.writeFileSync(path, src, 'utf8');
console.log('Product price preset block applied.');
