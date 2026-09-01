from pathlib import Path

# 1) Schema: separar a etapa por pedido + subpedido.
schema_path = Path('drizzle/schema.ts')
schema = schema_path.read_text(encoding='utf-8')
old_schema = '''export const orderStageHistory = mysqlTable("orderStageHistory", {
  id: int("id").autoincrement().primaryKey(),
  registrationId: int("registrationId").notNull(),
  stageId: int("stageId").notNull(),
  setAt: timestamp("setAt").defaultNow().notNull(),
});'''
new_schema = '''export const orderStageHistory = mysqlTable("orderStageHistory", {
  id: int("id").autoincrement().primaryKey(),
  registrationId: int("registrationId").notNull(),
  // Identifica corretamente cada item quando um mesmo registrationId possui subpedidos.
  subOrderIndex: int("subOrderIndex").notNull().default(0),
  stageId: int("stageId").notNull(),
  setAt: timestamp("setAt").defaultNow().notNull(),
});'''
if old_schema not in schema:
    raise SystemExit('ERRO: schema de orderStageHistory nao encontrado')
schema_path.write_text(schema.replace(old_schema, new_schema, 1), encoding='utf-8')

# 2) DB: novos helpers compatíveis, sem quebrar endpoints antigos.
db_path = Path('server/db.ts')
db = db_path.read_text(encoding='utf-8')
anchor = '''export async function setOrderStage(registrationId: number, stageId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(orderStageHistory).values({ registrationId, stageId, setAt: new Date() });
}
'''
addition = '''export async function setOrderStage(registrationId: number, stageId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(orderStageHistory).values({ registrationId, stageId, setAt: new Date() });
}

let orderStageSubOrderColumnReady = false;
async function ensureOrderStageSubOrderColumn(db: any): Promise<void> {
  if (orderStageSubOrderColumnReady) return;
  try {
    await db.execute(sql.raw("ALTER TABLE `orderStageHistory` ADD COLUMN IF NOT EXISTS `subOrderIndex` INT NOT NULL DEFAULT 0 AFTER `registrationId`"));
  } catch {
    try {
      await db.execute(sql.raw("ALTER TABLE `orderStageHistory` ADD COLUMN `subOrderIndex` INT NOT NULL DEFAULT 0 AFTER `registrationId`"));
    } catch {
      // Coluna já existente em bancos que não suportam IF NOT EXISTS neste ALTER.
    }
  }
  orderStageSubOrderColumnReady = true;
}

/**
 * Fonte de verdade para a etapa interna de um item do pedido.
 * Usa registrationId + subOrderIndex para não misturar subpedidos do mesmo cadastro.
 */
export async function setOrderStageForOrder(registrationId: number, subOrderIndex: number, stageId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await ensureOrderStageSubOrderColumn(db);
  await db.insert(orderStageHistory).values({
    registrationId,
    subOrderIndex: Number.isFinite(subOrderIndex) ? Math.max(0, Math.trunc(subOrderIndex)) : 0,
    stageId,
    setAt: new Date(),
  });
}

export async function getOrderCurrentStagesBatchByOrder(
  orders: Array<{ registrationId: number; subOrderIndex: number }>,
): Promise<Map<string, { registrationId: number; subOrderIndex: number; stageId: number; stageName: string; stageIcon: string; stageColor: string; setAt: Date }>> {
  const db = await getDb();
  const result = new Map<string, { registrationId: number; subOrderIndex: number; stageId: number; stageName: string; stageIcon: string; stageColor: string; setAt: Date }>();
  if (!db || orders.length === 0) return result;
  await ensureOrderStageSubOrderColumn(db);

  const targetKeys = new Set<string>();
  const registrationIds = new Set<number>();
  for (const order of orders) {
    const registrationId = Math.trunc(Number(order.registrationId));
    const subOrderIndex = Math.max(0, Math.trunc(Number(order.subOrderIndex) || 0));
    if (!Number.isFinite(registrationId) || registrationId <= 0) continue;
    targetKeys.add(`${registrationId}_${subOrderIndex}`);
    registrationIds.add(registrationId);
  }
  if (registrationIds.size === 0) return result;

  // Busca do mais novo para o mais antigo. O primeiro registro de cada chave é a etapa atual.
  const rows = await db.execute(sql`
    SELECT osh.registrationId, osh.subOrderIndex, osh.stageId, osh.setAt,
           s.name AS stageName, s.icon AS stageIcon, s.color AS stageColor
    FROM orderStageHistory osh
    INNER JOIN internalStages s ON s.id = osh.stageId
    WHERE osh.registrationId IN (${sql.join([...registrationIds].map(id => sql`${id}`), sql`, `)})
    ORDER BY osh.id DESC
  `);
  const data = (rows[0] as unknown as Array<{ registrationId: number; subOrderIndex: number; stageId: number; stageName: string; stageIcon: string; stageColor: string; setAt: Date }>);
  for (const row of data) {
    const registrationId = Number(row.registrationId);
    const subOrderIndex = Number(row.subOrderIndex || 0);
    const key = `${registrationId}_${subOrderIndex}`;
    if (!targetKeys.has(key) || result.has(key)) continue;
    result.set(key, { registrationId, subOrderIndex, stageId: Number(row.stageId), stageName: row.stageName, stageIcon: row.stageIcon, stageColor: row.stageColor, setAt: row.setAt });
  }
  return result;
}
'''
if anchor not in db:
    raise SystemExit('ERRO: setOrderStage original nao encontrado')
