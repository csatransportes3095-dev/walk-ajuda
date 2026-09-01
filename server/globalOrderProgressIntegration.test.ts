import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const adminOrders = fs.readFileSync(path.resolve(process.cwd(), "client/src/pages/AdminOrders.tsx"), "utf8");
const tracking = fs.readFileSync(path.resolve(process.cwd(), "client/src/pages/OrderTracking.tsx"), "utf8");
const routers = fs.readFileSync(path.resolve(process.cwd(), "server/routers.ts"), "utf8");
const db = fs.readFileSync(path.resolve(process.cwd(), "server/db.ts"), "utf8");
const buckets = fs.readFileSync(path.resolve(process.cwd(), "shared/orderBuckets.ts"), "utf8");

describe("integração da sequência global do cliente", () => {
  it("remove a edição de progresso por pedido do ADM", () => {
    expect(adminOrders).not.toContain("<ProgressConfigPanel");
    expect(adminOrders).not.toContain("trpc.orderStatus.getProgressConfig.useQuery");
    expect(adminOrders).not.toContain("trpc.orderStatus.setProgressConfig.useMutation");
    expect(adminOrders).toContain("GlobalProgressSequenceModal");
    expect(adminOrders).toContain("Sequência do Cliente");
  });

  it("mantém a configuração antiga apenas como fallback na página do cliente", () => {
    expect(tracking).toContain("trpc.statusTypes.getProgressSequence.useQuery");
    expect(tracking).toContain("globalProgressSequenceQuery.data?.enabled !== true");
    expect(tracking).toContain("trpc.orderStatus.getProgressConfigPublic.useQuery");
  });

  it("não limita o cliente a seis etapas e renderiza toda a sequência vertical", () => {
    expect(tracking).not.toContain("progressSteps.slice(0, 6)");
    expect(tracking).not.toContain("chunkProgressKeys(progressSteps, 3)");
    expect(tracking).toContain("progressSteps.map((step: any, idx: number)");
    expect(tracking).toContain("Todas as etapas");
  });

  it("salva a sequência global sem tocar na ordem operacional", () => {
    expect(db).toContain("setGlobalOrderProgressSequence");
    expect(db).toContain("showInProgress: 0, progressOrder: 9999");
    const fnStart = db.indexOf("export async function setGlobalOrderProgressSequence");
    const fnEnd = db.indexOf("export async function deleteOrderStatusType", fnStart);
    const fn = db.slice(fnStart, fnEnd);
    expect(fn).not.toContain("sortOrder");
    expect(fn).not.toContain("orderStatusHistory");
    expect(fn).not.toContain("accessCodePhones");
    expect(fn).toContain("db.transaction");
  });

  it("só ativa o modo global após salvar explicitamente", () => {
    expect(routers).toContain('getSetting("order_progress_global_enabled")');
    expect(routers).toContain('upsertSetting("order_progress_global_enabled", "1")');
  });

  it("preserva a classificação operacional de filtros", () => {
    expect(adminOrders).toContain('import { getOperationalBucket } from "@shared/orderBuckets";');
    expect(adminOrders).toContain("getOperationalBucket(order)");
    expect(adminOrders).toContain("getOperationalBucket(o) === todosQuickFilter");
    expect(buckets).toContain('if (order.scheduleStatus === "confirmed") return "agendamento_confirmado";');
    expect(buckets).toContain('if (order.scheduleStatus === "pending") return "agendamento";');
    expect(buckets).toContain('["em_analise", "foto_em_analise", "foto_em_anal"]');
    expect(buckets).toContain('["aguardando_ativa", "aguardando_ficar_ativa"]');
    expect(buckets).toContain('["entregue", "pedido_entregue", "cancelado"]');
  });

  it("não mistura a sequência do cliente com Arquivo ou RG/CNH", () => {
    expect(routers).toContain("UPDATE accessCodePhones SET archived = 1");
    expect(routers).toContain("WHERE acp.archived = 1");
    expect(routers).toContain("UPDATE accessCodePhones SET rgCnhApproved = 1");
    expect(routers).toContain("WHERE acp.rgCnhApproved = 1");
  });
});
