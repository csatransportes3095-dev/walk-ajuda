import { eq, asc, desc, sql, and, gte, inArray, gt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { isValidCPF, normalizeCpf } from "@shared/cpf";

import {
  InsertUser, users,
  accessCodes, AccessCode,
  coupons, Coupon,
  products, Product,
  productOptions, ProductOption,
  productQuestions, ProductQuestion,
  questionAudioDrafts, QuestionAudioDraft,
  orderQuestionAudioAnswers, OrderQuestionAudioAnswer,
  optionDocuments, OptionDocument,
  siteSettings, SiteSetting,
  accessCodePhones, AccessCodePhone,
  customers, Customer,
  raffles, Raffle,
  raffleEntries, RaffleEntry,
  adminCredentials,
  orderStatusHistory, OrderStatusHistory,
  orderFiles, OrderFile, InsertOrderFile,
  infoBanners, InfoBanner, InsertInfoBanner,
  orderCounter,
  orderNotes, OrderNote,
  docRequests, DocRequest, InsertDocRequest,
  blocklist, Blocklist, InsertBlocklist,
  systemConfig,
  ipBlocklist, IpBlocklist,
  ipAccessLog, IpAccessLog,
  vpnAttempts, VpnAttempt,
  broadcasts, Broadcast, InsertBroadcast,
  blockedAccessAttempts, BlockedAccessAttempt,
  pixAccounts, PixAccount,
  financialSales, FinancialSale, InsertFinancialSale,
  referralLinks, ReferralLink, InsertReferralLink,
  referralUsages, ReferralUsage, InsertReferralUsage,
  referralStats, ReferralStats, InsertReferralStats,
  referralHistory, ReferralHistory, InsertReferralHistory,
  referralCommissionAttributions, ReferralCommissionAttribution, InsertReferralCommissionAttribution,
  referralReports, ReferralReport, InsertReferralReport,
  trackingQuestions, TrackingQuestion,
  trackingAnswers, TrackingAnswer,
  trackingQuestionAssignments, TrackingQuestionAssignment,
  protectedPhotos, ProtectedPhoto,
  photoAccessLogs, PhotoAccessLog,
  orderProgressConfig, OrderProgressConfig,
  adminLoginAttempts, AdminLoginAttempt,
  faqConfig, FaqConfig,
  faqItems, FaqItem,
  scheduleSlots, ScheduleSlot,
  scheduleAppointments, ScheduleAppointment,
  scheduleConfig, ScheduleConfig,
  scheduleTemplates, ScheduleTemplate, InsertScheduleTemplate,
  orderAttention,
  warrantyTiers, WarrantyTier,
  customerDocuments, CustomerDocument, InsertCustomerDocument,
  referrerBypassCodes, ReferrerBypassCode, InsertReferrerBypassCode,
  internalStages, InternalStage,
  orderStageHistory, OrderStageHistory,
  homeButtons, HomeButton,
  spreadsheetEarnings, SpreadsheetEarning, InsertSpreadsheetEarning,
  spreadsheetExpenses, SpreadsheetExpense, InsertSpreadsheetExpense,
  spreadsheetOperational, SpreadsheetOperational, InsertSpreadsheetOperational,
  spreadsheetGoals, SpreadsheetGoal, InsertSpreadsheetGoal,
  broadcastQueue, BroadcastQueue,
  emailAccounts, EmailAccount, InsertEmailAccount,
  zohoOAuthConfigs, ZohoOAuthConfig, InsertZohoOAuthConfig,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      // Adicionar charset=utf8mb4 na URL para garantir encoding correto
      let dbUrl = process.env.DATABASE_URL!;
      try {
        const u = new URL(dbUrl);
        if (!u.searchParams.has('charset')) {
          u.searchParams.set('charset', 'utf8mb4');
          dbUrl = u.toString();
        }
      } catch { /* URL inválida, usar como está */ }
      _db = drizzle(dbUrl);
      console.log('[Database] Pool criado com charset utf8mb4 na URL');
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ========== USERS ==========

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }
  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
    if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
    else if (user.openId === ENV.ownerOpenId) { values.role = 'admin'; updateSet.role = 'admin'; }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) { console.error("[Database] Failed to upsert user:", error); throw error; }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ========== ACCESS CODES (SENHAS VIP) ==========

export async function validateAccessCode(code: string, phone?: string): Promise<{ valid: boolean; type: string; clientName?: string | null; expiresAt?: Date | null; allowedProductIds?: number[] | null }> {
  const generalPassword = ENV.siteGeneralPassword;
  const db = await getDb();
  if (!db) return { valid: false, type: 'none' };

  // Verificar se o modo manual está ativo
  const modeRows = await db.execute(sql`SELECT value FROM appSettings WHERE \`key\` = 'senha_cadastro_ativa' LIMIT 1`);
  const modeVal = (modeRows[0] as unknown as Array<{ value: string }>)[0]?.value ?? 'true';
  const isManualMode = modeVal === 'true';

  // Quando modo manual está ativo, bloquear senha geral e senha fixa
  // Apenas cpToken (novo sistema) é aceito
  if (!isManualMode && code === generalPassword) return { valid: true, type: 'general' };
  if (isManualMode && code === generalPassword) return { valid: false, type: 'none' };

  // Verificar senha fixa individual do cliente (só aceita se modo manual NÃO estiver ativo)
  if (phone && !isManualMode) {
    const phoneDigits = phone.replace(/\D/g, '');
    const custRows = await db.execute(sql`SELECT fixedPassword, fixedPasswordActive, name FROM customers WHERE phone = ${phoneDigits} LIMIT 1`);
    const cust = (custRows[0] as unknown as Array<{ fixedPassword: string | null; fixedPasswordActive: number; name: string | null }>)[0];
    if (cust?.fixedPasswordActive === 1 && cust?.fixedPassword && code === cust.fixedPassword) {
      return { valid: true, type: 'fixed', clientName: cust.name };
    }
  }
  const results = await db.select().from(accessCodes).where(eq(accessCodes.code, code)).limit(1);
  if (results.length === 0) return { valid: false, type: 'none' };
  const ac = results[0];
  if (ac.status === 'disabled') return { valid: false, type: 'none' };
  if (ac.expiresAt && new Date() > ac.expiresAt) return { valid: false, type: 'none' };
  const isTimeOnly = ac.timeOnly === 1;
  // Verificar se a senha ainda aceita usos
  if (phone) {
    const maxUses = ac.maxUses || 1;
    const currentUses = ac.currentUses || 0;
    if (isTimeOnly) {
      // timeOnly: permitir acesso enquanto não expirou - registrar telefone se novo
      const existingAccess = await db.select().from(accessCodePhones)
        .where(sql`${accessCodePhones.codeId} = ${ac.id} AND ${accessCodePhones.phone} = ${phone}`)
        .limit(1);
      if (existingAccess.length === 0) {
        await db.insert(accessCodePhones).values({ codeId: ac.id, phone, consumed: 0 });
        await db.update(accessCodes).set({ 
          accessedByPhone: phone, 
          currentUses: currentUses + 1,
          usedAt: new Date()
        }).where(eq(accessCodes.id, ac.id));
      }
    } else {
      // Senha normal: verificar se atingiu o limite de usos
      if (ac.status === 'used' || currentUses >= maxUses) {
        return { valid: false, type: 'none' };
      }
      // Sempre criar novo registro para cada uso (permite múltiplos pedidos do mesmo telefone)
      await db.insert(accessCodePhones).values({ codeId: ac.id, phone, consumed: 0 });
      const newUses = currentUses + 1;
      const newStatus = newUses >= maxUses ? 'used' as const : 'active' as const;
      await db.update(accessCodes).set({ 
        accessedByPhone: phone, 
        currentUses: newUses,
        status: newStatus,
        usedAt: new Date()
      }).where(eq(accessCodes.id, ac.id));
    }
  } else {
    // Sem telefone - se a senha está 'used', bloquear (exceto timeOnly)
    if (!isTimeOnly && ac.status === 'used') {
      return { valid: false, type: 'none' };
    }
  }
  const apIds = ac.allowedProductIds ? JSON.parse(ac.allowedProductIds) : null;
  return { valid: true, type: 'vip', clientName: ac.clientName, expiresAt: ac.expiresAt, allowedProductIds: apIds };
}

export async function createAccessCode(code: string, clientName?: string, maxUses: number = 1, timeOnly: boolean = false, allowedProductIds?: number[]): Promise<AccessCode> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  // Buscar duração configurada
  const durationMin = await getSetting('vip_duration_minutes');
  const minutes = parseInt(durationMin || '20', 10) || 20;
  const expiresAt = new Date(Date.now() + minutes * 60 * 1000);
  const allowedJson = allowedProductIds && allowedProductIds.length > 0 ? JSON.stringify(allowedProductIds) : null;
  await db.insert(accessCodes).values({ code, type: 'vip', status: 'active', clientName: clientName || null, maxUses, currentUses: 0, expiresAt, timeOnly: timeOnly ? 1 : 0, allowedProductIds: allowedJson });
  const result = await db.select().from(accessCodes).where(eq(accessCodes.code, code)).limit(1);
  return result[0];
}

export async function listAccessCodes(): Promise<AccessCode[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(accessCodes);
}

export async function toggleAccessCode(id: number, status: 'active' | 'disabled'): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(accessCodes).set({ status }).where(eq(accessCodes.id, id));
}

export async function deleteAccessCode(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(accessCodes).where(eq(accessCodes.id, id));
}

export async function renewAccessCode(id: number, extraMinutes?: number): Promise<AccessCode | null> {
  const db = await getDb();
  if (!db) return null;
  const durationMin = await getSetting('vip_duration_minutes');
  const minutes = extraMinutes || parseInt(durationMin || '20', 10) || 20;
  const newExpires = new Date(Date.now() + minutes * 60 * 1000);
  await db.update(accessCodes).set({ expiresAt: newExpires, status: 'active' }).where(eq(accessCodes.id, id));
  const result = await db.select().from(accessCodes).where(eq(accessCodes.id, id)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function checkAccessCodeCanSubmit(code: string, phone?: string): Promise<{ canSubmit: boolean; type: string; reason?: string }> {
  const generalPassword = ENV.siteGeneralPassword;
  const db = await getDb();
  if (!db) return { canSubmit: false, type: 'none', reason: 'Banco de dados indisponível' };

  // Verificar se o modo manual está ativo
  const modeRows = await db.execute(sql`SELECT value FROM appSettings WHERE \`key\` = 'senha_cadastro_ativa' LIMIT 1`);
  const modeVal = (modeRows[0] as unknown as Array<{ value: string }>)[0]?.value ?? 'true';
  const isManualMode = modeVal === 'true';

  // Quando modo manual está ativo, bloquear senha geral
  if (code === generalPassword) {
    if (isManualMode) return { canSubmit: false, type: 'none', reason: 'Acesso via senha geral não permitido no modo de liberação manual.' };
    return { canSubmit: true, type: 'general' };
  }
  const results = await db.select().from(accessCodes).where(eq(accessCodes.code, code)).limit(1);
  if (results.length === 0) return { canSubmit: false, type: 'none', reason: 'Senha não encontrada' };
  const ac = results[0];
  if (ac.status === 'disabled') return { canSubmit: false, type: 'vip', reason: 'Esta senha está desativada.' };
  if (ac.expiresAt && new Date() > ac.expiresAt) return { canSubmit: false, type: 'vip', reason: 'Esta senha expirou. Solicite uma nova senha.' };
  const isTimeOnly = ac.timeOnly === 1;
  // Telefone pode fazer múltiplos pedidos com a mesma senha - sem restrição
  if (!isTimeOnly && ac.status === 'used') {
    return { canSubmit: false, type: 'vip', reason: 'Esta senha VIP já atingiu o limite de usos. Solicite uma nova senha.' };
  }
  return { canSubmit: true, type: 'vip' };
}

export async function consumeAccessCode(code: string, phone?: string): Promise<void> {
  // Marca o telefone como consumed=1 na tabela accessCodePhones
  // E atualiza usedAt na tabela accessCodes
  console.log('[consumeAccessCode] Iniciando - code:', code, 'phone:', phone);
  const generalPassword = ENV.siteGeneralPassword;
  if (code === generalPassword) {
    console.log('[consumeAccessCode] Senha geral - ignorando');
    return;
  }
  const db = await getDb();
  if (!db) {
    console.log('[consumeAccessCode] DB indisponivel');
    return;
  }
  const results = await db.select().from(accessCodes).where(eq(accessCodes.code, code)).limit(1);
  if (results.length === 0) {
    console.log('[consumeAccessCode] Senha nao encontrada no DB');
    return;
  }
  const ac = results[0];
  console.log('[consumeAccessCode] Senha encontrada - id:', ac.id, 'status:', ac.status, 'timeOnly:', ac.timeOnly);
  // Se timeOnly, não marcar como used - apenas registrar usedAt
  if (ac.timeOnly === 1) {
    console.log('[consumeAccessCode] Senha timeOnly - não marcando como used');
    await db.update(accessCodes).set({ usedAt: new Date() }).where(eq(accessCodes.id, ac.id));
    return;
  }
  // Marcar o telefone como consumed=1 se phone foi fornecido
  if (phone) {
    const phoneDigitsForConsume = phone.replace(/\D/g, '');
    console.log('[consumeAccessCode] Marcando phone como consumed=1 - codeId:', ac.id, 'phone digits:', phoneDigitsForConsume);
    await db.execute(sql`
      UPDATE accessCodePhones
      SET consumed = 1
      WHERE codeId = ${ac.id}
        AND REGEXP_REPLACE(phone, '[^0-9]', '') = ${phoneDigitsForConsume}
    `);
  }
  // Verificar se todos os usos foram consumidos para marcar como 'used'
  const maxUses = ac.maxUses || 1;
  const currentUses = ac.currentUses || 0;
  if (currentUses >= maxUses) {
    console.log('[consumeAccessCode] Atingiu maxUses - marcando como used');
    await db.update(accessCodes).set({ status: 'used', usedAt: new Date() }).where(eq(accessCodes.id, ac.id));
  } else {
    await db.update(accessCodes).set({ usedAt: new Date() }).where(eq(accessCodes.id, ac.id));
  }
}

// ========== COUPONS ==========

export async function createCoupon(data: { code: string; discountType: 'percentage' | 'fixed'; discountValue: number; maxUses?: number; expiresAt?: Date | null; }): Promise<Coupon> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.insert(coupons).values({ code: data.code.toUpperCase(), discountType: data.discountType, discountValue: data.discountValue, maxUses: data.maxUses || 1, currentUses: 0, expiresAt: data.expiresAt || null, status: 'active' });
  const result = await db.select().from(coupons).where(eq(coupons.code, data.code.toUpperCase())).limit(1);
  return result[0];
}

export async function listCoupons(): Promise<Coupon[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(coupons);
}

export async function deleteCoupon(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(coupons).where(eq(coupons.id, id));
}

export async function toggleCoupon(id: number, status: 'active' | 'disabled'): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(coupons).set({ status }).where(eq(coupons.id, id));
}

export async function validateCoupon(code: string): Promise<{ valid: boolean; coupon?: Coupon; reason?: string; discountType?: 'percentage' | 'fixed'; discountValue?: number; }> {
  const db = await getDb();
  if (!db) return { valid: false, reason: 'Banco de dados indisponível' };
  const results = await db.select().from(coupons).where(eq(coupons.code, code.toUpperCase())).limit(1);
  if (results.length === 0) return { valid: false, reason: 'Cupom não encontrado' };
  const coupon = results[0];
  if (coupon.status === 'disabled') return { valid: false, reason: 'Este cupom está desativado' };
  if (coupon.status === 'used') return { valid: false, reason: 'Este cupom já foi utilizado' };
  if (coupon.expiresAt && new Date() > coupon.expiresAt) return { valid: false, reason: 'Este cupom expirou' };
  if (coupon.maxUses && coupon.currentUses && coupon.currentUses >= coupon.maxUses) return { valid: false, reason: 'Este cupom atingiu o limite de uso' };
  return { valid: true, coupon, discountType: coupon.discountType, discountValue: coupon.discountValue };
}

export async function consumeCoupon(code: string, usedBy?: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const results = await db.select().from(coupons).where(eq(coupons.code, code.toUpperCase())).limit(1);
  if (results.length === 0) return;
  const coupon = results[0];
  const newUses = (coupon.currentUses || 0) + 1;
  const newStatus = coupon.maxUses && newUses >= coupon.maxUses ? 'used' as const : 'active' as const;
  await db.update(coupons).set({ currentUses: newUses, usedAt: new Date(), usedBy: usedBy || null, status: newStatus }).where(eq(coupons.id, coupon.id));
}

// ========== PRODUCTS ==========

export async function createProduct(data: {
  name: string; description?: string; iconUrl?: string; buttonText?: string;
  requireProfilePhoto?: boolean; requireCarDocument?: boolean; requireAlvara?: boolean;
  requireCondutaxi?: boolean; requireVehicle2016?: boolean; isPdfOnly?: boolean;
  showYearField?: boolean; sortOrder?: number; cardColor?: string;
  cardBgColor?: string; cardTextColor?: string; cardBtnColor?: string;
}): Promise<Product> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.insert(products).values({
    name: data.name, description: data.description || null, iconUrl: data.iconUrl || null,
    buttonText: data.buttonText || 'COMPRAR',
    requireProfilePhoto: data.requireProfilePhoto !== false ? 1 : 0,
    requireCarDocument: data.requireCarDocument !== false ? 1 : 0,
    requireAlvara: data.requireAlvara ? 1 : 0,
    requireCondutaxi: data.requireCondutaxi ? 1 : 0,
    requireVehicle2016: data.requireVehicle2016 ? 1 : 0,
    isPdfOnly: data.isPdfOnly ? 1 : 0,
    showYearField: data.showYearField ? 1 : 0,
    cardColor: data.cardColor || null,
    cardBgColor: data.cardBgColor || null,
    cardTextColor: data.cardTextColor || null,
    cardBtnColor: data.cardBtnColor || null,
    isActive: 1, sortOrder: data.sortOrder || 0,
  });
  const result = await db.select().from(products).where(eq(products.name, data.name)).limit(1);
  return result[0];
}

export async function listProducts(): Promise<Product[]> {
  const db = await getDb();
  if (!db) return [];
  await (db as any).execute("ALTER TABLE products ADD COLUMN IF NOT EXISTS deliveryDays VARCHAR(64) NULL").catch(() => {});
  return await db.select().from(products).orderBy(asc(products.sortOrder));
}

export async function listActiveProducts(): Promise<Product[]> {
  const db = await getDb();
  if (!db) return [];
  await (db as any).execute("ALTER TABLE products ADD COLUMN IF NOT EXISTS deliveryDays VARCHAR(64) NULL").catch(() => {});
  return await db.select().from(products).where(eq(products.isActive, 1)).orderBy(asc(products.sortOrder));
}

export async function updateProduct(id: number, data: Partial<{
  name: string; description: string | null; iconUrl: string | null; buttonText: string;
  requireProfilePhoto: number; requireCarDocument: number; requireAlvara: number;
  requireCondutaxi: number; requireVehicle2016: number; isPdfOnly: number;
  showYearField: number; cardColor: string | null; cardBgColor: string | null;
  cardTextColor: string | null; cardBtnColor: string | null; isActive: number; sortOrder: number;
  deliveryDays: string | null;
}>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(products).set(data).where(eq(products.id, id));
}

export async function deleteProduct(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // Delete related options and questions first
  await db.delete(productOptions).where(eq(productOptions.productId, id));
  await db.delete(productQuestions).where(eq(productQuestions.productId, id));
  await db.delete(products).where(eq(products.id, id));
}

export async function toggleProduct(id: number, isActive: boolean): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(products).set({ isActive: isActive ? 1 : 0 }).where(eq(products.id, id));
}

// ========== PRODUCT OPTIONS ==========

export async function listProductOptions(productId: number): Promise<ProductOption[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(productOptions).where(eq(productOptions.productId, productId)).orderBy(asc(productOptions.sortOrder));
}

export async function createProductOption(data: {
  productId: number; label: string; price: string; originalPrice?: string; type?: string; sortOrder?: number;
  requireProfilePhoto?: boolean; requireCarDocument?: boolean; requireAlvara?: boolean;
  requireCondutaxi?: boolean; requireVehicle2016?: boolean; isPdfOnly?: boolean;
  showYearField?: boolean; docNameMode?: string; docCustomName?: string;
}): Promise<ProductOption> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const result = await db.insert(productOptions).values({
    productId: data.productId, label: data.label, price: data.price,
    originalPrice: data.originalPrice || '',
    type: data.type || 'standard', sortOrder: data.sortOrder || 0, isActive: 1,
    requireProfilePhoto: data.requireProfilePhoto ? 1 : 0,
    requireCarDocument: data.requireCarDocument ? 1 : 0,
    requireAlvara: data.requireAlvara ? 1 : 0,
    requireCondutaxi: data.requireCondutaxi ? 1 : 0,
    requireVehicle2016: data.requireVehicle2016 ? 1 : 0,
    isPdfOnly: data.isPdfOnly ? 1 : 0,
    showYearField: data.showYearField ? 1 : 0,
    docNameMode: data.docNameMode || 'none',
    docCustomName: data.docCustomName || '',
  });
  const inserted = await db.select().from(productOptions).where(eq(productOptions.id, Number(result[0].insertId))).limit(1);
  return inserted[0];
}

