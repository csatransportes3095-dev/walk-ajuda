import { sql } from 'drizzle-orm';
import { getDb, validateMainCustomerProfile } from './db';

type IdentityRow = {
  id: number;
  name?: string | null;
  phone?: string | null;
  cpf?: string | null;
  allowedRoutes?: string | null;
};

export function digits(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '');
}

export function isSameCustomerIdentity(a: Pick<IdentityRow, 'phone' | 'cpf'>, b: Pick<IdentityRow, 'phone' | 'cpf'>): boolean {
  const cpfA = digits(a.cpf);
  const cpfB = digits(b.cpf);
  if (cpfA.length === 11 && cpfA === cpfB) return true;

  const phoneA = digits(a.phone);
  const phoneB = digits(b.phone);
  if (!phoneA || !phoneB) return false;
  return phoneA === phoneB || phoneA.endsWith(phoneB) || phoneB.endsWith(phoneA);
}

/**
 * Todas as rotas usam esta guarda antes de criar ou liberar um cadastro técnico.
 * Gastos e Empréstimos dependem do perfil completo do cadastro principal e não
 * podem criar cartões parciais em customers.
 */
export async function requireCompleteMainCustomerProfile(db: any, identity: Pick<IdentityRow, 'phone' | 'cpf'>): Promise<any> {
  const phone = digits(identity.phone);
  const cpf = digits(identity.cpf);
  if (!phone && !cpf) throw new Error('Informe telefone ou CPF para localizar o cadastro principal.');
  const candidates = await rows(db, sql`
    SELECT id, name, phone, cpf, email, profilePhotoUrl
    FROM customers
    WHERE deletedAt IS NULL
      AND (
        (${phone || ''}!='' AND (phone=${phone || ''} OR RIGHT(REGEXP_REPLACE(phone, '[^0-9]', ''), 9)=RIGHT(${phone || ''}, 9)))
        OR (${cpf || ''}!='' AND REGEXP_REPLACE(cpf, '[^0-9]', '')=${cpf || ''})
      )
  `);
  const customer = candidates.find((row: any) => isSameCustomerIdentity(row, identity));
  if (!customer) throw new Error('Conclua primeiro o cadastro principal do cliente: foto, e-mail, CPF e telefone são obrigatórios.');
  validateMainCustomerProfile(customer);
  return customer;
}

async function rows(db: any, query: any): Promise<any[]> {
  const result = await db.execute(query);
  return (result[0] || result || []) as any[];
}

let customerPhoneIndexChecked = false;
let automaticCustomerRepairChecked = false;

/**
 * O cadastro usa exclusão lógica (lixeira). O índice UNIQUE antigo em phone
 * bloqueava reutilizar um telefone preso num registro excluído. A validação
 * do sistema já impede duplicidade entre clientes ativos; por isso removemos
 * somente esse índice legado e preservamos todos os dados da lixeira.
 */
async function allowPhoneReuseFromDeletedCustomers(db: any): Promise<void> {
  if (customerPhoneIndexChecked) return;
  try {
    const indexes = await rows(db, sql`SHOW INDEX FROM customers WHERE Column_name = 'phone' AND Non_unique = 0`);
    for (const index of indexes) {
      const keyName = String(index.Key_name || '');
      if (keyName && keyName !== 'PRIMARY' && /^[A-Za-z0-9_]+$/.test(keyName)) {
        await db.execute(sql.raw(`ALTER TABLE customers DROP INDEX \`${keyName}\``));
      }
    }
  } catch (error: any) {
    console.warn('[customerIdentity] não foi possível ajustar índice legado de telefone:', error?.message);
  } finally {
    customerPhoneIndexChecked = true;
  }
}

/**
 * Entre 11/08/2026 23:15 e 23:45 (horário de Brasília), uma versão defeituosa
 * criou cards principais técnicos sem e-mail, foto, cidade ou número de cadastro.
 * Eles não representam cadastros válidos e são movidos para a lixeira uma única vez.
 * Não apaga nenhum registro e não toca em cadastros fora dessa janela.
 */
async function hideAutomaticIncompleteCustomers(db: any): Promise<void> {
  if (automaticCustomerRepairChecked) return;
  try {
    const alreadyDone = await rows(db, sql`SELECT settingValue FROM siteSettings WHERE settingKey='customer_identity_incomplete_repair_20260811' LIMIT 1`);
    if (!alreadyDone.length) {
      await db.execute(sql`
        UPDATE customers
        SET deletedAt=NOW()
        WHERE deletedAt IS NULL
          -- Banco grava em UTC: 11/08 23:15–23:45 em Brasília = 12/08 02:15–02:45 UTC.
          AND createdAt >= '2026-08-12 02:15:00'
          AND createdAt < '2026-08-12 02:45:00'
          AND (email IS NULL OR TRIM(email)='')
          AND (city IS NULL OR TRIM(city)='')
          AND (profilePhotoUrl IS NULL OR TRIM(profilePhotoUrl)='')
          AND customerNumber IS NULL
      `);
      await db.execute(sql`
        INSERT INTO siteSettings (settingKey, settingValue)
        VALUES ('customer_identity_incomplete_repair_20260811', 'done')
        ON DUPLICATE KEY UPDATE settingValue='done'
      `);
    }
  } catch (error: any) {
    console.warn('[customerIdentity] não foi possível ocultar cadastros automáticos incompletos:', error?.message);
  } finally {
    automaticCustomerRepairChecked = true;
  }
}

