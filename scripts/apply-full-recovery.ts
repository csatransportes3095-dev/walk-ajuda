import { readFile } from "node:fs/promises";
import path from "node:path";
import { createConnection } from "mysql2/promise";

const ROOT = process.cwd();

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

async function tableExists(db: any, table: string) {
  const [rows]: any = await db.execute(
    "SELECT COUNT(*) AS total FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=?",
    [table],
  );
  return Number(rows?.[0]?.total || 0) > 0;
}

async function restoreCardData(db: any) {
  const sqlPath = path.resolve(ROOT, "scripts", "cc-data-import.sql");
  const raw = await readFile(sqlPath, "utf8");
  const statements = raw
    .replace(/^\uFEFF/, "")
    .replace(/^\s*--.*$/gm, "")
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => /^INSERT\s+IGNORE\s+INTO\s+/i.test(statement));

  let inserted = 0;
  let statementsRun = 0;
  await db.query("SET FOREIGN_KEY_CHECKS=0");
  try {
    for (const statement of statements) {
      const [result]: any = await db.query(statement);
      inserted += Number(result?.affectedRows || 0);
      statementsRun++;
    }
  } finally {
    await db.query("SET FOREIGN_KEY_CHECKS=1");
  }
  return { statementsRun, inserted };
}