export async function updateProductOption(id: number, data: Partial<{
  label: string; price: string; originalPrice: string; type: string; sortOrder: number; isActive: number;
  requireProfilePhoto: number; requireCarDocument: number; requireAlvara: number;
  requireCondutaxi: number; requireVehicle2016: number; isPdfOnly: number;
  showYearField: number; docNameMode: string; docCustomName: string;
  warranty: string; commissionValue: number; description: string;
  promoEndsAt: number | null;
}>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(productOptions).set(data).where(eq(productOptions.id, id));
}

export async function deleteProductOption(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(productOptions).where(eq(productOptions.id, id));
}

// ========== WARRANTY TIERS ==========

export async function listWarrantyTiers(optionId: number): Promise<WarrantyTier[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(warrantyTiers).where(eq(warrantyTiers.optionId, optionId)).orderBy(asc(warrantyTiers.sortOrder));
}

export async function createWarrantyTier(data: {
  optionId: number; warrantyType: string; warrantyValue: number;
  warrantyLabel?: string; price: string; originalPrice?: string; sortOrder?: number;
}): Promise<WarrantyTier> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const result = await db.insert(warrantyTiers).values({
    optionId: data.optionId,
    warrantyType: data.warrantyType,
    warrantyValue: data.warrantyValue,
    warrantyLabel: data.warrantyLabel || '',
    price: data.price,
    originalPrice: data.originalPrice || '',
    sortOrder: data.sortOrder || 0,
    isActive: 1,
  });
  const inserted = await db.select().from(warrantyTiers).where(eq(warrantyTiers.id, Number(result[0].insertId))).limit(1);
  return inserted[0];
}

export async function updateWarrantyTier(id: number, data: Partial<{
  warrantyType: string; warrantyValue: number; warrantyLabel: string;
  price: string; originalPrice: string; sortOrder: number; isActive: number;
}>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(warrantyTiers).set(data).where(eq(warrantyTiers.id, id));
}

export async function deleteWarrantyTier(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(warrantyTiers).where(eq(warrantyTiers.id, id));
}

export async function deleteWarrantyTiersByOptionId(optionId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(warrantyTiers).where(eq(warrantyTiers.optionId, optionId));
}

// ========== PRODUCT QUESTIONS ==========

export async function listProductQuestions(productId: number): Promise<ProductQuestion[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(productQuestions).where(eq(productQuestions.productId, productId)).orderBy(asc(productQuestions.sortOrder));
}

export async function listOptionQuestions(optionId: number): Promise<ProductQuestion[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(productQuestions).where(eq(productQuestions.optionId, optionId)).orderBy(asc(productQuestions.sortOrder));
}

export type ProductQuestionFieldType = 'text' | 'select' | 'textarea' | 'audio';
export type ProductQuestionAudioSettings = {
  helpText?: string | null;
  audioMinDurationSeconds?: number;
  audioMaxDurationSeconds?: number;
  allowAudioRerecord?: number;
  allowAudioFileUpload?: number;
};

export type ProductQuestionPresentationSettings = {
  questionPresentation?: 'text' | 'audio';
  questionAudioUrl?: string | null;
  questionAudioStorageKey?: string | null;
  showQuestionTextWithAudio?: number;
};

export async function createProductQuestion(data: { productId: number; optionId?: number; question: string; fieldType?: ProductQuestionFieldType; options?: string; isRequired?: boolean; sortOrder?: number; parentQuestionId?: number | null; triggerOption?: string | null } & ProductQuestionAudioSettings & ProductQuestionPresentationSettings): Promise<ProductQuestion> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const result = await db.insert(productQuestions).values({
    productId: data.productId, optionId: data.optionId || null, question: data.question,
    fieldType: data.fieldType || 'text', options: data.options || null,
    isRequired: data.isRequired !== false ? 1 : 0, sortOrder: data.sortOrder || 0,
    helpText: data.helpText || null,
    audioMinDurationSeconds: data.audioMinDurationSeconds ?? 1,
    audioMaxDurationSeconds: data.audioMaxDurationSeconds ?? 120,
    allowAudioRerecord: data.allowAudioRerecord ?? 1,
    allowAudioFileUpload: data.allowAudioFileUpload ?? 1,
    questionPresentation: data.questionPresentation === 'audio' ? 'audio' : 'text',
    questionAudioUrl: data.questionAudioUrl || null,
    questionAudioStorageKey: data.questionAudioStorageKey || null,
    showQuestionTextWithAudio: data.showQuestionTextWithAudio ?? 0,
    parentQuestionId: data.parentQuestionId || null,
    triggerOption: data.triggerOption || null,
  });
  const inserted = await db.select().from(productQuestions).where(eq(productQuestions.id, Number(result[0].insertId))).limit(1);
  return inserted[0];
}

export async function updateProductQuestion(id: number, data: Partial<{ question: string; fieldType: ProductQuestionFieldType; options: string | null; isRequired: number; sortOrder: number; parentQuestionId: number | null; triggerOption: string | null } & ProductQuestionAudioSettings & ProductQuestionPresentationSettings>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(productQuestions).set(data).where(eq(productQuestions.id, id));
}

export async function deleteProductQuestion(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(productQuestions).where(eq(productQuestions.id, id));
}

// ========== QUESTION AUDIO ANSWERS ==========

export async function getProductQuestionById(id: number): Promise<ProductQuestion | null> {
  const db = await getDb();
  if (!db) return null;
  const [question] = await db.select().from(productQuestions).where(eq(productQuestions.id, id)).limit(1);
  return question || null;
}

export async function replaceQuestionAudioDraft(data: Omit<QuestionAudioDraft, 'createdAt'>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.delete(questionAudioDrafts).where(and(
    eq(questionAudioDrafts.flowId, data.flowId),
    eq(questionAudioDrafts.questionId, data.questionId),
  ));
  await db.insert(questionAudioDrafts).values(data);
}

export async function getQuestionAudioDraftByFlowQuestion(flowId: string, questionId: number): Promise<QuestionAudioDraft | null> {
  const db = await getDb();
  if (!db) return null;
  const [draft] = await db.select().from(questionAudioDrafts).where(and(
    eq(questionAudioDrafts.flowId, flowId),
    eq(questionAudioDrafts.questionId, questionId),
  )).limit(1);
  return draft || null;
}

export async function getQuestionAudioDraftsByIds(ids: string[]): Promise<QuestionAudioDraft[]> {
  if (ids.length === 0) return [];
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(questionAudioDrafts).where(inArray(questionAudioDrafts.id, ids));
}

export async function deleteQuestionAudioDrafts(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDb();
  if (!db) return;
  await db.delete(questionAudioDrafts).where(inArray(questionAudioDrafts.id, ids));
}

export async function createOrderQuestionAudioAnswers(rows: Array<Omit<OrderQuestionAudioAnswer, 'id' | 'createdAt'>>): Promise<void> {
  if (rows.length === 0) return;
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.insert(orderQuestionAudioAnswers).values(rows);
}

export async function getOrderQuestionAudioAnswers(orderStatusId: number): Promise<OrderQuestionAudioAnswer[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(orderQuestionAudioAnswers)
    .where(eq(orderQuestionAudioAnswers.orderStatusId, orderStatusId))
    .orderBy(asc(orderQuestionAudioAnswers.id));
}

// ========== OPTION DOCUMENTS (DOCUMENTOS DINÂMICOS) ==========

export async function listOptionDocuments(optionId: number): Promise<OptionDocument[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(optionDocuments).where(eq(optionDocuments.optionId, optionId)).orderBy(asc(optionDocuments.sortOrder));
}

export async function createOptionDocument(data: { optionId: number; label: string; sortOrder?: number; exampleImageUrl?: string }): Promise<OptionDocument> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const result = await db.insert(optionDocuments).values({
    optionId: data.optionId,
    label: data.label,
    exampleImageUrl: data.exampleImageUrl || null,
    sortOrder: data.sortOrder || 0,
  });
  const inserted = await db.select().from(optionDocuments).where(eq(optionDocuments.id, Number(result[0].insertId))).limit(1);
  return inserted[0];
}

export async function updateOptionDocument(id: number, data: { label?: string; exampleImageUrl?: string | null; sortOrder?: number; inputSource?: 'camera' | 'gallery' | 'both'; instruction?: string | null; exampleText?: string | null }): Promise<OptionDocument | null> {
  const db = await getDb();
  if (!db) return null;
  await db.update(optionDocuments).set(data).where(eq(optionDocuments.id, id));
  const updated = await db.select().from(optionDocuments).where(eq(optionDocuments.id, id)).limit(1);
  return updated[0] || null;
}

export async function deleteOptionDocument(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(optionDocuments).where(eq(optionDocuments.id, id));
}

export async function deleteOptionDocumentsByOptionId(optionId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(optionDocuments).where(eq(optionDocuments.optionId, optionId));
}

// ========== ACCESS CODE PHONES (HISTÓRICO) ==========

export async function listAccessCodePhones(codeId: number): Promise<AccessCodePhone[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(accessCodePhones).where(eq(accessCodePhones.codeId, codeId));
}

export async function listAllAccessCodePhones(): Promise<AccessCodePhone[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(accessCodePhones);
}

// ========== SITE SETTINGS ==========

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(siteSettings).where(eq(siteSettings.settingKey, key)).limit(1);
  return result.length > 0 ? result[0].settingValue : null;
}

export async function getSettings(keys: string[]): Promise<Record<string, string>> {
  const db = await getDb();
  if (!db) return {};
  const allSettings = await db.select().from(siteSettings);
  const map: Record<string, string> = {};
  for (const s of allSettings) {
    if (keys.includes(s.settingKey)) {
      map[s.settingKey] = s.settingValue || '';
    }
  }
  return map;
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const db = await getDb();
  if (!db) return {};
  const allSettings = await db.select().from(siteSettings);
  const map: Record<string, string> = {};
  for (const s of allSettings) {
    map[s.settingKey] = s.settingValue || '';
  }
  return map;
}

export async function upsertSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(siteSettings).values({ settingKey: key, settingValue: value })
    .onDuplicateKeyUpdate({ set: { settingValue: value } });
}

export async function upsertSettings(settings: Record<string, string>): Promise<void> {
  for (const [key, value] of Object.entries(settings)) {
    await upsertSetting(key, value);
  }
}

// ========== CUSTOMERS (CADASTRO DE CLIENTES) ==========

export async function getCustomerByPhone(phone: string): Promise<Customer | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(customers).where(eq(customers.phone, phone)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getCustomerByCpf(cpf: string): Promise<Customer | null> {
  const db = await getDb();
  if (!db) return null;
  // Buscar por CPF exato
  let result = await db.select().from(customers).where(eq(customers.cpf, cpf)).limit(1);
  if (result.length > 0) return result[0];
  // Buscar por CPF normalizado (só dígitos)
  const digits = cpf.replace(/\D/g, '');
  if (digits !== cpf && digits.length === 11) {
    result = await db.select().from(customers).where(eq(customers.cpf, digits)).limit(1);
    if (result.length > 0) return result[0];
    // Buscar por CPF formatado (000.000.000-00)
    const formatted = `${digits.slice(0,3)}.${digits.slice(3,6)}.${digits.slice(6,9)}-${digits.slice(9)}`;
    result = await db.select().from(customers).where(eq(customers.cpf, formatted)).limit(1);
    if (result.length > 0) return result[0];
  }
  return null;
}

export type MainCustomerProfileInput = {
  name: string;
  phone: string;
  email?: string;
  cpf?: string;
  city?: string;
  uf?: string;
  referredBy?: string;
  referredByPhone?: string;
  profilePhotoUrl?: string;
};

function normalizeMainCustomerPhone(value: unknown): string {
  let phone = String(value ?? '').replace(/\D/g, '');
  if ((phone.length === 12 || phone.length === 13) && phone.startsWith('55')) phone = phone.slice(2);
  return phone;
}

const isValidMainCustomerCpf = isValidCPF;

/** O cadastro principal só existe quando o perfil obrigatório está completo. */
export function validateMainCustomerProfile(data: MainCustomerProfileInput): { phone: string; cpf: string; email: string; photoUrl: string } {
  const phone = normalizeMainCustomerPhone(data.phone);
  const cpf = normalizeCpf(data.cpf);
  const email = String(data.email || '').trim().toLowerCase();
  const photoUrl = String(data.profilePhotoUrl || '').trim();
  const missing: string[] = [];
  if (!String(data.name || '').trim()) missing.push('nome');
  if (!/^\d{10,11}$/.test(phone)) missing.push('telefone');
  if (!isValidMainCustomerCpf(cpf)) missing.push('CPF válido');
  if (!/^\S+@\S+\.\S+$/.test(email)) missing.push('e-mail');
  if (!photoUrl) missing.push('foto de perfil');
  if (missing.length) throw new Error(`Cadastro principal exige: ${missing.join(', ')}.`);
  return { phone, cpf, email, photoUrl };
}

export async function createCustomer(data: MainCustomerProfileInput): Promise<Customer> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const required = validateMainCustomerProfile(data);
  // Gerar número de cadastro sequencial
  const [maxRow] = await db.execute(sql`SELECT COALESCE(MAX(CASE WHEN customerNumber <> 99999 THEN customerNumber END), 451) + 1 AS nextNum FROM customers`) as unknown as Array<Array<{ nextNum: number }>>;
  const nextNum = maxRow[0]?.nextNum ?? 1;
  await db.insert(customers).values({
    customerNumber: nextNum,
    name: data.name ? data.name.toUpperCase().trim() : data.name,
    phone: required.phone,
    email: required.email,
    city: data.city ? data.city.toUpperCase().trim() : null,
    uf: data.uf ? data.uf.toUpperCase().trim() : null,
    cpf: required.cpf,
    referredBy: data.referredBy ? data.referredBy.toUpperCase().trim() : null,
    referredByPhone: data.referredByPhone ? normalizeMainCustomerPhone(data.referredByPhone) : null,
    profilePhotoUrl: required.photoUrl,
  });
  // Colunas de identidade foram adicionadas de modo compatível para proteger novas criações.
  try {
    await db.execute(sql`UPDATE customers SET normalizedPhone=${required.phone}, normalizedCpf=${required.cpf}, normalizedEmail=${required.email} WHERE phone=${required.phone}`);
  } catch { /* infraestrutura ainda será inicializada no startup */ }
  const result = await db.select().from(customers).where(eq(customers.phone, required.phone)).limit(1);
  return result[0];
}

export async function listCustomers(): Promise<Customer[]> {
  const db = await getDb();
  if (!db) return [];
  // Excluir clientes na lixeira (soft delete)
  return await db.select().from(customers)
    .where(sql`${customers.deletedAt} IS NULL`)
    .orderBy(sql`${customers.createdAt} DESC`);
}

export async function updateCustomer(id: number, data: { name?: string; phone?: string; email?: string; city?: string; uf?: string; cpf?: string; referredBy?: string; referredByPhone?: string; profilePhotoUrl?: string; customerNumber?: number | null; adminNotes?: string | null }): Promise<Customer | null> {
  const db = await getDb();
  if (!db) return null;
  const updateSet: Record<string, unknown> = {};
  if (data.name !== undefined) updateSet.name = data.name ? data.name.toUpperCase().trim() : data.name;
  if (data.phone !== undefined) updateSet.phone = normalizeMainCustomerPhone(data.phone);
  if (data.email !== undefined) updateSet.email = data.email ? data.email.trim().toLowerCase() : data.email;
  if (data.city !== undefined) updateSet.city = data.city ? data.city.toUpperCase().trim() : data.city;
  if (data.uf !== undefined) updateSet.uf = data.uf ? data.uf.toUpperCase().trim() : data.uf;
  if (data.cpf !== undefined) updateSet.cpf = data.cpf ? data.cpf.replace(/\D/g, '') : data.cpf;
  if (data.referredBy !== undefined) updateSet.referredBy = data.referredBy ? data.referredBy.toUpperCase().trim() : data.referredBy;
  if (data.referredByPhone !== undefined) updateSet.referredByPhone = data.referredByPhone ? normalizeMainCustomerPhone(data.referredByPhone) : data.referredByPhone;
  if (data.profilePhotoUrl !== undefined) updateSet.profilePhotoUrl = data.profilePhotoUrl;
  if (data.customerNumber !== undefined) updateSet.customerNumber = data.customerNumber;
  if (data.adminNotes !== undefined) updateSet.adminNotes = data.adminNotes;
  if ((data as any).isReseller !== undefined) updateSet.isReseller = (data as any).isReseller;
  if ((data as any).resellerDiscountType !== undefined) updateSet.resellerDiscountType = (data as any).resellerDiscountType;
  if ((data as any).resellerDiscountValue !== undefined) updateSet.resellerDiscountValue = (data as any).resellerDiscountValue;
  if (Object.keys(updateSet).length > 0) {
    await db.update(customers).set(updateSet).where(eq(customers.id, id));
  }
  const result = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  const customer = result.length > 0 ? result[0] : null;
  if (customer) {
    try {
      await db.execute(sql`UPDATE customers SET normalizedPhone=${normalizeMainCustomerPhone(customer.phone)}, normalizedCpf=${String(customer.cpf || '').replace(/\D/g, '') || null}, normalizedEmail=${String(customer.email || '').trim().toLowerCase() || null} WHERE id=${id}`);
    } catch { /* infraestrutura ainda será inicializada no startup */ }
  }
  return customer;
}

export async function deleteCustomer(id: number, reason?: string): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Buscar o cliente para obter o telefone
  const [customer] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  if (!customer) return;

  // Verificar se o cliente possui pedidos ativos (que não foram excluídos/ocultos)
  // Um pedido é considerado "excluído" quando TODOS os seus subpedidos estão na tabela hiddenSubOrders
  const [activeOrderRow] = await db.execute(sql`
    SELECT osh.registrationId
    FROM orderStatusHistory osh
    WHERE osh.customerPhone = ${customer.phone}
      AND NOT EXISTS (
        SELECT 1 FROM hiddenSubOrders h
        WHERE h.registrationId = osh.registrationId
          AND h.subOrderIndex = 0
      )
    LIMIT 1
  `) as unknown as [Array<{ registrationId: number }>, unknown];

  if (activeOrderRow && activeOrderRow.length > 0) {
    throw new Error('CUSTOMER_HAS_ORDERS');
  }

  // Soft delete: marcar como excluído em vez de remover permanentemente
  await db.update(customers).set({
    deletedAt: new Date(),
    deletedReason: reason || 'Excluído pelo administrador',
  }).where(eq(customers.id, id));
}

export async function restoreCustomer(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(customers).set({ deletedAt: null, deletedReason: null }).where(eq(customers.id, id));
}

export async function listDeletedCustomers(): Promise<Customer[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(customers)
    .where(sql`${customers.deletedAt} IS NOT NULL`)
    .orderBy(desc(customers.deletedAt));
}

export async function permanentlyDeleteCustomer(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(customers).where(eq(customers.id, id));
}

// ===== SORTEIOS =====

export async function createRaffle(data: { title: string; description?: string; maxNumbersPerPerson?: number }): Promise<Raffle | null> {
  const db = await getDb();
  if (!db) return null;
  const [result] = await db.insert(raffles).values({ title: data.title, description: data.description || null, maxNumbersPerPerson: data.maxNumbersPerPerson ?? 1 }).$returningId();
  const [raffle] = await db.select().from(raffles).where(eq(raffles.id, result.id));
  return raffle || null;
}

export async function getAllRaffles(): Promise<Raffle[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(raffles).orderBy(sql`${raffles.createdAt} DESC`);
}

export async function getRaffleById(id: number): Promise<Raffle | null> {
  const db = await getDb();
  if (!db) return null;
  const [raffle] = await db.select().from(raffles).where(eq(raffles.id, id));
  return raffle || null;
}

export async function updateRaffle(id: number, data: { title?: string; description?: string; status?: "open" | "closed" | "drawn"; maxNumbersPerPerson?: number; winnerNumber?: number; winnerName?: string; winnerPhone?: string; winnerProfilePhotoUrl?: string | null; drawnAt?: Date }): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(raffles).set(data).where(eq(raffles.id, id));
}

export async function deleteRaffle(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(raffleEntries).where(eq(raffleEntries.raffleId, id));
  await db.delete(raffles).where(eq(raffles.id, id));
}

