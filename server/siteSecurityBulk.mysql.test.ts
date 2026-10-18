import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPool, type Pool } from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import jwt from "jsonwebtoken";
import { initTRPC } from "@trpc/server";

const mockState = vi.hoisted(() => ({ db: null as any }));
vi.mock("./db", () => ({
  getDb: async () => mockState.db,
  getAdminCredential: async (name: string) => name === "integration-owner" ? { id: 1 } : null,
}));
vi.mock("./adminJwt", () => ({
  getAdminJwtSecret: () => "integration-unit-test-admin-secret-64-characters-long",
}));
vi.mock("./_core/trpc", () => {
  const t = initTRPC.context<any>().create();
  return { router: t.router, adminProcedure: t.procedure };
});

import { siteSecurityRouter } from "./siteSecurityRouter";

const secret = "integration-unit-test-admin-secret-64-characters-long";
const token = jwt.sign({ sub: "integration-owner", role: "admin" }, secret, { algorithm: "HS256" });
const caller = siteSecurityRouter.createCaller({ req: { headers: { cookie: "admin_token=" + token } } });
let pool: Pool;

beforeAll(async () => {
  process.env.H2_SITE_SECURITY_OWNER = "integration-owner";
  pool = createPool(process.env.TEST_MYSQL_URL || "mysql://root:integration-only@127.0.0.1:3306/h2_bulk_test");
  mockState.db = drizzle(pool);
  const statements = [
    "CREATE TABLE IF NOT EXISTS customers (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, name VARCHAR(128) NOT NULL, email VARCHAR(320), phone VARCHAR(32) NOT NULL, cpf VARCHAR(14), blocked INT NOT NULL DEFAULT 0, deletedAt TIMESTAMP NULL) ENGINE=InnoDB",
    "CREATE TABLE IF NOT EXISTS orderStatusHistory (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, registrationId INT NOT NULL, customerPhone VARCHAR(32) NOT NULL, status VARCHAR(64) NOT NULL) ENGINE=InnoDB",
    "CREATE TABLE IF NOT EXISTS hiddenSubOrders (registrationId INT NOT NULL, subOrderIndex INT NOT NULL) ENGINE=InnoDB",
    "CREATE TABLE IF NOT EXISTS orderStatusTypes (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, `key` VARCHAR(64) NOT NULL, sortOrder INT NOT NULL DEFAULT 0, isActive INT NOT NULL DEFAULT 1, isGlobal INT NOT NULL DEFAULT 1) ENGINE=InnoDB",
    "CREATE TABLE IF NOT EXISTS loanClients (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, cpf VARCHAR(14), phone VARCHAR(20), name VARCHAR(150)) ENGINE=InnoDB",
    "CREATE TABLE IF NOT EXISTS loans (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, clientId INT NOT NULL, status VARCHAR(32)) ENGINE=InnoDB",
    "CREATE TABLE IF NOT EXISTS siteAccessEntries (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, displayName VARCHAR(128) NOT NULL, email VARCHAR(320) NOT NULL UNIQUE, phone VARCHAR(32), customerId INT, status VARCHAR(16) NOT NULL DEFAULT 'active', expiresAt TIMESTAMP NULL, sessionVersion INT NOT NULL DEFAULT 1, createdBy VARCHAR(64) NOT NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB",
    "CREATE TABLE IF NOT EXISTS siteAccessAudit (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, actor VARCHAR(64) NOT NULL, action VARCHAR(48) NOT NULL, subject VARCHAR(320), createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB",
  ];
  for (const statement of statements) await pool.query(statement);
});
beforeEach(async () => {
  for (const table of ["siteAccessAudit","siteAccessEntries","hiddenSubOrders","orderStatusHistory","orderStatusTypes","loans","loanClients","customers"]) {
    await pool.query("DELETE FROM " + table);
  }
  await pool.query("INSERT INTO orderStatusTypes (`key`,sortOrder) VALUES ('recebido',1)");
  await pool.query("INSERT INTO customers (id,name,phone,email,blocked,deletedAt) VALUES (1,'Ana','(61) 99999-1001','ANA@EXEMPLO.COM',0,NULL),(2,'Bruno','61999991002','bruno@exemplo.com',0,NULL),(3,'Carlos','61999991003','carlos@exemplo.com',0,NULL),(4,'Denise','61999991004','denise@exemplo.com',0,NULL),(5,'Blocked','61999991005','blocked@exemplo.com',1,NULL),(6,'Deleted','61999991006','deleted@exemplo.com',0,NOW())");
  await pool.query("INSERT INTO orderStatusHistory (registrationId,customerPhone,status) VALUES (101,'61999991001','recebido'),(101,'61999991001','pedido_entregue'),(101,'61999991001','recebido'),(101,'61999991001','conta_ativa'),(102,'61999991002','recebido'),(102,'61999991002','pedido_entregue'),(103,'61999991003','recebido'),(103,'61999991003','em_analise'),(105,'61999991005','recebido')");
  await pool.query("INSERT INTO hiddenSubOrders (registrationId,subOrderIndex) VALUES (101,1)");
  await pool.query("INSERT INTO loanClients (id,name,cpf,phone) VALUES (1,'Ana','111.111.111-11','61999991001'),(2,'Bruno','222.222.222-22','61999991002'),(4,'Denise','444.444.444-44','61999991004')");
  await pool.query("INSERT INTO loans (clientId,status) VALUES (1,'pago'),(1,'aguardando_pagamento'),(2,'cancelado'),(4,'pago')");
  await pool.query("INSERT INTO siteAccessEntries (displayName,email,phone,status,createdBy) VALUES ('Bruno','bruno@exemplo.com','61999991002','suspended','integration-owner')");
});
afterAll(async () => { await pool?.end(); });

