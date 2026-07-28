import { bigint, decimal, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Tabela de senhas VIP para acesso ao site
export const accessCodes = mysqlTable("accessCodes", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 64 }).notNull().unique(),
  type: mysqlEnum("type", ["general", "vip"]).notNull().default("vip"),
  status: mysqlEnum("status", ["active", "used", "disabled"]).notNull().default("active"),
  clientName: text("clientName"),
  usedAt: timestamp("usedAt"),
  usedBy: text("usedBy"),
  accessedByPhone: varchar("accessedByPhone", { length: 32 }),
  maxUses: int("maxUses").default(1),
  currentUses: int("currentUses").default(0),
  expiresAt: timestamp("expiresAt"),
  timeOnly: int("timeOnly").default(0).notNull(),
  allowedProductIds: text("allowedProductIds"), // JSON array de IDs de produtos permitidos, null = todos
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AccessCode = typeof accessCodes.$inferSelect;
export type InsertAccessCode = typeof accessCodes.$inferInsert;

// Histórico de telefones que acessaram cada senha VIP
export const accessCodePhones = mysqlTable("accessCodePhones", {
  id: int("id").autoincrement().primaryKey(),
  codeId: int("codeId").notNull(),
  phone: varchar("phone", { length: 32 }).notNull(),
  consumed: int("consumed").default(0).notNull(),
  archived: int('archived').notNull().default(0), // 1 = arquivado (fora dos cards ativos)
  rgCnhApproved: int('rgCnhApproved').notNull().default(0), // 1 = pasta RG/CNH Aprovado
  orderSource: varchar('orderSource', { length: 16 }).notNull().default('auto'), // 'auto' = gerado automaticamente, 'manual' = inserido manualmente
  accessedAt: timestamp('accessedAt').defaultNow().notNull(),
  refCode: varchar('refCode', { length: 64 }),       // código do link de indicação usado
  refExpiresAt: bigint('refExpiresAt', { mode: 'number' }), // timestamp ms de expiração do acesso sem senha
  refOwnerName: varchar('refOwnerName', { length: 128 }), // nome do cliente dono do link
  deletedAt: timestamp('deletedAt'), // Lixeira: data de exclusão (null = ativo)
  deletedReason: varchar('deletedReason', { length: 256 }), // Motivo da exclusão
  // Revendedor: nome do cliente final (terceiro) e desconto aplicado
  thirdPartyName: varchar('thirdPartyName', { length: 128 }), // nome do cliente final (terceiro)
  resellerDiscountApplied: decimal('resellerDiscountApplied', { precision: 10, scale: 2 }), // valor do desconto aplicado em R$
  // Agrupamento de carrinho: múltiplos produtos em um único pagamento
  cartGroupId: varchar('cartGroupId', { length: 64 }), // ID único do grupo de carrinho (null = pedido único)
  cartTotal: decimal('cartTotal', { precision: 10, scale: 2 }), // total bruto do carrinho (soma dos produtos)
  cartCouponCode: varchar('cartCouponCode', { length: 64 }), // cupom aplicado no carrinho
  cartCouponDiscount: decimal('cartCouponDiscount', { precision: 10, scale: 2 }), // valor do desconto do cupom
  cartItemIndex: int('cartItemIndex').default(0), // índice do item no carrinho (0 = primeiro, 1 = segundo, etc.)
});

export type AccessCodePhone = typeof accessCodePhones.$inferSelect;
export type InsertAccessCodePhone = typeof accessCodePhones.$inferInsert;