export async function updateRaffleEntryPayment(entryId: number, paymentStatus: 'pending' | 'paid'): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(raffleEntries).set({ paymentStatus }).where(eq(raffleEntries.id, entryId));
}

export async function deleteRaffleEntry(entryId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(raffleEntries).where(eq(raffleEntries.id, entryId));
}

export async function getRaffleEntries(raffleId: number): Promise<(RaffleEntry & { profilePhotoUrl: string | null })[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: raffleEntries.id,
      raffleId: raffleEntries.raffleId,
      number: raffleEntries.number,
      customerName: raffleEntries.customerName,
      customerPhone: raffleEntries.customerPhone,
      paymentStatus: raffleEntries.paymentStatus,
      createdAt: raffleEntries.createdAt,
      profilePhotoUrl: customers.profilePhotoUrl,
    })
    .from(raffleEntries)
    .leftJoin(customers, eq(customers.phone, raffleEntries.customerPhone))
    .where(eq(raffleEntries.raffleId, raffleId))
    .orderBy(asc(raffleEntries.number));
  return rows;
}

export async function createRaffleEntry(data: { raffleId: number; number: number; customerName: string; customerPhone: string }): Promise<RaffleEntry | null> {
  const db = await getDb();
  if (!db) return null;
  const [result] = await db.insert(raffleEntries).values(data).$returningId();
  const [entry] = await db.select().from(raffleEntries).where(eq(raffleEntries.id, result.id));
  return entry || null;
}

export async function checkNumberTaken(raffleId: number, number: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const [entry] = await db.select().from(raffleEntries).where(sql`${raffleEntries.raffleId} = ${raffleId} AND ${raffleEntries.number} = ${number}`);
  return !!entry;
}

export async function getActiveRaffle(): Promise<Raffle | null> {
  const db = await getDb();
  if (!db) return null;
  const [raffle] = await db.select().from(raffles).where(eq(raffles.status, "open")).orderBy(sql`${raffles.createdAt} DESC`).limit(1);
  return raffle || null;
}

export async function getLatestDrawnRaffle(): Promise<Raffle | null> {
  const db = await getDb();
  if (!db) return null;
  const [raffle] = await db.select().from(raffles).where(eq(raffles.status, "drawn")).orderBy(sql`${raffles.drawnAt} DESC`).limit(1);
  return raffle || null;
}

// Atualizar último acesso do cliente
export async function updateCustomerLastAccess(phone: string) {
  const db = await getDb();
  if (!db) return;
  // Usar UTC_TIMESTAMP() do MySQL para garantir que o timestamp seja gravado em UTC
  // independente do fuso do servidor Node.js ou do TiDB
  await db.execute(sql`UPDATE customers SET lastAccessAt = UTC_TIMESTAMP() WHERE REGEXP_REPLACE(phone, '[^0-9]', '') = REGEXP_REPLACE(${phone}, '[^0-9]', '')`);

}

// ========== CUSTOMER DOCUMENTS ==========

// Listar documentos de um cliente
export async function getCustomerDocuments(customerId: number): Promise<CustomerDocument[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(customerDocuments).where(eq(customerDocuments.customerId, customerId)).orderBy(desc(customerDocuments.createdAt));
}

// Criar documento para um cliente
export async function createCustomerDocument(data: InsertCustomerDocument): Promise<CustomerDocument> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const result = await db.insert(customerDocuments).values(data);
  const id = result[0].insertId;
  const doc = await db.select().from(customerDocuments).where(eq(customerDocuments.id, id)).limit(1);
  return doc[0]!;
}

// Deletar documento de um cliente
export async function deleteCustomerDocument(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(customerDocuments).where(eq(customerDocuments.id, id));
}

// ========== ADMIN CREDENTIALS ==========

// Buscar credencial admin por username
export async function getAdminCredential(username: string) {
  const db = await getDb();
  if (!db) return null;
  const [cred] = await db.select().from(adminCredentials).where(eq(adminCredentials.username, username)).limit(1);
  return cred || null;
}

// Atualizar senha admin
export async function updateAdminPassword(username: string, passwordHash: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(adminCredentials).set({ passwordHash }).where(eq(adminCredentials.username, username));
}

// ========== ORDER STATUS HISTORY ==========
// Gera um número de pedido único a partir de 10000 usando a tabela orderCounter
export async function generateOrderNumber(): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.insert(orderCounter).values({ createdAt: new Date() });
  // Buscar o LAST_INSERT_ID() diretamente via SQL para garantir captura correta
  const idResult = await db.execute(sql`SELECT LAST_INSERT_ID() as lastId`);
  const rows = (idResult as unknown as Array<{ lastId: number | string }>);
  // Drizzle MySQL retorna [[{lastId: N}], fields] ou [{lastId: N}]
  let lastId: number;
  if (Array.isArray(rows[0])) {
    lastId = Number((rows[0] as unknown as Array<{ lastId: number | string }>)[0]?.lastId);
  } else {
    lastId = Number((rows[0] as unknown as { lastId: number | string })?.lastId);
  }
  if (!lastId || lastId <= 0) throw new Error('Falha ao obter orderNumber');
  return lastId;
}

export async function addOrderStatus(data: { registrationId: number; customerPhone: string; status: string; note?: string; serviceName?: string; serviceOption?: string; pricePaid?: string | null; answers?: string; orderNumber?: number }): Promise<OrderStatusHistory> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.insert(orderStatusHistory).values({
    registrationId: data.registrationId,
    orderNumber: data.orderNumber != null && data.orderNumber > 0 ? data.orderNumber : null,
    customerPhone: data.customerPhone,
    status: data.status,
    note: data.note || null,
    serviceName: data.serviceName || null,
    serviceOption: data.serviceOption || null,
    pricePaid: data.pricePaid || null,
    answers: data.answers || null,
  });
  const whereClause = data.orderNumber != null && data.orderNumber > 0
    ? and(eq(orderStatusHistory.registrationId, data.registrationId), eq(orderStatusHistory.orderNumber, data.orderNumber))
    : eq(orderStatusHistory.customerPhone, data.customerPhone);
  const [row] = await db.select().from(orderStatusHistory)
    .where(whereClause)
    .orderBy(sql`${orderStatusHistory.createdAt} DESC`)
    .limit(1);
  return row;
}

// Registra uma nova mudança de status no sub-pedido, preservando todo o histórico.
// Se o status informado for igual ao status atual do sub-pedido, atualiza apenas a nota.
export async function updateLastOrderStatus(data: {
  registrationId: number;
  subOrderIndex: number;
  status: string;
  note?: string | null;
}): Promise<{ success: boolean; error?: string }> {
  const db = await getDb();
  if (!db) return { success: false, error: 'Database not available' };

  // Buscar todo o histórico ASC para dividir em sub-pedidos
  const allHistory = await db.select().from(orderStatusHistory)
    .where(eq(orderStatusHistory.registrationId, data.registrationId))
    .orderBy(sql`${orderStatusHistory.createdAt} ASC`);

  if (allHistory.length === 0) return { success: false, error: 'Histórico não encontrado' };

  // Buscar o status inicial dinâmico (igual ao listOrders)
  let initialStatus = 'recebido';
  try {
    const stResult = await db.execute(sql`SELECT \`key\` FROM orderStatusTypes WHERE isActive = 1 ORDER BY sortOrder ASC LIMIT 1`);
    const stRows = (stResult as any)[0] as any[];
    if (stRows && stRows.length > 0 && stRows[0].key) initialStatus = stRows[0].key;
  } catch (e) { /* usa 'recebido' como fallback */ }

  // Dividir em sub-pedidos (mesma lógica do splitIntoSubOrders)
  const subOrders: OrderStatusHistory[][] = [];
  let current: OrderStatusHistory[] = [];
  for (const entry of allHistory) {
    if ((entry.status === initialStatus || entry.status === 'recebido') && current.length > 0) {
      subOrders.push(current);
      current = [entry];
    } else {
      current.push(entry);
    }
  }
  if (current.length > 0) subOrders.push(current);
  // Reverter para que índice 0 = mais recente (igual ao frontend)
  subOrders.reverse();

  const subHistory = subOrders[data.subOrderIndex];
  if (!subHistory || subHistory.length === 0) return { success: false, error: 'Sub-pedido não encontrado' };

  // Sub-histórico já está em ordem ASC; o último item é o status atual do sub-pedido.
  const latestEntry = subHistory[subHistory.length - 1];
  if (!latestEntry) return { success: false, error: 'Sub-pedido sem histórico' };

  // Impedir voltar manualmente para o status inicial (isso é marcador de início de sub-pedido).
  // Exceção: se já está nesse status, apenas atualiza nota.
  if ((data.status === initialStatus || data.status === 'recebido') && latestEntry.status !== data.status) {
    return { success: false, error: 'Status inicial do pedido não pode ser definido manualmente após o início.' };
  }

  // Se não houve troca de status, atualizar apenas a nota do último evento.
  if (latestEntry.status === data.status) {
    await db.execute(sql`
      UPDATE orderStatusHistory
      SET note = ${data.note ?? null}
      WHERE id = ${latestEntry.id}
    `);
    return { success: true };
  }

  // Herdar metadados existentes do sub-pedido para o novo evento de status.
  const sourceForService = [...subHistory].reverse().find(h => h.serviceName || h.serviceOption) || latestEntry;
  const sourceForOrderNumber = [...subHistory].reverse().find(h => h.orderNumber != null) || latestEntry;

  // Mudou status: inserir NOVO registro para manter horário de cada transição.
  await db.insert(orderStatusHistory).values({
    registrationId: data.registrationId,
    customerPhone: latestEntry.customerPhone,
    status: data.status,
    note: data.note ?? null,
    serviceName: sourceForService.serviceName ?? null,
    serviceOption: sourceForService.serviceOption ?? null,
    orderNumber: sourceForOrderNumber.orderNumber ?? null,
  });
  return { success: true };
}

export async function getOrderStatusHistory(registrationId: number): Promise<OrderStatusHistory[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(orderStatusHistory)
    .where(eq(orderStatusHistory.registrationId, registrationId))
    .orderBy(sql`${orderStatusHistory.createdAt} DESC`);
}

export async function getLatestOrderStatus(registrationId: number): Promise<OrderStatusHistory | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(orderStatusHistory)
    .where(eq(orderStatusHistory.registrationId, registrationId))
    .orderBy(sql`${orderStatusHistory.createdAt} DESC`)
    .limit(1);
  return row || null;
}

export async function getOrderStatusHistoryByPhone(phone: string): Promise<OrderStatusHistory[]> {
  const db = await getDb();
  if (!db) return [];
  const phoneDigits = phone.replace(/\D/g, '');
  return await db.select().from(orderStatusHistory)
    .where(sql`REGEXP_REPLACE(${orderStatusHistory.customerPhone}, '[^0-9]', '') = ${phoneDigits}`)
    .orderBy(sql`${orderStatusHistory.createdAt} DESC`);
}

// ── Order Files ──────────────────────────────────────────────────────────────
// Mantém a origem "anexado pelo ADM" separada de "enviado ao cliente".
// A alteração é idempotente para bancos já existentes e preserva todos os arquivos.
let orderFilesAdminOriginColumnPromise: Promise<void> | null = null;
async function ensureOrderFilesAdminOriginColumn(db: any): Promise<void> {
  if (!orderFilesAdminOriginColumnPromise) {
    orderFilesAdminOriginColumnPromise = (async () => {
      try {
        await db.execute(sql.raw("ALTER TABLE `orderFiles` ADD COLUMN IF NOT EXISTS `addedByAdmin` TINYINT NOT NULL DEFAULT 0"));
      } catch {
        try { await db.execute(sql.raw("ALTER TABLE `orderFiles` ADD COLUMN `addedByAdmin` TINYINT NOT NULL DEFAULT 0")); } catch { /* coluna já existe */ }
      }
      // O anexo já confirmado pelo ADM nesta correção mantém sua origem visual correta.
      await db.execute(sql.raw("UPDATE `orderFiles` SET `addedByAdmin` = 1 WHERE `addedByAdmin` = 0 AND `fromAdmin` = 0 AND `label` = 'FOTO BUCSA'"));
    })().catch((error) => {
      orderFilesAdminOriginColumnPromise = null;
      throw error;
    });
  }
  await orderFilesAdminOriginColumnPromise;
}

export async function addOrderFile(data: InsertOrderFile): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await ensureOrderFilesAdminOriginColumn(db);
  await db.insert(orderFiles).values(data);
}

export async function getOrderFiles(registrationId: number): Promise<OrderFile[]> {
  const db = await getDb();
  if (!db) return [];
  await ensureOrderFilesAdminOriginColumn(db);
  return await db.select().from(orderFiles)
    .where(eq(orderFiles.registrationId, registrationId))
    .orderBy(sql`${orderFiles.createdAt} ASC`);
}

export async function deleteOrderFile(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await ensureOrderFilesAdminOriginColumn(db);
  await db.delete(orderFiles).where(eq(orderFiles.id, id));
}

// ── Order Status Types (editáveis pelo admin) ─────────────────────────────────
import { orderStatusTypes, OrderStatusType, InsertOrderStatusType } from "../drizzle/schema";

export async function getStatusLabelFromDb(key: string): Promise<string> {
  const db = await getDb();
  if (!db) return key;
  const [row] = await db.select({ label: orderStatusTypes.label })
    .from(orderStatusTypes)
    .where(eq(orderStatusTypes.key, key))
    .limit(1);
  return row?.label || key;
}

export async function getStatusInfoFromDb(key: string): Promise<{ label: string; description: string | null }> {
  const db = await getDb();
  if (!db) return { label: key, description: null };
  const [row] = await db.select({ label: orderStatusTypes.label, description: orderStatusTypes.description })
    .from(orderStatusTypes)
    .where(eq(orderStatusTypes.key, key))
    .limit(1);
  return { label: row?.label || key, description: row?.description || null };
}

export async function listOrderStatusTypes(): Promise<OrderStatusType[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(orderStatusTypes)
    .orderBy(asc(orderStatusTypes.sortOrder));
}

export async function createOrderStatusType(data: Omit<InsertOrderStatusType, "id" | "createdAt" | "updatedAt" | "isSystem">): Promise<OrderStatusType> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(orderStatusTypes).values({ ...data, isSystem: 0 });
  const [row] = await db.select().from(orderStatusTypes).where(eq(orderStatusTypes.key, data.key)).limit(1);
  return row;
}

export async function updateOrderStatusType(id: number, data: Partial<Pick<OrderStatusType, "label" | "color" | "bgColor" | "icon" | "description" | "sortOrder" | "isActive" | "pulseColor" | "showInProgress" | "progressOrder">>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(orderStatusTypes).set(data).where(eq(orderStatusTypes.id, id));
}

export async function deleteOrderStatusType(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // Permite excluir qualquer status (admin tem controle total)
  await db.delete(orderStatusTypes).where(sql`${orderStatusTypes.id} = ${id}`);
}

// ========== INFO BANNERS ==========

export async function listInfoBanners(onlyActive = false): Promise<InfoBanner[]> {
  const db = await getDb();
  if (!db) return [];
  if (onlyActive) {
    return await db.select().from(infoBanners)
      .where(sql`${infoBanners.isActive} = 1`)
      .orderBy(asc(infoBanners.sortOrder));
  }
  return await db.select().from(infoBanners).orderBy(asc(infoBanners.sortOrder));
}

export async function createInfoBanner(data: Omit<InsertInfoBanner, "id" | "createdAt" | "updatedAt">): Promise<InfoBanner> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(infoBanners).values(data);
  const rows = await db.select().from(infoBanners).orderBy(sql`id DESC`).limit(1);
  return rows[0];
}

export async function updateInfoBanner(id: number, data: Partial<Pick<InfoBanner, "title" | "content" | "bgColor" | "textColor" | "sortOrder" | "isActive">>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(infoBanners).set(data).where(eq(infoBanners.id, id));
}

export async function deleteInfoBanner(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(infoBanners).where(eq(infoBanners.id, id));
}

export async function getOrderFilesByPhone(phone: string): Promise<OrderFile[]> {
  const db = await getDb();
  if (!db) return [];
  await ensureOrderFilesAdminOriginColumn(db);
  const phoneDigits = phone.replace(/\D/g, '');
  return await db.select().from(orderFiles)
    .where(sql`REGEXP_REPLACE(${orderFiles.customerPhone}, '[^0-9]', '') = ${phoneDigits}`)
    .orderBy(sql`${orderFiles.createdAt} DESC`);
}

export type OrderFileGrouped = {
  registrationId: number;
  serviceName: string | null;
  serviceOption: string | null;
  orderNumber: number | null;
  files: (OrderFile & { fromAdmin: number })[];
};

export async function getOrderFilesByPhoneGrouped(phone: string): Promise<OrderFileGrouped[]> {
  const db = await getDb();
  if (!db) return [];
  await ensureOrderFilesAdminOriginColumn(db);
  const phoneDigits = phone.replace(/\D/g, '');

  // Buscar todos os arquivos do cliente
  const files = await db.select().from(orderFiles)
    .where(sql`REGEXP_REPLACE(${orderFiles.customerPhone}, '[^0-9]', '') = ${phoneDigits}`)
    .orderBy(sql`${orderFiles.createdAt} ASC`);

  if (files.length === 0) return [];

  // Buscar info de serviço para cada registrationId único
  const regIds = Array.from(new Set(files.map(f => f.registrationId)));
  const serviceInfoMap: Record<number, { serviceName: string | null; serviceOption: string | null; orderNumber: number | null }> = {};

  for (const regId of regIds) {
    const [row] = await db.select({
      serviceName: orderStatusHistory.serviceName,
      serviceOption: orderStatusHistory.serviceOption,
      orderNumber: orderStatusHistory.orderNumber,
    }).from(orderStatusHistory)
      .where(eq(orderStatusHistory.registrationId, regId))
      .orderBy(sql`${orderStatusHistory.createdAt} ASC`)
      .limit(1);
    serviceInfoMap[regId] = row ?? { serviceName: null, serviceOption: null, orderNumber: null };
  }

  // Agrupar arquivos por registrationId
  const grouped: OrderFileGrouped[] = regIds.map(regId => ({
    registrationId: regId,
    serviceName: serviceInfoMap[regId]?.serviceName ?? null,
    serviceOption: serviceInfoMap[regId]?.serviceOption ?? null,
    orderNumber: serviceInfoMap[regId]?.orderNumber ?? null,
    files: files.filter(f => f.registrationId === regId) as (OrderFile & { fromAdmin: number })[],
  }));

  // Ordenar grupos: mais recentes primeiro (pelo createdAt do primeiro arquivo do grupo)
  grouped.sort((a, b) => {
    const aDate = a.files[0]?.createdAt ? new Date(a.files[0].createdAt).getTime() : 0;
    const bDate = b.files[0]?.createdAt ? new Date(b.files[0].createdAt).getTime() : 0;
    return bDate - aDate;
  });

  return grouped;
}

// ── Order Notes (anotações internas do admin) ─────────────────────────────────
export async function getOrderNotes(registrationId: number): Promise<OrderNote[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(orderNotes)
    .where(eq(orderNotes.registrationId, registrationId))
    .orderBy(sql`${orderNotes.createdAt} ASC`);
}

// Criar novo bloco de anotação
export async function createOrderNoteBlock(registrationId: number, blockName: string, content: string = ''): Promise<OrderNote> {
  const db = await getDb();
  if (!db) throw new Error('DB not available');
  const result = await db.insert(orderNotes).values({ registrationId, blockName, content: content || ' ' });
  const insertId = (result as unknown as { insertId: number }).insertId;
  const rows = await db.select().from(orderNotes).where(eq(orderNotes.id, insertId)).limit(1);
  return rows[0];
}

// Salvar conteúdo de um bloco específico por ID
export async function saveOrderNoteBlock(id: number, content: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('DB not available');
  await db.update(orderNotes).set({ content, updatedAt: new Date() }).where(eq(orderNotes.id, id));
}

// Renomear bloco
export async function renameOrderNoteBlock(id: number, blockName: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('DB not available');
  await db.update(orderNotes).set({ blockName }).where(eq(orderNotes.id, id));
}

// Deletar bloco específico por ID
export async function deleteOrderNoteBlock(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(orderNotes).where(eq(orderNotes.id, id));
}

export async function saveOrderNote(registrationId: number, content: string): Promise<OrderNote> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Upsert: se já existe uma nota para este pedido, atualiza; senão cria
  const existing = await db.select().from(orderNotes)
    .where(eq(orderNotes.registrationId, registrationId))
    .limit(1);
  if (existing.length > 0) {
    await db.update(orderNotes)
      .set({ content, updatedAt: new Date() })
      .where(eq(orderNotes.registrationId, registrationId));
    const updated = await db.select().from(orderNotes)
      .where(eq(orderNotes.registrationId, registrationId))
      .limit(1);
    return updated[0];
  }
  const result = await db.insert(orderNotes).values({ registrationId, content });
  const inserted = await db.select().from(orderNotes)
    .where(eq(orderNotes.id, (result[0] as unknown as { insertId: number }).insertId))
    .limit(1);
  return inserted[0];
}

