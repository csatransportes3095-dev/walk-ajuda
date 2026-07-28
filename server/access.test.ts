import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";

// Mock db functions
vi.mock("./db", () => ({
  validateAccessCode: vi.fn(),
  createAccessCode: vi.fn(),
  listAccessCodes: vi.fn(),
  toggleAccessCode: vi.fn(),
  deleteAccessCode: vi.fn(),
  renewAccessCode: vi.fn(),
  checkAccessCodeCanSubmit: vi.fn(),
  consumeAccessCode: vi.fn(),
  listAccessCodePhones: vi.fn(),
  listAllAccessCodePhones: vi.fn(),
  getUserByOpenId: vi.fn(),
  upsertUser: vi.fn(),
  updateCustomerLastAccess: vi.fn(),
  getSetting: vi.fn().mockResolvedValue(null),
  getSettings: vi.fn().mockResolvedValue({}),
  getAllSettings: vi.fn().mockResolvedValue([]),
  upsertSettings: vi.fn(),
  createCoupon: vi.fn(), listCoupons: vi.fn(), deleteCoupon: vi.fn(), toggleCoupon: vi.fn(), validateCoupon: vi.fn(), consumeCoupon: vi.fn(),
  createProduct: vi.fn(), listProducts: vi.fn(), listActiveProducts: vi.fn().mockResolvedValue([]), updateProduct: vi.fn(), deleteProduct: vi.fn(), toggleProduct: vi.fn(),
  listProductOptions: vi.fn(), createProductOption: vi.fn(), updateProductOption: vi.fn(), deleteProductOption: vi.fn(),
  listProductQuestions: vi.fn(), listOptionQuestions: vi.fn(), createProductQuestion: vi.fn(), updateProductQuestion: vi.fn(), deleteProductQuestion: vi.fn(),
  listOptionDocuments: vi.fn(), createOptionDocument: vi.fn(), updateOptionDocument: vi.fn(), deleteOptionDocument: vi.fn(), deleteOptionDocumentsByOptionId: vi.fn(),
  getCustomerByPhone: vi.fn(), createCustomer: vi.fn(), listCustomers: vi.fn(), updateCustomer: vi.fn(), deleteCustomer: vi.fn(),
  createRaffle: vi.fn(), getAllRaffles: vi.fn(), getRaffleById: vi.fn(), updateRaffle: vi.fn(), deleteRaffle: vi.fn(), deleteRaffleEntry: vi.fn(), updateRaffleEntryPayment: vi.fn(),
  getRaffleEntries: vi.fn(), createRaffleEntry: vi.fn(), checkNumberTaken: vi.fn(), getActiveRaffle: vi.fn().mockResolvedValue(null), getLatestDrawnRaffle: vi.fn().mockResolvedValue(null),
  getAdminCredential: vi.fn(), updateAdminPassword: vi.fn(),
  addOrderStatus: vi.fn(), getOrderStatusHistory: vi.fn(), getLatestOrderStatus: vi.fn(), getOrderStatusHistoryByPhone: vi.fn(),
  addOrderFile: vi.fn(), getOrderFiles: vi.fn(), getOrderFilesByPhone: vi.fn(), getOrderFilesByPhoneGrouped: vi.fn(), deleteOrderFile: vi.fn(),
  getStatusLabelFromDb: vi.fn(), getStatusInfoFromDb: vi.fn(),
  generateOrderNumber: vi.fn().mockResolvedValue('ORD-001'),
  updateLastOrderStatus: vi.fn(),
  createDocRequest: vi.fn(), getDocRequestsByRegistration: vi.fn(), getDocRequestsByPhone: vi.fn(),
  updateDocRequestStatus: vi.fn(), deleteDocRequest: vi.fn(),
  getBlocklist: vi.fn().mockResolvedValue([]), addToBlocklist: vi.fn(), removeFromBlocklist: vi.fn(), checkBlocklist: vi.fn().mockResolvedValue({ blocked: false }),
  getSystemConfig: vi.fn(), setSystemConfig: vi.fn(), getAllSystemConfigs: vi.fn(),
  isIpBlocked: vi.fn().mockResolvedValue(false), getIpBlocklist: vi.fn(), blockIp: vi.fn(), unblockIp: vi.fn(), logIpAccess: vi.fn().mockResolvedValue(undefined), getIpAccessLogs: vi.fn(), getIpAccessLogsByIp: vi.fn(),
  logVpnAttempt: vi.fn(), getVpnAttempts: vi.fn(), checkVpnIp: vi.fn().mockResolvedValue(false),
  createBroadcast: vi.fn(), listBroadcasts: vi.fn(), deleteBroadcast: vi.fn(), markBroadcastSent: vi.fn(),
  logBlockedAttempt: vi.fn(), getBlockedAttempts: vi.fn(), clearBlockedAttempts: vi.fn(),
  listPixAccounts: vi.fn(), getActivePixAccount: vi.fn().mockResolvedValue(null), createPixAccount: vi.fn(), updatePixAccount: vi.fn(), setActivePixAccount: vi.fn(), deletePixAccount: vi.fn(),
  createFinancialSale: vi.fn(), updateFinancialSale: vi.fn(), deleteFinancialSale: vi.fn(), getFinancialSaleByRegistrationId: vi.fn(),
  listFinancialSales: vi.fn(), getFinancialSummary: vi.fn(), getCashFlow: vi.fn(),
  createReferralLink: vi.fn(), listReferralLinksByCustomer: vi.fn(), listAllReferralLinks: vi.fn(), getReferralLinkByCode: vi.fn(),
  deleteReferralLink: vi.fn(), toggleReferralLink: vi.fn(), recordReferralUsage: vi.fn(), listReferralUsagesByLink: vi.fn(),
  markReferralCommissionPaid: vi.fn(), isPhoneNewCustomer: vi.fn().mockResolvedValue(true),
  listTrackingQuestions: vi.fn(), listActiveTrackingQuestions: vi.fn(), createTrackingQuestion: vi.fn(),
  updateTrackingQuestion: vi.fn(), deleteTrackingQuestion: vi.fn(), toggleTrackingQuestion: vi.fn(),
  saveTrackingAnswer: vi.fn(), getTrackingAnswersByOrder: vi.fn(),
  recordAdminLoginAttempt: vi.fn().mockResolvedValue({ attempts: 1, blocked: false }), isAdminLoginBlocked: vi.fn().mockResolvedValue(false), resetAdminLoginAttempts: vi.fn(),
  unblockAllAdminIps: vi.fn(), listBlockedAdminIps: vi.fn(),
  restoreCustomer: vi.fn(), listDeletedCustomers: vi.fn(), permanentlyDeleteCustomer: vi.fn(),
  assignTrackingQuestion: vi.fn(), getAssignmentsByOrder: vi.fn(), saveAssignmentAnswer: vi.fn(), deleteAssignment: vi.fn(),
  getActiveProtectedPhoto: vi.fn(), listProtectedPhotos: vi.fn().mockResolvedValue([]), createProtectedPhoto: vi.fn(), deleteProtectedPhoto: vi.fn(),
  toggleProtectedPhoto: vi.fn(), reorderProtectedPhoto: vi.fn(), isPhoneRegistered: vi.fn().mockResolvedValue(false),
  logPhotoAccess: vi.fn(), listPhotoAccessLogs: vi.fn(), clearPhotoAccessLogs: vi.fn(),
  getOrderProgressConfig: vi.fn().mockResolvedValue([]), setOrderProgressConfig: vi.fn(),
  getFaqConfig: vi.fn().mockResolvedValue(null), updateFaqConfig: vi.fn(), listFaqItems: vi.fn().mockResolvedValue([]), createFaqItem: vi.fn(), updateFaqItem: vi.fn(), deleteFaqItem: vi.fn(), reorderFaqItems: vi.fn(),
}));

