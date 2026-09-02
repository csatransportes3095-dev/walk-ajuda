import { createConnection } from 'mysql2/promise';
import { VEHICLE_BRANDS, VEHICLE_MODELS } from '../shared/vehicleCatalog';

const normalize = (value: unknown) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toUpperCase();

const isVehicleEditProduct = (name: unknown) => {
  const value = normalize(name);
  return value.includes('EDICAO') && value.includes('DOC') && value.includes('VEIC');
};

const isBrandQuestion = (question: unknown) => {
  const value = normalize(question);
  return value.includes('QUAL A MARCA') || value === 'MARCA' || value.includes('MARCA DO VEICULO');
};

const isModelQuestion = (question: unknown) => {
  const value = normalize(question);
  return value.includes('MODELO DO VEICULO') || value.includes('QUAL MODELO') || value === 'MODELO';
};

const canonicalBrand = (value: unknown) => {
  const normalized = normalize(value);
  if (normalized === 'CITROEN') return 'CITROËN';
  if (normalized === 'CHERY' || normalized === 'CAOA') return 'CAOA CHERY';
  if (normalized === 'JAC') return 'JAC MOTORS';
  if (normalized === 'MERCEDES' || normalized === 'MERCEDES BENZ') return 'MERCEDES-BENZ';
  if (normalized === 'LANDROVER') return 'LAND ROVER';
  return VEHICLE_BRANDS.find(brand => normalize(brand) === normalized) ?? null;
};

async function run() {
  if (!process.env.DATABASE_URL) {
    console.log('[vehicle-question-catalog] DATABASE_URL não configurada, pulando atualização.');
    return;
  }

  const db = await createConnection(process.env.DATABASE_URL);
  let productsUpdated = 0;
  let optionsUpdated = 0;
  let questionsUpdated = 0;
  let questionsCreated = 0;
  let questionsRemoved = 0;

  try {
    const [productRows] = await db.query<any[]>('SELECT id, name FROM products ORDER BY id');
    const targetProducts = productRows.filter(row => isVehicleEditProduct(row.name));
    if (targetProducts.length === 0) {
      console.log('[vehicle-question-catalog] Produto de edição de documento do veículo não encontrado; nenhuma alteração aplicada.');
      return;
    }

    await db.beginTransaction();

    for (const product of targetProducts) {
      const [optionRows] = await db.query<any[]>('SELECT id FROM productOptions WHERE productId = ? ORDER BY sortOrder, id', [product.id]);
      let touchedProduct = false;

      for (const option of optionRows) {
        const [rows] = await db.query<any[]>(
          'SELECT id, question, fieldType, options, isRequired, sortOrder, parentQuestionId, triggerOption FROM productQuestions WHERE productId = ? AND optionId = ? ORDER BY sortOrder, id',
          [product.id, option.id],
        );
        const brandQuestion = rows.find(row => row.parentQuestionId == null && isBrandQuestion(row.question));
        if (!brandQuestion) continue;

        await db.query(
          'UPDATE productQuestions SET question = ?, fieldType = ?, options = ?, isRequired = 1 WHERE id = ?',
          ['QUAL A MARCA', 'select', JSON.stringify(VEHICLE_BRANDS), brandQuestion.id],
        );
        questionsUpdated += 1;

        const modelChildren = rows.filter(row => Number(row.parentQuestionId) === Number(brandQuestion.id) && isModelQuestion(row.question));
        const existingByBrand = new Map<string, any>();
        for (const child of modelChildren) {
          const brand = canonicalBrand(child.triggerOption);
          if (brand && !existingByBrand.has(brand)) existingByBrand.set(brand, child);
        }

        let nextSortOrder = Math.max(Number(brandQuestion.sortOrder || 0) + 1, ...modelChildren.map(row => Number(row.sortOrder || 0) + 1));
        const retainedIds = new Set<number>();

        for (const brand of VEHICLE_BRANDS) {
          const models = VEHICLE_MODELS[brand] ?? [];
          const existing = existingByBrand.get(brand);
          if (existing) {
            retainedIds.add(Number(existing.id));
            await db.query(
              'UPDATE productQuestions SET question = ?, fieldType = ?, options = ?, isRequired = 1, parentQuestionId = ?, triggerOption = ? WHERE id = ?',
              ['QUAL É O MODELO DO VEÍCULO?', 'select', JSON.stringify(models), brandQuestion.id, brand, existing.id],
            );
            questionsUpdated += 1;
          } else {
            const [insertResult] = await db.query<any>(
              `INSERT INTO productQuestions
                (productId, optionId, question, fieldType, options, isRequired, sortOrder, parentQuestionId, triggerOption)
               VALUES (?, ?, ?, 'select', ?, 1, ?, ?, ?)`,
              [product.id, option.id, 'QUAL É O MODELO DO VEÍCULO?', JSON.stringify(models), nextSortOrder, brandQuestion.id, brand],
            );
            retainedIds.add(Number(insertResult.insertId));
            nextSortOrder += 1;
            questionsCreated += 1;
          }
        }

        const obsoleteIds = modelChildren
          .map(row => Number(row.id))
          .filter(id => !retainedIds.has(id));
        if (obsoleteIds.length > 0) {
          const placeholders = obsoleteIds.map(() => '?').join(',');
          await db.query(`UPDATE productQuestions SET parentQuestionId = NULL, triggerOption = NULL WHERE parentQuestionId IN (${placeholders})`, obsoleteIds);
          await db.query(`DELETE FROM productQuestions WHERE id IN (${placeholders})`, obsoleteIds);
          questionsRemoved += obsoleteIds.length;
        }

        optionsUpdated += 1;
        touchedProduct = true;
      }

      if (touchedProduct) productsUpdated += 1;
    }

    await db.commit();
    console.log('[vehicle-question-catalog] Catálogo MARCA -> MODELO atualizado.', {
      productsUpdated,
      optionsUpdated,
      brands: VEHICLE_BRANDS.length,
      questionsUpdated,
      questionsCreated,
      questionsRemoved,
    });
  } catch (error) {
    try { await db.rollback(); } catch { }
    console.error('[vehicle-question-catalog] Falha:', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}

void run();
