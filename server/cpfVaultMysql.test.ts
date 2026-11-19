import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPool, type Pool, type RowDataPacket } from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";

// Inject only the isolated database; importing the service must never use DATABASE_URL.
const connection = vi.hoisted(() => ({ db: null as ReturnType<typeof drizzle> | null }));
vi.mock("./db", () => ({ getDb: vi.fn(async () => connection.db) }));

import { ensureCpfVaultSchema } from "./cpfVaultSchema";
import {
  checkCpfVault,
  checkCpfVaultBatch,
  getCpfVaultOrderMetadata,
  listCpfVault,
  saveCpfVault,
  saveCpfVaultBatch,
} from "./cpfVault";
import { formatCPF } from "../shared/cpf";

const testUrl = process.env.CPF_VAULT_TEST_DB_URL?.trim();
let pool: Pool | undefined;

function safeTestDatabaseUrl(value: string): string {
  const url = new URL(value);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (url.protocol !== "mysql:" || !["127.0.0.1", "localhost", "::1", "mysql"].includes(host)
    || decodeURIComponent(url.pathname) !== "/h2_cpf_vault_test" || url.search || url.hash) {
    throw new Error("CPF_VAULT_TEST_DB_URL must use the isolated h2_cpf_vault_test database on localhost or the mysql test service, without URL query options.");
  }
  return value;
}

/** Deterministic synthetic test values, never copied from customer data. */
function fixtureCpf(baseValue: number): string {
  let value = String(baseValue).padStart(9, "0");
  for (let size = 9; size <= 10; size++) {
    const sum = [...value].reduce((total, digit, index) => total + Number(digit) * (size + 1 - index), 0);
    const digit = (sum * 10) % 11;
    value += digit === 10 ? "0" : String(digit);
  }
  return value;
}

async function countRecords(): Promise<number> {
  const [rows] = await pool!.query<RowDataPacket[]>("SELECT COUNT(*) AS total FROM cpf_usage_registry");
  return Number(rows[0].total);
}

