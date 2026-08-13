import {
  boolean,
  date,
  decimal,
  index,
  int,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Domínio isolado da locadora. Todas as tabelas físicas usam o prefixo
 * locadora_ para impedir colisões com o H2 e preservar a evolução do módulo.
 */
export const locadoraTenants = mysqlTable("locadora_tenants", {
  id: int("id").autoincrement().primaryKey(),
  ownerAdminUserId: int("ownerAdminUserId"),
  companyName: varchar("companyName", { length: 255 }).notNull(),
  ownerName: varchar("ownerName", { length: 255 }),
  cpfCnpj: varchar("cpfCnpj", { length: 20 }),
  phone: varchar("phone", { length: 20 }),
  email: varchar("email", { length: 320 }),
  address: text("address"), city: varchar("city", { length: 100 }), state: varchar("state", { length: 2 }), zipCode: varchar("zipCode", { length: 10 }),
  whatsapp: varchar("whatsapp", { length: 20 }), pixKey: text("pixKey"), bankAccount: text("bankAccount"), logoKey: text("logoKey"),
  plan: varchar("plan", { length: 32 }).notNull().default("trial"),
  planStatus: varchar("planStatus", { length: 32 }).notNull().default("trial"),
  trialEndsAt: timestamp("trialEndsAt"), subscriptionEndsAt: timestamp("subscriptionEndsAt"), subscriptionPrice: decimal("subscriptionPrice", { precision: 10, scale: 2 }),
  lateFeePercent: decimal("lateFeePercent", { precision: 5, scale: 2 }).notNull().default("2.00"),
  dailyInterestPercent: decimal("dailyInterestPercent", { precision: 5, scale: 2 }).notNull().default("0.033"),
  trialDays: int("trialDays").notNull().default(7), serialCode: varchar("serialCode", { length: 64 }), serialExpiresAt: timestamp("serialExpiresAt"), serialActivatedAt: timestamp("serialActivatedAt"),
  isBlocked: boolean("isBlocked").notNull().default(false), blockReason: text("blockReason"), notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({ companyIdx: index("locadora_tenants_company_idx").on(t.companyName) }));

export const locadoraUsers = mysqlTable("locadora_users", {
  id: int("id").autoincrement().primaryKey(), tenantId: int("tenantId").notNull(),
  h2UserId: int("h2UserId"), name: varchar("name", { length: 255 }).notNull(), email: varchar("email", { length: 320 }), phone: varchar("phone", { length: 20 }),
  role: varchar("role", { length: 64 }).notNull().default("manager"), status: varchar("status", { length: 32 }).notNull().default("active"),
  createdAt: timestamp("createdAt").defaultNow().notNull(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({ tenantIdx: index("locadora_users_tenant_idx").on(t.tenantId), tenantEmail: uniqueIndex("locadora_users_tenant_email_uq").on(t.tenantId, t.email) }));

export const locadoraClients = mysqlTable("locadora_clients", {
  id: int("id").autoincrement().primaryKey(), tenantId: int("tenantId").notNull(), fullName: varchar("fullName", { length: 255 }).notNull(),
  cpfCnpj: varchar("cpfCnpj", { length: 20 }), rg: varchar("rg", { length: 30 }), birthDate: date("birthDate"), cnh: varchar("cnh", { length: 30 }), cnhExpiry: date("cnhExpiry"),
  phone: varchar("phone", { length: 20 }), whatsapp: varchar("whatsapp", { length: 20 }), email: varchar("email", { length: 320 }),
  address: text("address"), street: varchar("street", { length: 255 }), addressNumber: varchar("addressNumber", { length: 20 }), neighborhood: varchar("neighborhood", { length: 100 }), city: varchar("city", { length: 100 }), state: varchar("state", { length: 2 }), zipCode: varchar("zipCode", { length: 10 }),
  photoKey: text("photoKey"), cnhPhotoKey: text("cnhPhotoKey"), notes: text("notes"), status: varchar("status", { length: 32 }).notNull().default("active"), clientRating: varchar("clientRating", { length: 4 }).default("A"),
  createdAt: timestamp("createdAt").defaultNow().notNull(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({ tenantIdx: index("locadora_clients_tenant_idx").on(t.tenantId), tenantStatusIdx: index("locadora_clients_tenant_status_idx").on(t.tenantId, t.status), tenantCpfIdx: index("locadora_clients_tenant_cpf_idx").on(t.tenantId, t.cpfCnpj) }));

export const locadoraVehicles = mysqlTable("locadora_vehicles", {
  id: int("id").autoincrement().primaryKey(), tenantId: int("tenantId").notNull(), brand: varchar("brand", { length: 100 }).notNull(), model: varchar("model", { length: 100 }).notNull(), year: int("year"), color: varchar("color", { length: 50 }), plate: varchar("plate", { length: 10 }).notNull(), renavam: varchar("renavam", { length: 20 }), chassis: varchar("chassis", { length: 30 }), mileage: int("mileage").notNull().default(0),
  weeklyPrice: decimal("weeklyPrice", { precision: 10, scale: 2 }), biweeklyPrice: decimal("biweeklyPrice", { precision: 10, scale: 2 }), monthlyPrice: decimal("monthlyPrice", { precision: 10, scale: 2 }),
  licensingDate: date("licensingDate"), insuranceExpiry: date("insuranceExpiry"), insuranceCompany: varchar("insuranceCompany", { length: 100 }), insurancePolicyNumber: varchar("insurancePolicyNumber", { length: 50 }), nextMaintenanceDate: date("nextMaintenanceDate"), nextMaintenanceMileage: int("nextMaintenanceMileage"),
  status: varchar("status", { length: 32 }).notNull().default("available"), notes: text("notes"), photoKeys: text("photoKeys"), documentKey: text("documentKey"),
  createdAt: timestamp("createdAt").defaultNow().notNull(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({ tenantIdx: index("locadora_vehicles_tenant_idx").on(t.tenantId), tenantPlate: uniqueIndex("locadora_vehicles_tenant_plate_uq").on(t.tenantId, t.plate), tenantStatusIdx: index("locadora_vehicles_tenant_status_idx").on(t.tenantId, t.status) }));

export const locadoraContracts = mysqlTable("locadora_contracts", {
  id: int("id").autoincrement().primaryKey(), tenantId: int("tenantId").notNull(), clientId: int("clientId").notNull(), vehicleId: int("vehicleId").notNull(), contractNumber: varchar("contractNumber", { length: 50 }),
  startDate: date("startDate").notNull(), endDate: date("endDate").notNull(), type: varchar("type", { length: 32 }).notNull(), value: decimal("value", { precision: 10, scale: 2 }).notNull(), deposit: decimal("deposit", { precision: 10, scale: 2 }).notNull().default("0.00"),
  caucaoStatus: varchar("caucaoStatus", { length: 32 }).notNull().default("pending"), caucaoPaidAt: timestamp("caucaoPaidAt"), caucaoReturnedAt: timestamp("caucaoReturnedAt"), startMileage: int("startMileage"), endMileage: int("endMileage"),
  status: varchar("status", { length: 32 }).notNull().default("active"), notes: text("notes"), pdfKey: text("pdfKey"), signedContractKey: text("signedContractKey"),
  createdAt: timestamp("createdAt").defaultNow().notNull(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({ tenantIdx: index("locadora_contracts_tenant_idx").on(t.tenantId), tenantStatusIdx: index("locadora_contracts_tenant_status_idx").on(t.tenantId, t.status), tenantClientIdx: index("locadora_contracts_tenant_client_idx").on(t.tenantId, t.clientId), tenantVehicleIdx: index("locadora_contracts_tenant_vehicle_idx").on(t.tenantId, t.vehicleId) }));

export const locadoraCharges = mysqlTable("locadora_charges", {
  id: int("id").autoincrement().primaryKey(), tenantId: int("tenantId").notNull(), contractId: int("contractId"), clientId: int("clientId").notNull(), vehicleId: int("vehicleId"), description: varchar("description", { length: 255 }),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(), lateFee: decimal("lateFee", { precision: 10, scale: 2 }).notNull().default("0.00"), interest: decimal("interest", { precision: 10, scale: 2 }).notNull().default("0.00"), totalAmount: decimal("totalAmount", { precision: 10, scale: 2 }).notNull(),
  dueDate: date("dueDate").notNull(), paidAt: timestamp("paidAt"), paidAmount: decimal("paidAmount", { precision: 10, scale: 2 }), type: varchar("type", { length: 32 }).notNull().default("monthly"), paymentMethod: varchar("paymentMethod", { length: 32 }).notNull().default("pending"), status: varchar("status", { length: 32 }).notNull().default("pending"), receiptKey: text("receiptKey"), notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({ tenantIdx: index("locadora_charges_tenant_idx").on(t.tenantId), tenantStatusIdx: index("locadora_charges_tenant_status_idx").on(t.tenantId, t.status), tenantDueIdx: index("locadora_charges_tenant_due_idx").on(t.tenantId, t.dueDate) }));

export const locadoraMaintenances = mysqlTable("locadora_maintenances", {
  id: int("id").autoincrement().primaryKey(), tenantId: int("tenantId").notNull(), vehicleId: int("vehicleId").notNull(), type: varchar("type", { length: 100 }).notNull(), description: text("description"), cost: decimal("cost", { precision: 10, scale: 2 }), mileageAtService: int("mileageAtService"), serviceDate: date("serviceDate").notNull(), nextServiceDate: date("nextServiceDate"), nextServiceMileage: int("nextServiceMileage"), status: varchar("status", { length: 32 }).notNull().default("scheduled"), notes: text("notes"), createdAt: timestamp("createdAt").defaultNow().notNull(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({ tenantIdx: index("locadora_maintenances_tenant_idx").on(t.tenantId), tenantVehicleIdx: index("locadora_maintenances_tenant_vehicle_idx").on(t.tenantId, t.vehicleId) }));

export const locadoraFines = mysqlTable("locadora_fines", {
  id: int("id").autoincrement().primaryKey(), tenantId: int("tenantId").notNull(), vehicleId: int("vehicleId").notNull(), clientId: int("clientId"), contractId: int("contractId"), description: text("description"), amount: decimal("amount", { precision: 10, scale: 2 }).notNull(), fineDate: date("fineDate").notNull(), dueDate: date("dueDate"), status: varchar("status", { length: 32 }).notNull().default("pending"), receiptKey: text("receiptKey"), notes: text("notes"), createdAt: timestamp("createdAt").defaultNow().notNull(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({ tenantIdx: index("locadora_fines_tenant_idx").on(t.tenantId), tenantStatusIdx: index("locadora_fines_tenant_status_idx").on(t.tenantId, t.status) }));

export const locadoraEmployees = mysqlTable("locadora_employees", {
  id: int("id").autoincrement().primaryKey(), tenantId: int("tenantId").notNull(), name: varchar("name", { length: 255 }).notNull(), cpf: varchar("cpf", { length: 14 }), phone: varchar("phone", { length: 20 }), email: varchar("email", { length: 320 }), role: varchar("role", { length: 100 }), commissionPercent: decimal("commissionPercent", { precision: 5, scale: 2 }).notNull().default("0.00"), salary: decimal("salary", { precision: 10, scale: 2 }), status: varchar("status", { length: 32 }).notNull().default("active"), notes: text("notes"), createdAt: timestamp("createdAt").defaultNow().notNull(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({ tenantIdx: index("locadora_employees_tenant_idx").on(t.tenantId), tenantStatusIdx: index("locadora_employees_tenant_status_idx").on(t.tenantId, t.status) }));

export const locadoraCaucaoInstallments = mysqlTable("locadora_caucao_installments", {
  id: int("id").autoincrement().primaryKey(), tenantId: int("tenantId").notNull(), contractId: int("contractId").notNull(), clientId: int("clientId").notNull(), installmentNumber: int("installmentNumber").notNull(), totalInstallments: int("totalInstallments").notNull(), amount: decimal("amount", { precision: 10, scale: 2 }).notNull(), dueDate: date("dueDate").notNull(), paidAt: timestamp("paidAt"), paidAmount: decimal("paidAmount", { precision: 10, scale: 2 }), paymentMethod: varchar("paymentMethod", { length: 32 }).notNull().default("pending"), status: varchar("status", { length: 32 }).notNull().default("pending"), notes: text("notes"), createdAt: timestamp("createdAt").defaultNow().notNull(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({ tenantIdx: index("locadora_caucao_tenant_idx").on(t.tenantId), tenantContractIdx: index("locadora_caucao_tenant_contract_idx").on(t.tenantId, t.contractId) }));

export const locadoraAlerts = mysqlTable("locadora_alerts", {
  id: int("id").autoincrement().primaryKey(), tenantId: int("tenantId").notNull(), type: varchar("type", { length: 64 }).notNull(), title: varchar("title", { length: 255 }).notNull(), message: text("message"), relatedId: int("relatedId"), relatedType: varchar("relatedType", { length: 50 }), isRead: boolean("isRead").notNull().default(false), createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({ tenantIdx: index("locadora_alerts_tenant_idx").on(t.tenantId), tenantReadIdx: index("locadora_alerts_tenant_read_idx").on(t.tenantId, t.isRead) }));

export const locadoraAccessLogs = mysqlTable("locadora_access_logs", {
  id: int("id").autoincrement().primaryKey(), tenantId: int("tenantId"), userId: int("userId"), action: varchar("action", { length: 100 }).notNull(), details: text("details"), ipAddress: varchar("ipAddress", { length: 45 }), userAgent: text("userAgent"), createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({ tenantIdx: index("locadora_access_logs_tenant_idx").on(t.tenantId) }));

export const locadoraActivationSerials = mysqlTable("locadora_activation_serials", {
  id: int("id").autoincrement().primaryKey(), tenantId: int("tenantId").notNull(), serial: varchar("serial", { length: 64 }).notNull(), isActive: boolean("isActive").notNull().default(true), isUsed: boolean("isUsed").notNull().default(false), expiresAt: timestamp("expiresAt").notNull(), activatedAt: timestamp("activatedAt"), notes: text("notes"), createdAt: timestamp("createdAt").defaultNow().notNull(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({ serialUq: uniqueIndex("locadora_activation_serial_uq").on(t.serial), tenantIdx: index("locadora_activation_serial_tenant_idx").on(t.tenantId) }));

export const locadoraSettings = mysqlTable("locadora_settings", {
  id: int("id").autoincrement().primaryKey(), tenantId: int("tenantId").notNull(), key: varchar("key", { length: 100 }).notNull(), value: text("value"), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({ tenantKeyUq: uniqueIndex("locadora_settings_tenant_key_uq").on(t.tenantId, t.key) }));

export const locadoraPlanLimits = mysqlTable("locadora_plan_limits", {
  id: int("id").autoincrement().primaryKey(), planName: varchar("planName", { length: 50 }).notNull(), maxClients: int("maxClients").notNull().default(50), maxVehicles: int("maxVehicles").notNull().default(20), maxActiveContracts: int("maxActiveContracts").notNull().default(20), maxEmployees: int("maxEmployees").notNull().default(5), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({ planUq: uniqueIndex("locadora_plan_limits_plan_uq").on(t.planName) }));

export type LocadoraTenant = typeof locadoraTenants.$inferSelect;
export type InsertLocadoraTenant = typeof locadoraTenants.$inferInsert;
export type LocadoraClient = typeof locadoraClients.$inferSelect;
export type InsertLocadoraClient = typeof locadoraClients.$inferInsert;
export type LocadoraVehicle = typeof locadoraVehicles.$inferSelect;
export type InsertLocadoraVehicle = typeof locadoraVehicles.$inferInsert;
export type LocadoraContract = typeof locadoraContracts.$inferSelect;
export type InsertLocadoraContract = typeof locadoraContracts.$inferInsert;
export type LocadoraCharge = typeof locadoraCharges.$inferSelect;
export type InsertLocadoraCharge = typeof locadoraCharges.$inferInsert;