describe("Site Security bulk import - disposable MySQL integration", () => {
  it("classifies current visible orders and filters blocked/deleted clients", async () => {
    const active = await caller.bulkCandidates({ filter: "active", search: "" });
    expect(active.map(x => x.email)).toEqual(["ana@exemplo.com"]);
    const delivered = await caller.bulkCandidates({ filter: "delivered", search: "" });
    expect(delivered.map(x => x.email)).toEqual(["bruno@exemplo.com"]);
    expect(delivered[0].alreadyAuthorized).toBe(true);
    const progress = await caller.bulkCandidates({ filter: "in_progress", search: "" });
    expect(progress.map(x => x.email)).toEqual(["carlos@exemplo.com"]);
    const empty = await caller.bulkCandidates({ filter: "without_orders", search: "" });
    expect(empty.map(x => x.email)).toEqual(["denise@exemplo.com"]);
    const borrowers=await caller.bulkCandidates({filter:"with_loans",search:""});
    expect(borrowers.map(c=>[c.email,c.loanCount])).toEqual([["ana@exemplo.com",2],["bruno@exemplo.com",1],["denise@exemplo.com",1]]);
    const all = await caller.bulkCandidates({ filter: "all", search: "" });
    expect(all).toHaveLength(4);
  });
  it("adds unique emails once without reactivating suspended users", async () => {
    expect(await caller.bulkAdd({ customerIds: [1,2,3,4] })).toEqual({ added: 3, already: 1, total: 4 });
    expect(await caller.bulkAdd({ customerIds: [1,2,3,4] })).toEqual({ added: 0, already: 4, total: 4 });
    const [rows] = await pool.query<any[]>("SELECT email,status,sessionVersion FROM siteAccessEntries ORDER BY email");
    expect(rows).toHaveLength(4);
    expect(rows.find(x => x.email === "bruno@exemplo.com")).toMatchObject({ status: "suspended", sessionVersion: 1 });
    const [audit] = await pool.query<any[]>("SELECT action FROM siteAccessAudit ORDER BY id");
    expect(audit).toHaveLength(2);
  });
  it("rejects blocked and deleted selections before writing", async () => {
    await expect(caller.bulkAdd({ customerIds: [1,5] })).rejects.toThrow();
    await expect(caller.bulkAdd({ customerIds: [1,6] })).rejects.toThrow();
    const [rows] = await pool.query<any[]>("SELECT id FROM siteAccessEntries");
    expect(rows).toHaveLength(1);
  });
});