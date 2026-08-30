import { sql } from 'drizzle-orm';
import { getDb } from './db';
import { findMainCustomerByIdentity } from './customerAccess';
import { assertCompleteCustomerProfile } from './customerProfile';

type IdentityRow = {
  id: number;
  name?: string | null;
  phone?: string | null;
  cpf?: string | null;
  email?: string | null;
  city?: string | null;
  uf?: string | null;
  profilePhotoUrl?: string | null;
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
 * Guarda única de perfil completo. Gastos, Empréstimos e demais rotas devem
 * usar exatamente a mesma regra de obrigatoriedade do /atualizarcadastro.
 */
export async function requireCompleteMainCustomerProfile(db: any, identity: Pick<IdentityRow, 'phone' | 'cpf'>): Promise<any> {
  const phone = digits(identity.phone);
  const cpf = digits(identity.cpf);
  if (!phone && !cpf) throw new Error('Informe telefone ou CPF para localizar o cadastro principal.');
  const customer = await findMainCustomerByIdentity({ phone, cpf }, db);
  if (!customer) throw new Error('Conclua primeiro o cadastro principal para continuar.');
  assertCompleteCustomerProfile(customer);
  return customer;
}

async function rows(db: any, query: any): Promise<any[]> {
  const result = await db.execute(query);
  return (result[0] || result || []) as any[];
}

let customerPhoneIndexChecked = false;
let automaticCustomerRepairChecked = false;

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

async function hideAutomaticIncompleteCustomers(db: any): Promise<void> {
  if (automaticCustomerRepairChecked) return;
  try {
    const alreadyDone = await rows(db, sql`SELECT settingValue FROM siteSettings WHERE settingKey='customer_identity_incomplete_repair_20260811' LIMIT 1`);
    if (!alreadyDone.length) {
      await db.execute(sql`
        UPDATE customers
        SET deletedAt=NOW()
        WHERE deletedAt IS NULL
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

export async function syncUnifiedCustomerRegistry(previousIdentities: Array<Pick<IdentityRow, 'phone' | 'cpf'>> = []): Promise<{ customersCreated: number; spreadsheetCreated: number; synchronized: number }> {
  const db = await getDb() as any;
  if (!db) return { customersCreated: 0, spreadsheetCreated: 0, synchronized: 0 };

  await allowPhoneReuseFromDeletedCustomers(db);
  await hideAutomaticIncompleteCustomers(db);

  const customerRows = await rows(db, sql`SELECT id, name, phone, cpf, email, city, uf, profilePhotoUrl FROM customers WHERE deletedAt IS NULL`);
  const spreadsheetRows = await rows(db, sql`SELECT id, name, phone, cpf, allowedRoutes FROM spreadsheetClients`);
  const loanRows = await rows(db, sql`SELECT id, name, phone, cpf FROM loanClients`);

  const canonicalCustomers: IdentityRow[] = [...customerRows];
  const customersCreated = 0;
  let spreadsheetCreated = 0;
  let synchronized = 0;

  for (const main of canonicalCustomers) {
    const mainPhone = digits(main.phone);
    const mainCpf = digits(main.cpf);
    if (!mainPhone) continue;

    // Cadastro incompleto continua válido no painel ADM, mas não é liberado
    // para rotas de cliente até concluir o fluxo único de atualização.
    try {
      assertCompleteCustomerProfile(main);
    } catch {
      continue;
    }

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