db_path.write_text(db.replace(anchor, addition, 1), encoding='utf-8')

# 3) Router: manter API antiga e adicionar API correta por subpedido.
router_path = Path('server/routers.ts')
router = router_path.read_text(encoding='utf-8')
old_import = '''  setOrderStage, getOrderCurrentStage, getOrderCurrentStagesBatch,
  getViewedOrderKeys, markOrderAsViewed,'''
new_import = '''  setOrderStage, getOrderCurrentStage, getOrderCurrentStagesBatch,
  setOrderStageForOrder, getOrderCurrentStagesBatchByOrder,
  getViewedOrderKeys, markOrderAsViewed,'''
if old_import not in router:
    raise SystemExit('ERRO: import de etapas nao encontrado')
router = router.replace(old_import, new_import, 1)

old_router_block = '''    setOrderStage: adminProcedure
      .input(z.object({ registrationId: z.number(), stageId: z.number() }))
      .mutation(async ({ input }) => {
        await setOrderStage(input.registrationId, input.stageId);
        return { success: true };
      }),
    getOrderStage: adminProcedure'''
new_router_block = '''    setOrderStage: adminProcedure
      .input(z.object({ registrationId: z.number(), stageId: z.number() }))
      .mutation(async ({ input }) => {
        await setOrderStage(input.registrationId, input.stageId);
        return { success: true };
      }),
    setOrderStageForOrder: adminProcedure
      .input(z.object({ registrationId: z.number(), subOrderIndex: z.number().int().nonnegative().default(0), stageId: z.number() }))
      .mutation(async ({ input }) => {
        await setOrderStageForOrder(input.registrationId, input.subOrderIndex, input.stageId);
        return { success: true };
      }),
    getOrderStage: adminProcedure'''
if old_router_block not in router:
    raise SystemExit('ERRO: procedure setOrderStage nao encontrada')
router = router.replace(old_router_block, new_router_block, 1)

old_batch = '''    getOrderStagesBatch: adminProcedure
      .input(z.object({ registrationIds: z.array(z.number()) }))
      .query(async ({ input }) => {
        const map = await getOrderCurrentStagesBatch(input.registrationIds);
        // Converter Map para array de objetos para serialização
        return Array.from(map.entries()).map(([registrationId, data]) => ({ registrationId, ...data }));
      }),'''