export async function deleteOrderNote(registrationId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(orderNotes).where(eq(orderNotes.registrationId, registrationId));
}

// ─── Doc Requests ────────────────────────────────────────────────────────────
export async function createDocRequest(data: Omit<InsertDocRequest, 'id' | 'createdAt' | 'updatedAt'>): Promise<DocRequest> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(docRequests).values(data);
  const inserted = await db.select().from(docRequests)
    .where(eq(docRequests.id, (result[0] as unknown as { insertId: number }).insertId))
    .limit(1);
  return inserted[0];
}

export async function getDocRequestsByRegistration(registrationId: number): Promise<DocRequest[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(docRequests)
    .where(eq(docRequests.registrationId, registrationId))
    .orderBy(docRequests.createdAt);
}

export async function getDocRequestsByPhone(phone: string): Promise<DocRequest[]> {
  const db = await getDb();
  if (!db) return [];
  const phoneDigits = phone.replace(/\D/g, '');
  return db.select().from(docRequests)
    .where(sql`REGEXP_REPLACE(${docRequests.customerPhone}, '[^0-9]', '') = ${phoneDigits}`)
    .orderBy(docRequests.createdAt);
}

export async function updateDocRequestStatus(id: number, status: string, answeredFileId?: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(docRequests)
    .set({ status, ...(answeredFileId ? { answeredFileId } : {}), updatedAt: new Date() })
    .where(eq(docRequests.id, id));
}

export async function deleteDocRequest(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(docRequests).where(eq(docRequests.id, id));
}

// ─── BLOCKLIST ────────────────────────────────────────────────────────────────
export async function getBlocklist(): Promise<Blocklist[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(blocklist).orderBy(sql`${blocklist.createdAt} DESC`);
}

export async function addToBlocklist(data: InsertBlocklist): Promise<Blocklist> {
  const db = await getDb();
  if (!db) throw new Error('DB not available');
  const [result] = await db.insert(blocklist).values(data);
  const id = (result as any).insertId;
  const [row] = await db.select().from(blocklist).where(eq(blocklist.id, id)).limit(1);
  return row;
}

export async function removeFromBlocklist(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // Buscar o telefone antes de deletar para limpar IPs associados
  const [entry] = await db.select().from(blocklist).where(eq(blocklist.id, id)).limit(1);
  await db.delete(blocklist).where(eq(blocklist.id, id));
  // Se tinha telefone, remover IPs bloqueados por causa desse telefone
  if (entry?.phone) {
    const normalizedPhone = entry.phone.replace(/\D/g, '');
    // Remover da ipBlocklist onde a razão menciona esse telefone
    await db.delete(ipBlocklist).where(
      sql`${ipBlocklist.reason} LIKE ${'%' + normalizedPhone + '%'}`
    );
    // Zerar tentativas de login admin para IPs que foram bloqueados por esse telefone
    await db.update(adminLoginAttempts)
      .set({ attempts: 0, blocked: 0, blockedAt: null, unlockedAt: null })
      .where(sql`${adminLoginAttempts.blocked} = 1`);
  }
}

export async function checkBlocklist(name: string, phone: string): Promise<{ blocked: boolean; reason?: string; type?: string }> {
  const db = await getDb();
  if (!db) return { blocked: false };
  const normalizedPhone = phone.replace(/\D/g, '');
  const normalizedName = name.trim().toLowerCase();
  const entries = await db.select().from(blocklist);
  for (const entry of entries) {
    const entryPhone = (entry.phone || '').replace(/\D/g, '');
    const entryName = (entry.name || '').trim().toLowerCase();
    if (entry.type === 'phone' && entryPhone && normalizedPhone === entryPhone) {
      return { blocked: true, reason: entry.reason || 'Cadastro bloqueado', type: 'phone' };
    }
    if (entry.type === 'name' && entryName && normalizedName === entryName) {
      return { blocked: true, reason: entry.reason || 'Cadastro bloqueado', type: 'name' };
    }
    if (entry.type === 'both') {
      if (entryPhone && normalizedPhone === entryPhone) {
        return { blocked: true, reason: entry.reason || 'Cadastro bloqueado', type: 'phone' };
      }
      if (entryName && normalizedName === entryName) {
        return { blocked: true, reason: entry.reason || 'Cadastro bloqueado', type: 'name' };
      }
    }
  }
  return { blocked: false };
}

// ===== SYSTEM CONFIG =====
export async function getSystemConfig(key: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(systemConfig).where(eq(systemConfig.configKey, key));
  return rows[0]?.configValue ?? null;
}

export async function setSystemConfig(key: string, value: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.execute(
    sql`INSERT INTO system_config (config_key, config_value) VALUES (${key}, ${value})
        ON DUPLICATE KEY UPDATE config_value = ${value}`
  );
}

export async function getAllSystemConfigs(): Promise<Record<string, string>> {
  const db = await getDb();
  if (!db) return {};
  const rows = await db.select().from(systemConfig);
  const result: Record<string, string> = {};
  for (const row of rows) result[row.configKey] = row.configValue;
  return result;
}

// ===== IP BLOCKLIST =====

export async function isIpBlocked(ip: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const rows = await db.select().from(ipBlocklist).where(eq(ipBlocklist.ip, ip)).limit(1);
  return rows.length > 0;
}

export async function getIpBlocklist(): Promise<IpBlocklist[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(ipBlocklist).orderBy(sql`${ipBlocklist.createdAt} DESC`);
}

export async function blockIp(ip: string, reason?: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.execute(
    sql`INSERT INTO ipBlocklist (ip, reason) VALUES (${ip}, ${reason || null})
        ON DUPLICATE KEY UPDATE reason = ${reason || null}`
  );
}

export async function unblockIp(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(ipBlocklist).where(eq(ipBlocklist.id, id));
}

export async function logIpAccess(ip: string, action: string, customerPhone?: string, customerName?: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(ipAccessLog).values({ ip, action, customerPhone: customerPhone || null, customerName: customerName || null });
    // Manter apenas os últimos 1000 registros por IP para não crescer indefinidamente
    await db.execute(sql`DELETE FROM ipAccessLog WHERE id NOT IN (SELECT id FROM (SELECT id FROM ipAccessLog ORDER BY createdAt DESC LIMIT 5000) t)`);
  } catch (e) { /* silenciar erros de log */ }
}

export async function getIpAccessLogs(limit = 200): Promise<IpAccessLog[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(ipAccessLog).orderBy(sql`${ipAccessLog.createdAt} DESC`).limit(limit);
}

export async function getIpAccessLogsByIp(ip: string): Promise<IpAccessLog[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(ipAccessLog).where(eq(ipAccessLog.ip, ip)).orderBy(sql`${ipAccessLog.createdAt} DESC`).limit(50);
}

// ========== VPN / PROXY DETECTION ==========

export async function logVpnAttempt(data: {
  ip: string;
  isp?: string;
  org?: string;
  country?: string;
  detectionType?: string;
  customerPhone?: string;
  customerName?: string;
  userAgent?: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(vpnAttempts).values({
      ip: data.ip,
      isp: data.isp || null,
      org: data.org || null,
      country: data.country || null,
      detectionType: data.detectionType || 'vpn',
      customerPhone: data.customerPhone || null,
      customerName: data.customerName || null,
      userAgent: data.userAgent || null,
    });
  } catch (e) { /* silenciar */ }
}

export async function getVpnAttempts(limit = 200): Promise<VpnAttempt[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(vpnAttempts).orderBy(sql`${vpnAttempts.createdAt} DESC`).limit(limit);
}