async function insertRow(
  db: any,
  table: string,
  row: Record<string, unknown>,
  preferredId: number,
  usedIds: Set<number>,
) {
  const columns = Object.keys(row);
  const values = columns.map((column) => row[column]);
  const keepId = preferredId > 0 && !usedIds.has(preferredId);
  const allColumns = keepId ? ["id", ...columns] : columns;
  const allValues = keepId ? [preferredId, ...values] : values;
  const [result]: any = await db.execute(
    `INSERT INTO \`${table}\` (${allColumns.map((column) => `\`${column}\``).join(",")}) VALUES (${allColumns.map(() => "?").join(",")})`,
    allValues,
  );
  const id = keepId ? preferredId : Number(result?.insertId || 0);
  if (id) usedIds.add(id);
  return id;
}

async function restoreCatalog(db: any) {
  const requiredTables = ["products", "productOptions", "productQuestions", "optionDocuments"];
  for (const table of requiredTables) {
    if (!(await tableExists(db, table))) {
      return { skipped: `tabela ${table} ausente` };
    }
  }

  const reportPath = path.resolve(ROOT, "reports", "auditoria_catalogo_produtos.json");
  const source = JSON.parse(await readFile(reportPath, "utf8"));
  const summary = { productsInserted: 0, optionsInserted: 0, questionsInserted: 0, documentsInserted: 0 };

  const [productRows]: any = await db.query("SELECT id,name FROM products");
  const products: any[] = Array.isArray(productRows) ? productRows : [];
  const productIds = new Set(products.map((row) => Number(row.id)));
  const productMap = new Map<number, number>();

  for (const sourceProduct of source) {
    const sourceId = Number(sourceProduct.productId || 0);
    const sourceName = normalize(sourceProduct.produto);
    let current = products.find((row) => Number(row.id) === sourceId && normalize(row.name) === sourceName);
    if (!current) current = products.find((row) => normalize(row.name) === sourceName);
    if (!current) {
      const id = await insertRow(db, "products", {
        name: sourceProduct.produto,
        description: sourceProduct.descricao ?? null,
        isActive: sourceProduct.ativo ? 1 : 0,
      }, sourceId, productIds);
      current = { id, name: sourceProduct.produto };
      products.push(current);
      summary.productsInserted++;
    }
    productMap.set(sourceId, Number(current.id));
  }

  const [optionRows]: any = await db.query("SELECT id,productId,label FROM productOptions");
  const options: any[] = Array.isArray(optionRows) ? optionRows : [];
  const optionIds = new Set(options.map((row) => Number(row.id)));
  const optionMap = new Map<number, number>();

  for (const sourceProduct of source) {
    const productId = productMap.get(Number(sourceProduct.productId));
    if (!productId) continue;
    for (const sourceOption of sourceProduct.opcoes || []) {
      const sourceId = Number(sourceOption.optionId || 0);
      const sourceLabel = normalize(sourceOption.opcao);
      let current = options.find((row) => Number(row.id) === sourceId && Number(row.productId) === productId && normalize(row.label) === sourceLabel);
      if (!current) current = options.find((row) => Number(row.productId) === productId && normalize(row.label) === sourceLabel);
      if (!current) {
        const id = await insertRow(db, "productOptions", {
          productId,
          label: sourceOption.opcao,
          price: sourceOption.preco || "0,00",
          originalPrice: sourceOption.precoOriginal || "",
          type: sourceOption.tipo || "standard",
          isActive: sourceOption.ativo ? 1 : 0,
        }, sourceId, optionIds);
        current = { id, productId, label: sourceOption.opcao };
        options.push(current);
        summary.optionsInserted++;
      }
      optionMap.set(sourceId, Number(current.id));
    }
  }

  const [questionRows]: any = await db.query("SELECT id,optionId,question FROM productQuestions");
  const questions: any[] = Array.isArray(questionRows) ? questionRows : [];
  const questionIds = new Set(questions.map((row) => Number(row.id)));
  const allowedTypes = new Set(["text", "select", "textarea", "audio"]);

  const [documentRows]: any = await db.query("SELECT id,optionId,label FROM optionDocuments");
  const documents: any[] = Array.isArray(documentRows) ? documentRows : [];
  const documentIds = new Set(documents.map((row) => Number(row.id)));

  for (const sourceProduct of source) {
    const productId = productMap.get(Number(sourceProduct.productId));
    if (!productId) continue;
    for (const sourceOption of sourceProduct.opcoes || []) {
      const optionId = optionMap.get(Number(sourceOption.optionId));
      if (!optionId) continue;

      let questionOrder = 0;
      for (const sourceQuestion of sourceOption.perguntas || []) {
        questionOrder++;
        const sourceId = Number(sourceQuestion.questionId || 0);
        const sourceText = normalize(sourceQuestion.pergunta);
        let current = questions.find((row) => Number(row.id) === sourceId && Number(row.optionId) === optionId && normalize(row.question) === sourceText);
        if (!current) current = questions.find((row) => Number(row.optionId) === optionId && normalize(row.question) === sourceText);
        if (!current) {
          const requestedType = String(sourceQuestion.tipo || "text");
          const id = await insertRow(db, "productQuestions", {
            productId,
            optionId,
            question: sourceQuestion.pergunta,
            fieldType: allowedTypes.has(requestedType) ? requestedType : "text",
            options: null,
            isRequired: sourceQuestion.obrigatoria ? 1 : 0,
            sortOrder: questionOrder,
          }, sourceId, questionIds);
          current = { id, optionId, question: sourceQuestion.pergunta };
          questions.push(current);
          summary.questionsInserted++;
        }
      }

      let documentOrder = 0;
      for (const sourceDocument of sourceOption.documentos || []) {
        documentOrder++;
        const sourceId = Number(sourceDocument.documentId || 0);
        const sourceLabel = normalize(sourceDocument.documento);
        let current = documents.find((row) => Number(row.id) === sourceId && Number(row.optionId) === optionId && normalize(row.label) === sourceLabel);
        if (!current) current = documents.find((row) => Number(row.optionId) === optionId && normalize(row.label) === sourceLabel);
        if (!current) {
          const inputSource = ["camera", "gallery", "both"].includes(String(sourceDocument.origem)) ? sourceDocument.origem : "both";
          const id = await insertRow(db, "optionDocuments", {
            optionId,
            label: sourceDocument.documento,
            inputSource,
            sortOrder: documentOrder,
          }, sourceId, documentIds);
          current = { id, optionId, label: sourceDocument.documento };
          documents.push(current);
          summary.documentsInserted++;
        }
      }
    }
  }

  return summary;
}

async function restorePreRegistrationQuestions(db: any) {
  if (!(await tableExists(db, "preCadastroQuestions"))) return { skipped: "tabela ausente" };

  const rows = [
    [1, "Nome Completo", "fullName", "text", "Seu nome completo", null, 1, 1, 1, 1],
    [2, "E-mail", "email", "email", "seu@email.com", null, 1, 1, 2, 1],
    [3, "CPF", "cpf", "cpf", "000.000.000-00", null, 1, 1, 3, 1],
    [4, "Quantas contas fake já fez com seu Rosto ?", "fakeAccountsCount", "number", "0", null, 1, 1, 4, 1],
    [5, "Qual aparelho de celular você pretende usar?", "deviceType", "select", null, "android,iphone", 1, 1, 5, 1],
    [6, "Óculos com lente transparente é obrigatório. Você aceita essa condição?", "acceptsGlasses", "radio", null, "sim,nao", 1, 1, 6, 1],
    [7, "Foto de perfil com horário agendado. Você aceita essa condição?", "acceptsScheduledPhoto", "radio", null, "sim,nao", 1, 1, 7, 1],
    [8, "Quem te indicou? (Nome)", "referralName", "text", "Nome de quem te indicou", null, 0, 1, 8, 1],
    [9, "Quem te indicou ? (Telefone/WhatsApp)", "referralPhone", "phone", "(00) 00000-0000", null, 0, 1, 9, 1],
    [30002, "WhatsApp Numero que fala com adm", "phone", "phone", "(00) 00000-0000", null, 1, 1, 10, 0],
    [60001, "Qual conta pretende?", "contaprentende", "text", null, null, 1, 1, 11, 0],
  ];

  let inserted = 0;
  for (const row of rows) {
    const [id, label, fieldKey, fieldType, placeholder, options, required, active, sortOrder, isSystem] = row;
    const [existing]: any = await db.execute(
      "SELECT id FROM preCadastroQuestions WHERE id=? OR fieldKey=? LIMIT 1",
      [id, fieldKey],
    );
    if (Array.isArray(existing) && existing.length) continue;
    await db.execute(
      `INSERT INTO preCadastroQuestions
       (id,label,fieldKey,fieldType,placeholder,options,required,active,sortOrder,parentQuestionId,triggerOption,isSystem,createdAt,updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,NULL,NULL,?,NOW(),NOW())`,
      [id, label, fieldKey, fieldType, placeholder, options, required, active, sortOrder, isSystem],
    );
    inserted++;
  }
  return { inserted };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("[full-recovery] DATABASE_URL ausente; pulando.");
    return;
  }

  const db = await createConnection(process.env.DATABASE_URL);
  const summary: Record<string, unknown> = {};
  try {
    try {
      summary.cards = await restoreCardData(db);
    } catch (error) {
      summary.cards = { error: error instanceof Error ? error.message : String(error) };
    }
    try {
      summary.catalog = await restoreCatalog(db);
    } catch (error) {
      summary.catalog = { error: error instanceof Error ? error.message : String(error) };
    }
    try {
      summary.preRegistration = await restorePreRegistrationQuestions(db);
    } catch (error) {
      summary.preRegistration = { error: error instanceof Error ? error.message : String(error) };
    }
    console.log("[full-recovery] concluída sem apagar dados atuais:", JSON.stringify(summary));
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error("[full-recovery] falha não bloqueante:", error instanceof Error ? error.message : String(error));
});
