import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAdminContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "admin-user-test",
    email: "admin@test.com",
    name: "Admin User",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };

  return { ctx };
}

function createUserContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 2,
    openId: "regular-user-test",
    email: "user@test.com",
    name: "Regular User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };

  return { ctx };
}

function createPublicContext(): { ctx: TrpcContext } {
  const ctx: TrpcContext = {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };

  return { ctx };
}

describe("Admin access control", () => {
  it("admin can call admin-only product list", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);
    // Should not throw - admin has access
    const result = await caller.products.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("regular user cannot call admin-only product list", async () => {
    const { ctx } = createUserContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.products.list()).rejects.toThrow();
  });

  it("unauthenticated user cannot call admin-only product list", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.products.list()).rejects.toThrow();
  });

  it("admin can call admin-only access code list", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.access.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("regular user cannot call admin-only access code list", async () => {
    const { ctx } = createUserContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.access.list()).rejects.toThrow();
  });

  it("admin can call admin-only coupon list", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.coupons.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("regular user cannot call admin-only coupon list", async () => {
    const { ctx } = createUserContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.coupons.list()).rejects.toThrow();
  });
});

describe("Public endpoints", () => {
  it("public user can list active products", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.products.listActive();
    expect(Array.isArray(result)).toBe(true);
  });

  it("public user can get all settings", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.settings.getAll();
    expect(typeof result).toBe("object");
  });

  it("public user can validate access code", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.access.validate({ code: "nonexistent-code-xyz" });
    expect(result).toHaveProperty("valid");
    expect(result).toHaveProperty("type");
  });

  it("public user can validate coupon", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.coupons.validate({ code: "NONEXISTENT" });
    expect(result).toHaveProperty("valid");
    expect(result.valid).toBe(false);
  });
});

describe("Settings update (admin only)", () => {
  it("admin can update settings", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.settings.update({
      settings: { test_key: "test_value" },
    });
    expect(result).toEqual({ success: true });
  });

  it("regular user cannot update settings", async () => {
    const { ctx } = createUserContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.settings.update({ settings: { test_key: "test_value" } })
    ).rejects.toThrow();
  });
});

describe("Auth endpoints", () => {
  it("public user can query auth.me (returns null)", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).toBeNull();
  });

  it("authenticated user can query auth.me (returns user)", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).not.toBeNull();
    expect(result?.openId).toBe("admin-user-test");
    expect(result?.role).toBe("admin");
  });

  it("logout clears cookie and returns success", async () => {
    const clearedCookies: { name: string }[] = [];
    const user: AuthenticatedUser = {
      id: 1, openId: "test", email: "t@t.com", name: "T",
      loginMethod: "manus", role: "user",
      createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    };
    const ctx: TrpcContext = {
      user,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: {
        clearCookie: (name: string) => { clearedCookies.push({ name }); },
      } as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(1);
    expect(clearedCookies[0]?.name).toBe(COOKIE_NAME);
  });
});