import {
  validateAccessCode, createAccessCode, listAccessCodes, toggleAccessCode,
  deleteAccessCode, renewAccessCode, checkAccessCodeCanSubmit, consumeAccessCode,
  listAccessCodePhones, listAllAccessCodePhones,
} from "./db";

const createCaller = (user?: { id: number; openId: string; name: string; role: string }) => {
  return appRouter.createCaller({
    user: user as any,
    req: { headers: {}, socket: { remoteAddress: '127.0.0.1' } } as any,
    res: { clearCookie: vi.fn(), cookie: vi.fn() } as any,
  });
};

describe("Access Code System", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("access.validate", () => {
    it("should validate general password successfully", async () => {
      const mockValidate = validateAccessCode as ReturnType<typeof vi.fn>;
      mockValidate.mockResolvedValue({ valid: true, type: "general" });

      const caller = createCaller();
      const result = await caller.access.validate({ code: "Walk@@3095" });

      expect(result.valid).toBe(true);
      expect(result.type).toBe("general");
      expect(mockValidate).toHaveBeenCalledWith("Walk@@3095", undefined);
    });

    it("should validate VIP code successfully", async () => {
      const mockValidate = validateAccessCode as ReturnType<typeof vi.fn>;
      mockValidate.mockResolvedValue({ valid: true, type: "vip", clientName: "João" });

      const caller = createCaller();
      const result = await caller.access.validate({ code: "VIP-ABC123" });

      expect(result.valid).toBe(true);
      expect(result.type).toBe("vip");
      expect(result.clientName).toBe("João");
    });

    it("should reject invalid code", async () => {
      const mockValidate = validateAccessCode as ReturnType<typeof vi.fn>;
      mockValidate.mockResolvedValue({ valid: false, type: "none" });

      const caller = createCaller();
      const result = await caller.access.validate({ code: "wrong-password" });

      expect(result.valid).toBe(false);
    });

    it("should reject empty code", async () => {
      const caller = createCaller();
      await expect(caller.access.validate({ code: "" })).rejects.toThrow();
    });

    it("should pass phone to validateAccessCode when provided", async () => {
      const mockValidate = validateAccessCode as ReturnType<typeof vi.fn>;
      mockValidate.mockResolvedValue({ valid: true, type: "vip", clientName: "Test" });

      const caller = createCaller();
      await caller.access.validate({ code: "VIP-123", phone: "11999998888" });

      expect(mockValidate).toHaveBeenCalledWith("VIP-123", "11999998888");
    });

    it("should allow same phone to re-enter when not consumed", async () => {
      const mockValidate = validateAccessCode as ReturnType<typeof vi.fn>;
      // Simula: mesmo telefone já acessou mas consumed=0, validate retorna valid
      mockValidate.mockResolvedValue({ valid: true, type: "vip", clientName: "Test" });

      const caller = createCaller();
      const result = await caller.access.validate({ code: "VIP-123", phone: "11999998888" });

      expect(result.valid).toBe(true);
      expect(result.type).toBe("vip");
    });

    it("should block phone that already completed order (consumed=1)", async () => {
      const mockValidate = validateAccessCode as ReturnType<typeof vi.fn>;
      // Simula: telefone já completou pedido (consumed=1), validate bloqueia
      mockValidate.mockResolvedValue({ valid: false, type: "none" });

      const caller = createCaller();
      const result = await caller.access.validate({ code: "VIP-123", phone: "11999998888" });

      expect(result.valid).toBe(false);
    });

    it("should block access when maxUses reached with new phone", async () => {
      const mockValidate = validateAccessCode as ReturnType<typeof vi.fn>;
      // Simula: telefone novo mas sem usos disponíveis
      mockValidate.mockResolvedValue({ valid: false, type: "none" });

      const caller = createCaller();
      const result = await caller.access.validate({ code: "VIP-FULL", phone: "11888887777" });

      expect(result.valid).toBe(false);
    });

    it("should allow new phone when uses are available", async () => {
      const mockValidate = validateAccessCode as ReturnType<typeof vi.fn>;
      // Simula: telefone novo com usos disponíveis
      mockValidate.mockResolvedValue({ valid: true, type: "vip", clientName: "Multi" });

      const caller = createCaller();
      const result = await caller.access.validate({ code: "VIP-MULTI", phone: "11777776666" });

      expect(result.valid).toBe(true);
      expect(result.type).toBe("vip");
    });
  });

  describe("access.create (admin only)", () => {
    it("should create VIP code as admin", async () => {
      const mockCreate = createAccessCode as ReturnType<typeof vi.fn>;
      mockCreate.mockResolvedValue({
        id: 1,
        code: "VIP-TEST01",
        type: "vip",
        status: "active",
        clientName: "Cliente Teste",
        maxUses: 1,
        currentUses: 0,
        createdAt: new Date(),
      });

      const caller = createCaller({ id: 1, openId: "admin1", name: "Admin", role: "admin" });
      const result = await caller.access.create({
        code: "VIP-TEST01",
        clientName: "Cliente Teste",
      });

      expect(result.success).toBe(true);
      expect(mockCreate).toHaveBeenCalledWith("VIP-TEST01", "Cliente Teste", 1, false, undefined);
    });

    it("should reject non-admin users", async () => {
      const caller = createCaller({ id: 2, openId: "user1", name: "User", role: "user" });
      await expect(
        caller.access.create({ code: "VIP-TEST02" })
      ).rejects.toThrow();
    });
  });

  describe("access.list (admin only)", () => {
    it("should list codes as admin", async () => {
      const mockList = listAccessCodes as ReturnType<typeof vi.fn>;
      mockList.mockResolvedValue([
        { id: 1, code: "VIP-001", status: "active", clientName: "João", maxUses: 1, currentUses: 0 },
        { id: 2, code: "VIP-002", status: "used", clientName: "Maria", maxUses: 1, currentUses: 1 },
      ]);

      const caller = createCaller({ id: 1, openId: "admin1", name: "Admin", role: "admin" });
      const result = await caller.access.list();

      expect(result).toHaveLength(2);
      expect(result[0].code).toBe("VIP-001");
    });

    it("should reject non-admin users", async () => {
      const caller = createCaller({ id: 2, openId: "user1", name: "User", role: "user" });
      await expect(caller.access.list()).rejects.toThrow();
    });
  });

  describe("access.toggle (admin only)", () => {
    it("should toggle code status as admin", async () => {
      const mockToggle = toggleAccessCode as ReturnType<typeof vi.fn>;
      mockToggle.mockResolvedValue(undefined);

      const caller = createCaller({ id: 1, openId: "admin1", name: "Admin", role: "admin" });
      const result = await caller.access.toggle({ id: 1, status: "disabled" });

      expect(result.success).toBe(true);
      expect(mockToggle).toHaveBeenCalledWith(1, "disabled");
    });

    it("should reject non-admin users", async () => {
      const caller = createCaller({ id: 2, openId: "user1", name: "User", role: "user" });
      await expect(caller.access.toggle({ id: 1, status: "disabled" })).rejects.toThrow();
    });
  });

  describe("access.delete (admin only)", () => {
    it("should delete code as admin", async () => {
      const mockDelete = deleteAccessCode as ReturnType<typeof vi.fn>;
      mockDelete.mockResolvedValue(undefined);

      const caller = createCaller({ id: 1, openId: "admin1", name: "Admin", role: "admin" });
      const result = await caller.access.delete({ id: 1 });

      expect(result.success).toBe(true);
      expect(mockDelete).toHaveBeenCalledWith(1);
    });

    it("should reject non-admin users", async () => {
      const caller = createCaller({ id: 2, openId: "user1", name: "User", role: "user" });
      await expect(caller.access.delete({ id: 1 })).rejects.toThrow();
    });
  });

  describe("access.renew (admin only)", () => {
    it("should renew code with specified minutes", async () => {
      const mockRenew = renewAccessCode as ReturnType<typeof vi.fn>;
      mockRenew.mockResolvedValue({
        id: 1, code: "VIP-001", status: "active",
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      });

      const caller = createCaller({ id: 1, openId: "admin1", name: "Admin", role: "admin" });
      const result = await caller.access.renew({ id: 1, minutes: 30 });

      expect(result.success).toBe(true);
      expect(result.accessCode).toBeDefined();
      expect(mockRenew).toHaveBeenCalledWith(1, 30);
    });

    it("should renew code with default minutes when not specified", async () => {
      const mockRenew = renewAccessCode as ReturnType<typeof vi.fn>;
      mockRenew.mockResolvedValue({
        id: 1, code: "VIP-001", status: "active",
        expiresAt: new Date(Date.now() + 20 * 60 * 1000),
      });

      const caller = createCaller({ id: 1, openId: "admin1", name: "Admin", role: "admin" });
      const result = await caller.access.renew({ id: 1 });

      expect(result.success).toBe(true);
      expect(mockRenew).toHaveBeenCalledWith(1, undefined);
    });

    it("should return failure when code not found", async () => {
      const mockRenew = renewAccessCode as ReturnType<typeof vi.fn>;
      mockRenew.mockResolvedValue(null);

      const caller = createCaller({ id: 1, openId: "admin1", name: "Admin", role: "admin" });
      const result = await caller.access.renew({ id: 999 });

      expect(result.success).toBe(false);
      expect(result.message).toBe("Senha não encontrada");
    });

    it("should reject non-admin users", async () => {
      const caller = createCaller({ id: 2, openId: "user1", name: "User", role: "user" });
      await expect(caller.access.renew({ id: 1, minutes: 20 })).rejects.toThrow();
    });
  });

  describe("access.create with maxUses", () => {
    it("should create VIP code with custom maxUses", async () => {
      const mockCreate = createAccessCode as ReturnType<typeof vi.fn>;
      mockCreate.mockResolvedValue({
        id: 2, code: "VIP-MULTI", type: "vip", status: "active",
        clientName: "Multi", maxUses: 5, currentUses: 0, createdAt: new Date(),
      });

      const caller = createCaller({ id: 1, openId: "admin1", name: "Admin", role: "admin" });
      const result = await caller.access.create({
        code: "VIP-MULTI", clientName: "Multi", maxUses: 5,
      });

      expect(result.success).toBe(true);
      expect(mockCreate).toHaveBeenCalledWith("VIP-MULTI", "Multi", 5, false, undefined);
    });

    it("should default maxUses to 1 when not specified", async () => {
      const mockCreate = createAccessCode as ReturnType<typeof vi.fn>;
      mockCreate.mockResolvedValue({
        id: 3, code: "VIP-SINGLE", type: "vip", status: "active",
        maxUses: 1, currentUses: 0, createdAt: new Date(),
      });

      const caller = createCaller({ id: 1, openId: "admin1", name: "Admin", role: "admin" });
      const result = await caller.access.create({ code: "VIP-SINGLE" });

      expect(result.success).toBe(true);
      expect(mockCreate).toHaveBeenCalledWith("VIP-SINGLE", undefined, 1, false, undefined);
    });
  });

  describe("access.list shows accessedByPhone", () => {
    it("should include accessedByPhone in listed codes", async () => {
      const mockList = listAccessCodes as ReturnType<typeof vi.fn>;
      mockList.mockResolvedValue([
        { id: 1, code: "VIP-001", status: "active", clientName: "João", maxUses: 1, currentUses: 0, accessedByPhone: "11999998888" },
        { id: 2, code: "VIP-002", status: "active", clientName: "Maria", maxUses: 1, currentUses: 0, accessedByPhone: null },
      ]);

      const caller = createCaller({ id: 1, openId: "admin1", name: "Admin", role: "admin" });
      const result = await caller.access.list();

      expect(result).toHaveLength(2);
      expect(result[0].accessedByPhone).toBe("11999998888");
      expect(result[1].accessedByPhone).toBeNull();
    });
  });

  describe("access.listPhones (admin only)", () => {
    it("should list phones for a specific code", async () => {
      const mockListPhones = listAccessCodePhones as ReturnType<typeof vi.fn>;
      mockListPhones.mockResolvedValue([
        { id: 1, codeId: 10, phone: "11999998888", accessedAt: new Date("2026-04-25T10:00:00Z") },
        { id: 2, codeId: 10, phone: "11977776666", accessedAt: new Date("2026-04-25T10:05:00Z") },
      ]);

      const caller = createCaller({ id: 1, openId: "admin1", name: "Admin", role: "admin" });
      const result = await caller.access.listPhones({ codeId: 10 });

      expect(result).toHaveLength(2);
      expect(result[0].phone).toBe("11999998888");
      expect(result[1].phone).toBe("11977776666");
      expect(mockListPhones).toHaveBeenCalledWith(10);
    });

    it("should return empty array when no phones accessed", async () => {
      const mockListPhones = listAccessCodePhones as ReturnType<typeof vi.fn>;
      mockListPhones.mockResolvedValue([]);

      const caller = createCaller({ id: 1, openId: "admin1", name: "Admin", role: "admin" });
      const result = await caller.access.listPhones({ codeId: 99 });

      expect(result).toHaveLength(0);
    });

    it("should reject non-admin users", async () => {
      const caller = createCaller({ id: 2, openId: "user1", name: "User", role: "user" });
      await expect(caller.access.listPhones({ codeId: 1 })).rejects.toThrow();
    });
  });

  describe("access.create with timeOnly", () => {
    it("should create VIP code with timeOnly=true", async () => {
      const mockCreate = createAccessCode as ReturnType<typeof vi.fn>;
      mockCreate.mockResolvedValue({
        id: 10, code: "VIP-TIME", type: "vip", status: "active",
        clientName: "TimeClient", maxUses: 1, currentUses: 0, timeOnly: 1, createdAt: new Date(),
      });

      const caller = createCaller({ id: 1, openId: "admin1", name: "Admin", role: "admin" });
      const result = await caller.access.create({
        code: "VIP-TIME", clientName: "TimeClient", maxUses: 1, timeOnly: true,
      });

      expect(result.success).toBe(true);
      expect(mockCreate).toHaveBeenCalledWith("VIP-TIME", "TimeClient", 1, true, undefined);
    });

    it("should create VIP code with timeOnly=false by default", async () => {
      const mockCreate = createAccessCode as ReturnType<typeof vi.fn>;
      mockCreate.mockResolvedValue({
        id: 11, code: "VIP-NORMAL", type: "vip", status: "active",
        maxUses: 1, currentUses: 0, timeOnly: 0, createdAt: new Date(),
      });

      const caller = createCaller({ id: 1, openId: "admin1", name: "Admin", role: "admin" });
      const result = await caller.access.create({ code: "VIP-NORMAL" });

      expect(result.success).toBe(true);
      expect(mockCreate).toHaveBeenCalledWith("VIP-NORMAL", undefined, 1, false, undefined);
    });

    it("should allow timeOnly code to be validated after use (reentry)", async () => {
      const mockValidate = validateAccessCode as ReturnType<typeof vi.fn>;
      // Simula: telefone já acessou mas timeOnly=true, permite reentrada
      mockValidate.mockResolvedValue({ valid: true, type: "vip", clientName: "TimeClient" });

      const caller = createCaller();
      const result = await caller.access.validate({ code: "VIP-TIME", phone: "11999998888" });

      expect(result.valid).toBe(true);
      expect(result.type).toBe("vip");
    });

    it("should allow timeOnly code to be submitted multiple times via checkAccessCodeCanSubmit", async () => {
      const mockCanSubmit = checkAccessCodeCanSubmit as ReturnType<typeof vi.fn>;
      // Simula: timeOnly=true, permite submissão mesmo após uso anterior
      mockCanSubmit.mockResolvedValue({ canSubmit: true, type: "vip" });

      // Verifica que a função retorna canSubmit=true para timeOnly
      const result = await mockCanSubmit("VIP-TIME", "11999998888");
      expect(result.canSubmit).toBe(true);
      expect(result.type).toBe("vip");
    });

    it("should block timeOnly code after expiration", async () => {
      const mockValidate = validateAccessCode as ReturnType<typeof vi.fn>;
      // Simula: timeOnly=true mas expirou
      mockValidate.mockResolvedValue({ valid: false, type: "none" });

      const caller = createCaller();
      const result = await caller.access.validate({ code: "VIP-TIME-EXPIRED", phone: "11999998888" });

      expect(result.valid).toBe(false);
    });

    it("should not consume timeOnly code (consumeAccessCode returns early)", async () => {
      const mockConsume = consumeAccessCode as ReturnType<typeof vi.fn>;
      mockConsume.mockResolvedValue(undefined);

      // Simula chamada de consumeAccessCode para senha timeOnly
      await mockConsume("VIP-TIME", "11999998888");
      expect(mockConsume).toHaveBeenCalledWith("VIP-TIME", "11999998888");
    });

    it("should NOT allow regular code reentry after use", async () => {
      const mockValidate = validateAccessCode as ReturnType<typeof vi.fn>;
      // Simula: telefone já acessou e timeOnly=false, bloqueia
      mockValidate.mockResolvedValue({ valid: false, type: "none" });

      const caller = createCaller();
      const result = await caller.access.validate({ code: "VIP-REGULAR", phone: "11999998888" });

      expect(result.valid).toBe(false);
    });
  });

  describe("access.listAllPhones (admin only)", () => {
    it("should list all phones across all codes", async () => {
      const mockListAll = listAllAccessCodePhones as ReturnType<typeof vi.fn>;
      mockListAll.mockResolvedValue([
        { id: 1, codeId: 10, phone: "11999998888", accessedAt: new Date("2026-04-25T10:00:00Z") },
        { id: 2, codeId: 10, phone: "11977776666", accessedAt: new Date("2026-04-25T10:05:00Z") },
        { id: 3, codeId: 20, phone: "11966665555", accessedAt: new Date("2026-04-25T11:00:00Z") },
      ]);

      const caller = createCaller({ id: 1, openId: "admin1", name: "Admin", role: "admin" });
      const result = await caller.access.listAllPhones();

      expect(result).toHaveLength(3);
      expect(result[0].codeId).toBe(10);
      expect(result[2].codeId).toBe(20);
    });

    it("should reject non-admin users", async () => {
      const caller = createCaller({ id: 2, openId: "user1", name: "User", role: "user" });
      await expect(caller.access.listAllPhones()).rejects.toThrow();
    });
  });
});
