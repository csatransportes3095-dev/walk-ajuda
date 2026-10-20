import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createConnection, type Connection, type RowDataPacket } from 'mysql2/promise';
import { applyFaqGuidelines, FAQ_IMPORT_KEY, faqGuidelines } from './apply-faq-guidelines-20261020';

const testDatabaseUrl = process.env.FAQ_TEST_DATABASE_URL;
if (!testDatabaseUrl) throw new Error('FAQ_TEST_DATABASE_URL is required');
const target = new URL(testDatabaseUrl);
if (target.hostname !== '127.0.0.1' || target.pathname !== '/faq_guidelines_test') {
  throw new Error('These tests require the isolated localhost FAQ test database');
}

describe('FAQ import into the existing MySQL schema', { concurrency: false }, () => {
  let connection: Connection;

  beforeEach(async () => {
    connection = await createConnection(testDatabaseUrl);
    await connection.query('SET NAMES utf8mb4');
    await connection.query('DROP TABLE IF EXISTS faqItems, faqConfig, siteSettings');
    await connection.query(`
      CREATE TABLE siteSettings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        settingKey VARCHAR(128) NOT NULL UNIQUE,
        settingValue TEXT,
        updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await connection.query(`
      CREATE TABLE faqItems (
        id INT AUTO_INCREMENT PRIMARY KEY,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        \`order\` INT NOT NULL DEFAULT 0,
        enabled INT NOT NULL DEFAULT 1,
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await connection.query(`
      CREATE TABLE faqConfig (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(256) NOT NULL DEFAULT 'Legacy title',
        subtitle VARCHAR(512),
        buttonLabel VARCHAR(128) NOT NULL DEFAULT 'Legacy label',
        buttonColor VARCHAR(32) NOT NULL DEFAULT '#8b5cf6',
        buttonTextColor VARCHAR(32) NOT NULL DEFAULT '#ffffff',
        headerColor VARCHAR(32) NOT NULL DEFAULT '#1e1b4b',
        headerTextColor VARCHAR(32) NOT NULL DEFAULT '#ffffff',
        accentColor VARCHAR(32) NOT NULL DEFAULT '#8b5cf6',
        enabled INT NOT NULL DEFAULT 1,
        updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  });

  afterEach(async () => { await connection?.end(); });

  async function rows(sql: string, values: unknown[] = []) {
    const [result] = await connection.query<RowDataPacket[]>(sql, values);
    return JSON.parse(JSON.stringify(result));
  }

  it('imports all 28 approved questions in order with real mobile paragraph breaks', async () => {
    assert.deepEqual(await applyFaqGuidelines(connection), { status: 'applied', inserted: 28 });
    const items = await rows('SELECT question, answer, `order`, enabled FROM faqItems ORDER BY `order`, id');
    assert.deepEqual(items, faqGuidelines.items.map((item, index) => ({
      ...item, order: index + 1, enabled: 1,
    })));
    assert.match(items[0].answer, /novo ou usado, desde que nunca tenha sido utilizado na Uber/);
    assert.match(items[7].answer, /chip deve ser novo, sem uso anterior/);
    assert.equal(items[8].answer,
      'NÃO. Após o HARD RESET, o aparelho JAMAIS poderá ser conectado a qualquer rede Wi-Fi.\n\n' +
      'O Wi-Fi deve permanecer SEMPRE DESLIGADO, mesmo depois de concluir o procedimento.');
    assert.equal(items[22].answer,
      'A previsão é de 3 a 5 dias.\n\n' +
      'Esse período é uma estimativa, podendo levar mais ou menos tempo.');
    const [config] = await rows('SELECT * FROM faqConfig');
    assert.equal(config.title, faqGuidelines.title);
    assert.equal(config.subtitle, faqGuidelines.subtitle);
    assert.equal(config.buttonLabel, 'Tire suas dúvidas');
    assert.equal(config.enabled, 1);
  });

  it('preserves an existing visual configuration', async () => {
    await connection.query(
      "INSERT INTO faqConfig (title, subtitle, buttonLabel, accentColor, enabled) VALUES ('Título existente', 'Subtítulo existente', 'Ajuda', '#123456', 0)",
    );
    const before = await rows('SELECT * FROM faqConfig');
    await applyFaqGuidelines(connection);
    assert.deepEqual(await rows('SELECT * FROM faqConfig'), before);
  });

  it('does not overwrite later edits, additions, deletions or visibility changes', async () => {
    await applyFaqGuidelines(connection);
    await connection.query("UPDATE faqItems SET answer = 'Editado pelo painel', enabled = 0 WHERE `order` = 1");
    await connection.query('DELETE FROM faqItems WHERE `order` = 28');
    await connection.query("INSERT INTO faqItems (question, answer, `order`) VALUES ('Outra dúvida', 'Outra resposta', 99)");
    await connection.query("UPDATE faqConfig SET title = 'Título editado'");
    const before = await rows('SELECT * FROM faqItems ORDER BY id');
    const configBefore = await rows('SELECT * FROM faqConfig');
    assert.deepEqual(await applyFaqGuidelines(connection), { status: 'already-applied', inserted: 0 });
    assert.deepEqual(await rows('SELECT * FROM faqItems ORDER BY id'), before);
    assert.deepEqual(await rows('SELECT * FROM faqConfig'), configBefore);
  });

  it('stops safely if even one disabled FAQ already exists', async () => {
    await connection.query("INSERT INTO faqItems (question, answer, enabled) VALUES ('Pergunta arquivada', 'Preservar', 0)");
    const before = await rows('SELECT * FROM faqItems');
    await assert.rejects(applyFaqGuidelines(connection), /FAQ_IMPORT_NOT_EMPTY total=1 active=0/);
    assert.deepEqual(await rows('SELECT * FROM faqItems'), before);
    assert.deepEqual(await rows('SELECT * FROM faqConfig'), []);
    assert.deepEqual(await rows('SELECT * FROM siteSettings WHERE settingKey = ?', [FAQ_IMPORT_KEY]), []);
  });

  it('rolls back partial inserts and the marker when a database write fails', async () => {
    await connection.query(`
      CREATE TRIGGER fail_faq_import BEFORE INSERT ON faqItems FOR EACH ROW
      BEGIN
        IF NEW.\`order\` = 14 THEN
          SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Injected test failure';
        END IF;
      END
    `);
    await assert.rejects(applyFaqGuidelines(connection), /Injected test failure/);
    assert.deepEqual(await rows('SELECT * FROM faqItems'), []);
    assert.deepEqual(await rows('SELECT * FROM faqConfig'), []);
    assert.deepEqual(await rows('SELECT * FROM siteSettings'), []);
  });

  it('serializes simultaneous startup attempts without duplicate questions', async () => {
    const otherConnection = await createConnection(testDatabaseUrl);
    try {
      await otherConnection.query('SET NAMES utf8mb4');
      const results = await Promise.all([
        applyFaqGuidelines(connection), applyFaqGuidelines(otherConnection),
      ]);
      assert.deepEqual(results.map(result => result.status).sort(), ['already-applied', 'applied']);
      const [count] = await rows('SELECT COUNT(*) AS total FROM faqItems');
      assert.equal(count.total, 28);
      const markers = await rows('SELECT settingValue FROM siteSettings WHERE settingKey = ?', [FAQ_IMPORT_KEY]);
      assert.deepEqual(markers, [{ settingValue: 'done' }]);
    } finally {
      await otherConnection.end();
    }
  });
});
