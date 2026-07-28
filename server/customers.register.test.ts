import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { customers } from "../drizzle/schema";
import { eq } from "drizzle-orm";

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {
        "x-forwarded-for": "192.168.1.1",
      },
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("customers.register - CPF Duplicate Validation", () => {
  let db: Awaited<ReturnType<typeof getDb>> | null = null;
  const testPhone = "11987654321";
  const testCpf = "123.456.789-10";
  const testPhone2 = "11987654322";

  beforeAll(async () => {
    db = await getDb();
    // Clean up test data before running tests
    if (db) {
      await db.delete(customers).where(eq(customers.phone, testPhone));
      await db.delete(customers).where(eq(customers.phone, testPhone2));
    }
  });

  afterAll(async () => {
    // Clean up test data after running tests
    if (db) {
      await db.delete(customers).where(eq(customers.phone, testPhone));
      await db.delete(customers).where(eq(customers.phone, testPhone2));
    }
  });

  it("should allow registration with a new CPF", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.customers.register({
      name: "Test User",
      phone: testPhone,
      email: "test@example.com",
      cpf: testCpf,
      city: "São Paulo",
      uf: "SP",
      profilePhotoUrl: "https://example.com/photo.jpg",
    });

    expect(result.success).toBe(true);
    expect(result.customer).toBeDefined();
    expect(result.customer?.cpf).toBe(testCpf);
    expect(result.customer?.phone).toBe(testPhone);
  });

  it("should block registration with a duplicate CPF", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    // Try to register with the same CPF but different phone
    const result = await caller.customers.register({
      name: "Another User",
      phone: testPhone2,
      email: "another@example.com",
      cpf: testCpf,
      city: "Rio de Janeiro",
      uf: "RJ",
      profilePhotoUrl: "https://example.com/photo2.jpg",
    });

    expect(result.success).toBe(false);
    expect(result.blocked).toBe(false);
    expect(result.duplicateCpf).toBe(true);
    expect(result.message).toContain("CPF já registrado");
    expect(result.message).toContain(testPhone);
    expect(result.existingPhone).toBe(testPhone);
  });

  it("should return alreadyExists when registering with the same phone", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    // Second registration with same phone should return alreadyExists
    const result = await caller.customers.register({
      name: "User A Updated",
      phone: testPhone,
      email: "usera@example.com",
      cpf: testCpf,
      city: "São Paulo",
      uf: "SP",
      profilePhotoUrl: "https://example.com/photo.jpg",
    });

    expect(result.success).toBe(true);
    expect(result.alreadyExists).toBe(true);
    expect(result.customer?.phone).toBe(testPhone);
  });
});
