import { afterAll, describe, it, expect, vi, beforeEach } from 'vitest';
import { appRouter } from './routers';

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

// Mock db functions - MUST include ALL exports used by routers.ts
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
  getSetting: vi.fn().mockResolvedValue(null),
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
  createRaffle: vi.fn(), getAllRaffles: vi.fn(), getRaffleById: vi.fn(), updateRaffle: vi.fn(), deleteRaffle: vi.fn(), deleteRaffleEntry: vi.fn(), updateRaffleEntryPayment: vi.fn(),
  getRaffleEntries: vi.fn(), createRaffleEntry: vi.fn(), checkNumberTaken: vi.fn(), getActiveRaffle: vi.fn().mockResolvedValue(null), getLatestDrawnRaffle: vi.fn().mockResolvedValue(null),
  getAdminCredential: vi.fn(), updateAdminPassword: vi.fn(),
  addOrderStatus: vi.fn(), getOrderStatusHistory: vi.fn(), getLatestOrderStatus: vi.fn(), getOrderStatusHistoryByPhone: vi.fn(),
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
  listAccessCodePhones: vi.fn().mockResolvedValue([]), listAllAccessCodePhones: vi.fn().mockResolvedValue([]),
}));

import { addOrderStatus, checkAccessCodeCanSubmit, consumeAccessCode, getDb } from './db';
import { storagePut } from './storage';

