import { createConnection } from 'mysql2/promise';

const MANIFEST_KEY = /^(?:product|option|price_model)_manifest_\d+$/;
const BACKUP_TABLE = 'productManifestPortugueseBackup20260905';

const TITLE = 'Antes de continuar';
const ACCEPT_LABEL = 'Li, entendi e aceito as condições da garantia e todas as regras informadas.';
const BUTTON_LABEL = 'ACEITAR E CONTINUAR';
const ACCEPTANCE_PARAGRAPH = 'Ao aceitar o serviço, você declara estar ciente de que deverá seguir todas as regras e orientações estabelecidas pela administração.';
const ACCOUNT_DATA_PARAGRAPH = 'Durante o período de garantia, não é permitido alterar os dados da conta, as configurações ou qualquer outra informação sem autorização prévia da administração.';
const WARRANTY_LOSS_PARAGRAPH = 'Qualquer alteração realizada sem autorização poderá resultar na perda da garantia.';

type SettingRow = {
  settingKey: string;
  settingValue: string | null;
  updatedAt: Date | string | null;
};

function normalizeWarrantyBody(value: unknown): string | null {
  const normalized = String(value || '').replace(/\r\n?/g, '\n').trim();
  if (!/\bGARANTIA\s*:/i.test(normalized)) return null;

  let body = normalized.replace(
    /O que\s+(?:vencer|chegar|ocorrer)\s+primeiro\.?/gi,
    'O que ocorrer primeiro.',
  );

  const paragraphs = body
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  body = paragraphs
    .map((paragraph) => {
      if (/^Ao aceitar o servi(?:ç|c)o,/i.test(paragraph)) return ACCEPTANCE_PARAGRAPH;
      if (/^Durante o per[ií]odo (?:de|da) garantia,/i.test(paragraph)) return ACCOUNT_DATA_PARAGRAPH;
      if (/^Qualquer altera(?:ç|c)[aã]o/i.test(paragraph) && /perda da garantia/i.test(paragraph)) return WARRANTY_LOSS_PARAGRAPH;
      return paragraph;
    })
    .join('\n\n');

  body = body
    .replace(
      /Ao aceitar o servi(?:ç|c)o,\s*voc[eê] declara estar ciente de que dever[aá] seguir todas as regras e orienta(?:ç|c)[oõ]es estabelecidas (?:pelos administradores|pela administra(?:ç|c)[aã]o)\./gi,
      ACCEPTANCE_PARAGRAPH,
    )
    .replace(
      /Durante o per[ií]odo (?:de|da) garantia,\s*n[aã]o [eé] permitido alterar (?:nenhuma informa(?:ç|c)[aã]o,\s*configura(?:ç|c)[aã]o ou dado da conta|nenhuma informa(?:ç|c)[aã]o,\s*configura(?:ç|c)[aã]o ou dados da conta|informa(?:ç|c)[oõ]es,\s*configura(?:ç|c)[oõ]es ou dados da conta|os dados da conta,\s*as configura(?:ç|c)[oõ]es ou qualquer outra informa(?:ç|c)[aã]o) sem autoriza(?:ç|c)[aã]o pr[eé]via (?:dos administradores|da administra(?:ç|c)[aã]o)\./gi,
      ACCOUNT_DATA_PARAGRAPH,
    )
    .replace(
      /Qualquer altera(?:ç|c)[aã]o (?:feita|realizada) sem autoriza(?:ç|c)[aã]o poder[aá] resultar na perda da garantia\./gi,
      WARRANTY_LOSS_PARAGRAPH,
    );

  return body;
}

async function run() {
  if (!process.env.DATABASE_URL) {
    console.log('[manifest-portuguese] DATABASE_URL não configurada, pulando correção.');
    return;
  }

  const connection = await createConnection(process.env.DATABASE_URL);
  let transactionStarted = false;

  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`${BACKUP_TABLE}\` (
        \`settingKey\` VARCHAR(128) NOT NULL PRIMARY KEY,
        \`settingValue\` TEXT NULL,
        \`sourceUpdatedAt\` TIMESTAMP NULL,
        \`backedUpAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    const [rawRows] = await connection.query(
      'SELECT `settingKey`, `settingValue`, `updatedAt` FROM `siteSettings`',
    ) as any[];
    const rows = (Array.isArray(rawRows) ? rawRows : []) as SettingRow[];
    const manifestRows = rows.filter((row) => MANIFEST_KEY.test(String(row.settingKey || '')));

    let warrantyCount = 0;
    let changedCount = 0;
    let invalidJsonCount = 0;

    await connection.beginTransaction();
    transactionStarted = true;

    for (const row of manifestRows) {
      if (!row.settingValue) continue;

      let config: Record<string, unknown>;
      try {
        const parsed = JSON.parse(row.settingValue);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          invalidJsonCount += 1;
          console.warn(`[manifest-portuguese] Configuração ignorada por formato inválido: ${row.settingKey}`);
          continue;
        }
        config = parsed as Record<string, unknown>;
      } catch {
        invalidJsonCount += 1;
        console.warn(`[manifest-portuguese] JSON inválido ignorado: ${row.settingKey}`);
        continue;
      }

      const normalizedBody = normalizeWarrantyBody(config.body);
      if (normalizedBody === null) continue;
      warrantyCount += 1;

      const corrected = {
        ...config,
        title: TITLE,
        body: normalizedBody,
        acceptLabel: ACCEPT_LABEL,
        buttonLabel: BUTTON_LABEL,
      };
      const nextValue = JSON.stringify(corrected);
      if (nextValue === row.settingValue) continue;

      await connection.query(
        `INSERT IGNORE INTO \`${BACKUP_TABLE}\` (\`settingKey\`, \`settingValue\`, \`sourceUpdatedAt\`) VALUES (?, ?, ?)`,
        [row.settingKey, row.settingValue, row.updatedAt || null],
      );
      await connection.query(
        'UPDATE `siteSettings` SET `settingValue` = ? WHERE `settingKey` = ?',
        [nextValue, row.settingKey],
      );
      changedCount += 1;
      console.log(`[manifest-portuguese] Corrigido: ${row.settingKey}`);
    }

    await connection.commit();
    transactionStarted = false;

    console.log(
      `[manifest-portuguese] Auditoria concluída. manifestos=${manifestRows.length} garantias=${warrantyCount} corrigidos=${changedCount} json_invalidos=${invalidJsonCount}`,
    );
  } catch (error) {
    if (transactionStarted) {
      try { await connection.rollback(); } catch { /* rollback best effort */ }
    }
    console.error('[manifest-portuguese] Falha:', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

void run();