/**
 * Sincroniza os dados compartilhados do mesmo cliente entre as tabelas
 * customers (cadastro principal), spreadsheetClients (gastos) e loanClients
 * (empréstimos). Não transfere permissões nem dados financeiros: cada módulo
 * conserva suas próprias regras e apenas nome, CPF e telefone são unificados.
 */
export async function syncUnifiedCustomerRegistry(previousIdentities: Array<Pick<IdentityRow, 'phone' | 'cpf'>> = []): Promise<{ customersCreated: number; spreadsheetCreated: number; synchronized: number }> {
  const db = await getDb() as any;
  if (!db) return { customersCreated: 0, spreadsheetCreated: 0, synchronized: 0 };

  await allowPhoneReuseFromDeletedCustomers(db);
  await hideAutomaticIncompleteCustomers(db);

  const customerRows = await rows(db, sql`SELECT id, name, phone, cpf, email, profilePhotoUrl FROM customers WHERE deletedAt IS NULL`);
  const spreadsheetRows = await rows(db, sql`SELECT id, name, phone, cpf, allowedRoutes FROM spreadsheetClients`);
  const loanRows = await rows(db, sql`SELECT id, name, phone, cpf FROM loanClients`);

  // A sincronização não pode criar clientes principais. O cadastro principal
  // possui dados obrigatórios (foto, e-mail, documentos) e é a única porta de
  // criação do cliente. Gastos e empréstimos apenas se vinculam a ele.
  const canonicalCustomers: IdentityRow[] = [...customerRows];
  const customersCreated = 0;
  let spreadsheetCreated = 0;
  let synchronized = 0;

  // O cadastro principal é a fonte dos dados de identidade. Não altera PIX,
  // perfil, limites, parcelas ou rotas já concedidas nos módulos.
  for (const main of canonicalCustomers) {
    const mainPhone = digits(main.phone);
    const mainCpf = digits(main.cpf);
    if (!mainPhone) continue;

    // Nenhuma rota técnica pode ser liberada para um perfil principal incompleto.
    try {
      validateMainCustomerProfile({
        name: String(main.name || ''),
        phone: mainPhone,
        cpf: mainCpf,
        email: String((main as any).email || ''),
        profilePhotoUrl: String((main as any).profilePhotoUrl || ''),
      });
    } catch {
      continue;
    }

    // A identidade anterior só vale para o cliente principal que foi editado;
    // nunca pode aproximar ou atualizar outro cliente por engano.
    const usePreviousIdentity = previousIdentities.some(identity => isSameCustomerIdentity(main, identity));
    const aliasesForMain = usePreviousIdentity ? [main, ...previousIdentities] : [main];
    const relatedSpreadsheet = spreadsheetRows.filter(row => aliasesForMain.some(identity => isSameCustomerIdentity(row, identity)));
    const relatedLoans = loanRows.filter(row => aliasesForMain.some(identity => isSameCustomerIdentity(row, identity)));

    for (const row of relatedSpreadsheet) {
      const targetName = String(main.name || row.name || 'CLIENTE');
      if (String(row.name || '') === targetName && digits(row.phone) === mainPhone && digits(row.cpf) === mainCpf) continue;
      try {
        await db.execute(sql`
          UPDATE spreadsheetClients
          SET name=${targetName}, phone=${mainPhone}, cpf=${mainCpf || null}, updatedAt=NOW()
          WHERE id=${row.id}
        `);
        synchronized++;
      } catch (error: any) {
        console.warn('[customerIdentity] não foi possível sincronizar gastos:', error?.message);
      }
    }

    for (const row of relatedLoans) {
      const targetName = String(main.name || row.name || 'CLIENTE');
      if (String(row.name || '') === targetName && digits(row.phone) === mainPhone && digits(row.cpf) === mainCpf) continue;
      try {
        await db.execute(sql`
          UPDATE loanClients
          SET name=${targetName}, phone=${mainPhone}, cpf=${mainCpf || null}, updatedAt=NOW()
          WHERE id=${row.id}
        `);
        synchronized++;
      } catch (error: any) {
        console.warn('[customerIdentity] não foi possível sincronizar empréstimos:', error?.message);
      }
    }

    // Um cadastro existente somente em empréstimos recebe o registro técnico da
    // planilha para controlar rotas. A permissão automática é somente emprestimo.
    if (relatedLoans.length && !relatedSpreadsheet.length) {
      try {
        await db.execute(sql`
          INSERT INTO spreadsheetClients (phone, name, cpf, status, allowedRoutes, createdAt, updatedAt)
          VALUES (${mainPhone}, ${String(main.name || 'CLIENTE')}, ${mainCpf || null}, 'active', 'emprestimo', NOW(), NOW())
        `);
        spreadsheetCreated++;
      } catch (error: any) {
        console.warn('[customerIdentity] não foi possível criar vínculo de rota empréstimo:', error?.message);
      }
    }
  }

  return { customersCreated, spreadsheetCreated, synchronized };
}