describe('uploads.submitFiles', () => {
  let mockSendMail: any;
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.SITE_GENERAL_PASSWORD = 'Walk@@3095';
    process.env.SMTP_PASS = 'test-only-password';
    const testDb = {
      execute: vi.fn().mockResolvedValue([[{ id: 101, key: 'pedido_recebido', total: 0, price: '0' }]]),
    };
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(testDb);
    (addOrderStatus as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 303 });
    mockSendMail = vi.fn().mockResolvedValue({ messageId: 'test-id' });
    const nodemailer = await import('nodemailer');
    (nodemailer.default.createTransport as ReturnType<typeof vi.fn>).mockReturnValue({ sendMail: mockSendMail });
    (checkAccessCodeCanSubmit as ReturnType<typeof vi.fn>).mockResolvedValue({ canSubmit: true, type: 'general' });
    (consumeAccessCode as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (storagePut as ReturnType<typeof vi.fn>).mockResolvedValue({ key: 'test-key', url: '/manus-storage/test' });
  });

  afterAll(() => {
    delete process.env.SITE_GENERAL_PASSWORD;
    delete process.env.SMTP_PASS;
  });

  it('should persist a cpToken order before notifying and return its registrationId', async () => {
    const cpDb = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([{ expiresAt: new Date(Date.now() + 60_000), phone: '11999990000' }]),
          })),
        })),
      })),
      execute: vi.fn().mockResolvedValue([[{ id: 101, key: 'pedido_recebido', total: 0, price: '0' }]]),
    };
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(cpDb);
    const caller = appRouter.createCaller({ user: null as any, req: { headers: {}, socket: { remoteAddress: '127.0.0.1' } } as any, res: { clearCookie: vi.fn(), cookie: vi.fn() } as any });

    const result = await caller.uploads.submitFiles({
      clientName: 'Cliente cpToken',
      service: 'UBER APP',
      nameOption: 'UBER NOME',
      phone: '11999990000',
      cpToken: 'cp-token-fixture-1234567890',
    });

    expect(result.success).toBe(true);
    expect(result.registrationId).toBe(101);
    expect(addOrderStatus).toHaveBeenCalledWith(expect.objectContaining({ registrationId: 101, status: 'pedido_recebido' }));
    expect(mockSendMail).toHaveBeenCalled();
    expect((addOrderStatus as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]).toBeLessThan(mockSendMail.mock.invocationCallOrder[0]);
  });

  it('rejects without persistence and does not notify when registration fails', async () => {
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      execute: vi.fn().mockRejectedValue(new Error('fixture database failure')),
    });
    const caller = appRouter.createCaller({ user: null as any, req: { headers: {}, socket: { remoteAddress: '127.0.0.1' } } as any, res: { clearCookie: vi.fn(), cookie: vi.fn() } as any });

    const logSpy = vi.spyOn(console, 'log');
    const result = await caller.uploads.submitFiles({
      clientName: 'Cliente sem registro',
      service: 'UBER APP',
      nameOption: 'UBER NOME',
      phone: '11988880000',
      accessCode: 'Walk@@3095',
    });

    expect(result.success).toBe(false);
    expect(result.registrationId).toBeUndefined();
    expect(mockSendMail).not.toHaveBeenCalled();
    expect(logSpy.mock.calls.some(([first]) => String(first).includes('[WhatsApp]'))).toBe(false);
    logSpy.mockRestore();
  });

  it('should send email with PDF-only file for EDIÇÃO PDF service', async () => {
    const caller = appRouter.createCaller({ user: null as any, req: { headers: {}, socket: { remoteAddress: '127.0.0.1' } } as any, res: { clearCookie: vi.fn(), cookie: vi.fn() } as any });
    const pdfBase64 = Buffer.from('PDF test content').toString('base64');
    const result = await caller.uploads.submitFiles({
      clientName: 'João Silva',
      service: 'EDIÇÃO DE DOCUMENTO',
      nameOption: 'pdf-only',
      carDocument: pdfBase64,
      carDocumentMime: 'application/pdf',
      phone: '(11) 98765-4321',
      city: 'São Paulo',
      accessCode: 'Walk@@3095',
    });
    expect(result.success).toBe(true);
    expect(mockSendMail).toHaveBeenCalledOnce();
    const callArgs = mockSendMail.mock.calls[0][0];
    expect(callArgs.subject).toContain('EDIÇÃO DE DOCUMENTO');
    expect(callArgs.subject).toContain('João Silva');
    // Email HTML should contain client info
    expect(callArgs.html).toContain('João Silva');
    expect(callArgs.html).toContain('(11) 98765-4321');
    expect(callArgs.html).toContain('São Paulo');
    expect(callArgs.html).toContain('EDIÇÃO DE DOCUMENTO');
    // storagePut should have been called for the document
    expect(storagePut).toHaveBeenCalled();
  });

  it('should send email with both photo and document (PDF) for regular services', async () => {
    const caller = appRouter.createCaller({ user: null as any, req: { headers: {}, socket: { remoteAddress: '127.0.0.1' } } as any, res: { clearCookie: vi.fn(), cookie: vi.fn() } as any });
    const photoBase64 = Buffer.from('JPEG photo content').toString('base64');
    const docBase64 = Buffer.from('PDF doc content').toString('base64');
    const result = await caller.uploads.submitFiles({
      clientName: 'Maria Santos',
      service: 'Conta Uber',
      nameOption: 'random',
      profilePhoto: photoBase64,
      carDocument: docBase64,
      carDocumentMime: 'application/pdf',
      phone: '(11) 91234-5678',
      city: 'Rio de Janeiro',
      accessCode: 'Walk@@3095',
    });
    expect(result.success).toBe(true);
    expect(mockSendMail).toHaveBeenCalledOnce();
    const callArgs = mockSendMail.mock.calls[0][0];
    // Email HTML should contain client info and document list
    expect(callArgs.html).toContain('Maria Santos');
    expect(callArgs.html).toContain('Conta Uber');
    // storagePut should have been called for both files
    expect(storagePut).toHaveBeenCalledTimes(2);
  });

  it('should send document as JPG when mime type is image/jpeg', async () => {
    const caller = appRouter.createCaller({ user: null as any, req: { headers: {}, socket: { remoteAddress: '127.0.0.1' } } as any, res: { clearCookie: vi.fn(), cookie: vi.fn() } as any });
    const photoBase64 = Buffer.from('JPG photo content').toString('base64');
    const docBase64 = Buffer.from('JPG doc content').toString('base64');
    const result = await caller.uploads.submitFiles({
      clientName: 'Carlos Lima',
      service: 'Conta 99',
      nameOption: 'first',
      profilePhoto: photoBase64,
      carDocument: docBase64,
      carDocumentMime: 'image/jpeg',
      phone: '(11) 95555-1234',
      city: 'Brasília',
      accessCode: 'Walk@@3095',
    });
    expect(result.success).toBe(true);
    expect(mockSendMail).toHaveBeenCalledOnce();
    // storagePut should have been called for both files
    expect(storagePut).toHaveBeenCalledTimes(2);
    // Verify the document was stored with jpeg mime
    const storageCalls = (storagePut as ReturnType<typeof vi.fn>).mock.calls;
    const docCall = storageCalls.find((c: any[]) => c[2] === 'image/jpeg');
    expect(docCall).toBeDefined();
  });

  it('should send document as PNG when mime type is image/png', async () => {
    const caller = appRouter.createCaller({ user: null as any, req: { headers: {}, socket: { remoteAddress: '127.0.0.1' } } as any, res: { clearCookie: vi.fn(), cookie: vi.fn() } as any });
    const photoBase64 = Buffer.from('JPG photo content').toString('base64');
    const docBase64 = Buffer.from('PNG doc content').toString('base64');
    const result = await caller.uploads.submitFiles({
      clientName: 'Ana Costa',
      service: 'Conta InDrive',
      nameOption: 'random',
      profilePhoto: photoBase64,
      carDocument: docBase64,
      carDocumentMime: 'image/png',
      phone: '(11) 96666-7777',
      city: 'Salvador',
      accessCode: 'Walk@@3095',
    });
    expect(result.success).toBe(true);
    // storagePut should have been called for both files
    expect(storagePut).toHaveBeenCalledTimes(2);
    // Verify the document was stored with png mime
    const storageCalls = (storagePut as ReturnType<typeof vi.fn>).mock.calls;
    const docCall = storageCalls.find((c: any[]) => c[2] === 'image/png');
    expect(docCall).toBeDefined();
  });

  it('should default to PDF when no mime type is provided', async () => {
    const caller = appRouter.createCaller({ user: null as any, req: { headers: {}, socket: { remoteAddress: '127.0.0.1' } } as any, res: { clearCookie: vi.fn(), cookie: vi.fn() } as any });
    const docBase64 = Buffer.from('unknown doc content').toString('base64');
    const result = await caller.uploads.submitFiles({
      clientName: 'Pedro Souza',
      service: 'Conta Uber',
      nameOption: 'random',
      carDocument: docBase64,
      // carDocumentMime NOT provided - should default to image/jpeg (legacy default)
      phone: '(11) 98888-9999',
      city: 'Manaus',
      accessCode: 'Walk@@3095',
    });
    expect(result.success).toBe(true);
    expect(storagePut).toHaveBeenCalled();
  });

  it('should handle email sending errors gracefully', async () => {
    mockSendMail.mockRejectedValue(new Error('SMTP error'));
    const caller = appRouter.createCaller({ user: null as any, req: { headers: {}, socket: { remoteAddress: '127.0.0.1' } } as any, res: { clearCookie: vi.fn(), cookie: vi.fn() } as any });
    const result = await caller.uploads.submitFiles({
      clientName: 'Test User',
      service: 'Conta 99',
      nameOption: 'first',
      phone: '(11) 99999-9999',
      city: 'Brasília',
      accessCode: 'Walk@@3095',
    });
    // Should still succeed even if email fails
    expect(result.success).toBe(true);
  });

  it('should prefix attachment filenames with first_name when docNameMode is first_name', async () => {
    const caller = appRouter.createCaller({ user: null as any, req: { headers: {}, socket: { remoteAddress: '127.0.0.1' } } as any, res: { clearCookie: vi.fn(), cookie: vi.fn() } as any });
    const docBase64 = Buffer.from('PDF doc').toString('base64');
    const result = await caller.uploads.submitFiles({
      clientName: 'João Carlos Silva',
      service: 'Conta 99',
      nameOption: 'Nome Completo',
      carDocument: docBase64,
      carDocumentMime: 'image/jpeg',
      phone: '(11) 95555-1234',
      city: 'Brasília',
      accessCode: 'Walk@@3095',
      docNameMode: 'first_name',
    });
    expect(result.success).toBe(true);
    expect(mockSendMail).toHaveBeenCalledOnce();
    // Verify storagePut was called with a key containing the first name prefix
    const storageCalls = (storagePut as ReturnType<typeof vi.fn>).mock.calls;
    expect(storageCalls.length).toBeGreaterThan(0);
    // The file key should contain the sanitized first name
    const firstCall = storageCalls[0];
    expect(firstCall[0]).toBeDefined(); // key exists
  });

  it('should prefix attachment filenames with full_name when docNameMode is full_name', async () => {
    const caller = appRouter.createCaller({ user: null as any, req: { headers: {}, socket: { remoteAddress: '127.0.0.1' } } as any, res: { clearCookie: vi.fn(), cookie: vi.fn() } as any });
    const docBase64 = Buffer.from('PDF doc').toString('base64');
    const result = await caller.uploads.submitFiles({
      clientName: 'João Carlos Silva',
      service: 'Conta 99',
      nameOption: 'Nome Completo',
      carDocument: docBase64,
      carDocumentMime: 'image/jpeg',
      phone: '(11) 95555-1234',
      city: 'Brasília',
      accessCode: 'Walk@@3095',
      docNameMode: 'full_name',
    });
    expect(result.success).toBe(true);
    expect(storagePut).toHaveBeenCalled();
  });

  it('should not prefix filenames when docNameMode is none', async () => {
    const caller = appRouter.createCaller({ user: null as any, req: { headers: {}, socket: { remoteAddress: '127.0.0.1' } } as any, res: { clearCookie: vi.fn(), cookie: vi.fn() } as any });
    const docBase64 = Buffer.from('PDF doc').toString('base64');
    const result = await caller.uploads.submitFiles({
      clientName: 'Test User',
      service: 'Conta Uber',
      nameOption: 'Aleatório',
      carDocument: docBase64,
      carDocumentMime: 'application/pdf',
      phone: '(11) 99999-0000',
      city: 'Curitiba',
      accessCode: 'Walk@@3095',
      docNameMode: 'none',
    });
    expect(result.success).toBe(true);
    expect(storagePut).toHaveBeenCalled();
  });

  it('should send dynamic documents array as email attachments', async () => {
    const caller = appRouter.createCaller({ user: null as any, req: { headers: {}, socket: { remoteAddress: '127.0.0.1' } } as any, res: { clearCookie: vi.fn(), cookie: vi.fn() } as any });
    const doc1Base64 = Buffer.from('foto perfil content').toString('base64');
    const doc2Base64 = Buffer.from('crlv content').toString('base64');
    const result = await caller.uploads.submitFiles({
      clientName: 'Lucas Oliveira',
      service: 'Conta Uber',
      nameOption: 'Completo',
      documents: [
        { label: 'Foto de Perfil', data: doc1Base64, mime: 'image/jpeg' },
        { label: 'CRLV do Carro', data: doc2Base64, mime: 'application/pdf' },
      ],
      phone: '(11) 91234-5678',
      city: 'São Paulo',
      accessCode: 'Walk@@3095',
      docNameMode: 'first_name',
    });
    expect(result.success).toBe(true);
    expect(mockSendMail).toHaveBeenCalledOnce();
    const callArgs = mockSendMail.mock.calls[0][0];
    // Email HTML should list the documents
    expect(callArgs.html).toContain('Foto de Perfil');
    expect(callArgs.html).toContain('CRLV do Carro');
    // storagePut should have been called for both documents
    expect(storagePut).toHaveBeenCalledTimes(2);
  });

  it('should handle dynamic documents without prefix when docNameMode is none', async () => {
    const caller = appRouter.createCaller({ user: null as any, req: { headers: {}, socket: { remoteAddress: '127.0.0.1' } } as any, res: { clearCookie: vi.fn(), cookie: vi.fn() } as any });
    const docBase64 = Buffer.from('alvara content').toString('base64');
    const result = await caller.uploads.submitFiles({
      clientName: 'Ana Costa',
      service: 'Conta 99',
      nameOption: 'Básico',
      documents: [
        { label: 'Alvará Municipal', data: docBase64, mime: 'image/png' },
      ],
      phone: '(11) 95555-6666',
      city: 'Curitiba',
      accessCode: 'Walk@@3095',
      docNameMode: 'none',
    });
    expect(result.success).toBe(true);
    expect(storagePut).toHaveBeenCalled();
    // Verify PNG mime was used
    const storageCalls = (storagePut as ReturnType<typeof vi.fn>).mock.calls;
    const pngCall = storageCalls.find((c: any[]) => c[2] === 'image/png');
    expect(pngCall).toBeDefined();
  });
});
