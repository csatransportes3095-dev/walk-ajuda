import { describe, expect, it, vi } from "vitest";
import {
  isPersistedPublicOrder,
  notifyOnlyAfterPersistence,
  persistPublicOrder,
  type OrderPersistenceStore,
} from "./orderPersistence";

function createStore(overrides: Partial<OrderPersistenceStore> = {}): OrderPersistenceStore {
  return {
    findAccessCodeId: vi.fn().mockResolvedValue(undefined),
    createAccessCode: vi.fn().mockResolvedValue(101),
    createAccessCodePhone: vi.fn().mockResolvedValue(202),
    findRegistrationIdByCodeAndPhone: vi.fn().mockResolvedValue(undefined),
    findRegistrationIdByCodeIdAndPhone: vi.fn().mockResolvedValue(undefined),
    findRegistrationIdByPhone: vi.fn().mockResolvedValue(undefined),
    findInitialStatus: vi.fn().mockResolvedValue("pedido_recebido"),
    countOrderHistoryByPhone: vi.fn().mockResolvedValue(0),
    ...overrides,
  };
}

const baseInput = {
  effectivePhone: "(11) 99999-0000",
  cpTokenValid: true,
  clientName: "Cliente Teste",
  serviceName: "UBER APP",
  serviceOption: "UBER NOME",
  pricePaid: "R$ 700,00",
};

describe("persistPublicOrder", () => {
  it("materializa cpToken como acesso VIP, cria registrationId e grava status inicial", async () => {
    const store = createStore();
    const addOrderStatus = vi.fn().mockResolvedValue({ id: 303 });
    const generateOrderNumber = vi.fn().mockResolvedValue(404);

    const result = await persistPublicOrder(baseInput, {
      store,
      addOrderStatus,
      generateOrderNumber,
      now: () => 1700000000000,
      createId: () => "fixture-id-12345678",
    });

    expect(result).toMatchObject({
      registrationId: 202,
      orderStatusId: 303,
      orderNumber: 404,
      initialStatus: "pedido_recebido",
    });
    expect(store.createAccessCode).toHaveBeenCalledWith(expect.objectContaining({
      code: "__cptoken__",
      type: "vip",
    }));
    expect(store.createAccessCodePhone).toHaveBeenCalledWith(101, "11999990000", 0);
    expect(addOrderStatus).toHaveBeenCalledWith(expect.objectContaining({
      registrationId: 202,
      orderNumber: 404,
      customerPhone: "11999990000",
      status: "pedido_recebido",
    }));
  });

  it("reutiliza registrationId de uma senha VIP existente sem criar outro código", async () => {
    const store = createStore({
      findRegistrationIdByCodeAndPhone: vi.fn().mockResolvedValue(505),
    });
    const addOrderStatus = vi.fn().mockResolvedValue({ id: 606 });

    const result = await persistPublicOrder({
      ...baseInput,
      cpTokenValid: false,
      accessCode: "VIP-EXISTENTE",
    }, {
      store,
      addOrderStatus,
      generateOrderNumber: vi.fn().mockResolvedValue(707),
    });

    expect(result.registrationId).toBe(505);
    expect(store.createAccessCode).not.toHaveBeenCalled();
    expect(store.createAccessCodePhone).not.toHaveBeenCalled();
    expect(addOrderStatus).toHaveBeenCalledWith(expect.objectContaining({ registrationId: 505 }));
  });

  it("mantém o tipo general para a senha geral", async () => {
    const store = createStore();
    const addOrderStatus = vi.fn().mockResolvedValue({ id: 808 });

    await persistPublicOrder({
      ...baseInput,
      cpTokenValid: false,
      accessCode: "SENHA-GERAL",
      generalPassword: "SENHA-GERAL",
    }, {
      store,
      addOrderStatus,
      generateOrderNumber: vi.fn().mockResolvedValue(909),
    });

    expect(store.createAccessCode).toHaveBeenCalledWith(expect.objectContaining({
      code: "__general__",
      type: "general",
    }));
  });

  it("rejeita quando nenhum registrationId pode ser criado e não libera notificação", async () => {
    const store = createStore({
      createAccessCode: vi.fn().mockResolvedValue(undefined),
      findRegistrationIdByPhone: vi.fn().mockResolvedValue(undefined),
    });
    const addOrderStatus = vi.fn();
    const notify = vi.fn().mockResolvedValue(undefined);

    await expect(persistPublicOrder({
      ...baseInput,
      cpTokenValid: false,
      accessCode: "VIP-INEXISTENTE",
    }, {
      store,
      addOrderStatus,
      generateOrderNumber: vi.fn().mockResolvedValue(1),
    })).rejects.toThrow("registrationId não foi criado");

    expect(addOrderStatus).not.toHaveBeenCalled();
    await expect(notifyOnlyAfterPersistence(undefined, notify)).resolves.toBeUndefined();
    expect(notify).not.toHaveBeenCalled();
  });

  it("não considera persistido um resultado sem status inicial válido", () => {
    expect(isPersistedPublicOrder({ registrationId: 10, orderStatusId: 20, initialStatus: "ok", previousOrderCount: 0 })).toBe(true);
    expect(isPersistedPublicOrder({ registrationId: 10, orderStatusId: 0 })).toBe(false);
    expect(isPersistedPublicOrder({ registrationId: 0, orderStatusId: 20 })).toBe(false);
  });
});