new_batch = '''    getOrderStagesBatch: adminProcedure
      .input(z.object({ registrationIds: z.array(z.number()) }))
      .query(async ({ input }) => {
        const map = await getOrderCurrentStagesBatch(input.registrationIds);
        // Converter Map para array de objetos para serialização
        return Array.from(map.entries()).map(([registrationId, data]) => ({ registrationId, ...data }));
      }),
    getOrderStagesBatchByOrder: adminProcedure
      .input(z.object({ orders: z.array(z.object({ registrationId: z.number(), subOrderIndex: z.number().int().nonnegative().default(0) })) }))
      .query(async ({ input }) => {
        const map = await getOrderCurrentStagesBatchByOrder(input.orders);
        return Array.from(map.values());
      }),'''
if old_batch not in router:
    raise SystemExit('ERRO: procedure batch antiga nao encontrada')
router_path.write_text(router.replace(old_batch, new_batch, 1), encoding='utf-8')

# 4) AdminOrders: chave pedido+subpedido + fonte persistida no servidor.
client_path = Path('client/src/pages/AdminOrders.tsx')
client = client_path.read_text(encoding='utf-8')
old_client_block = '''  const stagesListQuery = trpc.stages.list.useQuery();
  const [selectedStageId, setSelectedStageId] = useState<Record<number, number | null>>({});
  // IDs de todos os pedidos visíveis para batch query de etapas
  const allVisibleOrderIds = React.useMemo(
    () => ((ordersQuery.data || []) as Order[]).map(o => o.id),
    [ordersQuery.data]
  );
  const orderStagesBatchQuery = trpc.stages.getOrderStagesBatch.useQuery(
    { registrationIds: allVisibleOrderIds },
    { enabled: allVisibleOrderIds.length > 0, staleTime: 10000 }
  );
  // Mapa de registrationId -> { stageId, setAt }
  const orderStagesMap = React.useMemo(() => {
    const map = new Map<number, { stageId: number; setAt: number }>();
    (orderStagesBatchQuery.data ?? []).forEach((entry: any) => {
      if (entry.stageId) map.set(entry.registrationId, { stageId: entry.stageId, setAt: entry.setAt });
    });
    return map;
  }, [orderStagesBatchQuery.data]);
  const setOrderStageMut = trpc.stages.setOrderStage.useMutation({
    onSuccess: (_, vars) => {
      toast.success('Etapa atualizada!');
      setSelectedStageId(prev => ({ ...prev, [vars.registrationId]: vars.stageId }));
      orderStagesBatchQuery.refetch();
    },
    onError: () => toast.error('Erro ao atualizar etapa'),
  });'''
new_client_block = '''  const stagesListQuery = trpc.stages.list.useQuery();
  // Override otimista temporário por pedido+subpedido. A fonte definitiva continua sendo o banco.
  const [pendingStageByOrder, setPendingStageByOrder] = useState<Record<string, number>>({});
  const allVisibleOrderTargets = React.useMemo(() => {
    const unique = new Map<string, { registrationId: number; subOrderIndex: number }>();
    for (const order of ((ordersQuery.data || []) as Order[])) {
      const subOrderIndex = order.subOrderIndex ?? 0;
      unique.set(`${order.id}_${subOrderIndex}`, { registrationId: order.id, subOrderIndex });
    }
    // Ordem estável evita trocar a query key apenas porque a grade foi reordenada/refetchada.
    return [...unique.values()].sort((a, b) => a.registrationId - b.registrationId || a.subOrderIndex - b.subOrderIndex);
  }, [ordersQuery.data]);
  const orderStagesBatchQuery = trpc.stages.getOrderStagesBatchByOrder.useQuery(
    { orders: allVisibleOrderTargets },
    {
      enabled: allVisibleOrderTargets.length > 0,
      staleTime: 10000,
      refetchInterval: 30000,
      refetchOnWindowFocus: true,
      placeholderData: previousData => previousData,
    }
  );
  const orderStagesMap = React.useMemo(() => {
    const map = new Map<string, { stageId: number; setAt: number }>();
    (orderStagesBatchQuery.data ?? []).forEach((entry: any) => {
      if (entry.stageId) map.set(`${entry.registrationId}_${entry.subOrderIndex ?? 0}`, { stageId: entry.stageId, setAt: entry.setAt });
    });
    return map;
  }, [orderStagesBatchQuery.data]);

  // Assim que o servidor confirma a mesma etapa, removemos o override local.
  useEffect(() => {
    setPendingStageByOrder(prev => {
      let changed = false;
      const next = { ...prev };
      for (const [key, stageId] of Object.entries(prev)) {
        if (orderStagesMap.get(key)?.stageId === stageId) {
          delete next[key];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [orderStagesMap]);

  const setOrderStageMut = trpc.stages.setOrderStageForOrder.useMutation({
    onSuccess: () => {
      toast.success('Etapa salva no pedido!');
      orderStagesBatchQuery.refetch();
    },
    onError: (_err, vars) => {
      const key = `${vars.registrationId}_${vars.subOrderIndex ?? 0}`;
      setPendingStageByOrder(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      toast.error('Erro ao salvar etapa');
    },
  });'''
