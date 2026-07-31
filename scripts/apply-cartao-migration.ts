// Script de migração automática do sistema de cartões de crédito
// Cria as tabelas cc_* e importa os dados do dump original
// Idempotente: usa CREATE TABLE IF NOT EXISTS e INSERT IGNORE

import { createConnection } from "mysql2/promise";
import { readFile } from "node:fs/promises";
import path from "node:path";

async function run() {
  if (!process.env.DATABASE_URL) {
    console.log("[cc-migrate] DATABASE_URL não configurada, pulando migração.");
    return;
  }

  const connection = await createConnection(process.env.DATABASE_URL);

  try {
    console.log("[cc-migrate] Iniciando migração do sistema de cartões...");

    await connection.query(`SET FOREIGN_KEY_CHECKS = 0`);

    // ── Criar tabelas ──────────────────────────────────────────────────────
    await connection.query(`
      CREATE TABLE IF NOT EXISTS cc_app_users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        phone VARCHAR(20) NOT NULL UNIQUE,
        passwordHash VARCHAR(255) NOT NULL,
        name VARCHAR(100),
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS cc_cartoes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        userId INT NOT NULL,
        nome VARCHAR(100) NOT NULL,
        vencimentoDia INT NOT NULL,
        fechamentoDia INT,
        limiteTotal DECIMAL(10,2) NOT NULL,
        corCartao VARCHAR(20) DEFAULT 'blue' NOT NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
        FOREIGN KEY (userId) REFERENCES cc_app_users(id) ON DELETE CASCADE
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS cc_categorias (
        id INT AUTO_INCREMENT PRIMARY KEY,
        userId INT NOT NULL,
        nome VARCHAR(100) NOT NULL,
        icone VARCHAR(10) DEFAULT 'tag' NOT NULL,
        cor VARCHAR(30) DEFAULT 'gray' NOT NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        FOREIGN KEY (userId) REFERENCES cc_app_users(id) ON DELETE CASCADE
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS cc_parcelamentos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        cartaoId INT NOT NULL,
        descricao VARCHAR(200) NOT NULL,
        valorTotal DECIMAL(10,2) NOT NULL,
        valorParcela DECIMAL(10,2) NOT NULL,
        numParcelas INT NOT NULL,
        dataInicio TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        responsavel VARCHAR(100),
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        FOREIGN KEY (cartaoId) REFERENCES cc_cartoes(id) ON DELETE CASCADE
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS cc_gastos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        cartaoId INT NOT NULL,
        descricao VARCHAR(200) NOT NULL,
        valor DECIMAL(10,2) NOT NULL,
        data TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        parcelamentoId INT,
        numeroParcela INT,
        totalParcelas INT,
        dataOriginal TIMESTAMP NULL,
        paga INT DEFAULT 0 NOT NULL,
        responsavel VARCHAR(100),
        categoriaId INT,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        FOREIGN KEY (cartaoId) REFERENCES cc_cartoes(id) ON DELETE CASCADE,
        FOREIGN KEY (parcelamentoId) REFERENCES cc_parcelamentos(id) ON DELETE CASCADE,
        FOREIGN KEY (categoriaId) REFERENCES cc_categorias(id) ON DELETE SET NULL
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS cc_pagamentos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        cartaoId INT NOT NULL,
        valorPago DECIMAL(10,2) NOT NULL,
        dataPagamento TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        observacao VARCHAR(200),
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        FOREIGN KEY (cartaoId) REFERENCES cc_cartoes(id) ON DELETE CASCADE
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS cc_despesas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        userId INT NOT NULL,
        nome VARCHAR(100) NOT NULL,
        categoriaId INT,
        valor DECIMAL(10,2),
        diaVencimento INT,
        ativa INT DEFAULT 1 NOT NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
        FOREIGN KEY (userId) REFERENCES cc_app_users(id) ON DELETE CASCADE,
        FOREIGN KEY (categoriaId) REFERENCES cc_categorias(id) ON DELETE SET NULL
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS cc_pagamentos_despesas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        despesaId INT NOT NULL,
        userId INT NOT NULL,
        mes INT NOT NULL,
        ano INT NOT NULL,
        valorPago DECIMAL(10,2),
        dataPagamento TIMESTAMP NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        FOREIGN KEY (despesaId) REFERENCES cc_despesas(id) ON DELETE CASCADE,
        FOREIGN KEY (userId) REFERENCES cc_app_users(id) ON DELETE CASCADE
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);

    console.log("[cc-migrate] Tabelas criadas/verificadas.");

    // ── Verificar se já há dados ───────────────────────────────────────────
    const [rows] = await connection.query(`SELECT COUNT(*) as cnt FROM cc_app_users`) as any[];
    const userCount = Number(rows[0]?.cnt || 0);

    if (userCount > 0) {
      // Verificar se as cores dos cartões estão corretas (bug: colunas trocadas na primeira migração)
      const [cartaoCheck] = await connection.query(`SELECT corCartao FROM cc_cartoes LIMIT 1`) as any[];
      const primeiraCorCartao = cartaoCheck[0]?.corCartao;
      const coresValidas = ['purple','blue','red','green','orange','pink','teal','indigo','violet'];
      const corEhNumerica = primeiraCorCartao && !coresValidas.includes(primeiraCorCartao);
      
      if (corEhNumerica) {
        console.log(`[cc-migrate] Detectado bug de colunas trocadas (corCartao='${primeiraCorCartao}'). Corrigindo dados...`);
        // Limpar dados corrompidos e reimportar
        await connection.query(`DELETE FROM cc_pagamentos_despesas`);
        await connection.query(`DELETE FROM cc_despesas`);
        await connection.query(`DELETE FROM cc_pagamentos`);
        await connection.query(`DELETE FROM cc_gastos`);
        await connection.query(`DELETE FROM cc_parcelamentos`);
        await connection.query(`DELETE FROM cc_cartoes`);
        await connection.query(`DELETE FROM cc_categorias`);
        await connection.query(`DELETE FROM cc_app_users`);
        console.log(`[cc-migrate] Dados corrompidos removidos. Reimportando...`);
      } else {
        console.log(`[cc-migrate] Dados já existem (${userCount} usuários) e estão corretos. Pulando importação.`);
        await connection.query(`SET FOREIGN_KEY_CHECKS = 1`);
        return;
      }
    }

    // ── Importar dados do dump ─────────────────────────────────────────────
    console.log("[cc-migrate] Importando dados do dump...");

    const sqlFile = path.resolve(process.cwd(), "scripts", "cc-data-import.sql");
    let sqlContent: string;
    try {
      sqlContent = await readFile(sqlFile, "utf8");
    } catch {
      console.log("[cc-migrate] Arquivo cc-data-import.sql não encontrado, pulando importação de dados.");
      await connection.query(`SET FOREIGN_KEY_CHECKS = 1`);
      return;
    }

    // Executar cada statement separadamente
    const statements = sqlContent
      .split(/;\s*\n/)
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith("--") && !s.startsWith("SELECT"));

    let ok = 0;
    for (const stmt of statements) {
      try {
        await connection.query(stmt);
        ok++;
      } catch (e: any) {
        // Ignorar erros de FK e duplicatas
        if (!e.message?.includes("Duplicate") && !e.message?.includes("foreign key")) {
          console.warn(`[cc-migrate] Aviso: ${e.message?.slice(0, 100)}`);
        }
      }
    }

    await connection.query(`SET FOREIGN_KEY_CHECKS = 1`);
    console.log(`[cc-migrate] Importação concluída! ${ok} statements executados.`);

  } catch (error) {
    console.error("[cc-migrate] Erro:", error instanceof Error ? error.message : String(error));
    try { await connection.query(`SET FOREIGN_KEY_CHECKS = 1`); } catch {}
    // Não falha o servidor
  } finally {
    await connection.end();
  }
}

run().catch((error) => {
  console.error("[cc-migrate] Falha:", error instanceof Error ? error.message : String(error));
});
