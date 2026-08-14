import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const checks = [];
const mustContain = (name, source, fragment) => checks.push({ name, ok: source.includes(fragment) });

const schema = read('drizzle/schema.ts');
const router = read('server/routers.ts');
const admin = read('client/src/pages/AdminProducts.tsx');
const card = read('client/src/components/StorefrontProductCard.tsx');
const migration = read('scripts/apply-option-card-appearance-migration.ts');
const start = read('scripts/render-start.sh');

for (const field of ['cardBorderColor', 'cardBgColor', 'cardTextColor', 'cardButtonColor', 'cardAccentColor']) {
  mustContain(`Schema da opção possui ${field}`, schema, `${field}: varchar`);
  mustContain(`API da opção aceita ${field}`, router, `${field}: z.string().nullable().optional()`);
  mustContain(`ADM salva ${field}`, admin, `${field}: ${field} || null`);
  mustContain(`Migration cria ${field}`, migration, `'${field}'`);
}
mustContain('ADM mostra aparência dentro da opção', admin, 'Aparência deste card na vitrine');
mustContain('ADM restaura somente a opção', admin, 'Restaurar padrão');
mustContain('Vitrine usa borda da opção antes do produto', card, 'item.option.cardBorderColor || productColor');
mustContain('Vitrine aplica fundo somente quando a opção configurar', card, 'const cardBackground = item.option.cardBgColor || undefined');
mustContain('Vitrine aplica botão da opção sem mudar o padrão atual', card, 'const cartButtonColor = item.option.cardButtonColor || productColor');
mustContain('Deploy executa migration da opção', start, 'db:migrate:option-card-appearance');

const failed = checks.filter((check) => !check.ok);
for (const check of checks) console.log(`${check.ok ? 'OK' : 'FALHOU'} — ${check.name}`);
if (failed.length) process.exit(1);
console.log(`Validação aprovada: ${checks.length} controles da aparência por opção.`);
