import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { createPool, type Pool } from "mysql2/promise";
import { gerarVINUnico } from "../client/src/lib/vinGenerator";

let pool: Pool;
const table = "h2_generated_vin_registry";

beforeAll(async () => {
  if (!process.env.VIN_TEST_DATABASE_URL) throw new Error("VIN_TEST_DATABASE_URL necessário");
  pool = createPool(process.env.VIN_TEST_DATABASE_URL);
  await pool.query(`CREATE TABLE IF NOT EXISTS \`${table}\` (
    vin CHAR(17) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`);
});

afterAll(async () => {
  await pool?.end();
});

describe("MySQL VIN persistent uniqueness", () => {
  it("não permite reutilizar um VIN registrado", async () => {
    const vin = gerarVINUnico("9BR", "B29BT", "J", "2");
    const [first] = await pool.query(`INSERT IGNORE INTO \`${table}\` (vin) VALUES (?)`, [vin]);
    const [second] = await pool.query(`INSERT IGNORE INTO \`${table}\` (vin) VALUES (?)`, [vin]);
    expect((first as {affectedRows: number}).affectedRows).toBe(1);
    expect((second as {affectedRows: number}).affectedRows).toBe(0);
  });

  it("sob concorrência, somente uma reserva do VIN vence", async () => {
    const vin = gerarVINUnico("9BR", "B29BT", "J", "2");
    const attempts = await Promise.all(Array.from({ length: 8 }, async () => {
      const [result] = await pool.query(`INSERT IGNORE INTO \`${table}\` (vin) VALUES (?)`, [vin]);
      return (result as {affectedRows: number}).affectedRows;
    }));
    expect(attempts.filter(n => n === 1)).toHaveLength(1);
    expect(attempts.filter(n => n === 0)).toHaveLength(7);
  });

  it("transação revertida não reserva o VIN", async () => {
    const vin = gerarVINUnico("9BR", "B29BT", "J", "2");
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(`INSERT INTO \`${table}\` (vin) VALUES (?)`, [vin]);
      await conn.rollback();
    } finally {
      conn.release();
    }
    const [result] = await pool.query(`INSERT IGNORE INTO \`${table}\` (vin) VALUES (?)`, [vin]);
    expect((result as {affectedRows: number}).affectedRows).toBe(1);
  });
});