describe("Admin product CRUD", () => {
  it("admin can create a product", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.products.create({
      name: "TEST PRODUCT " + Date.now(),
      description: "Test product description",
      buttonText: "COMPRAR TEST",
    });
    expect(result).toHaveProperty("success");
    expect(result.success).toBe(true);
    if (result.success && result.product) {
      expect(result.product.name).toContain("TEST PRODUCT");
      // Cleanup
      await caller.products.delete({ id: result.product.id });
    }
  });

  it("admin can toggle product visibility", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);
    // Create a test product
    const createResult = await caller.products.create({
      name: "TOGGLE TEST " + Date.now(),
    });
    if (createResult.success && createResult.product) {
      const toggleResult = await caller.products.toggle({
        id: createResult.product.id,
        isActive: false,
      });
      expect(toggleResult).toEqual({ success: true });
      // Cleanup
      await caller.products.delete({ id: createResult.product.id });
    }
  });

  it("admin can create product with cardColor", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.products.create({
      name: "COLOR TEST " + Date.now(),
      cardColor: "#dc2626",
    });
    expect(result.success).toBe(true);
    if (result.success && result.product) {
      expect(result.product.cardColor).toBe("#dc2626");
      // Cleanup
      await caller.products.delete({ id: result.product.id });
    }
  });

  it("admin can update product cardColor", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);
    const createResult = await caller.products.create({
      name: "COLOR UPDATE TEST " + Date.now(),
    });
    expect(createResult.success).toBe(true);
    if (createResult.success && createResult.product) {
      expect(createResult.product.cardColor).toBeNull();
      // Update color
      await caller.products.update({ id: createResult.product.id, cardColor: "#16a34a" });
      const list = await caller.products.list();
      const updated = list.find((p: any) => p.id === createResult.product!.id);
      expect(updated?.cardColor).toBe("#16a34a");
      // Remove color
      await caller.products.update({ id: createResult.product.id, cardColor: null });
      const list2 = await caller.products.list();
      const updated2 = list2.find((p: any) => p.id === createResult.product!.id);
      expect(updated2?.cardColor).toBeNull();
      // Cleanup
      await caller.products.delete({ id: createResult.product.id });
    }
  });

  it("admin can create product with all 4 color layers", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.products.create({
      name: "4COLORS TEST " + Date.now(),
      cardColor: "#dc2626",
      cardBgColor: "#1e1b4b",
      cardTextColor: "#00ff00",
      cardBtnColor: "#ffcc00",
    });
    expect(result.success).toBe(true);
    if (result.success && result.product) {
      expect(result.product.cardColor).toBe("#dc2626");
      expect(result.product.cardBgColor).toBe("#1e1b4b");
      expect(result.product.cardTextColor).toBe("#00ff00");
      expect(result.product.cardBtnColor).toBe("#ffcc00");
      await caller.products.delete({ id: result.product.id });
    }
  });

  it("admin can update individual color layers", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);
    const createResult = await caller.products.create({
      name: "LAYER UPDATE TEST " + Date.now(),
    });
    expect(createResult.success).toBe(true);
    if (createResult.success && createResult.product) {
      expect(createResult.product.cardBgColor).toBeNull();
      expect(createResult.product.cardTextColor).toBeNull();
      expect(createResult.product.cardBtnColor).toBeNull();
      // Update bg and text colors
      await caller.products.update({ id: createResult.product.id, cardBgColor: "#0f0f23", cardTextColor: "#ff6600" });
      const list = await caller.products.list();
      const updated = list.find((p: any) => p.id === createResult.product!.id);
      expect(updated?.cardBgColor).toBe("#0f0f23");
      expect(updated?.cardTextColor).toBe("#ff6600");
      expect(updated?.cardBtnColor).toBeNull();
      // Update btn color and remove text color
      await caller.products.update({ id: createResult.product.id, cardBtnColor: "#22c55e", cardTextColor: null });
      const list2 = await caller.products.list();
      const updated2 = list2.find((p: any) => p.id === createResult.product!.id);
      expect(updated2?.cardBtnColor).toBe("#22c55e");
      expect(updated2?.cardTextColor).toBeNull();
      // Cleanup
      await caller.products.delete({ id: createResult.product.id });
    }
  });
});

describe("Admin product reorder", () => {
  it("admin can reorder products", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);
    // Create 3 test products
    const ts = Date.now();
    const r1 = await caller.products.create({ name: "REORDER A " + ts });
    const r2 = await caller.products.create({ name: "REORDER B " + ts });
    const r3 = await caller.products.create({ name: "REORDER C " + ts });
    expect(r1.success && r2.success && r3.success).toBe(true);
    const id1 = r1.success ? r1.product!.id : 0;
    const id2 = r2.success ? r2.product!.id : 0;
    const id3 = r3.success ? r3.product!.id : 0;
    // Reorder: C, A, B
    const reorderResult = await caller.products.reorder({ orderedIds: [id3, id1, id2] });
    expect(reorderResult).toEqual({ success: true });
    // Verify order
    const list = await caller.products.list();
    const reordered = list.filter(p => [id1, id2, id3].includes(p.id));
    const sortedByOrder = reordered.sort((a, b) => a.sortOrder - b.sortOrder);
    expect(sortedByOrder[0].id).toBe(id3);
    expect(sortedByOrder[1].id).toBe(id1);
    expect(sortedByOrder[2].id).toBe(id2);
    // Cleanup
    await caller.products.delete({ id: id1 });
    await caller.products.delete({ id: id2 });
    await caller.products.delete({ id: id3 });
  });

  it("regular user cannot reorder products", async () => {
    const { ctx } = createUserContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.products.reorder({ orderedIds: [1, 2] })).rejects.toThrow();
  });
});

