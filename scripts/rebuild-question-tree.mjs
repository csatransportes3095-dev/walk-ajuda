import { readFile } from "node:fs/promises";
import { createConnection } from "mysql2/promise";

const normalize = value => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/\s+/g, " ")
  .trim()
  .toUpperCase();

const json = values => JSON.stringify(values);
const yesNo = json(["SIM", "NÃO"]);
const brands = [
  "VOLKSWAGEN", "FIAT", "CHEVROLET", "HYUNDAI", "TOYOTA", "RENAULT",
  "NISSAN", "HONDA", "JEEP", "BYD", "CAOA CHERY", "GWM", "CITROËN",
  "PEUGEOT", "FORD", "KIA", "MITSUBISHI", "JAC MOTORS", "GEELY",
];
const colors = [
  "BRANCO", "PRETO", "PRATA", "CINZA", "VERMELHO", "AZUL",
  "VERDE", "AMARELO", "MARROM", "BEGE", "OUTRA",
];
const years = Array.from({ length: 11 }, (_, index) => String(2026 - index));

function optionsFor(question, productName) {
  const q = normalize(question);
  const product = normalize(productName);
  if (q.includes("QUAL APARELHO")) return json(["ANDROID", "IPHONE"]);
  if (q.startsWith("QUANTAS")) return json(["1", "2", "3", "4 OU MAIS"]);
  if (q.includes("QUAL A MARCA")) return json(brands);
  if (q.includes("QUAL E A COR")) return json(colors);
  if (q.includes("QUAL E O ANO")) return json(years);
  if (q.includes("QUAL CATEGORIA")) {
    return product.includes("99 APP")
      ? json(["99 POP", "99 MOTO"])
      : json(["UBER X", "UBER COMFORT", "UBER BLACK", "UBER MOTO"]);
  }
  return yesNo;
}

function findByText(rows, fragment) {
  const wanted = normalize(fragment);
  return rows.find(row => normalize(row.question).includes(wanted));
}

