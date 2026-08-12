import { sql } from "drizzle-orm";
import {
  listZohoUsers,
  listAllZohoUsersGrouped,
  createZohoUser,
  createZohoUserInConfig,
  listZohoUsersForConfig,
  deleteZohoUser,
  resetZohoPassword,
  toggleZohoUser,
  listMailAccounts,
  listInboxMessages,
  getMessageContent,
  markMessageRead,
  listFolders,
} from "./zoho";
import fs from "fs";
import path from "path";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { resellersRouter } from "./routers/resellers";
import { scheduleRouter } from "./routers/schedule";
import { spreadsheetRouter } from "./routers/spreadsheet";
import { loanRouter } from "./routers/loans";
import { apkRouter } from "./routers/apk";
import { customerPasswordRouter } from "./routers/customerPassword";
import { syncUnifiedCustomerRegistry } from "./customerIdentity";
import { CUSTOMER_ROUTES, ensureCustomerIdentityInfrastructure, findMainCustomerByIdentity, getRouteAccess, getRouteReleaseMode, listRouteReleaseModes, normalizeCustomerCpf, normalizeCustomerEmail, normalizeCustomerPhone, requestCustomerRouteAccess, setCustomerRoutePermissions, setRouteReleaseMode } from "./customerAccess";
import { adCampaignsRouter } from "./routers/adCampaigns";
import { publicProcedure, router, adminProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { isValidCPF, normalizeCpf } from "@shared/cpf";
import { z } from "zod";
import { chatRouter } from "./routers/chat";
import { chatUsersRouter } from "./routers/chat-users";
import { onlineSupportRouter } from "./routers/online-support";
import { chatFlowRouter } from "./routers/chat-flow";
import { consultasRouter } from "./routers/consultas";
import { whatsappTemplatesRouter } from "./routers/whatsappTemplates";
import { preRegistrationsRouter } from "./routers/preRegistrations";
import { preCadastroQuestionsRouter } from "./routers/preCadastroQuestions";
import { cartoesRouter } from "./routers/cartoes";
import { mercadoRouter } from "./routers/mercado";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import { sendMailDirect } from "./_core/sendMailDirect";
import { emailStatusCliente, emailStatusAdmin, emailNovoPedidoAdmin, emailPedidoRecebidoCliente, emailCadastroFinalizadoAdmin, emailInicioCadastroAdmin, emailIndicacaoSucesso, emailComprovantePix, nl2br } from "./emailTemplates";
import { parse as parseCookieHeader } from "cookie";
import jwt from "jsonwebtoken";
import {
  validateAccessCode, createAccessCode, listAccessCodes, toggleAccessCode,
  deleteAccessCode, renewAccessCode, checkAccessCodeCanSubmit, consumeAccessCode,
  listAccessCodePhones, listAllAccessCodePhones,
  createCoupon, listCoupons, deleteCoupon, toggleCoupon, validateCoupon, consumeCoupon,
  createProduct, listProducts, listActiveProducts, updateProduct, deleteProduct, toggleProduct,
  listHomeButtons, listActiveHomeButtons, createHomeButton, updateHomeButton, deleteHomeButton, reorderHomeButtons,
  listProductOptions, createProductOption, updateProductOption, deleteProductOption,
  listProductQuestions, listOptionQuestions, createProductQuestion, updateProductQuestion, deleteProductQuestion,
  listOptionDocuments, createOptionDocument, updateOptionDocument, deleteOptionDocument, deleteOptionDocumentsByOptionId,
  getAllSettings, upsertSettings, upsertSetting, getSetting, getSettings,
  getCustomerByPhone, getCustomerByCpf, createCustomer, listCustomers, updateCustomer, deleteCustomer, updateCustomerLastAccess, validateMainCustomerProfile,
  createRaffle, getAllRaffles, getRaffleById, updateRaffle, deleteRaffle, deleteRaffleEntry, updateRaffleEntryPayment,
  getRaffleEntries, createRaffleEntry, checkNumberTaken, getActiveRaffle, getLatestDrawnRaffle,
  getAdminCredential, updateAdminPassword,
  addOrderStatus, getOrderStatusHistory, getLatestOrderStatus, getOrderStatusHistoryByPhone,
  addOrderFile, getOrderFiles, getOrderFilesByPhone, getOrderFilesByPhoneGrouped, deleteOrderFile,
  getStatusLabelFromDb,
  getStatusInfoFromDb,
  generateOrderNumber,
  updateLastOrderStatus,
  createDocRequest, getDocRequestsByRegistration, getDocRequestsByPhone,
  updateDocRequestStatus, deleteDocRequest,
  getBlocklist, addToBlocklist, removeFromBlocklist, checkBlocklist,
  getSystemConfig, setSystemConfig, getAllSystemConfigs,
  isIpBlocked, getIpBlocklist, blockIp, unblockIp, logIpAccess, getIpAccessLogs, getIpAccessLogsByIp,
  logVpnAttempt, getVpnAttempts, checkVpnIp,
  createBroadcast, listBroadcasts, deleteBroadcast, markBroadcastSent,
  createBroadcastQueue, getBroadcastById, markBroadcastSending, markBroadcastCancelled,
  countBroadcastQueueStatus, updateBroadcastCronTaskUid,
  logBlockedAttempt, getBlockedAttempts, clearBlockedAttempts,
  listPixAccounts, getActivePixAccount, createPixAccount, updatePixAccount, setActivePixAccount, deletePixAccount,
  createFinancialSale, updateFinancialSale, deleteFinancialSale, getFinancialSaleByRegistrationId,
  listFinancialSales, getFinancialSummary, getCashFlow, resetFinancialData,
  createReferralLink, listReferralLinksByCustomer, listAllReferralLinks, getReferralLinkByCode,
  deleteReferralLink, toggleReferralLink, recordReferralUsage, listReferralUsagesByLink,
  markReferralCommissionPaid, isPhoneNewCustomer,
  listTrackingQuestions, listActiveTrackingQuestions, createTrackingQuestion,
  updateTrackingQuestion, deleteTrackingQuestion, toggleTrackingQuestion,
  saveTrackingAnswer, getTrackingAnswersByOrder,
  recordAdminLoginAttempt, isAdminLoginBlocked, resetAdminLoginAttempts,
  unblockAllAdminIps, listBlockedAdminIps,
  restoreCustomer, listDeletedCustomers, permanentlyDeleteCustomer,
  assignTrackingQuestion, getAssignmentsByOrder, saveAssignmentAnswer, deleteAssignment,
  getActiveProtectedPhoto, listProtectedPhotos, createProtectedPhoto, deleteProtectedPhoto,
  toggleProtectedPhoto, reorderProtectedPhoto, isPhoneRegistered,
  logPhotoAccess, listPhotoAccessLogs, clearPhotoAccessLogs,
  getOrderProgressConfig, setOrderProgressConfig,
  getFaqConfig, updateFaqConfig, listFaqItems, createFaqItem, updateFaqItem, deleteFaqItem, reorderFaqItems,
  listWarrantyTiers, createWarrantyTier, updateWarrantyTier, deleteWarrantyTier, deleteWarrantyTiersByOptionId,
  getCustomerDocuments, createCustomerDocument, deleteCustomerDocument,
  listInternalStages, createInternalStage, updateInternalStage, deleteInternalStage, reorderInternalStages,
  setOrderStage, getOrderCurrentStage, getOrderCurrentStagesBatch,
  getViewedOrderKeys, markOrderAsViewed,
} from "./db";
import { storagePut } from "./storage";

/**
 * Verifica se um telefone está na blocklist.
 * Se estiver e o IP for fornecido, bloqueia o IP automaticamente.
 * Retorna { blocked: true, reason } se bloqueado, ou { blocked: false } se livre.
 */
async function checkPhoneBlockedAndBlockIp(
  phone: string,
  clientIp?: string,
  action?: string
): Promise<{ blocked: boolean; reason?: string }> {
  const normalizedPhone = phone.replace(/\D/g, '');
  const result = await checkBlocklist('', normalizedPhone);
  if (result.blocked) {
    // Registrar tentativa de acesso bloqueado
    logBlockedAttempt(normalizedPhone, action || 'acesso', clientIp, result.reason).catch(() => {});
    // Bloquear IP automaticamente se disponível
    if (clientIp && clientIp !== 'unknown') {
      blockIp(clientIp, `Bloqueio automático: telefone ${normalizedPhone} na lista negra`).catch(() => {});
    }
    return { blocked: true, reason: result.reason || 'Acesso bloqueado' };
  }
  return { blocked: false };
}

function resolveFileExt(mime: string | undefined | null): { ext: string; contentType: string } {
  if (!mime) return { ext: 'pdf', contentType: 'application/pdf' };
  const m = mime.toLowerCase().trim();
  if (m === 'application/pdf') return { ext: 'pdf', contentType: 'application/pdf' };
  if (m === 'image/jpeg' || m === 'image/jpg') return { ext: 'jpg', contentType: 'image/jpeg' };
  if (m === 'image/png') return { ext: 'png', contentType: 'image/png' };
  if (m === 'image/webp') return { ext: 'webp', contentType: 'image/webp' };
  if (m.startsWith('image/')) return { ext: 'jpg', contentType: m };
  // Vídeos
  if (m === 'video/mp4') return { ext: 'mp4', contentType: 'video/mp4' };
  if (m === 'video/webm') return { ext: 'webm', contentType: 'video/webm' };
  if (m === 'video/quicktime') return { ext: 'mov', contentType: 'video/quicktime' };
  if (m === 'video/x-msvideo') return { ext: 'avi', contentType: 'video/x-msvideo' };
  if (m.startsWith('video/')) return { ext: 'mp4', contentType: m };
  return { ext: 'pdf', contentType: 'application/pdf' };
}

function normalizeDomainValue(raw: string | null | undefined): string {
  if (!raw) return '';
  let value = String(raw).trim().toLowerCase();
  if (!value) return '';
  value = value.replace(/^https?:\/\//i, '');
  value = value.split('/')[0] || value;
  if (value.includes('@')) value = value.split('@')[1] || value;
  return value.trim();
}

function normalizeBaseUrlValue(raw: string | null | undefined): string {
  if (!raw) return '';
  let value = String(raw).trim();
  if (!value) return '';
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  try {
    const parsed = new URL(value);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return '';
  }
}

async function getEmailBranding(): Promise<{ siteTitle: string; siteDomain: string; siteBaseUrl: string }> {
  const [siteTitleRaw, siteDomainRaw, siteUrlRaw, siteBaseUrlRaw] = await Promise.all([
    getSetting('site_title'),
    getSetting('site_domain'),
    getSetting('site_url'),
    getSetting('site_base_url'),
  ]);

  const siteTitle = (siteTitleRaw || 'H2 COLOMBIANO').toString().trim() || 'H2 COLOMBIANO';
  const siteBaseUrl =
    normalizeBaseUrlValue(siteBaseUrlRaw) ||
    normalizeBaseUrlValue(siteUrlRaw) ||
    normalizeBaseUrlValue(process.env.APP_URL) ||
    '';
  const domainFromBaseUrl = siteBaseUrl ? normalizeDomainValue(siteBaseUrl) : '';
  const domainFromSmtp = normalizeDomainValue(process.env.SMTP_USER || process.env.SMTP_FROM || '');
  const siteDomain =
    normalizeDomainValue(siteDomainRaw) ||
    domainFromBaseUrl ||
    domainFromSmtp ||
    'h2colombiano.com';

  return {
    siteTitle,
    siteDomain,
    siteBaseUrl: siteBaseUrl || `https://${siteDomain}`,
  };
}

async function getNotificationEmailTo(): Promise<string> {
  const [emailToRaw, contactEmailRaw] = await Promise.all([
    getSetting('email_to'),
    getSetting('contact_email'),
  ]);
  return emailToRaw || contactEmailRaw || 'h2@h2colombiano.com';
}

function hasMailChannel(): boolean {
  return !!(process.env.RESEND_API_KEY || process.env.SMTP_PASS || process.env.ZOHO_EMAIL_PASSWORD);
}

export const appRouter = router({
  system: systemRouter,
  resellers: resellersRouter,
  schedule: scheduleRouter,
  spreadsheet: spreadsheetRouter,
  loans: loanRouter,
  apk: apkRouter,
  customerPassword: customerPasswordRouter,
  adCampaigns: adCampaignsRouter,
  preRegistrations: preRegistrationsRouter,
  preCadastroQuestions: preCadastroQuestionsRouter,
  attention: router({
    // Listar todos os pedidos em atendimento (ativos, não expirados)
    list: adminProcedure.query(async () => {
      const { listAttentions } = await import('./db');
      return await listAttentions();
    }),
    // Marcar pedido como "em atendimento"
    mark: adminProcedure
      .input(z.object({ registrationId: z.number(), adminName: z.string().default('Admin') }))
      .mutation(async ({ input }) => {
        const { markAttention } = await import('./db');
        await markAttention(input.registrationId, input.adminName);
        return { success: true };
      }),
    // Remover marcação
    clear: adminProcedure
      .input(z.object({ registrationId: z.number() }))
      .mutation(async ({ input }) => {
        const { clearAttention } = await import('./db');
        await clearAttention(input.registrationId);
        return { success: true };
      }),
  }),
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // Solicitações de liberação de rota. A identidade vem sempre do cadastro principal.
  accessRequests: router({
    request: publicProcedure
      .input(z.object({ phone: z.string().min(10), route: z.enum(['site', 'acompanhar', 'gastos', 'emprestimo']) }))
      .mutation(async ({ input }) => {
        await ensureCustomerIdentityInfrastructure();
        const customer = await findMainCustomerByIdentity({ phone: input.phone });
        if (!customer) throw new TRPCError({ code: 'NOT_FOUND', message: 'Cadastro não encontrado.' });
        const access = await getRouteAccess(customer.id);
        if (!access.restricted || access.routes.includes(input.route)) {
          return { success: true, alreadyAllowed: true, pending: false };
        }
        const requested = await requestCustomerRouteAccess(customer.id, input.route);
        return { success: true, alreadyAllowed: false, ...requested };
      }),

    listPending: adminProcedure.query(async () => {
      await ensureCustomerIdentityInfrastructure();
      const { getDb } = await import('./db');
      const db = await getDb() as any;
      if (!db) return [];
      const [rows] = await db.execute(sql`
        SELECT r.id, r.customerId, r.route, r.status, r.createdAt, c.customerNumber, c.name, c.phone
        FROM customerAccessRequests r
        JOIN customers c ON c.id=r.customerId
        WHERE r.status='pending' AND r.pendingKey=1
        ORDER BY r.createdAt ASC
      `);
      return rows as any[];
    }),

    decide: adminProcedure
      .input(z.object({ id: z.number(), approved: z.boolean(), adminName: z.string().min(1).default('Administrador') }))
      .mutation(async ({ input }) => {
        await ensureCustomerIdentityInfrastructure();
        const { getDb } = await import('./db');
        const db = await getDb() as any;
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Banco indisponível.' });
        const [rows] = await db.execute(sql`SELECT customerId, route FROM customerAccessRequests WHERE id=${input.id} AND status='pending' AND pendingKey=1 LIMIT 1`) as any;
        const request = rows?.[0];
        if (!request) throw new TRPCError({ code: 'NOT_FOUND', message: 'Solicitação pendente não encontrada.' });
        if (input.approved) {
          const access = await getRouteAccess(Number(request.customerId), db);
          await setCustomerRoutePermissions(Number(request.customerId), [...access.routes, String(request.route)], input.adminName, db);
        }
        await db.execute(sql`
          UPDATE customerAccessRequests
          SET status=${input.approved ? 'approved' : 'denied'}, pendingKey=NULL, analyzedAt=NOW(), analyzedBy=${input.adminName}
          WHERE id=${input.id}
        `);
        return { success: true };
      }),
  }),

  // === SENHAS VIP ===
  access: router({
    validate: publicProcedure
      .input(z.object({ code: z.string().min(1), phone: z.string().optional() }))
      .mutation(async ({ input }) => {
        // Verificar se é senha do sorteio
        const raffleEnabled = await getSetting('raffle_password_enabled');
        const rafflePassword = await getSetting('raffle_password');
        if (raffleEnabled === '1' && rafflePassword && rafflePassword.trim() !== '' && input.code.trim() === rafflePassword.trim()) {
          if (input.phone) await updateCustomerLastAccess(input.phone);
          return { valid: true as const, type: 'raffle', clientName: null, expiresAt: null };
        }
        const result = await validateAccessCode(input.code, input.phone);
        if (result.valid && input.phone) {
          await updateCustomerLastAccess(input.phone);
        }
        return result;
      }),

    create: adminProcedure
      .input(z.object({ code: z.string().min(3), clientName: z.string().optional(), maxUses: z.number().min(1).optional(), timeOnly: z.boolean().optional(), allowedProductIds: z.array(z.number()).optional() }))
      .mutation(async ({ input }) => {
        try {
          const accessCode = await createAccessCode(input.code, input.clientName, input.maxUses || 1, input.timeOnly || false, input.allowedProductIds);
          return { success: true, accessCode };
        } catch (error) {
          return { success: false, message: 'Erro ao criar senha. Código já existe?' };
        }
      }),

    list: adminProcedure.query(async () => await listAccessCodes()),

    toggle: adminProcedure
      .input(z.object({ id: z.number(), status: z.enum(['active', 'disabled']) }))
      .mutation(async ({ input }) => {
        await toggleAccessCode(input.id, input.status);
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteAccessCode(input.id);
        return { success: true };
      }),

    renew: adminProcedure
      .input(z.object({ id: z.number(), minutes: z.number().min(1).optional() }))
      .mutation(async ({ input }) => {
        const updated = await renewAccessCode(input.id, input.minutes);
        if (!updated) return { success: false, message: 'Senha não encontrada' };
        return { success: true, accessCode: updated };
      }),

    listPhones: adminProcedure
      .input(z.object({ codeId: z.number() }))
      .query(async ({ input }) => {
        return await listAccessCodePhones(input.codeId);
      }),

    listAllPhones: adminProcedure
      .query(async () => {
        return await listAllAccessCodePhones();
      }),
  }),

  // === CUPONS ===
  coupons: router({
    create: adminProcedure
      .input(z.object({
        code: z.string().min(2),
        discountType: z.enum(['percentage', 'fixed']),
        discountValue: z.number().min(1),
        maxUses: z.number().min(1).default(1),
        expiresAt: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        try {
          const coupon = await createCoupon({
            code: input.code, discountType: input.discountType,
            discountValue: input.discountValue, maxUses: input.maxUses,
            expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          });
          return { success: true, coupon };
        } catch (error) {
          return { success: false, message: 'Erro ao criar cupom. Código já existe?' };
        }
      }),

    list: adminProcedure.query(async () => await listCoupons()),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => { await deleteCoupon(input.id); return { success: true }; }),

    toggle: adminProcedure
      .input(z.object({ id: z.number(), status: z.enum(['active', 'disabled']) }))
      .mutation(async ({ input }) => { await toggleCoupon(input.id, input.status); return { success: true }; }),

    validate: publicProcedure
      .input(z.object({ code: z.string().min(1) }))
      .mutation(async ({ input }) => await validateCoupon(input.code)),
  }),

  // === PRODUTOS / CARDS DE SERVIÍ"¡O ===
  products: router({
    // Público: listar produtos ativos com opções, perguntas, documentos e tiers de garantia por opção
    listActive: publicProcedure.query(async () => {
      const prods = await listActiveProducts();
      const now = Date.now();
      const result = [];
      for (const p of prods) {
        const options = await listProductOptions(p.id);
        const activeOptions = options.filter(o => o.isActive === 1);
        const optionsWithRelations = [];
        for (const opt of activeOptions) {
          // Auto-expirar promoção: se promoEndsAt já passou, reverter preço
          if (opt.promoEndsAt && Number(opt.promoEndsAt) > 0 && Number(opt.promoEndsAt) <= now && opt.originalPrice) {
            await updateProductOption(opt.id, { price: opt.originalPrice, originalPrice: '', promoEndsAt: null });
            opt.price = opt.originalPrice;
            opt.originalPrice = '';
            opt.promoEndsAt = null;
          }
          const questions = await listOptionQuestions(opt.id);
          const documents = await listOptionDocuments(opt.id);
          const tiers = await listWarrantyTiers(opt.id);
          optionsWithRelations.push({ ...opt, questions, documents, warrantyTiers: tiers.filter(t => t.isActive === 1) });
        }
        result.push({ ...p, options: optionsWithRelations });
      }
      return result;
    }),

    // Admin: listar todos os produtos com opções, perguntas, documentos e tiers de garantia por opção
    list: adminProcedure.query(async () => {
      const prods = await listProducts();
      const now = Date.now();
      const result = [];
      for (const p of prods) {
        const options = await listProductOptions(p.id);
        const optionsWithRelations = [];
        for (const opt of options) {
          // Auto-expirar promoção: se promoEndsAt já passou, reverter preço
          if (opt.promoEndsAt && Number(opt.promoEndsAt) > 0 && Number(opt.promoEndsAt) <= now && opt.originalPrice) {
            await updateProductOption(opt.id, { price: opt.originalPrice, originalPrice: '', promoEndsAt: null });
            opt.price = opt.originalPrice;
            opt.originalPrice = '';
            opt.promoEndsAt = null;
          }
          const questions = await listOptionQuestions(opt.id);
          const documents = await listOptionDocuments(opt.id);
          const tiers = await listWarrantyTiers(opt.id);
          optionsWithRelations.push({ ...opt, questions, documents, warrantyTiers: tiers });
        }
        result.push({ ...p, options: optionsWithRelations });
      }
      return result;
    }),

    create: adminProcedure
      .input(z.object({
        name: z.string().min(1), description: z.string().optional(),
        iconUrl: z.string().optional(), buttonText: z.string().optional(),
        requireProfilePhoto: z.boolean().optional(), requireCarDocument: z.boolean().optional(),
        requireAlvara: z.boolean().optional(), requireCondutaxi: z.boolean().optional(),
        requireVehicle2016: z.boolean().optional(), isPdfOnly: z.boolean().optional(),
        showYearField: z.boolean().optional(), sortOrder: z.number().optional(),
        cardColor: z.string().optional(),
        cardBgColor: z.string().optional(),
        cardTextColor: z.string().optional(),
        cardBtnColor: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        try {
          const product = await createProduct(input);
          return { success: true, product };
        } catch (error) {
          return { success: false, message: 'Erro ao criar produto' };
        }
      }),

    update: adminProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(), description: z.string().nullable().optional(),
        iconUrl: z.string().nullable().optional(), buttonText: z.string().optional(),
        requireProfilePhoto: z.number().optional(), requireCarDocument: z.number().optional(),
        requireAlvara: z.number().optional(), requireCondutaxi: z.number().optional(),
        requireVehicle2016: z.number().optional(), isPdfOnly: z.number().optional(),
        showYearField: z.number().optional(), cardColor: z.string().nullable().optional(),
        cardBgColor: z.string().nullable().optional(),
        cardTextColor: z.string().nullable().optional(),
        cardBtnColor: z.string().nullable().optional(),
        isActive: z.number().optional(), sortOrder: z.number().optional(),
        resellerDiscount: z.number().nullable().optional(), // % de desconto por produto para revendedores
        deliveryDays: z.string().nullable().optional(), // Ex: "2 a 5 dias úteis"
      }))
      .mutation(async ({ input }) => {
        const { id, resellerDiscount, ...data } = input;
        const updateData: any = { ...data };
        if (resellerDiscount !== undefined) {
          updateData.resellerDiscount = resellerDiscount !== null ? String(resellerDiscount) : null;
        }
        await updateProduct(id, updateData);
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => { await deleteProduct(input.id); return { success: true }; }),

    toggle: adminProcedure
      .input(z.object({ id: z.number(), isActive: z.boolean() }))
      .mutation(async ({ input }) => { await toggleProduct(input.id, input.isActive); return { success: true }; }),

    reorder: adminProcedure
      .input(z.object({ orderedIds: z.array(z.number()) }))
      .mutation(async ({ input }) => {
        for (let i = 0; i < input.orderedIds.length; i++) {
          await updateProduct(input.orderedIds[i], { sortOrder: i });
        }
        return { success: true };
      }),

    uploadImage: adminProcedure
      .input(z.object({
        productId: z.number(),
        imageBase64: z.string().min(1),
        mimeType: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        try {
          const mime = input.mimeType || 'image/png';
          const ext = mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' : mime.includes('webp') ? 'webp' : 'png';
          const randomSuffix = Math.random().toString(36).substring(2, 10);
          const fileKey = `product-images/card-${input.productId}-${randomSuffix}.${ext}`;
          const { url } = await storagePut(fileKey, Buffer.from(input.imageBase64, 'base64'), mime);
          await updateProduct(input.productId, { iconUrl: url });
          return { success: true, url };
        } catch (error) {
          console.error('[Products] Erro ao fazer upload da imagem:', error);
          return { success: false, message: 'Erro ao fazer upload da imagem' };
        }
      }),
  }),

  // === OPÍ"¡Í"¢ES DE PRODUTO ===
  productOptions: router({
    list: adminProcedure
      .input(z.object({ productId: z.number() }))
      .query(async ({ input }) => await listProductOptions(input.productId)),

    create: adminProcedure
      .input(z.object({
        productId: z.number(), label: z.string().min(1),
        price: z.string().min(1), type: z.string().optional(),
        sortOrder: z.number().optional(),
        requireProfilePhoto: z.boolean().optional(),
        requireCarDocument: z.boolean().optional(),
        requireAlvara: z.boolean().optional(),
        requireCondutaxi: z.boolean().optional(),
        requireVehicle2016: z.boolean().optional(),
        isPdfOnly: z.boolean().optional(),
        showYearField: z.boolean().optional(),
        docNameMode: z.string().optional(),
        docCustomName: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        try {
          const option = await createProductOption(input);
          return { success: true, option };
        } catch (error) {
          return { success: false, message: 'Erro ao criar opção' };
        }
      }),

    update: adminProcedure
      .input(z.object({
        id: z.number(), label: z.string().optional(), price: z.string().optional(),
        originalPrice: z.string().optional(),
        type: z.string().optional(),
        sortOrder: z.number().optional(), isActive: z.number().optional(),
        requireProfilePhoto: z.number().optional(),
        requireCarDocument: z.number().optional(),
        requireAlvara: z.number().optional(),
        requireCondutaxi: z.number().optional(),
        requireVehicle2016: z.number().optional(),
        isPdfOnly: z.number().optional(),
        showYearField: z.number().optional(),
        docNameMode: z.string().optional(),
        docCustomName: z.string().optional(),
        warranty: z.string().optional(),
        commissionValue: z.number().int().min(0).optional(), // valor em centavos
        description: z.string().optional(),
        promoEndsAt: z.number().nullable().optional(), // timestamp ms UTC
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updateProductOption(id, data);
        return { success: true };
      }),

        delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        // Deletar documentos associados Â  opção
        await deleteOptionDocumentsByOptionId(input.id);
        // Deletar tiers de garantia associados
        await deleteWarrantyTiersByOptionId(input.id);
        await deleteProductOption(input.id);
        return { success: true };
      }),
    reorder: adminProcedure
      .input(z.object({ orderedIds: z.array(z.number()) }))
      .mutation(async ({ input }) => {
        for (let i = 0; i < input.orderedIds.length; i++) {
          await updateProductOption(input.orderedIds[i], { sortOrder: i });
        }
        return { success: true };
      }),
  }),
  // === TIERS DE GARANTIA POR OPÍ"¡ÍÆ’O ===
  warrantyTiers: router({
    list: adminProcedure
      .input(z.object({ optionId: z.number() }))
      .query(async ({ input }) => await listWarrantyTiers(input.optionId)),

    create: adminProcedure
      .input(z.object({
        optionId: z.number(),
        warrantyType: z.string().min(1),
        warrantyValue: z.number().int().min(0),
        warrantyLabel: z.string().optional(),
        price: z.string().min(1),
        originalPrice: z.string().optional(),
        sortOrder: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const tier = await createWarrantyTier(input);
        return { success: true, tier };
      }),

    update: adminProcedure
      .input(z.object({
        id: z.number(),
        warrantyType: z.string().optional(),
        warrantyValue: z.number().int().min(0).optional(),
        warrantyLabel: z.string().optional(),
        price: z.string().optional(),
        originalPrice: z.string().optional(),
        sortOrder: z.number().optional(),
        isActive: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updateWarrantyTier(id, data);
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteWarrantyTier(input.id);
        return { success: true };
      }),
  }),

  // === DOCUMENTOS DINÂMICOS POR OPÍ"¡ÍÆ’O ===
  optionDocuments: router({
    list: adminProcedure
      .input(z.object({ optionId: z.number() }))
      .query(async ({ input }) => await listOptionDocuments(input.optionId)),

    create: adminProcedure
      .input(z.object({
        optionId: z.number(),
        label: z.string().min(1),
        exampleImageUrl: z.string().optional(),
        sortOrder: z.number().optional(),
        instruction: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        try {
          const doc = await createOptionDocument(input);
          return { success: true, document: doc };
        } catch (error) {
          return { success: false, message: 'Erro ao criar documento' };
        }
      }),

    update: adminProcedure
      .input(z.object({
        id: z.number(),
        label: z.string().min(1).optional(),
        exampleImageUrl: z.string().nullable().optional(),
        inputSource: z.enum(["camera", "gallery", "both"]).optional(),
        sortOrder: z.number().optional(),
        instruction: z.string().nullable().optional(),
        exampleText: z.string().nullable().optional(),
      }))
      .mutation(async ({ input }) => {
        try {
          const { id, ...data } = input;
          const doc = await updateOptionDocument(id, data);
          return { success: true, document: doc };
        } catch (error) {
          return { success: false, message: 'Erro ao atualizar documento' };
        }
      }),

    uploadExampleImage: adminProcedure
      .input(z.object({
        docId: z.number(),
        imageBase64: z.string().min(1),
        mimeType: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        try {
          const mime = input.mimeType || 'image/png';
          const ext = mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' : mime.includes('webp') ? 'webp' : 'png';
          const randomSuffix = Math.random().toString(36).substring(2, 10);
          const fileKey = `doc-examples/doc-${input.docId}-${randomSuffix}.${ext}`;
          const { url } = await storagePut(fileKey, Buffer.from(input.imageBase64, 'base64'), mime);
          await updateOptionDocument(input.docId, { exampleImageUrl: url });
          return { success: true, url };
        } catch (error) {
          console.error('[OptionDocuments] Erro ao fazer upload da imagem exemplo:', error);
          return { success: false, message: 'Erro ao fazer upload da imagem' };
        }
      }),

    removeExampleImage: adminProcedure
      .input(z.object({ docId: z.number() }))
      .mutation(async ({ input }) => {
        await updateOptionDocument(input.docId, { exampleImageUrl: null });
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteOptionDocument(input.id);
        return { success: true };
      }),
  }),

  // === PERGUNTAS POR OPÍ"¡ÍÆ’O DE COMPRA ===
  productQuestions: router({
    listByOption: adminProcedure
      .input(z.object({ optionId: z.number() }))
      .query(async ({ input }) => await listOptionQuestions(input.optionId)),

    // Mantém compatibilidade
    list: adminProcedure
      .input(z.object({ productId: z.number() }))
      .query(async ({ input }) => await listProductQuestions(input.productId)),

    create: adminProcedure
      .input(z.object({
        productId: z.number(), optionId: z.number().optional(), question: z.string().min(1),
        fieldType: z.enum(['text', 'select', 'textarea']).optional(),
        options: z.string().optional(), isRequired: z.boolean().optional(),
        sortOrder: z.number().optional(),
        parentQuestionId: z.number().nullable().optional(),
        triggerOption: z.string().nullable().optional(),
      }))
      .mutation(async ({ input }) => {
        try {
          const q = await createProductQuestion(input);
          return { success: true, question: q };
        } catch (error) {
          return { success: false, message: 'Erro ao criar pergunta' };
        }
      }),

    update: adminProcedure
      .input(z.object({
        id: z.number(), question: z.string().optional(),
        fieldType: z.enum(['text', 'select', 'textarea']).optional(),
        options: z.string().nullable().optional(),
        isRequired: z.number().optional(), sortOrder: z.number().optional(),
        parentQuestionId: z.number().nullable().optional(),
        triggerOption: z.string().nullable().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updateProductQuestion(id, data);
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => { await deleteProductQuestion(input.id); return { success: true }; }),

    reorder: adminProcedure
      .input(z.object({ items: z.array(z.object({ id: z.number(), sortOrder: z.number() })) }))
      .mutation(async ({ input }) => {
        await Promise.all(input.items.map(item => updateProductQuestion(item.id, { sortOrder: item.sortOrder })));
        return { success: true };
      }),

    // Copia todas as perguntas de uma opção de origem para uma opção de destino (substituindo as existentes)
    copyFromOption: adminProcedure
      .input(z.object({ fromOptionId: z.number(), toOptionId: z.number(), toProductId: z.number() }))
      .mutation(async ({ input }) => {
        const { fromOptionId, toOptionId, toProductId } = input;
        // Busca todas as perguntas da opção de origem
        const sourceQuestions = await listOptionQuestions(fromOptionId);
        // Deleta todas as perguntas existentes na opção de destino
        const existingQuestions = await listOptionQuestions(toOptionId);
        await Promise.all(existingQuestions.map(q => deleteProductQuestion(q.id)));
        // Mapa de IDs antigos para novos (para reconstruir parentQuestionId)
        const idMap: Record<number, number> = {};
        // Primeiro, insere perguntas raiz (sem parentQuestionId)
        const rootQuestions = sourceQuestions.filter(q => !q.parentQuestionId);
        for (const q of rootQuestions) {
          const created = await createProductQuestion({
            productId: toProductId,
            optionId: toOptionId,
            question: q.question,
            fieldType: q.fieldType,
            options: q.options ?? undefined,
            isRequired: q.isRequired === 1,
            sortOrder: q.sortOrder,
            parentQuestionId: null,
            triggerOption: null,
          });
          idMap[q.id] = created.id;
        }
        // Depois, insere sub-perguntas com parentQuestionId mapeado
        const subQuestions = sourceQuestions.filter(q => q.parentQuestionId);
        for (const q of subQuestions) {
          const newParentId = q.parentQuestionId ? (idMap[q.parentQuestionId] ?? null) : null;
          const created = await createProductQuestion({
            productId: toProductId,
            optionId: toOptionId,
            question: q.question,
            fieldType: q.fieldType,
            options: q.options ?? undefined,
            isRequired: q.isRequired === 1,
            sortOrder: q.sortOrder,
            parentQuestionId: newParentId,
            triggerOption: q.triggerOption ?? null,
          });
          idMap[q.id] = created.id;
        }
        return { success: true, count: sourceQuestions.length };
      }),
  }),

  // === CONFIGURAÍ"¡Í"¢ES DO SITE ===
  settings: router({
    getAll: publicProcedure.query(async () => await getAllSettings()),

    update: adminProcedure
      .input(z.object({ settings: z.record(z.string(), z.string()) }))
      .mutation(async ({ input }) => {
        // Formata numero do WhatsApp para garantir que tenha codigo do pais (55)
        if (input.settings.whatsapp_number) {
          const digits = input.settings.whatsapp_number.replace(/\D/g, '');
          if (digits && !digits.startsWith('55')) {
            input.settings.whatsapp_number = '55' + digits;
          }
        }
        await upsertSettings(input.settings);
        return { success: true };
      }),

    // Template editável da mensagem WhatsApp de atualização de pedido
    getWhatsappOrderTemplate: adminProcedure.query(async () => {
      const value = await getSetting('whatsapp_order_template');
      return { template: value };
    }),

        saveWhatsappOrderTemplate: adminProcedure
      .input(z.object({ template: z.string() }))
      .mutation(async ({ input }) => {
        await upsertSetting('whatsapp_order_template', input.template);
        return { success: true };
      }),
    // Template editável da mensagem WhatsApp de dados de login
    getWhatsappLoginTemplate: adminProcedure.query(async () => {
      const value = await getSetting('whatsapp_login_template');
      return { template: value };
    }),
    saveWhatsappLoginTemplate: adminProcedure
      .input(z.object({ template: z.string() }))
      .mutation(async ({ input }) => {
        await upsertSetting('whatsapp_login_template', input.template);
        return { success: true };
      }),
  }),
  // === UPLOADS / ENVIO DE PEDIDO ===
  uploads: router({
    submitFiles: publicProcedure
      .input(z.object({
        clientName: z.string(), service: z.string(), nameOption: z.string(),
        referrerName: z.string().optional(), referrerPhone: z.string().optional(),
        bypassCode: z.string().optional(),
        // Documentos dinâmicos: array de { label, data (base64), mime } OU { label, url, mime } (já enviados)
        documents: z.array(z.object({
          label: z.string(),
          data: z.string().optional(),   // base64 (legado)
          url: z.string().optional(),    // URL já enviada via /api/upload/client-file
          fileKey: z.string().optional(),
          mime: z.string().optional(),
        })).optional(),
        // Campos legados mantidos para compatibilidade
        profilePhoto: z.string().optional(), carDocument: z.string().optional(),
        carDocumentMime: z.string().optional(), carDocumentYear: z.string().optional(),
        alvara: z.string().optional(), alvaraMime: z.string().optional(),
        condutaxi: z.string().optional(), condutaxiMime: z.string().optional(),
        phone: z.string().optional(), city: z.string().optional(),
        email: z.string().email('Email inválido').optional(),
        accessCode: z.string().optional(),
        cpToken: z.string().optional(), // Novo sistema de senha de cliente
        couponCode: z.string().optional(),
        paymentProof: z.string().optional(),       // base64 (legado)
        paymentProofUrl: z.string().optional(),    // URL já enviada via /api/upload/client-file
        paymentProofMime: z.string().optional(),
        answers: z.string().optional(),
        docNameMode: z.string().optional(),
        docCustomName: z.string().optional(),
        price: z.string().optional(), // valor pago pelo cliente (ex: "R$ 350,00")
        thirdPartyName: z.string().optional(), // nome do cliente final (revendedor)
        thirdPartyPhone: z.string().optional(), // telefone do cliente final (revendedor)
        resellerDiscountApplied: z.number().optional(), // valor do desconto aplicado em R$
        // Agrupamento de carrinho
        cartGroupId: z.string().optional(), // ID único do grupo de carrinho
        cartTotal: z.number().optional(), // total bruto do carrinho em R$
        cartCouponCode: z.string().optional(), // cupom aplicado no carrinho
        cartCouponDiscount: z.number().optional(), // valor do desconto do cupom em R$
        cartItemIndex: z.number().optional(), // índice do item no carrinho (0 = primeiro)
        cartItemCount: z.number().optional(), // total de itens no carrinho
        cartItems: z.string().optional(), // JSON com todos os itens do carrinho (para email/notificação)
      }))
      .mutation(async ({ input, ctx }) => {
        // Capturar IP do cliente
        const clientIp = (ctx.req.headers['x-forwarded-for'] as string || '').split(',')[0].trim() || ctx.req.socket?.remoteAddress || 'unknown';
        if (clientIp && clientIp !== 'unknown') {
          const ipBlocked = await isIpBlocked(clientIp);
          if (ipBlocked) return { success: false, message: 'Acesso bloqueado. Entre em contato pelo WhatsApp.' };
        }
        // Verificar blocklist por telefone
        if (input.phone) {
          const phoneBlock = await checkPhoneBlockedAndBlockIp(input.phone, clientIp, 'fazer_pedido');
          if (phoneBlock.blocked) return { success: false, message: 'Acesso bloqueado. Entre em contato pelo WhatsApp.' };
        }
        logIpAccess(clientIp, 'order', input.phone, undefined).catch(() => {});
        try {
          // Validar acesso: aceitar accessCode (sistema antigo) OU cpToken (novo sistema)
          let cpTokenValid = false;
          let cpTokenPhone = '';
          if (input.cpToken) {
            // Verificar se o cpToken é válido via banco
            try {
              const dbInst = await (await import('./db')).getDb();
              const { eq: eqDrizzle } = await import('drizzle-orm');
              const { customerPasswordSessions: cpSessions } = await import('../drizzle/schema');
              const sessRows = await (dbInst as any).select().from(cpSessions).where(eqDrizzle(cpSessions.token, input.cpToken.trim())).limit(1);
              const sess = sessRows?.[0];
              if (!sess || new Date(sess.expiresAt) < new Date()) {
                return { success: false, message: 'Sessão expirada. Faça login novamente.' };
              }
              cpTokenValid = true;
              // Extrair phone da sessão para garantir que está disponível mesmo quando input.phone vier vazio
              cpTokenPhone = sess.phone?.replace(/\D/g, '') || '';
            } catch {
              return { success: false, message: 'Erro ao verificar sessão. Tente novamente.' };
            }
          }
          if (!cpTokenValid) {
            // Sistema antigo: validar via accessCode
            const accessCodeToUse = input.accessCode || '';
            if (!accessCodeToUse) {
              return { success: false, message: 'Sessão expirada. Faça login novamente.' };
            }
            const canSubmit = await checkAccessCodeCanSubmit(accessCodeToUse, input.phone);
            if (!canSubmit.canSubmit) {
              return { success: false, message: canSubmit.reason || 'Esta senha já foi utilizada.' };
            }
          }

          const emailTo = await getSetting('email_to') || 'h2@h2colombiano.com';
          const whatsappNumberRaw = await getSetting('whatsapp_number') || '5511978307371';
          const whatsappNumber = whatsappNumberRaw.replace(/[^\d+]/g, '');

          // Helper para enviar email com timeout de 20s (evita travar a requisição)















          const sendEmailWithTimeout = async (mailOptions: { from?: string; to: string; subject: string; html: string; text?: string; attachments?: any[] }, label: string): Promise<boolean> => {
            try {
              await Promise.race([
                sendMailDirect(mailOptions),
                new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Timeout: ${label}`)), 20000)),
              ]);
              return true;
            } catch (e) {
              console.error(`[Email] ${label} falhou:`, e);
              return false;
            }
          };







          // Comprovante PIX: aceitar URL já enviada (novo fluxo) ou base64 (legado)
          let paymentProofUrl = input.paymentProofUrl || '';
          if (!paymentProofUrl && input.paymentProof) {
            try {
              const proofMime = input.paymentProofMime || 'image/jpeg';
              const proofExt = proofMime === 'application/pdf' ? 'pdf' : proofMime === 'image/png' ? 'png' : 'jpg';
              const randomSuffix = Math.random().toString(36).substring(2, 10);
              const fileKey = `comprovantes/${input.clientName.replace(/\s+/g, '-')}-${randomSuffix}.${proofExt}`;
              const { url } = await storagePut(fileKey, Buffer.from(input.paymentProof, 'base64'), proofMime);
              paymentProofUrl = url;
            } catch (uploadError) {
              console.error('[S3] Erro ao fazer upload do comprovante:', uploadError);
            }
          }

          // Parse answers (structured for email template)
          let parsedAnswers: { question: string; answer: string }[] = [];
          if (input.answers) {
            try {
              parsedAnswers = JSON.parse(input.answers) as { question: string; answer: string }[];
            } catch { /* ignore */ }
          }

          // Gerar prefixo do nome do documento baseado no docNameMode
          const docPrefix = (() => {
            const mode = input.docNameMode || 'none';
            const name = input.clientName || 'cliente';
            if (mode === 'first_name') return name.split(' ')[0].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/gi, '');
            if (mode === 'full_name') return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/gi, '');
            if (mode === 'random') return Math.random().toString(36).substring(2, 10);
            if (mode === 'custom' && input.docCustomName) return input.docCustomName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/gi, '');
            return '';
          })();
          const prefix = docPrefix ? `${docPrefix}-` : '';

          // Salvar todos os documentos no S3 e registrar no banco (orderFiles)
          const docListHtml: string[] = [];
          // Função auxiliar para salvar arquivo no S3 e no banco
          const saveDocToStorage = async (label: string, data: string, mime: string, regId: number, phone: string) => {
            try {
              const r = resolveFileExt(mime);
              const safeLabel = label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/gi, '');
              const randomSuffix = Math.random().toString(36).substring(2, 10);
              const fileKey = `order-docs/${phone}-${safeLabel}-${randomSuffix}.${r.ext}`;
              const { url } = await storagePut(fileKey, Buffer.from(data, 'base64'), r.contentType);
              await addOrderFile({ registrationId: regId, customerPhone: phone, label, fileUrl: url, fileKey, mimeType: r.contentType });
              docListHtml.push(`<li>${label}: <a href="${url}">Ver</a></li>`);
            } catch (e) {
              console.error(`[S3] Erro ao salvar documento "${label}":`, e);
              docListHtml.push(`<li>${label}: erro ao salvar</li>`);
            }
          };

          // Obter registrationId para associar os arquivos
          // Garantir que temos o phone: usar input.phone ou extrair do cpToken
          const effectivePhone = (input.phone || cpTokenPhone || '').replace(/\D/g, '');

          let docRegId = 0;
          try {
            const db2 = await (await import('./db')).getDb();
            if (db2 && effectivePhone) {
              const phoneRow2 = await db2.execute(`SELECT id FROM accessCodePhones WHERE REGEXP_REPLACE(phone, '[^0-9]', '') = '${effectivePhone}' ORDER BY accessedAt DESC LIMIT 1`);
              docRegId = (phoneRow2[0] as unknown as Array<{ id: number }>)[0]?.id || 0;
            }
          } catch (e) { console.error('[OrderFiles] Erro ao obter regId:', e); }

          // Documentos dinâmicos (novo sistema)
          // Suporta tanto base64 (legado) quanto URL já enviada via /api/upload/client-file
          if (input.documents && input.documents.length > 0) {
            for (const doc of input.documents) {
              if (doc.url) {
                // Arquivo já enviado: apenas registrar no banco
                try {
                  const proofKey = doc.fileKey || doc.url.replace('/manus-storage/', '');
                  await addOrderFile({ registrationId: docRegId, customerPhone: effectivePhone || 'desconhecido', label: doc.label, fileUrl: doc.url, fileKey: proofKey, mimeType: doc.mime || 'image/jpeg' });
                  docListHtml.push(`<li>${doc.label}: <a href="${doc.url}">Ver</a></li>`);
                } catch (e) { console.error(`[OrderFiles] Erro ao registrar doc "${doc.label}":`, e); }
              } else if (doc.data) {
                // Arquivo em base64: fazer upload
                await saveDocToStorage(doc.label, doc.data, doc.mime || 'image/jpeg', docRegId, effectivePhone || 'desconhecido');
              }
            }
          }

          // Campos legados (compatibilidade com dados antigos)
          if (input.profilePhoto) {
            await saveDocToStorage('Foto de Perfil', input.profilePhoto, 'image/jpeg', docRegId, input.phone || 'desconhecido');
          }
          if (input.carDocument) {
            await saveDocToStorage('Documento do Carro', input.carDocument, input.carDocumentMime || 'image/jpeg', docRegId, input.phone || 'desconhecido');
          }
          if (input.alvara) {
            await saveDocToStorage('Alvará', input.alvara, input.alvaraMime || 'image/jpeg', docRegId, input.phone || 'desconhecido');
          }
          if (input.condutaxi) {
            await saveDocToStorage('Condutaxi', input.condutaxi, input.condutaxiMime || 'image/jpeg', docRegId, input.phone || 'desconhecido');
          }

          // Comprovante PIX: registrar no banco (URL já obtida acima)
          if (paymentProofUrl) {
            try {
              const proofMime2 = input.paymentProofMime || 'image/jpeg';
              const proofKey = paymentProofUrl.replace('/manus-storage/', '');
              await addOrderFile({ registrationId: docRegId, customerPhone: effectivePhone || 'desconhecido', label: 'Comprovante PIX', fileUrl: paymentProofUrl, fileKey: proofKey, mimeType: proofMime2 });
              docListHtml.push(`<li>Comprovante PIX: <a href="${paymentProofUrl}">Ver</a></li>`);
            } catch (e) { console.error('[OrderFiles] Erro ao registrar comprovante:', e); }
          }

          // Montar seção de serviços (carrinho ou item único)
          const isCartOrder = !!(input.cartGroupId && (input.cartItemCount ?? 1) > 1);
          let servicoHtml = '';
          if (isCartOrder && input.cartItems) {
            try {
              const cartItemsList = JSON.parse(input.cartItems) as Array<{ service: string; nameOption: string; price: string }>;
              servicoHtml = `<h3>CARRINHO (${cartItemsList.length} itens)</h3>` +
                cartItemsList.map((ci, idx) => `<p><strong>${idx + 1}. ${ci.service}</strong> — ${ci.nameOption} — ${ci.price}</p>`).join('') +
                (input.cartCouponCode ? `<p><strong>Cupom:</strong> ${input.cartCouponCode} (desconto: R$ ${(input.cartCouponDiscount ?? 0).toFixed(2).replace('.', ',')})</p>` : '') +
                (input.cartTotal ? `<p><strong>Total Pago:</strong> R$ ${(input.cartTotal - (input.cartCouponDiscount ?? 0)).toFixed(2).replace('.', ',')}</p>` : '');
            } catch { servicoHtml = `<p><strong>Serviço:</strong> ${input.service}</p><p><strong>Opção:</strong> ${input.nameOption}</p>`; }
          } else {
            servicoHtml = `<p><strong>Serviço:</strong> ${input.service}</p><p><strong>Opção:</strong> ${input.nameOption}</p>`;
          }

          // Extrair URLs dos documentos para o template
          const docLinks: { label: string; url: string }[] = [];
          for (const html of docListHtml) {
            const labelMatch = html.match(/^<li>([^:]+):/);
            const urlMatch = html.match(/href="([^"]+)"/);
            if (labelMatch && urlMatch) docLinks.push({ label: labelMatch[1], url: urlMatch[1] });
          }

          const emailBranding = await getEmailBranding();

          const emailContent = emailNovoPedidoAdmin({
            ...emailBranding,
            clientName: input.clientName,
            phone: input.phone || 'Não informado',
            service: input.service,
            option: input.nameOption,
            email: input.email,
            city: input.city || undefined,
            referrer: input.referrerName ? `${input.referrerName}${input.referrerPhone ? ` (${input.referrerPhone})` : ''}` : undefined,
            carDocumentYear: input.carDocumentYear || undefined,
            paymentProofUrl: paymentProofUrl || undefined,
            answers: parsedAnswers.length > 0 ? parsedAnswers : undefined,
            documents: docLinks.length > 0 ? docLinks : undefined,
          });

          // Enviar email admin com timeout (não-bloqueante)
          const emailSent = await sendEmailWithTimeout({
            from: '"H2 COLOMBIANO" <h2@h2colombiano.com>',
            to: emailTo,
            subject: `Novo Pedido - ${input.service} - ${input.clientName}`,
            html: emailContent,
          }, 'email admin');
          if (emailSent) console.log('[Email] Enviado com sucesso para:', emailTo);

          // WhatsApp notification
          try {
            // Montar mensagem completa do WhatsApp
            let whatsappMsg = `NOVO PEDIDO - H2 COLOMBIANO`;

            // Quem indicou (apenas se preenchido)
            if (input.referrerName || input.referrerPhone) {
              whatsappMsg += `\nQUEM INDICOU:`;
              if (input.referrerName) whatsappMsg += `\nNome: ${input.referrerName}`;
              if (input.referrerPhone) whatsappMsg += `\nTelefone: ${input.referrerPhone}`;
            }

            // Dados do cliente
            whatsappMsg += `\nCLIENTE:`;
            whatsappMsg += `\nNome: ${input.clientName}`;
            if (input.phone) whatsappMsg += `\nTelefone: ${input.phone}`;
            if (input.city) whatsappMsg += `\nCidade: ${input.city}`;

            // Serviços (carrinho ou item único)
            if (isCartOrder && input.cartItems) {
              try {
                const cartItemsList2 = JSON.parse(input.cartItems) as Array<{ service: string; nameOption: string; price: string }>;
                const totalItens = cartItemsList2.length;
                cartItemsList2.forEach((ci, idx) => {
                  whatsappMsg += `\n\n====== PEDIDO ${idx + 1} DE ${totalItens} ======`;
                  whatsappMsg += `\nServico: ${ci.service}`;
                  whatsappMsg += `\nOpcao: ${ci.nameOption}`;
                  whatsappMsg += `\nValor: ${ci.price}`;
                });
                const totalPago = (input.cartTotal ?? 0) - (input.cartCouponDiscount ?? 0);
                if (totalPago > 0) whatsappMsg += `\n\nValor Total: ${totalPago.toFixed(2).replace('.', ',')}` ;
                if (input.cartCouponCode) whatsappMsg += `\nCupom: ${input.cartCouponCode}`;
              } catch (_e) {
                whatsappMsg += `\n\nServico: ${input.service}\nOpcao: ${input.nameOption}`;
                if (input.price) whatsappMsg += `\nValor: ${input.price}`;
              }
            } else {
              whatsappMsg += `\n\nServico: ${input.service}`;
              whatsappMsg += `\nOpcao: ${input.nameOption}`;
              if (input.price) whatsappMsg += `\nValor: ${input.price}`;
            }

            // Comprovante PIX
            whatsappMsg += `\nComprovante PIX: ${paymentProofUrl ? 'Enviado' : 'Nao enviado'}`;

            // Respostas do formulário
            if (input.answers) {
              try {
                const answersArr = JSON.parse(input.answers) as { question: string; answer: string; depth?: number }[];
                if (answersArr.length > 0) {
                  whatsappMsg += `\n\nRESPOSTAS DO FORMULARIO:`;
                  answersArr.forEach(a => {
                    const depth = a.depth || 0;
                    whatsappMsg += `\n-------------------------`;
                    if (depth === 0) {
                      whatsappMsg += `\n*************************`;
                      whatsappMsg += `\n${a.question}`;
                      whatsappMsg += `\n${a.answer}`;
                    } else {
                      // Sub-pergunta: indentar com seta para mostrar hierarquia
                      const indent = '  '.repeat(depth);
                      whatsappMsg += `\n${indent}\u21b3 ${a.question}`;
                      whatsappMsg += `\n${indent}  ${a.answer}`;
                    }
                  });
                  whatsappMsg += `\n-------------------------`;
                  whatsappMsg += `\n*************************`;
                }
              } catch { /* ignore */ }
            }

            // Documentos
            if (docListHtml.length > 0) {
              whatsappMsg += `\n\nARQUIVOS:`;
              // Extrair URLs do HTML dos documentos
              docListHtml.forEach(docHtml => {
                const labelMatch = docHtml.match(/<li>([^:]+):/i);
                const urlMatch = docHtml.match(/href="([^"]+)"/);
                if (labelMatch && urlMatch) {
                  whatsappMsg += `\n-------------------------`;
                  whatsappMsg += `\n*************************`;
                  whatsappMsg += `\n${labelMatch[1].trim()}`;
                  whatsappMsg += `\n${urlMatch[1]}`;
                }
              });
              whatsappMsg += `\n-------------------------`;
              whatsappMsg += `\n*************************`;
            }

                        const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsappMsg)}`;
            console.log('[WhatsApp] Notificacao disponivel em:', whatsappUrl);
          } catch (whatsappError) {
            console.error('[WhatsApp] Erro:', whatsappError);
          }

          try {
            console.log('[AccessCode] Chamando consumeAccessCode com code:', input.accessCode, 'phone:', input.phone);
            if (!cpTokenValid) await consumeAccessCode(input.accessCode || '', input.phone);
            console.log('[AccessCode] consumeAccessCode executado com sucesso');
          } catch (e) { console.error('[AccessCode] Erro:', e); }
          // Salvar status inicial do pedido com produto e respostas
          let outerRegId: number | undefined;
          try {
            const db2 = await (await import('./db')).getDb();
            if (db2 && effectivePhone) {
              // Usar effectivePhone (input.phone ou phone do cpToken)
              const phoneDigits = effectivePhone;
              let regId: number | undefined;

              // Se senha geral, criar registro em accessCodePhones (não existe código VIP associado)
              const generalPwd = process.env.SITE_GENERAL_PASSWORD || '';
              const isGeneralCode = generalPwd && input.accessCode === generalPwd;
              if (cpTokenValid) {
                // Novo sistema de senha (cpToken): criar registro usando código __cptoken__
                try {
                  let cpCodeId: number | undefined;
                  const cpRows = await db2.execute(`SELECT id FROM accessCodes WHERE code = '__cptoken__' LIMIT 1`);
                  const cpArr = (cpRows[0] as unknown as Array<{ id: number }>);
                  if (cpArr && cpArr.length > 0) {
                    cpCodeId = cpArr[0].id;
                  } else {
                    await db2.execute(`INSERT INTO accessCodes (code, type, status, clientName, maxUses, currentUses, createdAt) VALUES ('__cptoken__', 'cptoken', 'active', 'Senha de Cliente', 99999, 0, NOW())`);
                    const cpRows2 = await db2.execute(`SELECT id FROM accessCodes WHERE code = '__cptoken__' LIMIT 1`);
                    cpCodeId = (cpRows2[0] as unknown as Array<{ id: number }>)[0]?.id;
                  }
                  if (cpCodeId) {
                    await db2.execute(`INSERT INTO accessCodePhones (codeId, phone, consumed, accessedAt) VALUES (${cpCodeId}, '${phoneDigits}', 0, NOW())`);
                    const newRow = await db2.execute(`SELECT id FROM accessCodePhones WHERE codeId = ${cpCodeId} AND phone = '${phoneDigits}' ORDER BY accessedAt DESC LIMIT 1`);
                    regId = (newRow[0] as unknown as Array<{ id: number }>)[0]?.id;
                    console.log('[OrderStatus] Registro cpToken criado - regId:', regId);
                  }
                } catch (e) { console.error('[OrderStatus] Erro ao criar registro cpToken:', e); }
              } else if (isGeneralCode) {
                try {
                  // Criar um código de acesso geral no banco se não existir
                  let generalCodeId: number | undefined;
                  const gcRows = await db2.execute(`SELECT id FROM accessCodes WHERE code = '__general__' LIMIT 1`);
                  const gcArr = (gcRows[0] as unknown as Array<{ id: number }>);
                  if (gcArr && gcArr.length > 0) {
                    generalCodeId = gcArr[0].id;
                  } else {
                    await db2.execute(`INSERT INTO accessCodes (code, type, status, clientName, maxUses, currentUses, createdAt) VALUES ('__general__', 'general', 'active', 'Senha Geral', 99999, 0, NOW())`);
                    const gcRows2 = await db2.execute(`SELECT id FROM accessCodes WHERE code = '__general__' LIMIT 1`);
                    generalCodeId = (gcRows2[0] as unknown as Array<{ id: number }>)[0]?.id;
                  }
                  if (generalCodeId) {
                    await db2.execute(`INSERT INTO accessCodePhones (codeId, phone, consumed, accessedAt) VALUES (${generalCodeId}, '${phoneDigits}', 0, NOW())`);
                    const newRow = await db2.execute(`SELECT id FROM accessCodePhones WHERE codeId = ${generalCodeId} AND phone = '${phoneDigits}' ORDER BY accessedAt DESC LIMIT 1`);
                    regId = (newRow[0] as unknown as Array<{ id: number }>)[0]?.id;
                    console.log('[OrderStatus] Registro geral criado - regId:', regId);
                  }
                } catch (e) { console.error('[OrderStatus] Erro ao criar registro geral:', e); }
              } else {
                // Buscar regId pelo phone + código VIP
                try {
                  const phoneRow = await db2.execute(`SELECT acp.id FROM accessCodePhones acp INNER JOIN accessCodes ac ON ac.id = acp.codeId WHERE REGEXP_REPLACE(acp.phone, '[^0-9]', '') = '${phoneDigits}' AND ac.code = '${input.accessCode}' ORDER BY acp.accessedAt DESC LIMIT 1`);
                  regId = (phoneRow[0] as unknown as Array<{ id: number }>)[0]?.id;
                  console.log('[OrderStatus] Buscando regId por phone+code:', phoneDigits, input.accessCode, '-> regId:', regId);
                } catch (e) { console.error('[OrderStatus] Erro ao buscar regId:', e); }
                // Se não encontrou, criar o registro em accessCodePhones para o código VIP
                if (!regId) {
                  try {
                    const acRows = await db2.execute(`SELECT id FROM accessCodes WHERE code = '${input.accessCode}' LIMIT 1`);
                    const acId = (acRows[0] as unknown as Array<{ id: number }>)[0]?.id;
                    if (acId) {
                      await db2.execute(`INSERT INTO accessCodePhones (codeId, phone, consumed, accessedAt) VALUES (${acId}, '${phoneDigits}', 0, NOW())`);
                      const newRow = await db2.execute(`SELECT id FROM accessCodePhones WHERE codeId = ${acId} AND phone = '${phoneDigits}' ORDER BY accessedAt DESC LIMIT 1`);
                      regId = (newRow[0] as unknown as Array<{ id: number }>)[0]?.id;
                      console.log('[OrderStatus] Registro VIP criado - regId:', regId);
                    }
                  } catch (e) { console.error('[OrderStatus] Erro ao criar registro VIP:', e); }
                }
                // Fallback final: buscar pelo phone sem filtro de código
                if (!regId) {
                  try {
                    const phoneRow2 = await db2.execute(`SELECT id FROM accessCodePhones WHERE REGEXP_REPLACE(phone, '[^0-9]', '') = '${phoneDigits}' ORDER BY accessedAt DESC LIMIT 1`);
                    regId = (phoneRow2[0] as unknown as Array<{ id: number }>)[0]?.id;
                    console.log('[OrderStatus] Fallback regId por phone:', phoneDigits, '-> regId:', regId);
                  } catch (e) { console.error('[OrderStatus] Erro no fallback regId:', e); }
                }
              }
              if (regId) {
                // Buscar status inicial dinâmico do banco
                let initialStatus = 'pedido_recebido';
                try {
                  const stRows = await db2.execute(`SELECT \`key\` FROM orderStatusTypes WHERE isActive = 1 ORDER BY sortOrder ASC LIMIT 1`);
                  const stArr = (stRows[0] as unknown as Array<{ key: string }>);
                  if (stArr && stArr.length > 0 && stArr[0].key) initialStatus = stArr[0].key;
                } catch (e) { /* usa pedido_recebido como fallback */ }
                // Gerar número de pedido único
                let orderNum: number | undefined;
                try { orderNum = await generateOrderNumber(); } catch (e) { console.error('[OrderNumber] Erro:', e); }
                console.log('[OrderStatus] Salvando status inicial:', initialStatus, 'regId:', regId, 'orderNum:', orderNum);
                await addOrderStatus({
                  registrationId: regId,
                  orderNumber: orderNum,
                  customerPhone: phoneDigits,
                  status: initialStatus,
                  note: 'Pedido recebido via site',
                  serviceName: input.service,
                  serviceOption: input.nameOption,
                  pricePaid: input.price || null,
                  answers: input.answers,
                });
                outerRegId = regId;
                // Corrigir registrationId dos documentos salvos antes da criação do pedido
                // Inclui docRegId = 0 (quando telefone não encontrado em accessCodePhones)
                if (docRegId !== regId) {
                  try {
                    await db2.execute(`UPDATE orderFiles SET registrationId = ${regId} WHERE registrationId = ${docRegId} AND customerPhone = '${phoneDigits}' AND createdAt >= NOW() - INTERVAL 5 MINUTE`);
                    console.log('[OrderFiles] Documentos migrados de regId', docRegId, 'para', regId);
                  } catch (e) { console.error('[OrderFiles] Erro ao migrar documentos:', e); }
                  // Também migrar documentos salvos com customerPhone = 'desconhecido'
                  try {
                    await db2.execute(`UPDATE orderFiles SET registrationId = ${regId}, customerPhone = '${phoneDigits}' WHERE registrationId = ${docRegId} AND (customerPhone = 'desconhecido' OR customerPhone = '') AND createdAt >= NOW() - INTERVAL 10 MINUTE`);
                    console.log('[OrderFiles] Documentos desconhecidos migrados para regId', regId);
                  } catch (e) { console.error('[OrderFiles] Erro ao migrar docs desconhecidos:', e); }
                }
                // Salvar thirdPartyName, resellerDiscountApplied e campos de carrinho no registro do pedido
                const hasExtraFields = input.thirdPartyName || input.resellerDiscountApplied || input.cartGroupId || input.cartTotal !== undefined || input.cartCouponCode || input.cartCouponDiscount !== undefined || input.cartItemIndex !== undefined;
                if (hasExtraFields) {
                  try {
                    const cartGroupIdSql = input.cartGroupId ? `'${input.cartGroupId.replace(/'/g, "''")}'` : 'NULL';
                    const cartTotalSql = input.cartTotal !== undefined ? String(input.cartTotal) : 'NULL';
                    const cartCouponCodeSql = input.cartCouponCode ? `'${input.cartCouponCode.replace(/'/g, "''")}'` : 'NULL';
                    const cartCouponDiscountSql = input.cartCouponDiscount !== undefined ? String(input.cartCouponDiscount) : 'NULL';
                    const cartItemIndexSql = input.cartItemIndex !== undefined ? String(input.cartItemIndex) : '0';
                    const thirdPartyPhoneSql = input.thirdPartyPhone ? `'${input.thirdPartyPhone.replace(/'/g, "''")}'` : 'NULL';
                    await db2.execute(`UPDATE accessCodePhones SET thirdPartyName = ${input.thirdPartyName ? `'${input.thirdPartyName.replace(/'/g, "''")}'` : 'NULL'}, thirdPartyPhone = ${thirdPartyPhoneSql}, resellerDiscountApplied = ${input.resellerDiscountApplied ?? 'NULL'}, cartGroupId = ${cartGroupIdSql}, cartTotal = ${cartTotalSql}, cartCouponCode = ${cartCouponCodeSql}, cartCouponDiscount = ${cartCouponDiscountSql}, cartItemIndex = ${cartItemIndexSql} WHERE id = ${regId}`);
                  } catch (e) { console.error('[Cart] Erro ao salvar dados de carrinho/revendedor:', e); }
                }
              } else {
                console.error('[OrderStatus] regId não encontrado para phone:', phoneDigits, 'code:', input.accessCode);
              }
            }
          } catch (e) { console.error('[OrderStatus] Erro ao salvar status inicial:', e); }
          // Salvar/atualizar todos os dados do cliente ao finalizar pedido
          if (input.phone) {
            try {
              const existingCustomer = await getCustomerByPhone(input.phone);
              const customerData: { name?: string; email?: string; city?: string } = {};
              if (input.clientName) customerData.name = input.clientName;
              if (input.email) customerData.email = input.email;
              if (input.city) customerData.city = input.city;
              if (existingCustomer) {
                // Atualizar nome, cidade e email (sobrescreve apenas se fornecido)
                await updateCustomer(existingCustomer.id, customerData);
              } else {
                // Pedido não cria cadastro principal incompleto. O perfil principal
                // é criado somente pelo fluxo obrigatório (foto, e-mail, CPF e telefone).
                console.warn('[Customer] Pedido recebido sem cadastro principal completo; nenhum cliente técnico foi criado.', { phone: input.phone });
              }
            } catch (e) { console.error('[Customer] Erro ao salvar dados do cliente:', e); }
          }
          if (input.couponCode) {
            try { await consumeCoupon(input.couponCode, input.clientName); } catch (e) { console.error('[Coupon] Erro:', e); }
          }

          // Gerar senha de 4 dígitos para acompanhamento do pedido
          let generatedPin: string | null = null;
          if (input.phone) {
            try {
              const phone4 = input.phone.replace(/\D/g, '');
              // Gerar PIN aleatório de 4 dígitos
              generatedPin = String(Math.floor(1000 + Math.random() * 9000));
              const { getDb: getDbPin } = await import('./db');
              const { customerPins: customerPinsTable } = await import('../drizzle/schema');
              const { eq: eqPin } = await import('drizzle-orm');
              const dbPin = await getDbPin();
              if (dbPin) {
                const existingPin = await dbPin.select().from(customerPinsTable).where(eqPin(customerPinsTable.phone, phone4)).limit(1);
                if (existingPin.length > 0) {
                  // Atualizar PIN existente
                  await dbPin.update(customerPinsTable).set({ pin: generatedPin, firstAccess: 0 }).where(eqPin(customerPinsTable.phone, phone4));
                } else {
                  // Criar novo PIN
                  await dbPin.insert(customerPinsTable).values({ phone: phone4, pin: generatedPin, firstAccess: 0 });
                }
                console.log('[PIN] Senha de acompanhamento gerada para:', phone4);
              }
            } catch (e) { console.error('[PIN] Erro ao gerar senha:', e); }
          }

          // Lançar automaticamente no Controle Financeiro como Pendente
          if (outerRegId) {
            try {
              // Extrair preço do nameOption (que pode conter tier de garantia)
              // Formato: "Nome Opção - Garantia: X corridas" ou apenas "Nome Opção"
              let saleValueCents = 0;
              // Usar input.price (enviado pelo frontend no momento da compra) como fonte primária
              if (input.price) {
                const priceFromInput = parseFloat(input.price.replace(/[^0-9,\.]/g, '').replace(',', '.'));
                if (priceFromInput > 0) saleValueCents = Math.round(priceFromInput * 100);
              }
              const dbFin = await (await import('./db')).getDb();
              if (dbFin && saleValueCents === 0) {
                // Extrair nome base da opção (antes do " - Garantia:")
                const baseOptionName = input.nameOption.split(' - Garantia:')[0].trim();
                const optRows = await dbFin.execute(sql.raw(
                  `SELECT price FROM productOptions WHERE label = '${baseOptionName.replace(/'/g, "''")}' LIMIT 1`
                ));
                const optArr = (optRows[0] as unknown as Array<{ price: string }>);
                if (optArr && optArr.length > 0) {
                  const priceStr = optArr[0].price || '0';
                  const numericPrice = parseFloat(priceStr.replace(/[^0-9,\.]/g, '').replace(',', '.'));
                  saleValueCents = Math.round(numericPrice * 100);
                }
                // Se há tier de garantia, buscar preço do tier
                if (input.nameOption.includes(' - Garantia:')) {
                  const tierPart = input.nameOption.split(' - Garantia:')[1]?.trim();
                  if (tierPart && baseOptionName) {
                    // Buscar tier pelo optionId e label
                    const tierRows = await dbFin.execute(sql.raw(
                      `SELECT wt.price FROM warrantyTiers wt
                       INNER JOIN productOptions po ON po.id = wt.optionId
                       WHERE po.label = '${baseOptionName.replace(/'/g, "''")}'
                       AND CONCAT(wt.warrantyValue, ' ', wt.warrantyType) LIKE '${tierPart.replace(/'/g, "''").substring(0, 30)}%'
                       LIMIT 1`
                    ));
                    const tierArr = (tierRows[0] as unknown as Array<{ price: string }>);
                    if (tierArr && tierArr.length > 0) {
                      const tierPriceStr = tierArr[0].price || '0';
                      const tierNumericPrice = parseFloat(tierPriceStr.replace(/[^0-9,\.]/g, '').replace(',', '.'));
                      if (tierNumericPrice > 0) saleValueCents = Math.round(tierNumericPrice * 100);
                    }
                  }
                }
              }
              await createFinancialSale({
                registrationId: outerRegId,
                customerName: input.clientName,
                customerPhone: input.phone ? input.phone.replace(/\D/g, '') : '',
                productName: input.service,
                productOption: input.nameOption,
                saleValue: saleValueCents,
                costValue: 0,
                paymentMethod: 'pix',
                status: 'pendente',
                saleDate: Date.now(),
                receivedDate: null,
                notes: null,
              });
              console.log('[Financeiro] Venda registrada automaticamente - regId:', outerRegId);
            } catch (e) { console.error('[Financeiro] Erro ao registrar venda:', e); }
          }

          // Enviar email de confirmação ao cliente
          if (input.email) {
            try {
              const emailBranding = await getEmailBranding();
              let answersClientHtml = '';
              if (input.answers) {
                try {
                  const ans = JSON.parse(input.answers) as { question: string; answer: string; depth?: number }[];
                  if (ans.length > 0) {
                    answersClientHtml = `
                      <div style="margin:16px 0;">
                        <p style="color:#a855f7;font-weight:bold;font-size:14px;margin-bottom:8px;">📋 RESPOSTAS DO FORMULÂRIO</p>
                        ${ans.map(a => {
                          const d = a.depth || 0;
                          const ml = d * 16;
                          const prefix = d > 0 ? 'â" ³ ' : '';
                          return `<p style="color:#ccc;font-size:13px;margin:4px 0;margin-left:${ml}px;"><strong style="color:#ddd;">${prefix}${a.question}:</strong> ${a.answer}</p>`;
                        }).join('')}
                      </div>`;
                  }
                } catch { /* ignore */ }
              }
              await sendEmailWithTimeout({
                from: '"H2 COLOMBIANO" <h2@h2colombiano.com>',
                to: input.email,
                subject: `âÅ“"¦ Pedido Recebido — ${emailBranding.siteTitle}`,
                html: emailPedidoRecebidoCliente({
                  ...emailBranding,
                  customerName: input.clientName,
                  service: input.service,
                  orderNumber: undefined,
                  pin: generatedPin || undefined,
                }),
              }, 'email cliente');
              console.log('[Email] Confirmação enviada ao cliente:', input.email);
            } catch (clientEmailError) {
              console.error('[Email] Erro ao enviar confirmação ao cliente:', clientEmailError);
            }
          }

          return { success: true, message: emailSent ? 'Pedido enviado com sucesso!' : 'Pedido registrado! (email será reenviado em breve)', registrationId: outerRegId ?? null, trackingPin: generatedPin };
        } catch (error) {
          console.error('Erro geral ao processar pedido:', error);
          return { success: false, message: 'Erro ao processar pedido' };
        }
      }),

    submitPaymentProof: publicProcedure
      .input(z.object({
        clientName: z.string(), service: z.string(),
        phone: z.string().optional(), city: z.string().optional(),
        paymentProof: z.string().min(1, 'Comprovante obrigatório'),
        paymentProofMime: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        try {
          const emailTo = await getSetting('email_to') || 'h2@h2colombiano.com';
          const spMime = input.paymentProofMime || 'image/jpeg';
          const spExt = spMime === 'application/pdf' ? 'pdf' : spMime === 'image/png' ? 'png' : 'jpg';
          let paymentProofUrl = '';
          try {
            const randomSuffix = Math.random().toString(36).substring(2, 10);
            const fileKey = `comprovantes/${input.clientName.replace(/\s+/g, '-')}-${randomSuffix}.${spExt}`;
            const { url } = await storagePut(fileKey, Buffer.from(input.paymentProof, 'base64'), spMime);
            paymentProofUrl = url;
          } catch (uploadError) { console.error('[S3] Erro:', uploadError); }
          const emailBranding = await getEmailBranding();
          await transporter.sendMail({
            from: '"H2 COLOMBIANO" <h2@h2colombiano.com>',
            to: emailTo,
            subject: `COMPROVANTE PIX - ${input.service} - ${input.clientName}`,
            html: emailComprovantePix({
              ...emailBranding,
              clientName: input.clientName,
              phone: input.phone || 'Não informado',
              service: input.service,
              extra: [
                input.city ? `Cidade: ${input.city}` : '',
                paymentProofUrl ? `Comprovante: ${paymentProofUrl}` : '',
              ].filter(Boolean).join('\n'),
            }),
            attachments: [{ filename: `comprovante-pix.${spExt}`, content: Buffer.from(input.paymentProof, 'base64'), contentType: spMime }],
          });
          return { success: true, message: 'Comprovante enviado!', paymentProofUrl };
        } catch (error) {
          console.error('Erro ao enviar comprovante:', error);
          return { success: false, message: 'Erro ao enviar comprovante' };
        }
      }),

    uploadLoginImage: adminProcedure
      .input(z.object({ imageBase64: z.string().min(1), mimeType: z.string().optional() }))
      .mutation(async ({ input }) => {
        try {
          const mime = input.mimeType || 'image/jpeg';
          const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
          const suffix = Math.random().toString(36).substring(2, 10);
          const fileKey = `login/login-image-${suffix}.${ext}`;
          const { url } = await storagePut(fileKey, Buffer.from(input.imageBase64, 'base64'), mime);
          // Salvar no banco automaticamente
          await upsertSettings({ login_image_url: url });
          return { success: true, url };
        } catch (err) {
          console.error('[uploadLoginImage]', err);
          return { success: false, url: '' };
        }
      }),

    uploadGastosLogo: adminProcedure
      .input(z.object({ imageBase64: z.string().min(1), mimeType: z.string().optional() }))
      .mutation(async ({ input }) => {
        try {
          const mime = input.mimeType || 'image/jpeg';
          const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
          const suffix = Math.random().toString(36).substring(2, 10);
          const fileKey = `gastos/gastos-logo-${suffix}.${ext}`;
          const { url } = await storagePut(fileKey, Buffer.from(input.imageBase64, 'base64'), mime);
          await upsertSettings({ gastos_logo_url: url });
          return { success: true, url };
        } catch (err) {
          console.error('[uploadGastosLogo]', err);
          return { success: false, url: '' };
        }
      }),
    uploadBotAvatar: adminProcedure
      .input(z.object({ imageBase64: z.string().min(1), mimeType: z.string().optional() }))
      .mutation(async ({ input }) => {
        try {
          const mime = input.mimeType || 'image/jpeg';
          const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
          const suffix = Math.random().toString(36).substring(2, 10);
          const fileKey = `bot/bot-avatar-${suffix}.${ext}`;
          const { url } = await storagePut(fileKey, Buffer.from(input.imageBase64, 'base64'), mime);
          await upsertSettings({ bot_assistant_avatar: url });
          return { success: true, url };
        } catch (err) {
          console.error('[uploadBotAvatar]', err);
          return { success: false, url: '' };
        }
      }),
  }),

  // === CLIENTES (CADASTRO) ===
  customers: router({
    routeReleaseModes: adminProcedure.query(async () => listRouteReleaseModes()),
    setRouteReleaseMode: adminProcedure
      .input(z.object({ route: z.enum(CUSTOMER_ROUTES), mode: z.enum(['automatico', 'manual']) }))
      .mutation(async ({ input, ctx }) => {
        const updatedBy = (ctx as any)?.user?.name || (ctx as any)?.user?.username || 'Administrador';
        const mode = await setRouteReleaseMode(input.route, input.mode, updatedBy);
        return { success: true, route: input.route, mode };
      }),

    checkByPhone: publicProcedure
      .input(z.object({ phone: z.string().min(1) }))
      .query(async ({ input, ctx }) => {
        const clientIp = (ctx.req.headers['x-forwarded-for'] as string || '').split(',')[0].trim() || ctx.req.socket?.remoteAddress || 'unknown';
        const blockResult = await checkPhoneBlockedAndBlockIp(input.phone, clientIp, 'verificar_cadastro');
        if (blockResult.blocked) return { exists: false, customer: null, blocked: true, customerBlocked: false };
        const customer = await getCustomerByPhone(input.phone);
        // Verificar bloqueio de cadastro
        if (customer && (customer as any).blocked === 1) {
          return { exists: true, customer: null, blocked: false, customerBlocked: true, blockReason: (customer as any).blockReason || 'Acesso bloqueado' };
        }
        let hasOrders = false;
        if (customer) {
          try {
            const db2 = await (await import('./db')).getDb();
            const rows = await (db2 as any).execute(`SELECT COUNT(*) as cnt FROM orderStatusHistory WHERE customerPhone = '${input.phone.replace(/'/g, '')}' LIMIT 1`);
            const cnt = Number(rows?.[0]?.cnt ?? rows?.rows?.[0]?.cnt ?? 0);
            hasOrders = cnt > 0;
          } catch { hasOrders = false; }
        }
        return { exists: !!customer, customer, hasOrders };
      }),

    // Verificar cadastro por telefone (mutation — aceita telefone canônico dinâmico)
    checkByPhoneMutation: publicProcedure
      .input(z.object({ phone: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        const clientIp = (ctx.req.headers['x-forwarded-for'] as string || '').split(',')[0].trim() || ctx.req.socket?.remoteAddress || 'unknown';
        const blockResult = await checkPhoneBlockedAndBlockIp(input.phone, clientIp, 'verificar_cadastro');
        if (blockResult.blocked) return { exists: false, customer: null, blocked: true, customerBlocked: false };
        const customer = await getCustomerByPhone(input.phone.replace(/\D/g, ''));
        // Verificar bloqueio de cadastro
        if (customer && (customer as any).blocked === 1) {
          return { exists: true, customer: null, blocked: false, customerBlocked: true, blockReason: (customer as any).blockReason || 'Acesso bloqueado' };
        }
        return { exists: !!customer, customer, customerBlocked: false };
      }),

    // Verificar se CPF já está cadastrado
    checkCpf: publicProcedure
      .input(z.object({ cpf: z.string().min(1) }))
      .query(async ({ input }) => {
        const cpf = normalizeCpf(input.cpf);
        if (!isValidCPF(cpf)) throw new TRPCError({ code: 'BAD_REQUEST', message: 'CPF inválido' });
        const customer = await getCustomerByCpf(cpf);
        // Verificar bloqueio de cadastro
        if (customer && (customer as any).blocked === 1) {
          return { exists: true, customerBlocked: true, blockReason: (customer as any).blockReason || 'Acesso bloqueado' };
        }
        return { exists: !!customer, customerBlocked: false };
      }),

    // Atualizar email do cliente pelo telefone (chamado quando cliente preenche email no formulário)
    updateEmailByPhone: publicProcedure
      .input(z.object({ phone: z.string().min(1), email: z.string().email() }))
      .mutation(async ({ input, ctx }) => {
        const clientIp = (ctx.req.headers['x-forwarded-for'] as string || '').split(',')[0].trim() || ctx.req.socket?.remoteAddress || 'unknown';
        const blockResult = await checkPhoneBlockedAndBlockIp(input.phone, clientIp, 'atualizar_email');
        if (blockResult.blocked) return { success: false, message: 'Acesso bloqueado' };
        const customer = await getCustomerByPhone(input.phone.replace(/\D/g, ''));
        if (!customer) return { success: false, message: 'Cliente não encontrado' };
        await updateCustomer(customer.id, { email: input.email });
        return { success: true };
      }),

    updateCpfByPhone: publicProcedure
      .input(z.object({ phone: z.string().min(1), cpf: z.string().min(11, 'CPF inválido') }))
      .mutation(async ({ input }) => {
        const cpf = normalizeCpf(input.cpf);
        if (!isValidCPF(cpf)) return { success: false, message: 'CPF inválido' };
        const customer = await getCustomerByPhone(input.phone.replace(/\D/g, ''));
        if (!customer) return { success: false, message: 'Cliente não encontrado' };
        // Verificar duplicidade somente após a aprovação matemática do CPF.
        const existing = await getCustomerByCpf(cpf);
        if (existing && existing.id !== customer.id) return { success: false, message: 'CPF já cadastrado' };
        await updateCustomer(customer.id, { cpf });
        return { success: true };
      }),

    // Completar o perfil de um cliente existente. Nunca cria um segundo cadastro.
    completeProfile: publicProcedure
      .input(z.object({
        lookupIdentifier: z.string().min(10),
        lookupIsCpf: z.boolean().optional(),
        name: z.string().min(2, 'Nome obrigatório'),
        phone: z.string().min(10),
        email: z.string().email('E-mail obrigatório e inválido'),
        cpf: z.string().min(11),
        city: z.string().optional(),
        uf: z.string().length(2).optional().or(z.literal('')),
        profilePhotoUrl: z.string().url('Foto de perfil obrigatória').min(1),
      }))
      .mutation(async ({ input }) => {
        await ensureCustomerIdentityInfrastructure();
        const lookupPhone = input.lookupIsCpf ? '' : normalizeCustomerPhone(input.lookupIdentifier);
        const lookupCpf = input.lookupIsCpf ? normalizeCustomerCpf(input.lookupIdentifier) : '';
        if (input.lookupIsCpf && !isValidCPF(lookupCpf)) {
          return { success: false, message: 'CPF inválido. Digite um CPF válido para continuar.' };
        }
        const profile = {
          name: input.name.trim(),
          phone: normalizeCustomerPhone(input.phone),
          email: normalizeCustomerEmail(input.email),
          cpf: normalizeCustomerCpf(input.cpf),
          city: input.city?.trim() || undefined,
          uf: input.uf?.trim().toUpperCase() || undefined,
          profilePhotoUrl: input.profilePhotoUrl.trim(),
        };
        try {
          validateMainCustomerProfile(profile);
        } catch (error: any) {
          return { success: false, message: error?.message || 'Complete todos os dados obrigatórios.' };
        }
        const current = await findMainCustomerByIdentity({ phone: lookupPhone, cpf: lookupCpf });
        if (!current) return { success: false, message: 'Cadastro principal não encontrado. Entre em contato com o administrador.' };
        const conflict = await findMainCustomerByIdentity(profile);
        if (conflict && conflict.id !== current.id) {
          return { success: false, message: 'Os dados informados já pertencem a outro cadastro. Entre em contato com o administrador.' };
        }
        const updated = await updateCustomer(current.id, profile);
        if (!updated) return { success: false, message: 'Não foi possível atualizar o cadastro.' };
        return { success: true, customer: updated };
      }),

    register: publicProcedure
      .input(z.object({
        name: z.string().min(1),
        phone: z.string().min(1),
        email: z.string().email("E-mail obrigatório e inválido").min(1, "E-mail obrigatório"),
        cpf: z.string().min(11, "CPF inválido").max(18),
        city: z.string().min(1, "Cidade é obrigatória"),
        uf: z.string().length(2, "UF deve ter 2 caracteres"),
        referredBy: z.string().optional(),
        referredByPhone: z.string().regex(/^\d{10,11}$/).optional(),
        bypassCode: z.string().optional(),
        profilePhotoUrl: z.string().min(1, "Foto de perfil é obrigatória"),
        sourceRoute: z.enum(['site', 'acompanhar', 'gastos', 'emprestimo']).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // O banco principal é a fonte única de identidade para todas as rotas.
        await ensureCustomerIdentityInfrastructure();
        const normalizedInput = {
          ...input,
          phone: normalizeCustomerPhone(input.phone),
          cpf: normalizeCustomerCpf(input.cpf),
          email: normalizeCustomerEmail(input.email),
        };
        try {
          validateMainCustomerProfile(normalizedInput);
        } catch (error: any) {
          return { success: false, blocked: false, message: error?.message || 'Complete todos os dados obrigatórios.' };
        }
        // Capturar IP do cliente
        const clientIp = (ctx.req.headers['x-forwarded-for'] as string || '').split(',')[0].trim() || ctx.req.socket?.remoteAddress || 'unknown';
        // Verificar se IP está bloqueado
        if (clientIp && clientIp !== 'unknown') {
          const ipBlocked = await isIpBlocked(clientIp);
          if (ipBlocked) return { success: false, blocked: true, message: 'Acesso bloqueado. Entre em contato pelo WhatsApp.' };
        }
        // Logar acesso
        logIpAccess(clientIp, 'register', normalizedInput.phone, input.name).catch(() => {});
        // Verificar blocklist antes de qualquer coisa
        const blockCheck = await checkBlocklist(input.name, normalizedInput.phone);
        if (blockCheck.blocked) {
          return { success: false, blocked: true, message: blockCheck.reason || 'Cadastro não permitido. Entre em contato pelo WhatsApp.' };
        }
        // Pesquisa global antes do INSERT: telefone, CPF e e-mail identificam o mesmo cliente.
        const existing = await findMainCustomerByIdentity(normalizedInput);
        if (existing) {
          return {
            success: false,
            blocked: false,
            alreadyExists: true,
            existingCustomerNumber: existing.customerNumber || null,
            message: 'Você já possui cadastro no sistema. Entre na sua conta para continuar.',
          };
        }
        // Validar indicador obrigatório ou código de bypass
        const { validateReferrer, validateBypassCode, useBypassCode } = await import('./db');
        const cleanPhone = normalizedInput.phone;
        const cleanRefPhone = (input.referredByPhone ?? '').replace(/\D/g, '');
        
        // Indicador agora e OPCIONAL. Se informado, validamos; se nao, o cadastro segue normalmente.
        if (cleanRefPhone) {
          const referrerValidation = await validateReferrer(cleanRefPhone);
          if (!referrerValidation.valid) {
            return { success: false, blocked: false, message: 'Indicador não encontrado no sistema. Verifique o telefone do indicador.' };
          }
        } else if (input.bypassCode) {
          // Se o cliente informou um codigo de liberacao, validamos e consumimos.
          const bypassValidation = await validateBypassCode(input.bypassCode);
          if (!bypassValidation.valid) {
            return { success: false, blocked: false, message: bypassValidation.message };
          }
          await useBypassCode(input.bypassCode, cleanPhone);
        }
        
        const safeInput = {
          ...normalizedInput,
          referredBy: cleanRefPhone && cleanRefPhone === cleanPhone ? undefined : input.referredBy,
          referredByPhone: cleanRefPhone && cleanRefPhone === cleanPhone ? undefined : input.referredByPhone,
        };
        const customer = await createCustomer(safeInput);
        const sourceRoute = input.sourceRoute || 'site';
        const releaseMode = await getRouteReleaseMode(sourceRoute);
        if (releaseMode === 'automatico') {
          await setCustomerRoutePermissions(customer.id, [sourceRoute], 'Cadastro inicial automático');
        } else {
          await requestCustomerRouteAccess(customer.id, sourceRoute);
        }
        
        // Registrar indicação se houver indicador
        if (safeInput.referredByPhone && safeInput.referredBy) {
          try {
            const { recordReferral } = await import('./db');
            await recordReferral({
              referrerPhone: safeInput.referredByPhone,
              referrerName: safeInput.referredBy,
              referredCustomerId: customer.id,
              referredPhone: cleanPhone,
              referredName: safeInput.name,
            });
          } catch (e) { console.error('Erro ao registrar indicação:', e); }

          // Notificar o indicador por e-mail (se tiver e-mail cadastrado)
          try {
            const { getCustomerByPhone } = await import('./db');
            const referrerCleanPhone = safeInput.referredByPhone!.replace(/\D/g, '');
            const referrer = await getCustomerByPhone(referrerCleanPhone);
            const emailBranding = await getEmailBranding();
            if (referrer?.email) {
              const waLink = `https://wa.me/55${referrerCleanPhone}`;
              await transporter.sendMail({
                from: '"H2 COLOMBIANO" <h2@h2colombiano.com>',
                to: referrer.email,
                subject: `Í°Å¸Å½"° Sua indicação deu certo! ${safeInput.name} fez um pedido`,
                html: emailIndicacaoSucesso({
                  ...emailBranding,
                  referrerName: referrer.name || safeInput.referredBy || undefined,
                  referredName: safeInput.name,
                  service: undefined,
                }),
              });
              console.log(`[Indicação] E-mail enviado ao indicador ${referrer.email}`);
            } else {
              console.log(`[Indicação] Indicador ${referrerCleanPhone} sem e-mail cadastrado — notificação não enviada`);
            }
          } catch (e) { console.error('Erro ao notificar indicador:', e); }
        }
        
        // Notificação: finalização do cadastro — enviado em segundo plano para não bloquear
        void (async () => {
          try {
            const emailTo = await getSetting('contact_email') || 'h2@h2colombiano.com';
            const transporter = nodemailer.createTransport({
              host: 'smtp.zoho.com',
              port: 465,
              secure: true,
              auth: { user: 'h2@h2colombiano.com', pass: process.env.SMTP_PASS || process.env.ZOHO_EMAIL_PASSWORD || '' },
            });
            await transporter.sendMail({
              from: '"H2 COLOMBIANO" <h2@h2colombiano.com>',
              to: emailTo,
              subject: `âÅ“"¦ Cadastro finalizado — ${safeInput.name} (${safeInput.phone})`,
              html: emailCadastroFinalizadoAdmin({
                ...(await getEmailBranding()),
                name: safeInput.name,
                phone: safeInput.phone,
                service: undefined,
                email: safeInput.email || undefined,
                cpf: safeInput.cpf || undefined,
              }),
            });
          } catch (e) { console.error('Email finalização cadastro:', e); }
        })();
        return { success: true, customer, alreadyExists: false, releaseMode, accessGranted: releaseMode === 'automatico' };
      }),

    list: adminProcedure.query(async () => {
      // Executa a reconciliação dos cadastros legados antes de mostrar a lista principal.
      try { await syncUnifiedCustomerRegistry(); } catch (error: any) {
        console.warn('[customers.list] sincronização unificada não aplicada:', error?.message);
      }
      const db = await (await import('./db')).getDb();
      if (!db) return [];
      // Buscar clientes com flag indicando se têm pedido finalizado
      const rows = await db.execute(`
        SELECT c.*,
          UNIX_TIMESTAMP(CONVERT_TZ(c.lastAccessAt, @@session.time_zone, '+00:00')) * 1000 AS lastAccessAtMs,
          UNIX_TIMESTAMP(CONVERT_TZ(c.createdAt, @@session.time_zone, '+00:00')) * 1000 AS createdAtMs,
          CASE WHEN EXISTS (
            SELECT 1 FROM accessCodePhones acp
            INNER JOIN orderStatusHistory osh ON osh.registrationId = acp.id
            WHERE REGEXP_REPLACE(acp.phone, '[^0-9]', '') = REGEXP_REPLACE(c.phone, '[^0-9]', '')
            LIMIT 1
          ) THEN 1 ELSE 0 END AS hasOrder,
          COALESCE(c.fixedPasswordActive, 0) AS fixedPwdActive,
          (
            SELECT osh2.orderNumber FROM accessCodePhones acp2
            INNER JOIN orderStatusHistory osh2 ON osh2.registrationId = acp2.id
            WHERE REGEXP_REPLACE(acp2.phone, '[^0-9]', '') = REGEXP_REPLACE(c.phone, '[^0-9]', '')
            AND osh2.orderNumber IS NOT NULL
            ORDER BY osh2.createdAt ASC LIMIT 1
          ) AS orderNumber,
          (
            SELECT osh3.status FROM accessCodePhones acp3
            INNER JOIN orderStatusHistory osh3 ON osh3.registrationId = acp3.id
            WHERE REGEXP_REPLACE(acp3.phone, '[^0-9]', '') = REGEXP_REPLACE(c.phone, '[^0-9]', '')
            ORDER BY osh3.createdAt DESC LIMIT 1
          ) AS latestStatus,
          CASE WHEN EXISTS (
            SELECT 1 FROM blocklist bl
            WHERE (bl.type = 'phone' OR bl.type = 'both')
              AND REGEXP_REPLACE(bl.phone, '[^0-9]', '') = REGEXP_REPLACE(c.phone, '[^0-9]', '')
              AND bl.phone IS NOT NULL AND bl.phone != ''
          ) THEN 1 ELSE 0 END AS isBlocked
        FROM customers c
        WHERE c.deletedAt IS NULL
        ORDER BY c.createdAt DESC
      `);
      // Buscar pedidos em aberto por cliente (excluindo entregues e cancelados)
      const openOrdersRows = await db.execute(`
        SELECT
          REGEXP_REPLACE(acp.phone, '[^0-9]', '') AS cleanPhone,
          osh.orderNumber,
          osh.status AS latestStatus,
          acp.id AS registrationId
        FROM accessCodePhones acp
        INNER JOIN (
          SELECT registrationId, orderNumber,
            SUBSTRING_INDEX(GROUP_CONCAT(status ORDER BY createdAt DESC SEPARATOR ','), ',', 1) AS status
          FROM orderStatusHistory
          WHERE orderNumber IS NOT NULL
          GROUP BY registrationId, orderNumber
        ) osh ON osh.registrationId = acp.id
        WHERE osh.status NOT IN ('pedido_entregue', 'cancelado')
        ORDER BY acp.id ASC
      `);
      const openOrdersByPhone: Record<string, Array<{ orderNumber: number; latestStatus: string; registrationId: number }>> = {};
      for (const row of (openOrdersRows[0] as unknown as Array<Record<string, unknown>>)) {
        const phone = String(row.cleanPhone || '');
        if (!openOrdersByPhone[phone]) openOrdersByPhone[phone] = [];
        openOrdersByPhone[phone].push({
          orderNumber: Number(row.orderNumber),
          latestStatus: String(row.latestStatus || ''),
          registrationId: Number(row.registrationId),
        });
      }
      return (rows[0] as unknown as Array<Record<string, unknown>>).map(r => {
        const cleanPhone = String(r.phone || '').replace(/[^0-9]/g, '');
        const openOrders = openOrdersByPhone[cleanPhone] || [];
        return {
          ...r,
          hasOrder: Number(r.hasOrder) === 1,
          fixedPwdActive: Number(r.fixedPwdActive) === 1,
          isBlocked: Number(r.isBlocked) === 1,
          // Retornar timestamps como ms (absolutos, independente de fuso do servidor/TiDB)
          lastAccessAt: r.lastAccessAtMs ? Number(r.lastAccessAtMs) : null,
          createdAt: r.createdAtMs ? Number(r.createdAtMs) : (r.createdAt ? Number(new Date(r.createdAt as string)) : null),
          // Pedidos em aberto (excluindo entregues e cancelados)
          openOrders,
        };
      });
    }),

    update: adminProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        phone: z.string().regex(/^\d{10,11}$/).optional(),
        email: z.string().email().optional(),
        city: z.string().optional(),
        uf: z.string().length(2).optional(),
        referredBy: z.string().optional(),
        referredByPhone: z.string().optional(),
        profilePhotoUrl: z.string().optional(),
        customerNumber: z.number().int().positive().nullable().optional(),
        cpf: z.string().regex(/^\d{11}$/).optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...rawData } = input;
        const data = {
          ...rawData,
          phone: rawData.phone?.replace(/\D/g, '') || undefined,
          cpf: rawData.cpf?.replace(/\D/g, '') || undefined,
          referredByPhone: rawData.referredByPhone?.replace(/\D/g, '') || undefined,
        };
        const db = await (await import('./db')).getDb() as any;
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Banco indisponível' });

        const custRows = await db.execute(sql`SELECT phone, cpf FROM customers WHERE id = ${id} LIMIT 1`);
        const current = (custRows[0] as unknown as Array<{ phone: string; cpf?: string | null }>)[0];
        if (!current) throw new TRPCError({ code: 'NOT_FOUND', message: 'Cliente não encontrado' });
        const oldPhone = String(current.phone || '').replace(/\D/g, '');
        const newPhone = data.phone || oldPhone;
        const phoneChanged = !!data.phone && newPhone !== oldPhone;

        // Verifica duplicidade antes de tocar em tabelas relacionadas. Assim não há
        // atualização parcial nem o erro genérico ao tentar trocar para telefone de outro cliente.
        if (phoneChanged) {
          const duplicateRows = await db.execute(sql`
            SELECT id, name FROM customers
            WHERE id <> ${id} AND deletedAt IS NULL
              AND REGEXP_REPLACE(phone, '[^0-9]', '') = ${newPhone}
            LIMIT 1
          `);
          const duplicate = (duplicateRows[0] as unknown as Array<{ id: number; name: string }>)[0];
          if (duplicate) {
            throw new TRPCError({
              code: 'CONFLICT',
              message: `Este telefone já está cadastrado para ${duplicate.name || 'outro cliente'}.`,
            });
          }
        }

        // Primeiro grava o cadastro principal. As sincronizações abaixo nunca podem
        // impedir o ADM de salvar nome/telefone/cidade no cliente principal.
        const updated = await updateCustomer(id, data);
        if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: 'Cliente não encontrado' });

        if (phoneChanged) {
          // Pedidos, arquivos e dados de login de pedido são históricos vinculados ao
          // registrationId do pedido. Eles não podem acompanhar uma simples edição de
          // telefone do cadastro principal, pois isso transferiria pedidos a outro cliente.
          const propagationQueries = [
            sql`UPDATE customerPasswordSessions SET phone = ${newPhone} WHERE REGEXP_REPLACE(phone, '[^0-9]', '') = ${oldPhone}`,
            sql`UPDATE customerPasswords SET phone = ${newPhone} WHERE REGEXP_REPLACE(phone, '[^0-9]', '') = ${oldPhone}`,
            sql`UPDATE customerLoginHistory SET phone = ${newPhone} WHERE REGEXP_REPLACE(phone, '[^0-9]', '') = ${oldPhone}`,
            // A planilha e empréstimos usam CPF como prioridade e telefone como fallback;
            // mantém o telefone sincronizado quando existir o mesmo cadastro.
            sql`UPDATE spreadsheetClients SET phone = ${newPhone} WHERE REGEXP_REPLACE(phone, '[^0-9]', '') = ${oldPhone}`,
            sql`UPDATE loanClients SET phone = ${newPhone} WHERE REGEXP_REPLACE(phone, '[^0-9]', '') = ${oldPhone}`,
          ];
          for (const query of propagationQueries) {
            try {
              await db.execute(query);
            } catch (error: any) {
              // Tabelas antigas ou restrições secundárias não anulam o salvamento do cadastro principal.
              console.warn('[customers.update] sincronização de telefone não aplicada:', error?.message);
            }
          }
        }
        // Reúne novamente todos os cadastros com o mesmo CPF/telefone, para que
        // /gastos e /emprestimo recebam os dados atualizados do cadastro principal.
        try {
          await syncUnifiedCustomerRegistry([{ phone: oldPhone, cpf: String(current.cpf || '').replace(/\D/g, '') }]);
        } catch (error: any) {
          console.warn('[customers.update] sincronização unificada não aplicada:', error?.message);
        }
        return updated;
      }),

    clearNotes: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await updateCustomer(input.id, { adminNotes: null });
        return { success: true };
      }),

          delete: adminProcedure
      .input(z.object({ id: z.number(), reason: z.string().optional() }))
      .mutation(async ({ input }) => {
        await deleteCustomer(input.id, input.reason);
        return { success: true };
      }),
    // Bloquear cliente
    block: adminProcedure
      .input(z.object({ id: z.number(), reason: z.string().min(1) }))
      .mutation(async ({ input }) => {
        const db = await (await import('./db')).getDb();
        if (!db) return { success: false };
        const { customers: customersTable } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        await db.update(customersTable).set({
          blocked: 1,
          blockReason: input.reason,
          blockedAt: new Date(),
        }).where(eq(customersTable.id, input.id));
        return { success: true };
      }),
    // Desbloquear cliente
    unblock: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await (await import('./db')).getDb();
        if (!db) return { success: false };
        const { customers: customersTable } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        await db.update(customersTable).set({
          blocked: 0,
          blockReason: null,
          blockedAt: null,
        }).where(eq(customersTable.id, input.id));
        return { success: true };
      }),
    // Excluir cliente junto com todos os pedidos vinculados (soft delete em cascata)
    deleteWithOrders: adminProcedure
      .input(z.object({ id: z.number(), reason: z.string().optional() }))
      .mutation(async ({ input }) => {
        const db = await (await import('./db')).getDb();
        if (!db) return { success: false };
        const { customers: customersTable } = await import('../drizzle/schema');
        const { eq, sql: drizzleSql } = await import('drizzle-orm');
        // Buscar o cliente
        const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, input.id)).limit(1);
        if (!customer) return { success: false };
        const reason = input.reason || 'Excluído junto com o cliente';
        // Ocultar todos os pedidos ativos deste cliente (inserir na hiddenSubOrders)
        await db.execute(drizzleSql`
          INSERT IGNORE INTO hiddenSubOrders (registrationId, subOrderIndex, deletedReason, customerPhone)
          SELECT DISTINCT osh.registrationId, 0, ${reason}, osh.customerPhone
          FROM orderStatusHistory osh
          WHERE osh.customerPhone = ${customer.phone}
            AND NOT EXISTS (
              SELECT 1 FROM hiddenSubOrders h
              WHERE h.registrationId = osh.registrationId AND h.subOrderIndex = 0
            )
        `);
        // Agora excluir o cliente (soft delete)
        await db.update(customersTable).set({
          deletedAt: new Date(),
          deletedReason: input.reason || 'Excluído pelo administrador',
        }).where(eq(customersTable.id, input.id));
        return { success: true };
      }),

    // Lixeira: listar clientes excluídos
    listDeleted: adminProcedure
      .query(async () => {
        return await listDeletedCustomers();
      }),

    // Lixeira: restaurar cliente excluído
    restore: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await restoreCustomer(input.id);
        return { success: true };
      }),

    // Lixeira: excluir permanentemente
    permanentlyDelete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await permanentlyDeleteCustomer(input.id);
        return { success: true };
      }),

    // Admin: configurar status de revendedor e desconto
    setReseller: adminProcedure
      .input(z.object({
        id: z.number(),
        isReseller: z.boolean(),
        resellerDiscountType: z.enum(['percent', 'fixed']).optional(),
        resellerDiscountValue: z.number().min(0).max(100).optional(),
      }))
      .mutation(async ({ input }) => {
        await updateCustomer(input.id, {
          isReseller: input.isReseller ? 1 : 0,
          resellerDiscountType: input.resellerDiscountType ?? 'percent',
          resellerDiscountValue: String(input.resellerDiscountValue ?? 0),
        } as Parameters<typeof updateCustomer>[1]);
        return { success: true };
      }),

    // Endpoint público: retorna desconto do revendedor para o cliente logado (por telefone)
    getResellerDiscount: publicProcedure
      .input(z.object({ phone: z.string() }))
      .query(async ({ input }) => {
        const customer = await getCustomerByPhone(input.phone);
        if (!customer || !(customer as unknown as { isReseller: number }).isReseller) {
          return { isReseller: false, discountType: 'percent' as const, discountValue: 0 };
        }
        const c = customer as unknown as { isReseller: number; resellerDiscountType: string; resellerDiscountValue: string };
        return {
          isReseller: true,
          discountType: (c.resellerDiscountType || 'percent') as 'percent' | 'fixed',
          discountValue: parseFloat(c.resellerDiscountValue || '0'),
        };
      }),

    uploadProfilePhoto: publicProcedure
      .input(z.object({
        imageBase64: z.string().min(100, 'Imagem muito pequena ou invalida'),
        phone: z.string(),
      }))
      .mutation(async ({ input }) => {
        if (!input.imageBase64 || input.imageBase64.length === 0) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Imagem vazia' });
        }
        try {
          const buffer = Buffer.from(input.imageBase64, 'base64');
          if (buffer.length === 0) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'Imagem invalida ou corrompida' });
          }
        } catch (error) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Erro ao processar imagem: formato base64 invalido' });
        }
        const mime = 'image/jpeg';
        const ext = 'jpg';
        const fileKey = `profile-photos/${input.phone}-${Date.now()}.${ext}`;
        const { url } = await storagePut(fileKey, Buffer.from(input.imageBase64, 'base64'), mime);
        // Salvar a URL direta do CloudFront (pública, não expira)
        const customer = await getCustomerByPhone(input.phone);
        if (customer) {
          await updateCustomer(customer.id, { profilePhotoUrl: url });
        }
        // Notificação: início do cadastro (telefone + foto)
        // IMPORTANTE: enviar o e-mail em segundo plano (sem await) para NAO bloquear
        // nem falhar o upload da foto caso o Zoho esteja lento/indisponivel.
        void (async () => {
         try {
          const emailTo = await getSetting('contact_email') || 'h2@h2colombiano.com';
          const emailBranding = await getEmailBranding();
          const transporter = nodemailer.createTransport({
            host: 'smtp.zoho.com',
            port: 465,
            secure: true,
            auth: { user: 'h2@h2colombiano.com', pass: process.env.SMTP_PASS || process.env.ZOHO_EMAIL_PASSWORD || '' },
          });
          await transporter.sendMail({
            from: '"H2 COLOMBIANO" <h2@h2colombiano.com>',
            to: emailTo,
            subject: `Í°Å¸"Â¸ Novo cliente iniciou cadastro — ${input.phone}`,
            html: emailInicioCadastroAdmin({
              ...emailBranding,
              phone: input.phone,
              service: undefined,
            }),
          });
         } catch (e) { 
          console.error('Email inicio cadastro:', e); 
         }
        })();
        return { success: true, url };
      }),

    // Admin: definir/atualizar senha fixa de um cliente
    setFixedPassword: adminProcedure
      .input(z.object({
        phone: z.string().min(1),
        password: z.string().min(1).max(64),
        active: z.boolean(),
      }))
      .mutation(async ({ input }) => {
        const db = await (await import('./db')).getDb();
        if (!db) return { success: false };
        const phone = input.phone.replace(/\D/g, '');
        await db.execute(sql`UPDATE customers SET fixedPassword = ${input.password}, fixedPasswordActive = ${input.active ? 1 : 0} WHERE phone = ${phone}`);
        return { success: true };
      }),

    // Admin: obter senha fixa de um cliente
    getFixedPassword: adminProcedure
      .input(z.object({ phone: z.string().min(1) }))
      .query(async ({ input }) => {
        const db = await (await import('./db')).getDb();
        if (!db) return { password: null, active: false };
        const phone = input.phone.replace(/\D/g, '');
        const rows = await db.execute(sql`SELECT fixedPassword, fixedPasswordActive, UNIX_TIMESTAMP(CONVERT_TZ(lastAccessAt, @@session.time_zone, '+00:00')) * 1000 AS lastAccessAtMs FROM customers WHERE phone = ${phone} LIMIT 1`);
        const row = (rows[0] as unknown as Array<{ fixedPassword: string | null; fixedPasswordActive: number; lastAccessAtMs: number | null }>)[0];
        return { password: row?.fixedPassword ?? null, active: (row?.fixedPasswordActive ?? 0) === 1, lastAccessAt: row?.lastAccessAtMs ? Number(row.lastAccessAtMs) : null };
      }),

    // Admin: salvar lista de produtos permitidos para um cliente
    setProductAccess: adminProcedure
      .input(z.object({ phone: z.string().min(1), productIds: z.array(z.number()) }))
      .mutation(async ({ input }) => {
        const db = await (await import('./db')).getDb();
        if (!db) return { success: false };
        const phone = input.phone.replace(/\D/g, '');
        // Remover permissões antigas e inserir as novas
        await db.execute(sql`DELETE FROM customerProductAccess WHERE phone = ${phone}`);
        for (const productId of input.productIds) {
          await db.execute(sql`INSERT INTO customerProductAccess (phone, productId) VALUES (${phone}, ${productId})`);
        }
        return { success: true };
      }),

    // Admin: obter lista de produtos permitidos para um cliente
    getProductAccess: adminProcedure
      .input(z.object({ phone: z.string().min(1) }))
      .query(async ({ input }) => {
        const db = await (await import('./db')).getDb();
        if (!db) return { productIds: [] };
        const phone = input.phone.replace(/\D/g, '');
        const rows = await db.execute(sql`SELECT productId FROM customerProductAccess WHERE phone = ${phone}`);
        const ids = (rows[0] as unknown as Array<{ productId: number }>).map(r => r.productId);
        return { productIds: ids };
      }),

    // Público: cliente obtém quais produtos pode acessar ([] = sem restrição = vê tudo)
    getAllowedProducts: publicProcedure
      .input(z.object({ phone: z.string().min(1) }))
      .query(async ({ input }) => {
        const db = await (await import('./db')).getDb();
        if (!db) return { productIds: [], restricted: false };
        const phone = input.phone.replace(/\D/g, '');
        const rows = await db.execute(sql`SELECT productId FROM customerProductAccess WHERE phone = ${phone}`);
        const ids = (rows[0] as unknown as Array<{ productId: number }>).map(r => r.productId);
        return { productIds: ids, restricted: ids.length > 0 };
      }),

    // Público: cliente atualiza indicação após o cadastro (step separado)
    updateReferral: publicProcedure
      .input(z.object({
        phone: z.string().min(1),
        referredBy: z.string().min(1),
        referredByPhone: z.string().regex(/^\d{10,11}$/).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const clientIp = (ctx.req.headers['x-forwarded-for'] as string || '').split(',')[0].trim() || ctx.req.socket?.remoteAddress || 'unknown';
        const blockResult = await checkPhoneBlockedAndBlockIp(input.phone, clientIp, 'atualizar_indicacao');
        if (blockResult.blocked) return { success: false, message: 'Acesso bloqueado' };
        const customer = await getCustomerByPhone(input.phone.replace(/\D/g, ''));
        if (!customer) return { success: false, message: 'Cliente não encontrado' };
        // Validar: não pode indicar a si mesmo
        if (input.referredByPhone) {
          const cleanSelf = input.phone.replace(/\D/g, '');
          const cleanRef = input.referredByPhone.replace(/\D/g, '');
          if (cleanSelf === cleanRef) {
            return { success: false, message: 'Você não pode indicar a si mesmo' };
          }
          // Validar: o telefone do indicador deve estar cadastrado no banco
          const referrer = await getCustomerByPhone(cleanRef);
          if (!referrer) {
            return { success: false, message: 'Telefone do indicador não encontrado no cadastro. Verifique o número informado.' };
          }
        }
        // Buscar o nome real do indicador pelo telefone (evita salvar texto digitado pelo cliente)
        let realReferrerName = input.referredBy;
        if (input.referredByPhone) {
          try {
            const referrer = await getCustomerByPhone(input.referredByPhone.replace(/\D/g, ''));
            if (referrer?.name) realReferrerName = referrer.name;
          } catch (e) { /* usa o nome digitado como fallback */ }
        }
        await updateCustomer(customer.id, {
          referredBy: realReferrerName,
          referredByPhone: input.referredByPhone,
        });
        return { success: true };
      }),

    // Público: cliente visualiza seus próprios dados (somente leitura)
    getMyProfile: publicProcedure
      .input(z.object({ phone: z.string().min(1) }))
      .query(async ({ input, ctx }) => {
        const clientIp = (ctx.req.headers['x-forwarded-for'] as string || '').split(',')[0].trim() || ctx.req.socket?.remoteAddress || 'unknown';
        const blockResult = await checkPhoneBlockedAndBlockIp(input.phone, clientIp, 'ver_perfil');
        if (blockResult.blocked) return null;
        const phone = input.phone.replace(/\D/g, '');
        const customer = await getCustomerByPhone(phone);
        if (!customer) return null;
        return {
          name: customer.name,
          phone: customer.phone,
          email: customer.email,
          city: customer.city,
          uf: customer.uf,
          profilePhotoUrl: customer.profilePhotoUrl,
          createdAt: customer.createdAt,
        };
      }),

    // Registrar aviso de opção bloqueante selecionada pelo cliente
    addBlockingNote: publicProcedure
      .input(z.object({
        phone: z.string(),
        question: z.string(),
        answer: z.string(),
      }))
      .mutation(async ({ input }) => {
        const phone = input.phone.replace(/\D/g, '');
        const customer = await getCustomerByPhone(phone);
        if (!customer) return { success: false };
        const timestamp = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        const newNote = `[${timestamp}] âÅ¡Â ïÂ¸Â Recusou: "${input.question}" â" ' selecionou "${input.answer}"\n`;
        const existingNotes = (customer as unknown as { adminNotes?: string | null }).adminNotes || '';
        await updateCustomer(customer.id, { adminNotes: existingNotes + newNote });
        return { success: true };
      }),

    // Admin: listar documentos de um cliente
    getDocuments: adminProcedure
      .input(z.object({ customerId: z.number() }))
      .query(async ({ input }) => {
        return await getCustomerDocuments(input.customerId);
      }),

    // Admin: upload de documento para um cliente
    uploadDocument: adminProcedure
      .input(z.object({
        customerId: z.number(),
        label: z.string().min(1),
        imageBase64: z.string(),
        mimeType: z.string().optional(),
        fileName: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        // Detectar extensão e MIME type do arquivo
        let mime = input.mimeType || 'application/octet-stream';
        let ext = 'bin';
        
        // Tentar extrair extensão do fileName
        if (input.fileName) {
          const parts = input.fileName.split('.');
          if (parts.length > 1) {
            ext = parts[parts.length - 1].toLowerCase();
          }
        }
        
        // Se não conseguiu extensão, tentar do MIME type
        if (ext === 'bin' && mime) {
          const mimeMap: Record<string, string> = {
            'image/jpeg': 'jpg',
            'image/png': 'png',
            'image/gif': 'gif',
            'image/webp': 'webp',
            'application/pdf': 'pdf',
            'application/msword': 'doc',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
            'application/vnd.ms-excel': 'xls',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
            'application/zip': 'zip',
            'text/plain': 'txt',
            'text/csv': 'csv',
            'application/json': 'json',
          };
          ext = mimeMap[mime] || 'bin';
        }
        
        const fileKey = `customer-documents/${input.customerId}-${Date.now()}.${ext}`;
        const { url } = await storagePut(fileKey, Buffer.from(input.imageBase64, 'base64'), mime);
        const doc = await createCustomerDocument({
          customerId: input.customerId,
          label: input.label,
          fileUrl: url,
          fileKey,
          mimeType: mime,
          fileName: input.fileName,
        });
        return { success: true, document: doc };
      }),

    // Admin: deletar documento de um cliente
    deleteDocument: adminProcedure
      .input(z.object({ documentId: z.number() }))
      .mutation(async ({ input }) => {
        await deleteCustomerDocument(input.documentId);
        return { success: true };
      }),

    // Admin: criar cadastro manual de cliente
    adminCreate: adminProcedure
      .input(z.object({
        name: z.string().min(2, 'Nome obrigatório'),
        phone: z.string().regex(/^\d{10,11}$/, 'Telefone inválido (somente dígitos, 10 ou 11)'),
        email: z.string().email('E-mail obrigatório e inválido').min(1, 'E-mail obrigatório'),
        cpf: z.string().transform(value => value.replace(/\D/g, '')).refine(value => /^\d{11}$/.test(value), 'CPF obrigatório e inválido'),
        profilePhotoUrl: z.string().url('Foto de perfil obrigatória').min(1, 'Foto de perfil obrigatória'),
        city: z.string().optional(),
        uf: z.string().length(2).optional().or(z.literal('')),
      }))
      .mutation(async ({ input }) => {
        await ensureCustomerIdentityInfrastructure();
        const profile = {
          name: input.name,
          phone: normalizeCustomerPhone(input.phone),
          email: normalizeCustomerEmail(input.email),
          cpf: normalizeCustomerCpf(input.cpf),
          profilePhotoUrl: input.profilePhotoUrl,
          city: input.city || undefined,
          uf: input.uf || undefined,
        };
        try {
          validateMainCustomerProfile(profile);
        } catch (error: any) {
          return { success: false, message: error?.message || 'Complete os dados obrigatórios.' };
        }
        const existing = await findMainCustomerByIdentity(profile);
        if (existing) return { success: false, message: 'Já existe um cadastro com estes dados. Use o cadastro principal original.' };
        const customer = await createCustomer(profile);
        return { success: true, customer };
      }),
  }),
  // ===== SORTEIOS ======
  raffles: router({
    // Admin: listar todos os sorteios
    list: adminProcedure.query(async () => {
      return getAllRaffles();
    }),

    // Admin: obter sorteio por ID com entradas
    getById: adminProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const raffle = await getRaffleById(input.id);
        if (!raffle) return null;
        const entries = await getRaffleEntries(input.id);
        return { ...raffle, entries };
      }),

    // Admin: criar sorteio
    create: adminProcedure
      .input(z.object({ title: z.string().min(1), description: z.string().optional(), maxNumbersPerPerson: z.number().min(1).max(10).optional() }))
      .mutation(async ({ input }) => {
        const raffle = await createRaffle({ ...input, maxNumbersPerPerson: input.maxNumbersPerPerson ?? 1 });
        return raffle;
      }),

    // Admin: atualizar sorteio (título, descrição, status)
    update: adminProcedure
      .input(z.object({ id: z.number(), title: z.string().optional(), description: z.string().optional(), status: z.enum(["open", "closed", "drawn"]).optional(), maxNumbersPerPerson: z.number().min(1).max(10).optional() }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updateRaffle(id, data);
        return { success: true };
      }),

    // Admin: excluir sorteio
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteRaffle(input.id);
        return { success: true };
      }),

    // Admin: atualizar status de pagamento de uma entrada
    updateEntryPayment: adminProcedure
      .input(z.object({ entryId: z.number(), paymentStatus: z.enum(['pending', 'paid']) }))
      .mutation(async ({ input }) => {
        await updateRaffleEntryPayment(input.entryId, input.paymentStatus);
        return { success: true };
      }),

    // Admin: liberar número não pago (remover entrada)
    removeEntry: adminProcedure
      .input(z.object({ entryId: z.number(), raffleId: z.number() }))
      .mutation(async ({ input }) => {
        await deleteRaffleEntry(input.entryId);
        return { success: true };
      }),

    // Admin: realizar sorteio (sortear um número entre os participantes)
    draw: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const entries = await getRaffleEntries(input.id);
        if (entries.length === 0) return { success: false, error: "Nenhum participante" };
        const winner = entries[Math.floor(Math.random() * entries.length)];
        // Buscar foto de perfil do ganhador
        const winnerCustomer = await getCustomerByPhone(winner.customerPhone);
        await updateRaffle(input.id, {
          status: "drawn",
          winnerNumber: winner.number,
          winnerName: winner.customerName,
          winnerPhone: winner.customerPhone,
          winnerProfilePhotoUrl: winnerCustomer?.profilePhotoUrl || null,
          drawnAt: new Date(),
        });
        return { success: true, winner: { number: winner.number, name: winner.customerName, phone: winner.customerPhone } };
      }),

    // Público: obter sorteio ativo (para cliente escolher número)
    active: publicProcedure.query(async () => {
      const raffle = await getActiveRaffle();
      if (!raffle) return null;
      const entries = await getRaffleEntries(raffle.id);
      const takenNumbers = entries.map(e => e.number);
      return { id: raffle.id, title: raffle.title, description: raffle.description, takenNumbers, maxNumbersPerPerson: raffle.maxNumbersPerPerson ?? 1 };
    }),

    // Público: obter resultado do último sorteio realizado
    result: publicProcedure.query(async () => {
      const raffle = await getLatestDrawnRaffle();
      if (!raffle) return null;
      return { id: raffle.id, title: raffle.title, winnerNumber: raffle.winnerNumber, winnerName: raffle.winnerName, winnerPhone: raffle.winnerPhone, winnerProfilePhotoUrl: raffle.winnerProfilePhotoUrl, drawnAt: raffle.drawnAt };
    }),

    // Público: escolher um número no sorteio ativo
    chooseNumber: publicProcedure
      .input(z.object({ raffleId: z.number(), number: z.number().min(1).max(100), customerName: z.string().min(1), customerPhone: z.string().min(10) }))
      .mutation(async ({ input }) => {
        const raffle = await getRaffleById(input.raffleId);
        if (!raffle || raffle.status !== "open") return { success: false, error: "Sorteio não está aberto" };
        // Verificar limite de números por pessoa
        const entries = await getRaffleEntries(input.raffleId);
        const myEntries = entries.filter((e: any) => e.customerPhone === input.customerPhone);
        const maxAllowed = raffle.maxNumbersPerPerson ?? 1;
        if (myEntries.length >= maxAllowed) {
          if (maxAllowed === 1) {
            return { success: false, error: "Você já escolheu o número " + myEntries[0].number + ". Não é possível alterar." };
          }
          return { success: false, error: `Você já escolheu ${myEntries.length} número(s). Limite máximo: ${maxAllowed}.` };
        }
        const taken = await checkNumberTaken(input.raffleId, input.number);
        if (taken) return { success: false, error: "Número já escolhido por outro participante" };
        await createRaffleEntry({ raffleId: input.raffleId, number: input.number, customerName: input.customerName, customerPhone: input.customerPhone });
        // Notificar admin por e-mail
        const phoneFormatted = input.customerPhone.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
        const raffleNotifTitle = `Í°Å¸Å½« Novo participante no sorteio!`;
        try {
          const transporterRaffle = nodemailer.createTransport({
            host: 'smtp.zoho.com',
            port: 465,
            secure: true,
            auth: { user: 'h2@h2colombiano.com', pass: process.env.SMTP_PASS || process.env.ZOHO_EMAIL_PASSWORD || '' },
          });
          await transporterRaffle.sendMail({
            from: '"H2 COLOMBIANO" <h2@h2colombiano.com>',
            to: await getSetting('contact_email') || 'h2@h2colombiano.com',
            subject: raffleNotifTitle,
            html: `<h2>${raffleNotifTitle}</h2><p>Nome: <strong>${input.customerName}</strong></p><p>Número: <strong>${input.number}</strong></p><p>Telefone: ${phoneFormatted}</p><p>Sorteio: ${raffle.title}</p>`,
          });
        } catch (e) { console.warn('[RaffleEmail] Erro ao enviar e-mail:', e); }
        return { success: true };
      }),

    // Público: verificar se telefone já escolheu número
    myEntry: publicProcedure
      .input(z.object({ raffleId: z.number(), phone: z.string().min(10) }))
      .query(async ({ input }) => {
        const entries = await getRaffleEntries(input.raffleId);
        const myEntries = entries.filter((e: any) => e.customerPhone === input.phone);
        if (myEntries.length === 0) return { hasEntry: false, number: null, numbers: [] as number[], count: 0 };
        return { hasEntry: true, number: myEntries[0].number, numbers: myEntries.map((e: any) => e.number), count: myEntries.length };
      }),

    // Público: listar números já escolhidos (para exibir no grid)
    entries: publicProcedure
      .input(z.object({ raffleId: z.number() }))
      .query(async ({ input }) => {
        return getRaffleEntries(input.raffleId);
      }),
  }),

  // === AUTENTICACAO ADMIN INDEPENDENTE ===
  adminAuth: router({
    // Setup inicial: cria admin se não existir nenhum (apenas se tabela estiver vazia)
    setup: publicProcedure
      .input(z.object({ username: z.string().min(1), password: z.string().min(6) }))
      .mutation(async ({ input }) => {
        const { adminCredentials: adminCredsTable } = await import('../drizzle/schema');
        const db = await (await import('./db')).getDb();
        if (!db) return { success: false, error: 'DB indisponível' };
        const existing = await getAdminCredential(input.username);
        if (existing) return { success: false, error: 'Admin já existe' };
        const hash = await bcrypt.hash(input.password, 12);
        await db.insert(adminCredsTable).values({ username: input.username, passwordHash: hash });
        return { success: true };
      }),
    // Login: valida username+password e seta cookie de sessão admin
    login: publicProcedure
      .input(z.object({ username: z.string().min(1), password: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        // Obter IP real do cliente
        const ip = (ctx.req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || ctx.req.socket.remoteAddress || 'unknown';
        // Verificar se IP está bloqueado
        const blocked = await isAdminLoginBlocked(ip);
        if (blocked) {
          return { success: false, error: 'IP_BLOCKED', message: 'Acesso bloqueado após 3 tentativas. Use a contra-senha para desbloquear.' };
        }
        const cred = await getAdminCredential(input.username);
        const valid = cred ? await bcrypt.compare(input.password, cred.passwordHash) : false;
        if (!cred || !valid) {
          const result = await recordAdminLoginAttempt(ip);
          const remaining = Math.max(0, 3 - result.attempts);
          if (result.blocked) {
            return { success: false, error: 'IP_BLOCKED', message: 'Acesso bloqueado após 3 tentativas. Use a contra-senha para desbloquear.' };
          }
          return { success: false, error: 'INVALID_CREDENTIALS', message: `Usuário ou senha incorretos. ${remaining} tentativa(s) restante(s).` };
        }
        // Login bem-sucedido: zerar tentativas
        await resetAdminLoginAttempts(ip);
        // Criar token JWT simples com username e timestamp
        const secret = process.env.JWT_SECRET || 'admin-secret-fallback';
        const token = jwt.sign(
          { sub: cred.username, role: 'admin', iat: Math.floor(Date.now() / 1000) },
          secret,
          { expiresIn: '7d' }
        );
        const adminCookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie('admin_token', token, {
          ...adminCookieOptions,
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dias
        });
        return { success: true };
      }),

    // Desbloquear IP com contra-senha
    unlock: publicProcedure
      .input(z.object({ counterPassword: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        const ip = (ctx.req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || ctx.req.socket.remoteAddress || 'unknown';
        // Contra-senha armazenada como variável de ambiente ADMIN_COUNTER_PASSWORD
        const counterPwd = process.env.ADMIN_COUNTER_PASSWORD || '';
        if (!counterPwd) return { success: false, error: 'Contra-senha não configurada. Configure ADMIN_COUNTER_PASSWORD.' };
        if (input.counterPassword !== counterPwd) {
          return { success: false, error: 'Contra-senha incorreta.' };
        }
        await resetAdminLoginAttempts(ip);
        return { success: true };
      }),

    // Solicitar desbloqueio via Manus (envia notificação ao dono)
    requestUnlock: publicProcedure
      .input(z.object({ message: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        const ip = (ctx.req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || ctx.req.socket.remoteAddress || 'unknown';
        const title = 'Í°Å¸"Â Solicitação de Desbloqueio Admin';
        const content = `IP ${ip} está bloqueado e solicita desbloqueio.\n\nMensagem: ${input.message || 'Sem mensagem'}\n\nPara desbloquear, acesse o painel e use a opção de desbloqueio.`;
        try {
          const transporter = nodemailer.createTransport({
            host: 'smtp.zoho.com',
            port: 465,
            secure: true,
            auth: { user: 'h2@h2colombiano.com', pass: process.env.SMTP_PASS || process.env.ZOHO_EMAIL_PASSWORD || '' },
          });
          await transporter.sendMail({
            from: '"H2 COLOMBIANO" <h2@h2colombiano.com>',
            to: await getSetting('contact_email') || 'h2@h2colombiano.com',
            subject: title,
            html: `<h2>${title}</h2><pre style="font-family:monospace;white-space:pre-wrap">${content}</pre>`,
          });
        } catch (e) { console.warn('[UnlockEmail] Erro ao enviar e-mail:', e); }
        return { success: true };
      }),

    // Desbloquear IP específico (apenas admin autenticado)
    unblockIpAdmin: adminProcedure
      .input(z.object({ ip: z.string() }))
      .mutation(async ({ input }) => {
        await resetAdminLoginAttempts(input.ip);
        return { success: true };
      }),

    // Listar IPs bloqueados (apenas admin)
    listBlockedIps: adminProcedure
      .query(async () => {
        return await listBlockedAdminIps();
      }),

    // Logout: limpa cookie admin
    logout: publicProcedure
      .mutation(({ ctx }) => {
        ctx.res.clearCookie('admin_token', { path: '/' });
        return { success: true };
      }),

    // Check: verifica se cookie admin é válido
    check: publicProcedure
      .query(({ ctx }) => {
        const cookieHeader = ctx.req.headers.cookie || '';
        const cookies = parseCookieHeader(cookieHeader);
        const token = cookies.admin_token;
        if (!token) return { isAdmin: false };
        try {
          const secret = process.env.JWT_SECRET || 'admin-secret-fallback';
          const payload = jwt.verify(token, secret) as { sub: string; role: string };
          return { isAdmin: payload.role === 'admin', username: payload.sub };
        } catch {
          return { isAdmin: false };
        }
      }),

    // Alterar senha admin
    changePassword: publicProcedure
      .input(z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(6) }))
      .mutation(async ({ input, ctx }) => {
        const cookieHeader = ctx.req.headers.cookie || '';
        const cookies = parseCookieHeader(cookieHeader);
        const token = cookies.admin_token;
        if (!token) return { success: false, error: 'Não autenticado' };
        try {
          const secret = process.env.JWT_SECRET || 'admin-secret-fallback';
          const payload = jwt.verify(token, secret) as { sub: string; role: string };
          if (payload.role !== 'admin') return { success: false, error: 'Sem permissão' };
          const cred = await getAdminCredential(payload.sub);
          if (!cred) return { success: false, error: 'Usuário não encontrado' };
          const valid = await bcrypt.compare(input.currentPassword, cred.passwordHash);
          if (!valid) return { success: false, error: 'Senha atual incorreta' };
          const newHash = await bcrypt.hash(input.newPassword, 12);
          await updateAdminPassword(payload.sub, newHash);
          return { success: true };
        } catch {
          return { success: false, error: 'Token inválido' };
        }
      }),
  }),

  // ========== STATUS DO PEDIDO ==========
  orderStatus: router({
    // Buscar nome do cliente pelo telefone (para exibir na página de acompanhamento)
    getClientName: publicProcedure
      .input(z.object({ phone: z.string() }))
      .query(async ({ input, ctx }) => {
        const clientIp = (ctx.req.headers['x-forwarded-for'] as string || '').split(',')[0].trim() || ctx.req.socket?.remoteAddress || 'unknown';
        const blockResult = await checkPhoneBlockedAndBlockIp(input.phone, clientIp, 'acompanhar_pedido');
        if (blockResult.blocked) return { name: null, blocked: true };
        const customer = await getCustomerByPhone(input.phone.replace(/\D/g, ''));
        return { name: customer?.name || null };
      }),
    // Admin: buscar nome do indicador pelo telefone (autocomplete no formulário)
    lookupReferrerByPhone: adminProcedure
      .input(z.object({ phone: z.string() }))
      .query(async ({ input }) => {
        const phone = input.phone.replace(/\D/g, '');
        if (phone.length < 10) return { name: null, found: false };
        const customer = await getCustomerByPhone(phone);
        if (!customer) return { name: null, found: false };
        return { name: customer.name || null, found: true };
      }),
    // Admin: listar todos os pedidos com status mais recente
    // Suporta múltiplos pedidos no mesmo registrationId (separados por cada 'recebido')
    listOrders: adminProcedure.query(async () => {
      const db = await (await import('./db')).getDb();
      if (!db) return [];

      // Buscar todos os registrationIds com histórico
      const acpResult = await db.execute(sql`
        SELECT 
          acp.id,
          acp.codeId,
          acp.phone,
          UNIX_TIMESTAMP(acp.accessedAt) * 1000 AS accessedAt,
          acp.consumed,
          acp.orderSource,
          acp.refCode,
          acp.refOwnerName,
          acp.cartGroupId,
          acp.cartTotal,
          acp.cartCouponCode,
          acp.cartCouponDiscount,
          acp.cartItemIndex,
          acp.thirdPartyName,
          acp.resellerDiscountApplied,
          ac.clientName as codeClientName,
          ac.type as codeType,
          c.id as customerId,
          c.email as customerEmail,
          c.name as customerName,
          c.city as customerCity,
          c.uf as customerUf,
          c.referredBy as customerReferredBy,
          c.referredByPhone as customerReferredByPhone,
          c.profilePhotoUrl as customerProfilePhotoUrl,
          c.customerNumber as customerNumber,
          CASE WHEN EXISTS (
            SELECT 1 FROM blocklist bl
            WHERE (bl.type = 'phone' OR bl.type = 'both')
              AND REGEXP_REPLACE(bl.phone, '[^0-9]', '') = REGEXP_REPLACE(acp.phone, '[^0-9]', '')
              AND bl.phone IS NOT NULL AND bl.phone != ''
          ) THEN 1 ELSE 0 END AS isBlocked
        FROM accessCodePhones acp
        LEFT JOIN accessCodes ac ON ac.id = acp.codeId
        LEFT JOIN customers c ON REGEXP_REPLACE(c.phone, '[^0-9]', '') = REGEXP_REPLACE(acp.phone, '[^0-9]', '')
        WHERE acp.archived = 0
          AND acp.rgCnhApproved = 0
          AND (ac.type IS NULL OR ac.type != 'raffle')
          AND EXISTS (SELECT 1 FROM orderStatusHistory WHERE registrationId = acp.id)
        ORDER BY acp.accessedAt DESC
      `);
      const acpRows = (acpResult as any)[0] as any[];

      // ---- Pedidos Í"RFÍÆ’OS ----
      // Alguns pedidos têm histórico (orderStatusHistory) cujo registrationId NÍÆ’O existe em
      // accessCodePhones (dados importados/migrados de versões anteriores). Sem isto eles
      // ficam invisíveis no admin, apesar de o cliente enxergá-los em "Acompanhar Pedido"
      // (que busca por telefone). Aqui reconstruímos uma linha virtual de acp para cada
      // registrationId órfão, ligando ao cliente pelo telefone quando possível.
      const knownAcpIds = new Set<number>((acpRows || []).map((r: any) => Number(r.id)));
      let orphanRows: any[] = [];
      try {
        const orphanResult = await db.execute(sql`
          SELECT
            osh.registrationId AS id,
            NULL AS codeId,
            osh.customerPhone AS phone,
            UNIX_TIMESTAMP(MIN(osh.createdAt)) * 1000 AS accessedAt,
            0 AS consumed,
            'auto' AS orderSource,
            NULL AS refCode,
            NULL AS refOwnerName,
            NULL AS codeClientName,
            NULL AS codeType,
            c.id AS customerId,
            c.email AS customerEmail,
            c.name AS customerName,
            c.city AS customerCity,
            c.uf AS customerUf,
            c.referredBy AS customerReferredBy,
            c.referredByPhone AS customerReferredByPhone,
            c.profilePhotoUrl AS customerProfilePhotoUrl,
            c.customerNumber AS customerNumber,
            CASE WHEN EXISTS (
              SELECT 1 FROM blocklist bl
              WHERE (bl.type = 'phone' OR bl.type = 'both')
                AND REGEXP_REPLACE(bl.phone, '[^0-9]', '') = REGEXP_REPLACE(osh.customerPhone, '[^0-9]', '')
                AND bl.phone IS NOT NULL AND bl.phone != ''
            ) THEN 1 ELSE 0 END AS isBlocked
          FROM orderStatusHistory osh
          LEFT JOIN accessCodePhones acp ON acp.id = osh.registrationId
          LEFT JOIN customers c ON REGEXP_REPLACE(c.phone, '[^0-9]', '') = REGEXP_REPLACE(osh.customerPhone, '[^0-9]', '') AND c.deletedAt IS NULL
          WHERE acp.id IS NULL
            AND osh.approval = 'approved'
            AND NOT EXISTS (
              SELECT 1 FROM hiddenSubOrders h
              WHERE h.registrationId = osh.registrationId
            )
          GROUP BY osh.registrationId, osh.customerPhone, c.id, c.email, c.name, c.city, c.uf, c.referredBy, c.referredByPhone, c.profilePhotoUrl, c.customerNumber
        `);
        orphanRows = ((orphanResult as any)[0] as any[]) || [];
        // Segurança extra: nunca duplicar um id já presente em acpRows
        orphanRows = orphanRows.filter((r: any) => !knownAcpIds.has(Number(r.id)));
      } catch (e) { console.error('[listOrders] Erro ao buscar pedidos órfãos:', e); }

      const allAcpRows = [...(acpRows || []), ...orphanRows];
      if (!allAcpRows || allAcpRows.length === 0) return [];

      // Para cada acp, buscar TODO o histórico de status para dividir sub-pedidos por 'recebido'
      const ids = allAcpRows.map((r: any) => r.id);
      const idsList = ids.join(',');

      // Buscar histórico completo de todos os registrationIds
      const histResult = await db.execute(
        sql.raw(`SELECT id, registrationId, status, serviceName, serviceOption, pricePaid, answers, orderNumber, deliveryEstimate, isUrgent, commissionPaid, UNIX_TIMESTAMP(createdAt) * 1000 AS createdAtMs, note, UNIX_TIMESTAMP(deliveredNotifiedAt) * 1000 AS deliveredNotifiedAtMs
          FROM orderStatusHistory
          WHERE registrationId IN (${idsList})
          ORDER BY registrationId ASC, createdAt ASC`)
      );
      const histRows = (histResult as any)[0] as any[];

      // Buscar sub-pedidos ocultos (soft delete)
      const hiddenResult = await db.execute(
        sql.raw(`SELECT registrationId, subOrderIndex FROM hiddenSubOrders WHERE registrationId IN (${idsList})`)
      );
      const hiddenRows = (hiddenResult as any)[0] as Array<{ registrationId: number; subOrderIndex: number }>;
      const hiddenSet = new Set(hiddenRows.map((h: any) => `${h.registrationId}_${h.subOrderIndex}`));

      // Agrupar histórico por registrationId
      const histByRegId = new Map<number, any[]>();
      for (const r of histRows) {
        const regId = Number(r.registrationId);
        if (!histByRegId.has(regId)) histByRegId.set(regId, []);
        histByRegId.get(regId)!.push(r);
      }

      // Buscar o status inicial dinâmico do banco (sortOrder mais baixo)
      let initialStatus = 'recebido';
      try {
        const statusTypesResult = await db.execute(sql`SELECT \`key\` FROM orderStatusTypes WHERE isActive = 1 ORDER BY sortOrder ASC LIMIT 1`);
        const statusTypesRows = (statusTypesResult as any)[0] as any[];
        if (statusTypesRows && statusTypesRows.length > 0 && statusTypesRows[0].key) {
          initialStatus = statusTypesRows[0].key;
        }
      } catch (e) { /* usa 'recebido' como fallback */ }

      // Para cada registrationId, dividir em sub-pedidos pelo marcador do status inicial
      // (mesma lógica do OrderTracking.tsx)
      function splitIntoSubOrders(history: any[]): any[][] {
        if (history.length === 0) return [];
        // history já está em ASC
        const result: any[][] = [];
        let current: any[] = [];
        for (const entry of history) {
          if ((entry.status === initialStatus || entry.status === 'recebido') && current.length > 0) {
            result.push(current);
            current = [entry];
          } else {
            current.push(entry);
          }
        }
        if (current.length > 0) result.push(current);
        // Reverter para que o sub-pedido mais recente seja o primeiro (índice 0)
        return result.reverse();
      }

      // Helper para normalizar valores "NULL" string do banco
      const normalizeNull = (v: any) => (v === null || v === undefined || v === 'NULL' || v === 'null' ? null : v);

      // Construir lista final de pedidos (1 entrada por sub-pedido)
      const finalOrders: any[] = [];
      for (const row of allAcpRows) {
        const history = histByRegId.get(Number(row.id)) || [];
        const subOrders = splitIntoSubOrders(history);
        if (subOrders.length === 0) {
          // Sem histórico, criar entrada vazia
          finalOrders.push({
            id: row.id,
            codeId: row.codeId,
            phone: row.phone,
            accessedAt: row.accessedAt,
            consumed: row.consumed,
            orderSource: row.orderSource ?? 'auto',
            refCode: row.refCode ?? null,
            refOwnerName: row.refOwnerName ?? null,
            codeClientName: row.codeClientName,
            codeType: row.codeType,
            customerId: row.customerId,
            customerEmail: row.customerEmail,
            customerName: row.customerName,
            customerCity: row.customerCity,
            customerUf: row.customerUf,
            customerReferredBy: row.customerReferredBy,
            customerReferredByPhone: row.customerReferredByPhone,
            customerProfilePhotoUrl: row.customerProfilePhotoUrl,
            customerNumber: row.customerNumber,
            isBlocked: Number(row.isBlocked) === 1,
            latestStatus: null,
            latestStatusAt: null,
            serviceName: null,
            serviceOption: null,
            pricePaid: null,
            answers: null,
            submittedAt: null,
            isUrgent: 0,
            commissionPaid: 0,
            orderNumber: null,
            deliveryEstimate: null,
            subOrderIndex: 0,
            cartGroupId: normalizeNull(row.cartGroupId) ?? null,
            cartTotal: normalizeNull(row.cartTotal) != null ? Number(row.cartTotal) : null,
            cartCouponCode: normalizeNull(row.cartCouponCode) ?? null,
            cartCouponDiscount: normalizeNull(row.cartCouponDiscount) != null ? Number(row.cartCouponDiscount) : null,
            cartItemIndex: row.cartItemIndex != null ? Number(row.cartItemIndex) : 0,
            thirdPartyName: normalizeNull(row.thirdPartyName) ?? null,
            resellerDiscountApplied: normalizeNull(row.resellerDiscountApplied) != null ? Number(row.resellerDiscountApplied) : null,
          });
          continue;
        }
        // Pré-calcular serviceName herdado: se um sub-pedido não tem serviceName,
        // herda do sub-pedido anterior do mesmo registrationId
        // subOrders está em ordem reversa (mais recente primeiro), então iterar de trás para frente
        const subOrdersAsc = [...subOrders].reverse(); // mais antigo primeiro
        let lastKnownServiceName: string | null = null;
        let lastKnownServiceOption: string | null = null;
        const resolvedServiceNames: Array<{ serviceName: string | null; serviceOption: string | null }> = [];
        for (const subHistory of subOrdersAsc) {
          // Procurar serviceName em qualquer entrada do sub-pedido (não só a primeira)
          const anyWithService = subHistory.find((h: any) => normalizeNull(h.serviceName) !== null);
          const sn: string | null = anyWithService ? normalizeNull(anyWithService.serviceName) : lastKnownServiceName;
          const so: string | null = anyWithService ? normalizeNull(anyWithService.serviceOption) : lastKnownServiceOption;
          resolvedServiceNames.push({ serviceName: sn, serviceOption: so });
          if (sn) { lastKnownServiceName = sn; lastKnownServiceOption = so; }
        }
        // Reverter para ordem DESC (mais recente primeiro = índice 0)
        resolvedServiceNames.reverse();

        subOrders.forEach((subHistory, subIdx) => {
          // Pular sub-pedidos ocultos (soft delete)
          if (hiddenSet.has(`${row.id}_${subIdx}`)) return;
          // subHistory está em ASC (mais antigo primeiro)
          const first = subHistory[0];
          const last = subHistory[subHistory.length - 1];
          const isUrgent = subHistory.some((h: any) => h.isUrgent) ? 1 : 0;
          const commissionPaid = subHistory.some((h: any) => h.commissionPaid) ? 1 : 0;
          // Pegar orderNumber do primeiro que tiver
          const anyWithOrder = subHistory.find((h: any) => normalizeNull(h.orderNumber) !== null);
          const rawOrderNumber = anyWithOrder ? normalizeNull(anyWithOrder.orderNumber) : null;
          const resolvedOrderNumber = rawOrderNumber != null ? Number(rawOrderNumber) : null;
          finalOrders.push({
            id: row.id,
            codeId: row.codeId,
            phone: row.phone,
            accessedAt: row.accessedAt,
            consumed: row.consumed,
            orderSource: row.orderSource ?? 'auto',
            refCode: row.refCode ?? null,
            refOwnerName: row.refOwnerName ?? null,
            codeClientName: row.codeClientName,
            codeType: row.codeType,
            customerId: row.customerId,
            customerEmail: row.customerEmail,
            customerName: row.customerName,
            customerCity: row.customerCity,
            customerUf: row.customerUf,
            customerReferredBy: row.customerReferredBy,
            customerReferredByPhone: row.customerReferredByPhone,
            customerProfilePhotoUrl: row.customerProfilePhotoUrl,
            customerNumber: row.customerNumber,
            isBlocked: Number(row.isBlocked) === 1,
            latestStatus: normalizeNull(last?.status) ?? null,
            latestStatusAt: last?.createdAtMs ? Number(last.createdAtMs) : null,
            deliveredNotifiedAt: last?.deliveredNotifiedAtMs ? Number(last.deliveredNotifiedAtMs) : null,
            serviceName: resolvedServiceNames[subIdx]?.serviceName ?? null,
            serviceOption: resolvedServiceNames[subIdx]?.serviceOption ?? null,
            pricePaid: normalizeNull(subHistory.find((h: any) => normalizeNull(h.pricePaid) !== null)?.pricePaid) ?? null,
            answers: normalizeNull(first?.answers) ?? null,
            submittedAt: first?.createdAtMs ? Number(first.createdAtMs) : null,
            isUrgent,
            commissionPaid,
            orderNumber: resolvedOrderNumber,
            deliveryEstimate: normalizeNull(first?.deliveryEstimate) != null ? Number(normalizeNull(first?.deliveryEstimate)) : null,
            subOrderIndex: subIdx,
            cartGroupId: normalizeNull(row.cartGroupId) ?? null,
            cartTotal: normalizeNull(row.cartTotal) != null ? Number(row.cartTotal) : null,
            cartCouponCode: normalizeNull(row.cartCouponCode) ?? null,
            cartCouponDiscount: normalizeNull(row.cartCouponDiscount) != null ? Number(row.cartCouponDiscount) : null,
            cartItemIndex: row.cartItemIndex != null ? Number(row.cartItemIndex) : 0,
            thirdPartyName: normalizeNull(row.thirdPartyName) ?? null,
            resellerDiscountApplied: normalizeNull(row.resellerDiscountApplied) != null ? Number(row.resellerDiscountApplied) : null,
          });
        });
      }

      // Buscar pasta personalizada de cada sub-pedido (registrationId + subOrderIndex)
      const folderByKey = new Map<string, { folderName: string; folderIcon: string | null }>();
      try {
        const folderResult = await db.execute(
          sql.raw(`SELECT cfo.registrationId, cfo.subOrderIndex, cf.name AS folderName, cf.icon AS folderIcon
            FROM customFolderOrders cfo
            JOIN customFolders cf ON cf.id = cfo.folderId
            WHERE cfo.registrationId IN (${idsList})`)
        );
        const folderRows = (folderResult as any)[0] as any[];
        for (const fr of (folderRows || [])) {
          folderByKey.set(`${fr.registrationId}_${fr.subOrderIndex}`, { folderName: fr.folderName, folderIcon: fr.folderIcon });
        }
      } catch (e) { /* ignora erro */ }

      // Buscar registrationIds com docRequests respondidos (status='answered')
      let answeredDocReqIds = new Set<number>();
      try {
        const drResult = await db.execute(
          sql.raw(`SELECT DISTINCT registrationId FROM docRequests WHERE status = 'answered'`)
        );
        const drRows = (drResult as any)[0] as any[];
        for (const r of drRows) answeredDocReqIds.add(Number(r.registrationId));
      } catch (e) { /* ignora erro */ }

      // Buscar registrationIds com respostas de perguntas de acompanhamento (assignments com answer preenchido)
      let answeredAssignmentIds = new Set<number>();
      try {
        const aqResult = await db.execute(
          sql.raw(`SELECT DISTINCT orderId FROM trackingQuestionAssignments WHERE answer IS NOT NULL AND answer != ''`)
        );
        const aqRows = (aqResult as any)[0] as any[];
        for (const r of aqRows) answeredAssignmentIds.add(Number(r.orderId));
      } catch (e) { /* ignora erro */ }

      // Buscar scheduleStatus de cada pedido (pending = aguardando, confirmed = confirmado, null = sem agendamento)
      const scheduleStatusMap = new Map<string, string>();
      const scheduleSlotMap = new Map<string, { slotDate: string | null; slotTime: string | null; confirmedAt: string | null }>();
      try {
        const schedResult = await db.execute(
          sql.raw(`SELECT registrationId, subOrderIndex, status, slotDate, slotTime, confirmedAt FROM scheduleAppointments WHERE registrationId IN (${idsList}) AND status != 'cancelled' ORDER BY createdAt DESC`)
        );
        const schedRows = (schedResult as any)[0] as any[];
        // Pegar o status mais recente por (registrationId, subOrderIndex)
        for (const sr of (schedRows || [])) {
          const key = `${sr.registrationId}_${sr.subOrderIndex}`;
          if (!scheduleStatusMap.has(key)) {
            scheduleStatusMap.set(key, sr.status);
            // confirmedAt como ISO string para fallback de ordenação
            const confirmedAtStr = sr.confirmedAt ? new Date(sr.confirmedAt).toISOString() : null;
            scheduleSlotMap.set(key, { slotDate: sr.slotDate ?? null, slotTime: sr.slotTime ?? null, confirmedAt: confirmedAtStr });
          }
        }
      } catch (e) { /* ignora erro */ }

      // Fallback por telefone: agendamentos criados com registrationId diferente (re-cadastro)
      // Para pedidos sem scheduleStatus, buscar pelo telefone do cliente
      try {
        const ordersWithoutSchedule = finalOrders.filter((o: any) => !scheduleStatusMap.has(`${o.id}_${o.subOrderIndex}`));
        if (ordersWithoutSchedule.length > 0) {
          const phones = [...new Set(ordersWithoutSchedule.map((o: any) => (o.customerPhone || '').replace(/\D/g, '')).filter((p: string) => p.length >= 8))];
          if (phones.length > 0) {
            const phonesStr = phones.map((p: string) => `'${p}'`).join(',');
            const fallbackResult = await db.execute(
              sql.raw(`SELECT customerPhone, status, slotDate, slotTime, confirmedAt FROM scheduleAppointments WHERE customerPhone IN (${phonesStr}) AND status != 'cancelled' ORDER BY FIELD(status,'confirmed','pending'), createdAt DESC`)
            );
            const fallbackRows = (fallbackResult as any)[0] as any[];
            // Mapa de telefone -> status + slot mais prioritário (confirmed > pending)
            const phoneStatusMap = new Map<string, string>();
            const phoneSlotMap = new Map<string, { slotDate: string | null; slotTime: string | null; confirmedAt: string | null }>();
            for (const fr of (fallbackRows || [])) {
              const phone = (fr.customerPhone || '').replace(/\D/g, '');
              const confirmedAtStr = fr.confirmedAt ? new Date(fr.confirmedAt).toISOString() : null;
              if (!phoneStatusMap.has(phone)) {
                phoneStatusMap.set(phone, fr.status);
                phoneSlotMap.set(phone, { slotDate: fr.slotDate ?? null, slotTime: fr.slotTime ?? null, confirmedAt: confirmedAtStr });
              } else if (fr.status === 'confirmed') {
                phoneStatusMap.set(phone, 'confirmed'); // confirmed tem prioridade
                phoneSlotMap.set(phone, { slotDate: fr.slotDate ?? null, slotTime: fr.slotTime ?? null, confirmedAt: confirmedAtStr });
              }
            }
            // Aplicar fallback para pedidos sem scheduleStatus
            for (const o of ordersWithoutSchedule) {
              const phone = (o.customerPhone || '').replace(/\D/g, '');
              const fallbackStatus = phoneStatusMap.get(phone);
              if (fallbackStatus) {
                scheduleStatusMap.set(`${o.id}_${o.subOrderIndex}`, fallbackStatus);
                const slotInfo = phoneSlotMap.get(phone);
                if (slotInfo) scheduleSlotMap.set(`${o.id}_${o.subOrderIndex}`, slotInfo);
              }
            }
          }
        }
      } catch (e) { /* ignora erro no fallback */ }

      // Adicionar flag hasNewDocResponse, hasNewTrackingAnswer e pasta personalizada em cada pedido
      const finalOrdersWithFlag = finalOrders.map((o: any) => {
        const folderInfo = folderByKey.get(`${o.id}_${o.subOrderIndex}`) ?? null;
        return {
          ...o,
          hasNewDocResponse: answeredDocReqIds.has(Number(o.id)),
          hasNewTrackingAnswer: answeredAssignmentIds.has(Number(o.id)),
          folderName: folderInfo?.folderName ?? null,
          folderIcon: folderInfo?.folderIcon ?? null,
          scheduleStatus: scheduleStatusMap.get(`${o.id}_${o.subOrderIndex}`) ?? null,
          scheduleSlotDate: scheduleSlotMap.get(`${o.id}_${o.subOrderIndex}`)?.slotDate ?? null,
          scheduleSlotTime: scheduleSlotMap.get(`${o.id}_${o.subOrderIndex}`)?.slotTime ?? null,
          scheduleConfirmedAt: scheduleSlotMap.get(`${o.id}_${o.subOrderIndex}`)?.confirmedAt ?? null,
        };
      });

      return finalOrdersWithFlag.sort((a: any, b: any) => {
        const dateA = new Date(a.latestStatusAt || a.accessedAt).getTime();
        const dateB = new Date(b.latestStatusAt || b.accessedAt).getTime();
        return dateB - dateA;
      });
    }),

    // Admin: listar arquivos de um pedido
    getFiles: adminProcedure
      .input(z.object({ registrationId: z.number() }))
      .query(async ({ input }) => {
        return await getOrderFiles(input.registrationId);
      }),

    // Admin: listar todos os arquivos de um cliente pelo telefone
    getFilesByPhone: adminProcedure
      .input(z.object({ phone: z.string() }))
      .query(async ({ input }) => {
        return await getOrderFilesByPhone(input.phone);
      }),

    // Admin: listar arquivos agrupados por pedido
    getFilesByPhoneGrouped: adminProcedure
      .input(z.object({ phone: z.string() }))
      .query(async ({ input }) => {
        return await getOrderFilesByPhoneGrouped(input.phone);
      }),

    // Admin: enviar novo documento em um pedido
    uploadFile: adminProcedure
      .input(z.object({
        registrationId: z.number(),
        customerPhone: z.string(),
        label: z.string().min(1),
        fileBase64: z.string(),
        mimeType: z.string(),
        fromAdmin: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const r = resolveFileExt(input.mimeType);
        const safeLabel = input.label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/gi, '');
        const randomSuffix = Math.random().toString(36).substring(2, 10);
        const prefix = input.fromAdmin ? 'admin-docs' : 'order-docs';
        const fileKey = `${prefix}/${input.customerPhone}-${safeLabel}-${randomSuffix}.${r.ext}`;
        const { url } = await storagePut(fileKey, Buffer.from(input.fileBase64, 'base64'), r.contentType);
        await addOrderFile({
          registrationId: input.registrationId,
          customerPhone: input.customerPhone,
          label: input.label,
          fileUrl: url,
          fileKey,
          mimeType: r.contentType,
          fromAdmin: input.fromAdmin ?? 0,
        });
        return { success: true, fileUrl: url };
      }),

    // Público: buscar arquivos enviados pelo CLIENTE (não-admin) para pré-preencher ao retomar cadastro
    getClientFiles: publicProcedure
      .input(z.object({ phone: z.string() }))
      .query(async ({ input }) => {
        if (!input.phone || input.phone.replace(/\D/g, '').length < 8) return [];
        const files = await getOrderFilesByPhone(input.phone);
        // Retornar apenas arquivos enviados pelo cliente (fromAdmin = 0)
        return files
          .filter(f => Number(f.fromAdmin) === 0)
          .map(f => ({
            id: f.id,
            label: f.label,
            fileUrl: f.fileUrl,
            mimeType: f.mimeType,
            registrationId: f.registrationId,
            createdAt: f.createdAt,
          }));
      }),

    // Público: buscar documentos enviados pelo admin para o cliente
    getAdminFilesForClient: publicProcedure
      .input(z.object({ phone: z.string(), registrationId: z.number().int().optional() }))
      .query(async ({ input }) => {
        const db = await (await import('./db')).getDb();
        if (!db) return [];
        const files = await getOrderFilesByPhone(input.phone);
        const adminFiles = files.filter(f => Number(f.fromAdmin) === 1);
        // Se registrationId fornecido, filtrar apenas arquivos deste pedido específico
        if (input.registrationId && input.registrationId > 0) {
          return adminFiles.filter(f => f.registrationId === input.registrationId);
        }
        return adminFiles;
      }),

    // Admin: excluir documento de um pedido
    deleteFile: adminProcedure
      .input(z.object({ fileId: z.number() }))
      .mutation(async ({ input }) => {
        await deleteOrderFile(input.fileId);
        return { success: true };
      }),

    // Admin: reutilizar documento existente em outro pedido (sem re-upload)
    reuseFile: adminProcedure
      .input(z.object({
        sourceFileId: z.number(),
        targetRegistrationId: z.number(),
        targetCustomerPhone: z.string(),
        label: z.string().min(1),
        fromAdmin: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await (await import('./db')).getDb();
        if (!db) throw new Error('DB not available');
        const { orderFiles: orderFilesTable } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        const [source] = await db.select().from(orderFilesTable).where(eq(orderFilesTable.id, input.sourceFileId)).limit(1);
        if (!source) throw new Error('Arquivo de origem não encontrado');
        await addOrderFile({
          registrationId: input.targetRegistrationId,
          customerPhone: input.targetCustomerPhone,
          label: input.label,
          fileUrl: source.fileUrl,
          fileKey: source.fileKey ?? `reused/${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
          mimeType: source.mimeType ?? 'application/octet-stream',
          fromAdmin: input.fromAdmin ?? 0,
        });
        return { success: true };
      }),

    // Admin: salvar URL de vídeo externo (YouTube, Google Drive, Vimeo, etc.) sem upload
    addVideoUrl: adminProcedure
      .input(z.object({
        registrationId: z.number(),
        customerPhone: z.string(),
        label: z.string().min(1),
        videoUrl: z.string().url(),
      }))
      .mutation(async ({ input }) => {
        await addOrderFile({
          registrationId: input.registrationId,
          customerPhone: input.customerPhone,
          label: input.label,
          fileUrl: input.videoUrl,
          fileKey: `video-url/${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
          mimeType: 'video/external',
          fromAdmin: 1,
        });
        return { success: true };
      }),

    // Admin: atualizar status e enviar email ao cliente
    update: adminProcedure
      .input(z.object({
        registrationId: z.number(),
        customerPhone: z.string(),
        customerEmail: z.string().email().optional(),
        customerName: z.string().optional(),
        status: z.string(),
        note: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        // NUNCA inserir 'recebido' via update do admin — esse status é exclusivo do sistema
        // (inserir 'recebido' cria um novo sub-pedido duplicado)
        if (input.status === 'recebido') {
          return { success: false, error: 'Status recebido não pode ser definido manualmente' };
        }
        // Salvar no histórico
        await addOrderStatus({
          registrationId: input.registrationId,
          customerPhone: input.customerPhone,
          status: input.status,
          note: input.note,
        });

        const statusInfo = await getStatusInfoFromDb(input.status);
        const statusLabel = statusInfo.label;

        // Enviar email ao admin quando status muda
        const emailTo = await getNotificationEmailTo();
        if (emailTo && emailTo.trim() !== '') {
          try {
            if (!hasMailChannel()) {
              console.warn('[Email] Sem canal de envio configurado (RESEND_API_KEY/SMTP_PASS/ZOHO_EMAIL_PASSWORD).');
              throw new Error('Mail channel not configured');
            }
            const emailBranding = await getEmailBranding();
            const adminEmailContent = emailStatusAdmin({
              ...emailBranding,
              statusLabel,
              customerName: input.customerName || undefined,
              customerPhone: input.customerPhone || undefined,
              service: undefined,
              option: undefined,
              note: input.note || undefined,
            });
            await sendMailDirect({
              from: '"H2 COLOMBIANO" <h2@h2colombiano.com>',
              to: emailTo,
              subject: `[ADMIN] Status Atualizado - ${statusLabel}`,
              html: adminEmailContent,
            });
            console.log('[Email] Notificação de status enviada ao admin:', emailTo);
          } catch (adminEmailError) {
            console.error('[Email] Erro ao enviar notificação ao admin:', adminEmailError);
          }
        }

        // Enviar email ao cliente se tiver email e não estiver bloqueado
        const customerForBlock = await getCustomerByPhone(input.customerPhone);
        const isCustomerBlocked = customerForBlock && (customerForBlock as any).blocked === 1;
        if (input.customerEmail && !isCustomerBlocked) {
          try {
            if (!hasMailChannel()) {
              console.warn('[Email] Sem canal de envio configurado (RESEND_API_KEY/SMTP_PASS/ZOHO_EMAIL_PASSWORD).');
              throw new Error('Mail channel not configured');
            }
            const emailBranding = await getEmailBranding();
            const noteHtml = input.note ? `<div style="background:#0d2b1a;border:1px solid #22c55e40;border-radius:8px;padding:16px;margin-bottom:20px;"><p style="color:#22c55e;font-size:12px;font-weight:bold;margin:0 0 8px;">📋 Observação:</p><p style="color:#ccc;font-size:14px;margin:0;white-space:pre-line;">${input.note}</p></div>` : '';
            const descriptionHtml = statusInfo.description ? `<div style="background:#1a1a2e;border:1px solid #a855f720;border-radius:8px;padding:16px;margin-bottom:20px;"><p style="color:#ccc;font-size:14px;margin:0;white-space:pre-line;line-height:1.7;">${statusInfo.description}</p></div>` : '';
            // Buscar PIN gerado para o cliente (tabela customerPins)
            let phonePin: string = input.customerPhone ? input.customerPhone.replace(/\D/g, '').slice(-4) : '????';
            try {
              const { getDb: getDbPin2 } = await import('./db');
              const { customerPins: cpTable } = await import('../drizzle/schema');
              const { eq: eqPin2 } = await import('drizzle-orm');
              const dbPin2 = await getDbPin2();
              if (dbPin2) {
                const cleanPhone = input.customerPhone.replace(/\D/g, '');
                const pinRow = await dbPin2.select().from(cpTable).where(eqPin2(cpTable.phone, cleanPhone)).limit(1);
                if (pinRow[0]?.pin) phonePin = pinRow[0].pin;
              }
            } catch { /* usa fallback */ }
            await sendMailDirect({
              from: '"H2 COLOMBIANO" <h2@h2colombiano.com>',
              to: input.customerEmail,
              subject: `${statusLabel} — ${emailBranding.siteTitle}`,
              html: emailStatusCliente({
                ...emailBranding,
                customerName: input.customerName || undefined,
                statusLabel,
                orderNumber: undefined,
                service: undefined,
                description: statusInfo?.description || undefined,
                note: input.note || undefined,
              }),
            });
          } catch (err) {
            console.error('Erro ao enviar email de status:', err);
          }
        }

          return { success: true };
      }),

    // Admin: atualizar a observação (note) do status mais recente
    updateNote: adminProcedure
      .input(z.object({
        registrationId: z.number(),
        status: z.string(),
        note: z.string(),
      }))
      .mutation(async ({ input }) => {
        const db = await (await import('./db')).getDb();
        if (!db) return { success: false };
        await db.execute(sql`
          UPDATE orderStatusHistory
          SET note = ${input.note}
          WHERE registrationId = ${input.registrationId}
            AND status = ${input.status}
          ORDER BY createdAt DESC
          LIMIT 1
        `);
        return { success: true };
      }),

    // Admin: SUBSTITUIR o último status de um sub-pedido (sem criar novo registro)
    updateStatus: adminProcedure
      .input(z.object({
        registrationId: z.number(),
        subOrderIndex: z.number(),
        customerPhone: z.string(),
        customerEmail: z.string().email().optional(),
        customerName: z.string().optional(),
        status: z.string(),
        note: z.string().optional(),
        serviceName: z.string().optional(),
        serviceOption: z.string().optional(),
        customerNumber: z.number().optional(),
        orderNumber: z.number().optional(),
        customerCity: z.string().optional(),
        customerUf: z.string().optional(),
        deliveryEstimate: z.number().optional(),
        skipEmail: z.boolean().optional().default(false),
      }))
      .mutation(async ({ input }) => {
        const mailEnabled = hasMailChannel();
        let adminEmailSent = false;
        let customerEmailSent = false;
        let adminEmailError: string | null = null;
        let customerEmailError: string | null = null;
        if (input.status === 'recebido') {
          return { success: false, error: 'Status recebido não pode ser definido manualmente' };
        }
        const result = await updateLastOrderStatus({
          registrationId: input.registrationId,
          subOrderIndex: input.subOrderIndex,
          status: input.status,
          note: input.note ?? null,
        });
        if (!result.success) return result;

        // Ao marcar como entregue, remover urgência obrigatoriamente
        const FINAL_STATUSES = ['entregue', 'pedido_entregue', 'cancelado'];
        if (FINAL_STATUSES.includes(input.status)) {
          try {
            const db2 = await (await import('./db')).getDb();
            if (db2) {
              await db2.execute(sql.raw(
                `UPDATE orderStatusHistory SET isUrgent = 0 WHERE registrationId = ${input.registrationId}`
              ));
            }
          } catch (_) {}
        }

        const statusInfo = await getStatusInfoFromDb(input.status);
        const statusLabel = statusInfo.label;

        // Enviar email ao admin quando status muda
        const emailTo = await getNotificationEmailTo();
        if (emailTo && emailTo.trim() !== '') {
          try {
            if (!mailEnabled) {
              console.warn('[Email] Sem canal de envio configurado (RESEND_API_KEY/SMTP_PASS/ZOHO_EMAIL_PASSWORD).');
              throw new Error('Mail channel not configured');
            }
            const emailBranding = await getEmailBranding();
            const adminEmailContent = emailStatusAdmin({
              ...emailBranding,
              statusLabel,
              customerName: input.customerName || undefined,
              customerPhone: input.customerPhone || undefined,
              service: undefined,
              option: undefined,
              note: input.note || undefined,
            });
            await sendMailDirect({
              from: '"H2 COLOMBIANO" <h2@h2colombiano.com>',
              to: emailTo,
              subject: `[ADMIN] Status Atualizado - ${statusLabel} - ${input.customerName || 'Pedido #' + input.orderNumber}`,
              html: adminEmailContent,
            });
            adminEmailSent = true;
            console.log('[Email] Notificação de status enviada ao admin:', emailTo);
          } catch (adminErr) {
            console.error('[Email] Erro ao enviar notificação ao admin:', adminErr);
            adminEmailError = adminErr instanceof Error ? adminErr.message : String(adminErr);
          }
        } else if (!mailEnabled) {
          console.warn('[Email] SMTP_PASS/ZOHO_EMAIL_PASSWORD ausente: notificação por e-mail ignorada em updateStatus.');
          adminEmailError = 'Canal de envio não configurado';
        }

        // Enviar email ao cliente se tiver email, não for silencioso e não estiver bloqueado
        const customerForBlock2 = await getCustomerByPhone(input.customerPhone);
        const isCustomerBlocked2 = customerForBlock2 && (customerForBlock2 as any).blocked === 1;
        if (input.customerEmail && !input.skipEmail && !isCustomerBlocked2) {
          try {
            if (!mailEnabled) {
              console.warn('[Email] Sem canal de envio configurado (RESEND_API_KEY/SMTP_PASS/ZOHO_EMAIL_PASSWORD).');
              throw new Error('Mail channel not configured');
            }
            const emailBranding = await getEmailBranding();
            const noteHtml = input.note ? `<div style="background:#0d2b1a;border:1px solid #22c55e40;border-radius:8px;padding:16px;margin-bottom:20px;"><p style="color:#22c55e;font-size:12px;font-weight:bold;margin:0 0 8px;">📋 Observação:</p><p style="color:#ccc;font-size:14px;margin:0;white-space:pre-line;">${input.note}</p></div>` : '';
            const descriptionHtml = statusInfo.description ? `<div style="background:#1a1a2e;border:1px solid #a855f720;border-radius:8px;padding:16px;margin-bottom:20px;"><p style="color:#ccc;font-size:14px;margin:0;white-space:pre-line;line-height:1.7;">${statusInfo.description}</p></div>` : '';
            // Buscar PIN gerado para o cliente (tabela customerPins)
            let phonePin: string = input.customerPhone ? input.customerPhone.replace(/\D/g, '').slice(-4) : '????';
            try {
              const { getDb: getDbPin3 } = await import('./db');
              const { customerPins: cpTable3 } = await import('../drizzle/schema');
              const { eq: eqPin3 } = await import('drizzle-orm');
              const dbPin3 = await getDbPin3();
              if (dbPin3) {
                const cleanPhone3 = input.customerPhone.replace(/\D/g, '');
                const pinRow3 = await dbPin3.select().from(cpTable3).where(eqPin3(cpTable3.phone, cleanPhone3)).limit(1);
                if (pinRow3[0]?.pin) phonePin = pinRow3[0].pin;
              }
            } catch { /* usa fallback */ }
            // Gerar tracking ID para rastreamento de abertura
            const crypto = await import('crypto');
            const trackingId = crypto.randomBytes(24).toString('hex');
            const trackingPixelUrl = `${emailBranding.siteBaseUrl}/api/email-open/${trackingId}`;
            // Salvar tracking no banco
            try {
              const dbT = await (await import('./db')).getDb();
              if (dbT) {
                const nowT = Date.now();
                await dbT.execute(sql.raw(`INSERT INTO emailTracking (trackingId, registrationId, subOrderIndex, sentAt, emailType, createdAt) VALUES ('${trackingId}', ${input.registrationId}, ${input.subOrderIndex}, ${nowT}, 'status', ${nowT})`));
              }
            } catch (_) {}
            // Bloco de dados do pedido
            const pedidoRows: string[] = [];
            if (input.customerNumber) pedidoRows.push(`<tr><td style="color:#888;font-size:12px;padding:4px 8px 4px 0;">Cadastro</td><td style="color:#fff;font-size:13px;font-weight:bold;padding:4px 0;">*${input.customerNumber}</td></tr>`);
            if (input.orderNumber) pedidoRows.push(`<tr><td style="color:#888;font-size:12px;padding:4px 8px 4px 0;">NÍ‚º Pedido</td><td style="color:#fff;font-size:13px;font-weight:bold;padding:4px 0;">#${input.orderNumber}</td></tr>`);
            const svcLabelU = [input.serviceName, input.serviceOption].filter(Boolean).join(' — ');
            if (svcLabelU) pedidoRows.push(`<tr><td style="color:#888;font-size:12px;padding:4px 8px 4px 0;">Serviço</td><td style="color:#fff;font-size:13px;padding:4px 0;">${svcLabelU}</td></tr>`);
            const localidadeU = [input.customerCity, input.customerUf].filter(Boolean).join(' — ');
            if (localidadeU) pedidoRows.push(`<tr><td style="color:#888;font-size:12px;padding:4px 8px 4px 0;">Cidade</td><td style="color:#fff;font-size:13px;padding:4px 0;">${localidadeU}</td></tr>`);
            if (input.deliveryEstimate) {
              const previsaoU = new Date(input.deliveryEstimate).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
              pedidoRows.push(`<tr><td style="color:#888;font-size:12px;padding:4px 8px 4px 0;">Previsão</td><td style="color:#22c55e;font-size:13px;font-weight:bold;padding:4px 0;">Í°Å¸""¦ ${previsaoU}</td></tr>`);
            }
            const pedidoHtmlU = pedidoRows.length > 0 ? `<div style="background:#111827;border:1px solid #374151;border-radius:8px;padding:14px 16px;margin-bottom:20px;"><p style="color:#a855f7;font-size:11px;font-weight:bold;margin:0 0 10px;text-transform:uppercase;letter-spacing:1px;">Dados do Pedido</p><table style="width:100%;border-collapse:collapse;">${pedidoRows.join('')}</table></div>` : '';
            // Buscar dados de login para incluir no email se status for entregue
            let loginDataHtml = '';
            const FINAL_STATUSES_EMAIL = ['entregue', 'pedido_entregue'];
            if (FINAL_STATUSES_EMAIL.includes(input.status)) {
              try {
                const dbL = await (await import('./db')).getDb();
                const { orderLoginData: oldTable } = await import('../drizzle/schema');
                const { eq: eqL } = await import('drizzle-orm');
                if (dbL) {
                  const loginRows = await dbL.select().from(oldTable).where(eqL(oldTable.registrationId, input.registrationId)).limit(1);
                  const ld = loginRows[0];
                  if (ld) {
                    const loginRows2: string[] = [];
                    if (ld.loginEmail) loginRows2.push(`<tr><td style="color:#888;font-size:12px;padding:4px 8px 4px 0;">Login / Email</td><td style="color:#fff;font-size:13px;font-family:monospace;font-weight:bold;padding:4px 0;">${ld.loginEmail}</td></tr>`);
                    if (ld.loginPassword) loginRows2.push(`<tr><td style="color:#888;font-size:12px;padding:4px 8px 4px 0;">Senha</td><td style="color:#fff;font-size:13px;font-family:monospace;font-weight:bold;padding:4px 0;">${ld.loginPassword}</td></tr>`);
                    if (ld.authCode) loginRows2.push(`<tr><td style="color:#888;font-size:12px;padding:4px 8px 4px 0;">Autenticador</td><td style="color:#fff;font-size:12px;font-family:monospace;word-break:break-all;padding:4px 0;">${ld.authCode}</td></tr>`);
                    if (ld.emailLink) loginRows2.push(`<tr><td style="color:#888;font-size:12px;padding:4px 8px 4px 0;">Link E-mail</td><td style="color:#a78bfa;font-size:12px;word-break:break-all;padding:4px 0;"><a href="${ld.emailLink}" style="color:#a78bfa;">${ld.emailLink}</a></td></tr>`);
                    if (ld.loginGroupLink) loginRows2.push(`<tr><td style="color:#888;font-size:12px;padding:4px 8px 4px 0;">Link do Grupo</td><td style="color:#4ade80;font-size:12px;word-break:break-all;padding:4px 0;"><a href="${ld.loginGroupLink}" style="color:#4ade80;">${ld.loginGroupLink}</a></td></tr>`);
                    if (loginRows2.length > 0) {
                      loginDataHtml += `<div style="background:#0d2b1a;border:1px solid #22c55e40;border-radius:8px;padding:14px 16px;margin-bottom:20px;"><p style="color:#22c55e;font-size:11px;font-weight:bold;margin:0 0 10px;text-transform:uppercase;letter-spacing:1px;">Í°Å¸"Â Seus Dados de Acesso</p><table style="width:100%;border-collapse:collapse;">${loginRows2.join('')}</table></div>`;
                    }
                    if (ld.loginNotes) {
                      loginDataHtml += `<div style="background:#0d1a2b;border:1px solid #3b82f640;border-radius:8px;padding:14px 16px;margin-bottom:20px;"><p style="color:#60a5fa;font-size:11px;font-weight:bold;margin:0 0 8px;text-transform:uppercase;letter-spacing:1px;">Í°Å¸"Â Instruções</p><p style="color:#ccc;font-size:13px;margin:0;white-space:pre-line;line-height:1.7;">${ld.loginNotes}</p></div>`;
                    }
                  }
                }
              } catch (_) {}
            }
            await sendMailDirect({
              from: '"H2 COLOMBIANO" <h2@h2colombiano.com>',
              to: input.customerEmail,
              subject: `${statusLabel} — ${emailBranding.siteTitle}`,
              html: emailStatusCliente({
                ...emailBranding,
                customerName: input.customerName || undefined,
                statusLabel,
                orderNumber: input.orderNumber || undefined,
                service: input.serviceName || undefined,
                description: statusInfo?.description || undefined,
                note: input.note || undefined,
                                loginData: loginDataHtml || undefined,
                pedidoHtml: pedidoHtmlU || undefined,
              }),
            });
            customerEmailSent = true;
            // Se status é de entrega, registrar data/hora da notificação
            if (FINAL_STATUSES_EMAIL.includes(input.status)) {
              try {
                const dbN = await (await import('./db')).getDb();
                if (dbN) {
                  await dbN.execute(sql`
                    UPDATE orderStatusHistory
                    SET deliveredNotifiedAt = NOW()
                    WHERE registrationId = ${input.registrationId}
                    ORDER BY createdAt DESC
                    LIMIT 1
                  `);
                }
              } catch (_) {}
            }
          } catch (err) {
            console.error('Erro ao enviar email de status:', err);
            customerEmailError = err instanceof Error ? err.message : String(err);
          }
        }
        if (!input.customerEmail && !input.skipEmail) {
          customerEmailError = customerEmailError || 'Cliente sem e-mail cadastrado';
        } else if (input.skipEmail) {
          customerEmailError = customerEmailError || 'Envio ao cliente desativado (skipEmail=true)';
        } else if (isCustomerBlocked2) {
          customerEmailError = customerEmailError || 'Cliente bloqueado';
        } else if (!mailEnabled) {
          customerEmailError = customerEmailError || 'Canal de envio não configurado';
        }

        return {
          success: true,
          notifications: {
            adminEmailSent,
            customerEmailSent,
            adminEmailError,
            customerEmailError,
          },
        };
      }),
    // Admin: atualizar orderSource (auto/manual) de um pedido
    updateOrderSource: adminProcedure
      .input(z.object({
        registrationId: z.number(),
        orderSource: z.enum(['auto', 'manual']),
      }))
      .mutation(async ({ input }) => {
        const db = await (await import('./db')).getDb();
        if (!db) return { success: false };
        await db.execute(
          sql.raw(`UPDATE accessCodePhones SET orderSource = '${input.orderSource}' WHERE id = ${input.registrationId}`)
        );
        return { success: true };
      }),

    // Admin: atualizar número do pedido manualmente
    updateOrderNumber: adminProcedure
      .input(z.object({
        registrationId: z.number(),
        subOrderIndex: z.number().default(0),
        orderNumber: z.number().nullable(),
      }))
      .mutation(async ({ input }) => {
        const db = await (await import('./db')).getDb();
        if (!db) return { success: false };
        // Buscar histórico completo em ordem ASC
        const stRows = await db.execute(sql.raw(
          `SELECT id, status FROM orderStatusHistory WHERE registrationId = ${input.registrationId} ORDER BY createdAt ASC, id ASC`
        ));
        const rows = (stRows[0] as unknown as Array<{ id: number; status: string }>);
        if (!rows || rows.length === 0) return { success: false, error: 'Nenhum histórico encontrado' };
        // Buscar status inicial dinâmico
        const stTypeRows = await db.execute(sql.raw(
          `SELECT \`key\` FROM orderStatusTypes WHERE isActive = 1 ORDER BY sortOrder ASC LIMIT 1`
        ));
        const stTypeArr = (stTypeRows[0] as unknown as Array<{ key: string }>);
        const initialStatus = stTypeArr?.[0]?.key || 'recebido';
        // Dividir em sub-pedidos (mesma lógica do listOrders)
        const subGroups: Array<{ startId: number; endId: number | null }> = [];
        let currentStart: number | null = null;
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          if (i === 0) {
            currentStart = r.id;
          } else if (r.status === initialStatus || r.status === 'recebido') {
            // Novo sub-pedido começa aqui
            subGroups.push({ startId: currentStart!, endId: r.id });
            currentStart = r.id;
          }
        }
        if (currentStart !== null) subGroups.push({ startId: currentStart, endId: null });
        // subGroups está em ordem ASC (mais antigo primeiro)
        // O frontend usa ordem reversa (mais recente = índice 0), então inverter
        subGroups.reverse();
        const targetGroup = subGroups[input.subOrderIndex];
        if (!targetGroup) return { success: false, error: 'Sub-pedido não encontrado' };
        // Atualizar todos os registros do sub-pedido com o novo orderNumber
        const whereClause = targetGroup.endId
          ? `registrationId = ${input.registrationId} AND id >= ${targetGroup.startId} AND id < ${targetGroup.endId}`
          : `registrationId = ${input.registrationId} AND id >= ${targetGroup.startId}`;
        await db.execute(sql.raw(
          `UPDATE orderStatusHistory SET orderNumber = ${input.orderNumber ?? 'NULL'} WHERE ${whereClause}`
        ));
        return { success: true };
      }),

    // Admin: listar histórico de um pedido
    getHistory: adminProcedure
      .input(z.object({ registrationId: z.number() }))
      .query(async ({ input }) => {
        return await getOrderStatusHistory(input.registrationId);
      }),

    // Cliente: ver histórico do próprio pedido pelo telefone
    getMyStatus: publicProcedure
      .input(z.object({ phone: z.string() }))
      .query(async ({ input, ctx }) => {
        const clientIp = (ctx.req.headers['x-forwarded-for'] as string || '').split(',')[0].trim() || ctx.req.socket?.remoteAddress || 'unknown';
        const blockResult = await checkPhoneBlockedAndBlockIp(input.phone, clientIp, 'ver_status_pedido');
        if (blockResult.blocked) return [];
        const db = await (await import('./db')).getDb();
        if (!db) return [];

        // Buscar todo o histórico do cliente
        const allHistory = await getOrderStatusHistoryByPhone(input.phone);
        if (allHistory.length === 0) return [];

        // Buscar todos os registrationIds do cliente
        const regIdsSet = new Set(allHistory.map(h => h.registrationId));
        const regIds = Array.from(regIdsSet);
        const idsList = regIds.join(',');

        // Buscar sub-pedidos ocultos para esse cliente
        const hiddenResult = await db.execute(
          sql.raw(`SELECT registrationId, subOrderIndex FROM hiddenSubOrders WHERE registrationId IN (${idsList})`)
        );
        const hiddenRows = (hiddenResult as any)[0] as Array<{ registrationId: number; subOrderIndex: number }>;
        if (!hiddenRows || hiddenRows.length === 0) return allHistory;

        // Construir set de sub-pedidos ocultos
        const hiddenSet = new Set(hiddenRows.map((h: any) => `${h.registrationId}_${h.subOrderIndex}`));

        // Buscar status inicial dinâmico (mesma lógica do admin)
        let initialStatusForHidden = 'recebido';
        try {
          const stResult = await db.execute(sql`SELECT \`key\` FROM orderStatusTypes WHERE isActive = 1 ORDER BY sortOrder ASC LIMIT 1`);
          const stRows = (stResult as any)[0] as any[];
          if (stRows && stRows.length > 0 && stRows[0].key) initialStatusForHidden = stRows[0].key;
        } catch (e) { /* fallback */ }

        // Função de divisão em sub-pedidos — IDÍÅ NTICA Â  do admin (history em ASC)
        function splitIntoSubOrdersForHidden(historyAsc: typeof allHistory): typeof allHistory[] {
          if (historyAsc.length === 0) return [];
          const result: typeof allHistory[] = [];
          let current: typeof allHistory = [];
          for (const entry of historyAsc) {
            if ((entry.status === initialStatusForHidden || entry.status === 'recebido') && current.length > 0) {
              result.push(current);
              current = [entry];
            } else {
              current.push(entry);
            }
          }
          if (current.length > 0) result.push(current);
          // Reverter para que índice 0 = mais recente (igual ao admin)
          return result.reverse();
        }

        // Agrupar por registrationId em ordem ASC (mais antigo primeiro — igual ao admin)
        const byRegId = new Map<number, typeof allHistory>();
        for (const entry of [...allHistory].reverse()) { // allHistory é DESC, reverter para ASC
          const regId = entry.registrationId;
          if (!byRegId.has(regId)) byRegId.set(regId, []);
          byRegId.get(regId)!.push(entry);
        }

        // Para cada registrationId, dividir em sub-pedidos e marcar IDs ocultos
        const hiddenHistoryIds = new Set<number>();
        for (const [regId, historyAsc] of Array.from(byRegId.entries())) {
          const subOrders = splitIntoSubOrdersForHidden(historyAsc);
          // Marcar IDs dos sub-pedidos ocultos (índice igual ao do admin)
          subOrders.forEach((subHistory, subIdx) => {
            if (hiddenSet.has(`${regId}_${subIdx}`)) {
              for (const entry of subHistory) hiddenHistoryIds.add(entry.id);
            }
          });
        }

        // Identificar registrationIds completamente ocultos (todos os sub-pedidos ocultos)
        const fullyHiddenRegIds = new Set<number>();
        for (const [regId, historyAsc] of Array.from(byRegId.entries())) {
          const subOrders = splitIntoSubOrdersForHidden(historyAsc);
          if (subOrders.length === 0) continue;
          const allSubsHidden = subOrders.every((_, subIdx) => hiddenSet.has(`${regId}_${subIdx}`));
          if (allSubsHidden) fullyHiddenRegIds.add(regId);
        }

        // Retornar apenas entradas que não pertencem a sub-pedidos ocultos nem a registrationIds completamente ocultos
        return allHistory.filter(h => !hiddenHistoryIds.has(h.id) && !fullyHiddenRegIds.has(h.registrationId));
      }),

    // Admin: pegar status mais recente de um pedido
    getLatest: adminProcedure
      .input(z.object({ registrationId: z.number() }))
      .query(async ({ input }) => {
        return await getLatestOrderStatus(input.registrationId);
      }),

    // Admin: reenviar email do status atual ao cliente
    resendEmail: adminProcedure
      .input(z.object({
        customerEmail: z.string().email(),
        customerName: z.string().optional(),
        customerPhone: z.string().optional(),
        status: z.string(),
        note: z.string().optional(),
        serviceName: z.string().optional(),
        serviceOption: z.string().optional(),
        customerNumber: z.number().optional(),
        orderNumber: z.number().optional(),
        customerCity: z.string().optional(),
        customerUf: z.string().optional(),
        deliveryEstimate: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        try {
          if (!hasMailChannel()) {
            return { success: false, message: 'Configuração de e-mail indisponível (SMTP_PASS/ZOHO_EMAIL_PASSWORD ausente).' };
          }
          // Verificar se cliente está bloqueado
          if (input.customerPhone) {
            const customerForBlockR = await getCustomerByPhone(input.customerPhone);
            if (customerForBlockR && (customerForBlockR as any).blocked === 1) {
              return { success: false, message: 'Cliente bloqueado. E-mail não enviado.' };
            }
          }
          const statusInfo2 = await getStatusInfoFromDb(input.status);
          const statusLabel = statusInfo2.label;
          const emailBranding = await getEmailBranding();
          const noteHtml = input.note ? `<div style="background:#0d2b1a;border:1px solid #22c55e40;border-radius:8px;padding:16px;margin-bottom:20px;"><p style="color:#22c55e;font-size:12px;font-weight:bold;margin:0 0 8px;">📋 Observação:</p><p style="color:#ccc;font-size:14px;margin:0;white-space:pre-line;">${input.note}</p></div>` : '';
          const descriptionHtml2 = statusInfo2.description ? `<div style="background:#1a1a2e;border:1px solid #a855f720;border-radius:8px;padding:16px;margin-bottom:20px;"><p style="color:#ccc;font-size:14px;margin:0;white-space:pre-line;line-height:1.7;">${statusInfo2.description}</p></div>` : '';
          // Buscar PIN gerado para o cliente (tabela customerPins)
          let phonePin: string | null = input.customerPhone ? input.customerPhone.replace(/\D/g, '').slice(-4) : null;
          try {
            const { getDb: getDbPin4 } = await import('./db');
            const { customerPins: cpTable4 } = await import('../drizzle/schema');
            const { eq: eqPin4 } = await import('drizzle-orm');
            const dbPin4 = await getDbPin4();
            if (dbPin4 && input.customerPhone) {
              const cleanPhone4 = input.customerPhone.replace(/\D/g, '');
              const pinRow4 = await dbPin4.select().from(cpTable4).where(eqPin4(cpTable4.phone, cleanPhone4)).limit(1);
              if (pinRow4[0]?.pin) phonePin = pinRow4[0].pin;
            }
          } catch { /* usa fallback */ }
          // Bloco de dados do pedido
          const reRows: string[] = [];
          if (input.customerNumber) reRows.push(`<tr><td style="color:#888;font-size:12px;padding:4px 8px 4px 0;">Cadastro</td><td style="color:#fff;font-size:13px;font-weight:bold;padding:4px 0;">*${input.customerNumber}</td></tr>`);
          if (input.orderNumber) reRows.push(`<tr><td style="color:#888;font-size:12px;padding:4px 8px 4px 0;">NÍ‚º Pedido</td><td style="color:#fff;font-size:13px;font-weight:bold;padding:4px 0;">#${input.orderNumber}</td></tr>`);
          const svcLabelR = [input.serviceName, input.serviceOption].filter(Boolean).join(' — ');
          if (svcLabelR) reRows.push(`<tr><td style="color:#888;font-size:12px;padding:4px 8px 4px 0;">Serviço</td><td style="color:#fff;font-size:13px;padding:4px 0;">${svcLabelR}</td></tr>`);
          const localidadeR = [input.customerCity, input.customerUf].filter(Boolean).join(' — ');
          if (localidadeR) reRows.push(`<tr><td style="color:#888;font-size:12px;padding:4px 8px 4px 0;">Cidade</td><td style="color:#fff;font-size:13px;padding:4px 0;">${localidadeR}</td></tr>`);
          if (input.deliveryEstimate) {
            const previsaoR = new Date(input.deliveryEstimate).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
            reRows.push(`<tr><td style="color:#888;font-size:12px;padding:4px 8px 4px 0;">Previsão</td><td style="color:#22c55e;font-size:13px;font-weight:bold;padding:4px 0;">Í°Å¸""¦ ${previsaoR}</td></tr>`);
          }
          const pedidoHtmlR = reRows.length > 0 ? `<div style="background:#111827;border:1px solid #374151;border-radius:8px;padding:14px 16px;margin-bottom:20px;"><p style="color:#a855f7;font-size:11px;font-weight:bold;margin:0 0 10px;text-transform:uppercase;letter-spacing:1px;">Dados do Pedido</p><table style="width:100%;border-collapse:collapse;">${reRows.join('')}</table></div>` : '';
          const pinHtml = ''; // Senha de acompanhamento removida
          // Tracking pixel para reenvio
          const cryptoR = await import('crypto');
          const trackingIdR = cryptoR.randomBytes(24).toString('hex');
          const trackingPixelUrlR = `${emailBranding.siteBaseUrl}/api/email-open/${trackingIdR}`;
          await sendMailDirect({
            from: '"H2 COLOMBIANO" <h2@h2colombiano.com>',
            to: input.customerEmail,
            subject: `[Reenvio] ${statusLabel} — ${emailBranding.siteTitle}`,
              html: emailStatusCliente({
                ...emailBranding,
                customerName: input.customerName || undefined,
                statusLabel,
                orderNumber: input.orderNumber || undefined,
                service: input.serviceName || undefined,
                description: statusInfo2?.description || undefined,
                note: input.note || undefined,
                trackingPixelUrl: trackingPixelUrlR || undefined,
                pedidoHtml: pedidoHtmlR || undefined,
              }),
          });
          return { success: true };
        } catch (err) {
          console.error('Erro ao reenviar email de status:', err);
          return { success: false, error: String(err) };
        }
      }),

    // Admin: consultar status de leitura de e-mails por pedido
    getEmailTracking: adminProcedure
      .input(z.object({ registrationId: z.number(), subOrderIndex: z.number().optional() }))
      .query(async ({ input }) => {
        const db = await (await import('./db')).getDb();
        if (!db) return { opened: false, openedAt: null, openCount: 0, sentAt: null };
        const idx = input.subOrderIndex ?? 0;
        const rows = await db.execute(sql.raw(`SELECT openedAt, openCount, sentAt FROM emailTracking WHERE registrationId = ${input.registrationId} AND subOrderIndex = ${idx} ORDER BY createdAt DESC LIMIT 1`));
        const row = (rows as any).rows?.[0] || (Array.isArray(rows) ? rows[0] : null);
        if (!row) return { opened: false, openedAt: null, openCount: 0, sentAt: null };
        return {
          opened: !!row.openedAt,
          openedAt: row.openedAt ? Number(row.openedAt) : null,
          openCount: Number(row.openCount) || 0,
          sentAt: row.sentAt ? Number(row.sentAt) : null,
        };
      }),

    // Admin: deletar pedido completamente
    deleteOrder: adminProcedure
      .input(z.object({ registrationId: z.number(), customerPhone: z.string(), subOrderIndex: z.number().optional(), reason: z.string().optional(), customerName: z.string().optional(), serviceName: z.string().optional() }))
      .mutation(async ({ input }) => {
        const db = await (await import('./db')).getDb();
        if (!db) return { success: false };
        const targetIdx = input.subOrderIndex ?? 0;
        const reason = input.reason || 'Excluído pelo administrador';
        // Soft delete: inserir na tabela hiddenSubOrders para ocultar o card sem apagar dados
        // Verificar se já existe para evitar duplicata
        await db.execute(sql`
          INSERT INTO hiddenSubOrders (registrationId, subOrderIndex, deletedReason, customerPhone, customerName, serviceName)
          SELECT ${input.registrationId}, ${targetIdx}, ${reason}, ${input.customerPhone}, ${input.customerName || null}, ${input.serviceName || null}
          WHERE NOT EXISTS (
            SELECT 1 FROM hiddenSubOrders
            WHERE registrationId = ${input.registrationId} AND subOrderIndex = ${targetIdx}
          )
        `);
        return { success: true };
      }),

    // Lixeira: listar pedidos excluídos (hiddenSubOrders)
    listDeletedOrders: adminProcedure
      .query(async () => {
        const db = await (await import('./db')).getDb();
        if (!db) return [];
        const rows = await db.execute(sql`
          SELECT h.id, h.registrationId, h.subOrderIndex, h.hiddenAt, h.deletedReason,
                 h.customerPhone, COALESCE(NULLIF(h.customerName,''), NULLIF(c.name,''), h.customerPhone) as customerName, h.serviceName
          FROM hiddenSubOrders h
          LEFT JOIN customers c ON c.phone = h.customerPhone
          ORDER BY h.hiddenAt DESC
          LIMIT 200
        `);
        return (rows[0] as unknown as Array<{ id: number; registrationId: number; subOrderIndex: number; hiddenAt: string; deletedReason: string | null; customerPhone: string | null; customerName: string | null; serviceName: string | null }>);
      }),

    // Lixeira: restaurar pedido excluído
    restoreDeletedOrder: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await (await import('./db')).getDb();
        if (!db) return { success: false };
        await db.execute(sql`DELETE FROM hiddenSubOrders WHERE id = ${input.id}`);
        return { success: true };
      }),

    // Lixeira: excluir pedido permanentemente
    permanentlyDeleteOrder: adminProcedure
      .input(z.object({ id: z.number(), registrationId: z.number() }))
      .mutation(async ({ input }) => {
        const db = await (await import('./db')).getDb();
        if (!db) return { success: false };

        // Buscar subOrderIndex antes de apagar da lixeira
        const hiddenRows = await db.execute(sql`SELECT subOrderIndex, customerPhone FROM hiddenSubOrders WHERE id = ${input.id} LIMIT 1`);
        const hiddenRow = ((hiddenRows as any)[0] as any[])?.[0];
        const subOrderIndex: number = hiddenRow?.subOrderIndex ?? 0;
        const customerPhone: string | null = hiddenRow?.customerPhone ?? null;

        // Buscar status inicial para dividir sub-pedidos corretamente
        let initialStatus = 'recebido';
        try {
          const stResult = await db.execute(sql`SELECT \`key\` FROM orderStatusTypes WHERE isActive = 1 ORDER BY sortOrder ASC LIMIT 1`);
          const stRows = (stResult as any)[0] as any[];
          if (stRows?.[0]?.key) initialStatus = stRows[0].key;
        } catch (e) { /* fallback */ }

        // Buscar histórico do registrationId em ASC para dividir em sub-pedidos
        const histResult = await db.execute(sql`SELECT id, status FROM orderStatusHistory WHERE registrationId = ${input.registrationId} ORDER BY createdAt ASC, id ASC`);
        const histRows = ((histResult as any)[0] as any[]) || [];

        // Dividir em sub-pedidos (mesma lógica do admin)
        const subOrders: number[][] = [];
        let current: number[] = [];
        for (const entry of histRows) {
          if ((entry.status === initialStatus || entry.status === 'recebido') && current.length > 0) {
            subOrders.push(current);
            current = [entry.id];
          } else {
            current.push(entry.id);
          }
        }
        if (current.length > 0) subOrders.push(current);
        // Reverter para que índice 0 = mais recente
        subOrders.reverse();

        // Apagar entradas do orderStatusHistory do sub-pedido específico
        const idsToDelete = subOrders[subOrderIndex] || [];
        if (idsToDelete.length > 0) {
          const idsList = idsToDelete.join(',');
          await db.execute(sql.raw(`DELETE FROM orderStatusHistory WHERE id IN (${idsList})`) );
        }

        // Se não há mais sub-pedidos, apagar o accessCodePhones também
        const remainingSubOrders = subOrders.filter((_, idx) => idx !== subOrderIndex);
        if (remainingSubOrders.length === 0) {
          await db.execute(sql`DELETE FROM accessCodePhones WHERE id = ${input.registrationId}`);
        }

        // Remove da lixeira
        await db.execute(sql`DELETE FROM hiddenSubOrders WHERE id = ${input.id}`);
        return { success: true };
      }),

    // Admin: arquivar pedido (tira dos cards ativos, fica só para consulta)
    archiveOrder: adminProcedure
      .input(z.object({ registrationId: z.number() }))
      .mutation(async ({ input }) => {
        const db = await (await import('./db')).getDb();
        if (!db) return { success: false };
        await db.execute(sql`
          UPDATE accessCodePhones SET archived = 1 WHERE id = ${input.registrationId}
        `);
        return { success: true };
      }),

    // Admin: restaurar pedido arquivado de volta para os cards ativos
    unarchiveOrder: adminProcedure
      .input(z.object({ registrationId: z.number() }))
      .mutation(async ({ input }) => {
        const db = await (await import('./db')).getDb();
        if (!db) return { success: false };
        await db.execute(sql`
          UPDATE accessCodePhones SET archived = 0 WHERE id = ${input.registrationId}
        `);
        return { success: true };
      }),

    // Admin: listar pedidos arquivados
    listArchivedOrders: adminProcedure.query(async () => {
      const db = await (await import('./db')).getDb();
      if (!db) return [];
      const rows = await db.execute(sql`
        SELECT
          acp.id as registrationId,
          acp.phone as customerPhone,
          UNIX_TIMESTAMP(acp.accessedAt) * 1000 AS accessedAt,
          COALESCE(NULLIF(osh_last.serviceName,'NULL'), NULLIF(osh_first.serviceName,'NULL')) as serviceName,
          COALESCE(NULLIF(osh_last.serviceOption,'NULL'), NULLIF(osh_first.serviceOption,'NULL')) as serviceOption,
          COALESCE(NULLIF(osh_last.orderNumber,0), osh_first.orderNumber) as orderNumber,
          COALESCE(NULLIF(osh_last.answers,'NULL'), osh_first.answers) as answers,
          osh_last.status as latestStatus,
          UNIX_TIMESTAMP(osh_last.createdAt) * 1000 AS latestStatusAt,
          osh_last.note,
          COALESCE(NULLIF(c.name,''), acp.phone) as customerName,
          c.customerNumber,
          c.city,
          c.uf,
          c.email,
          c.referredBy,
          c.referredByPhone,
          c.profilePhotoUrl
        FROM accessCodePhones acp
        LEFT JOIN (
          SELECT registrationId, MAX(id) as maxId
          FROM orderStatusHistory
          GROUP BY registrationId
        ) latest ON latest.registrationId = acp.id
        LEFT JOIN orderStatusHistory osh_last ON osh_last.id = latest.maxId
        LEFT JOIN (
          SELECT registrationId, MIN(id) as minId
          FROM orderStatusHistory
          GROUP BY registrationId
        ) first_rec ON first_rec.registrationId = acp.id
        LEFT JOIN orderStatusHistory osh_first ON osh_first.id = first_rec.minId
        LEFT JOIN customers c ON c.phone = acp.phone
        WHERE acp.archived = 1
        ORDER BY acp.accessedAt DESC
      `);
      const rowList = ((rows as any)[0] || rows) as any[];
      return rowList.map((r: any) => ({
        id: Number(r.registrationId),
        registrationId: Number(r.registrationId),
        customerPhone: String(r.customerPhone || ''),
        customerName: String(r.customerName || r.customerPhone || ''),
        customerNumber: r.customerNumber != null ? Number(r.customerNumber) : null,
        city: r.city && r.city !== 'NULL' ? String(r.city) : null,
        uf: r.uf && r.uf !== 'NULL' ? String(r.uf) : null,
        email: r.email && r.email !== 'NULL' ? String(r.email) : null,
        referredBy: r.referredBy && r.referredBy !== 'NULL' ? String(r.referredBy) : null,
        referredByPhone: r.referredByPhone && r.referredByPhone !== 'NULL' ? String(r.referredByPhone) : null,
        profilePhotoUrl: r.profilePhotoUrl && r.profilePhotoUrl !== 'NULL' ? String(r.profilePhotoUrl) : null,
        serviceName: r.serviceName && r.serviceName !== 'NULL' ? String(r.serviceName) : null,
        serviceOption: r.serviceOption && r.serviceOption !== 'NULL' ? String(r.serviceOption) : null,
        orderNumber: r.orderNumber != null ? Number(r.orderNumber) : null,
        answers: r.answers && r.answers !== 'NULL' ? String(r.answers) : null,
        latestStatus: r.latestStatus && r.latestStatus !== 'NULL' ? String(r.latestStatus) : null,
        latestStatusAt: r.latestStatusAt ? Number(r.latestStatusAt) : null,
        note: r.note && r.note !== 'NULL' ? String(r.note) : null,
        accessedAt: r.accessedAt ? Number(r.accessedAt) : null,
      }));
    }),

    // Admin: mover pedido para pasta RG/CNH Aprovado
    moveToRgCnhApproved: adminProcedure
      .input(z.object({ registrationId: z.number() }))
      .mutation(async ({ input }) => {
        const db = await (await import('./db')).getDb();
        if (!db) return { success: false };
        await db.execute(sql`
          UPDATE accessCodePhones SET rgCnhApproved = 1 WHERE id = ${input.registrationId}
        `);
        return { success: true };
      }),

    // Admin: remover pedido da pasta RG/CNH Aprovado
    removeFromRgCnhApproved: adminProcedure
      .input(z.object({ registrationId: z.number() }))
      .mutation(async ({ input }) => {
        const db = await (await import('./db')).getDb();
        if (!db) return { success: false };
        await db.execute(sql`
          UPDATE accessCodePhones SET rgCnhApproved = 0 WHERE id = ${input.registrationId}
        `);
        return { success: true };
      }),

    // Admin: listar pedidos na pasta RG/CNH Aprovado
    listRgCnhApprovedOrders: adminProcedure.query(async () => {
      const db = await (await import('./db')).getDb();
      if (!db) return [];
      const rows = await db.execute(sql`
        SELECT
          acp.id as registrationId,
          acp.phone as customerPhone,
          UNIX_TIMESTAMP(acp.accessedAt) * 1000 AS accessedAt,
          COALESCE(NULLIF(osh_last.serviceName,'NULL'), NULLIF(osh_first.serviceName,'NULL')) as serviceName,
          COALESCE(NULLIF(osh_last.serviceOption,'NULL'), NULLIF(osh_first.serviceOption,'NULL')) as serviceOption,
          COALESCE(NULLIF(osh_last.orderNumber,0), osh_first.orderNumber) as orderNumber,
          COALESCE(NULLIF(osh_last.answers,'NULL'), osh_first.answers) as answers,
          osh_last.status as latestStatus,
          UNIX_TIMESTAMP(osh_last.createdAt) * 1000 AS latestStatusAt,
          osh_last.note,
          c.name as customerName,
          c.customerNumber,
          c.city,
          c.uf,
          c.email,
          c.referredBy,
          c.referredByPhone,
          c.profilePhotoUrl
        FROM accessCodePhones acp
        LEFT JOIN (
          SELECT registrationId, MAX(id) as maxId
          FROM orderStatusHistory
          GROUP BY registrationId
        ) latest ON latest.registrationId = acp.id
        LEFT JOIN orderStatusHistory osh_last ON osh_last.id = latest.maxId
        LEFT JOIN (
          SELECT registrationId, MIN(id) as minId
          FROM orderStatusHistory
          GROUP BY registrationId
        ) first_rec ON first_rec.registrationId = acp.id
        LEFT JOIN orderStatusHistory osh_first ON osh_first.id = first_rec.minId
        LEFT JOIN customers c ON c.phone = acp.phone
        WHERE acp.rgCnhApproved = 1
        ORDER BY acp.accessedAt DESC
      `);
      const rowList = ((rows as any)[0] || rows) as any[];
      return rowList.map((r: any) => ({
        id: Number(r.registrationId),
        registrationId: Number(r.registrationId),
        customerPhone: String(r.customerPhone || ''),
        customerName: String(r.customerName || r.customerPhone || ''),
        customerNumber: r.customerNumber != null ? Number(r.customerNumber) : null,
        city: r.city && r.city !== 'NULL' ? String(r.city) : null,
        uf: r.uf && r.uf !== 'NULL' ? String(r.uf) : null,
        email: r.email && r.email !== 'NULL' ? String(r.email) : null,
        referredBy: r.referredBy && r.referredBy !== 'NULL' ? String(r.referredBy) : null,
        referredByPhone: r.referredByPhone && r.referredByPhone !== 'NULL' ? String(r.referredByPhone) : null,
        profilePhotoUrl: r.profilePhotoUrl && r.profilePhotoUrl !== 'NULL' ? String(r.profilePhotoUrl) : null,
        serviceName: r.serviceName && r.serviceName !== 'NULL' ? String(r.serviceName) : null,
        serviceOption: r.serviceOption && r.serviceOption !== 'NULL' ? String(r.serviceOption) : null,
        orderNumber: r.orderNumber != null ? Number(r.orderNumber) : null,
        answers: r.answers && r.answers !== 'NULL' ? String(r.answers) : null,
        latestStatus: r.latestStatus && r.latestStatus !== 'NULL' ? String(r.latestStatus) : null,
        latestStatusAt: r.latestStatusAt ? Number(r.latestStatusAt) : null,
        note: r.note && r.note !== 'NULL' ? String(r.note) : null,
        accessedAt: r.accessedAt ? Number(r.accessedAt) : null,
      }));
    }),

    // Admin: atualizar dados do pedido (serviço, opção, respostas)
    updateOrderData: adminProcedure
      .input(z.object({
        registrationId: z.number(),
        serviceName: z.string().optional(),
        serviceOption: z.string().optional(),
        answers: z.string().optional(),
        pricePaid: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await (await import('./db')).getDb();
        if (!db) return { success: false };
        // Atualizar o primeiro registro de histórico (onde ficam os dados do pedido)
        await db.execute(sql`
          UPDATE orderStatusHistory
          SET
            serviceName = CASE WHEN ${input.serviceName !== undefined ? 1 : 0} = 1 THEN ${input.serviceName ?? null} ELSE serviceName END,
            serviceOption = CASE WHEN ${input.serviceOption !== undefined ? 1 : 0} = 1 THEN ${input.serviceOption ?? null} ELSE serviceOption END,
            answers = CASE WHEN ${input.answers !== undefined ? 1 : 0} = 1 THEN ${input.answers ?? null} ELSE answers END,
            pricePaid = CASE WHEN ${input.pricePaid !== undefined ? 1 : 0} = 1 THEN ${input.pricePaid ?? null} ELSE pricePaid END
          WHERE registrationId = ${input.registrationId}
          ORDER BY createdAt ASC
          LIMIT 1
        `);
        return { success: true };
      }),

    // Admin: corrigir o titular de um pedido específico sem excluir histórico,
    // status, respostas, arquivos ou informações financeiras.
    reassignCustomer: adminProcedure
      .input(z.object({ registrationId: z.number().int().positive(), targetCustomerId: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        const db = await (await import('./db')).getDb() as any;
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Banco indisponível' });

        const targetRows = await db.execute(sql`
          SELECT id, name, phone, customerNumber
          FROM customers
          WHERE id = ${input.targetCustomerId} AND deletedAt IS NULL
          LIMIT 1
        `);
        const target = (targetRows[0] as unknown as Array<{ id: number; name: string; phone: string; customerNumber: number | null }>)[0];
        if (!target?.phone) throw new TRPCError({ code: 'NOT_FOUND', message: 'Cliente de destino não encontrado' });

        const orderRows = await db.execute(sql`
          SELECT COUNT(*) AS total
          FROM orderStatusHistory
          WHERE registrationId = ${input.registrationId}
        `);
        const total = Number((orderRows[0] as unknown as Array<{ total: number }>)[0]?.total || 0);
        if (!total) throw new TRPCError({ code: 'NOT_FOUND', message: 'Pedido não encontrado' });

        const targetPhone = String(target.phone).replace(/\D/g, '');
        await db.execute(sql`UPDATE accessCodePhones SET phone = ${targetPhone} WHERE id = ${input.registrationId}`);
        await db.execute(sql`UPDATE orderStatusHistory SET customerPhone = ${targetPhone} WHERE registrationId = ${input.registrationId}`);
        await db.execute(sql`UPDATE orderLoginData SET customerPhone = ${targetPhone} WHERE registrationId = ${input.registrationId}`);
        await db.execute(sql`UPDATE orderFiles SET customerPhone = ${targetPhone} WHERE registrationId = ${input.registrationId}`);

        return {
          success: true,
          registrationId: input.registrationId,
          customer: { id: target.id, name: target.name, customerNumber: target.customerNumber, phone: targetPhone },
        };
      }),

    // Admin: marcar/desmarcar pedido como urgente
    toggleUrgent: adminProcedure
      .input(z.object({ registrationId: z.number(), urgent: z.boolean() }))
      .mutation(async ({ input }) => {
        const db = await (await import('./db')).getDb();
        if (!db) return { success: false };
        await db.execute(sql`
          UPDATE orderStatusHistory
          SET isUrgent = ${input.urgent ? 1 : 0}
          WHERE registrationId = ${input.registrationId}
        `);
        return { success: true };
      }),

    // Admin: marcar automaticamente como urgente pedidos com +48h sem atualização
    autoMarkUrgent: adminProcedure.mutation(async () => {
      const db = await (await import('./db')).getDb();
      if (!db) return { updated: 0 };
      // Busca registrationIds de pedidos com latestStatusAt > 48h e status não finalizado
      const result = await db.execute(`
        UPDATE orderStatusHistory osh
        INNER JOIN (
          SELECT registrationId
          FROM orderStatusHistory
          GROUP BY registrationId
          HAVING
            MAX(CASE WHEN status NOT IN ('entregue', 'pedido_entregue', 'login_liberado', 'cancelado') THEN 1 ELSE 0 END) = 1
            AND MAX(createdAt) < DATE_SUB(NOW(), INTERVAL 48 HOUR)
        ) sub ON osh.registrationId = sub.registrationId
        SET osh.isUrgent = 1
        WHERE osh.isUrgent = 0
      `);
      const affected = (result[0] as unknown as { affectedRows: number })?.affectedRows ?? 0;
      return { updated: affected };
    }),

    // Admin: marcar/desmarcar comissão como paga
    toggleCommissionPaid: adminProcedure
      .input(z.object({ registrationId: z.number(), paid: z.boolean() }))
      .mutation(async ({ input }) => {
        const db = await (await import('./db')).getDb();
        if (!db) return { success: false };
        await db.execute(sql`
          UPDATE orderStatusHistory
          SET commissionPaid = ${input.paid ? 1 : 0}
          WHERE registrationId = ${input.registrationId}
        `);

        // Se está marcando como PAGO, buscar dados do indicador e enviar e-mail
        if (input.paid) {
          try {
            // Buscar dados do cliente indicado e do indicador
            const rows = await db.execute(`
              SELECT
                c.name as customerName,
                c.referredBy as referrerName,
                c.referredByPhone as referrerPhone,
                acp.phone,
                COALESCE((
                  SELECT po.commissionValue
                  FROM orderStatusHistory osh2
                  JOIN productOptions po ON LOWER(osh2.serviceOption) LIKE CONCAT('%', LOWER(TRIM(po.label)), '%')
                  WHERE osh2.registrationId = ${input.registrationId}
                    AND po.commissionValue > 0
                  ORDER BY LENGTH(po.label) DESC, osh2.createdAt ASC LIMIT 1
                ), 0) as commissionValue
              FROM accessCodePhones acp
              LEFT JOIN customers c ON REGEXP_REPLACE(c.phone, '[^0-9]', '') = REGEXP_REPLACE(acp.phone, '[^0-9]', '')
              WHERE acp.id = ${input.registrationId}
              LIMIT 1
            `);
            const row = (rows as any)[0]?.[0] || (Array.isArray(rows) ? (rows[0] as any)?.[0] : null);
            if (row?.referrerPhone) {
              const { getCustomerByPhone } = await import('./db');
              const referrerClean = String(row.referrerPhone).replace(/\D/g, '');
              const referrer = await getCustomerByPhone(referrerClean);
              const commVal = row.commissionValue ? Number(row.commissionValue) : 0;
              const commText = commVal > 0 ? ` de R$ ${(commVal / 100).toFixed(2).replace('.', ',')}` : '';
              // Enviar e-mail se tiver e-mail cadastrado
              if (referrer?.email) {
                const siteTitle = await getSetting('site_title') || 'H2 COLOMBIANO';
                const transporter = nodemailer.createTransport({
                  host: 'smtp.zoho.com',
                  port: 465,
                  secure: true,
                  auth: { user: 'h2@h2colombiano.com', pass: process.env.SMTP_PASS || process.env.ZOHO_EMAIL_PASSWORD || '' },
                });
                await transporter.sendMail({
                  from: `"${siteTitle}" <h2@h2colombiano.com>`,
                  to: referrer.email,
                  subject: `âÅ“"¦ Sua comissão${commText} foi paga! - ${siteTitle}`,
                  html: `
                    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#0f172a;color:#e2e8f0;border-radius:12px;overflow:hidden">
                      <div style="background:linear-gradient(135deg,#7c3aed,#4f46e5);padding:28px 24px;text-align:center">
                        <h1 style="margin:0;font-size:22px;color:#fff">âÅ“"¦ Comissão Paga!</h1>
                        <p style="margin:8px 0 0;color:#c4b5fd;font-size:14px">${siteTitle}</p>
                      </div>
                      <div style="padding:24px">
                        <p style="font-size:15px;margin:0 0 16px">Olá <strong>${row.referrerName || referrer.name || 'indicador'}</strong>! Í°Å¸Å½"°</p>
                        <p style="font-size:14px;color:#94a3b8;margin:0 0 16px">Sua comissão pela indicação de <strong style="color:#e2e8f0">${row.customerName || row.phone}</strong> foi <strong style="color:#4ade80">paga com sucesso</strong>!</p>
                        ${commVal > 0 ? `<div style="background:#1e293b;border-radius:8px;padding:16px;text-align:center;margin:16px 0"><span style="font-size:24px;font-weight:bold;color:#4ade80">R$ ${(commVal / 100).toFixed(2).replace('.', ',')}</span><br><span style="font-size:12px;color:#64748b">Valor da comissão</span></div>` : ''}
                        <p style="font-size:13px;color:#64748b;margin:16px 0 0">Obrigado por indicar! Continue indicando e ganhe mais. Í°Å¸'ª</p>
                      </div>
                    </div>
                  `,
                }).catch((e: any) => console.error('Erro e-mail comissão paga:', e));
              }
              // Retornar dados para o frontend abrir WhatsApp
              return {
                success: true,
                whatsapp: {
                  phone: referrerClean,
                  name: row.referrerName || referrer?.name || '',
                  customerName: row.customerName || row.phone || '',
                  commissionValue: commVal,
                },
              };
            }
          } catch (e) {
            console.error('Erro ao notificar comissão paga:', e);
          }
        }

        return { success: true };
      }),

    // Admin: definir previsão de entrega do pedido
    updateDeliveryEstimate: adminProcedure
      .input(z.object({ registrationId: z.number(), deliveryEstimate: z.number().nullable() }))
      .mutation(async ({ input }) => {
        const db = await (await import('./db')).getDb();
        if (!db) return { success: false };
        // Salvar em TODOS os registros do pedido para garantir que o cliente veja
        await db.execute(sql`
          UPDATE orderStatusHistory
          SET deliveryEstimate = ${input.deliveryEstimate}
          WHERE registrationId = ${input.registrationId}
        `);
        return { success: true };
      }),

    // Admin: buscar configuração de progresso por pedido
    getProgressConfig: adminProcedure
      .input(z.object({ registrationId: z.number(), subOrderIndex: z.number().default(0) }))
      .query(async ({ input }) => {
        const rows = await getOrderProgressConfig(input.registrationId, input.subOrderIndex);
        return rows.map((r: { statusKey: string }) => r.statusKey);
      }),

    // Admin: salvar configuração de progresso por pedido
    setProgressConfig: adminProcedure
      .input(z.object({
        registrationId: z.number(),
        subOrderIndex: z.number().default(0),
        statusKeys: z.array(z.string()),
      }))
      .mutation(async ({ input }) => {
        await setOrderProgressConfig(input.registrationId, input.subOrderIndex, input.statusKeys);
        return { success: true };
      }),

    // Public: buscar configuração de progresso por pedido (para a tela do cliente)
    getProgressConfigPublic: publicProcedure
      .input(z.object({ registrationId: z.number(), subOrderIndex: z.number().default(0) }))
      .query(async ({ input }) => {
        const rows = await getOrderProgressConfig(input.registrationId, input.subOrderIndex);
        return rows.map((r: { statusKey: string }) => r.statusKey);
      }),

    // Admin: relatório de comissões (pedidos com indicador)
    listCommissions: adminProcedure.query(async () => {
      const db = await (await import('./db')).getDb();
      if (!db) return [];
      const rows = await db.execute(`
        SELECT
          acp.id as registrationId,
          acp.phone,
          c.name as customerName,
          c.referredBy,
          c.referredByPhone,
          (
            SELECT osh.status FROM orderStatusHistory osh
            WHERE osh.registrationId = acp.id
            ORDER BY osh.createdAt DESC LIMIT 1
          ) as latestStatus,
          (
            SELECT osh.serviceName FROM orderStatusHistory osh
            WHERE osh.registrationId = acp.id
            ORDER BY osh.createdAt ASC LIMIT 1
          ) as serviceName,
          (
            SELECT osh.serviceOption FROM orderStatusHistory osh
            WHERE osh.registrationId = acp.id AND osh.serviceOption IS NOT NULL AND osh.serviceOption != ''
            ORDER BY osh.createdAt ASC LIMIT 1
          ) as serviceOption,
          (
            SELECT UNIX_TIMESTAMP(osh.createdAt) * 1000 FROM orderStatusHistory osh
            WHERE osh.registrationId = acp.id
            ORDER BY osh.createdAt ASC LIMIT 1
          ) as submittedAt,
          COALESCE((
            SELECT MAX(osh.commissionPaid) FROM orderStatusHistory osh
            WHERE osh.registrationId = acp.id
          ), 0) as commissionPaid,
          COALESCE((
            SELECT po.commissionValue
            FROM orderStatusHistory osh2
            JOIN productOptions po ON LOWER(osh2.serviceOption) LIKE CONCAT('%', LOWER(TRIM(po.label)), '%')
            WHERE osh2.registrationId = acp.id
              AND po.commissionValue > 0
            ORDER BY LENGTH(po.label) DESC, osh2.createdAt ASC LIMIT 1
          ), 0) as commissionValue,
          (
            SELECT osh.orderNumber FROM orderStatusHistory osh
            WHERE osh.registrationId = acp.id AND osh.orderNumber IS NOT NULL
            ORDER BY osh.createdAt ASC LIMIT 1
          ) as orderNumber,
          (
            SELECT COUNT(DISTINCT acp2.id)
            FROM accessCodePhones acp2
            LEFT JOIN customers c2 ON REGEXP_REPLACE(c2.phone, '[^0-9]', '') = REGEXP_REPLACE(acp2.phone, '[^0-9]', '')
            WHERE c2.referredBy = c.referredBy
              AND c2.referredByPhone = c.referredByPhone
              AND (SELECT COUNT(*) FROM orderStatusHistory osh3 WHERE osh3.registrationId = acp2.id) > 0
          ) as totalReferrals,
          (
            SELECT cr.profilePhotoUrl FROM customers cr
            WHERE REGEXP_REPLACE(cr.phone, '[^0-9]', '') = REGEXP_REPLACE(c.referredByPhone, '[^0-9]', '')
            LIMIT 1
          ) as referrerPhotoUrl
        FROM accessCodePhones acp
        LEFT JOIN customers c ON REGEXP_REPLACE(c.phone, '[^0-9]', '') = REGEXP_REPLACE(acp.phone, '[^0-9]', '')
        WHERE c.referredBy IS NOT NULL
          AND c.referredBy != ''
          AND (
            SELECT COUNT(*) FROM orderStatusHistory osh WHERE osh.registrationId = acp.id
          ) > 0
          -- Somente o primeiro pedido do cliente indicado (menor id de accessCodePhones para este telefone)
          AND acp.id = (
            SELECT MIN(acp2.id) FROM accessCodePhones acp2
            WHERE REGEXP_REPLACE(acp2.phone, '[^0-9]', '') = REGEXP_REPLACE(acp.phone, '[^0-9]', '')
          )
        ORDER BY c.referredBy, acp.id DESC
      `);
      return (rows[0] as unknown as any[]).map((r: any) => ({
        registrationId: r.registrationId as number,
        phone: r.phone as string,
        customerName: r.customerName as string | null,
        referredBy: r.referredBy as string,
        referredByPhone: r.referredByPhone as string | null,
        latestStatus: r.latestStatus as string | null,
        serviceName: r.serviceName as string | null,
        serviceOption: r.serviceOption as string | null,
        submittedAt: r.submittedAt ? Number(r.submittedAt) : null,
        commissionPaid: Number(r.commissionPaid),
        commissionValue: Number(r.commissionValue ?? 0),
        orderNumber: r.orderNumber ? Number(r.orderNumber) : null,
        totalReferrals: Number(r.totalReferrals ?? 0),
        referrerPhotoUrl: r.referrerPhotoUrl as string | null,
      }));
    }),

    // Admin: deletar indicação (remove referredBy do cliente e o histórico de pedido)
    deleteCommission: adminProcedure
      .input(z.object({ registrationId: z.number() }))
      .mutation(async ({ input }) => {
        const db = await (await import('./db')).getDb();
        if (!db) return { success: false };
        // Buscar o phone do registro
        const rows = await db.execute(`SELECT phone FROM accessCodePhones WHERE id = ${input.registrationId} LIMIT 1`);
        const rec = (rows[0] as unknown as any[])[0];
        if (rec?.phone) {
          // Limpar referredBy do cliente para não aparecer mais como indicação
          await db.execute(`
            UPDATE customers
            SET referredBy = NULL, referredByPhone = NULL
            WHERE REGEXP_REPLACE(phone, '[^0-9]', '') = REGEXP_REPLACE('${rec.phone}', '[^0-9]', '')
          `);
        }
        return { success: true };
      }),

    resendReferralEmail: adminProcedure
      .input(z.object({
        referrerPhone: z.string(),
        referredName: z.string(),
        referredPhone: z.string(),
        commissionValue: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        try {
          const { getCustomerByPhone } = await import('./db');
          const referrerCleanPhone = input.referrerPhone.replace(/\D/g, '');
          const referrer = await getCustomerByPhone(referrerCleanPhone);
          if (!referrer?.email) return { success: false, reason: 'no_email' };
          const emailBranding = await getEmailBranding();
          const transporter = nodemailer.createTransport({
            host: 'smtp.zoho.com',
            port: 465,
            secure: true,
            auth: { user: 'h2@h2colombiano.com', pass: process.env.SMTP_PASS || process.env.ZOHO_EMAIL_PASSWORD || '' },
          });
          const waLink = `https://wa.me/55${referrerCleanPhone}`;
          const commissionHtml = input.commissionValue && input.commissionValue > 0
            ? `<p style="margin:12px 0 8px;font-size:13px;color:#fcd34d;font-weight:bold;">Í°Å¸'° Comissão: R$ ${(input.commissionValue / 100).toFixed(2).replace('.', ',')}</p>`
            : '';
          await transporter.sendMail({
            from: '"H2 COLOMBIANO" <h2@h2colombiano.com>',
            to: referrer.email,
            subject: `[Reenvio] Í°Å¸Å½"° Sua indicação deu certo! ${input.referredName} fez um pedido`,
            html: emailIndicacaoSucesso({
              ...emailBranding,
              referrerName: referrer.name || undefined,
              referredName: input.referredName,
              service: undefined,
            }),
          });
          return { success: true };
        } catch (e) {
          console.error('Erro ao reenviar e-mail ao indicador:', e);
          return { success: false, reason: 'send_error' };
        }
      }),

    // Admin: criar pedido manual com cliente e status inicial
    createManualOrder: adminProcedure
      .input(z.object({
        name: z.string().min(2),
        phone: z.string().min(10),
        email: z.string().email('Email inválido').min(1, 'Email obrigatório'),
        city: z.string().optional(),
        uf: z.string().length(2).optional(),
        referredBy: z.string().optional(),
        referredByPhone: z.string().optional(),
        status: z.string(),
        note: z.string().optional(),
        serviceName: z.string().optional(),
        serviceOption: z.string().optional(),
        answers: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await (await import('./db')).getDb();
        if (!db) throw new Error('Database not available');

        // 1. Criar ou atualizar cliente
        let customer = await getCustomerByPhone(input.phone);
        if (!customer) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cadastre primeiro o perfil completo do cliente em Clientes: foto, e-mail, CPF e telefone são obrigatórios.' });
        } else {
          // Atualizar dados existentes — NÍÆ’O sobrescrever referredBy se cliente já existe
          // Indicação só conta para clientes novos (primeiro cadastro)
          await updateCustomer(customer.id, {
            name: input.name,
            email: input.email,
            city: input.city,
            uf: input.uf,
            // Só salva referredBy se o cliente ainda não tem um (cliente novo)
            ...(customer.referredBy ? {} : {
              referredBy: input.referredBy,
              referredByPhone: input.referredByPhone,
            }),
          });
        }
        // 2. Criar código de acesso manual (tipo 'vip', já consumido)
        const manualCode = `MANUAL-${input.phone.replace(/\D/g, '')}-${Date.now()}`;
        await db.execute(sql`
          INSERT INTO accessCodes (code, type, status, clientName, maxUses, currentUses, createdAt)
          VALUES (${manualCode}, 'vip', 'used', ${input.name}, 1, 1, NOW())
        `);
        const codeRows = await db.execute(sql`SELECT id FROM accessCodes WHERE code = ${manualCode} LIMIT 1`);
        const codeId = (codeRows[0] as unknown as Array<{ id: number }>)[0]?.id;
        if (!codeId) throw new Error('Erro ao criar código de acesso');

        // 3. Registrar telefone como consumed=1
        await db.execute(sql`
          INSERT INTO accessCodePhones (codeId, phone, consumed, accessedAt)
          VALUES (${codeId}, ${input.phone}, 1, NOW())
        `);
        const phoneRows = await db.execute(sql`SELECT id FROM accessCodePhones WHERE codeId = ${codeId} AND phone = ${input.phone} LIMIT 1`);
        const registrationId = (phoneRows[0] as unknown as Array<{ id: number }>)[0]?.id;
        if (!registrationId) throw new Error('Erro ao registrar telefone');

        // 4. Salvar status inicial com número de pedido único
        let adminOrderNum: number | undefined;
        try { adminOrderNum = await generateOrderNumber(); } catch (e) { console.error('[OrderNumber] Erro:', e); }
        await addOrderStatus({
          registrationId,
          orderNumber: adminOrderNum,
          customerPhone: input.phone,
          status: input.status,
          note: input.note,
          serviceName: input.serviceName,
          serviceOption: input.serviceOption,
          answers: input.answers,
        });

        // 5. Enviar email de notificação se tiver email e não estiver bloqueado
        const customerForBlock4 = input.phone ? await getCustomerByPhone(input.phone) : null;
        const isCustomerBlocked4 = customerForBlock4 && (customerForBlock4 as any).blocked === 1;
        if (input.email && !isCustomerBlocked4) {
          const statusInfo3 = await getStatusInfoFromDb(input.status);
          const statusLabel = statusInfo3.label;
          try {
            if (!hasMailChannel()) throw new Error('Mail channel not configured');
            const emailBranding = await getEmailBranding();
            const noteHtml = input.note ? `<div style="background:#0d2b1a;border:1px solid #22c55e40;border-radius:8px;padding:16px;margin-bottom:20px;"><p style="color:#22c55e;font-size:12px;font-weight:bold;margin:0 0 8px;">📋 Observação:</p><p style="color:#ccc;font-size:14px;margin:0;white-space:pre-line;">${input.note}</p></div>` : '';
            const descriptionHtml3 = statusInfo3.description ? `<div style="background:#1a1a2e;border:1px solid #a855f720;border-radius:8px;padding:16px;margin-bottom:20px;"><p style="color:#ccc;font-size:14px;margin:0;white-space:pre-line;line-height:1.7;">${statusInfo3.description}</p></div>` : '';
            // Buscar PIN do cliente
            let phonePin3: string | null = input.phone ? input.phone.replace(/\D/g, '').slice(-4) : null;
            try {
              const { getDb: getDbPin3m } = await import('./db');
              const { customerPins: cpTable3m } = await import('../drizzle/schema');
              const { eq: eqPin3m } = await import('drizzle-orm');
              const dbPin3m = await getDbPin3m();
              if (dbPin3m && input.phone) {
                const cleanPhone3m = input.phone.replace(/\D/g, '');
                const pinRow3m = await dbPin3m.select().from(cpTable3m).where(eqPin3m(cpTable3m.phone, cleanPhone3m)).limit(1);
                if (pinRow3m[0]?.pin) phonePin3 = pinRow3m[0].pin;
              }
            } catch { /* usa fallback */ }
            const pinHtml3 = ''; // Senha de acompanhamento removida
            await sendMailDirect({
              from: '"H2 COLOMBIANO" <h2@h2colombiano.com>',
              to: input.email,
              subject: `${statusLabel} — ${emailBranding.siteTitle}`,
              html: emailStatusCliente({
                ...emailBranding,
                customerName: input.name || undefined,
                statusLabel,
                orderNumber: undefined,
                service: undefined,
                description: descriptionHtml3 ? descriptionHtml3.replace(/<[^>]+>/g, '').trim() : undefined,
                note: input.note || undefined,
              }),
            });
          } catch (err) {
            console.error('Erro ao enviar email de status:', err);
          }
        }

        return {
          success: true,
          registrationId,
          orderNumber: adminOrderNum,
          serviceName: input.serviceName,
          serviceOption: input.serviceOption,
        };
      }),

    // Admin: criar pedido manual com múltiplos produtos
    createManualOrderMultiple: adminProcedure
      .input(z.object({
        name: z.string().min(2),
        phone: z.string().min(10),
        email: z.string().email('Email inválido').min(1, 'Email obrigatório'),
        city: z.string().optional(),
        uf: z.string().length(2).optional(),
        referredBy: z.string().optional(),
        referredByPhone: z.string().optional(),
        status: z.string(),
        note: z.string().optional(),
        items: z.array(z.object({
          serviceName: z.string(),
          serviceOption: z.string().optional(),
          answers: z.string().optional(),
        })).min(1),
      }))
      .mutation(async ({ input }) => {
        const db = await (await import('./db')).getDb();
        if (!db) throw new Error('Database not available');

        // 1. Criar ou atualizar cliente
        let customer = await getCustomerByPhone(input.phone);
        if (!customer) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cadastre primeiro o perfil completo do cliente em Clientes: foto, e-mail, CPF e telefone são obrigatórios.' });
        } else {
          // NÍÆ’O sobrescrever referredBy se cliente já existe
          // Indicação só conta para clientes novos (primeiro cadastro)
          await updateCustomer(customer.id, {
            name: input.name,
            email: input.email,
            city: input.city,
            uf: input.uf,
            ...(customer.referredBy ? {} : {
              referredBy: input.referredBy,
              referredByPhone: input.referredByPhone,
            }),
          });
        }
        // 2. Criar código de acesso manual compartilhado
        const manualCode = `MANUAL-${input.phone.replace(/\D/g, '')}-${Date.now()}`;
        await db.execute(sql`
          INSERT INTO accessCodes (code, type, status, clientName, maxUses, currentUses, createdAt)
          VALUES (${manualCode}, 'vip', 'used', ${input.name}, 1, 1, NOW())
        `);
        const codeRows = await db.execute(sql`SELECT id FROM accessCodes WHERE code = ${manualCode} LIMIT 1`);
        const codeId = (codeRows[0] as unknown as Array<{ id: number }>)[0]?.id;
        if (!codeId) throw new Error('Erro ao criar código de acesso');

        // 3. Registrar telefone como consumed=1
        await db.execute(sql`
          INSERT INTO accessCodePhones (codeId, phone, consumed, accessedAt)
          VALUES (${codeId}, ${input.phone}, 1, NOW())
        `);
        const phoneRows = await db.execute(sql`SELECT id FROM accessCodePhones WHERE codeId = ${codeId} AND phone = ${input.phone} LIMIT 1`);
        const registrationId = (phoneRows[0] as unknown as Array<{ id: number }>)[0]?.id;
        if (!registrationId) throw new Error('Erro ao registrar telefone');

        // 4. Criar UMA ÍÅ¡NICA entrada no histórico com todos os produtos concatenados e 1 número de pedido
        let orderNum: number | undefined;
        try { orderNum = await generateOrderNumber(); } catch (e) { console.error('[OrderNumber] Erro:', e); }

        // Concatenar todos os produtos: "UBER CARRO (NOME/ALEATORIO) + 99 MOTO (NOME/ALEATORIO)"
        const combinedServiceName = input.items
          .map(item => item.serviceOption ? `${item.serviceName} (${item.serviceOption})` : item.serviceName)
          .join(' + ');
        const combinedServiceOption = input.items.length > 1
          ? `${input.items.length} produtos`
          : (input.items[0]?.serviceOption || undefined);
        const combinedAnswers = input.items
          .map(item => item.answers)
          .filter(Boolean)
          .join(' | ') || undefined;

        await addOrderStatus({
          registrationId,
          orderNumber: orderNum,
          customerPhone: input.phone,
          status: input.status,
          note: input.note,
          serviceName: combinedServiceName,
          serviceOption: combinedServiceOption,
          answers: combinedAnswers,
        });

        const createdOrders = input.items.map(item => ({
          serviceName: item.serviceName,
          serviceOption: item.serviceOption,
          orderNumber: orderNum,
        }));

        // 5. Enviar email de notificação (exceto clientes bloqueados)
        const customerForBlock5 = input.phone ? await getCustomerByPhone(input.phone) : null;
        const isCustomerBlocked5 = customerForBlock5 && (customerForBlock5 as any).blocked === 1;
        if (input.email && !isCustomerBlocked5) {
          const statusInfo = await getStatusInfoFromDb(input.status);
          const statusLabel = statusInfo.label;
          try {
            if (!hasMailChannel()) throw new Error('Mail channel not configured');
            const emailBranding = await getEmailBranding();
            const itemsHtml = input.items.map((item, i) =>
              `<tr><td style="padding:6px 8px;color:#ccc;font-size:13px;border-bottom:1px solid #ffffff10;">${i + 1}. ${item.serviceName}${item.serviceOption ? ` — ${item.serviceOption}` : ''}</td></tr>`
            ).join('');
            const noteHtml = input.note ? `<div style="background:#0d2b1a;border:1px solid #22c55e40;border-radius:8px;padding:16px;margin-bottom:20px;"><p style="color:#22c55e;font-size:12px;font-weight:bold;margin:0 0 8px;">📋 Observação:</p><p style="color:#ccc;font-size:14px;margin:0;white-space:pre-line;">${input.note}</p></div>` : '';
            // Buscar PIN do cliente
            let phonePinM: string | null = input.phone ? input.phone.replace(/\D/g, '').slice(-4) : null;
            try {
              const { getDb: getDbPinM } = await import('./db');
              const { customerPins: cpTableM } = await import('../drizzle/schema');
              const { eq: eqPinM } = await import('drizzle-orm');
              const dbPinM = await getDbPinM();
              if (dbPinM && input.phone) {
                const cleanPhoneM = input.phone.replace(/\D/g, '');
                const pinRowM = await dbPinM.select().from(cpTableM).where(eqPinM(cpTableM.phone, cleanPhoneM)).limit(1);
                if (pinRowM[0]?.pin) phonePinM = pinRowM[0].pin;
              }
            } catch { /* usa fallback */ }
            const pinHtmlM = ''; // Senha de acompanhamento removida
            await sendMailDirect({
              from: '"H2 COLOMBIANO" <h2@h2colombiano.com>',
              to: input.email,
              subject: `${statusLabel} — ${emailBranding.siteTitle}`,
              html: emailStatusCliente({
                ...emailBranding,
                customerName: input.name || undefined,
                statusLabel,
                orderNumber: undefined,
                service: undefined,
                description: undefined,
                note: input.note || undefined,
              }),
            });
          } catch (err) {
            console.error('Erro ao enviar email de observação:', err);
          }
        }
        return { success: true };
      }),

    // Admin: remover múltiplos pedidos em massa (soft delete)
    deleteOrdersBulk: adminProcedure
      .input(z.object({
        orders: z.array(z.object({ registrationId: z.number(), customerPhone: z.string(), subOrderIndex: z.number().optional() }))
      }))
      .mutation(async ({ input }) => {
        const db = await (await import('./db')).getDb();
        if (!db) return { success: false, deleted: 0 };
        let deleted = 0;
        for (const order of input.orders) {
          const targetIdx = order.subOrderIndex ?? 0;
          // Soft delete: inserir na tabela hiddenSubOrders
          await db.execute(sql`
            INSERT INTO hiddenSubOrders (registrationId, subOrderIndex)
            SELECT ${order.registrationId}, ${targetIdx}
            WHERE NOT EXISTS (
              SELECT 1 FROM hiddenSubOrders
              WHERE registrationId = ${order.registrationId} AND subOrderIndex = ${targetIdx}
            )
          `);
          deleted++;
        }
        return { success: true, deleted };
      }),

    // Público: registrar tentativa de PIN e verificar bloqueio
    checkPinAttempt: publicProcedure
      .input(z.object({ phone: z.string(), correct: z.boolean() }))
      .mutation(async ({ input }) => {
        const db = await (await import('./db')).getDb();
        if (!db) return { blocked: false, attempts: 0 };
        const phone = input.phone.replace(/\D/g, '');
        // Buscar registro existente
        const rows = await db.execute(sql`SELECT * FROM pinBlocks WHERE phone = ${phone} LIMIT 1`);
        const existing = (rows[0] as unknown as Array<{ id: number; attempts: number; blocked: number }>)[0];
        if (existing?.blocked === 1) return { blocked: true, attempts: existing.attempts };
        if (input.correct) {
          // Acerto: zerar tentativas
          if (existing) await db.execute(sql`UPDATE pinBlocks SET attempts = 0 WHERE phone = ${phone}`);
          return { blocked: false, attempts: 0 };
        }
        // Erro: incrementar tentativas
        const newAttempts = (existing?.attempts ?? 0) + 1;
        const nowBlocked = newAttempts >= 3 ? 1 : 0;
        if (existing) {
          await db.execute(sql`UPDATE pinBlocks SET attempts = ${newAttempts}, blocked = ${nowBlocked} WHERE phone = ${phone}`);
        } else {
          await db.execute(sql`INSERT INTO pinBlocks (phone, attempts, blocked) VALUES (${phone}, ${newAttempts}, ${nowBlocked})`);
        }
        return { blocked: nowBlocked === 1, attempts: newAttempts };
      }),

    // Admin: desbloquear PIN de um telefone
    unlockPin: adminProcedure
      .input(z.object({ phone: z.string() }))
      .mutation(async ({ input }) => {
        const db = await (await import('./db')).getDb();
        if (!db) return { success: false };
        const phone = input.phone.replace(/\D/g, '');
        await db.execute(sql`UPDATE pinBlocks SET attempts = 0, blocked = 0 WHERE phone = ${phone}`);
        return { success: true };
      }),

    // Admin: verificar se um telefone está bloqueado
    getPinBlockStatus: adminProcedure
      .input(z.object({ phone: z.string() }))
      .query(async ({ input }) => {
        const db = await (await import('./db')).getDb();
        if (!db) return { blocked: false, attempts: 0 };
        const phone = input.phone.replace(/\D/g, '');
        const rows = await db.execute(sql`SELECT attempts, blocked FROM pinBlocks WHERE phone = ${phone} LIMIT 1`);
        const row = (rows[0] as unknown as Array<{ attempts: number; blocked: number }>)[0];
        return { blocked: (row?.blocked ?? 0) === 1, attempts: row?.attempts ?? 0 };
      }),

    // Admin: busca de emergência — busca em TODAS as pastas (ativas, arquivo, rgcnh, pastas personalizadas)
    emergencySearch: adminProcedure
      .input(z.object({ term: z.string().min(1) }))
      .query(async ({ input }) => {
        const db = await (await import('./db')).getDb();
        if (!db) return [];
        const term = input.term.trim();
        // Normaliza o termo: remove tudo que não é dígito para busca por telefone
        const termDigits = term.replace(/\D/g, '');
        // Escapa aspas simples para SQL seguro
        const esc = (s: string) => s.replace(/'/g, "''");
        // Para busca por nome: usa o termo original com LIKE
        const likeTermSql = `'%${esc(term)}%'`;
        // Para busca por dígitos: usa apenas os dígitos (aceita qualquer formato de telefone)
        const likeDigitsSql = termDigits.length >= 4 ? `'%${esc(termDigits)}%'` : null;
        // Sufixo de 8 dígitos (sem DDD) para busca parcial
        const suffix8Sql = termDigits.length >= 8 ? `'%${esc(termDigits.slice(-8))}%'` : null;
        // Termo limpo para comparação de número de pedido/cadastro
        const termCleanSql = `'%${esc(termDigits || term)}%'`;

        // Buscar em TODOS os pedidos (archived=0 e archived=1, rgCnhApproved=0 e =1)
        // Inclui pedidos em pastas personalizadas (folderName), pastas fixas (arquivo, rgcnh) e ativos
        const wherePhoneClauses = [
          `acp.phone LIKE ${likeTermSql}`,
          ...(likeDigitsSql ? [`REGEXP_REPLACE(acp.phone, '[^0-9]', '') LIKE ${likeDigitsSql}`] : []),
          ...(suffix8Sql ? [`RIGHT(REGEXP_REPLACE(acp.phone, '[^0-9]', ''), 8) LIKE ${suffix8Sql}`] : []),
        ];
        const whereNameClauses = [
          `c.name LIKE ${likeTermSql}`,
        ];
        const whereOrderClauses = [
          `CAST(c.customerNumber AS CHAR) LIKE ${termCleanSql}`,
          `CAST(osh_last.orderNumber AS CHAR) LIKE ${termCleanSql}`,
          `CAST(osh_first.orderNumber AS CHAR) LIKE ${termCleanSql}`,
        ];
        const allWhereClauses = [...wherePhoneClauses, ...whereNameClauses, ...whereOrderClauses].join(' OR ');

        const querySql = `
          SELECT
            acp.id AS registrationId,
            acp.phone AS customerPhone,
            acp.archived,
            acp.rgCnhApproved,
            UNIX_TIMESTAMP(acp.accessedAt) * 1000 AS accessedAt,
            COALESCE(NULLIF(osh_last.serviceName,'NULL'), NULLIF(osh_first.serviceName,'NULL')) AS serviceName,
            COALESCE(NULLIF(osh_last.serviceOption,'NULL'), NULLIF(osh_first.serviceOption,'NULL')) AS serviceOption,
            COALESCE(NULLIF(osh_last.orderNumber,0), osh_first.orderNumber) AS orderNumber,
            osh_last.status AS latestStatus,
            UNIX_TIMESTAMP(osh_last.createdAt) * 1000 AS latestStatusAt,
            COALESCE(NULLIF(c.name,''), acp.phone) AS customerName,
            c.customerNumber,
            c.city,
            c.uf,
            c.email,
            c.profilePhotoUrl,
            cf.id AS folderId,
            cf.name AS folderName,
            cf.icon AS folderIcon,
            cfo.subOrderIndex AS folderSubOrderIndex
          FROM accessCodePhones acp
          LEFT JOIN accessCodes ac ON ac.id = acp.codeId
          LEFT JOIN (
            SELECT registrationId, MAX(id) AS maxId FROM orderStatusHistory GROUP BY registrationId
          ) latest ON latest.registrationId = acp.id
          LEFT JOIN orderStatusHistory osh_last ON osh_last.id = latest.maxId
          LEFT JOIN (
            SELECT registrationId, MIN(id) AS minId FROM orderStatusHistory GROUP BY registrationId
          ) first_rec ON first_rec.registrationId = acp.id
          LEFT JOIN orderStatusHistory osh_first ON osh_first.id = first_rec.minId
          LEFT JOIN customers c ON REGEXP_REPLACE(c.phone, '[^0-9]', '') = REGEXP_REPLACE(acp.phone, '[^0-9]', '')
          LEFT JOIN customFolderOrders cfo ON cfo.registrationId = acp.id
          LEFT JOIN customFolders cf ON cf.id = cfo.folderId
          WHERE (ac.type IS NULL OR ac.type != 'raffle')
            AND (${allWhereClauses})
            -- Ocultar cadastros vazios (sem status e sem pasta) quando o mesmo telefone
            -- já possui outro cadastro com dados/histórico. Evita cards duplicados "Sem status".
            AND NOT (
              latest.maxId IS NULL
              AND cfo.id IS NULL
              AND EXISTS (
                SELECT 1 FROM accessCodePhones acp_d
                WHERE acp_d.id <> acp.id
                  AND REGEXP_REPLACE(acp_d.phone, '[^0-9]', '') = REGEXP_REPLACE(acp.phone, '[^0-9]', '')
                  AND (
                    EXISTS (SELECT 1 FROM orderStatusHistory osh_d WHERE osh_d.registrationId = acp_d.id)
                    OR EXISTS (SELECT 1 FROM customFolderOrders cfo_d WHERE cfo_d.registrationId = acp_d.id)
                  )
              )
            )
          ORDER BY acp.accessedAt DESC
          LIMIT 100
        `;
        const result = await db.execute(sql.raw(querySql));
        const rows = ((result as any)[0] || []) as any[];

        return rows.map((r: any) => {
          // Determinar pasta
          let folderLabel: string;
          let folderType: 'active' | 'archived' | 'rgcnh' | 'custom';
          if (r.folderName) {
            folderLabel = r.folderIcon ? `${r.folderIcon} ${r.folderName}` : r.folderName;
            folderType = 'custom';
          } else if (Number(r.archived) === 1) {
            folderLabel = 'Í°Å¸"Â Arquivo';
            folderType = 'archived';
          } else if (Number(r.rgCnhApproved) === 1) {
            folderLabel = 'Í°Å¸ª· RG/CNH Aprovado';
            folderType = 'rgcnh';
          } else {
            folderLabel = '📋 Pedidos Ativos';
            folderType = 'active';
          }
          return {
            registrationId: Number(r.registrationId),
            customerPhone: String(r.customerPhone || ''),
            customerName: String(r.customerName || r.customerPhone || ''),
            customerNumber: r.customerNumber != null ? Number(r.customerNumber) : null,
            city: r.city && r.city !== 'NULL' ? String(r.city) : null,
            uf: r.uf && r.uf !== 'NULL' ? String(r.uf) : null,
            email: r.email && r.email !== 'NULL' ? String(r.email) : null,
            profilePhotoUrl: r.profilePhotoUrl && r.profilePhotoUrl !== 'NULL' ? String(r.profilePhotoUrl) : null,
            serviceName: r.serviceName && r.serviceName !== 'NULL' ? String(r.serviceName) : null,
            serviceOption: r.serviceOption && r.serviceOption !== 'NULL' ? String(r.serviceOption) : null,
            orderNumber: r.orderNumber != null ? Number(r.orderNumber) : null,
            latestStatus: r.latestStatus && r.latestStatus !== 'NULL' ? String(r.latestStatus) : null,
            latestStatusAt: r.latestStatusAt ? Number(r.latestStatusAt) : null,
            accessedAt: r.accessedAt ? Number(r.accessedAt) : null,
            folderLabel,
            folderType,
            folderId: r.folderId != null ? Number(r.folderId) : null,
            subOrderIndex: r.folderSubOrderIndex != null ? Number(r.folderSubOrderIndex) : 0,
            archived: Number(r.archived) === 1,
            rgCnhApproved: Number(r.rgCnhApproved) === 1,
          };
        });
      }),
  }),

  // Configurações globais do app
  appSettings: router({
    // Público: ler modo de captura de foto
    getPhotoMode: publicProcedure.query(async () => {
      const db = await (await import('./db')).getDb();
      if (!db) return { mode: 'both' as const };
      const rows = await db.execute(sql`SELECT value FROM appSettings WHERE \`key\` = 'photoMode' LIMIT 1`);
      const row = (rows[0] as unknown as Array<{ value: string }>)[0];
      const mode = row?.value ?? 'both';
      return { mode: mode as 'camera' | 'gallery' | 'both' | 'disabled' };
    }),

    // Público: verificar se o modo manual de senha está ativo
    getManualMode: publicProcedure.query(async () => {
      const db = await (await import('./db')).getDb();
      if (!db) return { isManual: true }; // default seguro: modo manual
      const rows = await db.execute(sql`SELECT value FROM appSettings WHERE \`key\` = 'senha_cadastro_ativa' LIMIT 1`);
      const row = (rows[0] as unknown as Array<{ value: string }>)[0];
      const val = row?.value ?? 'true';
      return { isManual: val === 'true' };
    }),

    // Admin: salvar modo de captura de foto
    setPhotoMode: adminProcedure
      .input(z.object({ mode: z.enum(['camera', 'gallery', 'both', 'disabled']) }))
      .mutation(async ({ input }) => {
        const db = await (await import('./db')).getDb();
        if (!db) return { success: false };
        await db.execute(sql`
          INSERT INTO appSettings (\`key\`, value) VALUES ('photoMode', ${input.mode})
          ON DUPLICATE KEY UPDATE value = ${input.mode}
        `);
        return { success: true };
      }),
  }),
  // Status de pedido editáveis pelo admin
  statusTypes: router({
    // Público: listar todos os status (ativos e inativos para o admin)
    list: publicProcedure.query(async () => {
      const { listOrderStatusTypes } = await import('./db');
      return await listOrderStatusTypes();
    }),
    // Admin: criar novo status
    create: adminProcedure
      .input(z.object({
        key: z.string().min(1).max(64).regex(/^[a-z0-9_]+$/, "Apenas letras minúsculas, números e _"),
        label: z.string().min(1).max(128),
        color: z.string().default("text-gray-400"),
        bgColor: z.string().default("bg-gray-500/20 border-gray-500/40"),
        icon: z.string().default("Clock"),
        description: z.string().optional(),
        sortOrder: z.number().int().default(0),
        isActive: z.number().int().min(0).max(1).default(1),
        pulseColor: z.string().max(32).optional(),
      }))
      .mutation(async ({ input }) => {
        const { createOrderStatusType } = await import('./db');
        return await createOrderStatusType(input);
      }),
    // Admin: atualizar status existente
    update: adminProcedure
      .input(z.object({
        id: z.number().int(),
        label: z.string().min(1).max(128).optional(),
        color: z.string().optional(),
        bgColor: z.string().optional(),
        icon: z.string().optional(),
        description: z.string().nullable().optional(),
        sortOrder: z.number().int().optional(),
        isActive: z.number().int().min(0).max(1).optional(),
        pulseColor: z.string().max(32).nullable().optional(),
        showInProgress: z.number().int().min(0).max(1).optional(),
        progressOrder: z.number().int().optional(),
      }))
      .mutation(async ({ input }) => {
        const { updateOrderStatusType } = await import('./db');
        const { id, ...data } = input;
        await updateOrderStatusType(id, data);
        return { success: true };
      }),
    // Admin: excluir status (apenas não-sistema)
    delete: adminProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ input }) => {
        const { deleteOrderStatusType } = await import('./db');
        await deleteOrderStatusType(input.id);
        return { success: true };
      }),
  }),

  // === BANNERS INFORMATIVOS ===
  banners: router({
    listActive: publicProcedure
      .input(z.object({ page: z.string().optional() }))
      .query(async ({ input }) => {
        const { listInfoBanners } = await import('./db');
        const all = await listInfoBanners(true);
        if (!input.page) return all;
        return all.filter(b => {
          const pages = b.targetPages ? b.targetPages.split(',').map(p => p.trim()) : ['gastos'];
          return pages.includes(input.page!) || pages.includes('todas');
        });
      }),
    list: adminProcedure.query(async () => {
      const { listInfoBanners } = await import('./db');
      return await listInfoBanners(false);
    }),
    create: adminProcedure
      .input(z.object({
        title: z.string().min(1).max(256),
        content: z.string().min(1),
        bgColor: z.string().default('#1e3a5f'),
        textColor: z.string().default('#ffffff'),
        sortOrder: z.number().int().default(0),
        isActive: z.number().int().min(0).max(1).default(1),
        targetPages: z.string().default('gastos'),
      }))
      .mutation(async ({ input }) => {
        const { createInfoBanner } = await import('./db');
        return await createInfoBanner(input);
      }),
    update: adminProcedure
      .input(z.object({
        id: z.number().int(),
        title: z.string().min(1).max(256).optional(),
        content: z.string().optional(),
        bgColor: z.string().optional(),
        textColor: z.string().optional(),
        sortOrder: z.number().int().optional(),
        isActive: z.number().int().min(0).max(1).optional(),
        targetPages: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { updateInfoBanner } = await import('./db');
        const { id, ...data } = input;
        await updateInfoBanner(id, data);
        return { success: true };
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ input }) => {
        const { deleteInfoBanner } = await import('./db');
        await deleteInfoBanner(input.id);
        return { success: true };
      }),
  }),

  // â"â‚¬â"â‚¬ Anotações Internas do Admin por Pedido â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬
  orderNotes: router({
    // Buscar anotação do pedido (legado — retorna primeiro bloco)
    get: adminProcedure
      .input(z.object({ registrationId: z.number().int() }))
      .query(async ({ input }) => {
        const { getOrderNotes } = await import('./db');
        const notes = await getOrderNotes(input.registrationId);
        return notes[0] ?? null;
      }),

    // Buscar TODOS os blocos de anotação do pedido
    getAll: adminProcedure
      .input(z.object({ registrationId: z.number().int() }))
      .query(async ({ input }) => {
        const { getOrderNotes } = await import('./db');
        return await getOrderNotes(input.registrationId);
      }),

    // Criar novo bloco de anotação
    createBlock: adminProcedure
      .input(z.object({
        registrationId: z.number().int(),
        blockName: z.string().min(1).max(100),
        content: z.string().optional().default(''),
      }))
      .mutation(async ({ input }) => {
        const { createOrderNoteBlock } = await import('./db');
        return await createOrderNoteBlock(input.registrationId, input.blockName, input.content);
      }),

    // Salvar conteúdo de um bloco específico
    saveBlock: adminProcedure
      .input(z.object({ id: z.number().int(), content: z.string() }))
      .mutation(async ({ input }) => {
        const { saveOrderNoteBlock } = await import('./db');
        await saveOrderNoteBlock(input.id, input.content);
        return { success: true };
      }),

    // Renomear bloco
    renameBlock: adminProcedure
      .input(z.object({ id: z.number().int(), blockName: z.string().min(1).max(100) }))
      .mutation(async ({ input }) => {
        const { renameOrderNoteBlock } = await import('./db');
        await renameOrderNoteBlock(input.id, input.blockName);
        return { success: true };
      }),

    // Deletar bloco específico
    deleteBlock: adminProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ input }) => {
        const { deleteOrderNoteBlock } = await import('./db');
        await deleteOrderNoteBlock(input.id);
        return { success: true };
      }),

    // Salvar (criar ou atualizar) anotação do pedido (legado)
    save: adminProcedure
      .input(z.object({ registrationId: z.number().int(), content: z.string() }))
      .mutation(async ({ input }) => {
        const { saveOrderNote } = await import('./db');
        return await saveOrderNote(input.registrationId, input.content);
      }),

    // Excluir anotação do pedido (legado)
    delete: adminProcedure
      .input(z.object({ registrationId: z.number().int() }))
      .mutation(async ({ input }) => {
        const { deleteOrderNote } = await import('./db');
        await deleteOrderNote(input.registrationId);
        return { success: true };
      }),
  }),

  // â"â‚¬â"â‚¬ Dados de Login Liberado por Pedido â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬
  loginData: router({
    // Admin busca dados de login de um pedido
    get: adminProcedure
      .input(z.object({ registrationId: z.number().int() }))
      .query(async ({ input }) => {
        const { getDb } = await import('./db');
        const { orderLoginData } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) return null;
        const rows = await db.select().from(orderLoginData).where(eq(orderLoginData.registrationId, input.registrationId)).limit(1);
        return rows[0] ?? null;
      }),
    // Admin salva/atualiza dados de login
    save: adminProcedure
      .input(z.object({
        registrationId: z.number().int(),
        customerPhone: z.string(),
        loginPhone: z.string().optional(),
        loginEmail: z.string().optional(),
        loginPassword: z.string().optional(),
        authCode: z.string().optional(),
        emailLink: z.string().optional(),
        loginNotes: z.string().optional(),
        loginGroupLink: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { getDb } = await import('./db');
        const { orderLoginData, orderStatusHistory } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('Database unavailable');
        // Remover traços e espaços do código autenticador automaticamente
        const cleanAuthCode = input.authCode ? input.authCode.replace(/[-\s]/g, '') : null;
        // Buscar o customerPhone diretamente do histórico do pedido (evita bug de telefone alterado)
        const historyRow = await db.select({ customerPhone: orderStatusHistory.customerPhone })
          .from(orderStatusHistory)
          .where(eq(orderStatusHistory.registrationId, input.registrationId))
          .limit(1);
        const canonicalPhone = historyRow.length > 0 ? historyRow[0].customerPhone : input.customerPhone;
        const existing = await db.select({ id: orderLoginData.id }).from(orderLoginData).where(eq(orderLoginData.registrationId, input.registrationId)).limit(1);
        if (existing.length > 0) {
          await db.update(orderLoginData).set({
            customerPhone: canonicalPhone,
            loginPhone: input.loginPhone ?? null,
            loginEmail: input.loginEmail ?? null,
            loginPassword: input.loginPassword ?? null,
            authCode: cleanAuthCode,
            emailLink: input.emailLink ?? null,
            loginNotes: input.loginNotes ?? null,
            loginGroupLink: input.loginGroupLink ?? null,
          }).where(eq(orderLoginData.registrationId, input.registrationId));
        } else {
          await db.insert(orderLoginData).values({
            registrationId: input.registrationId,
            customerPhone: canonicalPhone,
            loginPhone: input.loginPhone ?? null,
            loginEmail: input.loginEmail ?? null,
            loginPassword: input.loginPassword ?? null,
            authCode: cleanAuthCode,
            emailLink: input.emailLink ?? null,
            loginNotes: input.loginNotes ?? null,
            loginGroupLink: input.loginGroupLink ?? null,
          });
        }
        return { success: true };
      }),
    // Cliente busca dados de login do seu pedido (sem autenticação admin)
    getForClient: publicProcedure
      .input(z.object({ registrationId: z.number().int(), customerPhone: z.string() }))
      .query(async ({ input }) => {
        const { getDb } = await import('./db');
        const { orderLoginData } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) return null;
        const rows = await db.select().from(orderLoginData).where(
          and(eq(orderLoginData.registrationId, input.registrationId), eq(orderLoginData.customerPhone, input.customerPhone))
        ).limit(1);
        if (!rows[0]) return null;
        const row = rows[0];
        // Tratar string "NULL" como null (dado legado)
        return {
          ...row,
          loginPhone: (row.loginPhone && row.loginPhone !== 'NULL' && row.loginPhone.trim() !== '') ? row.loginPhone : null,
          authCode: (row.authCode && row.authCode !== 'NULL' && row.authCode.trim() !== '') ? row.authCode : null,
          loginEmail: (row.loginEmail && row.loginEmail !== 'NULL' && row.loginEmail.trim() !== '') ? row.loginEmail : null,
          loginPassword: (row.loginPassword && row.loginPassword !== 'NULL' && row.loginPassword.trim() !== '') ? row.loginPassword : null,
          emailLink: (row.emailLink && row.emailLink !== 'NULL' && row.emailLink.trim() !== '') ? row.emailLink : null,
          loginNotes: (row.loginNotes && row.loginNotes !== 'NULL' && row.loginNotes.trim() !== '') ? row.loginNotes : null,
          loginGroupLink: (row.loginGroupLink && row.loginGroupLink !== 'NULL' && row.loginGroupLink.trim() !== '') ? row.loginGroupLink : null,
        };
      }),
  }),

  // === SENHA PERSONALIZADA DO CLIENTE (acompanhar pedido) ===
  customerPin: router({
    // Verifica a senha do cliente e retorna se é primeiro acesso
     check: publicProcedure
      .input(z.object({ phone: z.string(), pin: z.string().length(4) }))
      .mutation(async ({ input, ctx }) => {
        const clientIp = (ctx.req.headers['x-forwarded-for'] as string || '').split(',')[0].trim() || ctx.req.socket?.remoteAddress || 'unknown';
        // Verificar blocklist do admin (lista negra)
        const adminBlockResult = await checkPhoneBlockedAndBlockIp(input.phone, clientIp, 'verificar_pin');
        if (adminBlockResult.blocked) return { success: false, blocked: true, firstAccess: true, error: 'blocked' as const };
        const { getDb } = await import('./db');
        const { customerPins, pinBlocks } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) return { success: false, blocked: false, firstAccess: true, error: 'db' as const };
        const phone = input.phone.replace(/\D/g, '');
        // Verificar bloqueio por tentativas erradas
        const blockRows = await db.select().from(pinBlocks).where(eq(pinBlocks.phone, phone)).limit(1);
        const block = blockRows[0];
        if (block?.blocked) return { success: false, blocked: true, firstAccess: true, error: 'blocked' as const };;

        // Buscar senha personalizada
        const pinRows = await db.select().from(customerPins).where(eq(customerPins.phone, phone)).limit(1);
        const customerPinRow = pinRows[0];

        // Determinar senha correta
        const phonePin = phone.slice(-4);
        let correctPin: string;
        let isFirstAccess = true;

        if (customerPinRow && customerPinRow.firstAccess === 0 && customerPinRow.pin) {
          correctPin = customerPinRow.pin;
          isFirstAccess = false;
        } else {
          correctPin = phonePin;
          isFirstAccess = true;
        }

        const isCorrect = input.pin === correctPin;

        if (isCorrect) {
          if (block) await db.update(pinBlocks).set({ attempts: 0, blocked: 0 }).where(eq(pinBlocks.phone, phone));
          return { success: true, blocked: false, firstAccess: isFirstAccess, error: null };
        } else {
          const attempts = (block?.attempts ?? 0) + 1;
          const blocked = attempts >= 3 ? 1 : 0;
          if (block) {
            await db.update(pinBlocks).set({ attempts, blocked }).where(eq(pinBlocks.phone, phone));
          } else {
            await db.insert(pinBlocks).values({ phone, attempts, blocked });
          }
          return { success: false, blocked: blocked === 1, firstAccess: isFirstAccess, error: 'wrong' as const, attempts };
        }
      }),

    // Cliente cria sua senha pessoal (após primeiro acesso)
    setPin: publicProcedure
      .input(z.object({ phone: z.string(), newPin: z.string().length(4) }))
      .mutation(async ({ input, ctx }) => {
        const clientIp = (ctx.req.headers['x-forwarded-for'] as string || '').split(',')[0].trim() || ctx.req.socket?.remoteAddress || 'unknown';
        const adminBlockResult = await checkPhoneBlockedAndBlockIp(input.phone, clientIp, 'criar_senha');
        if (adminBlockResult.blocked) return { success: false };
        const { getDb } = await import('./db');
        const { customerPins } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) return { success: false };
        const phone = input.phone.replace(/\D/g, '');;
        const existing = await db.select().from(customerPins).where(eq(customerPins.phone, phone)).limit(1);
        if (existing.length > 0) {
          await db.update(customerPins).set({ pin: input.newPin, firstAccess: 0 }).where(eq(customerPins.phone, phone));
        } else {
          await db.insert(customerPins).values({ phone, pin: input.newPin, firstAccess: 0 });
        }
        return { success: true };
      }),

    // Admin busca o PIN atual do cliente
    adminGet: adminProcedure
      .input(z.object({ phone: z.string() }))
      .query(async ({ input }) => {
        const { getDb } = await import('./db');
        const { customerPins } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) return null;
        const phone = input.phone.replace(/\D/g, '');
        const rows = await db.select().from(customerPins).where(eq(customerPins.phone, phone)).limit(1);
        if (!rows[0]) return null;
        return { pin: rows[0].pin, firstAccess: rows[0].firstAccess };
      }),

    // Admin reseta senha e desbloqueia cliente (volta para primeiro acesso)
    adminReset: adminProcedure
      .input(z.object({ phone: z.string() }))
      .mutation(async ({ input }) => {
        const { getDb } = await import('./db');
        const { customerPins, pinBlocks } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) return { success: false };

        const phone = input.phone.replace(/\D/g, '');

        // Desbloquear
        const blockRows = await db.select().from(pinBlocks).where(eq(pinBlocks.phone, phone)).limit(1);
        if (blockRows.length > 0) {
          await db.update(pinBlocks).set({ attempts: 0, blocked: 0 }).where(eq(pinBlocks.phone, phone));
        }
        // Resetar senha (volta para primeiro acesso com PIN do telefone)
        const pinRows = await db.select().from(customerPins).where(eq(customerPins.phone, phone)).limit(1);
        if (pinRows.length > 0) {
          await db.update(customerPins).set({ pin: null, firstAccess: 1 }).where(eq(customerPins.phone, phone));
        }
        return { success: true };
      }),
    // Admin: definir PIN manualmente
    adminSet: adminProcedure
      .input(z.object({ phone: z.string(), pin: z.string().length(4) }))
      .mutation(async ({ input }) => {
        const { getDb } = await import('./db');
        const { customerPins } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) return { success: false };
        const phone = input.phone.replace(/\D/g, '');
        const existing = await db.select().from(customerPins).where(eq(customerPins.phone, phone)).limit(1);
        if (existing.length > 0) {
          await db.update(customerPins).set({ pin: input.pin, firstAccess: 0 }).where(eq(customerPins.phone, phone));
        } else {
          await db.insert(customerPins).values({ phone, pin: input.pin, firstAccess: 0 });
        }
        return { success: true };
      }),
  }),

  // === SOLICITAÍ"¡Í"¢ES DE DOCUMENTOS PENDENTES ===
  docRequests: router({
    // Admin: listar solicitações de um pedido
    listByRegistration: adminProcedure
      .input(z.object({ registrationId: z.number() }))
      .query(async ({ input }) => {
        return await getDocRequestsByRegistration(input.registrationId);
      }),

    // Admin: criar solicitação de documento
    create: adminProcedure
      .input(z.object({
        registrationId: z.number(),
        customerPhone: z.string(),
        message: z.string().min(1),
        docLabel: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const req = await createDocRequest({
          registrationId: input.registrationId,
          customerPhone: input.customerPhone,
          docLabel: input.docLabel || null,
          message: input.message,
          status: 'pending',
        });
        return { success: true, docRequest: req };
      }),

    // Admin: fechar/cancelar solicitação
    close: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await updateDocRequestStatus(input.id, 'closed');
        return { success: true };
      }),

    // Admin: excluir solicitação
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteDocRequest(input.id);
        return { success: true };
      }),

    // Público: cliente busca solicitações pendentes pelo telefone
    getPendingForClient: publicProcedure
      .input(z.object({ phone: z.string() }))
      .query(async ({ input }) => {
        const all = await getDocRequestsByPhone(input.phone);
        return all.filter(r => r.status === 'pending');
      }),

    // Público: cliente responde solicitação enviando arquivo (base64)
    answer: publicProcedure
      .input(z.object({
        docRequestId: z.number(),
        registrationId: z.number(),
        customerPhone: z.string(),
        label: z.string(),
        fileBase64: z.string(),
        mimeType: z.string(),
      }))
      .mutation(async ({ input }) => {
        const r = resolveFileExt(input.mimeType);
        const safeLabel = input.label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/gi, '');
        const randomSuffix = Math.random().toString(36).substring(2, 10);
        const fileKey = `doc-responses/${input.customerPhone}-${safeLabel}-${randomSuffix}.${r.ext}`;
        const { url } = await storagePut(fileKey, Buffer.from(input.fileBase64, 'base64'), r.contentType);
        await addOrderFile({
          registrationId: input.registrationId,
          customerPhone: input.customerPhone,
          label: `[Resposta] ${input.label}`,
          fileUrl: url,
          fileKey,
          mimeType: r.contentType,
          fromAdmin: 0,
        });
        // Marcar solicitação como respondida
        await updateDocRequestStatus(input.docRequestId, 'answered', undefined);
        // Notificar admin por e-mail
        const docNotifTitle = 'Í°Å¸""ž Documento respondido pelo cliente';
        try {
          const transporterDoc = nodemailer.createTransport({
            host: 'smtp.zoho.com',
            port: 465,
            secure: true,
            auth: { user: 'h2@h2colombiano.com', pass: process.env.SMTP_PASS || process.env.ZOHO_EMAIL_PASSWORD || '' },
          });
          await transporterDoc.sendMail({
            from: '"H2 COLOMBIANO" <h2@h2colombiano.com>',
            to: await getSetting('contact_email') || 'h2@h2colombiano.com',
            subject: docNotifTitle,
            html: `<h2>${docNotifTitle}</h2><p>Cliente: <strong>${input.customerPhone}</strong></p><p>Documento: <strong>${input.label}</strong></p><p><a href="${url}">Ver arquivo enviado</a></p>`,
          });
        } catch (e) { console.warn('[DocEmail] Erro ao enviar e-mail:', e); }
        return { success: true, fileUrl: url };
      }),
  }),

  config: router({
    get: publicProcedure.query(async () => {
      return await getAllSystemConfigs();
    }),
    set: adminProcedure
      .input(z.object({ key: z.string(), value: z.string() }))
      .mutation(async ({ input }) => {
        await setSystemConfig(input.key, input.value);
        return { ok: true };
      }),
  }),

  blocklist: router({
    list: adminProcedure
      .query(async () => {
        return getBlocklist();
      }),

    add: adminProcedure
      .input(z.object({
        type: z.enum(['name', 'phone', 'both']),
        name: z.string().optional(),
        phone: z.string().optional(),
        reason: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        if (input.type === 'name' && !input.name) throw new Error('Nome obrigatório');
        if (input.type === 'phone' && !input.phone) throw new Error('Telefone obrigatório');
        if (input.type === 'both' && (!input.name || !input.phone)) throw new Error('Nome e telefone obrigatórios');
        return addToBlocklist({
          type: input.type,
          name: input.name || null,
          phone: input.phone ? input.phone.replace(/\D/g, '') : null,
          reason: input.reason || null,
        });
      }),

    remove: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await removeFromBlocklist(input.id);
        return { success: true };
      }),

    check: publicProcedure
      .input(z.object({ name: z.string(), phone: z.string() }))
      .query(async ({ input }) => {
        return checkBlocklist(input.name, input.phone);
      }),
  }),

  // === OG SETTINGS (miniatura de compartilhamento) ===
  ogSettings: router({
    get: publicProcedure.query(async () => {
      const settings = await getSettings(['og_title', 'og_description', 'og_image_url']);
      return {
        title: settings['og_title'] ?? 'H2 COLOMBIANO',
        description: settings['og_description'] ?? 'Atendimento r\u00e1pido para motoristas de app - Uber, 99 e InDrive',
        imageUrl: settings['og_image_url'] ?? null,
      };
    }),
    update: adminProcedure
      .input(z.object({
        title: z.string().min(1).max(200),
        description: z.string().max(500),
        imageUrl: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const data: Record<string, string> = {
          og_title: input.title,
          og_description: input.description,
        };
        if (input.imageUrl !== undefined) {
          data.og_image_url = input.imageUrl;
        }
        await upsertSettings(data);
        return { success: true };
      }),
    uploadImage: adminProcedure
      .input(z.object({ imageBase64: z.string(), mimeType: z.string() }))
      .mutation(async ({ input }) => {
        const mime = input.mimeType || 'image/png';
        const ext = (mime.split('/')[1] || 'png').split('+')[0];
        const fileName = `og-image/og-image-${Date.now()}.${ext}`;
        const buffer = Buffer.from(input.imageBase64, 'base64');
        const { url } = await storagePut(fileName, buffer, mime);
        // Save storage URL — the /og-image proxy route serves it without redirect for WhatsApp
        // Also save a version timestamp to bust WhatsApp's og:image cache
        const imageVersion = String(Date.now());
        await upsertSettings({ og_image_url: url, og_image_version: imageVersion });
        // Bust the in-memory image cache so the new image is served immediately
        const { bustOgImageCache } = await import('./_core/vite');
        bustOgImageCache();
        return { success: true, url, imageVersion };
      }),
  }),

  // === IP BLOCKLIST ===
  ipBlocklist: router({
    list: adminProcedure.query(async () => {
      return await getIpBlocklist();
    }),
    logs: adminProcedure
      .input(z.object({ ip: z.string().optional(), limit: z.number().optional() }))
      .query(async ({ input }) => {
        if (input.ip) return await getIpAccessLogsByIp(input.ip);
        return await getIpAccessLogs(input.limit || 200);
      }),
    block: adminProcedure
      .input(z.object({ ip: z.string().min(1), reason: z.string().optional() }))
      .mutation(async ({ input }) => {
        await blockIp(input.ip, input.reason);
        return { success: true };
      }),
    unblock: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await unblockIp(input.id);
        return { success: true };
      }),
    check: adminProcedure
      .input(z.object({ ip: z.string() }))
      .query(async ({ input }) => {
        const blocked = await isIpBlocked(input.ip);
        return { blocked };
      }),
  }),

  // === TENTATIVAS DE ACESSO BLOQUEADO ===
  blockedAttempts: router({
    list: adminProcedure
      .input(z.object({ limit: z.number().optional() }))
      .query(async ({ input }) => {
        return await getBlockedAttempts(input.limit || 200);
      }),
    clear: adminProcedure
      .mutation(async () => {
        await clearBlockedAttempts();
        return { success: true };
      }),
  }),

  // === VPN / PROXY DETECTION ===
  vpn: router({
    // Admin: listar tentativas de acesso com VPN
    attempts: adminProcedure
      .input(z.object({ limit: z.number().optional() }))
      .query(async ({ input }) => {
        return await getVpnAttempts(input.limit || 200);
      }),
    // Público: verificar se o IP atual é VPN e registrar tentativa
    check: publicProcedure
      .input(z.object({
        ip: z.string().optional(),
        customerPhone: z.string().optional(),
        customerName: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const ip = input.ip || (ctx.req.headers['x-forwarded-for'] as string || '').split(',')[0].trim() || ctx.req.socket?.remoteAddress || 'unknown';
        if (!ip || ip === 'unknown') return { isVpn: false };
        const result = await checkVpnIp(ip);
        if (result.isVpn) {
          const ua = ctx.req.headers['user-agent'] || undefined;
          logVpnAttempt({
            ip,
            isp: result.isp,
            org: result.org,
            country: result.country,
            detectionType: result.detectionType || 'vpn',
            customerPhone: input.customerPhone,
            customerName: input.customerName,
            userAgent: ua,
          }).catch(() => {});
        }
        return { isVpn: result.isVpn, detectionType: result.detectionType };
      }),
  }),
  // === SORTEIO - SENHA EXCLUSIVA ===
  raffleAccess: router({
    // Público: verificar senha de acesso ao sorteio
    verify: publicProcedure
      .input(z.object({ password: z.string() }))
      .mutation(async ({ input }) => {
        const enabled = await getSetting('raffle_password_enabled');
        if (!enabled || enabled === '0') {
          return { success: true }; // Sem senha, acesso livre
        }
        const rafflePassword = await getSetting('raffle_password');
        if (!rafflePassword || rafflePassword.trim() === '') {
          return { success: true }; // Senha não configurada, acesso livre
        }
        if (input.password === rafflePassword.trim()) {
          return { success: true };
        }
        return { success: false, error: 'Senha incorreta' };
      }),
    // Público: verificar se sorteio tem senha ativa (para mostrar tela de senha)
    config: publicProcedure.query(async () => {
      const enabled = await getSetting('raffle_password_enabled');
      const title = await getSetting('raffle_page_title') || 'SORTEIO';
      const subtitle = await getSetting('raffle_page_subtitle') || 'Participe do nosso sorteio exclusivo!';
      return { passwordRequired: enabled === '1', title, subtitle };
    }),
    // Admin: obter configurações do sorteio
    getConfig: adminProcedure.query(async () => {
      const password = await getSetting('raffle_password') || '';
      const enabled = await getSetting('raffle_password_enabled') || '0';
      const title = await getSetting('raffle_page_title') || 'SORTEIO';
      const subtitle = await getSetting('raffle_page_subtitle') || 'Participe do nosso sorteio exclusivo!';
      return { password, enabled, title, subtitle };
    }),
    // Admin: salvar configurações do sorteio
    saveConfig: adminProcedure
      .input(z.object({
        password: z.string(),
        enabled: z.string(),
        title: z.string().optional(),
        subtitle: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        await upsertSettings({
          raffle_password: input.password,
          raffle_password_enabled: input.enabled,
          ...(input.title !== undefined ? { raffle_page_title: input.title } : {}),
          ...(input.subtitle !== undefined ? { raffle_page_subtitle: input.subtitle } : {}),
        });
        return { success: true };
      }),
  }),
  // === BROADCASTS ===
  broadcasts: router({
    list: adminProcedure.query(async () => await listBroadcasts()),

    create: adminProcedure
      .input(z.object({
        title: z.string().min(1),
        messageType: z.enum(['text', 'link', 'banner', 'group_invite', 'promo']),
        message: z.string().min(1),
        linkUrl: z.string().optional(),
        linkLabel: z.string().optional(),
        imageUrl: z.string().optional(),
        emailImageUrl: z.string().optional(),  // imagem para o e-mail (URL ou storage)
        emailImageName: z.string().optional(), // nome do arquivo para anexo
        targetType: z.enum(['all', 'selected']),
        targetPhones: z.array(z.string()).optional(),
      }))
      .mutation(async ({ input }) => {
        const broadcast = await createBroadcast({
          title: input.title,
          messageType: input.messageType,
          message: input.message,
          linkUrl: input.linkUrl || null,
          linkLabel: input.linkLabel || null,
          imageUrl: input.emailImageUrl || input.imageUrl || null, // salvar URL da imagem do e-mail
          targetType: input.targetType,
          targetPhones: input.targetPhones ? JSON.stringify(input.targetPhones) : null,
          status: 'draft',
        });
        return { success: true, broadcast };
      }),

    // Upload de imagem para usar no e-mail em massa
    uploadEmailImage: adminProcedure
      .input(z.object({ imageBase64: z.string(), mimeType: z.string(), fileName: z.string().optional() }))
      .mutation(async ({ input }) => {
        const mime = input.mimeType || 'image/jpeg';
        const ext = (mime.split('/')[1] || 'jpg').split('+')[0];
        const safeName = (input.fileName || `email-img-${Date.now()}`).replace(/[^a-zA-Z0-9_.-]/g, '_');
        const storageKey = `broadcasts/email-images/${safeName}.${ext}`;
        const buffer = Buffer.from(input.imageBase64, 'base64');
        const { url } = await storagePut(storageKey, buffer, mime);
        return { success: true, url, fileName: `${safeName}.${ext}` };
      }),

    send: adminProcedure
      .input(z.object({ id: z.number(), intervalSeconds: z.number().min(0).default(0) }))
      .mutation(async ({ input, ctx }) => {
        const allCustomers = await listCustomers();
        const broadcasts_list = await listBroadcasts();
        const broadcast = broadcasts_list.find(b => b.id === input.id);
        if (!broadcast) return { success: false, message: 'Broadcast não encontrado' };

                let recipients = allCustomers;
        if (broadcast.targetType === 'selected' && broadcast.targetPhones) {
          const phones: string[] = JSON.parse(broadcast.targetPhones);
          recipients = allCustomers.filter(c => phones.includes(c.phone));
        }
        // Filtrar clientes bloqueados — não recebem nenhuma comunicação
        recipients = recipients.filter(c => !(c as any).blocked || (c as any).blocked === 0);
        // Filtrar apenas clientes com e-mail
        const emailRecipients = recipients.filter(c => c.email && c.email.trim() !== '');
        const intervalSeconds = input.intervalSeconds ?? broadcast.sendIntervalSeconds ?? 0;

        // === MODO COM INTERVALO: usar fila + Heartbeat ===
        if (intervalSeconds > 0 && emailRecipients.length > 0) {
          // Salvar intervalo no broadcast
          const dbConn = await (await import('./db')).getDb();
          if (dbConn) {
            const { eq: eqOp } = await import('drizzle-orm');
            const { broadcasts: bTable } = await import('../drizzle/schema');
            await dbConn.update(bTable).set({ sendIntervalSeconds: intervalSeconds }).where(eqOp(bTable.id, input.id));
          }
          // Criar fila de envio
          await createBroadcastQueue(input.id, emailRecipients.map(c => ({ email: c.email!, phone: c.phone })));
          await markBroadcastSending(input.id, emailRecipients.length);
          // Criar Heartbeat com o intervalo definido
          const { createHeartbeatJob } = await import('./_core/heartbeat');
          const { parse: parseCk } = await import('cookie');
          const { COOKIE_NAME: CNAME } = await import('@shared/const');
          const sessionToken = parseCk(ctx.req.headers.cookie ?? '')[CNAME] ?? '';
          // Converter segundos para expressão cron (mínimo 60s = 1 minuto)
          const safeInterval = Math.max(60, intervalSeconds);
          const minutes = Math.ceil(safeInterval / 60);
          const cronExpr = `0 */${minutes} * * * *`;
          const job = await createHeartbeatJob({
            name: `broadcast-email-${input.id}-${Date.now()}`,
            cron: cronExpr,
            path: '/api/scheduled/broadcastEmail',
            payload: { broadcastId: input.id },
            description: `Envio em massa broadcast #${input.id} - intervalo ${intervalSeconds}s`,
          }, sessionToken);
          await updateBroadcastCronTaskUid(input.id, job.taskUid);
          return { success: true, mode: 'queued' as const, totalRecipients: recipients.length, emailRecipients: emailRecipients.length, intervalSeconds, taskUid: job.taskUid };
        }

        // === MODO IMEDIATO (intervalo = 0): envio direto ===
        let emailsSent = 0;
        let emailsFailed = 0;

                if (emailRecipients.length > 0) {
          const transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 465,
            secure: true,
            connectionTimeout: 15000,
            greetingTimeout: 15000,
            socketTimeout: 20000,
            auth: { user: 'h2@h2colombiano.com', pass: process.env.GMAIL_APP_PASSWORD || '' },
          });
          const typeLabel: Record<string, string> = {
            text: 'Mensagem', promo: '\uD83C\uDF89 Promoção', link: '\uD83D\uDD17 Link', banner: '\uD83D\uDDBC\uFE0F Banner', group_invite: '\uD83D\uDC65 Convite para Grupo'
          };
          const label = typeLabel[broadcast.messageType] || 'Mensagem';
          let extra = '';
          if (broadcast.linkUrl) {
            extra = `<div style="margin-top:16px;text-align:center">
              <a href="${broadcast.linkUrl}" style="background:#f59e0b;color:#000;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px">
                ${broadcast.linkLabel || 'Acessar agora'}
              </a></div>`;
          }

          // Imagem no e-mail: mostrar inline no corpo HTML
          let imageHtml = '';
          if (broadcast.imageUrl) {
            // Verificar se é URL do storage interno (/manus-storage/) ou URL externa
            const imgSrc = broadcast.imageUrl.startsWith('/manus-storage/')
              ? `https://h2colombiano.com${broadcast.imageUrl}`
              : broadcast.imageUrl;
            imageHtml = `<div style="margin-top:20px;text-align:center"><img src="${imgSrc}" alt="Imagem" style="max-width:100%;border-radius:10px;border:1px solid #333" /></div>`;
          }

          const html = `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0a0a1a;color:#fff;border-radius:12px;overflow:hidden">
              <div style="background:#1a1a2e;padding:24px;text-align:center">
                <h2 style="color:#f59e0b;margin:0;font-size:22px">${label}</h2>
              </div>
              <div style="padding:24px">
                <p style="font-size:16px;line-height:1.6;white-space:pre-wrap;color:#e5e7eb">${broadcast.message}</p>
                ${extra}
                ${imageHtml}
              </div>
              <div style="background:#1a1a2e;padding:16px;text-align:center">
                <p style="color:#6b7280;font-size:12px;margin:0">H2 COLOMBIANO — h2colombiano.com</p>
              </div>
            </div>`;

          const subject = broadcast.title || 'Mensagem da H2 COLOMBIANO';

          // Preparar anexo se imagem for do storage interno (pode ser baixada pelo servidor)
          // Para URLs externas, a imagem já está inline no HTML
          const attachments: { filename: string; path?: string; href?: string; contentType?: string }[] = [];
          if (broadcast.imageUrl) {
            const imgUrl = broadcast.imageUrl.startsWith('/manus-storage/')
              ? `https://h2colombiano.com${broadcast.imageUrl}`
              : broadcast.imageUrl;
            // Tentar baixar a imagem para anexar como arquivo
            try {
              const imgResp = await fetch(imgUrl);
              if (imgResp.ok) {
                const imgBuffer = Buffer.from(await imgResp.arrayBuffer());
                const contentType = imgResp.headers.get('content-type') || 'image/jpeg';
                const ext2 = contentType.includes('png') ? 'png' : contentType.includes('gif') ? 'gif' : contentType.includes('webp') ? 'webp' : 'jpg';
                attachments.push({
                  filename: `imagem.${ext2}`,
                  // @ts-ignore
                  content: imgBuffer,
                  contentType,
                });
              }
            } catch { /* Se não conseguir baixar, a imagem ainda aparece inline no HTML */ }
          }

          // Enviar em lotes de 10
          const BATCH_SIZE = 10;
          for (let i = 0; i < emailRecipients.length; i += BATCH_SIZE) {
            const batch = emailRecipients.slice(i, i + BATCH_SIZE);
            await Promise.allSettled(
              batch.map(async (c) => {
                try {
                  await transporter.sendMail({
                    from: '"H2 COLOMBIANO" <h2@h2colombiano.com>',
                    to: c.email!,
                    subject,
                    html,
                    ...(attachments.length > 0 ? { attachments } : {}),
                  });
                  emailsSent++;
                } catch {
                  emailsFailed++;
                }
              })
            );
            if (i + BATCH_SIZE < emailRecipients.length) {
              await new Promise(r => setTimeout(r, 500));
            }
          }
        }

        await markBroadcastSent(input.id, recipients.length);
        return { success: true, totalRecipients: recipients.length, emailsSent, emailsFailed, emailsSkipped: recipients.length - emailRecipients.length };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteBroadcast(input.id);
        return { success: true };
      }),

    // Listar clientes para seleção (excluir bloqueados)
    getCustomers: adminProcedure.query(async () => {
      const { getDb: getDbConn } = await import('./db');
      const dbConn = await getDbConn();
      const allCustomers = await listCustomers();
      const filtered = allCustomers.filter(c => !(c as any).blocked || (c as any).blocked === 0);
      // Buscar quais telefones têm pedido e qual é o último status
      const phonesWithOrders = new Set<string>();
      const phoneLastStatus = new Map<string, string>(); // phone digits -> last status key
      if (dbConn) {
        try {
          const { accessCodePhones: acp, orderStatusHistory: osh } = await import('../drizzle/schema');
          // 1. Via accessCodePhones consumed=1
          const rows1 = await dbConn.selectDistinct({ phone: acp.phone }).from(acp)
            .where(sql`${acp.consumed} = 1 AND ${acp.deletedAt} IS NULL`);
          rows1.forEach((r: { phone: string }) => phonesWithOrders.add(r.phone.replace(/\D/g, '')));
          // 2. Via orderStatusHistory (cobre pedidos manuais e outros fluxos) + último status
          const rows2 = await dbConn.select({ phone: osh.customerPhone, status: osh.status })
            .from(osh)
            .where(sql`${osh.customerPhone} IS NOT NULL AND ${osh.customerPhone} != ''`)
            .orderBy(sql`${osh.createdAt} DESC`);
          rows2.forEach((r: { phone: string; status: string }) => {
            const digits = r.phone.replace(/\D/g, '');
            phonesWithOrders.add(digits);
            // Guarda o status mais recente (primeiro encontrado por ser DESC)
            if (!phoneLastStatus.has(digits)) phoneLastStatus.set(digits, r.status);
          });
        } catch {}
      }
      return filtered.map(c => {
        const digits = c.phone.replace(/\D/g, '');
        return {
          id: c.id,
          name: c.name,
          phone: c.phone,
          hasOrder: phonesWithOrders.has(digits),
          lastOrderStatus: phoneLastStatus.get(digits) || null,
        };
      });
    }),
    // Listar tipos de status de pedido para filtros
    getOrderStatusTypes: adminProcedure.query(async () => {
      const { listOrderStatusTypes } = await import('./db');
      const types = await listOrderStatusTypes();
      return types.map(t => ({ key: t.key, label: t.label }));
    }),
  }),

  // Segurança: reportar tentativa de print/screenshot
  security: router({
    reportPrintAttempt: publicProcedure
      .input(z.object({
        phone: z.string().optional(),
        attempts: z.number(),
      }))
      .mutation(async ({ input, ctx }) => {
        const clientIp = (ctx.req.headers['x-forwarded-for'] as string || '').split(',')[0].trim() || ctx.req.socket?.remoteAddress || 'unknown';
        const phone = input.phone?.replace(/\D/g, '') || '';
        const attempts = input.attempts;
        // Registrar no log de tentativas bloqueadas
        if (phone) {
          await logBlockedAttempt(phone, `Tentativa de print/screenshot (#${attempts})`, clientIp, 'Captura de tela detectada').catch(() => {});
        }
        // Na 3Í‚ª tentativa: bloquear IP e número
        if (attempts >= 3) {
          if (clientIp && clientIp !== 'unknown') {
            await blockIp(clientIp, `Bloqueio automático: ${attempts} tentativas de print/screenshot`).catch(() => {});
          }
          if (phone) {
            await addToBlocklist({ type: 'phone', phone, reason: `Bloqueio automático: ${attempts} tentativas de print/screenshot` }).catch(() => {});
          }
          return { blocked: true };
        }
        return { blocked: false, attempts };
      }),

    // Registrar tentativa de inspeção (DevTools) detectada no frontend.
    // Não bloqueia IP/telefone (pode ser falso-positivo), apenas registra para auditoria.
    reportDevtools: publicProcedure
      .input(z.object({
        method: z.string().optional(),
        phone: z.string().optional(),
        userAgent: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const clientIp = (ctx.req.headers['x-forwarded-for'] as string || '').split(',')[0].trim() || ctx.req.socket?.remoteAddress || 'unknown';
        const phone = input.phone?.replace(/\D/g, '') || '';
        const method = (input.method || 'desconhecido').slice(0, 60);
        await logBlockedAttempt(
          phone || 'sem-telefone',
          `Tentativa de inspeção (DevTools: ${method})`,
          clientIp,
          'Ferramentas de desenvolvedor detectadas'
        ).catch(() => {});
        return { logged: true };
      }),
  }),

  // === CONTAS PIX ===
  pix: router({
    list: adminProcedure.query(async () => await listPixAccounts()),

    getActive: publicProcedure.query(async () => await getActivePixAccount()),

    create: adminProcedure
      .input(z.object({
        label: z.string().min(1),
        pixKey: z.string().min(1),
        pixType: z.string().min(1),
        pixName: z.string().min(1),
        pixBank: z.string().default(''),
      }))
      .mutation(async ({ input }) => {
        const account = await createPixAccount(input);
        return { success: true, account };
      }),

    update: adminProcedure
      .input(z.object({
        id: z.number(),
        label: z.string().optional(),
        pixKey: z.string().optional(),
        pixType: z.string().optional(),
        pixName: z.string().optional(),
        pixBank: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updatePixAccount(id, data);
        return { success: true };
      }),

    setActive: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await setActivePixAccount(input.id);
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deletePixAccount(input.id);
        return { success: true };
      }),

    generateQRCodeImage: publicProcedure
      .input(z.object({
        pixKey: z.string().min(1),
        pixName: z.string().min(1),
        amount: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        try {
          const QRCode = require('qrcode');
          const { storagePut } = await import('./storage');

          // Gerar payload PIX
          const sanitize = (str: string, maxLen: number) => str
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-zA-Z0-9 ]/g, '').substring(0, maxLen).trim();
          const emvField = (id: string, value: string) => { const len = String(value.length).padStart(2, '0'); return `${id}${len}${value}`; };

          let formattedKey = input.pixKey.trim();
          const isPhone = /(^|\+?55)?(\d{10,11})$/.test(formattedKey.replace(/[\s\-\(\)]/g, ''));
          const isCpf = /^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/.test(formattedKey);
          const isCnpj = /^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/.test(formattedKey);

          if (isPhone) {
            const digits = formattedKey.replace(/\D/g, '');
            formattedKey = digits.startsWith('55') && digits.length >= 12 ? '+' + digits : '+55' + digits;
          } else if (isCpf || isCnpj) {
            formattedKey = formattedKey.replace(/\D/g, '');
          }

          const pixKeyField = emvField('01', formattedKey);
          const gui = emvField('00', 'BR.GOV.BCB.PIX');
          const merchantAccountInfo = emvField('26', gui + pixKeyField);
          const merchantName = sanitize(input.pixName, 25);
          const merchantCity = sanitize('SAO PAULO', 15);

          let payload = '000201' + merchantAccountInfo + '52040000' + '5303986';
          if (input.amount) {
            const numericAmount = parseFloat(input.amount.replace(/[^0-9,]/g, '').replace(',', '.'));
            if (!Number.isNaN(numericAmount) && numericAmount > 0) {
              payload += emvField('54', numericAmount.toFixed(2));
            }
          }
          payload += '5802BR' + emvField('59', merchantName) + emvField('60', merchantCity) + emvField('62', emvField('05', '***'));
          payload += '6304';

          let crc = 0xFFFF;
          for (let i = 0; i < payload.length; i++) {
            crc ^= payload.charCodeAt(i) << 8;
            for (let j = 0; j < 8; j++) { crc = (crc & 0x8000) ? (crc << 1) ^ 0x1021 : crc << 1; }
            crc &= 0xFFFF;
          }
          const pixPayload = payload + crc.toString(16).toUpperCase().padStart(4, '0');

          // Gerar QR Code como PNG
          const qrBuffer = await QRCode.toBuffer(pixPayload, {
            errorCorrectionLevel: 'M',
            type: 'image/png',
            width: 300,
            margin: 1,
            color: { dark: '#1e1b4b', light: '#ffffff' },
          });

          // Salvar em S3
          const timestamp = Date.now();
          const fileKey = `pix-qrcodes/${timestamp}-qrcode.png`;
          const { url } = await storagePut(fileKey, qrBuffer, 'image/png');

          return { success: true, url, fileKey };
        } catch (err: any) {
          console.error('[PIX QR Code Generation Error]:', err);
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Falha ao gerar QR Code' });
        }
      }),
  }),

  // â"â‚¬â"â‚¬â"â‚¬ Controle Financeiro â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬
  financial: router({
    // Resumo financeiro (métricas)
    summary: adminProcedure
      .input(z.object({ startDate: z.number().optional(), endDate: z.number().optional() }))
      .query(async ({ input }) => {
        return await getFinancialSummary(input.startDate, input.endDate);
      }),

    // Listar vendas com filtros
    list: adminProcedure
      .input(z.object({
        status: z.string().optional(),
        startDate: z.number().optional(),
        endDate: z.number().optional(),
        search: z.string().optional(),
        limit: z.number().optional().default(100),
        offset: z.number().optional().default(0),
      }))
      .query(async ({ input }) => {
        return await listFinancialSales(input);
      }),

    // Fluxo de caixa agrupado
    cashFlow: adminProcedure
      .input(z.object({
        groupBy: z.enum(['day', 'week', 'month', 'year']).default('month'),
        startDate: z.number().optional(),
        endDate: z.number().optional(),
      }))
      .query(async ({ input }) => {
        return await getCashFlow(input.groupBy, input.startDate, input.endDate);
      }),

    // Criar venda manual
    create: adminProcedure
      .input(z.object({
        customerName: z.string(),
        customerPhone: z.string().optional().default(''),
        productName: z.string(),
        productOption: z.string().optional().default(''),
        saleValue: z.number(), // centavos
        costValue: z.number().optional().default(0),
        paymentMethod: z.string().optional().default('pix'),
        status: z.enum(['pendente', 'pago', 'cancelado']).optional().default('pendente'),
        saleDate: z.number().optional(),
        receivedDate: z.number().nullable().optional(),
        notes: z.string().nullable().optional(),
      }))
      .mutation(async ({ input }) => {
        const sale = await createFinancialSale({
          ...input,
          registrationId: null,
          saleDate: input.saleDate ?? Date.now(),
          receivedDate: input.receivedDate ?? null,
          notes: input.notes ?? null,
        });
        return { success: true, sale };
      }),

    // Atualizar venda
    update: adminProcedure
      .input(z.object({
        id: z.number(),
        customerName: z.string().optional(),
        customerPhone: z.string().optional(),
        productName: z.string().optional(),
        productOption: z.string().optional(),
        saleValue: z.number().optional(),
        costValue: z.number().optional(),
        paymentMethod: z.string().optional(),
        status: z.enum(['pendente', 'pago', 'cancelado']).optional(),
        saleDate: z.number().optional(),
        receivedDate: z.number().nullable().optional(),
        notes: z.string().nullable().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        // Se marcando como pago e não tem receivedDate, definir agora
        if (data.status === 'pago' && !data.receivedDate) {
          data.receivedDate = Date.now();
        }
        if (data.status === 'cancelado') {
          data.receivedDate = null;
        }
        await updateFinancialSale(id, data);
        return { success: true };
      }),

    // Deletar venda
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteFinancialSale(input.id);
        return { success: true };
      }),

    reset: adminProcedure
      .mutation(async () => {
        await resetFinancialData();
        return { success: true };
      }),
  }),

  // â"â‚¬â"â‚¬â"â‚¬ Links de Indicação por Cliente â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬
  referral: router({
    // Gerar novo link de indicação para um cliente (admin)
    generateLink: adminProcedure
      .input(z.object({
        customerId: z.number(),
        customerName: z.string(),
        commissionValue: z.number().min(0),
        commissionType: z.enum(['fixed', 'percent']),
        productId: z.number().nullable().optional(),
        productName: z.string().nullable().optional(),
      }))
      .mutation(async ({ input }) => {
        const link = await createReferralLink(input);
        return { success: true, link };
      }),

    // Listar links de um cliente (admin)
    listByCustomer: adminProcedure
      .input(z.object({ customerId: z.number() }))
      .query(async ({ input }) => {
        const links = await listReferralLinksByCustomer(input.customerId);
        const result = await Promise.all(links.map(async (link) => {
          const usages = await listReferralUsagesByLink(link.id);
          return { ...link, usages };
        }));
        return result;
      }),

    // Listar todos os links (admin)
    listAll: adminProcedure
      .query(async () => {
        const links = await listAllReferralLinks();
        const result = await Promise.all(links.map(async (link) => {
          const usages = await listReferralUsagesByLink(link.id);
          return { ...link, usages };
        }));
        return result;
      }),

    // Deletar link (admin)
    deleteLink: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteReferralLink(input.id);
        return { success: true };
      }),

    // Ativar/desativar link (admin)
    toggleLink: adminProcedure
      .input(z.object({ id: z.number(), active: z.boolean() }))
      .mutation(async ({ input }) => {
        await toggleReferralLink(input.id, input.active);
        return { success: true };
      }),

    // Marcar comissão como paga (admin)
    markCommissionPaid: adminProcedure
      .input(z.object({ usageId: z.number() }))
      .mutation(async ({ input }) => {
        await markReferralCommissionPaid(input.usageId);
        return { success: true };
      }),

    // Registrar uso de link de indicação (público) — chamado após cadastro bem-sucedido
    recordUsage: publicProcedure
      .input(z.object({
        code: z.string(),
        clientName: z.string(),
        clientPhone: z.string(),
        registrationId: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const link = await getReferralLinkByCode(input.code);
        if (!link || !link.active) return { success: false, reason: 'Código inválido ou inativo' };
        // Verificar se o telefone é novo (não pode ser cliente já cadastrado)
        const isNew = await isPhoneNewCustomer(input.clientPhone);
        // Permitir mesmo que não seja novo (pode ter acabado de se cadastrar)
        await recordReferralUsage({
          referralLinkId: link.id,
          registrationId: input.registrationId,
          clientName: input.clientName,
          clientPhone: input.clientPhone,
        });
        return { success: true, isNew };
      }),

    // Iniciar sessão de acesso por link de indicação (público)
    // Cria um registro em accessCodePhones com refCode e refExpiresAt = agora + 30min
    // Retorna um token de sessão para o frontend usar como "senha temporária"
    startRefSession: publicProcedure
      .input(z.object({
        code: z.string(),
        phone: z.string(),
      }))
      .mutation(async ({ input }) => {
        const db = await (await import('./db')).getDb();
        if (!db) return { success: false, reason: 'DB indisponível' };
        const link = await getReferralLinkByCode(input.code);
        if (!link || !link.active) return { success: false, reason: 'Código inválido ou inativo' };
        const phone = input.phone.replace(/\D/g, '');
        const now = Date.now();
        const expiresAt = now + 30 * 60 * 1000; // 30 minutos
        // Verificar se já existe uma sessão ativa para esse telefone com esse link
        const existing = await db.execute(
          sql.raw(`SELECT id, refExpiresAt FROM accessCodePhones WHERE REGEXP_REPLACE(phone,'[^0-9]','') = '${phone}' AND refCode = '${link.code}' ORDER BY accessedAt DESC LIMIT 1`)
        );
        const existingRows = (existing as any)[0] as any[];
        if (existingRows && existingRows.length > 0) {
          const row = existingRows[0];
          const exp = Number(row.refExpiresAt);
          if (exp > now) {
            // Sessão ainda válida
            return { success: true, expiresAt: exp, ownerName: link.customerName, sessionId: row.id };
          }
          // Sessão expirada — não criar nova, exigir senha
          return { success: false, reason: 'Sessão expirada', expired: true };
        }
        // Criar nova entrada em accessCodePhones com codeId = 0 (sem senha VIP)
        // Buscar ou criar um accessCode genérico para links de indicação
        let refCodeId = 0;
        try {
          const gcResult = await db.execute(sql.raw(`SELECT id FROM accessCodes WHERE type = 'referral_link' LIMIT 1`));
          const gcRows = (gcResult as any)[0] as any[];
          if (gcRows && gcRows.length > 0) {
            refCodeId = Number(gcRows[0].id);
          } else {
            // Criar um accessCode genérico para links de indicação
            await db.execute(sql.raw(`INSERT INTO accessCodes (clientName, type, status, maxUses, currentUses, timeOnly, createdAt) VALUES ('Link de Indicação', 'referral_link', 'active', 9999, 0, 1, NOW())`));
            const newGc = await db.execute(sql.raw(`SELECT id FROM accessCodes WHERE type = 'referral_link' LIMIT 1`));
            refCodeId = Number(((newGc as any)[0] as any[])[0]?.id || 0);
          }
        } catch (e) { /* usa 0 */ }
        await db.execute(sql.raw(
          `INSERT INTO accessCodePhones (codeId, phone, consumed, archived, orderSource, accessedAt, refCode, refExpiresAt, refOwnerName)
           VALUES (${refCodeId}, '${phone}', 0, 0, 'auto', NOW(), '${link.code}', ${expiresAt}, '${link.customerName.replace(/'/g, "''")}')`
        ));
        const newRow = await db.execute(sql.raw(`SELECT id FROM accessCodePhones WHERE REGEXP_REPLACE(phone,'[^0-9]','') = '${phone}' AND refCode = '${link.code}' ORDER BY accessedAt DESC LIMIT 1`));
        const sessionId = Number(((newRow as any)[0] as any[])[0]?.id || 0);
        return { success: true, expiresAt, ownerName: link.customerName, sessionId };
      }),

    // Verificar se sessão de link ainda é válida (público)
    checkRefSession: publicProcedure
      .input(z.object({ phone: z.string(), code: z.string() }))
      .query(async ({ input }) => {
        const db = await (await import('./db')).getDb();
        if (!db) return { valid: false };
        const phone = input.phone.replace(/\D/g, '');
        const now = Date.now();
        const result = await db.execute(
          sql.raw(`SELECT id, refExpiresAt, refOwnerName FROM accessCodePhones WHERE REGEXP_REPLACE(phone,'[^0-9]','') = '${phone}' AND refCode = '${input.code}' ORDER BY accessedAt DESC LIMIT 1`)
        );
        const rows = (result as any)[0] as any[];
        if (!rows || rows.length === 0) return { valid: false };
        const exp = Number(rows[0].refExpiresAt);
        if (exp > now) return { valid: true, expiresAt: exp, ownerName: rows[0].refOwnerName, sessionId: rows[0].id };
        return { valid: false, expired: true };
      }),

    // Validar código de indicação (público) — verifica se código existe e se telefone é novo
    validateCode: publicProcedure
      .input(z.object({ code: z.string(), phone: z.string().optional() }))
      .query(async ({ input }) => {
        const link = await getReferralLinkByCode(input.code);
        if (!link || !link.active) return { valid: false, reason: 'Código inválido ou inativo' };
        if (input.phone) {
          const isNew = await isPhoneNewCustomer(input.phone);
          if (!isNew) return { valid: false, reason: 'Este número já possui cadastro' };
        }
        return {
          valid: true,
          link: {
            id: link.id,
            code: link.code,
            customerName: link.customerName,
            commissionValue: link.commissionValue,
            commissionType: link.commissionType,
          },
        };
      }),
    // Adicionar indicação manual a um link (admin)
    addManualUsage: adminProcedure
      .input(z.object({
        linkId: z.number(),
        clientName: z.string().min(1),
        clientPhone: z.string().min(1),
      }))
      .mutation(async ({ input }) => {
        const cleanPhone = input.clientPhone.trim().replace(/\D/g, '');
        await recordReferralUsage({
          referralLinkId: input.linkId,
          registrationId: undefined,
          clientName: input.clientName.trim(),
          clientPhone: cleanPhone,
        });
        // Buscar o dono do link para pegar nome e telefone do indicador
        const db2 = await import('./db');
        const allLinks = await db2.listAllReferralLinks();
        const link = allLinks.find(l => l.id === input.linkId);
        if (link) {
          const allCustomers = await db2.listCustomers();
          const owner = allCustomers.find(c => c.id === link.customerId);
          if (owner) {
            // Atualizar o cadastro do cliente indicado com os dados do indicador
            const indicado = await db2.getCustomerByPhone(cleanPhone);
            if (indicado && !indicado.referredBy) {
              await db2.updateCustomer(indicado.id, {
                referredBy: owner.name,
                referredByPhone: owner.phone,
              });
            }
          }
        }
        return { success: true };
      }),
  }),

  // === FORMULÂRIO DINÂMICO - TELA DE ACOMPANHAMENTO ===
  trackingQuestions: router({
    // Admin: listar todas as perguntas
    list: adminProcedure.query(async () => {
      return await listTrackingQuestions();
    }),

    // Público: listar perguntas ativas (para o cliente responder)
    listActive: publicProcedure.query(async () => {
      return await listActiveTrackingQuestions();
    }),

    // Admin: criar nova pergunta
    create: adminProcedure
      .input(z.object({
        text: z.string().min(1).max(512),
        options: z.array(z.object({
          label: z.string().min(1),
          color: z.string().optional(),
          blocking: z.boolean().optional(),
        })).min(1),
        showOnce: z.boolean().optional(),
        sortOrder: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const q = await createTrackingQuestion({
          text: input.text,
          options: JSON.stringify(input.options),
          showOnce: input.showOnce ? 1 : 0,
          sortOrder: input.sortOrder ?? 0,
        });
        return { success: true, question: q };
      }),

    // Admin: editar pergunta
    update: adminProcedure
      .input(z.object({
        id: z.number(),
        text: z.string().min(1).max(512).optional(),
        options: z.array(z.object({
          label: z.string().min(1),
          color: z.string().optional(),
          blocking: z.boolean().optional(),
        })).optional(),
        showOnce: z.boolean().optional(),
        sortOrder: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const data: Record<string, unknown> = {};
        if (input.text !== undefined) data.text = input.text;
        if (input.options !== undefined) data.options = JSON.stringify(input.options);
        if (input.showOnce !== undefined) data.showOnce = input.showOnce ? 1 : 0;
        if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
        await updateTrackingQuestion(input.id, data as Parameters<typeof updateTrackingQuestion>[1]);
        return { success: true };
      }),

    // Admin: excluir pergunta
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteTrackingQuestion(input.id);
        return { success: true };
      }),

    // Admin: ativar/desativar pergunta
    toggle: adminProcedure
      .input(z.object({ id: z.number(), isActive: z.boolean() }))
      .mutation(async ({ input }) => {
        await toggleTrackingQuestion(input.id, input.isActive ? 1 : 0);
        return { success: true };
      }),

    // Público: salvar resposta do cliente
    saveAnswer: publicProcedure
      .input(z.object({
        orderId: z.number(),
        customerId: z.number().optional(),
        questionId: z.number(),
        questionText: z.string(),
        answer: z.string().min(1),
      }))
      .mutation(async ({ input }) => {
        await saveTrackingAnswer(input);
        return { success: true };
      }),

    // Público/Admin: buscar respostas de um pedido
    getAnswersByOrder: publicProcedure
      .input(z.object({ orderId: z.number() }))
      .query(async ({ input }) => {
        return await getTrackingAnswersByOrder(input.orderId);
      }),

    // Admin: enviar pergunta para um pedido específico
    assignToOrder: adminProcedure
      .input(z.object({
        orderId: z.number(),
        questionId: z.number(),
        questionText: z.string().min(1).max(512),
        questionOptions: z.string(),
      }))
      .mutation(async ({ input }) => {
        const assignment = await assignTrackingQuestion({
          orderId: input.orderId,
          questionId: input.questionId,
          questionText: input.questionText,
          questionOptions: input.questionOptions,
        });
        return { success: true, assignment };
      }),

    // Público/Admin: buscar perguntas enviadas para um pedido
    getAssignments: publicProcedure
      .input(z.object({ orderId: z.number() }))
      .query(async ({ input }) => {
        return await getAssignmentsByOrder(input.orderId);
      }),

    // Público: salvar resposta de uma pergunta enviada individualmente
    saveAssignmentAnswer: publicProcedure
      .input(z.object({
        orderId: z.number(),
        questionId: z.number(),
        answer: z.string().min(1),
      }))
      .mutation(async ({ input }) => {
        await saveAssignmentAnswer(input.orderId, input.questionId, input.answer);
        return { success: true };
      }),

    // Admin: remover pergunta enviada para um pedido
    deleteAssignment: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteAssignment(input.id);
        return { success: true };
      }),
  }),

  // === FOTO PROTEGIDA ===
  protectedPhotos: router({
    // Público: buscar todas as fotos ativas (em ordem)
    getActive: publicProcedure.query(async () => {
      const all = await listProtectedPhotos();
      return all.filter(p => p.isActive === 1);
    }),

    // Público: verificar se telefone tem acesso (número cadastrado) e registrar o acesso
    checkAccess: publicProcedure
      .input(z.object({ phone: z.string().min(1), photoId: z.number().optional() }))
      .query(async ({ input, ctx }) => {
        const hasAccess = await isPhoneRegistered(input.phone);
        if (hasAccess && input.photoId) {
          const ip = ctx.req.headers['x-forwarded-for']?.toString().split(',')[0] || ctx.req.socket?.remoteAddress || undefined;
          logPhotoAccess(input.phone, input.photoId, ip).catch(() => {});
        }
        return { hasAccess };
      }),

    // Público: registrar acesso (chamado após autenticação bem-sucedida)
    logAccess: publicProcedure
      .input(z.object({ phone: z.string().min(1), photoId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const ip = ctx.req.headers['x-forwarded-for']?.toString().split(',')[0] || ctx.req.socket?.remoteAddress || undefined;
        await logPhotoAccess(input.phone.replace(/\D/g, ''), input.photoId, ip).catch(() => {});
        return { success: true };
      }),

    // Admin: listar logs de acesso
    listAccessLogs: adminProcedure
      .input(z.object({ photoId: z.number().optional() }))
      .query(async ({ input }) => {
        return await listPhotoAccessLogs(input.photoId);
      }),

    // Admin: limpar logs de acesso
    clearAccessLogs: adminProcedure
      .input(z.object({ photoId: z.number() }))
      .mutation(async ({ input }) => {
        await clearPhotoAccessLogs(input.photoId);
        return { success: true };
      }),

    // Admin: listar todas as fotos
    list: adminProcedure.query(async () => {
      return await listProtectedPhotos();
    }),

    // Admin: fazer upload de foto protegida
    upload: adminProcedure
      .input(z.object({
        title: z.string().min(1).max(256),
        message: z.string().min(1),
        imageData: z.string().min(1), // base64
        mimeType: z.string().default('image/jpeg'),
      }))
      .mutation(async ({ input }) => {
        const buffer = Buffer.from(input.imageData, 'base64');
        const ext = input.mimeType.split('/')[1] || 'jpg';
        const key = `protected-photos/${Date.now()}.${ext}`;
        const { url } = await storagePut(key, buffer, input.mimeType);
        const photo = await createProtectedPhoto({
          title: input.title,
          message: input.message,
          imageUrl: url,
          imageKey: key,
        });
        return { success: true, photo };
      }),

    // Admin: ativar/desativar foto
    toggle: adminProcedure
      .input(z.object({ id: z.number(), isActive: z.boolean() }))
      .mutation(async ({ input }) => {
        await toggleProtectedPhoto(input.id, input.isActive ? 1 : 0);
        return { success: true };
      }),

    // Admin: deletar foto
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteProtectedPhoto(input.id);
        return { success: true };
      }),

    // Admin: reordenar fotos
    reorder: adminProcedure
      .input(z.object({ id: z.number(), direction: z.enum(['up', 'down']) }))
      .mutation(async ({ input }) => {
        await reorderProtectedPhoto(input.id, input.direction);
        return { success: true };
      }),

    // Admin: atualizar título e mensagem
    update: adminProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().min(1).max(256).optional(),
        message: z.string().min(1).optional(),
      }))
      .mutation(async ({ input }) => {
        const db = (await import('./db')).getDb;
        // Update inline
        const { eq: eqOp } = await import('drizzle-orm');
        const { protectedPhotos: tbl } = await import('../drizzle/schema');
        const dbConn = await db();
        if (dbConn && (input.title || input.message)) {
          const upd: Record<string, string> = {};
          if (input.title) upd.title = input.title;
          if (input.message) upd.message = input.message;
          await dbConn.update(tbl).set(upd).where(eqOp(tbl.id, input.id));
        }
        return { success: true };
      }),
  }),

  // === FAQ / CAIXA DE AJUDA ===
  faq: router({
    // Público: obter configuração e perguntas ativas
    getPublic: publicProcedure.query(async () => {
      const config = await getFaqConfig();
      const items = await listFaqItems();
      return {
        config: config ?? {
          id: 0, title: 'Tire suas dúvidas antes de finalizar seu pedido',
          subtitle: null, buttonLabel: 'Tire suas dúvidas',
          buttonColor: '#8b5cf6', buttonTextColor: '#ffffff',
          headerColor: '#1e1b4b', headerTextColor: '#ffffff',
          accentColor: '#8b5cf6', enabled: 1, updatedAt: new Date(),
        },
        items: items.filter(i => i.enabled === 1),
      };
    }),

    // Admin: obter tudo (incluindo desativados)
    getAdmin: adminProcedure.query(async () => {
      const config = await getFaqConfig();
      const items = await listFaqItems();
      return { config, items };
    }),

    // Admin: atualizar configuração
    updateConfig: adminProcedure
      .input(z.object({
        title: z.string().min(1).max(256).optional(),
        subtitle: z.string().max(512).nullable().optional(),
        buttonLabel: z.string().min(1).max(128).optional(),
        buttonColor: z.string().max(32).optional(),
        buttonTextColor: z.string().max(32).optional(),
        headerColor: z.string().max(32).optional(),
        headerTextColor: z.string().max(32).optional(),
        accentColor: z.string().max(32).optional(),
        enabled: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        await updateFaqConfig(input);
        return { success: true };
      }),

    // Admin: criar pergunta
    createItem: adminProcedure
      .input(z.object({
        question: z.string().min(1),
        answer: z.string().min(1),
        order: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const item = await createFaqItem(input.question, input.answer, input.order);
        return { success: true, item };
      }),

    // Admin: atualizar pergunta
    updateItem: adminProcedure
      .input(z.object({
        id: z.number(),
        question: z.string().min(1).optional(),
        answer: z.string().min(1).optional(),
        order: z.number().optional(),
        enabled: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updateFaqItem(id, data);
        return { success: true };
      }),

    // Admin: excluir pergunta
    deleteItem: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteFaqItem(input.id);
        return { success: true };
      }),

    // Admin: reordenar perguntas
    reorder: adminProcedure
      .input(z.object({ items: z.array(z.object({ id: z.number(), order: z.number() })) }))
      .mutation(async ({ input }) => {
        await reorderFaqItems(input.items);
        return { success: true };
      }),
  }),

  // ===================== PASTAS PERSONALIZADAS =====================
  folders: router({
    // Listar todas as pastas personalizadas (com contagem de pedidos)
    list: adminProcedure.query(async () => {
      const { getDb } = await import('./db');
      const { sql } = await import('drizzle-orm');
      const dbInst = await getDb();
      if (!dbInst) return [];
      const result = await dbInst.execute(sql`
        SELECT cf.id, cf.name, cf.icon, cf.color, cf.sortOrder, cf.hidden, cf.createdAt,
               COUNT(cfo.id) AS orderCount
        FROM customFolders cf
        LEFT JOIN customFolderOrders cfo ON cfo.folderId = cf.id
        GROUP BY cf.id, cf.name, cf.icon, cf.color, cf.sortOrder, cf.hidden, cf.createdAt
        ORDER BY cf.sortOrder ASC, cf.createdAt ASC
      `);
      const rows = (result as any)[0] as any[];
      return (rows || []).map((r: any) => ({ ...r, orderCount: Number(r.orderCount ?? 0) }));
    }),

    // Criar nova pasta
    create: adminProcedure
      .input(z.object({ name: z.string().min(1).max(128), icon: z.string().optional(), color: z.string().optional() }))
      .mutation(async ({ input }) => {
        const { getDb } = await import('./db');
        const { customFolders: customFoldersTable } = await import('../drizzle/schema');
        const dbInst = await getDb();
        if (!dbInst) throw new Error('DB not available');
        const [result] = await dbInst.insert(customFoldersTable).values({
          name: input.name,
          icon: input.icon ?? 'Í°Å¸"Â',
          color: input.color ?? '#8b5cf6',
          sortOrder: 0,
        });
        return { id: (result as any).insertId, name: input.name, icon: input.icon ?? 'Í°Å¸"Â', color: input.color ?? '#8b5cf6' };
      }),

    // Renomear/editar pasta
    update: adminProcedure
      .input(z.object({ id: z.number(), name: z.string().min(1).max(128).optional(), icon: z.string().optional(), color: z.string().optional() }))
      .mutation(async ({ input }) => {
        const { getDb } = await import('./db');
        const { customFolders: customFoldersTable } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        const dbInst = await getDb();
        if (!dbInst) throw new Error('DB not available');
        const { id, ...data } = input;
        await dbInst.update(customFoldersTable).set(data).where(eq(customFoldersTable.id, id));
        return { success: true };
      }),

    // Deletar pasta
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const { getDb } = await import('./db');
        const { customFolders: customFoldersTable, customFolderOrders: customFolderOrdersTable } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        const dbInst = await getDb();
        if (!dbInst) throw new Error('DB not available');
        await dbInst.delete(customFolderOrdersTable).where(eq(customFolderOrdersTable.folderId, input.id));
        await dbInst.delete(customFoldersTable).where(eq(customFoldersTable.id, input.id));
        return { success: true };
      }),

    // Mover pedido para pasta
    moveOrder: adminProcedure
      .input(z.object({ folderId: z.number(), registrationId: z.number(), subOrderIndex: z.number().default(0) }))
      .mutation(async ({ input }) => {
        const { getDb } = await import('./db');
        const { customFolderOrders: customFolderOrdersTable } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const dbInst = await getDb();
        if (!dbInst) throw new Error('DB not available');
        // Remove de qualquer outra pasta primeiro
        await dbInst.delete(customFolderOrdersTable).where(
          and(
            eq(customFolderOrdersTable.registrationId, input.registrationId),
            eq(customFolderOrdersTable.subOrderIndex, input.subOrderIndex)
          )
        );
        await dbInst.insert(customFolderOrdersTable).values({
          folderId: input.folderId,
          registrationId: input.registrationId,
          subOrderIndex: input.subOrderIndex,
        });
        return { success: true };
      }),

    // Remover pedido da pasta (volta para ativos)
    removeOrder: adminProcedure
      .input(z.object({ registrationId: z.number(), subOrderIndex: z.number().default(0) }))
      .mutation(async ({ input }) => {
        const { getDb } = await import('./db');
        const { customFolderOrders: customFolderOrdersTable } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const dbInst = await getDb();
        if (!dbInst) throw new Error('DB not available');
        await dbInst.delete(customFolderOrdersTable).where(
          and(
            eq(customFolderOrdersTable.registrationId, input.registrationId),
            eq(customFolderOrdersTable.subOrderIndex, input.subOrderIndex)
          )
        );
        return { success: true };
      }),

    // Listar pedidos de uma pasta
    listOrders: adminProcedure
      .input(z.object({ folderId: z.number() }))
      .query(async ({ input }) => {
        const { getDb } = await import('./db');
        const { sql } = await import('drizzle-orm');
        const dbInst = await getDb();
        if (!dbInst) return [];

        // Buscar os registrationIds desta pasta
        const folderOrdersResult = await dbInst.execute(
          sql.raw(`SELECT registrationId, subOrderIndex FROM customFolderOrders WHERE folderId = ${input.folderId}`)
        );
        const folderOrders = (folderOrdersResult as any)[0] as Array<{ registrationId: number; subOrderIndex: number }>;
        if (!folderOrders || folderOrders.length === 0) return [];

        const idsList = folderOrders.map((fo: any) => fo.registrationId).join(',');
        const subOrderMap = new Map(folderOrders.map((fo: any) => [fo.registrationId, fo.subOrderIndex]));

        // Buscar dados completos do cliente (mesma lógica do listOrders principal)
        const acpResult = await dbInst.execute(sql.raw(`
          SELECT
            acp.id,
            acp.codeId,
            acp.phone,
            UNIX_TIMESTAMP(acp.accessedAt) * 1000 AS accessedAt,
            acp.consumed,
            acp.orderSource,
            c.id as customerId,
            c.email as customerEmail,
            c.name as customerName,
            c.city as customerCity,
            c.uf as customerUf,
            c.profilePhotoUrl as profilePhotoUrl,
            c.customerNumber as customerNumber
          FROM accessCodePhones acp
          LEFT JOIN customers c ON REGEXP_REPLACE(c.phone, '[^0-9]', '') = REGEXP_REPLACE(acp.phone, '[^0-9]', '')
          WHERE acp.id IN (${idsList})
        `));
        const acpRows = (acpResult as any)[0] as any[];
        if (!acpRows || acpRows.length === 0) return [];

        // Buscar último status e dados do serviço para cada registrationId
        const histResult = await dbInst.execute(sql.raw(`
          SELECT h.registrationId, h.status, h.serviceName, h.serviceOption, h.orderNumber, h.answers,
                 UNIX_TIMESTAMP(h.createdAt) * 1000 AS latestStatusAt
          FROM orderStatusHistory h
          INNER JOIN (
            SELECT registrationId, MAX(createdAt) AS maxCreatedAt
            FROM orderStatusHistory
            WHERE registrationId IN (${idsList})
            GROUP BY registrationId
          ) latest ON h.registrationId = latest.registrationId AND h.createdAt = latest.maxCreatedAt
        `));
        const histRows = (histResult as any)[0] as any[];
        const histMap = new Map(histRows.map((h: any) => [Number(h.registrationId), h]));

        const results = acpRows.map((acp: any) => {
          const hist = histMap.get(Number(acp.id)) || {};
          const subOrderIndex = subOrderMap.get(Number(acp.id)) ?? 0;
          return {
            id: acp.id,
            registrationId: acp.id,
            customerPhone: acp.phone,
            customerName: acp.customerName || null,
            customerNumber: acp.customerNumber || null,
            city: acp.customerCity || null,
            uf: acp.customerUf || null,
            email: acp.customerEmail || null,
            profilePhotoUrl: acp.profilePhotoUrl || null,
            serviceName: hist.serviceName || null,
            serviceOption: hist.serviceOption || null,
            orderNumber: hist.orderNumber || null,
            answers: hist.answers || null,
            latestStatus: hist.status || null,
            latestStatusAt: hist.latestStatusAt || acp.accessedAt,
            accessedAt: acp.accessedAt,
            note: null,
            subOrderIndex,
            folderId: input.folderId,
          };
        });
        return results;
      }),
  }),

  // ===================== CONFIGURAÍ"¡ÍÆ’O DAS PASTAS FIXAS =====================
  folderConfig: router({
    // Buscar configurações de todas as pastas fixas
    getAll: adminProcedure.query(async () => {
      const { getDb } = await import('./db');
      const { folderConfig: folderConfigTable } = await import('../drizzle/schema');
      const { asc } = await import('drizzle-orm');
      const dbInst = await getDb();
      if (!dbInst) return {};
      const rows = await dbInst.select().from(folderConfigTable).orderBy(asc(folderConfigTable.tabOrder));
      const result: Record<string, { id: number; name: string; icon: string; color: string; tabOrder: number; hidden: number }> = {};
      for (const row of rows) {
        result[row.folderKey] = { id: row.id, name: row.name, icon: row.icon ?? 'Í°Å¸"Â', color: row.color ?? '#8b5cf6', tabOrder: row.tabOrder, hidden: row.hidden ?? 0 };
      }
      return result;
    }),

    // Salvar configuração de uma pasta fixa
    save: adminProcedure
      .input(z.object({ folderKey: z.enum(['entregues', 'arquivo', 'rgcnh']), name: z.string().min(1).max(128), icon: z.string().optional(), color: z.string().optional() }))
      .mutation(async ({ input }) => {
        const { getDb } = await import('./db');
        const { folderConfig: folderConfigTable } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        const dbInst = await getDb();
        if (!dbInst) throw new Error('DB not available');
        await dbInst.update(folderConfigTable)
          .set({ name: input.name, icon: input.icon ?? 'Í°Å¸"Â', color: input.color ?? '#8b5cf6' })
          .where(eq(folderConfigTable.folderKey, input.folderKey));
        return { success: true };
      }),

    // Ocultar/mostrar pasta fixa
    toggleHiddenFixed: adminProcedure
      .input(z.object({ folderKey: z.enum(['entregues', 'arquivo', 'rgcnh', 'perguntas']), hidden: z.boolean() }))
      .mutation(async ({ input }) => {
        const { getDb } = await import('./db');
        const { folderConfig: folderConfigTable } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        const dbInst = await getDb();
        if (!dbInst) throw new Error('DB not available');
        await dbInst.update(folderConfigTable)
          .set({ hidden: input.hidden ? 1 : 0 })
          .where(eq(folderConfigTable.folderKey, input.folderKey));
        return { success: true };
      }),

    // Ocultar/mostrar pasta personalizada
    toggleHiddenCustom: adminProcedure
      .input(z.object({ id: z.number(), hidden: z.boolean() }))
      .mutation(async ({ input }) => {
        const { getDb } = await import('./db');
        const { customFolders: customFoldersTable } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        const dbInst = await getDb();
        if (!dbInst) throw new Error('DB not available');
        await dbInst.update(customFoldersTable)
          .set({ hidden: input.hidden ? 1 : 0 })
          .where(eq(customFoldersTable.id, input.id));
        return { success: true };
      }),

    // Reordenar abas (fixas + personalizadas)
    reorderTabs: adminProcedure
      .input(z.object({
        fixedOrder: z.array(z.object({ folderKey: z.string(), tabOrder: z.number() })),
        customOrder: z.array(z.object({ id: z.number(), sortOrder: z.number() })),
      }))
      .mutation(async ({ input }) => {
        const { getDb } = await import('./db');
        const { folderConfig: folderConfigTable, customFolders: customFoldersTable } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        const dbInst = await getDb();
        if (!dbInst) throw new Error('DB not available');
        for (const item of input.fixedOrder) {
          await dbInst.update(folderConfigTable)
            .set({ tabOrder: item.tabOrder })
            .where(eq(folderConfigTable.folderKey, item.folderKey));
        }
        for (const item of input.customOrder) {
          await dbInst.update(customFoldersTable)
            .set({ sortOrder: item.sortOrder })
            .where(eq(customFoldersTable.id, item.id));
        }
        return { success: true };
      }),
  }),

  // â"â‚¬â"â‚¬â"â‚¬ ETAPAS INTERNAS â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬â"â‚¬
  stages: router({
    list: adminProcedure.query(async () => {
      return await listInternalStages();
    }),
    create: adminProcedure
      .input(z.object({ name: z.string().min(1), icon: z.string().min(1), color: z.string().min(1) }))
      .mutation(async ({ input }) => {
        const stage = await createInternalStage(input);
        return { success: true, stage };
      }),
    update: adminProcedure
      .input(z.object({ id: z.number(), name: z.string().optional(), icon: z.string().optional(), color: z.string().optional() }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updateInternalStage(id, data);
        return { success: true };
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteInternalStage(input.id);
        return { success: true };
      }),
    reorder: adminProcedure
      .input(z.array(z.object({ id: z.number(), sortOrder: z.number() })))
      .mutation(async ({ input }) => {
        await reorderInternalStages(input);
        return { success: true };
      }),
    setOrderStage: adminProcedure
      .input(z.object({ registrationId: z.number(), stageId: z.number() }))
      .mutation(async ({ input }) => {
        await setOrderStage(input.registrationId, input.stageId);
        return { success: true };
      }),
    getOrderStage: adminProcedure
      .input(z.object({ registrationId: z.number() }))
      .query(async ({ input }) => {
        return await getOrderCurrentStage(input.registrationId);
      }),
    getOrderStagesBatch: adminProcedure
      .input(z.object({ registrationIds: z.array(z.number()) }))
      .query(async ({ input }) => {
        const map = await getOrderCurrentStagesBatch(input.registrationIds);
        // Converter Map para array de objetos para serialização
        return Array.from(map.entries()).map(([registrationId, data]) => ({ registrationId, ...data }));
      }),
  }),

  viewedOrders: router({
    list: adminProcedure.query(async () => {
      return await getViewedOrderKeys();
    }),
    markViewed: adminProcedure
      .input(z.object({ orderKey: z.string().min(1) }))
      .mutation(async ({ input }) => {
        await markOrderAsViewed(input.orderKey);
        return { success: true };
      }),
  }),

  // Botões extras da tela inicial do cliente (antes do login) — gerenciáveis pelo admin
  homeButtons: router({
    // Público: lista apenas os botões ativos, em ordem (usado no WelcomeScreen)
    listPublic: publicProcedure.query(async () => await listActiveHomeButtons()),
    // Admin: lista todos (ativos e inativos)
    list: adminProcedure.query(async () => await listHomeButtons()),
    create: adminProcedure
      .input(z.object({
        text: z.string().min(1),
        subtitle: z.string().optional(),
        url: z.string().min(1),
        waMsg: z.string().nullish(),
        icon: z.string().optional(),
        color: z.string().optional(),
        textColor: z.string().optional(),
        subColor: z.string().optional(),
        font: z.string().optional(),
        hover: z.string().optional(),
        linkType: z.string().optional(),
        openInNewTab: z.number().optional(),
        vipOnly: z.number().optional(),
        isActive: z.number().optional(),
      }))
      .mutation(async ({ input }) => await createHomeButton(input)),
    update: adminProcedure
      .input(z.object({
        id: z.number(),
        data: z.object({
          text: z.string().optional(),
          subtitle: z.string().optional(),
          url: z.string().optional(),
          waMsg: z.string().nullish(),
          icon: z.string().optional(),
          color: z.string().optional(),
          textColor: z.string().optional(),
          subColor: z.string().optional(),
          font: z.string().optional(),
          hover: z.string().optional(),
          linkType: z.string().optional(),
          openInNewTab: z.number().optional(),
          vipOnly: z.number().optional(),
          isActive: z.number().optional(),
          sortOrder: z.number().optional(),
        }),
      }))
      .mutation(async ({ input }) => {
        await updateHomeButton(input.id, input.data);
        return { success: true };
      }),
    toggle: adminProcedure
      .input(z.object({ id: z.number(), isActive: z.boolean() }))
      .mutation(async ({ input }) => {
        await updateHomeButton(input.id, { isActive: input.isActive ? 1 : 0 });
        return { success: true };
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteHomeButton(input.id);
        return { success: true };
      }),
    reorder: adminProcedure
      .input(z.object({ ids: z.array(z.number()) }))
      .mutation(async ({ input }) => {
        await reorderHomeButtons(input.ids);
        return { success: true };
      }),
  }),

  // === REFERRER BYPASS CODES ===
  referrerBypass: router({
    generate: adminProcedure
      .input(z.object({ expiresInDays: z.number().min(1).max(365).default(30) }))
      .mutation(async ({ input, ctx }) => {
        const { generateBypassCode } = await import('./db');
        const code = await generateBypassCode(
          ctx.user?.id || 1,
          new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
        );
        return { success: true, code };
      }),

    list: adminProcedure.query(async () => {
      const { getBypassCodes } = await import('./db');
      return await getBypassCodes();
    }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const { deleteBypassCode } = await import('./db');
        await deleteBypassCode(input.id);
        return { success: true };
      }),

    validate: publicProcedure
      .input(z.object({ code: z.string().min(1) }))
      .query(async ({ input }) => {
        const { validateBypassCode } = await import('./db');
        return await validateBypassCode(input.code);
      }),
  }),

  // Retorna URL assinada do vídeo tutorial (para streaming direto sem proxy)
  video: router({
    getTutorialUrl: publicProcedure.query(async () => {
      const { ENV } = await import('./_core/env');
      const forgeUrl = new URL(
        'v1/storage/presign/get',
        ENV.forgeApiUrl.replace(/\/+$/, '') + '/'
      );
      forgeUrl.searchParams.set('path', 'tutorial_27dcff60.mp4');
      const resp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
      });
      if (!resp.ok) throw new Error('Failed to get video URL');
      const { url } = await resp.json() as { url: string };
      return { url };
    }),
  }),

  // Rastreamento de Indicacoes
  referrals: router({
    getStats: adminProcedure
      .input(z.object({ phone: z.string() }))
      .query(async ({ input }) => {
        const { getReferralStats } = await import('./db');
        return await getReferralStats(input.phone);
      }),

    listAll: adminProcedure.query(async () => {
      const { listAllReferralStats } = await import('./db');
      return await listAllReferralStats();
    }),

    getHistory: adminProcedure
      .input(z.object({ phone: z.string() }))
      .query(async ({ input }) => {
        const { getReferralHistory } = await import('./db');
        return await getReferralHistory(input.phone);
      }),

    getChain: adminProcedure
      .input(z.object({ phone: z.string(), depth: z.number().default(5) }))
      .query(async ({ input }) => {
        const { getReferralChain } = await import('./db');
        return await getReferralChain(input.phone, input.depth);
      }),

    getIndicated: adminProcedure
      .input(z.object({ phone: z.string() }))
      .query(async ({ input }) => {
        const { getIndicatedByReferrer } = await import('./db');
        return await getIndicatedByReferrer(input.phone);
      }),

    getReferred: publicProcedure
      .input(z.object({ referrerPhone: z.string() }))
      .query(async ({ input }) => {
        const { getIndicatedByReferrer } = await import('./db');
        return await getIndicatedByReferrer(input.referrerPhone);
      }),

    getReferralChain: publicProcedure
      .input(z.object({ phone: z.string(), depth: z.number().default(5) }))
      .query(async ({ input }) => {
        const { getReferralChain } = await import('./db');
        return await getReferralChain(input.phone, input.depth);
      }),

    createReport: publicProcedure
      .input(z.object({
        reporterPhone: z.string(),
        reportedCustomerId: z.number(),
        reportedPhone: z.string(),
        reportedName: z.string(),
        reason: z.string(),
      }))
      .mutation(async ({ input }) => {
        const { createReferralReport } = await import('./db');
        return await createReferralReport(input);
      }),

    deleteIndicated: publicProcedure
      .input(z.object({
        referredCustomerId: z.number(),
      }))
      .mutation(async ({ input }) => {
        const { deleteReferralHistory } = await import('./db');
        return await deleteReferralHistory(input.referredCustomerId);
      }),
  }),

  // ===== GRUPOS CUSTOMIZADOS DE PEDIDOS =====
  orderGroups: router({
    list: publicProcedure.query(async () => {
      const { getDb } = await import('./db');
      const { orderCustomGroups, orderCustomGroupMembers } = await import('../drizzle/schema');
      const db = await getDb() as any;
      if (!db) return [];
      const groups = await db.select().from(orderCustomGroups).orderBy(orderCustomGroups.position);
      const members = await db.select().from(orderCustomGroupMembers);
      return groups.map((g: any) => ({
        ...g,
        memberIds: members.filter((m: any) => m.groupId === g.id).map((m: any) => m.registrationId),
      }));
    }),

    create: publicProcedure
      .input(z.object({
        name: z.string().min(1).max(100),
        color: z.string().default('red'),
        icon: z.string().default('Í°Å¸""“'),
      }))
      .mutation(async ({ input }) => {
        const { getDb } = await import('./db');
        const { orderCustomGroups } = await import('../drizzle/schema');
        const db = await getDb() as any;
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB indisponível' });
        const existing = await db.select().from(orderCustomGroups);
        const position = existing.length;
        await db.insert(orderCustomGroups).values({ name: input.name, color: input.color, icon: input.icon, position });
        const created = await db.select().from(orderCustomGroups).orderBy(orderCustomGroups.id);
        return created[created.length - 1];
      }),

    update: publicProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).max(100).optional(),
        color: z.string().optional(),
        icon: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { getDb } = await import('./db');
        const { orderCustomGroups } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        const db = await getDb() as any;
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB indisponível' });
        const updates: any = {};
        if (input.name !== undefined) updates.name = input.name;
        if (input.color !== undefined) updates.color = input.color;
        if (input.icon !== undefined) updates.icon = input.icon;
        await db.update(orderCustomGroups).set(updates).where(eq(orderCustomGroups.id, input.id));
        return { success: true };
      }),

    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const { getDb } = await import('./db');
        const { orderCustomGroups } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        const db = await getDb() as any;
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB indisponível' });
        await db.delete(orderCustomGroups).where(eq(orderCustomGroups.id, input.id));
        return { success: true };
      }),

    addMember: publicProcedure
      .input(z.object({ groupId: z.number(), registrationId: z.number() }))
      .mutation(async ({ input }) => {
        const { getDb } = await import('./db');
        const { orderCustomGroupMembers } = await import('../drizzle/schema');
        const { and, eq } = await import('drizzle-orm');
        const db = await getDb() as any;
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB indisponível' });
        const existing = await db.select().from(orderCustomGroupMembers)
          .where(and(eq(orderCustomGroupMembers.groupId, input.groupId), eq(orderCustomGroupMembers.registrationId, input.registrationId)));
        if (existing.length > 0) return { success: true };
        await db.insert(orderCustomGroupMembers).values({ groupId: input.groupId, registrationId: input.registrationId });
        return { success: true };
      }),

    removeMember: publicProcedure
      .input(z.object({ groupId: z.number(), registrationId: z.number() }))
      .mutation(async ({ input }) => {
        const { getDb } = await import('./db');
        const { orderCustomGroupMembers } = await import('../drizzle/schema');
        const { and, eq } = await import('drizzle-orm');
        const db = await getDb() as any;
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB indisponível' });
        await db.delete(orderCustomGroupMembers)
          .where(and(eq(orderCustomGroupMembers.groupId, input.groupId), eq(orderCustomGroupMembers.registrationId, input.registrationId)));
        return { success: true };
      }),

    // Reordenar grupos: recebe array de IDs na nova ordem desejada
    reorder: publicProcedure
      .input(z.object({ orderedIds: z.array(z.number()) }))
      .mutation(async ({ input }) => {
        const { getDb } = await import('./db');
        const { orderCustomGroups } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        const db = await getDb() as any;
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB indisponível' });
        // Atualiza o campo position de cada grupo conforme a nova ordem
        for (let i = 0; i < input.orderedIds.length; i++) {
          await db.update(orderCustomGroups)
            .set({ position: i })
            .where(eq(orderCustomGroups.id, input.orderedIds[i]));
        }
        return { success: true };
      }),
  }),

  featureCards: router({
    // Listar todos os cards (público - para a página inicial)
    list: publicProcedure.query(async () => {
      const { featureCards } = await import('../drizzle/schema');
      const { asc } = await import('drizzle-orm');
      const { getDb } = await import('./db');
      const db = await getDb() as any;
      if (!db) return [];
      return db.select().from(featureCards).orderBy(asc(featureCards.sortOrder), asc(featureCards.id));
    }),
    // Criar novo card
    create: adminProcedure
      .input(z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        logoUrl: z.string().optional(),
        buttonText: z.string().default('ACESSAR'),
        buttonLink: z.string().optional(),
        bgColor: z.string().default('#6d28d9'),
        buttonColor: z.string().default('#7c3aed'),
        titleColor: z.string().default('#ffffff'),
        descColor: z.string().default('#e9d5ff'),
        isActive: z.number().default(1),
        sortOrder: z.number().default(0),
        openInNewTab: z.number().default(0),
      }))
      .mutation(async ({ input }) => {
        const { featureCards } = await import('../drizzle/schema');
        const { getDb } = await import('./db');
        const { sql } = await import('drizzle-orm');
        const db = await getDb() as any;
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB indisponível' });
        // Atribui sortOrder automaticamente como próximo número na sequência
        const maxResult = await db.execute(sql`SELECT COALESCE(MAX(sortOrder), -1) + 1 AS nextOrder FROM featureCards`);
        const nextOrder = maxResult?.[0]?.[0]?.nextOrder ?? 0;
        const result = await db.insert(featureCards).values({ ...input, sortOrder: nextOrder });
        return { success: true, id: result[0]?.insertId };
      }),
    // Atualizar card existente
    update: adminProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().min(1).optional(),
        description: z.string().optional(),
        logoUrl: z.string().optional(),
        buttonText: z.string().optional(),
        buttonLink: z.string().optional(),
        bgColor: z.string().optional(),
        buttonColor: z.string().optional(),
        titleColor: z.string().optional(),
        descColor: z.string().optional(),
        isActive: z.number().optional(),
        sortOrder: z.number().optional(),
        openInNewTab: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const { featureCards } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        const { getDb } = await import('./db');
        const db = await getDb() as any;
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB indisponível' });
        const { id, ...data } = input;
        await db.update(featureCards).set(data).where(eq(featureCards.id, id));
        return { success: true };
      }),
    // Deletar card
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const { featureCards } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        const { getDb } = await import('./db');
        const db = await getDb() as any;
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB indisponível' });
        await db.delete(featureCards).where(eq(featureCards.id, input.id));
        return { success: true };
      }),
  }),
  media: router({
    // Upload de foto ou vídeo pelo admin — retorna URL pública hospedada no Manus
    upload: adminProcedure
      .input(z.object({
        fileBase64: z.string(),
        mimeType: z.string(),
        fileName: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const r = resolveFileExt(input.mimeType);
        const randomSuffix = Math.random().toString(36).substring(2, 10);
        const baseName = (input.fileName || 'media').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/gi, '') || 'media';
        const fileKey = `admin-media/${baseName}-${randomSuffix}.${r.ext}`;
        const { url } = await storagePut(fileKey, Buffer.from(input.fileBase64, 'base64'), r.contentType);
        // url já é a URL completa (CloudFront ou /manus-storage/)
        // Para uso no site (campo de vídeo/imagem), usar a url diretamente
        return { success: true, url, absoluteUrl: url, fileKey };
      }),
  }),

  // === ZOHO MAIL - GERENCIAMENTO DE EMAILS ===
  email: router({
    list: adminProcedure.query(async () => {
      const grouped = await listAllZohoUsersGrouped(200);
      const { listEmailAccounts } = await import('../server/db');
      const accountTypes = await listEmailAccounts();
      const typeMap = Object.fromEntries(accountTypes.map((a: any) => [a.emailAddress, a.type]));
      return grouped.map(group => ({
        serverId: group.serverId,
        serverName: group.serverName,
        domain: (group as any).domain || 'h2colombiano.com',
        users: group.users.map(user => ({
          ...user,
          type: typeMap[user.primaryEmailAddress] || 'membro',
        })),
      }));
    }),

    create: adminProcedure
      .input(z.object({
        username: z.string().min(2).max(50).regex(/^[a-z0-9._-]+$/i, 'Apenas letras, números, ponto, traço e sublinhado'),
        displayName: z.string().min(2).max(100),
        password: z.string().min(8),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        type: z.enum(['principal', 'membro']).default('membro'),
        serverId: z.number().optional(), // ID do servidor específico onde criar
      }))
      .mutation(async ({ input }) => {
        try {
        // Determinar o domínio correto baseado no servidor selecionado
        let emailDomain = 'h2colombiano.com';
        if (input.serverId) {
          const { listZohoOAuthConfigs: getConfigs } = await import('../server/db');
          const allCfgs = await getConfigs();
          const cfg = allCfgs.find((c: any) => Number(c.id) === Number(input.serverId));
          if (cfg?.domain) emailDomain = cfg.domain;
        }
        const primaryEmailAddress = `${input.username.toLowerCase()}@${emailDomain}`;
        
        // Se serverId especificado, usar esse servidor; senão distribuição automática
        let user;
        if (input.serverId) {
          const { listZohoOAuthConfigs } = await import('../server/db');
          const allConfigs = await listZohoOAuthConfigs();
          // Usar Number() para garantir comparação correta mesmo com BigInt do banco
          const config = allConfigs.find((c: any) => Number(c.id) === Number(input.serverId));
          if (!config) throw new Error(`Servidor não encontrado (id=${input.serverId}, disponíveis: ${allConfigs.map((c:any)=>c.id).join(',')})`);
          if (Number(config.isActive) !== 1) throw new Error(`Servidor ${config.name} não está ativo (isActive=${config.isActive})`);
          const existingUsers = await listZohoUsersForConfig(config, 10);
          if (existingUsers.length >= 5) throw new Error(`Servidor ${config.name} está lotado (5/5 contas). Escolha outro servidor.`);
          user = await createZohoUserInConfig(config, {
            primaryEmailAddress,
            displayName: input.displayName,
            password: input.password,
            firstName: input.firstName,
            lastName: input.lastName,
          });
        } else {
          user = await createZohoUser({
            primaryEmailAddress,
            displayName: input.displayName,
            password: input.password,
            firstName: input.firstName,
            lastName: input.lastName,
          });
        }
        
        // Guardar tipo na base de dados
        const { upsertEmailAccount } = await import('../server/db');
        await upsertEmailAccount(primaryEmailAddress, input.type);
        return { success: true, user, serverName: input.serverId ? undefined : 'auto' };
        } catch (err: any) {
          const msg = err?.message || String(err);
          console.error('[email.create] Erro:', msg);
          throw new TRPCError({ code: 'BAD_REQUEST', message: `Erro ao criar conta: ${msg}` });
        }
      }),

    delete: adminProcedure
      .input(z.object({ email: z.string().email() }))
      .mutation(async ({ input }) => {
        await deleteZohoUser(input.email);
        // Remove email account from database
        const { deleteEmailAccount } = await import('../server/db');
        await deleteEmailAccount(input.email);
        return { success: true };
      }),

    resetPassword: adminProcedure
      .input(z.object({ email: z.string().email(), newPassword: z.string().min(8) }))
      .mutation(async ({ input }) => {
        await resetZohoPassword(input.email, input.newPassword);
        return { success: true };
      }),

    toggle: adminProcedure
      .input(z.object({ email: z.string().email(), enabled: z.boolean() }))
      .mutation(async ({ input }) => {
        await toggleZohoUser(input.email, input.enabled);
        return { success: true };
      }),
    // Inbox
    listAccounts: adminProcedure.query(async () => {
      return await listMailAccounts();
    }),
    listFolders: adminProcedure
      .input(z.object({ accountId: z.string() }))
      .query(async ({ input }) => {
        return await listFolders(input.accountId);
      }),
    listMessages: adminProcedure
      .input(z.object({ accountId: z.string(), folderId: z.string().optional(), limit: z.number().optional(), start: z.number().optional() }))
      .query(async ({ input }) => {
        return await listInboxMessages(input.accountId, input.folderId ?? 'inbox', input.limit ?? 20, input.start ?? 0);
      }),
    getMessage: adminProcedure
      .input(z.object({ accountId: z.string(), messageId: z.string() }))
      .query(async ({ input }) => {
        return await getMessageContent(input.accountId, input.messageId);
      }),
    markRead: adminProcedure
      .input(z.object({ accountId: z.string(), messageId: z.string() }))
      .mutation(async ({ input }) => {
        await markMessageRead(input.accountId, input.messageId);
        return { success: true };
      }),
  }),

  chat: router(chatRouter),
  chatUsers: router(chatUsersRouter),
  onlineSupport: onlineSupportRouter,
  chatFlow: chatFlowRouter,
  consultas: router(consultasRouter),
  whatsappTemplates: router(whatsappTemplatesRouter),
  cartoes: cartoesRouter,
  mercado: mercadoRouter,

  // === ZOHO OAUTH CONFIG ===
  zohoConfig: router({
    list: adminProcedure.query(async () => {
      const { listZohoOAuthConfigs } = await import('../server/db');
      const configs = await listZohoOAuthConfigs();
      return (configs || []).map((c: any) => ({
        id: Number(c.id),
        name: String(c.name || ''),
        zohoOrgId: String(c.zohoOrgId || ''),
        zohoClientId: String(c.zohoClientId || ''),
        zohoClientSecret: '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022',
        zohoRefreshToken: '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022',
        domain: String(c.domain || ''),
        isActive: Number(c.isActive),
        status: String(c.status || 'inactive'),
        createdAt: Number(c.createdAt || 0),
      }));
    }),

    // Gera URL de autorização Zoho e salva dados pendentes para callback automático
    getAuthUrl: adminProcedure
      .input(z.object({
        name: z.string().min(2).max(128),
        zohoOrgId: z.string().min(1),
        zohoClientId: z.string().min(1),
        zohoClientSecret: z.string().min(1),
      }))
      .mutation(async ({ input }) => {
        const { savePendingZohoOAuth, getPendingZohoOAuth } = await import('../server/db');
        const crypto = await import('crypto');
        const sessionId = (crypto as any).randomBytes(16).toString('hex');
        const baseUrl = process.env.APP_URL || 'https://h2colombiano.com';
        const redirectUri = `${baseUrl}/api/zoho-oauth-callback`;
        
        const dataToSave = {
          name: input.name,
          zohoOrgId: input.zohoOrgId,
          zohoClientId: input.zohoClientId,
          zohoClientSecret: input.zohoClientSecret,
          redirectUri,
        };
        
        console.log('[getAuthUrl] Salvando sessão:', { sessionId: sessionId.substring(0, 8), data: dataToSave });
        await savePendingZohoOAuth(sessionId, dataToSave);
        
        // Verificar imediatamente se foi salvo
        const retrieved = await getPendingZohoOAuth(sessionId);
        console.log('[getAuthUrl] Sessão recuperada imediatamente:', retrieved ? 'SIM' : 'NÍÆ’O');
        if (retrieved) {
          console.log('[getAuthUrl] ClientSecret recuperado:', retrieved.zohoClientSecret.substring(0, 10) + '...');
        }
        
        const authUrl = `https://accounts.zoho.com/oauth/v2/auth?` + new URLSearchParams({
          client_id: input.zohoClientId,
          response_type: 'code',
          scope: 'ZohoMail.organization.accounts.ALL,ZohoMail.accounts.ALL,ZohoMail.messages.ALL,ZohoMail.folders.ALL',
          redirect_uri: redirectUri,
          state: sessionId,
          prompt: 'consent',
          access_type: 'offline',
        }).toString();
        return { authUrl, sessionId };
      }),

    // Adicionar manualmente com refresh token já obtido
    create: adminProcedure
      .input(z.object({
        name: z.string().min(2).max(128),
        zohoOrgId: z.string().min(1),
        zohoClientId: z.string().min(1),
        zohoClientSecret: z.string().min(1),
        zohoRefreshToken: z.string().min(1),
        domain: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { createZohoOAuthConfig } = await import('../server/db');
        await createZohoOAuthConfig(input);
        return { success: true };
      }),

    setActive: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const { setActiveZohoOAuthConfig } = await import('../server/db');
        await setActiveZohoOAuthConfig(input.id);
        return { success: true };
      }),

    update: adminProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(2).max(128).optional(),
        zohoOrgId: z.string().min(1).optional(),
        zohoClientId: z.string().min(1).optional(),
        zohoClientSecret: z.string().min(1).optional(),
        zohoRefreshToken: z.string().min(1).optional(),
        domain: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db2 = await import('../server/db');
        const dbConn = await (db2 as any).getDb();
        if (!dbConn) throw new Error('Database connection failed');
        const { sql: sqlFn } = await import('drizzle-orm');
        const now = Date.now();
        const sets: string[] = [`updatedAt = ${now}`];
        if (input.name) sets.push(`name = '${input.name.replace(/'/g, "''")}'`);
        if (input.zohoOrgId) sets.push(`zohoOrgId = '${input.zohoOrgId.replace(/'/g, "''")}'`);
        if (input.zohoClientId) sets.push(`zohoClientId = '${input.zohoClientId.replace(/'/g, "''")}'`);
        if (input.zohoClientSecret) sets.push(`zohoClientSecret = '${input.zohoClientSecret.replace(/'/g, "''")}'`);
        if (input.zohoRefreshToken) sets.push(`zohoRefreshToken = '${input.zohoRefreshToken.replace(/'/g, "''")}'`);
        if (input.domain !== undefined) sets.push(`\`domain\` = '${input.domain.replace(/'/g, "''")}'`);
        await dbConn.execute(sqlFn.raw(`UPDATE zohoOAuthConfigs SET ${sets.join(', ')} WHERE id = ${input.id}`));
        return { success: true };
      }),

    test: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const { getZohoOAuthConfig, updateZohoOAuthConfig } = await import('../server/db');
        const config = await getZohoOAuthConfig(input.id);
        if (!config) throw new Error('Configuração não encontrada');
        const params = new URLSearchParams({
          refresh_token: config.zohoRefreshToken,
          grant_type: 'refresh_token',
          client_id: config.zohoClientId,
          client_secret: config.zohoClientSecret,
        });
        const res = await fetch('https://accounts.zoho.com/oauth/v2/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString(),
        });
        const data = await res.json() as { access_token?: string; error?: string };
        if (!data.access_token) {
          await updateZohoOAuthConfig(input.id, { status: 'error' });
          throw new Error(`Token inválido: ${data.error ?? 'credenciais incorretas'}`);
        }
        await updateZohoOAuthConfig(input.id, { status: 'active' });
        return { success: true, message: 'Conexão OK! Token válido.' };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const { deleteZohoOAuthConfig } = await import('../server/db');
        await deleteZohoOAuthConfig(input.id);
        return { success: true };
      }),
  }),
});
export type AppRouter = typeof appRouter;

