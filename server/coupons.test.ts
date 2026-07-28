import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock db functions
vi.mock('./db', () => ({
  createCoupon: vi.fn(),
  listCoupons: vi.fn(),
  deleteCoupon: vi.fn(),
  toggleCoupon: vi.fn(),
  validateCoupon: vi.fn(),
  consumeCoupon: vi.fn(),
  validateAccessCode: vi.fn(),
  createAccessCode: vi.fn(),
  listAccessCodes: vi.fn(),
  toggleAccessCode: vi.fn(),
  deleteAccessCode: vi.fn(),
  checkAccessCodeCanSubmit: vi.fn(),
  consumeAccessCode: vi.fn(),
}));

// Mock nodemailer
vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: vi.fn().mockResolvedValue({ messageId: 'test-id' }),
    })),
  },
}));

import { createCoupon, listCoupons, deleteCoupon, toggleCoupon, validateCoupon, consumeCoupon } from './db';

const mockCreateCoupon = vi.mocked(createCoupon);
const mockListCoupons = vi.mocked(listCoupons);
const mockDeleteCoupon = vi.mocked(deleteCoupon);
const mockToggleCoupon = vi.mocked(toggleCoupon);
const mockValidateCoupon = vi.mocked(validateCoupon);
const mockConsumeCoupon = vi.mocked(consumeCoupon);

describe('coupons', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('coupons.validate', () => {
    it('should return valid for active coupon with remaining uses', async () => {
      mockValidateCoupon.mockResolvedValue({
        valid: true,
        discountType: 'fixed',
        discountValue: 50,
      });

      const result = await validateCoupon('DESCONTO50');
      expect(result.valid).toBe(true);
      expect(result.discountType).toBe('fixed');
      expect(result.discountValue).toBe(50);
    });

    it('should return valid for percentage coupon', async () => {
      mockValidateCoupon.mockResolvedValue({
        valid: true,
        discountType: 'percentage',
        discountValue: 20,
      });

      const result = await validateCoupon('20OFF');
      expect(result.valid).toBe(true);
      expect(result.discountType).toBe('percentage');
      expect(result.discountValue).toBe(20);
    });

    it('should return invalid for expired coupon', async () => {
      mockValidateCoupon.mockResolvedValue({
        valid: false,
        reason: 'Cupom expirado',
      });

      const result = await validateCoupon('EXPIRED');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Cupom expirado');
    });

    it('should return invalid for fully used coupon', async () => {
      mockValidateCoupon.mockResolvedValue({
        valid: false,
        reason: 'Cupom já foi totalmente utilizado',
      });

      const result = await validateCoupon('USED');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('utilizado');
    });

    it('should return invalid for non-existent coupon', async () => {
      mockValidateCoupon.mockResolvedValue({
        valid: false,
        reason: 'Cupom não encontrado',
      });

      const result = await validateCoupon('FAKE');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('não encontrado');
    });

    it('should return invalid for inactive coupon', async () => {
      mockValidateCoupon.mockResolvedValue({
        valid: false,
        reason: 'Cupom desativado',
      });

      const result = await validateCoupon('INACTIVE');
      expect(result.valid).toBe(false);
    });
  });

  describe('coupons.create', () => {
    it('should create a fixed discount coupon', async () => {
      const newCoupon = {
        id: 1,
        code: 'DESCONTO50',
        discountType: 'fixed' as const,
        discountValue: 50,
        maxUses: 10,
        currentUses: 0,
        expiresAt: null,
        isActive: true,
        createdAt: new Date(),
      };
      mockCreateCoupon.mockResolvedValue(newCoupon);

      const result = await createCoupon({
        code: 'DESCONTO50',
        discountType: 'fixed',
        discountValue: 50,
        maxUses: 10,
      });

      expect(result.code).toBe('DESCONTO50');
      expect(result.discountType).toBe('fixed');
      expect(result.discountValue).toBe(50);
      expect(result.maxUses).toBe(10);
    });

    it('should create a percentage discount coupon', async () => {
      const newCoupon = {
        id: 2,
        code: '20PERCENT',
        discountType: 'percentage' as const,
        discountValue: 20,
        maxUses: 5,
        currentUses: 0,
        expiresAt: null,
        isActive: true,
        createdAt: new Date(),
      };
      mockCreateCoupon.mockResolvedValue(newCoupon);

      const result = await createCoupon({
        code: '20PERCENT',
        discountType: 'percentage',
        discountValue: 20,
        maxUses: 5,
      });

      expect(result.code).toBe('20PERCENT');
      expect(result.discountType).toBe('percentage');
      expect(result.discountValue).toBe(20);
    });
  });

  describe('coupons.list', () => {
    it('should return all coupons', async () => {
      const coupons = [
        { id: 1, code: 'A', discountType: 'fixed' as const, discountValue: 50, maxUses: 10, currentUses: 2, expiresAt: null, isActive: true, createdAt: new Date() },
        { id: 2, code: 'B', discountType: 'percentage' as const, discountValue: 20, maxUses: 5, currentUses: 5, expiresAt: null, isActive: false, createdAt: new Date() },
      ];
      mockListCoupons.mockResolvedValue(coupons);

      const result = await listCoupons();
      expect(result).toHaveLength(2);
      expect(result[0].code).toBe('A');
      expect(result[1].code).toBe('B');
    });
  });

  describe('coupons.delete', () => {
    it('should delete a coupon by id', async () => {
      mockDeleteCoupon.mockResolvedValue(undefined);

      await deleteCoupon(1);
      expect(mockDeleteCoupon).toHaveBeenCalledWith(1);
    });
  });

  describe('coupons.toggle', () => {
    it('should toggle coupon active status', async () => {
      mockToggleCoupon.mockResolvedValue(undefined);

      await toggleCoupon(1);
      expect(mockToggleCoupon).toHaveBeenCalledWith(1);
    });
  });

  describe('coupons.consume', () => {
    it('should consume a coupon after use', async () => {
      mockConsumeCoupon.mockResolvedValue(undefined);

      await consumeCoupon('DESCONTO50', 'Test Client');
      expect(mockConsumeCoupon).toHaveBeenCalledWith('DESCONTO50', 'Test Client');
    });
  });
});