async function updateQuestion(db, id, values) {
  const entries = Object.entries(values).filter(([, value]) => value !== undefined);
  if (entries.length === 0) return;
  await db.execute(
    `UPDATE productQuestions SET ${entries.map(([key]) => `\`${key}\`=?`).join(",")} WHERE id=?`,
    [...entries.map(([, value]) => value), id],
  );
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL ausente");
  const report = JSON.parse(await readFile("reports/auditoria_catalogo_produtos.json", "utf8"));
  const db = await createConnection(process.env.DATABASE_URL);
  let inserted = 0;
  let updated = 0;

  try {
    await db.beginTransaction();
    await db.query("CREATE TABLE IF NOT EXISTS productQuestions_backup_20260824 LIKE productQuestions");
    await db.query("INSERT IGNORE INTO productQuestions_backup_20260824 SELECT * FROM productQuestions");

    const [existingRows] = await db.query("SELECT id FROM productQuestions");
    const existingIds = new Set(existingRows.map(row => Number(row.id)));

    for (const product of report) {
      for (const option of product.opcoes ?? []) {
        let order = 0;
        for (const question of option.perguntas ?? []) {
          order += 1;
          const id = Number(question.questionId);
          if (existingIds.has(id)) continue;
          await db.execute(
            `INSERT INTO productQuestions
             (id,productId,optionId,question,fieldType,options,isRequired,sortOrder,parentQuestionId,triggerOption)
             VALUES (?,?,?,?,?,?,?, ?,NULL,NULL)`,
            [
              id,
              Number(product.productId),
              Number(option.optionId),
              question.pergunta,
              question.tipo === "textarea" ? "textarea" : question.tipo === "audio" ? "audio" : question.tipo === "select" ? "select" : "text",
              question.tipo === "select" ? optionsFor(question.pergunta, product.produto) : null,
              question.obrigatoria ? 1 : 0,
              order,
            ],
          );
          existingIds.add(id);
          inserted += 1;
        }
      }
    }

    const [allRows] = await db.query(
      `SELECT q.id,q.productId,q.optionId,q.question,q.fieldType,p.name AS productName
       FROM productQuestions q
       LEFT JOIN products p ON p.id=q.productId
       ORDER BY q.optionId,q.sortOrder,q.id`,
    );
    const byOption = new Map();
    for (const row of allRows) {
      const key = Number(row.optionId);
      if (!byOption.has(key)) byOption.set(key, []);
      byOption.get(key).push(row);
    }

    for (const rows of byOption.values()) {
      for (const row of rows) {
        if (row.fieldType === "select") {
          await updateQuestion(db, row.id, { options: optionsFor(row.question, row.productName) });
          updated += 1;
        }
      }

      const fake = findByText(rows, "TEVE ALGUMA CONTA FAKE");
      const count = findByText(rows, "QUANTAS");
      const original = findByText(rows, "TEVE ORIGINAL");
      const impossibleWithout = findByText(rows, "NAO E POSSIVEL FAZER SEM");
      const device = findByText(rows, "QUAL APARELHO");
      const android = findByText(rows, "NO ANDROID");
      const iphone = findByText(rows, "NO IPHONE");
      const phoneOnlyWork = findByText(rows, "USO PARTICULAR SOMENTE PARA O TRAMPO");
      const glasses = findByText(rows, "OCULOS DE SOL SEM AS LENTES ACEITA");
      const impossibleAccount = findByText(rows, "NAO E POSSIVEL FAZER SUA CONTA");
      const informedGlasses = findByText(rows, "ACEITA USAR OCULOS INFORMADO");
      const mandatoryGlasses = findByText(rows, "OBRIGATORIO OCULOS DE SOL SEM AS LENTES");
      const newCustomer = findByText(rows, "VOCE E CLIENTE NOVO");
      const referralPhone = findByText(rows, "TELEFONE DE QUEM INDICOU");

      if (fake && count) await updateQuestion(db, count.id, { parentQuestionId: fake.id, triggerOption: "SIM" });
      if (count && original) await updateQuestion(db, original.id, { parentQuestionId: count.id, triggerOption: null });
      if (original && impossibleWithout) await updateQuestion(db, impossibleWithout.id, { parentQuestionId: original.id, triggerOption: "NÃO" });
      if (device && android) await updateQuestion(db, android.id, { parentQuestionId: device.id, triggerOption: "ANDROID" });
      if (device && iphone) await updateQuestion(db, iphone.id, { parentQuestionId: device.id, triggerOption: "IPHONE" });
      if (android && phoneOnlyWork) await updateQuestion(db, phoneOnlyWork.id, { parentQuestionId: android.id, triggerOption: "SIM" });
      if (glasses && impossibleAccount) await updateQuestion(db, impossibleAccount.id, { parentQuestionId: glasses.id, triggerOption: "NÃO" });
      if (informedGlasses && mandatoryGlasses) await updateQuestion(db, mandatoryGlasses.id, { parentQuestionId: informedGlasses.id, triggerOption: "SIM" });
      if (newCustomer && referralPhone) await updateQuestion(db, referralPhone.id, { parentQuestionId: newCustomer.id, triggerOption: "SIM" });

      const had99 = findByText(rows, "99 POP VOCE JA TEVE CONTA");
      const modifiedPhoto = findByText(rows, "FOTO E MODIFICADA ACEITA");
      const shortDuration = findByText(rows, "NAO DURA MAIS DE 3 DIAS");
      if (had99 && modifiedPhoto) await updateQuestion(db, modifiedPhoto.id, { parentQuestionId: had99.id, triggerOption: "SIM" });
      if (modifiedPhoto && shortDuration) await updateQuestion(db, shortDuration.id, { parentQuestionId: modifiedPhoto.id, triggerOption: "SIM" });

      const brand = findByText(rows, "QUAL A MARCA");
      if (brand) {
        const models = rows.filter(row => normalize(row.question).includes("MODELO DO VEICULO"));
        for (let index = 0; index < models.length; index += 1) {
          await updateQuestion(db, models[index].id, {
            fieldType: "text",
            options: null,
            parentQuestionId: brand.id,
            triggerOption: brands[index] ?? brands[brands.length - 1],
          });
        }
      }
    }

    await db.commit();
    const [[summary]] = await db.query(
      `SELECT COUNT(*) AS total,
              SUM(options IS NOT NULL AND LENGTH(options)>0) AS comOpcoes,
              SUM(parentQuestionId IS NOT NULL) AS subperguntas
       FROM productQuestions`,
    );
    const [[nested]] = await db.query(
      `SELECT COUNT(*) AS subDasSubs
       FROM productQuestions child
       JOIN productQuestions parent ON parent.id=child.parentQuestionId
       WHERE parent.parentQuestionId IS NOT NULL`,
    );
    console.log("ARVORE RECONSTRUIDA", {
      inserted,
      updated,
      total: Number(summary.total),
      comOpcoes: Number(summary.comOpcoes || 0),
      subperguntas: Number(summary.subperguntas || 0),
      subDasSubs: Number(nested.subDasSubs || 0),
    });
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    await db.end();
  }
}

main().catch(error => {
  console.error("FALHA NA RECONSTRUCAO", error);
  process.exit(1);
});