export async function checkVpnIp(ip: string): Promise<{ isVpn: boolean; isp?: string; org?: string; country?: string; detectionType?: string }> {
  // Usar ip-api.com (gratuito, sem chave, 45 req/min)
  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,proxy,hosting,isp,org,country,query`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return { isVpn: false };
    const data = await res.json() as { status: string; proxy: boolean; hosting: boolean; isp?: string; org?: string; country?: string };
    if (data.status !== 'success') return { isVpn: false };
    const isVpn = data.proxy === true;
    const detectionType = data.proxy ? 'proxy' : data.hosting ? 'hosting' : 'unknown';
    return { isVpn, isp: data.isp, org: data.org, country: data.country, detectionType };
  } catch {
    return { isVpn: false };
  }
}

// ========== BROADCASTS ==========

export async function createBroadcast(data: InsertBroadcast): Promise<Broadcast> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.insert(broadcasts).values(data);
  const result = await db.select().from(broadcasts).orderBy(sql`${broadcasts.id} DESC`).limit(1);
  return result[0];
}

export async function listBroadcasts(): Promise<Broadcast[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(broadcasts).orderBy(sql`${broadcasts.createdAt} DESC`);
}

export async function deleteBroadcast(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(broadcasts).where(eq(broadcasts.id, id));
}

export async function markBroadcastSent(id: number, totalRecipients: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(broadcasts).set({ status: 'sent', sentAt: new Date(), totalRecipients }).where(eq(broadcasts.id, id));
}

// ========== TENTATIVAS DE ACESSO BLOQUEADO ==========
export async function logBlockedAttempt(phone: string, action: string, ip?: string, reason?: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(blockedAccessAttempts).values({ phone, action, ip: ip || null, reason: reason || null });
}

export async function getBlockedAttempts(limit = 200): Promise<BlockedAccessAttempt[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(blockedAccessAttempts).orderBy(sql`${blockedAccessAttempts.createdAt} DESC`).limit(limit);
}

export async function clearBlockedAttempts(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(blockedAccessAttempts);
}

// ========== CONTAS PIX ==========
export async function listPixAccounts(): Promise<PixAccount[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(pixAccounts).orderBy(asc(pixAccounts.createdAt));
}

export async function getActivePixAccount(): Promise<PixAccount | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(pixAccounts).where(eq(pixAccounts.isActive, 1)).limit(1);
  return rows.length > 0 ? rows[0] : null;
}

export async function createPixAccount(data: { label: string; pixKey: string; pixType: string; pixName: string; pixBank: string }): Promise<PixAccount> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.insert(pixAccounts).values({ ...data, isActive: 0 });
  const rows = await db.select().from(pixAccounts).orderBy(sql`${pixAccounts.id} DESC`).limit(1);
  return rows[0];
}

export async function updatePixAccount(id: number, data: { label?: string; pixKey?: string; pixType?: string; pixName?: string; pixBank?: string }): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(pixAccounts).set(data).where(eq(pixAccounts.id, id));
}

export async function setActivePixAccount(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // Desativar todas e ativar apenas a selecionada
  await db.update(pixAccounts).set({ isActive: 0 });
  await db.update(pixAccounts).set({ isActive: 1 }).where(eq(pixAccounts.id, id));
}

export async function deletePixAccount(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(pixAccounts).where(eq(pixAccounts.id, id));
}

// ========== CONTROLE FINANCEIRO ==========

export async function createFinancialSale(data: Omit<InsertFinancialSale, 'id' | 'createdAt' | 'updatedAt'>): Promise<FinancialSale> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.insert(financialSales).values(data);
  const rows = await db.select().from(financialSales).orderBy(sql`${financialSales.id} DESC`).limit(1);
  return rows[0];
}

export async function updateFinancialSale(id: number, data: Partial<Pick<FinancialSale, 'customerName' | 'customerPhone' | 'productName' | 'productOption' | 'saleValue' | 'costValue' | 'paymentMethod' | 'status' | 'saleDate' | 'receivedDate' | 'notes'>>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(financialSales).set(data).where(eq(financialSales.id, id));
}

export async function deleteFinancialSale(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(financialSales).where(eq(financialSales.id, id));
}

export async function resetFinancialData(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // Limpar todos os registros de vendas financeiras
  await db.delete(financialSales);
}

export async function getFinancialSaleByRegistrationId(registrationId: number): Promise<FinancialSale | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(financialSales).where(eq(financialSales.registrationId, registrationId)).limit(1);
  return rows.length > 0 ? rows[0] : null;
}

export async function listFinancialSales(filters?: {
  status?: string;
  startDate?: number;
  endDate?: number;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<FinancialSale[]> {
  const db = await getDb();
  if (!db) return [];
  let query = `SELECT * FROM financialSales WHERE 1=1`;
  if (filters?.status && filters.status !== 'all') query += ` AND status = '${filters.status}'`;
  if (filters?.startDate) query += ` AND saleDate >= ${filters.startDate}`;
  if (filters?.endDate) query += ` AND saleDate <= ${filters.endDate}`;
  if (filters?.search) {
    const s = filters.search.replace(/'/g, "''");
    query += ` AND (customerName LIKE '%${s}%' OR customerPhone LIKE '%${s}%' OR productName LIKE '%${s}%' OR productOption LIKE '%${s}%')`;
  }
  query += ` ORDER BY saleDate DESC`;
  if (filters?.limit) query += ` LIMIT ${filters.limit}`;
  if (filters?.offset) query += ` OFFSET ${filters.offset}`;
  const rows = await db.execute(sql.raw(query));
  return (rows[0] as unknown as FinancialSale[]) || [];
}

export async function getFinancialSummary(startDate?: number, endDate?: number): Promise<{
  totalRevenue: number;
  todayRevenue: number;
  monthRevenue: number;
  netProfit: number;
  pendingValue: number;
  receivedValue: number;
  canceledValue: number;
  avgTicket: number;
  totalSales: number;
  paidSales: number;
  pendingSales: number;
  canceledSales: number;
}> {
  const db = await getDb();
  if (!db) return { totalRevenue: 0, todayRevenue: 0, monthRevenue: 0, netProfit: 0, pendingValue: 0, receivedValue: 0, canceledValue: 0, avgTicket: 0, totalSales: 0, paidSales: 0, pendingSales: 0, canceledSales: 0 };
  const now = Date.now();
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

  const [allRows, todayRows, monthRows] = await Promise.all([
    db.execute(sql.raw(`SELECT status, saleValue, costValue FROM financialSales WHERE 1=1${startDate ? ` AND saleDate >= ${startDate}` : ''}${endDate ? ` AND saleDate <= ${endDate}` : ''}`)),
    db.execute(sql.raw(`SELECT saleValue FROM financialSales WHERE status != 'cancelado' AND saleDate >= ${todayStart.getTime()}`)),
    db.execute(sql.raw(`SELECT saleValue FROM financialSales WHERE status != 'cancelado' AND saleDate >= ${monthStart.getTime()}`)),
  ]);

  const all = (allRows[0] as unknown as Array<{ status: string; saleValue: number; costValue: number }>) || [];
  const today = (todayRows[0] as unknown as Array<{ saleValue: number }>) || [];
  const month = (monthRows[0] as unknown as Array<{ saleValue: number }>) || [];

  const paid = all.filter(r => r.status === 'pago');
  const pending = all.filter(r => r.status === 'pendente');
  const canceled = all.filter(r => r.status === 'cancelado');
  const active = all.filter(r => r.status !== 'cancelado');

  const totalRevenue = active.reduce((a, r) => a + (r.saleValue || 0), 0);
  const receivedValue = paid.reduce((a, r) => a + (r.saleValue || 0), 0);
  const pendingValue = pending.reduce((a, r) => a + (r.saleValue || 0), 0);
  const canceledValue = canceled.reduce((a, r) => a + (r.saleValue || 0), 0);
  const totalCost = active.reduce((a, r) => a + (r.costValue || 0), 0);
  const netProfit = receivedValue - totalCost;
  const todayRevenue = today.reduce((a, r) => a + (r.saleValue || 0), 0);
  const monthRevenue = month.reduce((a, r) => a + (r.saleValue || 0), 0);
  const avgTicket = active.length > 0 ? Math.round(totalRevenue / active.length) : 0;

  return {
    totalRevenue, todayRevenue, monthRevenue, netProfit,
    pendingValue, receivedValue, canceledValue, avgTicket,
    totalSales: all.length,
    paidSales: paid.length,
    pendingSales: pending.length,
    canceledSales: canceled.length,
  };
}

export async function getCashFlow(groupBy: 'day' | 'week' | 'month' | 'year', startDate?: number, endDate?: number): Promise<Array<{ period: string; revenue: number; cost: number; profit: number; count: number }>> {
  const db = await getDb();
  if (!db) return [];
  let dateFormat: string;
  if (groupBy === 'day') dateFormat = '%Y-%m-%d';
  else if (groupBy === 'week') dateFormat = '%Y-%u';
  else if (groupBy === 'month') dateFormat = '%Y-%m';
  else dateFormat = '%Y';

  let query = `SELECT DATE_FORMAT(FROM_UNIXTIME(saleDate/1000), '${dateFormat}') as period, SUM(CASE WHEN status != 'cancelado' THEN saleValue ELSE 0 END) as revenue, SUM(CASE WHEN status != 'cancelado' THEN costValue ELSE 0 END) as cost, COUNT(CASE WHEN status != 'cancelado' THEN 1 END) as count FROM financialSales WHERE 1=1`;
  if (startDate) query += ` AND saleDate >= ${startDate}`;
  if (endDate) query += ` AND saleDate <= ${endDate}`;
  query += ` GROUP BY period ORDER BY period ASC`;

  const rows = await db.execute(sql.raw(query));
  const data = (rows[0] as unknown as Array<{ period: string; revenue: number; cost: number; count: number }>) || [];
  return data.map(r => ({
    period: r.period,
    revenue: r.revenue || 0,
    cost: r.cost || 0,
    profit: (r.revenue || 0) - (r.cost || 0),
    count: r.count || 0,
  }));
}

// ─── Links de Indicação por Cliente ─────────────────────────────────────────

function generateReferralCode(customerName: string): string {
  const namePart = customerName.trim().split(' ')[0].toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  const randomPart = Math.random().toString(36).toUpperCase().slice(2, 6);
  return `${namePart}-${randomPart}`;
}

export async function createReferralLink(data: {
  customerId: number;
  customerName: string;
  commissionValue: number;
  commissionType: 'fixed' | 'percent';
  productId?: number | null;
  productName?: string | null;
}): Promise<ReferralLink> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  // Gerar código único
  let code = generateReferralCode(data.customerName);
  let attempts = 0;
  while (attempts < 10) {
    const existing = await db.select().from(referralLinks).where(eq(referralLinks.code, code)).limit(1);
    if (existing.length === 0) break;
    code = generateReferralCode(data.customerName);
    attempts++;
  }
  await db.insert(referralLinks).values({
    customerId: data.customerId,
    customerName: data.customerName,
    code,
    commissionValue: data.commissionValue,
    commissionType: data.commissionType,
    productId: data.productId ?? null,
    productName: data.productName ?? null,
    usageCount: 0,
    active: 1,
  });
  const result = await db.select().from(referralLinks).where(eq(referralLinks.code, code)).limit(1);
  return result[0];
}

export async function listReferralLinksByCustomer(customerId: number): Promise<ReferralLink[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(referralLinks).where(eq(referralLinks.customerId, customerId));
}

export async function listAllReferralLinks(): Promise<ReferralLink[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(referralLinks);
}

export async function getReferralLinkByCode(code: string): Promise<ReferralLink | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(referralLinks).where(eq(referralLinks.code, code)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function deleteReferralLink(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(referralUsages).where(eq(referralUsages.referralLinkId, id));
  await db.delete(referralLinks).where(eq(referralLinks.id, id));
}

export async function toggleReferralLink(id: number, active: boolean): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(referralLinks).set({ active: active ? 1 : 0 }).where(eq(referralLinks.id, id));
}

export async function recordReferralUsage(data: {
  referralLinkId: number;
  registrationId?: number;
  clientName: string;
  clientPhone: string;
}): Promise<ReferralUsage> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.insert(referralUsages).values({
    referralLinkId: data.referralLinkId,
    registrationId: data.registrationId ?? null,
    clientName: data.clientName,
    clientPhone: data.clientPhone,
    commissionPaid: 0,
  });
  // Incrementar contador de usos
  await db.execute(sql`UPDATE referralLinks SET usageCount = usageCount + 1 WHERE id = ${data.referralLinkId}`);
  const result = await db.select().from(referralUsages)
    .where(eq(referralUsages.referralLinkId, data.referralLinkId))
    .limit(1);
  return result[0];
}

export async function listReferralUsagesByLink(referralLinkId: number): Promise<ReferralUsage[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(referralUsages).where(eq(referralUsages.referralLinkId, referralLinkId));
}

export async function markReferralCommissionPaid(usageId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(referralUsages).set({ commissionPaid: 1 }).where(eq(referralUsages.id, usageId));
}

export async function isPhoneNewCustomer(phone: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return true;
  const phoneDigits = phone.replace(/\D/g, '');
  const result = await db.select().from(customers).where(eq(customers.phone, phoneDigits)).limit(1);
  return result.length === 0;
}

/// ─── Formulário Dinâmico - Tela de Acompanhamento ────────────────────────────
export async function listTrackingQuestions(): Promise<TrackingQuestion[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(trackingQuestions).orderBy(trackingQuestions.sortOrder, trackingQuestions.createdAt);
}

export async function listActiveTrackingQuestions(): Promise<TrackingQuestion[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(trackingQuestions)
    .where(eq(trackingQuestions.isActive, 1))
    .orderBy(trackingQuestions.sortOrder, trackingQuestions.createdAt);
}

export async function createTrackingQuestion(data: { text: string; options: string; showOnce?: number; sortOrder?: number }): Promise<TrackingQuestion> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.insert(trackingQuestions).values({
    text: data.text,
    options: data.options,
    isActive: 1,
    showOnce: data.showOnce ?? 1,
    sortOrder: data.sortOrder ?? 0,
  });
  const result = await db.select().from(trackingQuestions).orderBy(sql`id DESC`).limit(1);
  return result[0];
}

export async function updateTrackingQuestion(id: number, data: { text?: string; options?: string; isActive?: number; showOnce?: number; sortOrder?: number }): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(trackingQuestions).set(data).where(eq(trackingQuestions.id, id));
}

export async function deleteTrackingQuestion(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(trackingAnswers).where(eq(trackingAnswers.questionId, id));
  await db.delete(trackingQuestions).where(eq(trackingQuestions.id, id));
}

export async function toggleTrackingQuestion(id: number, isActive: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(trackingQuestions).set({ isActive }).where(eq(trackingQuestions.id, id));
}

export async function saveTrackingAnswer(data: { orderId: number; customerId?: number; questionId: number; questionText: string; answer: string }): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select().from(trackingAnswers)
    .where(sql`orderId = ${data.orderId} AND questionId = ${data.questionId}`)
    .limit(1);
  if (existing.length > 0) {
    await db.update(trackingAnswers).set({ answer: data.answer, answeredAt: new Date() })
      .where(sql`orderId = ${data.orderId} AND questionId = ${data.questionId}`);
  } else {
    await db.insert(trackingAnswers).values({
      orderId: data.orderId,
      customerId: data.customerId ?? null,
      questionId: data.questionId,
      questionText: data.questionText,
      answer: data.answer,
    });
  }
}

export async function getTrackingAnswersByOrder(orderId: number): Promise<TrackingAnswer[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(trackingAnswers).where(eq(trackingAnswers.orderId, orderId));
}

// ========== TRACKING QUESTION ASSIGNMENTS (envio individual por pedido) ==========

export async function assignTrackingQuestion(data: { orderId: number; questionId: number; questionText: string; questionOptions: string }): Promise<TrackingQuestionAssignment> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  // Evitar duplicata: se já existe para este pedido+pergunta, retornar o existente
  const existing = await db.select().from(trackingQuestionAssignments)
    .where(sql`orderId = ${data.orderId} AND questionId = ${data.questionId}`)
    .limit(1);
  if (existing.length > 0) return existing[0];
  await db.insert(trackingQuestionAssignments).values({
    orderId: data.orderId,
    questionId: data.questionId,
    questionText: data.questionText,
    questionOptions: data.questionOptions,
  });
  const result = await db.select().from(trackingQuestionAssignments)
    .where(sql`orderId = ${data.orderId} AND questionId = ${data.questionId}`)
    .limit(1);
  return result[0];
}

export async function getAssignmentsByOrder(orderId: number): Promise<TrackingQuestionAssignment[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(trackingQuestionAssignments)
    .where(eq(trackingQuestionAssignments.orderId, orderId))
    .orderBy(asc(trackingQuestionAssignments.sentAt));
}

export async function saveAssignmentAnswer(orderId: number, questionId: number, answer: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(trackingQuestionAssignments)
    .set({ answer, answeredAt: new Date() })
    .where(sql`orderId = ${orderId} AND questionId = ${questionId}`);
}

export async function deleteAssignment(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(trackingQuestionAssignments).where(eq(trackingQuestionAssignments.id, id));
}

// ─── Foto Protegida ────────────────────────────────────────────────────────────
export async function getActiveProtectedPhoto(): Promise<ProtectedPhoto | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(protectedPhotos)
    .where(eq(protectedPhotos.isActive, 1))
    .orderBy(asc(protectedPhotos.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function listProtectedPhotos(): Promise<ProtectedPhoto[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(protectedPhotos).orderBy(asc(protectedPhotos.sortOrder), asc(protectedPhotos.createdAt));
}

export async function createProtectedPhoto(data: { title: string; message: string; imageUrl: string; imageKey: string }): Promise<ProtectedPhoto> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  // Calcular próximo sortOrder
  const existing = await db.select().from(protectedPhotos).orderBy(sql`${protectedPhotos.sortOrder} DESC`).limit(1);
  const nextOrder = existing.length > 0 ? (existing[0].sortOrder + 1) : 0;
  await db.insert(protectedPhotos).values({ ...data, isActive: 1, sortOrder: nextOrder });
  const rows = await db.select().from(protectedPhotos)
    .where(eq(protectedPhotos.imageKey, data.imageKey)).limit(1);
  return rows[0];
}

export async function deleteProtectedPhoto(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(protectedPhotos).where(eq(protectedPhotos.id, id));
}

export async function toggleProtectedPhoto(id: number, isActive: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // Permite múltiplas fotos ativas ao mesmo tempo
  await db.update(protectedPhotos).set({ isActive }).where(eq(protectedPhotos.id, id));
}

export async function reorderProtectedPhoto(id: number, direction: 'up' | 'down'): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const all = await db.select().from(protectedPhotos).orderBy(asc(protectedPhotos.sortOrder), asc(protectedPhotos.createdAt));
  const idx = all.findIndex(p => p.id === id);
  if (idx === -1) return;
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= all.length) return;
  const a = all[idx];
  const b = all[swapIdx];
  const aOrder = a.sortOrder;
  const bOrder = b.sortOrder;
  // Se sortOrders iguais, usar índice
  const newAOrder = aOrder === bOrder ? (direction === 'up' ? bOrder - 1 : bOrder + 1) : bOrder;
  const newBOrder = aOrder === bOrder ? (direction === 'up' ? aOrder : aOrder - 1) : aOrder;
  await db.update(protectedPhotos).set({ sortOrder: newAOrder }).where(eq(protectedPhotos.id, a.id));
  await db.update(protectedPhotos).set({ sortOrder: newBOrder }).where(eq(protectedPhotos.id, b.id));
}

export async function isPhoneRegistered(phone: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const phoneDigits = phone.replace(/\D/g, '');
  const rows = await db.execute(sql`SELECT id FROM customers WHERE phone = ${phoneDigits} LIMIT 1`);
  const arr = rows[0] as unknown as Array<{ id: number }>;
  return arr.length > 0;
}

// ========== PHOTO ACCESS LOGS ==========

export async function logPhotoAccess(phone: string, photoId: number, ip?: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const phoneDigits = phone.replace(/\D/g, '');
  await db.insert(photoAccessLogs).values({ phone: phoneDigits, photoId, ip: ip || null });
}

export async function listPhotoAccessLogs(photoId?: number): Promise<PhotoAccessLog[]> {
  const db = await getDb();
  if (!db) return [];
  if (photoId) {
    return await db.select().from(photoAccessLogs)
      .where(eq(photoAccessLogs.photoId, photoId))
      .orderBy(sql`${photoAccessLogs.accessedAt} DESC`);
  }
  return await db.select().from(photoAccessLogs)
    .orderBy(sql`${photoAccessLogs.accessedAt} DESC`);
}

export async function clearPhotoAccessLogs(photoId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(photoAccessLogs).where(eq(photoAccessLogs.photoId, photoId));
}


// ========== ORDER PROGRESS CONFIG ==========

export async function getOrderProgressConfig(registrationId: number, subOrderIndex: number): Promise<OrderProgressConfig[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(orderProgressConfig)
    .where(sql`${orderProgressConfig.registrationId} = ${registrationId} AND ${orderProgressConfig.subOrderIndex} = ${subOrderIndex}`)
    .orderBy(asc(orderProgressConfig.progressOrder));
}

export async function setOrderProgressConfig(registrationId: number, subOrderIndex: number, statusKeys: string[]): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // Apaga configuração anterior e insere a nova
  await db.delete(orderProgressConfig).where(
    sql`${orderProgressConfig.registrationId} = ${registrationId} AND ${orderProgressConfig.subOrderIndex} = ${subOrderIndex}`
  );
  if (statusKeys.length > 0) {
    await db.insert(orderProgressConfig).values(
      statusKeys.map((key, idx) => ({
        registrationId,
        subOrderIndex,
        statusKey: key,
        progressOrder: idx,
      }))
    );
  }
}

// ========== ADMIN LOGIN ATTEMPTS (bloqueio por IP) ==========
export async function getAdminLoginAttempt(ip: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(adminLoginAttempts).where(sql`${adminLoginAttempts.ip} = ${ip}`).limit(1);
  return rows[0] ?? null;
}

export async function recordAdminLoginAttempt(ip: string): Promise<{ attempts: number; blocked: boolean }> {
  const db = await getDb();
  if (!db) return { attempts: 1, blocked: false };
  const existing = await getAdminLoginAttempt(ip);
  if (!existing) {
    await db.insert(adminLoginAttempts).values({ ip, attempts: 1, blocked: 0 });
    return { attempts: 1, blocked: false };
  }
  const newAttempts = existing.attempts + 1;
  const shouldBlock = newAttempts >= 3;
  await db.update(adminLoginAttempts)
    .set({
      attempts: newAttempts,
      blocked: shouldBlock ? 1 : existing.blocked,
      lastAttemptAt: new Date(),
      blockedAt: shouldBlock && !existing.blockedAt ? new Date() : existing.blockedAt,
    })
    .where(sql`${adminLoginAttempts.ip} = ${ip}`);
  return { attempts: newAttempts, blocked: shouldBlock || existing.blocked === 1 };
}

export async function isAdminLoginBlocked(ip: string): Promise<boolean> {
  const row = await getAdminLoginAttempt(ip);
  return row?.blocked === 1;
}

export async function resetAdminLoginAttempts(ip: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(adminLoginAttempts)
    .set({ attempts: 0, blocked: 0, unlockedAt: new Date() })
    .where(sql`${adminLoginAttempts.ip} = ${ip}`);
}

export async function unblockAllAdminIps(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(adminLoginAttempts)
    .set({ attempts: 0, blocked: 0, unlockedAt: new Date() })
    .where(sql`${adminLoginAttempts.blocked} = 1`);
}

export async function listBlockedAdminIps() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(adminLoginAttempts).where(sql`${adminLoginAttempts.blocked} = 1`).orderBy(desc(adminLoginAttempts.blockedAt));
}

// ========== FAQ / CAIXA DE AJUDA ==========

export async function getFaqConfig(): Promise<FaqConfig | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(faqConfig).limit(1);
  return rows.length > 0 ? rows[0] : null;
}

export async function updateFaqConfig(data: Partial<Omit<FaqConfig, 'id' | 'updatedAt'>>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select().from(faqConfig).limit(1);
  if (existing.length === 0) {
    await db.insert(faqConfig).values({
      title: data.title ?? 'Tire suas dúvidas antes de finalizar seu pedido',
      subtitle: data.subtitle ?? null,
      buttonLabel: data.buttonLabel ?? 'Tire suas dúvidas',
      buttonColor: data.buttonColor ?? '#8b5cf6',
      buttonTextColor: data.buttonTextColor ?? '#ffffff',
      headerColor: data.headerColor ?? '#1e1b4b',
      headerTextColor: data.headerTextColor ?? '#ffffff',
      accentColor: data.accentColor ?? '#8b5cf6',
      enabled: data.enabled ?? 1,
    });
  } else {
    await db.update(faqConfig).set(data).where(eq(faqConfig.id, existing[0].id));
  }
}

export async function listFaqItems(): Promise<FaqItem[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(faqItems).orderBy(asc(faqItems.order), asc(faqItems.id));
}

export async function createFaqItem(question: string, answer: string, order?: number): Promise<FaqItem> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const maxOrderRows = await db.execute(sql`SELECT COALESCE(MAX(\`order\`), 0) as maxOrder FROM faqItems`);
  const maxOrder = (maxOrderRows[0] as unknown as Array<{ maxOrder: number }>)[0]?.maxOrder ?? 0;
  await db.insert(faqItems).values({ question, answer, order: order ?? maxOrder + 1, enabled: 1 });
  const rows = await db.select().from(faqItems).orderBy(desc(faqItems.id)).limit(1);
  return rows[0];
}

export async function updateFaqItem(id: number, data: Partial<Pick<FaqItem, 'question' | 'answer' | 'order' | 'enabled'>>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(faqItems).set(data).where(eq(faqItems.id, id));
}

export async function deleteFaqItem(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(faqItems).where(eq(faqItems.id, id));
}

export async function reorderFaqItems(items: { id: number; order: number }[]): Promise<void> {
  const db = await getDb();
  if (!db) return;
  for (const item of items) {
    await db.update(faqItems).set({ order: item.order }).where(eq(faqItems.id, item.id));
  }
}

// ========== SISTEMA DE AGENDAMENTO ==========

// --- Config global (única linha id=1) ---
const DEFAULT_SCHEDULE_CONFIG: ScheduleConfig = {
  id: 1,
  title: "Agende seu atendimento",
  introMessage: "Seu pedido precisa ser agendado. Escolha abaixo a melhor data e horário disponível para o seu atendimento.",
  emailSubject: "Agende seu atendimento - H2 COLOMBIANO",
  emailMessage: "Olá! Seu pedido precisa ser agendado. Clique no link abaixo para escolher a data e o horário do seu atendimento.",
  whatsappMessage: "Olá! Seu pedido na H2 COLOMBIANO precisa ser agendado. Acesse o link para escolher a data e o horário do seu atendimento:",
  scheduledWhatsappMessage: "Olá {nome}! Seu atendimento está confirmado para o dia {data} às {hora}. Fique disponível no WhatsApp nesse horário. Qualquer dúvida, estamos à disposição!",
  confirmationMessage: "Seu atendimento foi agendado com sucesso! Guarde a data e o horário escolhidos. O atendimento será feito pelo WhatsApp nesse horário.",
  noShowWarning: "ATENÇÃO: O atendimento será feito pelo WhatsApp no horário escolhido. Fique disponível no WhatsApp nesse horário. Se você não atender quando for chamado, será necessário reagendar.",
  accentColor: "#8b5cf6",
  updatedAt: new Date(),
};

function getDefaultScheduleConfig(): ScheduleConfig {
  return { ...DEFAULT_SCHEDULE_CONFIG, updatedAt: new Date() };
}

export async function getScheduleConfig(): Promise<ScheduleConfig> {
  const db = await getDb();
  if (!db) return getDefaultScheduleConfig();

  try {
    const rows = await db.select().from(scheduleConfig).where(eq(scheduleConfig.id, 1)).limit(1);
    if (rows.length > 0) return rows[0];

    // Tenta criar a linha padrão, mas nunca bloqueia a página pública se a escrita falhar.
    try {
      await db.insert(scheduleConfig).values({ id: 1 } as any);
      const created = await db.select().from(scheduleConfig).where(eq(scheduleConfig.id, 1)).limit(1);
      return created.length > 0 ? created[0] : getDefaultScheduleConfig();
    } catch (error) {
      console.warn("[ScheduleConfig] Configuração não pôde ser criada; usando defaults em memória:", error);
      return getDefaultScheduleConfig();
    }
  } catch (error) {
    console.warn("[ScheduleConfig] Falha ao carregar configuração; usando defaults em memória:", error);
    return getDefaultScheduleConfig();
  }
}

export async function updateScheduleConfig(data: Partial<{
  title: string; introMessage: string; emailSubject: string; emailMessage: string;
  whatsappMessage: string; scheduledWhatsappMessage: string; confirmationMessage: string; noShowWarning: string; accentColor: string;
}>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await getScheduleConfig(); // garante existência
  await db.update(scheduleConfig).set(data).where(eq(scheduleConfig.id, 1));
}

// --- Modelos pré-feitos (templates) ---
export async function getScheduleTemplateById(id: number): Promise<ScheduleTemplate | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(scheduleTemplates).where(eq(scheduleTemplates.id, id)).limit(1);
  return rows.length > 0 ? rows[0] : null;
}

export async function listScheduleTemplates(onlyActive = false): Promise<ScheduleTemplate[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(scheduleTemplates).orderBy(asc(scheduleTemplates.sortOrder), asc(scheduleTemplates.id));
  return onlyActive ? rows.filter(r => r.isActive === 1) : rows;
}

export async function createScheduleTemplate(data: InsertScheduleTemplate): Promise<ScheduleTemplate> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.insert(scheduleTemplates).values(data);
  const rows = await db.select().from(scheduleTemplates).orderBy(desc(scheduleTemplates.id)).limit(1);
  return rows[0];
}

export async function updateScheduleTemplate(id: number, data: Partial<InsertScheduleTemplate>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(scheduleTemplates).set(data).where(eq(scheduleTemplates.id, id));
}

export async function deleteScheduleTemplate(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(scheduleTemplates).where(eq(scheduleTemplates.id, id));
}

// --- Slots de data/hora ---
export async function listScheduleSlots(): Promise<ScheduleSlot[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(scheduleSlots).orderBy(asc(scheduleSlots.slotDate), asc(scheduleSlots.slotTime));
}

// Slots realmente disponíveis para o cliente escolher:
// status available, ainda não lotados (bookedCount < capacity) e a partir de hoje.
// Se templateId for informado, retorna apenas os horários daquele modelo + os gerais (templateId null).
export async function listAvailableScheduleSlots(templateId?: number | null): Promise<ScheduleSlot[]> {
  const db = await getDb();
  if (!db) return [];
  const now = new Date();
  // Subtract 3 hours to convert from UTC to GMT-3
  const localDate = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const year = localDate.getUTCFullYear();
  const month = String(localDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(localDate.getUTCDate()).padStart(2, '0');
  const today = `${year}-${month}-${day}`; // YYYY-MM-DD (GMT-3)
  const currentHour = localDate.getUTCHours();
  const currentMin = localDate.getUTCMinutes();
  const currentTotalMin = currentHour * 60 + currentMin; // minutos desde meia-noite (GMT-3)

  const rows = await db.select().from(scheduleSlots)
    .where(and(
      eq(scheduleSlots.status, 'available'),
      gte(scheduleSlots.slotDate, today),
    ))
    .orderBy(asc(scheduleSlots.slotDate), asc(scheduleSlots.slotTime));
  return rows.filter(r => {
    if (r.bookedCount >= r.capacity) return false;
    // Excluir datas passadas que escaparam da query
    if (r.slotDate < today) return false;
    // Para hoje: excluir horários que já passaram (sem grace period)
    if (r.slotDate === today) {
      const timeParts = r.slotTime.split(':').map(Number);
      const slotHour = timeParts[0] ?? 0;
      const slotMin = timeParts[1] ?? 0;
      const slotTotalMin = slotHour * 60 + slotMin;
      if (slotTotalMin <= currentTotalMin) return false;
    }
    if (templateId === undefined || templateId === null) return true;
    // mostra horários do modelo específico e também os "gerais" (sem modelo)
    return r.templateId === templateId || r.templateId === null;
  });
}

// Cria múltiplos slots de uma vez (datas x horários) para um modelo específico (templateId).
// Ignora duplicados (mesma data+hora dentro do MESMO modelo).
export async function createScheduleSlots(slots: { slotDate: string; slotTime: string; capacity?: number }[], templateId?: number | null): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  if (slots.length === 0) return 0;
  const tid = templateId ?? null;
  // buscar existentes para evitar duplicar (chave = modelo + data + hora)
  const existing = await db.select().from(scheduleSlots);
  const existingKeys = new Set(existing.map(s => `${s.templateId ?? 'g'}_${s.slotDate}_${s.slotTime}`));
  const toInsert = slots.filter(s => !existingKeys.has(`${tid ?? 'g'}_${s.slotDate}_${s.slotTime}`))
    .map(s => ({ slotDate: s.slotDate, slotTime: s.slotTime, capacity: s.capacity ?? 1, templateId: tid }));
  if (toInsert.length === 0) return 0;
  await db.insert(scheduleSlots).values(toInsert);
  return toInsert.length;
}

// Altera o modelo (templateId) de um horário existente.
export async function setScheduleSlotTemplate(id: number, templateId: number | null): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(scheduleSlots).set({ templateId }).where(eq(scheduleSlots.id, id));
}