describe("Admin product image upload", () => {
  it("admin can upload image to a product", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);
    // Create a test product first
    const createResult = await caller.products.create({
      name: "IMG TEST " + Date.now(),
    });
    expect(createResult.success).toBe(true);
    if (createResult.success && createResult.product) {
      // Upload a tiny 1x1 PNG (base64)
      const tinyPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      const uploadResult = await caller.products.uploadImage({
        productId: createResult.product.id,
        imageBase64: tinyPng,
        mimeType: "image/png",
      });
      expect(uploadResult).toHaveProperty("success");
      expect(uploadResult.success).toBe(true);
      if (uploadResult.success) {
        expect(uploadResult.url).toBeTruthy();
      }
      // Verify iconUrl was updated
      const products = await caller.products.list();
      const updated = products.find((p: any) => p.id === createResult.product!.id);
      expect(updated?.iconUrl).toBeTruthy();
      // Cleanup
      await caller.products.delete({ id: createResult.product.id });
    }
  });

  it("regular user cannot upload product image", async () => {
    const { ctx } = createUserContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.products.uploadImage({
        productId: 999,
        imageBase64: "dGVzdA==",
        mimeType: "image/png",
      })
    ).rejects.toThrow();
  });
});

describe("Admin access code management", () => {
  it("admin can create and delete an access code", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);
    const code = "TESTVIP" + Date.now();
    const createResult = await caller.access.create({
      code,
      clientName: "Test Client",
    });
    expect(createResult).toHaveProperty("success");
    expect(createResult.success).toBe(true);
    if (createResult.success && createResult.accessCode) {
      expect(createResult.accessCode.code).toBe(code);
      // Renew
      const renewResult = await caller.access.renew({
        id: createResult.accessCode.id,
        minutes: 30,
      });
      expect(renewResult.success).toBe(true);
      // Delete
      const deleteResult = await caller.access.delete({
        id: createResult.accessCode.id,
      });
      expect(deleteResult).toEqual({ success: true });
    }
  });
});

