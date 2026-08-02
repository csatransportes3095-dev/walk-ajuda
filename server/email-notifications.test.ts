import { describe, it, expect, beforeEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';

// Mock nodemailer
vi.mock('nodemailer', () => {
  const sendMail = vi.fn().mockResolvedValue({ messageId: 'test-id' });
  const createTransport = vi.fn().mockReturnValue({ sendMail });
  return {
    default: { createTransport },
    createTransport,
  };
});

// Mock storage
vi.mock('./storage', () => ({
  storagePut: vi.fn().mockResolvedValue({ key: 'test-key', url: '/manus-storage/test' }),
}));

// Mock direct mail sender (used by status notifications)
vi.mock('./_core/sendMailDirect', () => ({
  sendMailDirect: vi.fn().mockResolvedValue(undefined),
}));

// Mock db functions
vi.mock('./db', () => ({
  getDb: vi.fn().mockResolvedValue(null),
  validateAccessCode: vi.fn(),
  createAccessCode: vi.fn(),
  listAccessCodes: vi.fn().mockResolvedValue([]),
  toggleAccessCode: vi.fn(),
  deleteAccessCode: vi.fn(),
  renewAccessCode: vi.fn(),
  checkAccessCodeCanSubmit: vi.fn(),
  consumeAccessCode: vi.fn(),
  createCoupon: vi.fn(),
  listCoupons: vi.fn().mockResolvedValue([]),
  deleteCoupon: vi.fn(),
  toggleCoupon: vi.fn(),
  validateCoupon: vi.fn(),
  consumeCoupon: vi.fn(),
  createProduct: vi.fn(),
  listProducts: vi.fn().mockResolvedValue([]),
  listActiveProducts: vi.fn().mockResolvedValue([]),
  updateProduct: vi.fn(),
  deleteProduct: vi.fn(),
  toggleProduct: vi.fn(),
  listProductOptions: vi.fn().mockResolvedValue([]),
  createProductOption: vi.fn(),
  updateProductOption: vi.fn(),
  deleteProductOption: vi.fn(),
  listProductQuestions: vi.fn().mockResolvedValue([]),
  listOptionQuestions: vi.fn().mockResolvedValue([]),
  createProductQuestion: vi.fn(),
  updateProductQuestion: vi.fn(),
  deleteProductQuestion: vi.fn(),
  listOptionDocuments: vi.fn().mockResolvedValue([]),
  createOptionDocument: vi.fn(),
  deleteOptionDocument: vi.fn(),
  deleteOptionDocumentsByOptionId: vi.fn(),
  getAllSettings: vi.fn().mockResolvedValue({}),
  upsertSettings: vi.fn(),
  getSetting: vi.fn(),
  getUserByOpenId: vi.fn(),
  upsertUser: vi.fn(),
  updateCustomerLastAccess: vi.fn(),
  addOrderFile: vi.fn().mockResolvedValue({ key: 'test-key', url: '/manus-storage/test' }),
  getOrderFiles: vi.fn().mockResolvedValue([]),
  getOrderFilesByPhone: vi.fn().mockResolvedValue([]),
  getOrderFilesByPhoneGrouped: vi.fn().mockResolvedValue([]),
  deleteOrderFile: vi.fn(),
  getCustomerByPhone: vi.fn().mockResolvedValue(null),
  createCustomer: vi.fn().mockResolvedValue({ id: 1 }),
  updateCustomer: vi.fn(),
  listCustomers: vi.fn().mockResolvedValue([]),
  deleteCustomer: vi.fn(),
  updateOptionDocument: vi.fn(),
  getSettings: vi.fn().mockResolvedValue({}),
  createRaffle: vi.fn(),
  getAllRaffles: vi.fn(),
  getRaffleById: vi.fn(),
  updateRaffle: vi.fn(),
  deleteRaffle: vi.fn(),
  deleteRaffleEntry: vi.fn(),
  updateRaffleEntryPayment: vi.fn(),
  getRaffleEntries: vi.fn(),
  createRaffleEntry: vi.fn(),
  checkNumberTaken: vi.fn(),
  getActiveRaffle: vi.fn().mockResolvedValue(null),
  getLatestDrawnRaffle: vi.fn().mockResolvedValue(null),
  getAdminCredential: vi.fn(),
  updateAdminPassword: vi.fn(),
  addOrderStatus: vi.fn(),
  getOrderStatusHistory: vi.fn(),
  getLatestOrderStatus: vi.fn(),
  getOrderStatusHistoryByPhone: vi.fn(),
  getStatusLabelFromDb: vi.fn(),
  getStatusInfoFromDb: vi.fn(),
  generateOrderNumber: vi.fn().mockResolvedValue('ORD-001'),
  updateLastOrderStatus: vi.fn(),
  createDocRequest: vi.fn(),
  getDocRequestsByRegistration: vi.fn(),
  getDocRequestsByPhone: vi.fn(),
  updateDocRequestStatus: vi.fn(),
  deleteDocRequest: vi.fn(),
  getBlocklist: vi.fn().mockResolvedValue([]),
  addToBlocklist: vi.fn(),
  removeFromBlocklist: vi.fn(),
  checkBlocklist: vi.fn().mockResolvedValue({ blocked: false }),
  getSystemConfig: vi.fn(),
  setSystemConfig: vi.fn(),
  getAllSystemConfigs: vi.fn(),
  isIpBlocked: vi.fn().mockResolvedValue(false),
  getIpBlocklist: vi.fn(),
  blockIp: vi.fn(),
  unblockIp: vi.fn(),
  logIpAccess: vi.fn().mockResolvedValue(undefined),
  getIpAccessLogs: vi.fn(),
  getIpAccessLogsByIp: vi.fn(),
  logVpnAttempt: vi.fn(),
  getVpnAttempts: vi.fn(),
  checkVpnIp: vi.fn().mockResolvedValue(false),
  createBroadcast: vi.fn(),
  listBroadcasts: vi.fn(),
  deleteBroadcast: vi.fn(),
  markBroadcastSent: vi.fn(),
  logBlockedAttempt: vi.fn(),
  getBlockedAttempts: vi.fn(),
  clearBlockedAttempts: vi.fn(),
  listPixAccounts: vi.fn(),
  getActivePixAccount: vi.fn().mockResolvedValue(null),
  createPixAccount: vi.fn(),
  updatePixAccount: vi.fn(),
  setActivePixAccount: vi.fn(),
  deletePixAccount: vi.fn(),
  createFinancialSale: vi.fn(),
  updateFinancialSale: vi.fn(),
  deleteFinancialSale: vi.fn(),
  getFinancialSaleByRegistrationId: vi.fn(),
  listFinancialSales: vi.fn(),
  getFinancialSummary: vi.fn(),
  getCashFlow: vi.fn(),
  createReferralLink: vi.fn(),
  listReferralLinksByCustomer: vi.fn(),
  listAllReferralLinks: vi.fn(),
  getReferralLinkByCode: vi.fn(),
  deleteReferralLink: vi.fn(),
  toggleReferralLink: vi.fn(),
  recordReferralUsage: vi.fn(),
  listReferralUsagesByLink: vi.fn(),
  markReferralCommissionPaid: vi.fn(),
  isPhoneNewCustomer: vi.fn().mockResolvedValue(true),
  listTrackingQuestions: vi.fn(),
  listActiveTrackingQuestions: vi.fn(),
  createTrackingQuestion: vi.fn(),
  updateTrackingQuestion: vi.fn(),
  deleteTrackingQuestion: vi.fn(),
  toggleTrackingQuestion: vi.fn(),
  saveTrackingAnswer: vi.fn(),
  getTrackingAnswersByOrder: vi.fn(),
  recordAdminLoginAttempt: vi.fn().mockResolvedValue({ attempts: 1, blocked: false }),
  isAdminLoginBlocked: vi.fn().mockResolvedValue(false),
  resetAdminLoginAttempts: vi.fn(),
  unblockAllAdminIps: vi.fn(),
  listBlockedAdminIps: vi.fn(),
  restoreCustomer: vi.fn(),
  listDeletedCustomers: vi.fn(),
  permanentlyDeleteCustomer: vi.fn(),
  assignTrackingQuestion: vi.fn(),
  getAssignmentsByOrder: vi.fn(),
  saveAssignmentAnswer: vi.fn(),
  deleteAssignment: vi.fn(),
  getActiveProtectedPhoto: vi.fn(),
  listProtectedPhotos: vi.fn().mockResolvedValue([]),
  createProtectedPhoto: vi.fn(),
  deleteProtectedPhoto: vi.fn(),
  toggleProtectedPhoto: vi.fn(),
  reorderProtectedPhoto: vi.fn(),
  isPhoneRegistered: vi.fn().mockResolvedValue(false),
  logPhotoAccess: vi.fn(),
  listPhotoAccessLogs: vi.fn(),
  clearPhotoAccessLogs: vi.fn(),
  getOrderProgressConfig: vi.fn().mockResolvedValue([]),
  setOrderProgressConfig: vi.fn(),
  getFaqConfig: vi.fn().mockResolvedValue(null),
  updateFaqConfig: vi.fn(),
  listFaqItems: vi.fn().mockResolvedValue([]),
  createFaqItem: vi.fn(),
  updateFaqItem: vi.fn(),
  deleteFaqItem: vi.fn(),
  reorderFaqItems: vi.fn(),
  listAccessCodePhones: vi.fn().mockResolvedValue([]),
  listAllAccessCodePhones: vi.fn().mockResolvedValue([]),
  listScheduleSlots: vi.fn().mockResolvedValue([]),
  createScheduleSlot: vi.fn(),
  updateScheduleSlot: vi.fn(),
  deleteScheduleSlot: vi.fn(),
  listScheduleTemplates: vi.fn().mockResolvedValue([]),
  createScheduleTemplate: vi.fn(),
  updateScheduleTemplate: vi.fn(),
  deleteScheduleTemplate: vi.fn(),
  listAppointments: vi.fn().mockResolvedValue([]),
  createAppointment: vi.fn(),
  updateAppointment: vi.fn(),
  deleteAppointment: vi.fn(),
  listAppointmentsByRegistration: vi.fn().mockResolvedValue([]),
  listAppointmentsByPhone: vi.fn().mockResolvedValue([]),
}));

import { appRouter } from './routers';
import { getSetting, getStatusInfoFromDb, updateLastOrderStatus } from './db';
import { sendMailDirect } from './_core/sendMailDirect';

describe('Email Notifications - updateStatus', () => {
  const mockedSendMailDirect = vi.mocked(sendMailDirect);

  function createAdminCaller() {
    const token = jwt.sign(
      { sub: 'admin-1', role: 'admin' },
      process.env.JWT_SECRET || 'admin-secret-fallback',
      { expiresIn: '1h' },
    );

    return appRouter.createCaller({
      user: { id: 'admin-1', role: 'admin' } as any,
      req: {
        headers: { cookie: `admin_token=${token}` },
        socket: { remoteAddress: '127.0.0.1' },
      } as any,
      res: { clearCookie: vi.fn(), cookie: vi.fn() } as any,
    });
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.RESEND_API_KEY = 'test-resend-key';
    
    (getSetting as ReturnType<typeof vi.fn>).mockImplementation((key: string) => {
      if (key === 'email_to') return Promise.resolve('h2@h2colombiano.com');
      if (key === 'contact_email') return Promise.resolve('h2@h2colombiano.com');
      if (key === 'site_title') return Promise.resolve('H2 COLOMBIANO');
      if (key === 'site_domain') return Promise.resolve('h2colombiano.com');
      if (key === 'site_url') return Promise.resolve('https://h2colombiano.com');
      return Promise.resolve(null);
    });
    
    (getStatusInfoFromDb as ReturnType<typeof vi.fn>).mockResolvedValue({
      label: 'Processando',
      description: 'Seu pedido estÃ¡ sendo processado',
    });
    
    (updateLastOrderStatus as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });
  });

  it('should send email to admin when order status is updated', async () => {
    const caller = createAdminCaller();

    const result = await caller.orderStatus.updateStatus({
      registrationId: 123,
      subOrderIndex: 0,
      customerPhone: '(11) 98765-4321',
      customerEmail: 'customer@example.com',
      customerName: 'JoÃ£o Silva',
      status: 'processando',
      note: 'Iniciando processamento',
      serviceName: 'Conta Uber',
      serviceOption: 'Completo',
      orderNumber: 1001,
      customerNumber: 123,
    });

    expect(result.success).toBe(true);
    expect(mockedSendMailDirect).toHaveBeenCalledTimes(2);

    const adminCall = mockedSendMailDirect.mock.calls[0][0];
    expect(adminCall.to).toBe('h2@h2colombiano.com');
    expect(adminCall.subject).toContain('[ADMIN]');
    expect(adminCall.subject).toContain('Processando');
    expect(adminCall.html).toContain('Jo');

    const customerCall = mockedSendMailDirect.mock.calls[1][0];
    expect(customerCall.to).toBe('customer@example.com');
    expect(customerCall.subject).toContain('Processando');
  });

  it('should skip customer email when skipEmail is true', async () => {
    const caller = createAdminCaller();

    const result = await caller.orderStatus.updateStatus({
      registrationId: 123,
      subOrderIndex: 0,
      customerPhone: '(11) 98765-4321',
      customerEmail: 'customer@example.com',
      customerName: 'JoÃ£o Silva',
      status: 'processando',
      skipEmail: true,
    });

    expect(result.success).toBe(true);
    expect(mockedSendMailDirect).toHaveBeenCalledOnce();
    const adminCall = mockedSendMailDirect.mock.calls[0][0];
    expect(adminCall.to).toBe('h2@h2colombiano.com');
  });

  it('should send admin and customer email on orderStatus.update', async () => {
    const caller = createAdminCaller();

    const result = await caller.orderStatus.update({
      registrationId: 321,
      customerPhone: '(11) 91234-5678',
      customerEmail: 'cliente@example.com',
      customerName: 'Maria',
      status: 'processando',
      note: 'Status alterado',
    });

    expect(result.success).toBe(true);
    expect(mockedSendMailDirect).toHaveBeenCalledTimes(2);
    expect(mockedSendMailDirect.mock.calls[0][0].to).toBe('h2@h2colombiano.com');
    expect(mockedSendMailDirect.mock.calls[1][0].to).toBe('cliente@example.com');
  });

  it('should resend status email to customer', async () => {
    const caller = createAdminCaller();

    const result = await caller.orderStatus.resendEmail({
      customerEmail: 'cliente2@example.com',
      customerName: 'Carlos',
      customerPhone: '(11) 90000-0000',
      status: 'processando',
      note: 'Reenvio manual',
      serviceName: 'Conta',
      serviceOption: 'Completo',
      customerNumber: 10,
      orderNumber: 2002,
    });

    expect(result.success).toBe(true);
    expect(mockedSendMailDirect).toHaveBeenCalledOnce();
    expect(mockedSendMailDirect.mock.calls[0][0].to).toBe('cliente2@example.com');
    expect(mockedSendMailDirect.mock.calls[0][0].subject).toContain('Reenvio');
  });

  it('should notify admin and customer when saving new status for order #427000', async () => {
    const caller = createAdminCaller();

    const result = await caller.orderStatus.updateStatus({
      registrationId: 427000,
      subOrderIndex: 0,
      customerPhone: '(21) 99999-0000',
      customerEmail: 'imperioandrelucas@gmail.com',
      customerName: 'imperioandrelucas',
      status: 'agendamento_p_foto_confirmado',
      note: 'Teste de notificacao ao salvar novo status',
      serviceName: 'UBER APP',
      serviceOption: 'NOME ALEATORIO',
      orderNumber: 427000,
      customerNumber: 1056,
      customerCity: 'RIO DE JANEIRO',
      customerUf: 'RJ',
    });

    expect(result.success).toBe(true);
    expect(mockedSendMailDirect).toHaveBeenCalledTimes(2);
    const adminCall = mockedSendMailDirect.mock.calls[0][0];
    const customerCall = mockedSendMailDirect.mock.calls[1][0];
    expect(adminCall.to).toBe('h2@h2colombiano.com');
    expect(customerCall.to).toBe('imperioandrelucas@gmail.com');
    expect(customerCall.subject).toContain('Processando');
  });
});
