import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createConnection, type Connection, type RowDataPacket } from 'mysql2/promise';

export const FAQ_IMPORT_KEY = 'faq_guidelines_import_20261020_v1';
export const faqGuidelines = JSON.parse(
  readFileSync(new URL('./data/faq-guidelines-20261020.json', import.meta.url), 'utf8'),
) as { title: string; subtitle: string; items: { question: string; answer: string }[] };

// This is a one-time import into the empty FAQ observed before publication.
// A persisted marker protects subsequent changes made through the admin panel.
export async function applyFaqGuidelines(connection: Connection) {
  const { title, subtitle, items } = faqGuidelines;
  if (items.length !== 28 || new Set(items.map(item => item.question)).size !== 28) {
    throw new Error('FAQ_IMPORT_INVALID_CONTENT');
  }
  for (const [index, item] of items.entries()) {
    if (!item.question.startsWith(`${index + 1}. `) || !item.answer.trim() ||
        item.answer.includes('**') || item.answer.includes('\\n')) {
      throw new Error('FAQ_IMPORT_INVALID_FORMAT');
    }
  }

  await connection.beginTransaction();
  try {
    // The existing unique settingKey serializes concurrent startup attempts.
    // Both this marker and all FAQ inserts are rolled back together on failure.
    await connection.execute(
      'INSERT INTO `siteSettings` (`settingKey`, `settingValue`) VALUES (?, ?) ' +
      'ON DUPLICATE KEY UPDATE `settingKey` = VALUES(`settingKey`)',
      [FAQ_IMPORT_KEY, 'pending'],
    );
    const [marker] = await connection.execute<RowDataPacket[]>(
      'SELECT `settingValue` FROM `siteSettings` WHERE `settingKey` = ? FOR UPDATE',
      [FAQ_IMPORT_KEY],
    );
    if (marker[0]?.settingValue === 'done') {
      await connection.commit();
      return { status: 'already-applied', inserted: 0 } as const;
    }
    if (marker[0]?.settingValue !== 'pending') throw new Error('FAQ_IMPORT_UNKNOWN_MARKER');

    // Public queries hide disabled items. Stop instead of overwriting any
    // pre-existing content, including disabled questions not visible publicly.
    const [existing] = await connection.query<RowDataPacket[]>(
      'SELECT `id`, `enabled` FROM `faqItems` FOR UPDATE',
    );
    if (existing.length > 0) {
      const active = existing.filter(item => item.enabled === 1).length;
      throw new Error(`FAQ_IMPORT_NOT_EMPTY total=${existing.length} active=${active}`);
    }

    for (const [index, item] of items.entries()) {
      await connection.execute(
        'INSERT INTO `faqItems` (`question`, `answer`, `order`, `enabled`) VALUES (?, ?, ?, 1)',
        [item.question, item.answer, index + 1],
      );
    }
    const [config] = await connection.query<RowDataPacket[]>(
      'SELECT `id` FROM `faqConfig` LIMIT 1 FOR UPDATE',
    );
    if (config.length === 0) {
      await connection.execute(
        'INSERT INTO `faqConfig` (`title`, `subtitle`, `buttonLabel`) VALUES (?, ?, ?)',
        [title, subtitle, 'Tire suas dúvidas'],
      );
    }
    await connection.execute(
      'UPDATE `siteSettings` SET `settingValue` = ? WHERE `settingKey` = ?',
      ['done', FAQ_IMPORT_KEY],
    );
    await connection.commit();
    return { status: 'applied', inserted: items.length } as const;
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('FAQ_IMPORT_DATABASE_URL_REQUIRED');
  const connection = await createConnection(databaseUrl);
  try {
    await connection.query('SET NAMES utf8mb4');
    const result = await applyFaqGuidelines(connection);
    console.log(`[faq-guidelines-20261020] ${result.status} inserted=${result.inserted}`);
  } finally {
    await connection.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    // Database error messages may contain connection details. Log only a code.
    const message = error instanceof Error ? error.message : '';
    const code = typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code) : 'FAILED';
    console.error('[faq-guidelines-20261020]', message.startsWith('FAQ_IMPORT_') ? message : code);
    process.exitCode = 1;
  });
}