describe.skipIf(!testUrl)("Cofre de CPF — invariantes no MySQL isolado", () => {
  beforeAll(async () => {
    pool = createPool(safeTestDatabaseUrl(testUrl!));
    const [selected] = await pool.query<RowDataPacket[]>("SELECT DATABASE() AS dbName");
    if (selected[0].dbName !== "h2_cpf_vault_test") throw new Error("Unexpected MySQL database; fixture setup refused.");
    connection.db = drizzle(pool);

    // This suite owns these minimal fixtures only in the dedicated test database.
    await pool.query("DROP TRIGGER IF EXISTS cpf_vault_test_reject_insert");
    for (const table of ["cpf_usage_registry", "orderStatusHistory", "orderStatusTypes", "accessCodePhones", "customers"]) {
      await pool.query(`DROP TABLE IF EXISTS \`${table}\``);
    }
    await pool.query(`CREATE TABLE customers (
      id INT PRIMARY KEY, name VARCHAR(128) NOT NULL, phone VARCHAR(32) NOT NULL,
      customerNumber INT NULL, deletedAt TIMESTAMP NULL
    ) ENGINE=InnoDB`);
    await pool.query(`CREATE TABLE accessCodePhones (
      id INT PRIMARY KEY, phone VARCHAR(32) NOT NULL
    ) ENGINE=InnoDB`);
    await pool.query(`CREATE TABLE orderStatusTypes (
      id INT PRIMARY KEY, \`key\` VARCHAR(64) NOT NULL, isActive INT NOT NULL,
      isGlobal INT NOT NULL, sortOrder INT NOT NULL
    ) ENGINE=InnoDB`);
    await pool.query(`CREATE TABLE orderStatusHistory (
      id INT PRIMARY KEY, registrationId INT NOT NULL, status VARCHAR(64) NOT NULL,
      orderNumber INT NULL, customerPhone VARCHAR(32) NOT NULL, createdAt DATETIME NOT NULL
    ) ENGINE=InnoDB`);
    await ensureCpfVaultSchema(connection.db);
  }, 30_000);

  beforeEach(async () => {
    await pool!.query("DROP TRIGGER IF EXISTS cpf_vault_test_reject_insert");
    for (const table of ["cpf_usage_registry", "orderStatusHistory", "orderStatusTypes", "accessCodePhones", "customers"]) {
      await pool!.query(`DELETE FROM \`${table}\``);
    }
    await pool!.query(`INSERT INTO customers (id,name,phone,customerNumber,deletedAt) VALUES
      (1,'Cliente de teste A','(11) 99999-0001',410,NULL),
      (2,'Cliente de teste B','(11) 99999-0002',411,NULL),
      (3,'Cadastro excluído','5511999990001',999,'2026-01-01')`);
    await pool!.query("INSERT INTO accessCodePhones (id,phone) VALUES (101,'5511999990001'),(102,'5511999990002')");
    await pool!.query(`INSERT INTO orderStatusTypes (id,\`key\`,isActive,isGlobal,sortOrder) VALUES
      (1,'recebido',1,1,0),(2,'individual',1,0,-1)`);
    await pool!.query(`INSERT INTO orderStatusHistory (id,registrationId,status,orderNumber,customerPhone,createdAt) VALUES
      (1001,101,'recebido',8101,'5511999990001','2026-01-01 00:00:00'),
      (1002,101,'em_andamento',8101,'5511999990001','2026-01-02 00:00:00'),
      (1003,101,'recebido',8102,'5511999990001','2026-02-01 00:00:00'),
      (1004,101,'documentos_aprovados',8102,'5511999990001','2026-02-02 00:00:00'),
      (2001,102,'recebido',8201,'5511999990002','2026-01-03 00:00:00')`);
  });

  afterAll(async () => {
    connection.db = null;
    await pool?.end();
  });

  it("inicializa repetidamente sem apagar registros nem perder o índice único", async () => {
    const cpf = fixtureCpf(12345678); // Deliberately starts with zero.
    expect(cpf).toHaveLength(11);
    expect(cpf.startsWith("0")).toBe(true);
    expect(await checkCpfVault({ cpf })).toMatchObject({ exists: false, record: null });
    const saved = await saveCpfVault({ cpf: formatCPF(cpf), note: "Preservar após bootstrap" });
    expect(saved).toMatchObject({ saved: true, exists: true, normalizedCpf: cpf });

    // New Drizzle objects simulate a fresh process; this also exercises the actual DDL.
    await Promise.all([ensureCpfVaultSchema(drizzle(pool!)), ensureCpfVaultSchema(drizzle(pool!))]);
    const checked = await checkCpfVault({ cpf });
    expect(checked.record).toMatchObject({ id: saved.record.id, normalizedCpf: cpf, note: "Preservar após bootstrap" });
    const [indexes] = await pool!.query<RowDataPacket[]>("SHOW INDEX FROM cpf_usage_registry WHERE Key_name='uq_cpf_usage_normalized'");
    expect(indexes).toHaveLength(1);
    expect(Number(indexes[0].Non_unique)).toBe(0);
    expect(await countRecords()).toBe(1);
  });

  it("somente uma gravação concorrente vence e a outra preserva o dono original", async () => {
    const cpf = fixtureCpf(234567890);
    const attempts = await Promise.all([
      saveCpfVault({ cpf, registrationId: 101, subOrderIndex: 0, expectedOrderNumber: 8102, expectedOrderRootId: 1003, note: "Primeiro pedido" }),
      saveCpfVault({ cpf: formatCPF(cpf), registrationId: 102, subOrderIndex: 0, expectedOrderNumber: 8201, expectedOrderRootId: 2001, note: "Outro pedido" }),
    ]);
    expect(attempts.filter(result => result.saved)).toHaveLength(1);
    expect(attempts.filter(result => !result.saved)).toHaveLength(1);
    const winner = attempts.find(result => result.saved)!;
    const loser = attempts.find(result => !result.saved)!;
    expect(loser.record).toEqual(winner.record);
    expect(await countRecords()).toBe(1);
    const checked = await checkCpfVault({ cpf });
    expect(checked).toMatchObject({ exists: true, normalizedCpf: cpf, record: winner.record });
  });

  it("reenvio individual ou em lote não substitui cliente, pedido nem observação", async () => {
    const cpf = fixtureCpf(345678901);
    const original = await saveCpfVault({ cpf, registrationId: 101, subOrderIndex: 1, expectedOrderRootId: 1001, note: "Registro original" });
    expect(original.record).toMatchObject({ registrationId: 101, customerId: 1, customerName: "Cliente de teste A", customerNumber: 410, orderNumber: 8101 });
    const duplicate = await saveCpfVault({ cpf: formatCPF(cpf), registrationId: 102, expectedOrderRootId: 2001, note: "Não substituir" });
    expect(duplicate.saved).toBe(false);
    expect(duplicate.record).toEqual(original.record);
    expect(await saveCpfVaultBatch({ text: cpf, note: "Também não substituir" })).toMatchObject({ savedCount: 0, alreadyUsedCount: 1 });
    expect((await checkCpfVault({ cpf })).record).toEqual(original.record);
    expect(await countRecords()).toBe(1);
  });

  it("mantém o vínculo pelo primeiro histórico quando o status avança e os índices mudam", async () => {
    const olderCpf = fixtureCpf(456789012);
    const latestCpf = fixtureCpf(567890123);
    await saveCpfVault({ cpf: olderCpf, registrationId: 101, subOrderIndex: 1, expectedOrderNumber: 8101, expectedOrderRootId: 1001 });
    await saveCpfVault({ cpf: latestCpf, registrationId: 101, subOrderIndex: 0, expectedOrderNumber: 8102, expectedOrderRootId: 1003 });
    const [stored] = await pool!.query<RowDataPacket[]>("SELECT normalizedCpf,orderRootId FROM cpf_usage_registry ORDER BY orderRootId");
    expect(stored.map(row => [row.normalizedCpf, Number(row.orderRootId)])).toEqual([[olderCpf, 1001], [latestCpf, 1003]]);
    await pool!.query(`INSERT INTO orderStatusHistory (id,registrationId,status,orderNumber,customerPhone,createdAt) VALUES
      (1005,101,'pedido_entregue',8102,'5511999990001','2026-02-03 00:00:00')`);
    expect((await listCpfVault({ registrationId: 101, subOrderIndex: 0 })).items.map(record => record.normalizedCpf)).toEqual([latestCpf]);
    await pool!.query(`INSERT INTO orderStatusHistory (id,registrationId,status,orderNumber,customerPhone,createdAt) VALUES
      (1006,101,'recebido',8103,'5511999990001','2026-03-01 00:00:00')`);
    expect((await listCpfVault({ registrationId: 101, subOrderIndex: 0 })).total).toBe(0);
    expect((await listCpfVault({ registrationId: 101, subOrderIndex: 1 })).items.map(record => record.normalizedCpf)).toEqual([latestCpf]);
    expect((await listCpfVault({ registrationId: 101, subOrderIndex: 2 })).items.map(record => record.normalizedCpf)).toEqual([olderCpf]);
    expect((await listCpfVault({ registrationId: 102, subOrderIndex: 0 })).total).toBe(0);
    expect((await listCpfVault({ query: "*410" })).total).toBe(2);
  });

  it("rejeita card desatualizado e subpedido inexistente antes de registrar CPF", async () => {
    const cpf = fixtureCpf(678901234);
    await expect(saveCpfVault({ cpf, registrationId: 101, subOrderIndex: 0, expectedOrderNumber: 8101, expectedOrderRootId: 1003 })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(saveCpfVault({ cpf, registrationId: 101, subOrderIndex: 9, expectedOrderRootId: 1003 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await countRecords()).toBe(0);
    expect((await checkCpfVault({ cpf })).exists).toBe(false);
  });

  it("prepara metadados CPF em lote com a raiz e o número de cada subpedido, inclusive sem número", async () => {
    await pool!.query("UPDATE orderStatusHistory SET orderNumber=NULL WHERE id IN (1003,1004)");
    const metadata = await getCpfVaultOrderMetadata(connection.db!, [
      { registrationId: 101, subOrderIndex: 0 },
      { registrationId: 101, subOrderIndex: 1 },
      { registrationId: 102, subOrderIndex: 0 },
      { registrationId: 999, subOrderIndex: 0 },
    ]);
    expect(metadata.size).toBe(3);
    expect(metadata.get("101_0")).toEqual({ orderRootId: 1003, cpfVaultOrderNumber: null });
    expect(metadata.get("101_1")).toEqual({ orderRootId: 1001, cpfVaultOrderNumber: 8101 });
    expect(metadata.get("102_0")).toEqual({ orderRootId: 2001, cpfVaultOrderNumber: 8201 });
    expect(metadata.has("999_0")).toBe(false);

    const saved = await saveCpfVault({ cpf: fixtureCpf(678901237), registrationId: 101,
      subOrderIndex: 0, expectedOrderRootId: metadata.get("101_0")!.orderRootId });
    expect(saved.record).toMatchObject({ registrationId: 101, orderRootId: 1003, orderNumber: null });
  });

  it("não troca o vínculo de card sem número quando um novo subpedido muda seu índice", async () => {
    await pool!.query("UPDATE orderStatusHistory SET orderNumber=NULL WHERE registrationId=101");
    const originalCpf = fixtureCpf(678901235);
    const staleCpf = fixtureCpf(678901236);
    await expect(saveCpfVault({ cpf: staleCpf, registrationId: 101, subOrderIndex: 0 }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    const originalScope = await listCpfVault({ registrationId: 101, subOrderIndex: 0 });
    expect(originalScope.orderRootId).toBe(1003);
    const original = await saveCpfVault({ cpf: originalCpf, registrationId: 101,
      subOrderIndex: 0, expectedOrderRootId: originalScope.orderRootId! });
    expect(original.record).toMatchObject({ orderNumber: null, orderRootId: 1003 });

    await pool!.query(`INSERT INTO orderStatusHistory (id,registrationId,status,orderNumber,customerPhone,createdAt) VALUES
      (1005,101,'recebido',NULL,'5511999990001','2026-03-01 00:00:00')`);
    await expect(saveCpfVault({ cpf: staleCpf, registrationId: 101,
      subOrderIndex: 0, expectedOrderRootId: originalScope.orderRootId! }))
      .rejects.toMatchObject({ code: "CONFLICT" });
    await expect(listCpfVault({ registrationId: 101,
      subOrderIndex: 0, expectedOrderRootId: originalScope.orderRootId! }))
      .rejects.toMatchObject({ code: "CONFLICT" });
    expect(await countRecords()).toBe(1);
    expect((await checkCpfVault({ cpf: staleCpf })).exists).toBe(false);

    const originalList = await listCpfVault({ registrationId: 101,
      subOrderIndex: 1, expectedOrderRootId: originalScope.orderRootId! });
    expect(originalList.orderRootId).toBe(1003);
    expect(originalList.items).toEqual([original.record]);
    expect((await listCpfVault({ registrationId: 101, subOrderIndex: 0 })).items).toEqual([]);
  });

  it("confere o cofre inteiro em lotes, normaliza repetidos e não depende da página da listagem", async () => {
    const usedCpf = fixtureCpf(789012345);
    await saveCpfVault({ cpf: usedCpf, registrationId: 102, expectedOrderRootId: 2001 });
    const cpfs = Array.from({ length: 260 }, (_, index) => fixtureCpf(100000000 + index));
    const text = [...cpfs, formatCPF(usedCpf), usedCpf, "123"].join("\n");
    const checked = await checkCpfVaultBatch({ text });
    expect(checked).toMatchObject({ total: 261, available: cpfs, used: [usedCpf], invalid: ["123"], duplicateCount: 1 });
    const imported = await saveCpfVaultBatch({ text, note: "Lote de teste" });
    expect(imported).toEqual({ total: 261, savedCount: 260, alreadyUsedCount: 1, invalid: ["123"], duplicateCount: 1 });
    const firstPage = await listCpfVault({ limit: 1 });
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.total).toBe(261);
    expect(firstPage.nextCursor).not.toBeNull();
    expect(firstPage.items[0].normalizedCpf).not.toBe(usedCpf);
    const secondPage = await listCpfVault({ limit: 1, cursor: firstPage.nextCursor! });
    expect(secondPage.items[0].id).toBeLessThan(firstPage.items[0].id);
    expect((await checkCpfVaultBatch({ text: cpfs.concat(usedCpf).join(";") })).available).toEqual([]);
    expect((await checkCpfVaultBatch({ text: usedCpf })).used).toEqual([usedCpf]);
    expect((await checkCpfVault({ cpf: usedCpf })).record?.customerId).toBe(2);
  });

  it("reverte todos os blocos do lote se o MySQL recusar um registro posterior", async () => {
    const existingCpf = fixtureCpf(890123456);
    await saveCpfVault({ cpf: existingCpf });
    const cpfs = Array.from({ length: 251 }, (_, index) => fixtureCpf(200000000 + index));
    const rejectedCpf = cpfs[250];
    // The fault occurs after the first 250-row batch reached MySQL.
    await pool!.query(`CREATE TRIGGER cpf_vault_test_reject_insert BEFORE INSERT ON cpf_usage_registry
      FOR EACH ROW BEGIN
        IF NEW.normalizedCpf = '${rejectedCpf}' THEN
          SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'cpf-vault isolated test failure';
        END IF;
      END`);
    try {
      await expect(saveCpfVaultBatch({ text: cpfs.join("\n") })).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
      expect(await countRecords()).toBe(1);
      expect((await checkCpfVault({ cpf: existingCpf })).exists).toBe(true);
      const checked = await checkCpfVaultBatch({ text: cpfs.join("\n") });
      expect(checked.used).toEqual([]);
      expect(checked.available).toEqual(cpfs);
    } finally {
      await pool!.query("DROP TRIGGER IF EXISTS cpf_vault_test_reject_insert");
    }
  });
});