export async function deleteScheduleSlot(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(scheduleSlots).where(eq(scheduleSlots.id, id));
}

export async function toggleScheduleSlot(id: number, status: 'available' | 'disabled'): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(scheduleSlots).set({ status }).where(eq(scheduleSlots.id, id));
}

// Remove todos os slots já passados (data anterior a hoje)
export async function cleanupOldScheduleSlots(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const today = new Date().toISOString().slice(0, 10);
  await db.delete(scheduleSlots).where(sql`${scheduleSlots.slotDate} < ${today}`);
}

// --- Agendamentos por pedido ---
export async function getAppointmentByOrder(registrationId: number, subOrderIndex: number): Promise<ScheduleAppointment | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(scheduleAppointments)
    .where(and(eq(scheduleAppointments.registrationId, registrationId), eq(scheduleAppointments.subOrderIndex, subOrderIndex)))
    .orderBy(desc(scheduleAppointments.id)).limit(1);
  return rows.length > 0 ? rows[0] : null;
}

// Lista agendamentos pelo TELEFONE do cliente (chave confiável na página de acompanhamento).
// Compara apenas os dígitos do telefone para evitar divergências de formatação.
export async function listAppointmentsByPhone(phone: string): Promise<ScheduleAppointment[]> {
  const db = await getDb();
  if (!db) return [];
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.length < 8) return [];
  // Últimos 11 dígitos (ignora prefixo 55 se houver) para casar melhor
  const tail = digits.slice(-11);
  const all = await db.select().from(scheduleAppointments).orderBy(desc(scheduleAppointments.id));
  return all.filter(a => {
    const ad = (a.customerPhone || "").replace(/\D/g, "");
    return ad.endsWith(tail) || tail.endsWith(ad.slice(-11));
  });
}

// Lista todos os agendamentos (de todos os sub-pedidos) de um pedido
export async function listAppointmentsByRegistration(registrationId: number): Promise<ScheduleAppointment[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(scheduleAppointments)
    .where(eq(scheduleAppointments.registrationId, registrationId))
    .orderBy(asc(scheduleAppointments.subOrderIndex), desc(scheduleAppointments.id));
}

export async function getAppointmentByToken(token: string): Promise<ScheduleAppointment | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(scheduleAppointments).where(eq(scheduleAppointments.token, token)).limit(1);
  return rows.length > 0 ? rows[0] : null;
}

export async function getAppointmentById(id: number): Promise<ScheduleAppointment | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(scheduleAppointments).where(eq(scheduleAppointments.id, id)).limit(1);
  return rows.length > 0 ? rows[0] : null;
}

// Cria (ou recria) o agendamento de um pedido. Gera token novo.
export async function createAppointment(data: {
  token: string; registrationId: number; subOrderIndex: number; customerPhone: string;
  customerName?: string | null; customerEmail?: string | null; serviceName?: string | null; instructions?: string | null;
  templateId?: number | null; customerPhotoUrl?: string | null;
}): Promise<ScheduleAppointment> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.insert(scheduleAppointments).values({
    token: data.token,
    registrationId: data.registrationId,
    subOrderIndex: data.subOrderIndex,
    customerPhone: data.customerPhone,
    customerName: data.customerName ?? null,
    customerEmail: data.customerEmail ?? null,
    serviceName: data.serviceName ?? null,
    instructions: data.instructions ?? null,
    templateId: data.templateId ?? null,
    customerPhotoUrl: data.customerPhotoUrl ?? null,
    status: 'pending',
  });
  const rows = await db.select().from(scheduleAppointments).where(eq(scheduleAppointments.token, data.token)).limit(1);
  return rows[0];
}

export async function markAppointmentEmailSent(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(scheduleAppointments).set({ sentByEmail: 1 }).where(eq(scheduleAppointments.id, id));
}

export async function cancelAppointment(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const rows = await db.select().from(scheduleAppointments).where(eq(scheduleAppointments.id, id)).limit(1);
  if (rows.length === 0) return;
  const appt = rows[0];
  // liberar o slot se estava confirmado
  if (appt.status === 'confirmed' && appt.slotId) {
    await db.update(scheduleSlots)
      .set({ bookedCount: sql`GREATEST(${scheduleSlots.bookedCount} - 1, 0)` })
      .where(eq(scheduleSlots.id, appt.slotId));
  }
  await db.update(scheduleAppointments).set({ status: 'cancelled', slotId: null, slotDate: null, slotTime: null }).where(eq(scheduleAppointments.id, id));
}

// Exclui DEFINITIVAMENTE um agendamento da lista. Libera o slot se estava confirmado.
export async function deleteAppointment(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const rows = await db.select().from(scheduleAppointments).where(eq(scheduleAppointments.id, id)).limit(1);
  if (rows.length === 0) return;
  const appt = rows[0];
  if (appt.status === 'confirmed' && appt.slotId) {
    await db.update(scheduleSlots)
      .set({ bookedCount: sql`GREATEST(${scheduleSlots.bookedCount} - 1, 0)` })
      .where(eq(scheduleSlots.id, appt.slotId));
  }
  await db.delete(scheduleAppointments).where(eq(scheduleAppointments.id, id));
}

// Permite reabrir um agendamento para o cliente reescolher (reagendar):
// libera o slot atual e volta status para 'pending'.
export async function reopenAppointment(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const rows = await db.select().from(scheduleAppointments).where(eq(scheduleAppointments.id, id)).limit(1);
  if (rows.length === 0) return;
  const appt = rows[0];
  if (appt.slotId) {
    await db.update(scheduleSlots)
      .set({ bookedCount: sql`GREATEST(${scheduleSlots.bookedCount} - 1, 0)` })
      .where(eq(scheduleSlots.id, appt.slotId));
  }
  await db.update(scheduleAppointments).set({ status: 'pending', slotId: null, slotDate: null, slotTime: null, confirmedAt: null }).where(eq(scheduleAppointments.id, id));
}

export async function completeAppointment(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const rows = await db.select().from(scheduleAppointments).where(eq(scheduleAppointments.id, id)).limit(1);
  if (rows.length === 0) return;
  const appt = rows[0];
  // liberar o slot se estava confirmado
  if (appt.status === 'confirmed' && appt.slotId) {
    await db.update(scheduleSlots)
      .set({ bookedCount: sql`GREATEST(${scheduleSlots.bookedCount} - 1, 0)` })
      .where(eq(scheduleSlots.id, appt.slotId));
  }
  await db.update(scheduleAppointments).set({ status: 'completed', slotId: null, slotDate: null, slotTime: null }).where(eq(scheduleAppointments.id, id));
}

/**
 * Encerra apenas agendamentos ainda confirmados para o pedido/subpedido informado.
 * É idempotente: agendamentos cancelados, pendentes ou já concluídos são preservados.
 */
export async function completeConfirmedAppointmentsForOrder(registrationId: number, subOrderIndex: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const appointments = await db.select()
    .from(scheduleAppointments)
    .where(and(
      eq(scheduleAppointments.registrationId, registrationId),
      eq(scheduleAppointments.subOrderIndex, subOrderIndex),
      eq(scheduleAppointments.status, 'confirmed'),
    ));

  for (const appointment of appointments) {
    await completeAppointment(appointment.id);
  }
  return appointments.length;
}

// CONFIRMAÇÃO ATÔMICA: reserva o slot de forma exclusiva.
// Usa UPDATE condicional (bookedCount < capacity) para garantir que dois clientes
// não peguem o mesmo slot simultaneamente.
export async function confirmAppointment(token: string, slotId: number): Promise<{ ok: boolean; reason?: string; appointment?: ScheduleAppointment }> {
  const db = await getDb();
  if (!db) return { ok: false, reason: 'Banco de dados indisponível' };

  const apptRows = await db.select().from(scheduleAppointments).where(eq(scheduleAppointments.token, token)).limit(1);
  if (apptRows.length === 0) return { ok: false, reason: 'Agendamento não encontrado' };
  const appt = apptRows[0];
  if (appt.status === 'cancelled') return { ok: false, reason: 'Este agendamento foi cancelado' };
  if (appt.status === 'confirmed') return { ok: false, reason: 'Este pedido já possui um horário agendado' };

  const slotRows = await db.select().from(scheduleSlots).where(eq(scheduleSlots.id, slotId)).limit(1);
  if (slotRows.length === 0) return { ok: false, reason: 'Horário não encontrado' };
  const slot = slotRows[0];
  if (slot.status !== 'available') return { ok: false, reason: 'Este horário não está mais disponível' };

  // Reserva atômica: só incrementa se ainda houver vaga
  const result: any = await db.update(scheduleSlots)
    .set({ bookedCount: sql`${scheduleSlots.bookedCount} + 1` })
    .where(and(eq(scheduleSlots.id, slotId), sql`${scheduleSlots.bookedCount} < ${scheduleSlots.capacity}`));
  const affected = result?.[0]?.affectedRows ?? result?.affectedRows ?? result?.rowsAffected ?? 0;
  if (!affected) {
    return { ok: false, reason: 'Este horário acabou de ser preenchido. Por favor, escolha outro.' };
  }

  await db.update(scheduleAppointments).set({
    slotId,
    slotDate: slot.slotDate,
    slotTime: slot.slotTime,
    status: 'confirmed',
    confirmedAt: new Date(),
  }).where(eq(scheduleAppointments.id, appt.id));

  const updated = await db.select().from(scheduleAppointments).where(eq(scheduleAppointments.id, appt.id)).limit(1);
  return { ok: true, appointment: updated[0] };
}

// Lista todos os agendamentos (para o admin acompanhar)
export async function listAppointments(): Promise<(ScheduleAppointment & { customerNumber?: number | null; orderStatusKey?: string | null; orderStatusLabel?: string | null })[]> {
  const db = await getDb();
  if (!db) return [];
  const { getTableColumns } = await import('drizzle-orm');
  const apptCols = getTableColumns(scheduleAppointments);
  const rows = await db
    .select({
      ...apptCols,
      customerNumber: customers.customerNumber,
    })
    .from(scheduleAppointments)
    .leftJoin(accessCodePhones, eq(accessCodePhones.id, scheduleAppointments.registrationId))
    .leftJoin(customers, eq(customers.phone, accessCodePhones.phone))
    .orderBy(desc(scheduleAppointments.id));
  const all = rows as unknown as (ScheduleAppointment & { customerNumber?: number | null; orderStatusKey?: string | null; orderStatusLabel?: string | null })[];
  // Deduplicar: manter apenas o registro mais recente por (registrationId, subOrderIndex)
  // Registros antigos/cancelados de reagendamentos anteriores não devem aparecer na lista
  const seen = new Map<string, typeof all[0]>();
  for (const row of all) {
    const key = `${row.registrationId}-${row.subOrderIndex}`;
    if (!seen.has(key)) {
      seen.set(key, row);
    }
  }
  const result = Array.from(seen.values());
  // Enriquecer com o status mais recente do pedido (via registrationId)
  if (result.length > 0) {
    try {
      const allRegIds = result.map(r => r.registrationId).filter((id): id is number => !!id);
      const regIds: number[] = allRegIds.filter((id, idx) => allRegIds.indexOf(id) === idx);
      if (regIds.length > 0) {
        const statusRows = await db.execute(`
          SELECT osh.registrationId, osh.status, ost.label
          FROM orderStatusHistory osh
          LEFT JOIN orderStatusTypes ost ON ost.\`key\` = osh.status AND ost.isActive = 1
          INNER JOIN (
            SELECT registrationId, MAX(createdAt) AS maxCreatedAt
            FROM orderStatusHistory
            WHERE registrationId IN (${regIds.join(',')})
            GROUP BY registrationId
          ) latest ON osh.registrationId = latest.registrationId AND osh.createdAt = latest.maxCreatedAt
        `);
        const statusMap = new Map<number, { key: string; label: string }>();
        for (const row of ((statusRows as any)?.[0] || statusRows) as any[]) {
          if (row && row.registrationId) {
            statusMap.set(Number(row.registrationId), {
              key: String(row.status || ''),
              label: row.label ? String(row.label) : String(row.status || ''),
            });
          }
        }
        for (const appt of result) {
          const s = statusMap.get(appt.registrationId);
          if (s) {
            appt.orderStatusKey = s.key;
            appt.orderStatusLabel = s.label;
          }
        }
      }
    } catch (e) {
      console.error('[listAppointments] Erro ao buscar status dos pedidos:', e);
    }
    // Enriquecer serviceName/serviceOption do orderStatusHistory
    // Muitos agendamentos antigos têm serviceName preenchido com nomes de STATUS (ex: "FOTO DE PERFIL LIBERADO")
    // em vez do nome real do produto (ex: "UBER APP"). Precisamos buscar o nome correto para todos esses casos.
    const STATUS_NAMES_NOT_PRODUCTS = [
      'FOTO DE PERFIL LIBERADO',
      'LIBERADO PARA FOTO / PERFIL',
      'LIBERADO PARA FOTO',
      'PERFIL LIBERADO',
      'FOTO LIBERADA',
      'AGENDAMENTO PARA PEGAR O LOGIN',
    ];
    const isInvalidServiceName = (name: string | null | undefined) =>
      !name || STATUS_NAMES_NOT_PRODUCTS.includes(name.trim().toUpperCase());
    try {
      const needsServiceIds = result
        .filter(r => r.registrationId && isInvalidServiceName(r.serviceName))
        .map(r => r.registrationId)
        .filter((id, idx, arr) => arr.indexOf(id) === idx);
      if (needsServiceIds.length > 0) {
        // Busca o PRIMEIRO registro do orderStatusHistory por registrationId
        // O primeiro registro sempre tem o serviceName correto (ex: "UBER APP", "UBER TAXI", "UBER CARRO")
        const svcRows = await db.execute(`
          SELECT osh.registrationId, osh.serviceName, osh.serviceOption
          FROM orderStatusHistory osh
          INNER JOIN (
            SELECT registrationId, MIN(id) AS minId
            FROM orderStatusHistory
            WHERE registrationId IN (${needsServiceIds.join(',')})
            GROUP BY registrationId
          ) first ON osh.id = first.minId
        `);
        const svcMap = new Map<number, { serviceName: string; serviceOption: string | null }>();
        for (const row of ((svcRows as any)?.[0] || svcRows) as any[]) {
          if (row && row.registrationId && row.serviceName) {
            svcMap.set(Number(row.registrationId), {
              serviceName: String(row.serviceName),
              serviceOption: row.serviceOption ? String(row.serviceOption) : null,
            });
          }
        }
        for (const appt of result) {
          if (isInvalidServiceName(appt.serviceName)) {
            const svc = svcMap.get(appt.registrationId);
            if (svc) {
              appt.serviceName = svc.serviceName;
              (appt as any).serviceOption = svc.serviceOption;
            }
          }
        }
      }
    } catch (e) {
      console.error('[listAppointments] Erro ao enriquecer serviceName:', e);
    }
  }
  return result;
}

// Agendamento manual pelo admin: define data e hora diretamente, sem precisar de slot
export async function manualConfirmAppointment(id: number, slotDate: string, slotTime: string): Promise<ScheduleAppointment | null> {
  const db = await getDb();
  if (!db) return null;
  await db.update(scheduleAppointments).set({
    slotDate,
    slotTime,
    slotId: null,
    status: 'confirmed',
    confirmedAt: new Date(),
  }).where(eq(scheduleAppointments.id, id));
  const rows = await db.select().from(scheduleAppointments).where(eq(scheduleAppointments.id, id)).limit(1);
  return rows.length > 0 ? rows[0] : null;
}

// ─── MARCAÇÃO "EM ATENDIMENTO" ────────────────────────────────────────────────

export async function markAttention(registrationId: number, adminName: string, durationMinutes = 30): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // Remove marcação anterior para este pedido
  await db.delete(orderAttention).where(eq(orderAttention.registrationId, registrationId));
  const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);
  await db.insert(orderAttention).values({ registrationId, adminName, expiresAt });
}

export async function clearAttention(registrationId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(orderAttention).where(eq(orderAttention.registrationId, registrationId));
}

export async function listAttentions(): Promise<{ registrationId: number; adminName: string; startedAt: Date; expiresAt: Date }[]> {
  const db = await getDb();
  if (!db) return [];
  const now = new Date();
  // Limpa expirados automaticamente e retorna os ativos
  await db.delete(orderAttention).where(sql`${orderAttention.expiresAt} < ${now}`);
  return await db.select().from(orderAttention);
}

// ─── ETAPAS INTERNAS ─────────────────────────────────────────────────────────
export async function listInternalStages(): Promise<InternalStage[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(internalStages).where(eq(internalStages.isActive, 1)).orderBy(asc(internalStages.sortOrder));
}

export async function createInternalStage(data: { name: string; icon: string; color: string; sortOrder?: number }): Promise<InternalStage> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const maxOrder = await db.select({ max: sql<number>`MAX(sortOrder)` }).from(internalStages);
  const nextOrder = (maxOrder[0]?.max ?? 0) + 1;
  await db.insert(internalStages).values({ name: data.name, icon: data.icon, color: data.color, sortOrder: data.sortOrder ?? nextOrder, isActive: 1 });
  const rows = await db.select().from(internalStages).orderBy(desc(internalStages.id)).limit(1);
  return rows[0];
}

export async function updateInternalStage(id: number, data: Partial<{ name: string; icon: string; color: string; sortOrder: number }>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(internalStages).set({ ...data, updatedAt: new Date() }).where(eq(internalStages.id, id));
}

export async function deleteInternalStage(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(internalStages).set({ isActive: 0, updatedAt: new Date() }).where(eq(internalStages.id, id));
}

export async function reorderInternalStages(items: { id: number; sortOrder: number }[]): Promise<void> {
  const db = await getDb();
  if (!db) return;
  for (const item of items) {
    await db.update(internalStages).set({ sortOrder: item.sortOrder, updatedAt: new Date() }).where(eq(internalStages.id, item.id));
  }
}

export async function setOrderStage(registrationId: number, stageId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(orderStageHistory).values({ registrationId, stageId, setAt: new Date() });
}

export async function getOrderCurrentStage(registrationId: number): Promise<(OrderStageHistory & { stage?: InternalStage }) | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(orderStageHistory)
    .where(eq(orderStageHistory.registrationId, registrationId))
    .orderBy(desc(orderStageHistory.setAt))
    .limit(1);
  if (rows.length === 0) return null;
  const entry = rows[0];
  const stageRows = await db.select().from(internalStages).where(eq(internalStages.id, entry.stageId)).limit(1);
  return { ...entry, stage: stageRows[0] };
}

export async function getOrderCurrentStagesBatch(registrationIds: number[]): Promise<Map<number, { stageId: number; stageName: string; stageIcon: string; stageColor: string; setAt: Date }>> {
  const db = await getDb();
  const result = new Map<number, { stageId: number; stageName: string; stageIcon: string; stageColor: string; setAt: Date }>();
  if (!db || registrationIds.length === 0) return result;
  // Para cada pedido, pegar a etapa mais recente
  const rows = await db.execute(sql`
    SELECT osh.registrationId, osh.stageId, osh.setAt, s.name as stageName, s.icon as stageIcon, s.color as stageColor
    FROM orderStageHistory osh
    INNER JOIN internalStages s ON s.id = osh.stageId
    WHERE osh.registrationId IN (${sql.join(registrationIds.map(id => sql`${id}`), sql`, `)})
    AND osh.id = (
      SELECT MAX(id) FROM orderStageHistory WHERE registrationId = osh.registrationId
    )
  `);
  const data = (rows[0] as unknown as Array<{ registrationId: number; stageId: number; stageName: string; stageIcon: string; stageColor: string; setAt: Date }>);
  for (const row of data) {
    result.set(row.registrationId, { stageId: row.stageId, stageName: row.stageName, stageIcon: row.stageIcon, stageColor: row.stageColor, setAt: row.setAt });
  }
  return result;
}

// ─── Viewed Orders (pedidos confirmados pelo admin) ───────────────────────────
export async function getViewedOrderKeys(): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.execute(sql`SELECT order_key FROM viewed_orders`);
  const data = (rows[0] as unknown as Array<{ order_key: string }>);
  return data.map(r => r.order_key);
}

export async function markOrderAsViewed(orderKey: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.execute(sql`INSERT IGNORE INTO viewed_orders (order_key) VALUES (${orderKey})`);
}

// ===== Botões extras da tela inicial (homeButtons) =====
export type HomeButtonData = {
  text: string; subtitle?: string; url: string; waMsg?: string | null; icon?: string;
  color?: string; textColor?: string; subColor?: string; font?: string; hover?: string;
  linkType?: string; openInNewTab?: number; vipOnly?: number;
  isActive?: number; sortOrder?: number;
};

export async function listHomeButtons(): Promise<HomeButton[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(homeButtons).orderBy(asc(homeButtons.sortOrder), asc(homeButtons.id));
}

