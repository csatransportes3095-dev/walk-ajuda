import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const router = fs.readFileSync(path.resolve(root, "server/routers.ts"), "utf8");
const adminOrders = fs.readFileSync(path.resolve(root, "client/src/pages/AdminOrders.tsx"), "utf8");

describe("sincronização leve do painel de pedidos", () => {
  it("expõe somente um marcador baseado em status e agenda", () => {
    expect(router).toContain("getUpdateMarker: adminProcedure.query");
    expect(router).toContain("MAX(id) FROM orderStatusHistory");
    expect(router).toContain("MAX(id) FROM scheduleAppointments");
    expect(router).toContain("MAX(updatedAt)");
  });

  it("mantém a consulta completa em 30 segundos", () => {
    expect(adminOrders).toContain("const ordersQuery = trpc.orderStatus.listOrders.useQuery");
    expect(adminOrders).toContain("refetchInterval: 30000");
  });

  it("consulta o marcador em 3 segundos apenas em primeiro plano", () => {
    expect(adminOrders).toContain("trpc.orderStatus.getUpdateMarker.useQuery");
    expect(adminOrders).toContain("refetchInterval: 3000");
    expect(adminOrders).toContain("refetchIntervalInBackground: false");
  });

  it("recarrega a lista somente quando o marcador realmente mudar", () => {
    expect(adminOrders).toContain("if (marker === lastOrdersUpdateMarkerRef.current) return;");
    expect(adminOrders).toContain("void ordersQuery.refetch();");
  });
});