if old_client_block not in client:
    raise SystemExit('ERRO: bloco atual de etapas no AdminOrders nao encontrado')
client = client.replace(old_client_block, new_client_block, 1)

old_card = '''                          const batchEntry = orderStagesMap.get(order.id);
                          const currentStageId = selectedStageId[order.id] ?? batchEntry?.stageId ?? null;'''
new_card = '''                          const stageOrderKey = getOrderKey(order);
                          const batchEntry = orderStagesMap.get(stageOrderKey);
                          const currentStageId = pendingStageByOrder[stageOrderKey] ?? batchEntry?.stageId ?? null;'''
if old_card not in client:
    raise SystemExit('ERRO: leitura da etapa no card nao encontrada')
client = client.replace(old_card, new_card, 1)

old_click = '''                                      e.stopPropagation();
                                      setOrderStageMut.mutate({ registrationId: order.id, stageId: stage.id });'''
new_click = '''                                      e.stopPropagation();
                                      const stageOrderKey = getOrderKey(order);
                                      setPendingStageByOrder(prev => ({ ...prev, [stageOrderKey]: stage.id }));
                                      setOrderStageMut.mutate({ registrationId: order.id, subOrderIndex: order.subOrderIndex ?? 0, stageId: stage.id });'''
if old_click not in client:
    raise SystemExit('ERRO: clique da etapa no card nao encontrado')
client_path.write_text(client.replace(old_click, new_click, 1), encoding='utf-8')

# 5) Teste estrutural de regressão.
test_path = Path('server/internalStagePersistence.test.ts')
test_path.write_text('''import { describe, expect, it } from "vitest";\nimport fs from "node:fs";\n\nconst schema = fs.readFileSync("drizzle/schema.ts", "utf8");\nconst db = fs.readFileSync("server/db.ts", "utf8");\nconst routers = fs.readFileSync("server/routers.ts", "utf8");\nconst admin = fs.readFileSync("client/src/pages/AdminOrders.tsx", "utf8");\n\ndescribe("persistencia das etapas internas", () => {\n  it("persiste por registrationId + subOrderIndex", () => {\n    expect(schema).toContain('subOrderIndex: int("subOrderIndex").notNull().default(0)');\n    expect(db).toContain("setOrderStageForOrder(registrationId: number, subOrderIndex: number, stageId: number)");\n    expect(db).toContain("ORDER BY osh.id DESC");\n  });\n\n  it("mantem endpoints antigos e adiciona endpoints por subpedido", () => {\n    expect(routers).toContain("setOrderStageForOrder: adminProcedure");\n    expect(routers).toContain("getOrderStagesBatchByOrder: adminProcedure");\n    expect(routers).toContain("getOrderStagesBatch: adminProcedure");\n  });\n\n  it("card usa a chave completa e confirma pelo servidor", () => {\n    expect(admin).toContain("const stageOrderKey = getOrderKey(order)");\n    expect(admin).toContain("pendingStageByOrder[stageOrderKey] ?? batchEntry?.stageId ?? null");\n    expect(admin).toContain("setOrderStageForOrder.useMutation");\n    expect(admin).toContain("subOrderIndex: order.subOrderIndex ?? 0");\n    expect(admin).toContain("placeholderData: previousData => previousData");\n  });\n});\n''', encoding='utf-8')

print('Patch H2 de persistencia de etapas aplicado.')
