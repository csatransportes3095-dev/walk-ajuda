import { mysqlTable, int, varchar, timestamp } from "drizzle-orm/mysql-core";

/** Controle global: permanece PUBLIC por padrão, sem migração destrutiva. */
export const siteAccessConfig = mysqlTable("siteAccessConfig", {
  id: int("id").primaryKey(),
  mode: varchar("mode", { length: 16 }).notNull().default("public"),
  updatedBy: varchar("updatedBy", { length: 64 }),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** A autorização para ver o site NÃO concede privilégios de ADM. */
export const siteAccessEntries = mysqlTable("siteAccessEntries", {
  id: int("id").autoincrement().primaryKey(),
  displayName: varchar("displayName", { length: 128 }).notNull(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  phone: varchar("phone", { length: 32 }),
  customerId: int("customerId"),
  status: varchar("status", { length: 16 }).notNull().default("active"),
  expiresAt: timestamp("expiresAt"),
  sessionVersion: int("sessionVersion").notNull().default(1),
  createdBy: varchar("createdBy", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** Hash do código de uso único, sem armazenar OTP em texto puro. */
export const siteAccessChallenges = mysqlTable("siteAccessChallenges", {
  email: varchar("email", { length: 320 }).primaryKey(),
  codeHash: varchar("codeHash", { length: 100 }).notNull(),
  attempts: int("attempts").notNull().default(0),
  expiresAt: timestamp("expiresAt").notNull(),
  requestedAt: timestamp("requestedAt").notNull(),
});

export const siteAccessAudit = mysqlTable("siteAccessAudit", {
  id: int("id").autoincrement().primaryKey(),
  actor: varchar("actor", { length: 64 }).notNull(),
  action: varchar("action", { length: 48 }).notNull(),
  subject: varchar("subject", { length: 320 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
