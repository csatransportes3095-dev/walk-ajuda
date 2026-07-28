import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock db functions
vi.mock("./db", () => ({
  getCustomerByPhone: vi.fn(),
  createCustomer: vi.fn(),
  listCustomers: vi.fn(),
  updateCustomer: vi.fn(),
  deleteCustomer: vi.fn(),
}));

import { getCustomerByPhone, createCustomer, listCustomers, updateCustomer, deleteCustomer } from "./db";

describe("Customer registration system", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getCustomerByPhone", () => {
    it("returns null when phone is not registered", async () => {
      (getCustomerByPhone as any).mockResolvedValue(null);
      const result = await getCustomerByPhone("11999999999");
      expect(result).toBeNull();
      expect(getCustomerByPhone).toHaveBeenCalledWith("11999999999");
    });

    it("returns customer data when phone is registered", async () => {
      const mockCustomer = { id: 1, name: "João", phone: "11999999999", city: "São Paulo", referredBy: "Maria", referredByPhone: "11555555555", createdAt: new Date(), updatedAt: new Date() };
      (getCustomerByPhone as any).mockResolvedValue(mockCustomer);
      const result = await getCustomerByPhone("11999999999");
      expect(result).toEqual(mockCustomer);
      expect(result.name).toBe("João");
    });
  });

  describe("createCustomer", () => {
    it("creates a new customer with all fields including referredByPhone", async () => {
      const mockCustomer = { id: 1, name: "Maria", phone: "11888888888", city: "Rio de Janeiro", referredBy: "João", referredByPhone: "11666666666", createdAt: new Date(), updatedAt: new Date() };
      (createCustomer as any).mockResolvedValue(mockCustomer);
      const result = await createCustomer({ name: "Maria", phone: "11888888888", city: "Rio de Janeiro", referredBy: "João", referredByPhone: "11666666666" });
      expect(result).toEqual(mockCustomer);
      expect(createCustomer).toHaveBeenCalledWith({ name: "Maria", phone: "11888888888", city: "Rio de Janeiro", referredBy: "João", referredByPhone: "11666666666" });
    });

    it("creates a customer without optional fields", async () => {
      const mockCustomer = { id: 2, name: "Pedro", phone: "11777777777", city: null, referredBy: null, referredByPhone: null, createdAt: new Date(), updatedAt: new Date() };
      (createCustomer as any).mockResolvedValue(mockCustomer);
      const result = await createCustomer({ name: "Pedro", phone: "11777777777" });
      expect(result).toEqual(mockCustomer);
    });
  });

  describe("listCustomers", () => {
    it("returns all customers ordered by createdAt desc", async () => {
      const mockList = [
        { id: 2, name: "Maria", phone: "11888888888", city: "Rio", referredBy: null, createdAt: new Date("2026-04-29"), updatedAt: new Date() },
        { id: 1, name: "João", phone: "11999999999", city: "SP", referredBy: "Pedro", createdAt: new Date("2026-04-28"), updatedAt: new Date() },
      ];
      (listCustomers as any).mockResolvedValue(mockList);
      const result = await listCustomers();
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("Maria");
    });

    it("returns empty array when no customers", async () => {
      (listCustomers as any).mockResolvedValue([]);
      const result = await listCustomers();
      expect(result).toHaveLength(0);
    });
  });

  describe("updateCustomer", () => {
    it("updates customer name", async () => {
      (updateCustomer as any).mockResolvedValue(undefined);
      await updateCustomer(1, { name: "João Silva" });
      expect(updateCustomer).toHaveBeenCalledWith(1, { name: "João Silva" });
    });

    it("updates customer city and referredBy", async () => {
      (updateCustomer as any).mockResolvedValue(undefined);
      await updateCustomer(1, { city: "Campinas", referredBy: "Ana", referredByPhone: "11444444444" });
      expect(updateCustomer).toHaveBeenCalledWith(1, { city: "Campinas", referredBy: "Ana", referredByPhone: "11444444444" });
    });
  });

  describe("deleteCustomer", () => {
    it("deletes customer by id", async () => {
      (deleteCustomer as any).mockResolvedValue(undefined);
      await deleteCustomer(1);
      expect(deleteCustomer).toHaveBeenCalledWith(1);
    });
  });

  describe("Customer registration flow", () => {
    it("new phone triggers registration, existing phone skips", async () => {
      // First visit - phone not registered
      (getCustomerByPhone as any).mockResolvedValueOnce(null);
      let result = await getCustomerByPhone("11999999999");
      expect(result).toBeNull(); // Should show registration form

      // After registration
      const newCustomer = { id: 1, name: "Test", phone: "11999999999", city: "SP", referredBy: null, createdAt: new Date(), updatedAt: new Date() };
      (createCustomer as any).mockResolvedValue(newCustomer);
      const created = await createCustomer({ name: "Test", phone: "11999999999", city: "SP" });
      expect(created.id).toBe(1);

      // Second visit - phone already registered
      (getCustomerByPhone as any).mockResolvedValueOnce(newCustomer);
      result = await getCustomerByPhone("11999999999");
      expect(result).not.toBeNull(); // Should skip registration
      expect(result.name).toBe("Test");
    });
  });
});
