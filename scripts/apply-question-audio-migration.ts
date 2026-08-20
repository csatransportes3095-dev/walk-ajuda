import { createConnection } from "mysql2/promise";

async function hasColumn(connection: Awaited<ReturnType<typeof createConnection>>, table: string, column: string) {
  const [rows] = await connection.query(`SHOW COLUMNS FROM \`${table}\` LIKE ?`, [column]) as any[];
  return Array.isArray(rows) && rows.length > 0;
}

async function addColumnIfMissing(connection: Awaited<ReturnType<typeof createConnection>>, table: string, column: string, definition: string) {
  if (await hasColumn(connection, table, column)) return;
  await connection.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  console.log(`[question-audio-migrate] Coluna adicionada: ${table}.${column}`);
}

async function run() {
  if (!process.env.DATABASE_URL) {
    console.log("[question-audio-migrate] DATABASE_URL não configurada, pulando migration.");
    return;
  }

  const connection = await createConnection(process.env.DATABASE_URL);
  try {
    const [fieldRows] = await connection.query("SHOW COLUMNS FROM `productQuestions` LIKE 'fieldType'") as any[];
    const fieldType = fieldRows?.[0]?.Type || "";
    if (!String(fieldType).includes("'audio'")) {
      await connection.query("ALTER TABLE `productQuestions` MODIFY COLUMN `fieldType` ENUM('text','select','textarea','audio') NOT NULL DEFAULT 'text'");
      console.log("[question-audio-migrate] Enum productQuestions.fieldType atualizado.");
    }

    await addColumnIfMissing(connection, "productQuestions", "helpText", "TEXT NULL");
    await addColumnIfMissing(connection, "productQuestions", "audioMinDurationSeconds", "INT NOT NULL DEFAULT 1");
    await addColumnIfMissing(connection, "productQuestions", "audioMaxDurationSeconds", "INT NOT NULL DEFAULT 120");
    await addColumnIfMissing(connection, "productQuestions", "allowAudioRerecord", "INT NOT NULL DEFAULT 1");
    await addColumnIfMissing(connection, "productQuestions", "allowAudioFileUpload", "INT NOT NULL DEFAULT 1");
    // Áudio usado para apresentar o enunciado, independente do tipo de resposta escolhido.
    await addColumnIfMissing(connection, "productQuestions", "questionPresentation", "VARCHAR(16) NOT NULL DEFAULT 'text'");
    await addColumnIfMissing(connection, "productQuestions", "questionAudioUrl", "TEXT NULL");
    await addColumnIfMissing(connection, "productQuestions", "questionAudioStorageKey", "VARCHAR(512) NULL");
    await addColumnIfMissing(connection, "productQuestions", "showQuestionTextWithAudio", "INT NOT NULL DEFAULT 0");

    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`questionAudioDrafts\` (
        \`id\` varchar(64) NOT NULL,
        \`flowId\` varchar(64) NOT NULL,
        \`customerPhone\` varchar(32) NOT NULL,
        \`productId\` int NOT NULL,
        \`optionId\` int NOT NULL,
        \`questionId\` int NOT NULL,
        \`storageKey\` varchar(512) NOT NULL,
        \`audioUrl\` text NOT NULL,
        \`mimeType\` varchar(128) NOT NULL,
        \`fileSize\` int NOT NULL,
        \`durationSeconds\` int NOT NULL,
        \`expiresAt\` timestamp NOT NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`idx_question_audio_draft_flow\` (\`flowId\`),
        KEY \`idx_question_audio_draft_question\` (\`questionId\`),
        KEY \`idx_question_audio_draft_expiry\` (\`expiresAt\`)
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`orderQuestionAudioAnswers\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`registrationId\` int NOT NULL,
        \`orderStatusId\` int NOT NULL,
        \`customerPhone\` varchar(32) NOT NULL,
        \`productId\` int NOT NULL,
        \`optionId\` int NOT NULL,
        \`questionId\` int NOT NULL,
        \`storageKey\` varchar(512) NOT NULL,
        \`audioUrl\` text NOT NULL,
        \`mimeType\` varchar(128) NOT NULL,
        \`fileSize\` int NOT NULL,
        \`durationSeconds\` int NOT NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_order_question_audio\` (\`orderStatusId\`, \`questionId\`),
        KEY \`idx_order_question_audio_registration\` (\`registrationId\`),
        KEY \`idx_order_question_audio_question\` (\`questionId\`)
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);

    console.log("[question-audio-migrate] Estrutura de áudio verificada com sucesso.");
  } catch (error) {
    console.error("[question-audio-migrate] Falha:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

void run();
