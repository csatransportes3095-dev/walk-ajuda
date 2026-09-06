import { createConnection } from "mysql2/promise";

async function run() {
  if (!process.env.DATABASE_URL) {
    console.log("[diamond-profile] DATABASE_URL ausente; correção ignorada.");
    return;
  }

  const db = await createConnection(process.env.DATABASE_URL);
  try {
    const [tables] = await db.execute<any[]>(
      "SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='loanProfiles'"
    );
    if (!Number(tables?.[0]?.cnt || 0)) {
      console.log("[diamond-profile] tabela loanProfiles ainda não existe; aguardando migração principal.");
      return;
    }

    const [existing] = await db.execute<any[]>(
      "SELECT id FROM loanProfiles WHERE slug='diamante' LIMIT 1"
    );
    if (Array.isArray(existing) && existing.length > 0) {
      console.log("[diamond-profile] perfil Diamante já existe.");
      return;
    }

    // O Diamante nasce copiando os valores ATUAIS do Ouro para não inventar taxa,
    // limite ou prazo novo. Depois disso o ADM pode configurar tudo pelo ícone de engrenagem.
    const [result]: any = await db.execute(`
      INSERT INTO loanProfiles
        (name, slug, creditLimit, interestRate, maxDays, isActive, sortOrder,
         defaultPaymentTypes, maxDaysSemanal, maxDaysQuinzenal, maxDaysMensal)
      SELECT
        'Diamante', 'diamante', creditLimit, interestRate, maxDays, 1,
        COALESCE(sortOrder, 0) + 1,
        defaultPaymentTypes, maxDaysSemanal, maxDaysQuinzenal, maxDaysMensal
      FROM loanProfiles
      WHERE slug='ouro'
        AND NOT EXISTS (SELECT 1 FROM loanProfiles WHERE slug='diamante')
      LIMIT 1
    `);

    if (Number(result?.affectedRows || 0) !== 1) {
      throw new Error("Perfil Ouro não encontrado para servir como base do Diamante.");
    }

    console.log("[diamond-profile] perfil Diamante criado com sucesso a partir dos valores atuais do Ouro.");
  } finally {
    await db.end();
  }
}

run().catch((error) => {
  console.error("[diamond-profile] falha:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
