import fs from 'node:fs';

function replaceOnce(src, from, to, label) {
  if (!src.includes(from)) throw new Error(`Anchor not found: ${label}`);
  return src.replace(from, to);
}

function replaceInSection(src, startMarker, endMarker, transform, label) {
  const start = src.indexOf(startMarker);
  if (start < 0) throw new Error(`Section start not found: ${label}`);
  const end = src.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`Section end not found: ${label}`);
  const before = src.slice(0, start);
  const section = src.slice(start, end);
  const after = src.slice(end);
  const nextSection = transform(section);
  if (nextSection === section) throw new Error(`Section unchanged: ${label}`);
  return before + nextSection + after;
}

fs.writeFileSync('shared/vehicleCatalog.ts', `export type VehicleQuestionKind = 'brand' | 'model' | 'year' | 'color' | null;\n\nexport const VEHICLE_MODELS: Record<string, string[]> = {\n  CHEVROLET: ['ONIX', 'ONIX PLUS', 'PRISMA', 'COBALT', 'SPIN', 'TRACKER', 'CRUZE'],\n  FIAT: ['ARGO', 'CRONOS', 'MOBI', 'UNO', 'GRAND SIENA', 'PULSE', 'FASTBACK'],\n  FORD: ['KA', 'KA SEDAN', 'ECOSPORT', 'TERRITORY'],\n  HONDA: ['CITY', 'CIVIC', 'FIT', 'HR-V'],\n  HYUNDAI: ['HB20', 'HB20S', 'CRETA', 'IX35'],\n  JEEP: ['RENEGADE', 'COMPASS', 'COMMANDER'],\n  KIA: ['CERATO', 'SOUL', 'SPORTAGE'],\n  NISSAN: ['VERSA', 'KICKS', 'SENTRA', 'MARCH'],\n  PEUGEOT: ['208', '2008', '308'],\n  RENAULT: ['LOGAN', 'SANDERO', 'KWID', 'DUSTER', 'CAPTUR'],\n  TOYOTA: ['COROLLA', 'YARIS', 'ETIOS', 'COROLLA CROSS'],\n  VOLKSWAGEN: ['GOL', 'VOYAGE', 'POLO', 'VIRTUS', 'T-CROSS', 'NIVUS', 'JETTA'],\n  'CITROËN': ['C3', 'C4 CACTUS', 'C4 LOUNGE', 'AIRCROSS'],\n  CITROEN: ['C3', 'C4 CACTUS', 'C4 LOUNGE', 'AIRCROSS'],\n  'CAOA CHERY': ['ARRIZO 5', 'ARRIZO 6', 'TIGGO 2', 'TIGGO 5X', 'TIGGO 7'],\n  MITSUBISHI: ['ASX', 'LANCER', 'ECLIPSE CROSS'],\n  BMW: ['320I', 'X1', 'X2'],\n  MERCEDES: ['CLASSE A', 'CLASSE C', 'GLA'],\n  AUDI: ['A3', 'A4', 'Q3'],\n};\n\nexport const VEHICLE_BRANDS = Object.keys(VEHICLE_MODELS).filter((brand, index, all) => brand !== 'CITROEN' || !all.includes('CITROËN'));\nexport const VEHICLE_YEARS = Array.from({ length: 11 }, (_, index) => String(2026 - index));\nexport const VEHICLE_COLORS = ['BRANCO', 'PRETO', 'PRATA', 'CINZA', 'VERMELHO', 'AZUL', 'VERDE', 'AMARELO', 'MARROM', 'BEGE', 'OUTRA'];\n\nconst normalize = (value: string) => value\n  .normalize('NFD')\n  .replace(/[\\u0300-\\u036f]/g, '')\n  .replace(/\\s+/g, ' ')\n  .trim()\n  .toUpperCase();\n\nexport function getVehicleQuestionKind(question: string): VehicleQuestionKind {\n  const q = normalize(question);\n  if (q.includes('QUAL A MARCA') || q === 'MARCA' || q.includes('MARCA DO VEICULO')) return 'brand';\n  if (q.includes('MODELO DO VEICULO') || q.includes('QUAL MODELO') || q === 'MODELO') return 'model';\n  if (q.includes('QUAL E O ANO') || q.includes('QUAL É O ANO') || q.includes('ANO DO VEICULO') || q === 'ANO') return 'year';\n  if (q.includes('QUAL E A COR') || q.includes('QUAL É A COR') || q.includes('COR DO VEICULO') || q === 'COR') return 'color';\n  return null;\n}\n\nexport function getVehicleModels(brand: string): string[] {\n  const normalized = normalize(brand);\n  const key = Object.keys(VEHICLE_MODELS).find(item => normalize(item) === normalized);\n  return key ? VEHICLE_MODELS[key] : [];\n}\n`, 'utf8');

