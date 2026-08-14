import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const admin = read('client/src/pages/AdminLocadora.tsx');
const router = read('server/routers/locadora.ts');
const migration = read('scripts/apply-locadora-migration.ts');
const checks = [];
const mustContain = (name, source, fragment) => checks.push({ name, ok: source.includes(fragment) });

mustContain('Contrato oferece Diária no ADM', admin, '<option value="daily">Diária</option><option value="weekly">Semanal</option>');
mustContain('Cobrança oferece Diária no ADM', admin, '<option value="daily">Diária</option><option value="weekly">Semanal</option>');
mustContain('Veículo possui campo Valor diário', admin, 'placeholder="Valor diário"');
mustContain('Veículo mantém preço quinzenal visível', admin, 'placeholder="Valor quinzenal"');
mustContain('ADM envia dailyPrice do veículo', admin, "dailyPrice:String(f.get('daily'))||undefined");
mustContain('Backend recebe dailyPrice do veículo', router, 'dailyPrice:money');
mustContain('Backend grava dailyPrice do veículo', router, 'mileage,dailyPrice,weeklyPrice,biweeklyPrice,monthlyPrice');
mustContain('Backend aceita contrato daily', router, "z.enum(['daily','weekly','biweekly','monthly'])");
mustContain('Backend aceita cobrança daily', router, "z.enum(['daily','weekly','biweekly','monthly','other'])");
mustContain('Tabela nova possui dailyPrice', migration, 'dailyPrice DECIMAL(10,2) NULL, weeklyPrice');
mustContain('Migration atualiza tabelas já existentes', migration, "SHOW COLUMNS FROM locadora_vehicles LIKE 'dailyPrice'");
mustContain('Migration usa ALTER TABLE somente se necessário', migration, 'ALTER TABLE locadora_vehicles ADD COLUMN dailyPrice');

const failed = checks.filter((check) => !check.ok);
for (const check of checks) console.log(`${check.ok ? 'OK' : 'FALHOU'} — ${check.name}`);
if (failed.length) process.exit(1);
console.log(`Validação aprovada: ${checks.length} controles do período Diário na locadora.`);