describe("Admin product options with document config", () => {
  it("admin can create product option with document requirements and docNameMode", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // Create a test product first
    const prodResult = await caller.products.create({
      name: "OPT DOC TEST " + Date.now(),
    });
    expect(prodResult.success).toBe(true);

    if (prodResult.success && prodResult.product) {
      // Create option with document requirements
      const optResult = await caller.productOptions.create({
        productId: prodResult.product.id,
        label: "Nome Completo",
        price: "R$ 500,00",
        type: "full",
        requireProfilePhoto: true,
        requireCarDocument: true,
        requireAlvara: false,
        requireCondutaxi: false,
        requireVehicle2016: true,
        isPdfOnly: false,
        showYearField: true,
        docNameMode: "full_name",
      });
      expect(optResult.success).toBe(true);

      // List options and verify document fields
      const options = await caller.productOptions.list({ productId: prodResult.product.id });
      expect(options.length).toBeGreaterThanOrEqual(1);
      const opt = options.find((o: any) => o.label === "Nome Completo");
      expect(opt).toBeDefined();
      expect(opt.requireProfilePhoto).toBe(1);
      expect(opt.requireCarDocument).toBe(1);
      expect(opt.requireAlvara).toBe(0);
      expect(opt.requireCondutaxi).toBe(0);
      expect(opt.requireVehicle2016).toBe(1);
      expect(opt.isPdfOnly).toBe(0);
      expect(opt.showYearField).toBe(1);
      expect(opt.docNameMode).toBe("full_name");

      // Update option document config
      const updateResult = await caller.productOptions.update({
        id: opt.id,
        docNameMode: "first_name",
        requireAlvara: 1,
      });
      expect(updateResult.success).toBe(true);

      // Verify update
      const updatedOptions = await caller.productOptions.list({ productId: prodResult.product.id });
      const updatedOpt = updatedOptions.find((o: any) => o.id === opt.id);
      expect(updatedOpt.docNameMode).toBe("first_name");
      expect(updatedOpt.requireAlvara).toBe(1);

      // Cleanup
      await caller.productOptions.delete({ id: opt.id });
      await caller.products.delete({ id: prodResult.product.id });
    }
  });

  it("admin can create option with custom docNameMode and docCustomName", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const prodResult = await caller.products.create({ name: "CUSTOM DOC NAME TEST " + Date.now() });
    expect(prodResult.success).toBe(true);

    if (prodResult.success && prodResult.product) {
      const optResult = await caller.productOptions.create({
        productId: prodResult.product.id,
        label: "Nome Personalizado",
        price: "R$ 500,00",
        docNameMode: "custom",
        docCustomName: "meu-nome-custom",
        requireProfilePhoto: true,
      });
      expect(optResult.success).toBe(true);

      const options = await caller.productOptions.list({ productId: prodResult.product.id });
      const opt = options.find((o: any) => o.label === "Nome Personalizado");
      expect(opt).toBeDefined();
      expect(opt.docNameMode).toBe("custom");
      expect(opt.docCustomName).toBe("meu-nome-custom");
      expect(opt.requireProfilePhoto).toBe(1);

      // Update docCustomName
      await caller.productOptions.update({ id: opt.id, docCustomName: "novo-nome" });
      const updated = await caller.productOptions.list({ productId: prodResult.product.id });
      const updatedOpt = updated.find((o: any) => o.id === opt.id);
      expect(updatedOpt.docCustomName).toBe("novo-nome");

      // Cleanup
      await caller.productOptions.delete({ id: opt.id });
      await caller.products.delete({ id: prodResult.product.id });
    }
  });

  it("admin can create option without document fields (defaults)", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const prodResult = await caller.products.create({
      name: "OPT DEFAULT TEST " + Date.now(),
    });
    expect(prodResult.success).toBe(true);

    if (prodResult.success && prodResult.product) {
      // Create option without document fields - should use defaults
      const optResult = await caller.productOptions.create({
        productId: prodResult.product.id,
        label: "Aleatório",
        price: "R$ 350,00",
      });
      expect(optResult.success).toBe(true);

      const options = await caller.productOptions.list({ productId: prodResult.product.id });
      const opt = options.find((o: any) => o.label === "Aleatório");
      expect(opt).toBeDefined();
      expect(opt.requireProfilePhoto).toBe(0);
      expect(opt.requireCarDocument).toBe(0);
      expect(opt.docNameMode).toBe("none");

      // Cleanup
      await caller.productOptions.delete({ id: opt.id });
      await caller.products.delete({ id: prodResult.product.id });
    }
  });
});