// HOME: vehicle compact cascade
{
  const path = 'client/src/pages/Home.tsx';
  let src = fs.readFileSync(path, 'utf8');
  src = replaceOnce(
    src,
    'import { isPersistedOrderResult } from "@shared/orderSubmission";',
    'import { isPersistedOrderResult } from "@shared/orderSubmission";\nimport { getVehicleModels, getVehicleQuestionKind, VEHICLE_BRANDS, VEHICLE_COLORS, VEHICLE_YEARS } from "@shared/vehicleCatalog";',
    'Home vehicle import',
  );

  const oldBuild = `            const subs = allQsModal\n              .filter(q => q.parentQuestionId === root.id)\n              .sort((a, b) => a.sortOrder - b.sortOrder);\n            for (const sub of subs) {\n              const parentAnswer = answers[root.id]?.trim() || \"\";\n              const isVisible = !sub.triggerOption || parentAnswer === sub.triggerOption;\n              if (isVisible) {`;
  const newBuild = `            const rawSubs = allQsModal\n              .filter(q => q.parentQuestionId === root.id)\n              .sort((a, b) => a.sortOrder - b.sortOrder);\n            // Veículo: modelos antigos eram uma pergunta por marca. Na tela do cliente\n            // usamos uma única pergunta de modelo e filtramos as opções pela marca escolhida.\n            const vehicleModelSubs = getVehicleQuestionKind(root.question) === 'brand'\n              ? rawSubs.filter(q => getVehicleQuestionKind(q.question) === 'model')\n              : [];\n            const subs = vehicleModelSubs.length > 0\n              ? [vehicleModelSubs[0], ...rawSubs.filter(q => getVehicleQuestionKind(q.question) !== 'model')]\n              : rawSubs;\n            for (const sub of subs) {\n              const parentAnswer = answers[root.id]?.trim() || \"\";\n              const isGenericVehicleModel = getVehicleQuestionKind(root.question) === 'brand' && getVehicleQuestionKind(sub.question) === 'model';\n              const isVisible = isGenericVehicleModel ? !!parentAnswer : (!sub.triggerOption || parentAnswer === sub.triggerOption);\n              if (isVisible) {`;
  src = replaceOnce(src, oldBuild, newBuild, 'Home collapse model questions');

  const renderAnchor = `        const renderQuestionInput = (q: typeof currentQ) => {\n          if (!q) return null;\n          if (q.fieldType === 'select' && q.options) {`;
  const renderReplacement = `        const renderQuestionInput = (q: typeof currentQ) => {\n          if (!q) return null;\n\n          const vehicleKind = getVehicleQuestionKind(q.question);\n          if (vehicleKind) {\n            const clearDescendants = (rootId: number, answers: Record<number, string>) => {\n              for (const child of allQsModal.filter(item => item.parentQuestionId === rootId)) {\n                delete answers[child.id];\n                clearDescendants(child.id, answers);\n              }\n            };\n            const chooseVehicleValue = (value: string, autoAdvance = true) => {\n              const nextAnswers = { ...questionAnswers, [q.id]: value };\n              if (vehicleKind === 'brand') clearDescendants(q.id, nextAnswers);\n              setQuestionAnswers(nextAnswers);\n              setBlockedByQuestion(null);\n              if (autoAdvance && value) {\n                const nextIdx = getNextIndex(nextAnswers);\n                const nextList = buildOrderedQs(nextAnswers);\n                setTimeout(() => { if (nextIdx < nextList.length) setCurrentQuestionIndex(nextIdx); }, 180);\n              }\n            };\n\n            if (vehicleKind === 'model') {\n              const brand = q.parentQuestionId ? questionAnswers[q.parentQuestionId] || '' : '';\n              const models = getVehicleModels(brand);\n              const listId = \`vehicle-models-\${q.id}\`;\n              return (\n                <div className=\"space-y-2\">\n                  <div className=\"rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-200\">\n                    Marca selecionada: <strong>{brand || 'selecione a marca primeiro'}</strong>\n                  </div>\n                  <input\n                    list={listId}\n                    value={questionAnswers[q.id] || ''}\n                    onChange={(e) => chooseVehicleValue(e.target.value.toUpperCase(), false)}\n                    placeholder={models.length ? 'Selecione ou digite o modelo' : 'Digite o modelo'}\n                    className=\"w-full rounded-lg border-2 border-white/20 bg-white px-3 py-3 text-center text-base font-semibold text-black\"\n                  />\n                  <datalist id={listId}>{models.map(model => <option key={model} value={model} />)}</datalist>\n                </div>\n              );\n            }\n\n            const values = vehicleKind === 'brand' ? VEHICLE_BRANDS : vehicleKind === 'year' ? VEHICLE_YEARS : VEHICLE_COLORS;\n            return (\n              <select\n                value={questionAnswers[q.id] || ''}\n                onChange={(e) => chooseVehicleValue(e.target.value)}\n                className=\"w-full rounded-lg border-2 border-white/20 bg-white px-3 py-3 text-center text-base font-semibold text-black\"\n              >\n                <option value=\"\">Selecione {vehicleKind === 'brand' ? 'a marca' : vehicleKind === 'year' ? 'o ano' : 'a cor'}</option>\n                {values.map(value => <option key={value} value={value}>{value}</option>)}\n              </select>\n            );\n          }\n\n          if (q.fieldType === 'select' && q.options) {`;
  src = replaceOnce(src, renderAnchor, renderReplacement, 'Home compact vehicle input');

  const finalVisibleOld = `      const isQVisibleFinal = (q: ProductQuestion): boolean => {\n        if (!q.parentQuestionId) return true;\n        const parentAnswer = questionAnswers[q.parentQuestionId]?.trim() || \"\";\n        if (!q.triggerOption) return !!parentAnswer;\n        return parentAnswer === q.triggerOption;\n      };`;
  const finalVisibleNew = `      const isQVisibleFinal = (q: ProductQuestion): boolean => {\n        if (!q.parentQuestionId) return true;\n        const parentAnswer = questionAnswers[q.parentQuestionId]?.trim() || \"\";\n        const parentQuestion = (selectedOption?.questions || []).find(item => item.id === q.parentQuestionId);\n        if (getVehicleQuestionKind(q.question) === 'model' && parentQuestion && getVehicleQuestionKind(parentQuestion.question) === 'brand') {\n          return !!parentAnswer;\n        }\n        if (!q.triggerOption) return !!parentAnswer;\n        return parentAnswer === q.triggerOption;\n      };`;
  src = replaceOnce(src, finalVisibleOld, finalVisibleNew, 'Home final vehicle visibility');
  fs.writeFileSync(path, src);
}

