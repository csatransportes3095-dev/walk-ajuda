import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('clone completo de card de produto', () => {
  it('expõe uma ação administrativa e mantém a cópia inativa para revisão', () => {
    const router = read('server/routers.ts');
    const database = read('server/db.ts');
    const admin = read('client/src/pages/AdminProducts.tsx');

    expect(router).toContain('cloneComplete: adminProcedure');
    expect(database).toContain('export async function cloneProductComplete');
    expect(database).toContain('isActive: 0');
    expect(admin).toContain('trpc.products.cloneComplete.useMutation');
    expect(admin).toContain('title="Clonar card completo"');
  });

  it('copia todas as relações usadas na compra sem reutilizar IDs', () => {
    const database = read('server/db.ts');
    const prices = read('server/routers/optionPriceModels.ts');
    const router = read('server/routers.ts');

    for (const relation of ['optionDocuments', 'warrantyTiers', 'productQuestions']) {
      expect(database).toContain(`tx.insert(${relation})`);
    }
    expect(database).toContain('optionIdMap[option.id] = newOptionId');
    expect(database).toContain('questionIdMap[question.id]');
    expect(prices).toContain('cloneOptionPriceModelsComplete');
    expect(prices).toContain('optionPriceModelVipSettings');
    expect(prices).toContain('price_model_manifest_');
    expect(prices).toContain('option_manifest_');
    expect(router).toContain("question_blocking_manifest_rules_v1");
    expect(router).toContain('copyQuestionPromptAudio(sourceQuestion, targetId)');
  });
});