// Tabela de cupons de desconto
export const coupons = mysqlTable("coupons", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 64 }).notNull().unique(),
  discountType: mysqlEnum("discountType", ["percentage", "fixed"]).notNull().default("fixed"),
  discountValue: int("discountValue").notNull(),
  status: mysqlEnum("status", ["active", "used", "disabled"]).notNull().default("active"),
  maxUses: int("maxUses").default(1),
  currentUses: int("currentUses").default(0),
  expiresAt: timestamp("expiresAt"),
  usedBy: text("usedBy"),
  usedAt: timestamp("usedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Coupon = typeof coupons.$inferSelect;
export type InsertCoupon = typeof coupons.$inferInsert;

// Tabela de produtos/serviços (cards)
export const products = mysqlTable("products", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),
  iconUrl: text("iconUrl"),
  buttonText: varchar("buttonText", { length: 128 }).notNull().default("COMPRAR"),
  // Quais arquivos são exigidos
  requireProfilePhoto: int("requireProfilePhoto").notNull().default(1),
  requireCarDocument: int("requireCarDocument").notNull().default(1),
  requireAlvara: int("requireAlvara").notNull().default(0),
  requireCondutaxi: int("requireCondutaxi").notNull().default(0),
  requireVehicle2016: int("requireVehicle2016").notNull().default(0),
  isPdfOnly: int("isPdfOnly").notNull().default(0),
  showYearField: int("showYearField").notNull().default(0),
  cardColor: varchar("cardColor", { length: 32 }),
  cardBgColor: varchar("cardBgColor", { length: 32 }),
  cardTextColor: varchar("cardTextColor", { length: 32 }),
  cardBtnColor: varchar("cardBtnColor", { length: 32 }),
  isActive: int("isActive").notNull().default(1),
  sortOrder: int("sortOrder").notNull().default(0),
  resellerDiscount: decimal("resellerDiscount", { precision: 5, scale: 2 }), // % de desconto para revendedores por produto (prioridade sobre % global do cadastro)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;

// Opções individuais por produto (ex: "Nome Aleatório R$400", "Primeiro Nome R$550")
export const productOptions = mysqlTable("productOptions", {
  id: int("id").autoincrement().primaryKey(),
  productId: int("productId").notNull(),
  label: varchar("label", { length: 128 }).notNull(), // ex: "Nome Aleatório", "Primeiro Nome", "Nome Completo", "SUBIR DOC"
  price: varchar("price", { length: 64 }).notNull(), // ex: "R$ 400,00"
  originalPrice: varchar("originalPrice", { length: 64 }).default(""), // valor original riscado (promoção)
  type: varchar("type", { length: 32 }).notNull().default("standard"), // standard, pdf_only
  // Requisitos de documentos por opção
  requireProfilePhoto: int("requireProfilePhoto").notNull().default(0),
  requireCarDocument: int("requireCarDocument").notNull().default(0),
  requireAlvara: int("requireAlvara").notNull().default(0),
  requireCondutaxi: int("requireCondutaxi").notNull().default(0),
  requireVehicle2016: int("requireVehicle2016").notNull().default(0),
  isPdfOnly: int("isPdfOnly").notNull().default(0),
  showYearField: int("showYearField").notNull().default(0),
  // Forma de escolha do nome do documento
  docNameMode: varchar("docNameMode", { length: 32 }).notNull().default("none"), // none, random, first, full, custom
  docCustomName: varchar("docCustomName", { length: 128 }).default(""), // nome personalizado quando docNameMode = custom
  sortOrder: int("sortOrder").notNull().default(0),
  isActive: int("isActive").notNull().default(1),
  warranty: varchar("warranty", { length: 255 }).default(""), // texto de garantia da opção
  commissionValue: int("commissionValue").notNull().default(0), // valor de comissão em centavos (ex: 5000 = R$50,00)
  description: text("description").default(""), // especificação/descrição da opção exibida ao cliente
  resellerDiscount: decimal("resellerDiscount", { precision: 5, scale: 2 }), // % de desconto para revendedores nesta opção (prioridade sobre % global)
  promoEndsAt: bigint("promoEndsAt", { mode: "number" }), // timestamp ms UTC — quando a promoção expira (null = sem prazo)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ProductOption = typeof productOptions.$inferSelect;
export type InsertProductOption = typeof productOptions.$inferInsert;

// Perguntas customizáveis por opção de compra (formulário dinâmico)
export const productQuestions = mysqlTable("productQuestions", {
  id: int("id").autoincrement().primaryKey(),
  productId: int("productId").notNull(), // mantido para compatibilidade
  optionId: int("optionId"),  // nova FK - pergunta vinculada à opção
  question: varchar("question", { length: 256 }).notNull(),
  fieldType: mysqlEnum("fieldType", ["text", "select", "textarea"]).notNull().default("text"),
  options: text("options"), // JSON array para select: ["Opção 1", "Opção 2"]
  isRequired: int("isRequired").notNull().default(1),
  sortOrder: int("sortOrder").notNull().default(0),
  // Pergunta condicional: só aparece quando a pergunta pai tem a resposta triggerOption
  parentQuestionId: int("parentQuestionId"), // ID da pergunta pai (null = sempre exibida)
  triggerOption: varchar("triggerOption", { length: 256 }), // Resposta que ativa esta pergunta
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ProductQuestion = typeof productQuestions.$inferSelect;
export type InsertProductQuestion = typeof productQuestions.$inferInsert;

// Documentos dinâmicos por opção de compra (admin define nomes livremente)
export const optionDocuments = mysqlTable("optionDocuments", {
  id: int("id").autoincrement().primaryKey(),
  optionId: int("optionId").notNull(),
  label: varchar("label", { length: 128 }).notNull(), // ex: "CNH", "Foto Perfil", "Comprovante de Residência"
  exampleImageUrl: varchar("exampleImageUrl", { length: 512 }), // URL da foto exemplo personalizada
  inputSource: mysqlEnum("inputSource", ["camera", "gallery", "both"]).notNull().default("both"), // camera, gallery, ou both
  sortOrder: int("sortOrder").notNull().default(0),
  instruction: text("instruction"), // instrução exibida ao cliente na tela de upload
  exampleText: text("exampleText"), // texto exibido ao lado da foto de exemplo (bloco azul)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type OptionDocument = typeof optionDocuments.$inferSelect;
export type InsertOptionDocument = typeof optionDocuments.$inferInsert;

// Tabela de clientes cadastrados
export const customers = mysqlTable("customers", {
  id: int("id").autoincrement().primaryKey(),
  customerNumber: int("customerNumber"),
  name: varchar("name", { length: 128 }).notNull(),
  phone: varchar("phone", { length: 32 }).notNull().unique(),
  email: varchar("email", { length: 320 }),
  city: varchar("city", { length: 128 }),
  uf: varchar("uf", { length: 2 }),
  cpf: varchar("cpf", { length: 14 }),
  referredBy: varchar("referredBy", { length: 128 }),
  referredByPhone: varchar("referredByPhone", { length: 32 }),
  profilePhotoUrl: text("profilePhotoUrl"),
  lastAccessAt: timestamp("lastAccessAt"),
  fixedPassword: varchar("fixedPassword", { length: 64 }),
  fixedPasswordActive: int("fixedPasswordActive").notNull().default(0),
  adminNotes: text("adminNotes"), // Notas/avisos do admin (ex: recusou pergunta bloqueante)
  // Desconto de revendedor (cliente que faz pedidos para terceiros com preço de custo)
  isReseller: int("isReseller").notNull().default(0), // 1 = cliente é revendedor
  resellerDiscountType: mysqlEnum("resellerDiscountType", ["percent", "fixed"]).default("percent"), // tipo de desconto
  resellerDiscountValue: decimal("resellerDiscountValue", { precision: 10, scale: 2 }).default("0.00"), // valor do desconto (% ou R$)
  deletedAt: timestamp("deletedAt"), // Lixeira: data de exclusão (null = ativo)
  deletedReason: varchar("deletedReason", { length: 256 }), // Motivo da exclusão
  blocked: int("blocked").notNull().default(0), // 1 = cliente bloqueado pelo admin
  blockReason: varchar("blockReason", { length: 512 }), // Motivo do bloqueio
  blockedAt: timestamp("blockedAt"), // Data do bloqueio
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = typeof customers.$inferInsert;

// Histórico de status dos pedidos
export const orderStatusHistory = mysqlTable("orderStatusHistory", {
  id: int("id").autoincrement().primaryKey(),
  registrationId: int("registrationId").notNull(),
  orderNumber: int("orderNumber"),
  customerPhone: varchar("customerPhone", { length: 32 }).notNull(),
  status: varchar("status", { length: 64 }).notNull(),
  note: text("note"),
  serviceName: varchar("serviceName", { length: 256 }),
  serviceOption: varchar("serviceOption", { length: 256 }),
  pricePaid: varchar("pricePaid", { length: 64 }), // valor pago pelo cliente (ex: "R$ 350,00")
  answers: text("answers"),
  isUrgent: int("isUrgent").notNull().default(0),
  commissionPaid: int("commissionPaid").notNull().default(0),
  deliveryEstimate: bigint("deliveryEstimate", { mode: "number" }), // Unix timestamp (ms) da previsão de entrega
  // Fluxo de aprovação de pedidos novos: 'approved' = visível no fluxo normal; 'pending' = aguardando aprovação do admin
  approval: varchar("approval", { length: 16 }).notNull().default("approved"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  // Data/hora em que o e-mail ou WhatsApp de notificação de entrega foi enviado ao cliente
  deliveredNotifiedAt: timestamp("deliveredNotifiedAt"),
});

export type OrderStatusHistory = typeof orderStatusHistory.$inferSelect;
export type InsertOrderStatusHistory = typeof orderStatusHistory.$inferInsert;

// Arquivos de pedido (documentos salvos no S3)
export const orderFiles = mysqlTable("orderFiles", {
  id: int("id").autoincrement().primaryKey(),
  registrationId: int("registrationId").notNull(),
  customerPhone: varchar("customerPhone", { length: 32 }).notNull(),
  label: varchar("label", { length: 256 }).notNull(),
  fileUrl: text("fileUrl").notNull(),
  fileKey: varchar("fileKey", { length: 512 }).notNull(),
  mimeType: varchar("mimeType", { length: 128 }).notNull().default("image/jpeg"),
  fromAdmin: int("fromAdmin").notNull().default(0), // 1 = enviado pelo admin para o cliente
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type OrderFile = typeof orderFiles.$inferSelect;
export type InsertOrderFile = typeof orderFiles.$inferInsert;

// Sorteios
export const raffles = mysqlTable("raffles", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 256 }).notNull(),
  description: text("description"),
  status: mysqlEnum("status", ["open", "closed", "drawn"]).notNull().default("open"),
  maxNumbersPerPerson: int("maxNumbersPerPerson").default(1).notNull(),
  winnerNumber: int("winnerNumber"),
  winnerName: varchar("winnerName", { length: 128 }),
  winnerPhone: varchar("winnerPhone", { length: 32 }),
  winnerProfilePhotoUrl: text("winnerProfilePhotoUrl"),
  drawnAt: timestamp("drawnAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Raffle = typeof raffles.$inferSelect;
export type InsertRaffle = typeof raffles.$inferInsert;

// Entradas de sorteio (números escolhidos pelos clientes)
export const raffleEntries = mysqlTable("raffleEntries", {
  id: int("id").autoincrement().primaryKey(),
  raffleId: int("raffleId").notNull(),
  number: int("number").notNull(),
  customerName: varchar("customerName", { length: 128 }).notNull(),
  customerPhone: varchar("customerPhone", { length: 32 }).notNull(),
  paymentStatus: mysqlEnum("paymentStatus", ["pending", "paid"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type RaffleEntry = typeof raffleEntries.$inferSelect;
export type InsertRaffleEntry = typeof raffleEntries.$inferInsert;

// Configurações gerais do site (chave-valor)
export const siteSettings = mysqlTable("siteSettings", {
  id: int("id").autoincrement().primaryKey(),
  settingKey: varchar("settingKey", { length: 128 }).notNull().unique(),
  settingValue: text("settingValue"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SiteSetting = typeof siteSettings.$inferSelect;
export type InsertSiteSetting = typeof siteSettings.$inferInsert;

// Credenciais do painel admin (login independente do Manus)
export const adminCredentials = mysqlTable("adminCredentials", {
  id: int("id").autoincrement().primaryKey(),
  username: varchar("username", { length: 64 }).notNull().unique(),
  passwordHash: varchar("passwordHash", { length: 256 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type AdminCredential = typeof adminCredentials.$inferSelect;
export type InsertAdminCredential = typeof adminCredentials.$inferInsert;

// Bloqueio de PIN após tentativas erradas na página de acompanhamento
export const pinBlocks = mysqlTable("pinBlocks", {
  id: int("id").autoincrement().primaryKey(),
  phone: varchar("phone", { length: 32 }).notNull().unique(),
  attempts: int("attempts").notNull().default(0),
  blocked: int("blocked").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type PinBlock = typeof pinBlocks.$inferSelect;
export type InsertPinBlock = typeof pinBlocks.$inferInsert;

// Configurações globais do app (chave/valor)
export const appSettings = mysqlTable("appSettings", {
  id: int("id").autoincrement().primaryKey(),
  key: varchar("key", { length: 128 }).notNull().unique(),
  value: text("value").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type AppSetting = typeof appSettings.$inferSelect;
export type InsertAppSetting = typeof appSettings.$inferInsert;

// ========== SISTEMA DE PLANILHA DE MOTORISTA ==========

// Tabela de licenças (grátis/premium)
export const spreadsheetLicenses = mysqlTable("spreadsheetLicenses", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  type: mysqlEnum("type", ["free", "premium"]).notNull().default("free"),
  status: mysqlEnum("status", ["active", "expired", "cancelled"]).notNull().default("active"),
  expiresAt: timestamp("expiresAt"),
  blockedByAdmin: int("blockedByAdmin").notNull().default(0),
  lastAccessedAt: timestamp("lastAccessedAt"),
  accessCount: int("accessCount").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SpreadsheetLicense = typeof spreadsheetLicenses.$inferSelect;
export type InsertSpreadsheetLicense = typeof spreadsheetLicenses.$inferInsert;

// Tabela de ganhos diários
export const spreadsheetEarnings = mysqlTable("spreadsheetEarnings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
  uber: decimal("uber", { precision: 10, scale: 2 }).default("0"),
  ninetynine: decimal("ninetynine", { precision: 10, scale: 2 }).default("0"), // 99
  indrive: decimal("indrive", { precision: 10, scale: 2 }).default("0"),
  particular: decimal("particular", { precision: 10, scale: 2 }).default("0"), // Particular
  deliveries: decimal("deliveries", { precision: 10, scale: 2 }).default("0"),
  tips: decimal("tips", { precision: 10, scale: 2 }).default("0"),
  otherEarnings: decimal("otherEarnings", { precision: 10, scale: 2 }).default("0"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SpreadsheetEarning = typeof spreadsheetEarnings.$inferSelect;
export type InsertSpreadsheetEarning = typeof spreadsheetEarnings.$inferInsert;

// Tabela de gastos diários
export const spreadsheetExpenses = mysqlTable("spreadsheetExpenses", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
  fuel: decimal("fuel", { precision: 10, scale: 2 }).default("0"),
  carRental: decimal("carRental", { precision: 10, scale: 2 }).default("0"),
  maintenance: decimal("maintenance", { precision: 10, scale: 2 }).default("0"),
  oilChange: decimal("oilChange", { precision: 10, scale: 2 }).default("0"),
  washing: decimal("washing", { precision: 10, scale: 2 }).default("0"),
  insurance: decimal("insurance", { precision: 10, scale: 2 }).default("0"),
  internetPhone: decimal("internetPhone", { precision: 10, scale: 2 }).default("0"),
  food: decimal("food", { precision: 10, scale: 2 }).default("0"),
  parking: decimal("parking", { precision: 10, scale: 2 }).default("0"),
  tolls: decimal("tolls", { precision: 10, scale: 2 }).default("0"),
  financing: decimal("financing", { precision: 10, scale: 2 }).default("0"),
  fines: decimal("fines", { precision: 10, scale: 2 }).default("0"),
  accessories: decimal("accessories", { precision: 10, scale: 2 }).default("0"),
  otherExpenses: decimal("otherExpenses", { precision: 10, scale: 2 }).default("0"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SpreadsheetExpense = typeof spreadsheetExpenses.$inferSelect;
export type InsertSpreadsheetExpense = typeof spreadsheetExpenses.$inferInsert;

// Tabela de controle operacional
export const spreadsheetOperational = mysqlTable("spreadsheetOperational", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
  kmInitial: decimal("kmInitial", { precision: 10, scale: 2 }).default("0"),
  kmFinal: decimal("kmFinal", { precision: 10, scale: 2 }).default("0"),
  timeInitial: varchar("timeInitial", { length: 5 }), // HH:MM
  timeFinal: varchar("timeFinal", { length: 5 }), // HH:MM
  rideCount: int("rideCount").default(0), // legado: total de corridas (mantido por compatibilidade)
  ridesUber: int("ridesUber").default(0),
  rides99: int("rides99").default(0),
  ridesIndrive: int("ridesIndrive").default(0),
  ridesParticular: int("ridesParticular").default(0),
  ridesDeliveries: int("ridesDeliveries").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SpreadsheetOperational = typeof spreadsheetOperational.$inferSelect;
export type InsertSpreadsheetOperational = typeof spreadsheetOperational.$inferInsert;

// Tabela de metas
export const spreadsheetGoals = mysqlTable("spreadsheetGoals", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  month: varchar("month", { length: 7 }).notNull(), // YYYY-MM
  dailyGoal: decimal("dailyGoal", { precision: 10, scale: 2 }).default("0"),
  weeklyGoal: decimal("weeklyGoal", { precision: 10, scale: 2 }).default("0"),
  monthlyGoal: decimal("monthlyGoal", { precision: 10, scale: 2 }).default("0"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SpreadsheetGoal = typeof spreadsheetGoals.$inferSelect;
export type InsertSpreadsheetGoal = typeof spreadsheetGoals.$inferInsert;

// Permissões de produto por cliente (controle de acesso via senha fixa)
export const customerProductAccess = mysqlTable("customerProductAccess", {
  id: int("id").autoincrement().primaryKey(),
  phone: varchar("phone", { length: 32 }).notNull(),
  productId: int("productId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type CustomerProductAccess = typeof customerProductAccess.$inferSelect;
export type InsertCustomerProductAccess = typeof customerProductAccess.$inferInsert;

// Tipos de status de pedido editáveis pelo admin
export const orderStatusTypes = mysqlTable("orderStatusTypes", {
  id: int("id").autoincrement().primaryKey(),
  key: varchar("key", { length: 64 }).notNull().unique(),       // ex: "aguardando_ativa"
  label: varchar("label", { length: 128 }).notNull(),           // ex: "Aguardando Ficar Ativa"
  color: varchar("color", { length: 64 }).notNull().default("text-gray-400"),   // classe Tailwind
  bgColor: varchar("bgColor", { length: 128 }).notNull().default("bg-gray-500/20 border-gray-500/40"),
  icon: varchar("icon", { length: 32 }).notNull().default("Clock"),             // nome do ícone Lucide
  description: text("description"),                             // texto explicativo para o cliente
  sortOrder: int("sortOrder").notNull().default(0),
  isSystem: int("isSystem").notNull().default(0),               // 1 = protegido, não pode excluir
  isActive: int("isActive").notNull().default(1),
  pulseColor: varchar("pulseColor", { length: 32 }).default("#ffffff"),  // cor hex do neon/pulso
  showInProgress: int("showInProgress").notNull().default(0),  // 1 = aparece na barra de progresso do cliente
  progressOrder: int("progressOrder").notNull().default(0),    // ordem na barra de progresso do cliente
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type OrderStatusType = typeof orderStatusTypes.$inferSelect;
export type InsertOrderStatusType = typeof orderStatusTypes.$inferInsert;

// Contador de pedidos (AUTO_INCREMENT = 10000)
export const orderCounter = mysqlTable("orderCounter", {
  id: int("id").autoincrement().primaryKey(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type OrderCounter = typeof orderCounter.$inferSelect;

// Banners informativos editáveis pelo admin
export const infoBanners = mysqlTable("infoBanners", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 256 }).notNull(),
  content: text("content").notNull(),
  bgColor: varchar("bgColor", { length: 32 }).notNull().default("#1e3a5f"),
  textColor: varchar("textColor", { length: 32 }).notNull().default("#ffffff"),
  sortOrder: int("sortOrder").notNull().default(0),
  isActive: int("isActive").notNull().default(1),
  targetPages: varchar("targetPages", { length: 128 }).notNull().default("gastos"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type InfoBanner = typeof infoBanners.$inferSelect;
export type InsertInfoBanner = typeof infoBanners.$inferInsert;

// Anotações internas do admin por pedido (não visíveis ao cliente)
export const orderNotes = mysqlTable("orderNotes", {
  id: int("id").autoincrement().primaryKey(),
  registrationId: int("registrationId").notNull(),
  content: text("content").notNull(),
  blockName: varchar("blockName", { length: 100 }).default("Bloco 1").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type OrderNote = typeof orderNotes.$inferSelect;
export type InsertOrderNote = typeof orderNotes.$inferInsert;

// Tabela de sub-pedidos ocultos (soft delete): admin remove o card sem apagar dados do banco
export const hiddenSubOrders = mysqlTable("hiddenSubOrders", {
  id: int("id").autoincrement().primaryKey(),
  registrationId: int("registrationId").notNull(),
  subOrderIndex: int("subOrderIndex").notNull(),
  hiddenAt: timestamp("hiddenAt").defaultNow().notNull(),
  deletedReason: varchar("deletedReason", { length: 256 }), // Motivo da exclusão
  customerPhone: varchar("customerPhone", { length: 32 }), // Telefone do cliente (para exibir na lixeira)
  customerName: varchar("customerName", { length: 128 }), // Nome do cliente (para exibir na lixeira)
  serviceName: varchar("serviceName", { length: 256 }), // Nome do serviço (para exibir na lixeira)
});
export type HiddenSubOrder = typeof hiddenSubOrders.$inferSelect;
export type InsertHiddenSubOrder = typeof hiddenSubOrders.$inferInsert;

// Dados de login liberado pelo admin por pedido (login, senha, código autenticador)
export const orderLoginData = mysqlTable("orderLoginData", {
  id: int("id").autoincrement().primaryKey(),
  registrationId: int("registrationId").notNull(),
  customerPhone: varchar("customerPhone", { length: 32 }).notNull(),
  loginPhone: varchar("loginPhone", { length: 64 }),
  loginEmail: varchar("loginEmail", { length: 320 }),
  loginPassword: varchar("loginPassword", { length: 256 }),
  authCode: varchar("authCode", { length: 512 }),
  emailLink: varchar("emailLink", { length: 512 }),
  loginNotes: text("loginNotes"),
  loginGroupLink: varchar("loginGroupLink", { length: 1024 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type OrderLoginData = typeof orderLoginData.$inferSelect;
export type InsertOrderLoginData = typeof orderLoginData.$inferInsert;

// Senha personalizada do cliente para acompanhar pedido
// firstAccess=1: cliente ainda não criou senha pessoal (usa 4 últimos dígitos do telefone)
// firstAccess=0: cliente já criou senha pessoal
export const customerPins = mysqlTable("customerPins", {
  id: int("id").autoincrement().primaryKey(),
  phone: varchar("phone", { length: 32 }).notNull().unique(),
  pin: varchar("pin", { length: 4 }),           // senha personalizada (null = ainda não criou)
  firstAccess: int("firstAccess").notNull().default(1), // 1=primeiro acesso, 0=já criou senha
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CustomerPin = typeof customerPins.$inferSelect;
export type InsertCustomerPin = typeof customerPins.$inferInsert;

// Solicitações de documentos pendentes pelo admin
// status: 'pending' = aguardando cliente, 'answered' = cliente respondeu, 'closed' = encerrado
export const docRequests = mysqlTable("docRequests", {
  id: int("id").autoincrement().primaryKey(),
  registrationId: int("registrationId").notNull(),
  customerPhone: varchar("customerPhone", { length: 32 }).notNull(),
  docLabel: varchar("docLabel", { length: 128 }),   // nome do documento solicitado (ex: CNH)
  message: text("message").notNull(),              // mensagem do admin explicando o que precisa
  status: varchar("status", { length: 32 }).notNull().default("pending"), // pending | answered | closed
  answeredFileId: int("answeredFileId"),            // id do orderFile enviado como resposta
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type DocRequest = typeof docRequests.$inferSelect;
export type InsertDocRequest = typeof docRequests.$inferInsert;

// Tabela para sessões de upload em chunks (persistente entre instâncias do Cloud Run)
export const uploadSessions = mysqlTable("uploadSessions", {
  uploadId: varchar("uploadId", { length: 64 }).primaryKey(),
  registrationId: varchar("registrationId", { length: 32 }).notNull(),
  customerPhone: varchar("customerPhone", { length: 32 }).notNull(),
  label: varchar("label", { length: 256 }).notNull(),
  fromAdmin: varchar("fromAdmin", { length: 4 }).notNull().default("0"),
  mimeType: varchar("mimeType", { length: 64 }).notNull(),
  ext: varchar("ext", { length: 16 }).notNull(),
  contentType: varchar("contentType", { length: 64 }).notNull(),
  fileKey: varchar("fileKey", { length: 512 }).notNull(),
  totalChunks: int("totalChunks").notNull(),
  receivedChunks: int("receivedChunks").notNull().default(0),
  jobStatus: varchar("jobStatus", { length: 16 }).default("pending"),
  jobUrl: varchar("jobUrl", { length: 1024 }),
  jobError: varchar("jobError", { length: 512 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type UploadSession = typeof uploadSessions.$inferSelect;

// Tabela de bloqueio de cadastro por nome/telefone
export const blocklist = mysqlTable("blocklist", {
  id: int("id").autoincrement().primaryKey(),
  type: mysqlEnum("type", ["name", "phone", "both"]).notNull().default("phone"),
  name: varchar("name", { length: 256 }),
  phone: varchar("phone", { length: 32 }),
  reason: varchar("reason", { length: 512 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Blocklist = typeof blocklist.$inferSelect;
export type InsertBlocklist = typeof blocklist.$inferInsert;

// Tabela de configurações do sistema (fuso horário, etc.)
export const systemConfig = mysqlTable("system_config", {
  id: int("id").autoincrement().primaryKey(),
  configKey: varchar("config_key", { length: 100 }).notNull().unique(),
  configValue: text("config_value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});
export type SystemConfig = typeof systemConfig.$inferSelect;

// Tabela de IPs bloqueados pelo admin
export const ipBlocklist = mysqlTable("ipBlocklist", {
  id: int("id").autoincrement().primaryKey(),
  ip: varchar("ip", { length: 64 }).notNull().unique(),
  reason: varchar("reason", { length: 512 }),
  blockedBy: varchar("blockedBy", { length: 64 }).notNull().default("admin"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type IpBlocklist = typeof ipBlocklist.$inferSelect;
export type InsertIpBlocklist = typeof ipBlocklist.$inferInsert;

// Tabela de log de acessos por IP
export const ipAccessLog = mysqlTable("ipAccessLog", {
  id: int("id").autoincrement().primaryKey(),
  ip: varchar("ip", { length: 64 }).notNull(),
  action: varchar("action", { length: 64 }).notNull(),
  customerPhone: varchar("customerPhone", { length: 32 }),
  customerName: varchar("customerName", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type IpAccessLog = typeof ipAccessLog.$inferSelect;

// Tabela de tentativas de acesso com VPN/Proxy
export const vpnAttempts = mysqlTable("vpnAttempts", {
  id: int("id").autoincrement().primaryKey(),
  ip: varchar("ip", { length: 64 }).notNull(),
  isp: varchar("isp", { length: 256 }),
  org: varchar("org", { length: 256 }),
  country: varchar("country", { length: 64 }),
  detectionType: varchar("detectionType", { length: 32 }).notNull().default("vpn"),
  customerPhone: varchar("customerPhone", { length: 32 }),
  customerName: varchar("customerName", { length: 128 }),
  userAgent: varchar("userAgent", { length: 512 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type VpnAttempt = typeof vpnAttempts.$inferSelect;

// Broadcasts - envio em massa para clientes
export const broadcasts = mysqlTable("broadcasts", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 256 }).notNull(),
  messageType: mysqlEnum("messageType", ["text", "link", "banner", "group_invite", "promo"]).notNull().default("text"),
  message: text("message").notNull(),
  linkUrl: text("linkUrl"),
  linkLabel: varchar("linkLabel", { length: 128 }),
  imageUrl: text("imageUrl"),
  targetType: mysqlEnum("targetType", ["all", "selected"]).notNull().default("all"),
  targetPhones: text("targetPhones"), // JSON array de phones quando targetType = selected
  totalRecipients: int("totalRecipients").notNull().default(0),
  emailsSent: int("emailsSent").notNull().default(0),
  emailsFailed: int("emailsFailed").notNull().default(0),
  status: mysqlEnum("status", ["draft", "sending", "sent", "cancelled"]).notNull().default("draft"),
  sendIntervalSeconds: int("sendIntervalSeconds").notNull().default(0),
  scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
  sentAt: timestamp("sentAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Broadcast = typeof broadcasts.$inferSelect;
export type InsertBroadcast = typeof broadcasts.$inferInsert;

export const broadcastQueue = mysqlTable("broadcastQueue", {
  id: int("id").autoincrement().primaryKey(),
  broadcastId: int("broadcastId").notNull(),
  recipientEmail: varchar("recipientEmail", { length: 256 }).notNull(),
  recipientPhone: varchar("recipientPhone", { length: 32 }),
  status: mysqlEnum("status", ["pending", "sent", "failed"]).notNull().default("pending"),
  sentAt: timestamp("sentAt"),
  error: text("error"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type BroadcastQueue = typeof broadcastQueue.$inferSelect;
export type InsertBroadcastQueue = typeof broadcastQueue.$inferInsert;

// Tabela de tentativas de acesso bloqueado (números na lista negra)
export const blockedAccessAttempts = mysqlTable("blockedAccessAttempts", {
  id: int("id").autoincrement().primaryKey(),
  phone: varchar("phone", { length: 32 }).notNull(),
  action: varchar("action", { length: 64 }).notNull(), // ex: "acompanhar_pedido", "cadastro", "verificar_pin"
  ip: varchar("ip", { length: 64 }),
  reason: varchar("reason", { length: 256 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type BlockedAccessAttempt = typeof blockedAccessAttempts.$inferSelect;

// Contas PIX - múltiplas contas com seleção de ativa
export const pixAccounts = mysqlTable("pixAccounts", {
  id: int("id").autoincrement().primaryKey(),
  label: varchar("label", { length: 128 }).notNull().default("PIX Principal"),
  pixKey: varchar("pixKey", { length: 256 }).notNull(),
  pixType: varchar("pixType", { length: 64 }).notNull().default("TELEFONE"),
  pixName: varchar("pixName", { length: 256 }).notNull(),
  pixBank: varchar("pixBank", { length: 128 }).notNull().default(""),
  isActive: int("isActive").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type PixAccount = typeof pixAccounts.$inferSelect;
export type InsertPixAccount = typeof pixAccounts.$inferInsert;

// ── SISTEMA DE REVENDEDORES ───────────────────────────────────────────────────

// Tabela de revendedores
export const resellers = mysqlTable("resellers", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  phone: varchar("phone", { length: 32 }).notNull().unique(),
  email: varchar("email", { length: 320 }),
  slug: varchar("slug", { length: 64 }).notNull().unique(), // ex: "rafael" → walkajuda.com/r/rafael
  username: varchar("username", { length: 64 }).notNull().unique(),
  passwordHash: varchar("passwordHash", { length: 256 }).notNull(),
  isActive: int("isActive").notNull().default(1),
  notes: text("notes"), // anotações internas do admin
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Reseller = typeof resellers.$inferSelect;
export type InsertReseller = typeof resellers.$inferInsert;

// Preços de venda do revendedor por opção de produto
// O revendedor define quanto cobra do cliente por cada opção
export const resellerPrices = mysqlTable("resellerPrices", {
  id: int("id").autoincrement().primaryKey(),
  resellerId: int("resellerId").notNull(),
  optionId: int("optionId").notNull(), // FK para productOptions.id
  salePrice: varchar("salePrice", { length: 64 }).notNull(), // ex: "R$ 80,00" (preço que o cliente vê)
  costPrice: varchar("costPrice", { length: 64 }).notNull().default(""), // ex: "R$ 50,00" (preço de custo definido pelo admin)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ResellerPrice = typeof resellerPrices.$inferSelect;
export type InsertResellerPrice = typeof resellerPrices.$inferInsert;

// Pedidos vinculados a revendedores
// Quando cliente acessa via /r/:slug, o pedido fica vinculado ao revendedor
export const resellerOrders = mysqlTable("resellerOrders", {
  id: int("id").autoincrement().primaryKey(),
  resellerId: int("resellerId").notNull(),
  registrationId: int("registrationId").notNull(), // FK para accessCodePhones.id
  customerPhone: varchar("customerPhone", { length: 32 }).notNull(),
  salePrice: varchar("salePrice", { length: 64 }).notNull(), // preço cobrado do cliente
  costPrice: varchar("costPrice", { length: 64 }).notNull().default(""), // preço de custo do admin
  commissionPaid: int("commissionPaid").notNull().default(0), // 1 = admin já pagou o revendedor
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ResellerOrder = typeof resellerOrders.$inferSelect;
export type InsertResellerOrder = typeof resellerOrders.$inferInsert;

// ─── Controle Financeiro ────────────────────────────────────────────────────
// Registro de vendas para o módulo financeiro
// Criado automaticamente ao submeter pedido; atualizado ao mudar status
export const financialSales = mysqlTable("financialSales", {
  id: int("id").autoincrement().primaryKey(),
  registrationId: int("registrationId"), // FK para accessCodePhones.id (pode ser null para vendas manuais)
  customerName: varchar("customerName", { length: 256 }).notNull().default(""),
  customerPhone: varchar("customerPhone", { length: 32 }).notNull().default(""),
  productName: varchar("productName", { length: 256 }).notNull().default(""),
  productOption: varchar("productOption", { length: 256 }).notNull().default(""),
  saleValue: int("saleValue").notNull().default(0), // em centavos
  costValue: int("costValue").notNull().default(0), // custo/comissão em centavos
  paymentMethod: varchar("paymentMethod", { length: 64 }).notNull().default("pix"), // pix | dinheiro | cartao | outro
  status: varchar("status", { length: 32 }).notNull().default("pendente"), // pendente | pago | cancelado
  saleDate: bigint("saleDate", { mode: "number" }).notNull(), // timestamp ms
  receivedDate: bigint("receivedDate", { mode: "number" }), // timestamp ms (null = não recebido)
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type FinancialSale = typeof financialSales.$inferSelect;
export type InsertFinancialSale = typeof financialSales.$inferInsert;

// ─── Links de Indicação por Cliente ─────────────────────────────────────────
// Cada cliente pode ter múltiplos links de indicação com comissão configurável
export const referralLinks = mysqlTable("referralLinks", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId").notNull(), // FK para customers.id
  customerName: varchar("customerName", { length: 128 }).notNull().default(""),
  code: varchar("code", { length: 32 }).notNull().unique(), // código único ex: JOAO-A1B2
  commissionValue: int("commissionValue").notNull().default(0), // em centavos
  commissionType: varchar("commissionType", { length: 16 }).notNull().default("fixed"), // fixed | percent
  productId: int("productId"), // produto específico que gera comissão (null = qualquer produto)
  productName: varchar("productName", { length: 256 }), // nome do produto para exibição
  usageCount: int("usageCount").notNull().default(0), // quantas vezes foi usado
  active: int("active").notNull().default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ReferralLink = typeof referralLinks.$inferSelect;
export type InsertReferralLink = typeof referralLinks.$inferInsert;

// Registro de cada uso do link de indicação
export const referralUsages = mysqlTable("referralUsages", {
  id: int("id").autoincrement().primaryKey(),
  referralLinkId: int("referralLinkId").notNull(),
  registrationId: int("registrationId"), // FK para accessCodePhones.id
  clientName: varchar("clientName", { length: 128 }).notNull().default(""),
  clientPhone: varchar("clientPhone", { length: 32 }).notNull().default(""),
  commissionPaid: int("commissionPaid").notNull().default(0), // 1 = comissão paga
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ReferralUsage = typeof referralUsages.$inferSelect;
export type InsertReferralUsage = typeof referralUsages.$inferInsert;

// ─── Formulário Dinâmico - Tela de Acompanhamento ────────────────────────────
// Perguntas criadas pelo admin que aparecem na tela /acompanhar
export const trackingQuestions = mysqlTable("trackingQuestions", {
  id: int("id").autoincrement().primaryKey(),
  text: varchar("text", { length: 512 }).notNull(),
  options: text("options").notNull().default("[]"), // JSON: [{label, color, blocking}]
  isActive: int("isActive").notNull().default(1),
  showOnce: int("showOnce").notNull().default(1), // 1 = aparece só uma vez por pedido
  sortOrder: int("sortOrder").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type TrackingQuestion = typeof trackingQuestions.$inferSelect;
export type InsertTrackingQuestion = typeof trackingQuestions.$inferInsert;

// Respostas dos clientes às perguntas de acompanhamento
export const trackingAnswers = mysqlTable("trackingAnswers", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull(),
  customerId: int("customerId"),
  questionId: int("questionId").notNull(),
  questionText: varchar("questionText", { length: 512 }).notNull().default(""),
  answer: varchar("answer", { length: 256 }).notNull(),
  answeredAt: timestamp("answeredAt").defaultNow().notNull(),
});
export type TrackingAnswer = typeof trackingAnswers.$inferSelect;
export type InsertTrackingAnswer = typeof trackingAnswers.$inferInsert;

// Perguntas enviadas individualmente pelo admin para um pedido específico
export const trackingQuestionAssignments = mysqlTable("trackingQuestionAssignments", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull(),
  questionId: int("questionId").notNull(),
  questionText: varchar("questionText", { length: 512 }).notNull().default(""),
  questionOptions: text("questionOptions").notNull().default("[]"),
  sentAt: timestamp("sentAt").defaultNow().notNull(),
  answeredAt: timestamp("answeredAt"),
  answer: varchar("answer", { length: 256 }),
});
export type TrackingQuestionAssignment = typeof trackingQuestionAssignments.$inferSelect;
export type InsertTrackingQuestionAssignment = typeof trackingQuestionAssignments.$inferInsert;

// ─── Foto Protegida ────────────────────────────────────────────────────────────
// Admin faz upload de uma foto que só é liberada para clientes com número cadastrado
export const protectedPhotos = mysqlTable("protectedPhotos", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 256 }).notNull().default("📸 Foto protegida"),
  message: text("message").notNull().default("Para visualizar a foto, finalize seu cadastro e confirme seus dados.\n\n✅ O acesso será registrado automaticamente."),
  imageUrl: text("imageUrl").notNull(),
  imageKey: varchar("imageKey", { length: 512 }).notNull(),
  isActive: int("isActive").notNull().default(1),
  sortOrder: int("sortOrder").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ProtectedPhoto = typeof protectedPhotos.$inferSelect;
export type InsertProtectedPhoto = typeof protectedPhotos.$inferInsert;

// ─── Logs de Acesso à Foto Protegida ──────────────────────────────────────────
// Registra quais números de telefone acessaram e visualizaram a foto protegida
export const photoAccessLogs = mysqlTable("photoAccessLogs", {
  id: int("id").autoincrement().primaryKey(),
  phone: varchar("phone", { length: 32 }).notNull(),
  photoId: int("photoId").notNull(),
  accessedAt: timestamp("accessedAt").defaultNow().notNull(),
  ip: varchar("ip", { length: 64 }),
});
export type PhotoAccessLog = typeof photoAccessLogs.$inferSelect;
export type InsertPhotoAccessLog = typeof photoAccessLogs.$inferInsert;

// ─── Configuração de Progresso por Pedido ─────────────────────────────────────
// Permite ao admin definir quais status aparecem na barra de progresso do cliente
// para cada pedido específico, e em qual ordem
export const orderProgressConfig = mysqlTable("orderProgressConfig", {
  id: int("id").autoincrement().primaryKey(),
  registrationId: int("registrationId").notNull(),
  subOrderIndex: int("subOrderIndex").notNull().default(0),
  statusKey: varchar("statusKey", { length: 64 }).notNull(),
  progressOrder: int("progressOrder").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type OrderProgressConfig = typeof orderProgressConfig.$inferSelect;
export type InsertOrderProgressConfig = typeof orderProgressConfig.$inferInsert;

// ─── Tentativas de Login Admin ────────────────────────────────────────────────
// Registra tentativas de login no painel admin por IP
export const adminLoginAttempts = mysqlTable("adminLoginAttempts", {
  id: int("id").autoincrement().primaryKey(),
  ip: varchar("ip", { length: 64 }).notNull(),
  attempts: int("attempts").notNull().default(1),
  blocked: int("blocked").notNull().default(0), // 0=livre, 1=bloqueado
  lastAttemptAt: timestamp("lastAttemptAt").defaultNow().notNull(),
  blockedAt: timestamp("blockedAt"),
  unlockedAt: timestamp("unlockedAt"),
});
export type AdminLoginAttempt = typeof adminLoginAttempts.$inferSelect;
export type InsertAdminLoginAttempt = typeof adminLoginAttempts.$inferInsert;

// ─── FAQ / Caixa de Ajuda ─────────────────────────────────────────────────────
// Configuração geral do FAQ (título, cores, visibilidade)
export const faqConfig = mysqlTable("faqConfig", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 256 }).notNull().default("Tire suas dúvidas antes de finalizar seu pedido"),
  subtitle: varchar("subtitle", { length: 512 }),
  buttonLabel: varchar("buttonLabel", { length: 128 }).notNull().default("Tire suas dúvidas"),
  buttonColor: varchar("buttonColor", { length: 32 }).notNull().default("#8b5cf6"),
  buttonTextColor: varchar("buttonTextColor", { length: 32 }).notNull().default("#ffffff"),
  headerColor: varchar("headerColor", { length: 32 }).notNull().default("#1e1b4b"),
  headerTextColor: varchar("headerTextColor", { length: 32 }).notNull().default("#ffffff"),
  accentColor: varchar("accentColor", { length: 32 }).notNull().default("#8b5cf6"),
  enabled: int("enabled").notNull().default(1),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type FaqConfig = typeof faqConfig.$inferSelect;
export type InsertFaqConfig = typeof faqConfig.$inferInsert;

// Perguntas e respostas do FAQ
export const faqItems = mysqlTable("faqItems", {
  id: int("id").autoincrement().primaryKey(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  order: int("order").notNull().default(0),
  enabled: int("enabled").notNull().default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type FaqItem = typeof faqItems.$inferSelect;
export type InsertFaqItem = typeof faqItems.$inferInsert;

// ─── SISTEMA DE AGENDAMENTO DE ATENDIMENTO ────────────────────────────────────
// Slots de data/hora disponíveis definidos pelo admin.
// Cada slot representa um horário único que o cliente pode escolher.
// status: 'available' = livre, 'booked' = reservado por um cliente, 'disabled' = desativado pelo admin
export const scheduleSlots = mysqlTable("scheduleSlots", {
  id: int("id").autoincrement().primaryKey(),
  templateId: int("templateId"),                           // FK para scheduleTemplates.id (null = geral, vale para qualquer modelo)
  slotDate: varchar("slotDate", { length: 16 }).notNull(), // formato YYYY-MM-DD
  slotTime: varchar("slotTime", { length: 8 }).notNull(),  // formato HH:MM (24h)
  capacity: int("capacity").notNull().default(1),          // quantos clientes cabem neste horário
  bookedCount: int("bookedCount").notNull().default(0),    // quantos já agendaram
  status: mysqlEnum("status", ["available", "disabled"]).notNull().default("available"),
  note: varchar("note", { length: 256 }),                  // observação interna opcional
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ScheduleSlot = typeof scheduleSlots.$inferSelect;
export type InsertScheduleSlot = typeof scheduleSlots.$inferInsert;

// Agendamentos confirmados, vinculados a um pedido específico (registrationId + subOrderIndex).
// Cada pedido recebe um token único usado no link individual (/agendar/:token).
// status: 'pending' = link enviado, cliente ainda não escolheu; 'confirmed' = cliente escolheu data/hora;
//         'cancelled' = cancelado pelo admin/cliente
export const scheduleAppointments = mysqlTable("scheduleAppointments", {
  id: int("id").autoincrement().primaryKey(),
  token: varchar("token", { length: 64 }).notNull().unique(), // token do link individual
  registrationId: int("registrationId").notNull(),           // FK para accessCodePhones.id
  subOrderIndex: int("subOrderIndex").notNull().default(0),
  customerPhone: varchar("customerPhone", { length: 32 }).notNull(),
  customerName: varchar("customerName", { length: 128 }),
  customerEmail: varchar("customerEmail", { length: 320 }),
  customerPhotoUrl: text("customerPhotoUrl"),  // URL da foto do cliente
  serviceName: varchar("serviceName", { length: 256 }),
  templateId: int("templateId"),                             // FK para scheduleTemplates.id (modelo aplicado neste agendamento)
  slotId: int("slotId"),                                     // FK para scheduleSlots.id (null enquanto não escolheu)
  slotDate: varchar("slotDate", { length: 16 }),             // copiado do slot ao confirmar
  slotTime: varchar("slotTime", { length: 8 }),              // copiado do slot ao confirmar
  status: mysqlEnum("status", ["pending", "confirmed", "cancelled", "completed"]).notNull().default("pending"),
  instructions: text("instructions"),                        // mensagem explicativa enviada ao cliente
  sentByEmail: int("sentByEmail").notNull().default(0),      // 1 = link enviado por email
  confirmedAt: timestamp("confirmedAt"),
  adminSeenConfirmedAt: timestamp("adminSeenConfirmedAt"),  // quando admin dispensou o alerta de confirmação
  hasScheduleNotification: int("hasScheduleNotification").notNull().default(0),  // 1 = notificação de agendamento enviada
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ScheduleAppointment = typeof scheduleAppointments.$inferSelect;
export type InsertScheduleAppointment = typeof scheduleAppointments.$inferInsert;

// Configuração global do agendamento (mensagem explicativa reutilizável, título, instruções padrão).
// Uma única linha (id=1) que o admin edita e é aplicada a todos os envios.
export const scheduleConfig = mysqlTable("scheduleConfig", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 256 }).notNull().default("Agende seu atendimento"),
  introMessage: text("introMessage").notNull().default("Seu pedido precisa ser agendado. Escolha abaixo a melhor data e horário disponível para o seu atendimento."),
  emailSubject: varchar("emailSubject", { length: 256 }).notNull().default("Agende seu atendimento - WALK AJUDA"),
  emailMessage: text("emailMessage").notNull().default("Olá! Seu pedido precisa ser agendado. Clique no link abaixo para escolher a data e o horário do seu atendimento."),
  whatsappMessage: text("whatsappMessage").notNull().default("Olá! Seu pedido na WALK AJUDA precisa ser agendado. Acesse o link para escolher a data e o horário do seu atendimento:"),
  scheduledWhatsappMessage: text("scheduledWhatsappMessage").notNull().default("Olá {nome}! Seu atendimento está confirmado para o dia {data} às {hora}. Fique disponível no WhatsApp nesse horário. Qualquer dúvida, estamos à disposição!"),
  confirmationMessage: text("confirmationMessage").notNull().default("Seu atendimento foi agendado com sucesso! Guarde a data e o horário escolhidos. O atendimento será feito pelo WhatsApp nesse horário."),
  // Aviso exibido ao cliente: se não comparecer quando chamado, terá que reagendar
  noShowWarning: text("noShowWarning").notNull().default("ATENÇÃO: O atendimento será feito pelo WhatsApp no horário escolhido. Fique disponível no seu WhatsApp nesse horário. Se você não atender quando for chamado, será necessário reagendar."),
  accentColor: varchar("accentColor", { length: 32 }).notNull().default("#8b5cf6"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ScheduleConfig = typeof scheduleConfig.$inferSelect;
export type InsertScheduleConfig = typeof scheduleConfig.$inferInsert;

// Modelos de agendamento PRÉ-FEITOS criados pelo admin (reutilizáveis em qualquer pedido).
// Ex.: "Agendamento para foto de perfil" com sua mensagem própria.
// O admin cria uma vez e aplica com um clique dentro de qualquer pedido.
export const scheduleTemplates = mysqlTable("scheduleTemplates", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 256 }).notNull(),          // ex: "Agendamento para foto de perfil"
  serviceName: varchar("serviceName", { length: 256 }).notNull().default(""), // o que será agendado (texto livre)
  instructions: text("instructions").notNull().default(""),  // mensagem explicativa para o cliente
  emailSubject: varchar("emailSubject", { length: 256 }),    // assunto do email (null = usa o global)
  emailMessage: text("emailMessage"),                        // corpo do email (null = usa o global)
  whatsappMessage: text("whatsappMessage"),                  // mensagem do whatsapp (null = usa o global)
  scheduledWhatsappMessage: text("scheduledWhatsappMessage"), // mensagem quando horário confirmado (null = usa o global)
  isActive: int("isActive").notNull().default(1),
  sortOrder: int("sortOrder").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ScheduleTemplate = typeof scheduleTemplates.$inferSelect;
export type InsertScheduleTemplate = typeof scheduleTemplates.$inferInsert;

// Pastas personalizadas criadas pelo admin
export const customFolders = mysqlTable("customFolders", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  icon: varchar("icon", { length: 64 }).default("📁"),
  color: varchar("color", { length: 32 }).default("#8b5cf6"),
  sortOrder: int("sortOrder").notNull().default(0),
  hidden: int("hidden").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CustomFolder = typeof customFolders.$inferSelect;
export type InsertCustomFolder = typeof customFolders.$inferInsert;

// Pedidos dentro de pastas personalizadas
export const customFolderOrders = mysqlTable("customFolderOrders", {
  id: int("id").autoincrement().primaryKey(),
  folderId: int("folderId").notNull(),
  registrationId: int("registrationId").notNull(),
  subOrderIndex: int("subOrderIndex").notNull().default(0),
  movedAt: timestamp("movedAt").defaultNow().notNull(),
});
export type CustomFolderOrder = typeof customFolderOrders.$inferSelect;
export type InsertCustomFolderOrder = typeof customFolderOrders.$inferInsert;

// Pedidos dentro de pastas fixas (Entregues, Arquivo, RG/CNH)
export const fixedFolderOrders = mysqlTable("fixedFolderOrders", {
  id: int("id").autoincrement().primaryKey(),
  folderKey: varchar("folderKey", { length: 32 }).notNull(), // 'entregues' | 'entregues_2' | 'arquivo' | 'rgcnh'
  registrationId: int("registrationId").notNull(),
  subOrderIndex: int("subOrderIndex").notNull().default(0),
  movedAt: timestamp("movedAt").defaultNow().notNull(),
});
export type FixedFolderOrder = typeof fixedFolderOrders.$inferSelect;
export type InsertFixedFolderOrder = typeof fixedFolderOrders.$inferInsert;

// Configuração das pastas fixas (Entregues, Arquivo, RG/CNH)
export const folderConfig = mysqlTable("folderConfig", {
  id: int("id").autoincrement().primaryKey(),
  folderKey: varchar("folderKey", { length: 32 }).notNull().unique(), // 'entregues' | 'arquivo' | 'rgcnh'
  name: varchar("name", { length: 128 }).notNull(),
  icon: varchar("icon", { length: 64 }).default("📁"),
  color: varchar("color", { length: 32 }).default("#8b5cf6"),
  tabOrder: int("tabOrder").notNull().default(0),
  hidden: int("hidden").notNull().default(0),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type FolderConfig = typeof folderConfig.$inferSelect;
export type InsertFolderConfig = typeof folderConfig.$inferInsert;

// ─── Tiers de Garantia por Opção de Produto ─────────────────────────────────
// Cada opção pode ter múltiplos tiers de garantia com preços diferentes.
// Ex: "Nome Aleatório" pode ter: 25 corridas → R$400,00 | 100 corridas → R$600,00
// warrantyType: 'corridas' | 'dias' | 'semanas' | 'meses' | 'anos' | 'livre'
// warrantyValue: número inteiro (ex: 25, 100, 7)
// warrantyLabel: texto livre opcional para tipos personalizados (ex: "ou o que chegar primeiro")
export const warrantyTiers = mysqlTable("warrantyTiers", {
  id: int("id").autoincrement().primaryKey(),
  optionId: int("optionId").notNull(), // FK para productOptions.id
  warrantyType: varchar("warrantyType", { length: 32 }).notNull().default("corridas"), // corridas | dias | semanas | meses | anos | livre
  warrantyValue: int("warrantyValue").notNull().default(0), // quantidade (ex: 25, 100)
  warrantyLabel: varchar("warrantyLabel", { length: 128 }).default(""), // texto extra opcional
  price: varchar("price", { length: 64 }).notNull(), // preço para este tier (ex: "R$ 400,00")
  originalPrice: varchar("originalPrice", { length: 64 }).default(""), // preço original riscado
  sortOrder: int("sortOrder").notNull().default(0),
  isActive: int("isActive").notNull().default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type WarrantyTier = typeof warrantyTiers.$inferSelect;
export type InsertWarrantyTier = typeof warrantyTiers.$inferInsert;

// Marcação "Em atendimento": indica qual admin está mexendo num pedido específico
export const orderAttention = mysqlTable("orderAttention", {
  id: int("id").autoincrement().primaryKey(),
  registrationId: int("registrationId").notNull(),
  adminName: varchar("adminName", { length: 128 }).notNull().default("Admin"),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt").notNull(), // auto-expira após X minutos
});
export type OrderAttention = typeof orderAttention.$inferSelect;
export type InsertOrderAttention = typeof orderAttention.$inferInsert;

// Botões da página inicial (customizáveis pelo admin)
export const homePageButtons = mysqlTable("homePageButtons", {
  id: int("id").autoincrement().primaryKey(),
  buttonNumber: int("buttonNumber").notNull(), // 1 ou 2
  mainText: varchar("mainText", { length: 256 }).notNull(), // "FAÇA SEU PEDIDO"
  subText: varchar("subText", { length: 512 }).notNull(), // "Falta pouco! Finalize seu cadastro..."
  buttonBgColor: varchar("buttonBgColor", { length: 32 }).notNull().default("#800000"), // Cor do fundo
  mainTextColor: varchar("mainTextColor", { length: 32 }).notNull().default("#ffffff"), // Cor do texto principal
  subTextColor: varchar("subTextColor", { length: 32 }).notNull().default("#ffffff"), // Cor do subtexto
  fontFamily: varchar("fontFamily", { length: 128 }).notNull().default("Rajdhani"), // Fonte
  hoverEffect: varchar("hoverEffect", { length: 64 }).notNull().default("zoom"), // zoom, scale, brightness, etc
  icon: varchar("icon", { length: 64 }).notNull().default("clipboard"), // ícone do botão
  linkUrl: varchar("linkUrl", { length: 512 }).notNull().default(""), // destino: /rota interna, https://... ou wa.me
  isActive: int("isActive").notNull().default(1), // 1 = ativo, 0 = inativo
  sortOrder: int("sortOrder").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type HomePageButton = typeof homePageButtons.$inferSelect;
export type InsertHomePageButton = typeof homePageButtons.$inferInsert;

// Documentos do cliente (enviados pelo admin)
export const customerDocuments = mysqlTable("customerDocuments", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId").notNull(),
  label: varchar("label", { length: 256 }).notNull(), // Descrição do documento (ex: "RG", "CNH", "Comprovante de Residência")
  fileUrl: text("fileUrl").notNull(), // URL do arquivo no S3
  fileKey: varchar("fileKey", { length: 512 }).notNull(), // Chave do arquivo no S3
  mimeType: varchar("mimeType", { length: 64 }).notNull(), // Tipo MIME (image/jpeg, application/pdf, etc)
  fileName: varchar("fileName", { length: 256 }), // Nome do arquivo original com extensão (ex: "rg_2026.psd")
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CustomerDocument = typeof customerDocuments.$inferSelect;
export type InsertCustomerDocument = typeof customerDocuments.$inferInsert;

// Etapas Internas do Fluxo de Atendimento (configuráveis pelo admin)
export const internalStages = mysqlTable("internalStages", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  icon: varchar("icon", { length: 64 }).notNull().default("📋"),
  color: varchar("color", { length: 32 }).notNull().default("#6366f1"),
  sortOrder: int("sortOrder").notNull().default(0),
  isActive: int("isActive").notNull().default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type InternalStage = typeof internalStages.$inferSelect;
export type InsertInternalStage = typeof internalStages.$inferInsert;

// Etapa atual de cada pedido (apenas a mais recente conta)
export const orderStageHistory = mysqlTable("orderStageHistory", {
  id: int("id").autoincrement().primaryKey(),
  registrationId: int("registrationId").notNull(),
  stageId: int("stageId").notNull(),
  setAt: timestamp("setAt").defaultNow().notNull(),
});
export type OrderStageHistory = typeof orderStageHistory.$inferSelect;
export type InsertOrderStageHistory = typeof orderStageHistory.$inferInsert;

// Botões extras da tela inicial do cliente (antes do login) — gerenciáveis pelo admin
export const homeButtons = mysqlTable("homeButtons", {
  id: int("id").autoincrement().primaryKey(),
  text: varchar("text", { length: 128 }).notNull().default("NOVO BOTÃO"),
  subtitle: varchar("subtitle", { length: 256 }).notNull().default(""),
  url: varchar("url", { length: 512 }).notNull().default("/sorteio"), // rota interna (/...) ou link externo (https://, wa.me)
  waMsg: text("waMsg"), // mensagem opcional para links wa.me
  icon: varchar("icon", { length: 32 }).notNull().default("gift"),
  color: varchar("color", { length: 32 }).notNull().default("#7c3aed"),
  textColor: varchar("textColor", { length: 32 }).notNull().default("#ffffff"),
  subColor: varchar("subColor", { length: 32 }).notNull().default("rgba(255,255,255,0.7)"),
  font: varchar("font", { length: 64 }).notNull().default(""),
  hover: varchar("hover", { length: 16 }).notNull().default("scale"),
  linkType: varchar("linkType", { length: 32 }).notNull().default("custom"), // whatsapp, group, site, internal, telegram, instagram, facebook, youtube, pdf, custom
  openInNewTab: int("openInNewTab").notNull().default(0), // 1 = abrir em nova aba
  vipOnly: int("vipOnly").notNull().default(0), // 1 = exibir somente para VIP
  isActive: int("isActive").notNull().default(1),
  sortOrder: int("sortOrder").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type HomeButton = typeof homeButtons.$inferSelect;
export type InsertHomeButton = typeof homeButtons.$inferInsert;


// Tabela de codigos de bypass do ADM (para liberar cadastro sem indicador)
export const referrerBypassCodes = mysqlTable("referrerBypassCodes", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 64 }).notNull().unique(),
  status: mysqlEnum("status", ["active", "used", "disabled"]).notNull().default("active"),
  createdBy: int("createdBy").notNull(), // ID do admin que criou
  usedBy: varchar("usedBy", { length: 32 }), // Telefone de quem usou
  usedAt: timestamp("usedAt"),
  expiresAt: timestamp("expiresAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ReferrerBypassCode = typeof referrerBypassCodes.$inferSelect;
export type InsertReferrerBypassCode = typeof referrerBypassCodes.$inferInsert;


// Tabela de estatísticas de indicações (cache para performance)
export const referralStats = mysqlTable("referralStats", {
  id: int("id").autoincrement().primaryKey(),
  referrerPhone: varchar("referrerPhone", { length: 32 }).notNull().unique(),
  referrerName: varchar("referrerName", { length: 128 }),
  totalReferred: int("totalReferred").notNull().default(0), // Total de clientes indicados
  lastReferralAt: timestamp("lastReferralAt"), // Data do último cliente indicado
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ReferralStats = typeof referralStats.$inferSelect;
export type InsertReferralStats = typeof referralStats.$inferInsert;

// Tabela de histórico de indicações (para auditoria e rastreamento)
export const referralHistory = mysqlTable("referralHistory", {
  id: int("id").autoincrement().primaryKey(),
  referrerPhone: varchar("referrerPhone", { length: 32 }).notNull(),
  referrerName: varchar("referrerName", { length: 128 }),
  referredCustomerId: int("referredCustomerId").notNull(),
  referredPhone: varchar("referredPhone", { length: 32 }).notNull(),
  referredName: varchar("referredName", { length: 128 }),
  orderId: int("orderId"), // ID do pedido que gerou a indicação
  commissionValue: int("commissionValue").notNull().default(0), // valor da comissão em centavos no momento do pedido
  commissionPaid: int("commissionPaid").notNull().default(0), // 1 = comissão paga ao indicador
  serviceName: varchar("serviceName", { length: 256 }), // nome do serviço/produto
  serviceOption: varchar("serviceOption", { length: 256 }), // opção do serviço
  status: mysqlEnum("status", ["pending", "completed", "cancelled"]).notNull().default("pending"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ReferralHistory = typeof referralHistory.$inferSelect;
export type InsertReferralHistory = typeof referralHistory.$inferInsert;

// Tabela de denúncias de indicados
export const referralReports = mysqlTable("referralReports", {
  id: int("id").autoincrement().primaryKey(),
  reporterPhone: varchar("reporterPhone", { length: 32 }).notNull(), // Telefone de quem denunciou
  reportedCustomerId: int("reportedCustomerId").notNull(), // ID do cliente denunciado
  reportedPhone: varchar("reportedPhone", { length: 32 }).notNull(), // Telefone do cliente denunciado
  reportedName: varchar("reportedName", { length: 128 }), // Nome do cliente denunciado
  reason: text("reason").notNull(), // Motivo da denúncia
  status: mysqlEnum("status", ["pending", "reviewed", "resolved"]).notNull().default("pending"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ReferralReport = typeof referralReports.$inferSelect;
export type InsertReferralReport = typeof referralReports.$inferInsert;


// ===== TABELAS DE AUTENTICAÇÃO PARA PLANILHA DE MOTORISTA =====

// Tabela de clientes com acesso à planilha
export const spreadsheetClients = mysqlTable("spreadsheetClients", {
  id: int("id").autoincrement().primaryKey(),
  phone: varchar("phone", { length: 32 }).notNull().unique(),
  name: varchar("name", { length: 128 }).notNull(),
  cpf: varchar("cpf", { length: 14 }),
  status: mysqlEnum("status", ["active", "blocked"]).notNull().default("active"),
  preservedExpiresAt: timestamp("preservedExpiresAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SpreadsheetClient = typeof spreadsheetClients.$inferSelect;
export type InsertSpreadsheetClient = typeof spreadsheetClients.$inferInsert;

// Tabela de senhas geradas pelo admin
export const spreadsheetPasswords = mysqlTable("spreadsheetPasswords", {
  id: int("id").autoincrement().primaryKey(),
  clientId: int("clientId").notNull().references(() => spreadsheetClients.id, { onDelete: "cascade" }),
  password: varchar("password", { length: 255 }).notNull(),
  isActive: int("isActive").notNull().default(1),
  expiresAt: timestamp("expiresAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  createdBy: int("createdBy"), // ID do admin que criou
  pendingApproval: int("pendingApproval").notNull().default(0), // 1 = cliente criou senha, aguardando admin definir validade
  createdByClient: int("createdByClient").notNull().default(0), // 1 = senha criada pelo próprio cliente
  clientCreatedAt: timestamp("clientCreatedAt"), // quando o cliente criou a senha
  passwordLocked: int("passwordLocked").notNull().default(0), // 1 = senha bloqueada para alteração (já foi usada pelo cliente no primeiro acesso)
});

export type SpreadsheetPassword = typeof spreadsheetPasswords.$inferSelect;
export type InsertSpreadsheetPassword = typeof spreadsheetPasswords.$inferInsert;

// Tabela de sessões de login
export const spreadsheetSessions = mysqlTable("spreadsheetSessions", {
  id: int("id").autoincrement().primaryKey(),
  clientId: int("clientId").notNull().references(() => spreadsheetClients.id, { onDelete: "cascade" }),
  token: varchar("token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  accessCount: int("accessCount").notNull().default(1),
  lastAccessAt: timestamp("lastAccessAt"),
});

export type SpreadsheetSession = typeof spreadsheetSessions.$inferSelect;
export type InsertSpreadsheetSession = typeof spreadsheetSessions.$inferInsert;

// Tabela de auditoria de login
export const spreadsheetLoginAudit = mysqlTable("spreadsheetLoginAudit", {
  id: int("id").autoincrement().primaryKey(),
  clientId: int("clientId").references(() => spreadsheetClients.id, { onDelete: "cascade" }),
  phone: varchar("phone", { length: 32 }),
  status: mysqlEnum("status", ["success", "failed", "blocked"]).notNull(),
  ipAddress: varchar("ipAddress", { length: 45 }),
  userAgent: text("userAgent"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SpreadsheetLoginAudit = typeof spreadsheetLoginAudit.$inferSelect;
export type InsertSpreadsheetLoginAudit = typeof spreadsheetLoginAudit.$inferInsert;

// ===== GRUPOS CUSTOMIZADOS DE PEDIDOS =====
// Grupos criados pelo admin (tipo "EMERGÊNCIA", "PRIORIDADE", etc.)
export const orderCustomGroups = mysqlTable("orderCustomGroups", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  color: varchar("color", { length: 32 }).notNull().default("red"), // ex: "red", "orange", "blue", "purple", "green"
  icon: varchar("icon", { length: 10 }).default("🔖"),
  position: int("position").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type OrderCustomGroup = typeof orderCustomGroups.$inferSelect;
export type InsertOrderCustomGroup = typeof orderCustomGroups.$inferInsert;

// Membros de cada grupo (pedidos associados)
export const orderCustomGroupMembers = mysqlTable("orderCustomGroupMembers", {
  id: int("id").autoincrement().primaryKey(),
  groupId: int("groupId").notNull().references(() => orderCustomGroups.id, { onDelete: "cascade" }),
  registrationId: int("registrationId").notNull(),
  addedAt: timestamp("addedAt").defaultNow().notNull(),
});
export type OrderCustomGroupMember = typeof orderCustomGroupMembers.$inferSelect;
export type InsertOrderCustomGroupMember = typeof orderCustomGroupMembers.$inferInsert;

// ===== CARDS DE DESTAQUE (Feature Cards) =====
// Cards personalizáveis que aparecem na página inicial
export const featureCards = mysqlTable("featureCards", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  logoUrl: text("logoUrl"),
  buttonText: varchar("buttonText", { length: 100 }).notNull().default("ACESSAR"),
  buttonLink: text("buttonLink"),
  bgColor: varchar("bgColor", { length: 32 }).notNull().default("#6d28d9"),
  buttonColor: varchar("buttonColor", { length: 32 }).notNull().default("#7c3aed"),
  titleColor: varchar("titleColor", { length: 32 }).notNull().default("#ffffff"),
  descColor: varchar("descColor", { length: 32 }).notNull().default("#e9d5ff"),
  isActive: int("isActive").notNull().default(1),
  sortOrder: int("sortOrder").notNull().default(0),
  openInNewTab: int("openInNewTab").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type FeatureCard = typeof featureCards.$inferSelect;
export type InsertFeatureCard = typeof featureCards.$inferInsert;

// ===== ADMIN MEDIA FILES =====
// Metadados de arquivos de mídia enviados pelo admin (vídeos e fotos)
// O arquivo em si fica no storage S3; aqui apenas metadados e URL permanente
export const adminMediaFiles = mysqlTable("adminMediaFiles", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 512 }).notNull(),
  fileKey: varchar("fileKey", { length: 512 }).notNull(),
  url: text("url").notNull(),
  videoSlug: varchar("videoSlug", { length: 128 }).unique(), // ex: "meu-video" → /video/meu-video
  mimeType: varchar("mimeType", { length: 64 }).notNull(),
  fileSize: bigint("fileSize", { mode: "number" }).notNull().default(0),
  uploadedAt: timestamp("uploadedAt").defaultNow().notNull(),
});
export type AdminMediaFile = typeof adminMediaFiles.$inferSelect;
export type InsertAdminMediaFile = typeof adminMediaFiles.$inferInsert;

// ===== SISTEMA DE PROPAGANDA OBRIGATÓRIA =====
// Campanhas cadastradas pelo admin para exibição na Planilha de Gastos
export const adCampaigns = mysqlTable("adCampaigns", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 256 }).notNull(), // Nome interno da campanha
  isActive: int("isActive").notNull().default(1), // 1 = ativa, 0 = inativa
  type: mysqlEnum("type", ["image", "video"]).notNull().default("image"), // Tipo: banner ou vídeo
  // Conteúdo
  imageUrl: text("imageUrl"), // URL da imagem (para type=image)
  videoUrl: text("videoUrl"), // URL do vídeo (para type=video)
  title: varchar("title", { length: 256 }), // Título opcional
  description: text("description"), // Descrição opcional
  // Redirecionamento
  linkUrl: text("linkUrl"), // Link de destino (opcional)
  linkText: varchar("linkText", { length: 128 }).default("Saiba Mais"), // Texto do botão de ação
  linkTarget: mysqlEnum("linkTarget", ["_self", "_blank"]).notNull().default("_blank"),
  // Controle de tempo
  requiredSeconds: int("requiredSeconds").notNull().default(20), // Tempo obrigatório em segundos
  // Controle de frequência
  frequency: mysqlEnum("frequency", ["once", "every_access", "every_reload", "custom"]).notNull().default("every_access"),
  frequencyMinutes: int("frequencyMinutes"), // Para frequência personalizada (em minutos)
  // Período de vigência
  startsAt: timestamp("startsAt"), // Data de início (null = imediato)
  endsAt: timestamp("endsAt"), // Data de término (null = sem fim)
  // Páginas de destino (CSV: 'gastos', 'acompanhar', 'pedidos' ou 'todas')
  targetPages: varchar("targetPages", { length: 256 }).default("gastos"),
  // Áudio do vídeo
  enableAudio: int("enableAudio").notNull().default(0), // 1 = habilitar áudio no vídeo, 0 = silenciado
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type AdCampaign = typeof adCampaigns.$inferSelect;
export type InsertAdCampaign = typeof adCampaigns.$inferInsert;

// Registro de exibições por cliente (para controle de frequência)
export const adImpressions = mysqlTable("adImpressions", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId").notNull().references(() => adCampaigns.id, { onDelete: "cascade" }),
  clientId: int("clientId").notNull().references(() => spreadsheetClients.id, { onDelete: "cascade" }),
  shownAt: timestamp("shownAt").defaultNow().notNull(),
});
export type AdImpression = typeof adImpressions.$inferSelect;
export type InsertAdImpression = typeof adImpressions.$inferInsert;

// ============================================================
// SISTEMA DE SENHA DO CADASTRO (mesma lógica do Gestor de Gastos)
// ============================================================

// Senhas dos clientes do cadastro (walkajuda.com/admin/customers)
export const customerPasswords = mysqlTable("customerPasswords", {
  id: int("id").autoincrement().primaryKey(),
  phone: varchar("phone", { length: 32 }).notNull(), // telefone do cliente (chave de ligação com customers)
  password: varchar("password", { length: 255 }).notNull(), // hash bcrypt
  isActive: int("isActive").notNull().default(1), // 1 = ativa
  expiresAt: timestamp("expiresAt"), // null = pendente (aguardando ADM definir validade)
  pendingApproval: int("pendingApproval").notNull().default(0), // 1 = cliente criou, aguarda ADM liberar
  createdByClient: int("createdByClient").notNull().default(0), // 1 = criada pelo próprio cliente
  clientCreatedAt: timestamp("clientCreatedAt"), // quando o cliente criou
  preservedExpiresAt: timestamp("preservedExpiresAt"), // vencimento preservado após reset
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type CustomerPassword = typeof customerPasswords.$inferSelect;
export type InsertCustomerPassword = typeof customerPasswords.$inferInsert;

// Sessões de login do sistema de senha do cadastro
export const customerPasswordSessions = mysqlTable("customerPasswordSessions", {
  id: int("id").autoincrement().primaryKey(),
  phone: varchar("phone", { length: 32 }).notNull(),
  token: varchar("token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  lastAccessAt: timestamp("lastAccessAt"),
});
export type CustomerPasswordSession = typeof customerPasswordSessions.$inferSelect;
export type InsertCustomerPasswordSession = typeof customerPasswordSessions.$inferInsert;

// Histórico de logins do cliente (registra cada login)
export const customerLoginHistory = mysqlTable("customerLoginHistory", {
  id: int("id").autoincrement().primaryKey(),
  phone: varchar("phone", { length: 32 }).notNull(),
  loginAt: timestamp("loginAt").defaultNow().notNull(),
  ipAddress: varchar("ipAddress", { length: 64 }),
  userAgent: varchar("userAgent", { length: 512 }),
});
export type CustomerLoginHistory = typeof customerLoginHistory.$inferSelect;
export type InsertCustomerLoginHistory = typeof customerLoginHistory.$inferInsert;


// ========== CHAT NA PLANILHA DE GASTOS ==========

// Tabela de conversas (individual ou grupo)
export const spreadsheetChats = mysqlTable("spreadsheetChats", {
  id: int("id").autoincrement().primaryKey(),
  phone: varchar("phone", { length: 32 }).notNull(), // telefone do criador/participante principal
  participantPhones: text("participantPhones").notNull(), // JSON array de telefones dos participantes
  isGroup: int("isGroup").notNull().default(0), // 1 = grupo, 0 = individual
  groupName: varchar("groupName", { length: 255 }), // nome do grupo (null para individual)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SpreadsheetChat = typeof spreadsheetChats.$inferSelect;
export type InsertSpreadsheetChat = typeof spreadsheetChats.$inferInsert;

// Tabela de mensagens do chat
export const chatMessages = mysqlTable("chatMessages", {
  id: int("id").autoincrement().primaryKey(),
  chatId: int("chatId").notNull(),
  senderPhone: varchar("senderPhone", { length: 32 }).notNull(),
  message: text("message").notNull(),
  readByPhones: text("readByPhones").notNull().default("[]"), // JSON array de telefones que leram
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = typeof chatMessages.$inferInsert;

// Tabela de status online dos usuários
export const spreadsheetOnlineStatus = mysqlTable("spreadsheetOnlineStatus", {
  id: int("id").autoincrement().primaryKey(),
  phone: varchar("phone", { length: 32 }).notNull().unique(),
  isOnline: int("isOnline").notNull().default(0), // 1 = online, 0 = offline
  lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SpreadsheetOnlineStatus = typeof spreadsheetOnlineStatus.$inferSelect;
export type InsertSpreadsheetOnlineStatus = typeof spreadsheetOnlineStatus.$inferInsert;

// Tabela de notificações de chat não lidas
export const chatNotifications = mysqlTable("chatNotifications", {
  id: int("id").autoincrement().primaryKey(),
  phone: varchar("phone", { length: 32 }).notNull(),
  chatId: int("chatId").notNull(),
  unreadCount: int("unreadCount").notNull().default(1),
  lastMessagePreview: text("lastMessagePreview"),
  lastMessageSenderPhone: varchar("lastMessageSenderPhone", { length: 32 }),
  emailSent: int("emailSent").notNull().default(0), // 1 = email de notificação já enviado
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ChatNotification = typeof chatNotifications.$inferSelect;
export type InsertChatNotification = typeof chatNotifications.$inferInsert;

// ─── Serviços Extras / Consultas ────────────────────────────────────────────
// Formulários criados pelo ADM (consulta com campos ou link direto)
export const consultaForms = mysqlTable("consultaForms", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 128 }).notNull(), // ex: "Consulta de Veículo"
  icon: varchar("icon", { length: 64 }).default("Search"), // nome do ícone Lucide
  type: mysqlEnum("type", ["consultation", "link"]).notNull().default("consultation"),
  redirectUrl: varchar("redirectUrl", { length: 512 }).default(""), // só para type=link
  fields: text("fields").default("[]"), // JSON rows: [{id, cols, fields:[{id,key,label,type,required,placeholder,mask,options,isActive}]}]
  originalFields: text("originalFields").default("[]"), // snapshot original para restaurar
  isActive: int("isActive").notNull().default(1),
  isBuiltin: int("isBuiltin").notNull().default(0), // 1 = formulário fixo (não pode excluir)
  sortOrder: int("sortOrder").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ConsultaForm = typeof consultaForms.$inferSelect;
export type InsertConsultaForm = typeof consultaForms.$inferInsert;

// Solicitações enviadas pelos clientes
export const consultaRequests = mysqlTable("consultaRequests", {
  id: int("id").autoincrement().primaryKey(),
  formId: int("formId").notNull(), // FK para consultaForms.id
  formTitle: varchar("formTitle", { length: 128 }).notNull(), // snapshot do título
  customerPhone: varchar("customerPhone", { length: 32 }).notNull(),
  customerName: varchar("customerName", { length: 128 }).default(""),
  customerEmail: varchar("customerEmail", { length: 256 }).default(""),
  customerPhoto: varchar("customerPhoto", { length: 512 }).default(""), // URL da foto
  data: text("data").notNull().default("{}"), // JSON com os dados preenchidos
  status: mysqlEnum("status", ["pending", "answered"]).notNull().default("pending"),
  adminResponse: text("adminResponse").default(""),
  responseFileUrl: varchar("responseFileUrl", { length: 1024 }).default(""),
  responseFileName: varchar("responseFileName", { length: 256 }).default(""),
  respondedAt: timestamp("respondedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ConsultaRequest = typeof consultaRequests.$inferSelect;
export type InsertConsultaRequest = typeof consultaRequests.$inferInsert;

// ─── MÓDULO DE EMPRÉSTIMOS ────────────────────────────────────────────────────

// Perfis de empréstimo
export const loanProfiles = mysqlTable("loanProfiles", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 50 }).notNull(),
  slug: varchar("slug", { length: 30 }).notNull().unique(),
  creditLimit: decimal("creditLimit", { precision: 10, scale: 2 }).notNull().default("500.00"),
  interestRate: decimal("interestRate", { precision: 5, scale: 2 }).notNull().default("5.00"),
  maxDays: int("maxDays").notNull().default(30),
  maxDaysSemanal: int("maxDaysSemanal").notNull().default(60),
  maxDaysQuinzenal: int("maxDaysQuinzenal").notNull().default(60),
  maxDaysMensal: int("maxDaysMensal").notNull().default(90),
  isActive: int("isActive").notNull().default(1),
  sortOrder: int("sortOrder").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type LoanProfile = typeof loanProfiles.$inferSelect;
export type InsertLoanProfile = typeof loanProfiles.$inferInsert;

// Clientes de empréstimo
export const loanClients = mysqlTable("loanClients", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 150 }).notNull(),
  cpf: varchar("cpf", { length: 14 }),
  phone: varchar("phone", { length: 20 }),
  status: mysqlEnum("status", ["ativo", "bloqueado", "inadimplente"]).notNull().default("ativo"),
  profileSlug: varchar("profileSlug", { length: 30 }).notNull().default("bronze"),
  creditLimit: decimal("creditLimit", { precision: 10, scale: 2 }).notNull().default("500.00"),
  interestRate: decimal("interestRate", { precision: 5, scale: 2 }).notNull().default("5.00"),
  maxDays: int("maxDays").notNull().default(30),
  maxDaysSemanal: int("maxDaysSemanal").notNull().default(60),
  maxDaysQuinzenal: int("maxDaysQuinzenal").notNull().default(60),
  maxDaysMensal: int("maxDaysMensal").notNull().default(90),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type LoanClient = typeof loanClients.$inferSelect;
export type InsertLoanClient = typeof loanClients.$inferInsert;

// Empréstimos
export const loans = mysqlTable("loans", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  clientId: int("clientId").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  interestRate: decimal("interestRate", { precision: 5, scale: 2 }).notNull(),
  days: int("days").notNull(),
  interestAmount: decimal("interestAmount", { precision: 10, scale: 2 }).notNull(),
  totalAmount: decimal("totalAmount", { precision: 10, scale: 2 }).notNull(),
  releaseDate: varchar("releaseDate", { length: 10 }).notNull(),
  dueDate: varchar("dueDate", { length: 10 }).notNull(),
  status: mysqlEnum("status", ["aguardando_pagamento", "em_analise", "pago", "cancelado"]).notNull().default("aguardando_pagamento"),
  paidAt: timestamp("paidAt"),
  paidBy: varchar("paidBy", { length: 100 }),
  refusedReason: text("refusedReason"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Loan = typeof loans.$inferSelect;
export type InsertLoan = typeof loans.$inferInsert;

// Mensagens rápidas para WhatsApp
export const whatsappTemplates = mysqlTable("whatsappTemplates", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 200 }).notNull(),
  statusKey: varchar("statusKey", { length: 100 }),
  message: text("message").notNull(),
  imageUrl: text("imageUrl"),
  imageTitle: varchar("imageTitle", { length: 200 }),
  videoUrl: text("videoUrl"),
  videoTitle: varchar("videoTitle", { length: 200 }),
  mediaFileKey: varchar("mediaFileKey", { length: 500 }),
  mediaFileUrl: text("mediaFileUrl"),
  mediaType: mysqlEnum("mediaType", ["image", "video"]),
  sortOrder: int("sortOrder").notNull().default(0),
  isDefault: int("isDefault").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type WhatsappTemplate = typeof whatsappTemplates.$inferSelect;
export type InsertWhatsappTemplate = typeof whatsappTemplates.$inferInsert;