// AdminProducts: make purchase options explicit product versions with base + promo price at creation.
{
  const path = 'client/src/pages/AdminProducts.tsx';
  let src = fs.readFileSync(path, 'utf8');
  src = replaceOnce(
    src,
    '  const [newOptPrice, setNewOptPrice] = useState(\"\");\n  const [newOptType, setNewOptType] = useState(\"standard\");',
    '  const [newOptBasePrice, setNewOptBasePrice] = useState(\"\");\n  const [newOptPrice, setNewOptPrice] = useState(\"\");\n  const [newOptPromoEndsAt, setNewOptPromoEndsAt] = useState(\"\");\n  const [newOptType, setNewOptType] = useState(\"standard\");',
    'Admin version price state',
  );
  src = replaceOnce(
    src,
    '    setNewOptLabel(\"\"); setNewOptPrice(\"\"); setNewOptType(\"standard\");',
    '    setNewOptLabel(\"\"); setNewOptBasePrice(\"\"); setNewOptPrice(\"\"); setNewOptPromoEndsAt(\"\"); setNewOptType(\"standard\");',
    'Admin reset version form',
  );
  src = src.replace('>Nome da Opção</label><input value={label}', '>Modelo / Versão</label><input value={label}');
  src = src.replace('>Nome da Opção</label><input value={newOptLabel}', '>Modelo / Versão</label><input value={newOptLabel}');

  const priceField = `<div className=\"col-span-1\"><label className=\"text-xs text-gray-400 block mb-1\">Valor</label><input value={newOptPrice} onChange={e => setNewOptPrice(e.target.value)} placeholder=\"R$ 400,00\" style={whiteInputStyle} /></div>`;
  const priceFields = `<div className=\"col-span-1\"><label className=\"text-xs text-gray-400 block mb-1\">Valor Principal</label><input value={newOptBasePrice} onChange={e => setNewOptBasePrice(e.target.value)} placeholder=\"Ex: 300,00\" style={whiteInputStyle} /></div>\n                          <div className=\"col-span-1\"><label className=\"text-xs text-green-400 block mb-1\">Valor Promocional (opcional)</label><input value={newOptPrice} onChange={e => setNewOptPrice(e.target.value)} placeholder=\"Ex: 100,00\" style={whiteInputStyle} /></div>\n                          <div className=\"col-span-1\"><label className=\"text-xs text-red-300 block mb-1\">Fim da Promoção (opcional)</label><input type=\"datetime-local\" value={newOptPromoEndsAt} onChange={e => setNewOptPromoEndsAt(e.target.value)} style={whiteInputStyle} /></div>`;
  src = replaceOnce(src, priceField, priceFields, 'Admin version prices fields');
  src = src.replace('grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 items-end', 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2 items-end');

  src = replaceOnce(
    src,
    'if (!newOptLabel.trim() || !newOptPrice.trim()) { toast.error(\"Preencha nome e valor\"); return; }',
    'if (!newOptLabel.trim() || !newOptBasePrice.trim()) { toast.error(\"Preencha a versão e o valor principal\"); return; }',
    'Admin create validation',
  );
  src = replaceOnce(
    src,
    'productId: product.id, label: newOptLabel, price: newOptPrice, type: newOptType,\n                            sortOrder: product.options.length,',
    'productId: product.id, label: newOptLabel,\n                            price: newOptPrice.trim() || newOptBasePrice,\n                            originalPrice: newOptPrice.trim() ? newOptBasePrice : \"\",\n                            promoEndsAt: newOptPrice.trim() && newOptPromoEndsAt ? new Date(newOptPromoEndsAt).getTime() : null,\n                            type: newOptType, sortOrder: product.options.length,',
    'Admin create version payload',
  );
  src = src.replace(
    'Documentos e perguntas podem ser adicionados após criar a opção (expanda a opção criada).',
    'Cada opção funciona como uma versão do mesmo produto. Ela mantém preço, promoção, documentos, perguntas e garantia próprios.',
  );
  fs.writeFileSync(path, src);
}

// DB: allow promo fields at option creation.
{
  const path = 'server/db.ts';
  let src = fs.readFileSync(path, 'utf8');
  src = replaceOnce(
    src,
    '  productId: number; label: string; price: string; originalPrice?: string; type?: string; sortOrder?: number;',
    '  productId: number; label: string; price: string; originalPrice?: string; promoEndsAt?: number | null; type?: string; sortOrder?: number;',
    'DB option create type',
  );
  src = replaceOnce(
    src,
    "    originalPrice: data.originalPrice || '',\n    type: data.type || 'standard', sortOrder: data.sortOrder || 0, isActive: 1,",
    "    originalPrice: data.originalPrice || '',\n    promoEndsAt: data.promoEndsAt ?? null,\n    type: data.type || 'standard', sortOrder: data.sortOrder || 0, isActive: 1,",
    'DB option create values',
  );
  fs.writeFileSync(path, src);
}

// Router: accept original/base and promo end on creation only inside productOptions router.
{
  const path = 'server/routers.ts';
  let src = fs.readFileSync(path, 'utf8');
  src = replaceInSection(src, '  productOptions: router({', '  warrantyTiers: router({', section => {
    if (section.includes('promoEndsAt: z.number().nullable().optional()') && section.includes('originalPrice: z.string().optional()')) return section;
    const target = '        price: z.string().min(1), type: z.string().optional(),';
    if (section.includes(target)) {
      return section.replace(target, '        price: z.string().min(1), originalPrice: z.string().optional(), promoEndsAt: z.number().nullable().optional(), type: z.string().optional(),');
    }
    const fallback = '        price: z.string().min(1),\n        type: z.string().optional(),';
    if (section.includes(fallback)) {
      return section.replace(fallback, '        price: z.string().min(1),\n        originalPrice: z.string().optional(),\n        promoEndsAt: z.number().nullable().optional(),\n        type: z.string().optional(),');
    }
    throw new Error('productOptions create price schema anchor not found');
  }, 'Router productOptions create promo fields');
  fs.writeFileSync(path, src);
}

// Keep recovery helper aligned with requested 2016-2026 range and Citroen.
{
  const path = 'scripts/rebuild-question-tree.mjs';
  let src = fs.readFileSync(path, 'utf8');
  src = src.replace(
    '  "KIA", "NISSAN", "PEUGEOT", "RENAULT", "TOYOTA", "VOLKSWAGEN",',
    '  "KIA", "NISSAN", "PEUGEOT", "RENAULT", "TOYOTA", "VOLKSWAGEN", "CITROËN", "CAOA CHERY", "MITSUBISHI",',
  );
  src = src.replace('const years = Array.from({ length: 27 }, (_, index) => String(2026 - index));', 'const years = Array.from({ length: 11 }, (_, index) => String(2026 - index));');
  fs.writeFileSync(path, src);
}

fs.writeFileSync('server/productVersionVehicleFlow.test.ts', `import { describe, expect, it } from 'vitest';\nimport fs from 'node:fs';\n\nconst home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');\nconst admin = fs.readFileSync('client/src/pages/AdminProducts.tsx', 'utf8');\nconst db = fs.readFileSync('server/db.ts', 'utf8');\nconst router = fs.readFileSync('server/routers.ts', 'utf8');\nconst catalog = fs.readFileSync('shared/vehicleCatalog.ts', 'utf8');\n\ndescribe('versoes do produto e filtro de veiculo', () => {\n  it('usa versao com valor principal e promocional sem criar outro produto', () => {\n    expect(admin).toContain('Modelo / Versão');\n    expect(admin).toContain('Valor Principal');\n    expect(admin).toContain('Valor Promocional (opcional)');\n    expect(admin).toContain('originalPrice: newOptPrice.trim() ? newOptBasePrice');\n    expect(db).toContain('promoEndsAt: data.promoEndsAt ?? null');\n    expect(router).toContain('promoEndsAt: z.number().nullable().optional()');\n  });\n\n  it('compacta marca modelo ano cor e aceita Citroen C3', () => {\n    expect(catalog).toContain("'CITROËN': ['C3'");\n    expect(catalog).toContain("Array.from({ length: 11 }");\n    expect(home).toContain("vehicleModelSubs.length > 0");\n    expect(home).toContain("Marca selecionada:");\n    expect(home).toContain("getVehicleModels(brand)");\n    expect(home).toContain("VEHICLE_YEARS");\n  });\n});\n`);

console.log('Product versions + compact vehicle flow patch applied.');