export async function listActiveHomeButtons(): Promise<HomeButton[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(homeButtons).where(eq(homeButtons.isActive, 1)).orderBy(asc(homeButtons.sortOrder), asc(homeButtons.id));
}

export async function createHomeButton(data: HomeButtonData): Promise<HomeButton> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const rows = await db.select().from(homeButtons);
  const maxSort = rows.reduce((m, r) => Math.max(m, r.sortOrder), 0);
  await db.insert(homeButtons).values({
    text: data.text || 'NOVO BOTÃO',
    subtitle: data.subtitle ?? '',
    url: data.url || '/sorteio',
    waMsg: data.waMsg ?? null,
    icon: data.icon || 'gift',
    color: data.color || '#7c3aed',
    textColor: data.textColor || '#ffffff',
    subColor: data.subColor || 'rgba(255,255,255,0.7)',
    font: data.font ?? '',
    hover: data.hover || 'scale',
    linkType: data.linkType || 'custom',
    openInNewTab: data.openInNewTab ?? 0,
    vipOnly: data.vipOnly ?? 0,
    isActive: data.isActive ?? 1,
    sortOrder: data.sortOrder ?? (maxSort + 1),
  });
  const result = await db.select().from(homeButtons).orderBy(desc(homeButtons.id)).limit(1);
  return result[0];
}

export async function updateHomeButton(id: number, data: Partial<HomeButtonData>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(homeButtons).set(data).where(eq(homeButtons.id, id));
}

export async function deleteHomeButton(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(homeButtons).where(eq(homeButtons.id, id));
}

export async function reorderHomeButtons(ids: number[]): Promise<void> {
  const db = await getDb();
  if (!db) return;
  for (let i = 0; i < ids.length; i++) {
    await db.update(homeButtons).set({ sortOrder: i + 1 }).where(eq(homeButtons.id, ids[i]));
  }
}


// ===== REFERRER BYPASS CODES =====
export async function generateBypassCode(adminId: number, expiresAt?: Date): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  // Gerar código aleatório de 8 caracteres
  const code = Math.random().toString(36).substring(2, 10).toUpperCase();
  
  await db.insert(referrerBypassCodes).values({
    code,
    createdBy: adminId,
    expiresAt: expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 dias por padrão
  });
  
  return code;
}

export async function validateBypassCode(code: string): Promise<{ valid: boolean; message: string }> {
  const db = await getDb();
  if (!db) return { valid: false, message: 'Database not available' };
  
  const result = await db.select().from(referrerBypassCodes).where(eq(referrerBypassCodes.code, code)).limit(1);
  const bypassCode = result[0];
  
  if (!bypassCode) {
    return { valid: false, message: 'Código inválido' };
  }
  
  if (bypassCode.status !== 'active') {
    return { valid: false, message: 'Código já foi utilizado ou desativado' };
  }
  
  if (bypassCode.expiresAt && bypassCode.expiresAt < new Date()) {
    return { valid: false, message: 'Código expirado' };
  }
  
  return { valid: true, message: 'Código válido' };
}

export async function useBypassCode(code: string, phone: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  
  const validation = await validateBypassCode(code);
  if (!validation.valid) return false;
  
  await db.update(referrerBypassCodes)
    .set({
      status: 'used',
      usedBy: phone,
      usedAt: new Date(),
    })
    .where(eq(referrerBypassCodes.code, code));
  
  return true;
}

export async function getBypassCodes(): Promise<ReferrerBypassCode[]> {
  const db = await getDb();
  if (!db) return [];
  
  return await db.select().from(referrerBypassCodes).orderBy(desc(referrerBypassCodes.createdAt));
}

export async function deleteBypassCode(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  
  await db.delete(referrerBypassCodes).where(eq(referrerBypassCodes.id, id));
}

export async function validateReferrer(phone: string): Promise<{ valid: boolean; name?: string }> {
  const db = await getDb();
  if (!db) return { valid: false };
  
  const result = await db.select().from(customers).where(eq(customers.phone, phone)).limit(1);
  const referrer = result[0];
  
  if (!referrer) {
    return { valid: false };
  }
  
  return { valid: true, name: referrer.name };
}


/// ─── Rastreamento de Indicações ────────────────────────────
export async function getReferralStats(referrerPhone: string): Promise<ReferralStats | null> {
  const db = await getDb();
  if (!db) return null;
  const phoneDigits = referrerPhone.replace(/\D/g, '');
  const result = await db.select().from(referralStats)
    .where(eq(referralStats.referrerPhone, phoneDigits))
    .limit(1);
  if (result.length > 0) return result[0];
  // Fallback: contar indicações direto da tabela customers
  const countRows = await db.execute(
    sql`SELECT COUNT(*) as cnt FROM customers
        WHERE REGEXP_REPLACE(referredByPhone, '[^0-9]', '') = ${phoneDigits}
          AND referredBy IS NOT NULL AND referredBy != ''`
  ) as any;
  const cntRow = (Array.isArray(countRows[0]) ? countRows[0][0] : countRows[0]) as any;
  const cnt = Number(cntRow?.cnt ?? 0);
  if (cnt === 0) return null;
  // Buscar nome do indicador
  const nameRows = await db.execute(
    sql`SELECT name FROM customers WHERE REGEXP_REPLACE(phone, '[^0-9]', '') = ${phoneDigits} LIMIT 1`
  ) as any;
  const nameRow = (Array.isArray(nameRows[0]) ? nameRows[0][0] : nameRows[0]) as any;
  const referrerName = nameRow?.name ?? '';
  // Criar entrada no referralStats para futuras consultas
  try {
    await db.insert(referralStats).values({
      referrerPhone: phoneDigits,
      referrerName,
      totalReferred: cnt,
      lastReferralAt: new Date(),
    });
    const created = await db.select().from(referralStats)
      .where(eq(referralStats.referrerPhone, phoneDigits)).limit(1);
    if (created.length > 0) return created[0];
  } catch (_) { /* ignora duplicata */ }
  return {
    id: 0,
    referrerPhone: phoneDigits,
    referrerName,
    totalReferred: cnt,
    lastReferralAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any;
}

export async function listAllReferralStats(): Promise<ReferralStats[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(referralStats)
    .orderBy(sql`${referralStats.totalReferred} DESC`);
}

export async function recordReferral(data: {
  referrerPhone: string;
  referrerName: string;
  referredCustomerId: number;
  referredPhone: string;
  referredName: string;
  orderId?: number;
}): Promise<ReferralHistory> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  const phoneDigits = data.referrerPhone.replace(/\D/g, '');
  
  // Registrar no histórico
  await db.insert(referralHistory).values({
    referrerPhone: phoneDigits,
    referrerName: data.referrerName,
    referredCustomerId: data.referredCustomerId,
    referredPhone: data.referredPhone.replace(/\D/g, ''),
    referredName: data.referredName,
    orderId: data.orderId ?? null,
    // O cadastro apenas registra a origem. A comissão só é qualificada no primeiro pedido elegível.
    status: 'pending',
  });
  
  // Atualizar ou criar stats
  const existing = await db.select().from(referralStats)
    .where(eq(referralStats.referrerPhone, phoneDigits))
    .limit(1);
  
  if (existing.length > 0) {
    await db.update(referralStats)
      .set({
        totalReferred: existing[0].totalReferred + 1,
        lastReferralAt: new Date(),
      })
      .where(eq(referralStats.referrerPhone, phoneDigits));
  } else {
    await db.insert(referralStats).values({
      referrerPhone: phoneDigits,
      referrerName: data.referrerName,
      totalReferred: 1,
      lastReferralAt: new Date(),
    });
  }
  
  const result = await db.select().from(referralHistory)
    .orderBy(sql`${referralHistory.id} DESC`)
    .limit(1);
  return result[0];
}

export async function getReferralHistory(referrerPhone: string): Promise<ReferralHistory[]> {
  const db = await getDb();
  if (!db) return [];
  const phoneDigits = referrerPhone.replace(/\D/g, '');
  return await db.select().from(referralHistory)
    .where(eq(referralHistory.referrerPhone, phoneDigits))
    .orderBy(sql`${referralHistory.createdAt} DESC`);
}

export async function getReferralChain(referrerPhone: string, depth: number = 5): Promise<Array<{
  level: number;
  phone: string;
  name: string;
  totalReferred: number;
  profilePhotoUrl?: string | null;
}>> {
  const db = await getDb();
  if (!db) return [];
  
  const phoneDigits = referrerPhone.replace(/\D/g, '');
  const chain: Array<{
    level: number;
    phone: string;
    name: string;
    totalReferred: number;
    profilePhotoUrl?: string | null;
  }> = [];
  
  let currentPhone = phoneDigits;
  let level = 0;
  const visited = new Set<string>();
  
  while (level < depth && !visited.has(currentPhone)) {
    visited.add(currentPhone);
    
    // Buscar stats do indicador
    const stats = await db.select().from(referralStats)
      .where(eq(referralStats.referrerPhone, currentPhone))
      .limit(1);
    
    if (stats.length === 0) break;
    
    // Buscar dados completos do cliente
    const customer = await db.select().from(customers)
      .where(eq(customers.phone, currentPhone))
      .limit(1);
    
    chain.push({
      level,
      phone: currentPhone,
      name: stats[0].referrerName || 'Desconhecido',
      totalReferred: stats[0].totalReferred,
      profilePhotoUrl: customer[0]?.profilePhotoUrl,
    });
    
    // Buscar quem indicou este cliente
    const referrer = await db.select().from(customers)
      .where(eq(customers.phone, currentPhone))
      .limit(1);
    
    if (!referrer[0]?.referredByPhone) break;
    
    currentPhone = referrer[0].referredByPhone.replace(/\D/g, '');
    level++;
  }
  
  return chain;
}

export async function getIndicatedByReferrer(referrerPhone: string): Promise<Array<{
  customerId: number;
  name: string;
  phone: string;
  profilePhotoUrl?: string | null;
  createdAt: Date;
  orderStatus?: string | null;
}>> {
  const db = await getDb();
  if (!db) return [];
  
  const phoneDigits = referrerPhone.replace(/\D/g, '');
  
  // Buscar registros de referralHistory
  const referrals = await db.select({
    referredPhone: referralHistory.referredPhone,
    createdAt: referralHistory.createdAt,
  })
    .from(referralHistory)
    .where(eq(referralHistory.referrerPhone, phoneDigits))
    .orderBy(sql`${referralHistory.createdAt} DESC`);
  
  if (referrals.length === 0) return [];
  
  // Buscar dados dos clientes indicados
  const results = [];
  for (const referral of referrals) {
    // Remover formatação do telefone para comparação
    const cleanPhone = referral.referredPhone.replace(/\D/g, '');
    
    // Buscar cliente com esse telefone (sem formatação)
    const customer = await db.select({
      customerId: customers.id,
      name: customers.name,
      phone: customers.phone,
      profilePhotoUrl: customers.profilePhotoUrl,
    })
      .from(customers)
      .where(sql`REPLACE(REPLACE(REPLACE(REPLACE(${customers.phone}, '(', ''), ')', ''), ' ', ''), '-', '') = ${cleanPhone}`)
      .limit(1);
    
    if (customer.length > 0) {
      results.push({
        customerId: customer[0].customerId,
        name: customer[0].name,
        phone: customer[0].phone,
        profilePhotoUrl: customer[0].profilePhotoUrl || null,
        createdAt: referral.createdAt,
        orderStatus: null,
      });
    }
  }
  
  return results;
}


export async function createReferralReport(data: {
  reporterPhone: string;
  reportedCustomerId: number;
  reportedPhone: string;
  reportedName: string;
  reason: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  return await db.insert(referralReports).values({
    reporterPhone: data.reporterPhone,
    reportedCustomerId: data.reportedCustomerId,
    reportedPhone: data.reportedPhone,
    reportedName: data.reportedName,
    reason: data.reason,
    status: "pending",
  });
}


export async function deleteReferralHistory(referredCustomerId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  return await db.delete(referralHistory).where(eq(referralHistory.referredCustomerId, referredCustomerId));
}


// ========== SPREADSHEET EARNINGS ==========

export async function upsertEarning(data: InsertSpreadsheetEarning) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const existing = await db.select().from(spreadsheetEarnings).where(and(eq(spreadsheetEarnings.userId, data.userId), eq(spreadsheetEarnings.date, data.date))).limit(1);
  if (existing.length > 0) {
    return await db.update(spreadsheetEarnings).set(data).where(and(eq(spreadsheetEarnings.userId, data.userId), eq(spreadsheetEarnings.date, data.date)));
  }
  return await db.insert(spreadsheetEarnings).values(data);
}

export async function createEarning(data: InsertSpreadsheetEarning) {
  // Sempre cria um novo registro: permite multiplos lancamentos na mesma data
  // e mesma categoria (ex.: 7 + 10 aparecem separados e somam no total).
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  return await db.insert(spreadsheetEarnings).values(data);
}

export async function getEarningsByUserAndDate(userId: number, date: string) {
  const db = await getDb() as any;
  if (!db) throw new Error("Database connection failed");
  const rows = await db.select().from(spreadsheetEarnings).where(and(eq(spreadsheetEarnings.userId, userId), eq(spreadsheetEarnings.date, date))).limit(1);
  return rows[0] || null;
}

export async function getEarningsByUserAndMonth(userId: number, month: string) {
  const db = await getDb() as any;
  if (!db) throw new Error("Database connection failed");
  return await db.select().from(spreadsheetEarnings).where(and(eq(spreadsheetEarnings.userId, userId), sql`DATE_FORMAT(${spreadsheetEarnings.date}, '%Y-%m') = ${month}`));
}

export async function getEarningsByUserAndYear(userId: number, year: string) {
  const db = await getDb() as any;
  if (!db) throw new Error("Database connection failed");
  return await db.select().from(spreadsheetEarnings).where(and(eq(spreadsheetEarnings.userId, userId), sql`DATE_FORMAT(${spreadsheetEarnings.date}, '%Y') = ${year}`));
}

export async function updateEarning(id: number, data: Partial<InsertSpreadsheetEarning>) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  return await db.update(spreadsheetEarnings).set(data).where(eq(spreadsheetEarnings.id, id));
}

export async function deleteEarning(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  return await db.delete(spreadsheetEarnings).where(eq(spreadsheetEarnings.id, id));
}

// ========== SPREADSHEET EXPENSES ==========

export async function upsertExpense(data: InsertSpreadsheetExpense) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const existing = await db.select().from(spreadsheetExpenses).where(and(eq(spreadsheetExpenses.userId, data.userId), eq(spreadsheetExpenses.date, data.date))).limit(1);
  if (existing.length > 0) {
    return await db.update(spreadsheetExpenses).set(data).where(and(eq(spreadsheetExpenses.userId, data.userId), eq(spreadsheetExpenses.date, data.date)));
  }
  return await db.insert(spreadsheetExpenses).values(data);
}

export async function createExpense(data: InsertSpreadsheetExpense) {
  // Sempre cria um novo registro: permite multiplos lancamentos na mesma data
  // e mesma categoria (ex.: 7 + 10 aparecem separados e somam no total).
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  return await db.insert(spreadsheetExpenses).values(data);
}

export async function getExpensesByUserAndDate(userId: number, date: string) {
  const db = await getDb() as any;
  if (!db) throw new Error("Database connection failed");
  const result = await db.select().from(spreadsheetExpenses).where(and(eq(spreadsheetExpenses.userId, userId), eq(spreadsheetExpenses.date, date))).limit(1);
  return result?.[0] || null;
}

export async function getExpensesByUserAndMonth(userId: number, month: string) {
  const db = await getDb() as any;
  if (!db) throw new Error("Database connection failed");
  return await db.select().from(spreadsheetExpenses).where(and(eq(spreadsheetExpenses.userId, userId), sql`DATE_FORMAT(${spreadsheetExpenses.date}, '%Y-%m') = ${month}`));
}

export async function getExpensesByUserAndYear(userId: number, year: string) {
  const db = await getDb() as any;
  if (!db) throw new Error("Database connection failed");
  return await db.select().from(spreadsheetExpenses).where(and(eq(spreadsheetExpenses.userId, userId), sql`DATE_FORMAT(${spreadsheetExpenses.date}, '%Y') = ${year}`));
}

export async function updateExpense(id: number, data: Partial<InsertSpreadsheetExpense>) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  return await db.update(spreadsheetExpenses).set(data).where(eq(spreadsheetExpenses.id, id));
}

export async function deleteExpense(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  return await db.delete(spreadsheetExpenses).where(eq(spreadsheetExpenses.id, id));
}

// ========== SPREADSHEET OPERATIONAL ==========

export async function upsertOperational(data: InsertSpreadsheetOperational) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const existing = await db.select().from(spreadsheetOperational).where(and(eq(spreadsheetOperational.userId, data.userId), eq(spreadsheetOperational.date, data.date))).limit(1);
  if (existing.length > 0) {
    return await db.update(spreadsheetOperational).set(data).where(and(eq(spreadsheetOperational.userId, data.userId), eq(spreadsheetOperational.date, data.date)));
  }
  return await db.insert(spreadsheetOperational).values(data);
}

export async function createOperational(data: InsertSpreadsheetOperational) {
  return upsertOperational(data);
}

export async function getOperationalByUserAndDate(userId: number, date: string) {
  const db = await getDb() as any;
  if (!db) throw new Error("Database connection failed");
  const result = await db.select().from(spreadsheetOperational).where(and(eq(spreadsheetOperational.userId, userId), eq(spreadsheetOperational.date, date))).limit(1);
  return result?.[0] || null;
}

export async function getOperationalByUserAndMonth(userId: number, month: string) {
  const db = await getDb() as any;
  if (!db) throw new Error("Database connection failed");
  return await db.select().from(spreadsheetOperational).where(and(eq(spreadsheetOperational.userId, userId), sql`DATE_FORMAT(${spreadsheetOperational.date}, '%Y-%m') = ${month}`));
}

export async function updateOperational(id: number, data: Partial<InsertSpreadsheetOperational>) {
  const db = await getDb() as any;
  if (!db) throw new Error("Database connection failed");
  return await db.update(spreadsheetOperational).set(data).where(eq(spreadsheetOperational.id, id));
}

export async function deleteOperational(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  return await db.delete(spreadsheetOperational).where(eq(spreadsheetOperational.id, id));
}

// ========== SPREADSHEET GOALS ==========

export async function upsertGoal(data: InsertSpreadsheetGoal) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const existing = await db.select().from(spreadsheetGoals).where(and(eq(spreadsheetGoals.userId, data.userId), eq(spreadsheetGoals.month, data.month))).limit(1);
  if (existing.length > 0) {
    return await db.update(spreadsheetGoals).set(data).where(and(eq(spreadsheetGoals.userId, data.userId), eq(spreadsheetGoals.month, data.month)));
  }
  return await db.insert(spreadsheetGoals).values(data);
}

export async function createGoal(data: InsertSpreadsheetGoal) {
  return upsertGoal(data);
}

export async function getGoalsByUserAndMonth(userId: number, month: string) {
  const db = await getDb() as any;
  if (!db) throw new Error("Database connection failed");
  const rows = await db.select().from(spreadsheetGoals).where(and(eq(spreadsheetGoals.userId, userId), eq(spreadsheetGoals.month, month))).limit(1);
  return rows[0] || null;
}

export async function updateGoal(id: number, data: Partial<InsertSpreadsheetGoal>) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  return await db.update(spreadsheetGoals).set(data).where(eq(spreadsheetGoals.id, id));
}

export async function deleteGoal(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  return await db.delete(spreadsheetGoals).where(eq(spreadsheetGoals.id, id));
}

// ========== SPREADSHEET AUTHENTICATION ==========
// Funções de autenticação de planilha - usar tabelas específicas

// Marca o alerta de agendamento confirmado como visto pelo admin
export async function adminDismissScheduleAlert(appointmentId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(scheduleAppointments)
    .set({ adminSeenConfirmedAt: new Date() })
    .where(eq(scheduleAppointments.id, appointmentId));
}

// ========== CONSULTAS (SERVIÇOS EXTRAS) ==========

import {
  consultaForms, ConsultaForm, InsertConsultaForm,
  consultaRequests, ConsultaRequest, InsertConsultaRequest,
} from "../drizzle/schema";

export async function listConsultaForms(activeOnly = false): Promise<ConsultaForm[]> {
  const db = await getDb();
  if (!db) return [];
  if (activeOnly) {
    return await db.select().from(consultaForms).where(eq(consultaForms.isActive, 1)).orderBy(asc(consultaForms.sortOrder));
  }
  return await db.select().from(consultaForms).orderBy(asc(consultaForms.sortOrder));
}

export async function getConsultaForm(id: number): Promise<ConsultaForm | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(consultaForms).where(eq(consultaForms.id, id)).limit(1);
  return rows[0] || null;
}