describe("Admin optionDocuments CRUD", () => {
  it("admin can create, list, and delete option documents", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // Create a test product and option
    const prodResult = await caller.products.create({
      name: "DOC CRUD TEST " + Date.now(),
    });
    expect(prodResult.success).toBe(true);

    if (prodResult.success && prodResult.product) {
      const optResult = await caller.productOptions.create({
        productId: prodResult.product.id,
        label: "Opção com Docs",
        price: "R$ 400,00",
      });
      expect(optResult.success).toBe(true);

      if (optResult.success && optResult.option) {
        // Create documents
        const doc1Result = await caller.optionDocuments.create({
          optionId: optResult.option.id,
          label: "Foto de Perfil",
          sortOrder: 1,
        });
        expect(doc1Result.success).toBe(true);

        const doc2Result = await caller.optionDocuments.create({
          optionId: optResult.option.id,
          label: "CRLV do Carro",
          sortOrder: 2,
        });
        expect(doc2Result.success).toBe(true);

        // List documents
        const docs = await caller.optionDocuments.list({ optionId: optResult.option.id });
        expect(docs.length).toBe(2);
        expect(docs[0].label).toBe("Foto de Perfil");
        expect(docs[1].label).toBe("CRLV do Carro");

        // Delete a document
        if (doc1Result.success && doc1Result.document) {
          const delResult = await caller.optionDocuments.delete({ id: doc1Result.document.id });
          expect(delResult).toEqual({ success: true });
        }

        // Verify deletion
        const docsAfterDelete = await caller.optionDocuments.list({ optionId: optResult.option.id });
        expect(docsAfterDelete.length).toBe(1);
        expect(docsAfterDelete[0].label).toBe("CRLV do Carro");

        // Cleanup
        await caller.productOptions.delete({ id: optResult.option.id });
      }
      await caller.products.delete({ id: prodResult.product.id });
    }
  });

  it("deleting an option also deletes its documents", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const prodResult = await caller.products.create({
      name: "DOC CASCADE TEST " + Date.now(),
    });
    expect(prodResult.success).toBe(true);

    if (prodResult.success && prodResult.product) {
      const optResult = await caller.productOptions.create({
        productId: prodResult.product.id,
        label: "Opção Cascade",
        price: "R$ 300,00",
      });
      expect(optResult.success).toBe(true);

      if (optResult.success && optResult.option) {
        // Create documents
        await caller.optionDocuments.create({
          optionId: optResult.option.id,
          label: "Doc A",
        });
        await caller.optionDocuments.create({
          optionId: optResult.option.id,
          label: "Doc B",
        });

        // Verify documents exist
        const docs = await caller.optionDocuments.list({ optionId: optResult.option.id });
        expect(docs.length).toBe(2);

        // Delete the option (should cascade delete documents)
        await caller.productOptions.delete({ id: optResult.option.id });

        // Verify documents were deleted
        const docsAfter = await caller.optionDocuments.list({ optionId: optResult.option.id });
        expect(docsAfter.length).toBe(0);
      }
      await caller.products.delete({ id: prodResult.product.id });
    }
  });

  it("regular user cannot create option documents", async () => {
    const { ctx } = createUserContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.optionDocuments.create({
        optionId: 999,
        label: "Unauthorized Doc",
      })
    ).rejects.toThrow();
  });

  it("products.list includes documents in options", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const prodResult = await caller.products.create({
      name: "DOC LIST TEST " + Date.now(),
    });
    expect(prodResult.success).toBe(true);

    if (prodResult.success && prodResult.product) {
      const optResult = await caller.productOptions.create({
        productId: prodResult.product.id,
        label: "Opção com Docs List",
        price: "R$ 250,00",
      });
      expect(optResult.success).toBe(true);

      if (optResult.success && optResult.option) {
        await caller.optionDocuments.create({
          optionId: optResult.option.id,
          label: "Foto 3x4",
          sortOrder: 1,
        });

        // List products and verify documents are included
        const products = await caller.products.list();
        const prod = products.find((p: any) => p.id === prodResult.product!.id);
        expect(prod).toBeDefined();
        expect(prod.options.length).toBeGreaterThanOrEqual(1);
        const opt = prod.options.find((o: any) => o.id === optResult.option!.id);
        expect(opt).toBeDefined();
        expect(opt.documents).toBeDefined();
        expect(opt.documents.length).toBe(1);
        expect(opt.documents[0].label).toBe("Foto 3x4");

        // Cleanup
        await caller.productOptions.delete({ id: optResult.option.id });
      }
      await caller.products.delete({ id: prodResult.product.id });
    }
  });
});