export async function createConsultaForm(data: Omit<InsertConsultaForm, 'id' | 'createdAt'>): Promise<ConsultaForm> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.insert(consultaForms).values(data as InsertConsultaForm);
  const rows = await db.select().from(consultaForms).orderBy(desc(consultaForms.id)).limit(1);
  return rows[0];
}

export async function updateConsultaForm(id: number, data: Partial<InsertConsultaForm>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(consultaForms).set(data).where(eq(consultaForms.id, id));
}

export async function deleteConsultaForm(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(consultaForms).where(eq(consultaForms.id, id));
}

export async function countConsultaRequestsThisWeek(customerPhone: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  // Calcular início da semana (segunda-feira 00:00 UTC)
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0=domingo, 1=segunda...
  const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - diffToMonday);
  monday.setUTCHours(0, 0, 0, 0);
  const rows = await db.select({ count: sql<number>`COUNT(*)` })
    .from(consultaRequests)
    .where(and(
      eq(consultaRequests.customerPhone, customerPhone),
      gte(consultaRequests.createdAt, monday)
    ));
  return Number(rows[0]?.count ?? 0);
}

export async function submitConsultaRequest(data: Omit<InsertConsultaRequest, 'id' | 'createdAt' | 'status' | 'adminResponse' | 'respondedAt'>): Promise<ConsultaRequest> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.insert(consultaRequests).values({ ...data, status: 'pending' } as InsertConsultaRequest);
  const rows = await db.select().from(consultaRequests).orderBy(desc(consultaRequests.id)).limit(1);
  return rows[0];
}

export async function listConsultaRequests(): Promise<(ConsultaRequest & { currentPhone: string | null; currentPhoto: string | null })[]> {
  const db = await getDb();
  if (!db) return [];
  // Buscar consultas com JOIN na tabela customers por telefone OU por nome (para casos de troca de número)
  const rows = await db
    .select({
      id: consultaRequests.id,
      formId: consultaRequests.formId,
      formTitle: consultaRequests.formTitle,
      customerPhone: consultaRequests.customerPhone,
      customerName: consultaRequests.customerName,
      customerEmail: consultaRequests.customerEmail,
      customerPhoto: consultaRequests.customerPhoto,
      data: consultaRequests.data,
      status: consultaRequests.status,
      adminResponse: consultaRequests.adminResponse,
      responseFileUrl: consultaRequests.responseFileUrl,
      responseFileName: consultaRequests.responseFileName,
      respondedAt: consultaRequests.respondedAt,
      createdAt: consultaRequests.createdAt,
      currentPhone: customers.phone,
      currentPhoto: customers.profilePhotoUrl,
    })
    .from(consultaRequests)
    .leftJoin(
      customers,
      sql`(
        REGEXP_REPLACE(${consultaRequests.customerPhone}, '[^0-9]', '') = REGEXP_REPLACE(${customers.phone}, '[^0-9]', '')
        OR (
          REGEXP_REPLACE(${consultaRequests.customerPhone}, '[^0-9]', '') != REGEXP_REPLACE(${customers.phone}, '[^0-9]', '')
          AND UPPER(TRIM(${consultaRequests.customerName})) = UPPER(TRIM(${customers.name}))
          AND LENGTH(TRIM(${consultaRequests.customerName})) > 3
        )
      )`
    )
    .orderBy(desc(consultaRequests.createdAt));
  return rows;
}

export async function respondConsultaRequest(id: number, adminResponse: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(consultaRequests).set({ adminResponse, status: 'answered', respondedAt: new Date() }).where(eq(consultaRequests.id, id));
}

export async function getConsultaRequest(id: number): Promise<ConsultaRequest | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(consultaRequests).where(eq(consultaRequests.id, id)).limit(1);
  return rows[0] || null;
}

// ========== BROADCAST QUEUE (envio com intervalo) ==========

export async function createBroadcastQueue(broadcastId: number, recipients: { email: string; phone?: string }[]): Promise<void> {
  const db = await getDb();
  if (!db) return;
  if (recipients.length === 0) return;
  const values = recipients.map(r => ({
    broadcastId,
    recipientEmail: r.email,
    recipientPhone: r.phone || null,
    status: 'pending' as const,
  }));
  // Inserir em lotes de 100
  for (let i = 0; i < values.length; i += 100) {
    await db.insert(broadcastQueue).values(values.slice(i, i + 100));
  }
}

export async function getNextPendingQueueItem(broadcastId: number): Promise<BroadcastQueue | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(broadcastQueue)
    .where(and(eq(broadcastQueue.broadcastId, broadcastId), eq(broadcastQueue.status, 'pending')))
    .orderBy(asc(broadcastQueue.id))
    .limit(1);
  return rows[0] || null;
}

export async function markQueueItemSent(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(broadcastQueue).set({ status: 'sent', sentAt: new Date() }).where(eq(broadcastQueue.id, id));
}

export async function markQueueItemFailed(id: number, error: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(broadcastQueue).set({ status: 'failed', error }).where(eq(broadcastQueue.id, id));
}

export async function countBroadcastQueueStatus(broadcastId: number): Promise<{ pending: number; sent: number; failed: number }> {
  const db = await getDb();
  if (!db) return { pending: 0, sent: 0, failed: 0 };
  const rows = await db.execute(sql`
    SELECT status, COUNT(*) as cnt FROM broadcastQueue WHERE broadcastId = ${broadcastId} GROUP BY status
  `);
  const data = (rows[0] as unknown as Array<{ status: string; cnt: number }>);
  const result = { pending: 0, sent: 0, failed: 0 };
  for (const row of data) {
    if (row.status === 'pending') result.pending = Number(row.cnt);
    else if (row.status === 'sent') result.sent = Number(row.cnt);
    else if (row.status === 'failed') result.failed = Number(row.cnt);
  }
  return result;
}

export async function updateBroadcastProgress(id: number, emailsSent: number, emailsFailed: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(broadcasts).set({ emailsSent, emailsFailed }).where(eq(broadcasts.id, id));
}

export async function updateBroadcastCronTaskUid(id: number, taskUid: string | null): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(broadcasts).set({ scheduleCronTaskUid: taskUid }).where(eq(broadcasts.id, id));
}

export async function getBroadcastById(id: number): Promise<Broadcast | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(broadcasts).where(eq(broadcasts.id, id)).limit(1);
  return rows[0] || null;
}

export async function markBroadcastSending(id: number, totalRecipients: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(broadcasts).set({ status: 'sending', totalRecipients }).where(eq(broadcasts.id, id));
}

export async function markBroadcastCancelled(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(broadcasts).set({ status: 'cancelled', scheduleCronTaskUid: null }).where(eq(broadcasts.id, id));
}

export async function getBroadcastByTaskUid(taskUid: string): Promise<Broadcast | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(broadcasts).where(eq(broadcasts.scheduleCronTaskUid, taskUid)).limit(1);
  return rows[0] || null;
}

// ========== EMAIL ACCOUNTS (ZOHO) ==========

let _emailAccountsInfrastructureReady = false;
async function ensureEmailAccountsInfrastructure(db: any): Promise<void> {
  if (_emailAccountsInfrastructureReady) return;
  await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS emailAccounts (
    id INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
    emailAddress VARCHAR(320) NOT NULL UNIQUE,
    type ENUM('principal','membro') NOT NULL DEFAULT 'membro',
    createdAt BIGINT NOT NULL DEFAULT 0,
    updatedAt BIGINT NOT NULL DEFAULT 0
  )`));
  _emailAccountsInfrastructureReady = true;
}

export async function upsertEmailAccount(emailAddress: string, type: 'principal' | 'membro' = 'membro') {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  await ensureEmailAccountsInfrastructure(db);
  const existing = await db.select().from(emailAccounts).where(eq(emailAccounts.emailAddress, emailAddress)).limit(1);
  const now = Date.now();
  if (existing.length > 0) {
    return await db.update(emailAccounts).set({ type, updatedAt: now }).where(eq(emailAccounts.emailAddress, emailAddress));
  }
  return await db.insert(emailAccounts).values({ emailAddress, type, createdAt: now, updatedAt: now });
}

/** Reserva o endereço com a chave única do banco antes de chamar o servidor de e-mail. */
export async function reserveEmailAccount(emailAddress: string, type: 'principal' | 'membro' = 'membro'): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const normalized = String(emailAddress || "").trim().toLowerCase();
  try {
    await db.insert(emailAccounts).values({ emailAddress: normalized, type, createdAt: Date.now(), updatedAt: Date.now() });
    return true;
  } catch (error: any) {
    const message = String(error?.message || "").toLowerCase();
    if (message.includes("duplicate") || message.includes("unique")) return false;
    throw error;
  }
}

/** Libera uma reserva que não chegou a criar a conta no servidor. */
export async function releaseEmailAccountReservation(emailAddress: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(emailAccounts).where(eq(emailAccounts.emailAddress, String(emailAddress || "").trim().toLowerCase()));
}

export async function getEmailAccountType(emailAddress: string): Promise<'principal' | 'membro' | null> {
  const db = await getDb();
  if (!db) return null;
  await ensureEmailAccountsInfrastructure(db);
  const rows = await db.select().from(emailAccounts).where(eq(emailAccounts.emailAddress, emailAddress)).limit(1);
  return rows[0]?.type || null;
}

export async function deleteEmailAccount(emailAddress: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await ensureEmailAccountsInfrastructure(db);
  await db.delete(emailAccounts).where(eq(emailAccounts.emailAddress, emailAddress));
}

export async function listEmailAccounts(): Promise<Array<{ emailAddress: string; type: 'principal' | 'membro' }>> {
  const db = await getDb();
  if (!db) return [];
  await ensureEmailAccountsInfrastructure(db);
  const rows = await db.select().from(emailAccounts);
  return rows.map(r => ({ emailAddress: r.emailAddress, type: r.type }));
}

// ========== ZOHO OAUTH CONFIGURATIONS (100% SQL puro - sem ORM) ==========

export async function createZohoOAuthConfig(data: { name: string; zohoOrgId: string; zohoClientId: string; zohoClientSecret: string; zohoRefreshToken: string; domain?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const now = Date.now();
  const n = data.name.replace(/'/g, "''");
  const org = data.zohoOrgId.replace(/'/g, "''");
  const cid = data.zohoClientId.replace(/'/g, "''");
  const csec = data.zohoClientSecret.replace(/'/g, "''");
  const tok = data.zohoRefreshToken.replace(/'/g, "''");
  // Verificar se já existe um registo com este nome
  const existing = await db.execute(sql.raw(`SELECT id, isActive FROM zohoOAuthConfigs WHERE name = '${n}' LIMIT 1`));
  const rows = (existing as any)[0] as any[];
  const dom = data.domain ? data.domain.replace(/'/g, "''") : '';
  if (rows && rows.length > 0) {
    // UPDATE: atualizar token e credenciais mantendo isActive e domain
    const domainClause = dom ? `, \`domain\`='${dom}'` : '';
    await db.execute(sql.raw(
      `UPDATE zohoOAuthConfigs SET zohoOrgId='${org}', zohoClientId='${cid}', zohoClientSecret='${csec}', zohoRefreshToken='${tok}', status='active', isActive=1${domainClause}, updatedAt=${now} WHERE name='${n}'`
    ));
  } else {
    // INSERT: criar novo registo
    await db.execute(sql.raw(
      `INSERT INTO zohoOAuthConfigs (name, zohoOrgId, zohoClientId, zohoClientSecret, zohoRefreshToken, \`domain\`, isActive, status, createdAt, updatedAt)
       VALUES ('${n}', '${org}', '${cid}', '${csec}', '${tok}', '${dom}', 1, 'active', ${now}, ${now})`
    ));
  }
}

let _zohoColumnMigrated = false;
export async function listZohoOAuthConfigs(): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];
  // Garantir que a coluna domain existe (migration automática)
  if (!_zohoColumnMigrated) {
    try {
      await db.execute(sql.raw(`ALTER TABLE zohoOAuthConfigs ADD COLUMN IF NOT EXISTS \`domain\` VARCHAR(128) NULL`));
      // Preencher domínios vazios baseado no Org ID conhecido
      await db.execute(sql.raw(`UPDATE zohoOAuthConfigs SET \`domain\`='walkajuda.com' WHERE (\`domain\` IS NULL OR \`domain\`='') AND zohoOrgId='920722948'`));
      await db.execute(sql.raw(`UPDATE zohoOAuthConfigs SET \`domain\`='h2colombiano.com' WHERE (\`domain\` IS NULL OR \`domain\`='') AND zohoOrgId='933183212'`));
      _zohoColumnMigrated = true;
    } catch (_) { _zohoColumnMigrated = true; }
  }
  const result = await db.execute(sql.raw(
    `SELECT id, name, \`domain\`, zohoOrgId, zohoClientId, zohoClientSecret, zohoRefreshToken, isActive, status, createdAt, updatedAt FROM zohoOAuthConfigs ORDER BY createdAt ASC`
  ));
  return (result as any)[0] as any[];
}

export async function getActiveZohoOAuthConfig(): Promise<any | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.execute(sql.raw(
    `SELECT id, name, \`domain\`, zohoOrgId, zohoClientId, zohoClientSecret, zohoRefreshToken, isActive, status FROM zohoOAuthConfigs WHERE isActive = 1 LIMIT 1`
  ));
  const rows = (result as any)[0] as any[];
  return rows?.[0] || null;
}

export async function getZohoOAuthConfig(id: number): Promise<any | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.execute(sql.raw(
    `SELECT id, name, \`domain\`, zohoOrgId, zohoClientId, zohoClientSecret, zohoRefreshToken, isActive, status FROM zohoOAuthConfigs WHERE id = ${id} LIMIT 1`
  ));
  const rows = (result as any)[0] as any[];
  return rows?.[0] || null;
}

export async function updateZohoOAuthConfig(id: number, data: { status?: string; updatedAt?: number; zohoRefreshToken?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const now = Date.now();
  const sets: string[] = [`updatedAt = ${now}`];
  if (data.status !== undefined) sets.push(`status = '${data.status}'`);
  if (data.zohoRefreshToken !== undefined) sets.push(`zohoRefreshToken = '${data.zohoRefreshToken.replace(/'/g, "''")}'`);
  await db.execute(sql.raw(`UPDATE zohoOAuthConfigs SET ${sets.join(', ')} WHERE id = ${id}`));
}

export async function deleteZohoOAuthConfig(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  await db.execute(sql.raw(`DELETE FROM zohoOAuthConfigs WHERE id = ${id}`));
}

export async function setActiveZohoOAuthConfig(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  // Toggle: se já está ativo, desativa; se está inativo, ativa (sem afetar os outros)
  const result = await db.execute(sql.raw(`SELECT isActive FROM zohoOAuthConfigs WHERE id = ${id} LIMIT 1`));
  const rows = (result as any)[0] as any[];
  const currentlyActive = rows?.[0]?.isActive === 1;
  const newActive = currentlyActive ? 0 : 1;
  const newStatus = newActive === 1 ? 'active' : 'inactive';
  await db.execute(sql.raw(`UPDATE zohoOAuthConfigs SET isActive = ${newActive}, status = '${newStatus}', updatedAt = ${Date.now()} WHERE id = ${id}`));
}

// Salvar config pendente para OAuth callback (troca de código por token)
export async function savePendingZohoOAuth(sessionId: string, data: { name: string; zohoOrgId: string; zohoClientId: string; zohoClientSecret: string; domain: string; redirectUri: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const key = `__zoho_oauth_${sessionId}`;
  const json = JSON.stringify(data);
  
  // Usar DELETE + INSERT ao invés de REPLACE para evitar problemas
  await db.execute(sql.raw(`DELETE FROM siteSettings WHERE \`settingKey\` = '${key.replace(/'/g, "''")}'`)).catch(() => {});
  await db.insert(siteSettings).values({ settingKey: key, settingValue: json });
}

export async function getPendingZohoOAuth(sessionId: string): Promise<any | null> {
  const db = await getDb();
  if (!db) return null;
  const key = `__zoho_oauth_${sessionId}`;
  
  try {
    const rows = await db.select().from(siteSettings).where(eq(siteSettings.settingKey, key)).limit(1);
    if (!rows?.[0]?.settingValue) return null;
    return JSON.parse(rows[0].settingValue);
  } catch (e) {
    console.error('[getPendingZohoOAuth] Erro:', e);
    return null;
  }
}

export async function deletePendingZohoOAuth(sessionId: string) {
  const db = await getDb();
  if (!db) return;
  const key = `__zoho_oauth_${sessionId}`;
  await db.delete(siteSettings).where(eq(siteSettings.settingKey, key)).catch(() => {});
}


// ─── Comissão de indicação congelada por pedido elegível ───────────────────
export type ReferralCommissionStatus = "em_analise" | "elegivel" | "paga" | "nao_elegivel" | "cancelada";

export async function getReferralCommissionAttributionByOrderStatus(orderStatusId: number): Promise<ReferralCommissionAttribution | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(referralCommissionAttributions)
    .where(eq(referralCommissionAttributions.orderStatusId, orderStatusId))
    .limit(1);
  return rows[0] || null;
}

export async function createReferralCommissionAttribution(input: {
  referrerCustomerId?: number | null;
  referrerPhone: string;
  referrerName?: string | null;
  referredCustomerId: number;
  referredPhone: string;
  referredName?: string | null;
  source: string;
  sourceReference?: string | null;
  registrationId: number;
  orderStatusId: number;
  orderNumber?: number | null;
  productId?: number | null;
  optionId?: number | null;
  serviceName?: string | null;
  serviceOption?: string | null;
  commissionValue: number;
}): Promise<ReferralCommissionAttribution | null> {
  const db = await getDb();
  if (!db) return null;

  const existing = await getReferralCommissionAttributionByOrderStatus(input.orderStatusId);
  if (existing) return existing;

  try {
    await db.insert(referralCommissionAttributions).values({
      referrerCustomerId: input.referrerCustomerId ?? null,
      referrerPhone: input.referrerPhone.replace(/\D/g, ''),
      referrerName: input.referrerName ?? null,
      referredCustomerId: input.referredCustomerId,
      referredPhone: input.referredPhone.replace(/\D/g, ''),
      referredName: input.referredName ?? null,
      source: input.source,
      sourceReference: input.sourceReference ?? null,
      registrationId: input.registrationId,
      orderStatusId: input.orderStatusId,
      orderNumber: input.orderNumber ?? null,
      productId: input.productId ?? null,
      optionId: input.optionId ?? null,
      serviceName: input.serviceName ?? null,
      serviceOption: input.serviceOption ?? null,
      commissionRule: "fixed_option",
      commissionValue: Math.max(0, Math.round(input.commissionValue)),
      status: "em_analise",
    } satisfies InsertReferralCommissionAttribution);
  } catch (error: any) {
    // Uma criação concorrente do mesmo pedido deve devolver o snapshot já gravado.
    if (!String(error?.message || "").toLowerCase().includes("duplicate")) throw error;
  }

  return await getReferralCommissionAttributionByOrderStatus(input.orderStatusId);
}

export async function updateReferralCommissionAttributionStatus(input: {
  registrationId: number;
  status: ReferralCommissionStatus;
  reason?: string | null;
  paidBy?: string | null;
  paymentReference?: string | null;
}): Promise<ReferralCommissionAttribution | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(referralCommissionAttributions)
    .where(eq(referralCommissionAttributions.registrationId, input.registrationId))
    .limit(1);
  const attribution = rows[0];
  if (!attribution) return null;

  const now = new Date();
  const values: Partial<InsertReferralCommissionAttribution> = { status: input.status };
  if (input.status === "nao_elegivel" || input.status === "cancelada") {
    values.invalidReason = input.reason?.trim() || "Não elegível";
    values.invalidatedAt = now;
  }
  if (input.status === "elegivel") {
    values.invalidReason = null;
    values.invalidatedAt = null;
    values.eligibleAt = now;
  }
  if (input.status === "paga") {
    values.paidAt = now;
    values.paidBy = input.paidBy || "admin";
    values.paymentReference = input.paymentReference?.trim() || null;
  }
  await db.update(referralCommissionAttributions).set(values)
    .where(eq(referralCommissionAttributions.id, attribution.id));

  const updated = await db.select().from(referralCommissionAttributions)
    .where(eq(referralCommissionAttributions.id, attribution.id)).limit(1);
  return updated[0] || null;
}

export async function listReferralCommissionAttributions(): Promise<ReferralCommissionAttribution[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(referralCommissionAttributions)
    .orderBy(desc(referralCommissionAttributions.createdAt));
}

export async function getReferralCommissionAttributionByRegistration(registrationId: number): Promise<ReferralCommissionAttribution | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(referralCommissionAttributions)
    .where(eq(referralCommissionAttributions.registrationId, registrationId))
    .orderBy(desc(referralCommissionAttributions.createdAt))
    .limit(1);
  return rows[0] || null;
}
