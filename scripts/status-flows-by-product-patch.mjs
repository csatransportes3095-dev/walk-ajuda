import fs from "node:fs";

function read(path) { return fs.readFileSync(path, "utf8"); }
function write(path, content) { fs.writeFileSync(path, content, "utf8"); }
function replaceOnce(text, oldText, newText, label) {
  const count = text.split(oldText).length - 1;
  if (count !== 1) throw new Error(label + ": expected 1 match, found " + count);
  return text.replace(oldText, newText);
}
function replaceNth(text, oldText, newText, nth, label) {
  let from = 0;
  let idx = -1;
  for (let i = 0; i < nth; i++) {
    idx = text.indexOf(oldText, from);
    if (idx < 0) throw new Error(label + ": occurrence " + nth + " not found");
    from = idx + oldText.length;
  }
  return text.slice(0, idx) + newText + text.slice(idx + oldText.length);
}

// ---------- drizzle/schema.ts ----------
{
  const path = "drizzle/schema.ts";
  let s = read(path);
  if (!s.includes('mysqlTable("orderStatusFlows"')) {
    const marker = `export type OrderStatusType = typeof orderStatusTypes.$inferSelect;
export type InsertOrderStatusType = typeof orderStatusTypes.$inferInsert;

// Contador de pedidos (AUTO_INCREMENT = 10000)
`;
    const insert = `export type OrderStatusType = typeof orderStatusTypes.$inferSelect;
export type InsertOrderStatusType = typeof orderStatusTypes.$inferInsert;

// Sequências de status por produto.
export const orderStatusFlows = mysqlTable("orderStatusFlows", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),
  isDefault: int("isDefault").notNull().default(0),
  isActive: int("isActive").notNull().default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type OrderStatusFlow = typeof orderStatusFlows.$inferSelect;
export type InsertOrderStatusFlow = typeof orderStatusFlows.$inferInsert;

export const orderStatusFlowItems = mysqlTable("orderStatusFlowItems", {
  id: int("id").autoincrement().primaryKey(),
  flowId: int("flowId").notNull(),
  statusKey: varchar("statusKey", { length: 64 }).notNull(),
  sortOrder: int("sortOrder").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type OrderStatusFlowItem = typeof orderStatusFlowItems.$inferSelect;
export type InsertOrderStatusFlowItem = typeof orderStatusFlowItems.$inferInsert;

export const productStatusFlows = mysqlTable("productStatusFlows", {
  id: int("id").autoincrement().primaryKey(),
  productId: int("productId").notNull().unique(),
  flowId: int("flowId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ProductStatusFlow = typeof productStatusFlows.$inferSelect;

export const orderStatusFlowAssignments = mysqlTable("orderStatusFlowAssignments", {
  id: int("id").autoincrement().primaryKey(),
  registrationId: int("registrationId").notNull(),
  orderStatusId: int("orderStatusId").notNull().unique(),
  orderNumber: int("orderNumber"),
  productId: int("productId"),
  optionId: int("optionId"),
  flowId: int("flowId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type OrderStatusFlowAssignment = typeof orderStatusFlowAssignments.$inferSelect;

// Contador de pedidos (AUTO_INCREMENT = 10000)
`;
    s = replaceOnce(s, marker, insert, "schema status flow tables");
    write(path, s);
  }
}

// ---------- server/db.ts ----------
{
  const path = "server/db.ts";
  let s = read(path);
  if (!s.includes("ensureOrderStatusFlowTables")) {
    const marker = `export async function deleteOrderStatusType(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // Permite excluir qualquer status (admin tem controle total)
  await db.delete(orderStatusTypes).where(sql`\${orderStatusTypes.id} = \${id}`);
}

// ========== INFO BANNERS ==========
`;

    const block = `export async function deleteOrderStatusType(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // Permite excluir qualquer status (admin tem controle total)
  await db.delete(orderStatusTypes).where(sql`\${orderStatusTypes.id} = \${id}`);
}

// ── Sequências de status por produto ─────────────────────────────────────────
let orderStatusFlowTablesPromise: Promise<void> | null = null;

export async function ensureOrderStatusFlowTables(): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (!orderStatusFlowTablesPromise) {
    orderStatusFlowTablesPromise = (async () => {
      await db.execute(sql.raw(`
        CREATE TABLE IF NOT EXISTS orderStatusFlows (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(128) NOT NULL,
          description TEXT NULL,
          isDefault TINYINT NOT NULL DEFAULT 0,
          isActive TINYINT NOT NULL DEFAULT 1,
          createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_order_status_flows_default (isDefault, isActive)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `));
      await db.execute(sql.raw(`
        CREATE TABLE IF NOT EXISTS orderStatusFlowItems (
          id INT AUTO_INCREMENT PRIMARY KEY,
          flowId INT NOT NULL,
          statusKey VARCHAR(64) NOT NULL,
          sortOrder INT NOT NULL DEFAULT 0,
          createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uq_status_flow_item (flowId, statusKey),
          INDEX idx_status_flow_items_order (flowId, sortOrder)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `));
      await db.execute(sql.raw(`
        CREATE TABLE IF NOT EXISTS productStatusFlows (
          id INT AUTO_INCREMENT PRIMARY KEY,
          productId INT NOT NULL,
          flowId INT NOT NULL,
          createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_product_status_flow (productId),
          INDEX idx_product_status_flow_flow (flowId)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `));
      await db.execute(sql.raw(`
        CREATE TABLE IF NOT EXISTS orderStatusFlowAssignments (
          id INT AUTO_INCREMENT PRIMARY KEY,
          registrationId INT NOT NULL,
          orderStatusId INT NOT NULL,
          orderNumber INT NULL,
          productId INT NULL,
          optionId INT NULL,
          flowId INT NOT NULL,
          createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uq_order_status_flow_assignment (orderStatusId),
          INDEX idx_order_status_flow_order (registrationId, orderNumber),
          INDEX idx_order_status_flow_flow (flowId)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `));

      const defaultResult = await db.execute(sql`SELECT id FROM orderStatusFlows WHERE isDefault = 1 LIMIT 1`);
      const defaultRows = (defaultResult as any)[0] as Array<{ id: number }>;
      if (!defaultRows?.[0]?.id) {
        await db.execute(sql`
          INSERT INTO orderStatusFlows (name, description, isDefault, isActive)
          VALUES ('Padrão H2', 'Sequência padrão que preserva o comportamento atual do sistema.', 1, 1)
        `);
      }
    })().catch((error) => {
      orderStatusFlowTablesPromise = null;
      throw error;
    });
  }
  await orderStatusFlowTablesPromise;
}

async function getInitialOrderStatusKey(): Promise<string> {
  const db = await getDb();
  if (!db) return "recebido";
  const result = await db.execute(sql`
    SELECT \`key\` FROM orderStatusTypes
    WHERE isActive = 1
    ORDER BY sortOrder ASC
    LIMIT 1
  `);
  const rows = (result as any)[0] as Array<{ key: string }>;
  return rows?.[0]?.key || "recebido";
}

export async function getDefaultOrderStatusFlowId(): Promise<number> {
  await ensureOrderStatusFlowTables();
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.execute(sql`SELECT id FROM orderStatusFlows WHERE isDefault = 1 LIMIT 1`);
  const rows = (result as any)[0] as Array<{ id: number }>;
  if (!rows?.[0]?.id) throw new Error("Default status flow not available");
  return Number(rows[0].id);
}

export async function resolveOrderStatusFlowForProduct(productId?: number | null): Promise<number> {
  await ensureOrderStatusFlowTables();
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (productId) {
    const result = await db.execute(sql`
      SELECT f.id
      FROM productStatusFlows pf
      INNER JOIN orderStatusFlows f ON f.id = pf.flowId
      WHERE pf.productId = \${productId} AND f.isActive = 1
      LIMIT 1
    `);
    const rows = (result as any)[0] as Array<{ id: number }>;
    if (rows?.[0]?.id) return Number(rows[0].id);
  }
  return await getDefaultOrderStatusFlowId();
}

export async function getOrderStatusFlowDefinition(flowId: number): Promise<{
  id: number;
  name: string;
  description: string | null;
  isDefault: number;
  isActive: number;
  statusKeys: string[];
}> {
  await ensureOrderStatusFlowTables();
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const flowResult = await db.execute(sql`
    SELECT id, name, description, isDefault, isActive
    FROM orderStatusFlows
    WHERE id = \${flowId}
    LIMIT 1
  `);
  const flowRows = (flowResult as any)[0] as any[];
  const flow = flowRows?.[0];
  if (!flow) {
    const defaultId = await getDefaultOrderStatusFlowId();
    if (defaultId !== flowId) return await getOrderStatusFlowDefinition(defaultId);
    throw new Error("Status flow not found");
  }

  let itemResult: any;
  if (Number(flow.isDefault) === 1) {
    itemResult = await db.execute(sql`
      SELECT \`key\` AS statusKey
      FROM orderStatusTypes
      WHERE isActive = 1
      ORDER BY sortOrder ASC, id ASC
    `);
  } else {
    itemResult = await db.execute(sql`
      SELECT i.statusKey
      FROM orderStatusFlowItems i
      INNER JOIN orderStatusTypes st ON st.\`key\` = i.statusKey
      WHERE i.flowId = \${flowId} AND st.isActive = 1
      ORDER BY i.sortOrder ASC, i.id ASC
    `);
  }
  const itemRows = (itemResult as any)[0] as Array<{ statusKey: string }>;
  return {
    id: Number(flow.id),
    name: String(flow.name),
    description: flow.description ? String(flow.description) : null,
    isDefault: Number(flow.isDefault),
    isActive: Number(flow.isActive),
    statusKeys: (itemRows || []).map((r) => String(r.statusKey)),
  };
}

export async function assignOrderStatusFlow(data: {
  registrationId: number;
  orderStatusId: number;
  orderNumber?: number | null;
  productId?: number | null;
  optionId?: number | null;
}): Promise<void> {
  await ensureOrderStatusFlowTables();
  const db = await getDb();
  if (!db) return;
  const flowId = await resolveOrderStatusFlowForProduct(data.productId);
  await db.execute(sql`
    INSERT INTO orderStatusFlowAssignments
      (registrationId, orderStatusId, orderNumber, productId, optionId, flowId)
    VALUES
      (\${data.registrationId}, \${data.orderStatusId}, \${data.orderNumber ?? null}, \${data.productId ?? null}, \${data.optionId ?? null}, \${flowId})
    ON DUPLICATE KEY UPDATE
      orderNumber = VALUES(orderNumber),
      productId = VALUES(productId),
      optionId = VALUES(optionId),
      flowId = VALUES(flowId)
  `);
}

export async function getOrderStatusFlowForOrder(registrationId: number, orderNumber?: number | null) {
  await ensureOrderStatusFlowTables();
  const db = await getDb();
  if (!db) return null;
  let result: any;
  if (orderNumber != null) {
    result = await db.execute(sql`
      SELECT flowId
      FROM orderStatusFlowAssignments
      WHERE registrationId = \${registrationId} AND orderNumber = \${orderNumber}
      ORDER BY id DESC
      LIMIT 1
    `);
  } else {
    result = await db.execute(sql`
      SELECT flowId
      FROM orderStatusFlowAssignments
      WHERE registrationId = \${registrationId}
      ORDER BY id DESC
      LIMIT 1
    `);
  }
  const rows = (result as any)[0] as Array<{ flowId: number }>;
  const flowId = rows?.[0]?.flowId ? Number(rows[0].flowId) : await getDefaultOrderStatusFlowId();
  return await getOrderStatusFlowDefinition(flowId);
}

export async function listOrderStatusFlowsDetailed() {
  await ensureOrderStatusFlowTables();
  const db = await getDb();
  if (!db) return [];
  const result = await db.execute(sql`
    SELECT id, name, description, isDefault, isActive
    FROM orderStatusFlows
    ORDER BY isDefault DESC, id ASC
  `);
  const rows = (result as any)[0] as any[];
  const output: any[] = [];
  for (const row of rows || []) {
    const definition = await getOrderStatusFlowDefinition(Number(row.id));
    const productsResult = await db.execute(sql`
      SELECT p.id, p.name
      FROM productStatusFlows pf
      INNER JOIN products p ON p.id = pf.productId
      WHERE pf.flowId = \${Number(row.id)}
      ORDER BY p.sortOrder ASC, p.name ASC
    `);
    const productRows = (productsResult as any)[0] as Array<{ id: number; name: string }>;
    output.push({
      ...definition,
      productIds: (productRows || []).map((p) => Number(p.id)),
      productNames: (productRows || []).map((p) => String(p.name)),
    });
  }
  return output;
}

async function normalizeCustomFlowStatusKeys(statusKeys: string[]): Promise<string[]> {
  const initialKey = await getInitialOrderStatusKey();
  const unique = Array.from(new Set([initialKey, ...statusKeys.filter(Boolean)]));
  return unique;
}

export async function createOrderStatusFlowConfig(data: {
  name: string;
  description?: string | null;
  statusKeys: string[];
  productIds: number[];
}) {
  await ensureOrderStatusFlowTables();
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.execute(sql`
    INSERT INTO orderStatusFlows (name, description, isDefault, isActive)
    VALUES (\${data.name}, \${data.description ?? null}, 0, 1)
  `);
  const idResult = await db.execute(sql`SELECT LAST_INSERT_ID() AS id`);
  const idRows = (idResult as any)[0] as Array<{ id: number }>;
  const flowId = Number(idRows?.[0]?.id || 0);
  if (!flowId) throw new Error("Falha ao criar sequência de status");
  await updateOrderStatusFlowConfig({ id: flowId, ...data, isActive: 1 });
  return await getOrderStatusFlowDefinition(flowId);
}

export async function updateOrderStatusFlowConfig(data: {
  id: number;
  name?: string;
  description?: string | null;
  statusKeys?: string[];
  productIds?: number[];
  isActive?: number;
}) {
  await ensureOrderStatusFlowTables();
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const flowResult = await db.execute(sql`SELECT isDefault FROM orderStatusFlows WHERE id = \${data.id} LIMIT 1`);
  const flowRows = (flowResult as any)[0] as Array<{ isDefault: number }>;
  if (!flowRows?.[0]) throw new Error("Sequência não encontrada");
  if (Number(flowRows[0].isDefault) === 1 && (data.statusKeys || data.productIds)) {
    throw new Error("A sequência padrão é controlada pela lista principal de status.");
  }

  if (data.name !== undefined || data.description !== undefined || data.isActive !== undefined) {
    await db.execute(sql`
      UPDATE orderStatusFlows
      SET
        name = CASE WHEN \${data.name !== undefined ? 1 : 0} = 1 THEN \${data.name ?? ""} ELSE name END,
        description = CASE WHEN \${data.description !== undefined ? 1 : 0} = 1 THEN \${data.description ?? null} ELSE description END,
        isActive = CASE WHEN \${data.isActive !== undefined ? 1 : 0} = 1 THEN \${data.isActive ?? 1} ELSE isActive END
      WHERE id = \${data.id}
    `);
  }

  if (data.statusKeys) {
    const keys = await normalizeCustomFlowStatusKeys(data.statusKeys);
    await db.execute(sql`DELETE FROM orderStatusFlowItems WHERE flowId = \${data.id}`);
    let sortOrder = 0;
    for (const key of keys) {
      await db.execute(sql`
        INSERT INTO orderStatusFlowItems (flowId, statusKey, sortOrder)
        VALUES (\${data.id}, \${key}, \${sortOrder++})
      `);
    }
  }

  if (data.productIds) {
    await db.execute(sql`DELETE FROM productStatusFlows WHERE flowId = \${data.id}`);
    for (const productId of Array.from(new Set(data.productIds))) {
      await db.execute(sql`
        INSERT INTO productStatusFlows (productId, flowId)
        VALUES (\${productId}, \${data.id})
        ON DUPLICATE KEY UPDATE flowId = VALUES(flowId), updatedAt = CURRENT_TIMESTAMP
      `);
    }
  }
}

export async function getOrderStatusFlowMap() {
  await ensureOrderStatusFlowTables();
  const db = await getDb();
  if (!db) return {};
  const assignmentResult = await db.execute(sql`
    SELECT registrationId, orderNumber, flowId
    FROM orderStatusFlowAssignments
    ORDER BY id ASC
  `);
  const assignments = (assignmentResult as any)[0] as Array<{ registrationId: number; orderNumber: number | null; flowId: number }>;
  const cache = new Map<number, Awaited<ReturnType<typeof getOrderStatusFlowDefinition>>>();
  const map: Record<string, any> = {};
  for (const row of assignments || []) {
    const flowId = Number(row.flowId);
    let def = cache.get(flowId);
    if (!def) {
      def = await getOrderStatusFlowDefinition(flowId);
      cache.set(flowId, def);
    }
    map[`\${Number(row.registrationId)}_\${row.orderNumber == null ? "null" : Number(row.orderNumber)}`] = def;
  }
  return map;
}

// ========== INFO BANNERS ==========
`;
    s = replaceOnce(s, marker, block, "db status flow helpers");
    write(path, s);
  }
}

// ---------- server/routers.ts ----------
{
  const path = "server/routers.ts";
  let s = read(path);

  if (!s.includes("statusFlows: router({")) {
    const marker = `  // === BANNERS INFORMATIVOS ===
  banners: router({
`;
    const routerBlock = `  // Sequências de status por produto
  statusFlows: router({
    list: adminProcedure.query(async () => {
      const { listOrderStatusFlowsDetailed } = await import('./db');
      return await listOrderStatusFlowsDetailed();
    }),
    create: adminProcedure
      .input(z.object({
        name: z.string().min(1).max(128),
        description: z.string().nullable().optional(),
        statusKeys: z.array(z.string().min(1).max(64)).max(50),
        productIds: z.array(z.number().int().positive()).max(200),
      }))
      .mutation(async ({ input }) => {
        const { createOrderStatusFlowConfig } = await import('./db');
        return await createOrderStatusFlowConfig(input);
      }),
    update: adminProcedure
      .input(z.object({
        id: z.number().int().positive(),
        name: z.string().min(1).max(128).optional(),
        description: z.string().nullable().optional(),
        statusKeys: z.array(z.string().min(1).max(64)).max(50).optional(),
        productIds: z.array(z.number().int().positive()).max(200).optional(),
        isActive: z.number().int().min(0).max(1).optional(),
      }))
      .mutation(async ({ input }) => {
        const { updateOrderStatusFlowConfig } = await import('./db');
        await updateOrderStatusFlowConfig(input);
        return { success: true };
      }),
    orderMap: adminProcedure.query(async () => {
      const { getOrderStatusFlowMap } = await import('./db');
      return await getOrderStatusFlowMap();
    }),
    forOrder: publicProcedure
      .input(z.object({
        registrationId: z.number().int().positive(),
        orderNumber: z.number().int().positive().optional(),
      }))
      .query(async ({ input }) => {
        const { getOrderStatusFlowForOrder } = await import('./db');
        return await getOrderStatusFlowForOrder(input.registrationId, input.orderNumber ?? null);
      }),
  }),

  // === BANNERS INFORMATIVOS ===
  banners: router({
`;
    s = replaceOnce(s, marker, routerBlock, "statusFlows router");
  }

  if (!s.includes("[StatusFlow] sequência congelada")) {
    const marker = `                const createdOrderStatus = await addOrderStatus({
                  registrationId: regId,
                  orderNumber: orderNum,
                  customerPhone: phoneDigits,
                  status: initialStatus,
                  note: 'Pedido recebido via site',
                  serviceName: input.service,
                  serviceOption: input.nameOption,
                  pricePaid: input.price || null,
                  answers: input.answers,
                });

                if (previousOrderCount === 0 && input.optionId) {
`;
    const replacement = `                const createdOrderStatus = await addOrderStatus({
                  registrationId: regId,
                  orderNumber: orderNum,
                  customerPhone: phoneDigits,
                  status: initialStatus,
                  note: 'Pedido recebido via site',
                  serviceName: input.service,
                  serviceOption: input.nameOption,
                  pricePaid: input.price || null,
                  answers: input.answers,
                });

                // Congelar a sequência de status do produto no nascimento do pedido.
                // Pedidos sem produto/fluxo específico continuam no fluxo padrão atual.
                try {
                  const { assignOrderStatusFlow } = await import('./db');
                  await assignOrderStatusFlow({
                    registrationId: regId,
                    orderStatusId: createdOrderStatus.id,
                    orderNumber: orderNum ?? null,
                    productId: input.productId ?? null,
                    optionId: input.optionId ?? null,
                  });
                  console.log('[StatusFlow] sequência congelada para o pedido', orderNum ?? regId);
                } catch (flowError) {
                  // Nunca impedir a criação do pedido por falha acessória de configuração.
                  console.error('[StatusFlow] falha ao congelar sequência:', flowError);
                }

                if (previousOrderCount === 0 && input.optionId) {
`;
    s = replaceOnce(s, marker, replacement, "freeze flow on order creation");
  }

  if (!s.includes("Este status não pertence à sequência configurada para este pedido.")) {
    const marker = `        if (input.status === 'recebido') {
          return { success: false, error: 'Status recebido não pode ser definido manualmente' };
        }
        const result = await updateLastOrderStatus({
`;
    const replacement = `        if (input.status === 'recebido') {
          return { success: false, error: 'Status recebido não pode ser definido manualmente' };
        }

        // Validação no servidor: um pedido com sequência própria não pode receber
        // um status de outro produto. Cancelado permanece como saída administrativa universal.
        try {
          const { getOrderStatusFlowForOrder } = await import('./db');
          const flow = await getOrderStatusFlowForOrder(input.registrationId, input.orderNumber ?? null);
          if (flow && input.status !== 'cancelado' && !flow.statusKeys.includes(input.status)) {
            return { success: false, error: 'Este status não pertence à sequência configurada para este pedido.' };
          }
        } catch (flowError) {
          console.error('[StatusFlow] falha ao validar sequência do pedido:', flowError);
        }

        const result = await updateLastOrderStatus({
`;
    s = replaceOnce(s, marker, replacement, "server-side flow validation");
  }

  write(path, s);
}

// ---------- client/src/App.tsx ----------
{
  const path = "client/src/App.tsx";
  let s = read(path);
  if (!s.includes('import AdminStatusFlows from "./pages/AdminStatusFlows";')) {
    s = replaceOnce(
      s,
      'import AdminStatusTypes from "./pages/AdminStatusTypes";',
      'import AdminStatusTypes from "./pages/AdminStatusTypes";\nimport AdminStatusFlows from "./pages/AdminStatusFlows";',
      "App import"
    );
  }
  if (!s.includes('path={"/admin/status-flows"}')) {
    const marker = `      <Route path={"/admin/status-types"}>
        <AdminGuard><AdminStatusTypes /></AdminGuard>
      </Route>
`;
    const replacement = `      <Route path={"/admin/status-types"}>
        <AdminGuard><AdminStatusTypes /></AdminGuard>
      </Route>
      <Route path={"/admin/status-flows"}>
        <AdminGuard><AdminStatusFlows /></AdminGuard>
      </Route>
`;
    s = replaceOnce(s, marker, replacement, "App status flows route");
  }
  write(path, s);
}

// ---------- client/src/pages/AdminStatusTypes.tsx ----------
{
  const path = "client/src/pages/AdminStatusTypes.tsx";
  let s = read(path);
  if (!s.includes('href="/admin/status-flows"')) {
    const marker = `      <AdminHeader title="Status de Pedido" rightContent={
        <Button onClick={() => { setShowCreate(v => !v); setForm(defaultForm); }} className="bg-primary hover:bg-primary/80 text-white text-xs gap-1 px-3 py-1.5 h-auto" size="sm">
          {showCreate ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{showCreate ? "Cancelar" : "Novo Status"}</span>
        </Button>
      } />
`;
    const replacement = `      <AdminHeader title="Status de Pedido" rightContent={
        <div className="flex items-center gap-2">
          <Link href="/admin/status-flows">
            <Button variant="outline" className="border-cyan-500/40 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 text-xs h-auto px-3 py-1.5" size="sm">
              Sequências
            </Button>
          </Link>
          <Button onClick={() => { setShowCreate(v => !v); setForm(defaultForm); }} className="bg-primary hover:bg-primary/80 text-white text-xs gap-1 px-3 py-1.5 h-auto" size="sm">
            {showCreate ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{showCreate ? "Cancelar" : "Novo Status"}</span>
          </Button>
        </div>
      } />
`;
    s = replaceOnce(s, marker, replacement, "AdminStatusTypes sequences button");
  }
  write(path, s);
}

// ---------- client/src/pages/AdminOrders.tsx ----------
{
  const path = "client/src/pages/AdminOrders.tsx";
  let s = read(path);
  if (!s.includes("statusFlowOrderMapQuery")) {
    const marker = `  // Status dinâmicos do banco
  const statusTypesQuery = trpc.statusTypes.list.useQuery();
  const dynamicStatuses = statusTypesQuery.data ?? [];
`;
    const replacement = `  // Status dinâmicos do banco
  const statusTypesQuery = trpc.statusTypes.list.useQuery();
  const dynamicStatuses = statusTypesQuery.data ?? [];

  // Sequência de status congelada por pedido. Pedidos legados sem atribuição
  // continuam usando a sequência global atual.
  const statusFlowOrderMapQuery = trpc.statusFlows.orderMap.useQuery(undefined, { staleTime: 30000 });
  const statusFlowOrderMap = (statusFlowOrderMapQuery.data ?? {}) as Record<string, { statusKeys?: string[] }>;
`;
    s = replaceOnce(s, marker, replacement, "AdminOrders flow map query");

    const marker2 = `  const INITIAL_STATUS_KEY = ACTIVE_STATUS_ORDER[0] || 'recebido';
  const isManualSelectableStatus = (s: string) => s !== 'cancelado' && s !== 'recebido' && s !== INITIAL_STATUS_KEY;
`;
    const replacement2 = `  const INITIAL_STATUS_KEY = ACTIVE_STATUS_ORDER[0] || 'recebido';
  const isManualSelectableStatus = (s: string) => s !== 'cancelado' && s !== 'recebido' && s !== INITIAL_STATUS_KEY;
  const getStatusOrderForOrder = (order: any): string[] => {
    const registrationId = Number(order?.id ?? order?.registrationId ?? 0);
    const orderNumber = order?.orderNumber == null ? 'null' : String(order.orderNumber);
    const flow = statusFlowOrderMap[`\${registrationId}_\${orderNumber}`];
    const keys = flow?.statusKeys;
    return Array.isArray(keys) && keys.length > 0 ? keys : ACTIVE_STATUS_ORDER;
  };
`;
    s = replaceOnce(s, marker2, replacement2, "AdminOrders flow helper");

    const old = "ACTIVE_STATUS_ORDER.filter(isManualSelectableStatus).map(s => {";
    s = replaceNth(s, old, "getStatusOrderForOrder(ar).filter(isManualSelectableStatus).map(s => {", 1, "archived flow selector");
    s = replaceNth(s, old, "getStatusOrderForOrder(ar).filter(isManualSelectableStatus).map(s => {", 1, "rgcnh flow selector");
    s = replaceNth(s, old, "getStatusOrderForOrder(order).filter(isManualSelectableStatus).map(s => {", 1, "active flow selector");

    s = replaceOnce(
      s,
      "statusOrder={ACTIVE_STATUS_ORDER}",
      "statusOrder={getStatusOrderForOrder(order)}",
      "progress editor status order"
    );
  }
  write(path, s);
}

// ---------- client/src/pages/OrderTracking.tsx ----------
{
  const path = "client/src/pages/OrderTracking.tsx";
  let s = read(path);
  if (!s.includes("statusFlowForOrderQuery")) {
    const marker = `  // Dados de login liberado
  const registrationId = history.length > 0 ? ((history[0] as any).registrationId ?? 0) : 0;
`;
    const replacement = `  // Dados de login liberado
  const registrationId = history.length > 0 ? ((history[0] as any).registrationId ?? 0) : 0;
  const selectedOrderNumber = history.find((h: any) => h.orderNumber != null)?.orderNumber ?? null;
  const statusFlowForOrderQuery = trpc.statusFlows.forOrder.useQuery(
    { registrationId, orderNumber: selectedOrderNumber ?? undefined },
    { enabled: canAccess && registrationId > 0, staleTime: 30000 }
  );
`;
    s = replaceOnce(s, marker, replacement, "OrderTracking flow query");

    const marker2 = `  // Timeline steps: todos os status dinâmicos ativos, excluindo "cancelado"
  const timelineSteps = useMemo(
    () => dynamicStatuses.filter((s: any) => s.key !== 'cancelado'),
    [dynamicStatuses]
  );
`;
    const replacement2 = `  // Timeline do pedido: usa a sequência congelada do produto quando existir.
  // Pedidos antigos sem atribuição continuam na sequência padrão atual.
  const timelineSteps = useMemo(() => {
    const keys = statusFlowForOrderQuery.data?.statusKeys ?? [];
    const base = keys.length > 0
      ? keys.map((key: string) => dynamicStatuses.find((s: any) => s.key === key)).filter(Boolean)
      : dynamicStatuses;
    return base.filter((s: any) => s.key !== 'cancelado');
  }, [dynamicStatuses, statusFlowForOrderQuery.data?.statusKeys]);
`;
    s = replaceOnce(s, marker2, replacement2, "OrderTracking timeline flow");
  }
  write(path, s);
}

// ---------- new admin page ----------
{
  const path = "client/src/pages/AdminStatusFlows.tsx";
  if (!fs.existsSync(path)) {
    write(path, `import { useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Pencil, Plus, Save, X } from "lucide-react";
import { toast } from "sonner";
import AdminHeader from "@/components/AdminHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useAdminAuth } from "@/hooks/useAdminAuth";

type Flow = {
  id: number;
  name: string;
  description: string | null;
  isDefault: number;
  isActive: number;
  statusKeys: string[];
  productIds: number[];
  productNames: string[];
};

export default function AdminStatusFlows() {
  useAdminAuth();
  const utils = trpc.useUtils();
  const flowsQuery = trpc.statusFlows.list.useQuery();
  const statusesQuery = trpc.statusTypes.list.useQuery();
  const productsQuery = trpc.products.list.useQuery();

  const activeStatuses = useMemo(
    () => (statusesQuery.data ?? []).filter((s: any) => s.isActive === 1).sort((a: any, b: any) => a.sortOrder - b.sortOrder),
    [statusesQuery.data]
  );
  const initialKey = activeStatuses[0]?.key ?? "recebido";

  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [statusKeys, setStatusKeys] = useState<string[]>([]);
  const [productIds, setProductIds] = useState<number[]>([]);

  const reset = () => {
    setEditingId(null);
    setName("");
    setDescription("");
    setStatusKeys([]);
    setProductIds([]);
  };

  const startNew = () => {
    setEditingId("new");
    setName("");
    setDescription("");
    setStatusKeys([initialKey]);
    setProductIds([]);
  };

  const startEdit = (flow: Flow) => {
    setEditingId(flow.id);
    setName(flow.name);
    setDescription(flow.description ?? "");
    setStatusKeys(flow.statusKeys.length ? flow.statusKeys : [initialKey]);
    setProductIds(flow.productIds ?? []);
  };

  const toggleStatus = (key: string) => {
    if (key === initialKey) return;
    setStatusKeys((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
  };

  const toggleProduct = (id: number) => {
    setProductIds((prev) => prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]);
  };

  const createMut = trpc.statusFlows.create.useMutation({
    onSuccess: async () => {
      toast.success("Sequência criada!");
      await utils.statusFlows.list.invalidate();
      reset();
    },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.statusFlows.update.useMutation({
    onSuccess: async () => {
      toast.success("Sequência atualizada!");
      await utils.statusFlows.list.invalidate();
      await utils.statusFlows.orderMap.invalidate();
      reset();
    },
    onError: (e) => toast.error(e.message),
  });

  const save = () => {
    if (!name.trim()) return toast.error("Informe o nome da sequência.");
    const orderedKeys = activeStatuses
      .map((s: any) => s.key)
      .filter((key: string) => key === initialKey || statusKeys.includes(key));
    if (editingId === "new") {
      createMut.mutate({ name: name.trim(), description: description.trim() || null, statusKeys: orderedKeys, productIds });
    } else if (typeof editingId === "number") {
      updateMut.mutate({ id: editingId, name: name.trim(), description: description.trim() || null, statusKeys: orderedKeys, productIds });
    }
  };

  const busy = createMut.isPending || updateMut.isPending;
  const flows = (flowsQuery.data ?? []) as Flow[];

  return (
    <div className="min-h-screen bg-[#07071a] text-white">
      <AdminHeader title="Sequências de Status" rightContent={
        <div className="flex gap-2">
          <Link href="/admin/status-types">
            <Button variant="outline" size="sm" className="border-white/15 text-white/70 gap-1">
              <ArrowLeft className="w-3.5 h-3.5" /> Status
            </Button>
          </Link>
          <Button size="sm" onClick={startNew} className="gap-1">
            <Plus className="w-3.5 h-3.5" /> Nova Sequência
          </Button>
        </div>
      } />

      <main className="max-w-5xl mx-auto p-4 md:p-6 space-y-5">
        <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4 text-sm text-cyan-100/80">
          A sequência <strong>Padrão H2</strong> continua usando exatamente os status atuais. Só produtos marcados em uma sequência personalizada passam a ter opções diferentes.
        </div>

        {editingId !== null && (
          <section className="rounded-2xl border border-white/10 bg-[#12122a] p-5 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-bold">{editingId === "new" ? "Nova sequência" : "Editar sequência"}</h2>
              <button onClick={reset} className="text-white/40 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs text-white/50">Nome</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Edição de Veículo" className="bg-[#0d0d1a] border-white/10" />
              </div>
              <div className="space-y-1 md:col-span-2">
                <label className="text-xs text-white/50">Descrição</label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="bg-[#0d0d1a] border-white/10" />
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold mb-2">Etapas desta sequência</p>
              <p className="text-xs text-white/40 mb-3">O primeiro status é universal e fica sempre marcado. A ordem segue a ordem configurada na tela principal de Status.</p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {activeStatuses.map((s: any) => {
                  const checked = s.key === initialKey || statusKeys.includes(s.key);
                  return (
                    <button
                      type="button"
                      key={s.key}
                      disabled={s.key === initialKey}
                      onClick={() => toggleStatus(s.key)}
                      className={`text-left rounded-lg border px-3 py-2 text-sm transition \${checked ? "border-cyan-400/50 bg-cyan-500/10 text-cyan-100" : "border-white/10 bg-black/10 text-white/50"} \${s.key === initialKey ? "opacity-80 cursor-not-allowed" : ""}`}
                    >
                      <span className="mr-2">{checked ? "✓" : "○"}</span>{s.label}
                      {s.key === initialKey && <span className="ml-2 text-[10px] text-white/35">INICIAL</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold mb-2">Aplicar aos produtos</p>
              <p className="text-xs text-white/40 mb-3">Produto sem seleção continua automaticamente no Padrão H2.</p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-72 overflow-auto pr-1">
                {(productsQuery.data ?? []).map((p: any) => {
                  const checked = productIds.includes(p.id);
                  return (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => toggleProduct(p.id)}
                      className={`text-left rounded-lg border px-3 py-2 text-sm transition \${checked ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-100" : "border-white/10 bg-black/10 text-white/50"}`}
                    >
                      <span className="mr-2">{checked ? "✓" : "○"}</span>{p.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <Button onClick={save} disabled={busy} className="w-full bg-green-600 hover:bg-green-700 gap-2">
              <Save className="w-4 h-4" /> {busy ? "Salvando..." : "Salvar Sequência"}
            </Button>
          </section>
        )}

        <section className="space-y-3">
          {flowsQuery.isLoading && <p className="text-white/40 text-sm">Carregando...</p>}
          {flows.map((flow) => (
            <div key={flow.id} className="rounded-2xl border border-white/10 bg-[#12122a] p-4">
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold">{flow.name}</h3>
                    {flow.isDefault === 1 && <span className="rounded bg-purple-500/15 border border-purple-500/30 px-2 py-0.5 text-[10px] text-purple-300">PADRÃO ATUAL</span>}
                    {flow.isActive === 0 && <span className="rounded bg-white/5 px-2 py-0.5 text-[10px] text-white/35">INATIVA</span>}
                  </div>
                  {flow.description && <p className="mt-1 text-xs text-white/45">{flow.description}</p>}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {flow.statusKeys.map((key) => {
                      const st: any = activeStatuses.find((s: any) => s.key === key);
                      return <span key={key} className="rounded-md border border-white/10 bg-black/15 px-2 py-1 text-[11px] text-white/65">{st?.label ?? key}</span>;
                    })}
                  </div>
                  <p className="mt-3 text-xs text-white/40">
                    {flow.isDefault === 1
                      ? "Usada por todos os produtos sem sequência personalizada."
                      : flow.productNames.length
                        ? `Produtos: \${flow.productNames.join(", ")}`
                        : "Nenhum produto vinculado ainda."}
                  </p>
                </div>
                {flow.isDefault !== 1 && (
                  <button onClick={() => startEdit(flow)} className="w-9 h-9 rounded-lg border border-white/10 text-white/50 hover:text-white flex items-center justify-center">
                    <Pencil className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
`);
  }
}

// ---------- migration ----------
{
  const path = "drizzle/0136_status_flows_by_product.sql";
  if (!fs.existsSync(path)) {
    write(path, `CREATE TABLE IF NOT EXISTS \`orderStatusFlows\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`name\` varchar(128) NOT NULL,
  \`description\` text,
  \`isDefault\` int NOT NULL DEFAULT 0,
  \`isActive\` int NOT NULL DEFAULT 1,
  \`createdAt\` timestamp NOT NULL DEFAULT (now()),
  \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT \`orderStatusFlows_id\` PRIMARY KEY(\`id\`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS \`orderStatusFlowItems\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`flowId\` int NOT NULL,
  \`statusKey\` varchar(64) NOT NULL,
  \`sortOrder\` int NOT NULL DEFAULT 0,
  \`createdAt\` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT \`orderStatusFlowItems_id\` PRIMARY KEY(\`id\`),
  CONSTRAINT \`uq_status_flow_item\` UNIQUE(\`flowId\`,\`statusKey\`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS \`productStatusFlows\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`productId\` int NOT NULL,
  \`flowId\` int NOT NULL,
  \`createdAt\` timestamp NOT NULL DEFAULT (now()),
  \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT \`productStatusFlows_id\` PRIMARY KEY(\`id\`),
  CONSTRAINT \`productStatusFlows_productId_unique\` UNIQUE(\`productId\`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS \`orderStatusFlowAssignments\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`registrationId\` int NOT NULL,
  \`orderStatusId\` int NOT NULL,
  \`orderNumber\` int,
  \`productId\` int,
  \`optionId\` int,
  \`flowId\` int NOT NULL,
  \`createdAt\` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT \`orderStatusFlowAssignments_id\` PRIMARY KEY(\`id\`),
  CONSTRAINT \`orderStatusFlowAssignments_orderStatusId_unique\` UNIQUE(\`orderStatusId\`)
);
`);
  }
}

// ---------- regression test ----------
{
  const path = "server/statusFlowsByProduct.test.ts";
  if (!fs.existsSync(path)) {
    write(path, `import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const schema = fs.readFileSync(path.join(root, "drizzle/schema.ts"), "utf8");
const db = fs.readFileSync(path.join(root, "server/db.ts"), "utf8");
const routers = fs.readFileSync(path.join(root, "server/routers.ts"), "utf8");
const orders = fs.readFileSync(path.join(root, "client/src/pages/AdminOrders.tsx"), "utf8");
const tracking = fs.readFileSync(path.join(root, "client/src/pages/OrderTracking.tsx"), "utf8");
const app = fs.readFileSync(path.join(root, "client/src/App.tsx"), "utf8");

describe("sequências de status por produto", () => {
  it("mantém o catálogo global e adiciona tabelas independentes de sequência", () => {
    expect(schema).toContain('mysqlTable("orderStatusTypes"');
    expect(schema).toContain('mysqlTable("orderStatusFlows"');
    expect(schema).toContain('mysqlTable("orderStatusFlowItems"');
    expect(schema).toContain('mysqlTable("productStatusFlows"');
    expect(schema).toContain('mysqlTable("orderStatusFlowAssignments"');
  });

  it("congela o fluxo no nascimento do pedido e valida no servidor", () => {
    expect(routers).toContain("assignOrderStatusFlow");
    expect(routers).toContain("createdOrderStatus.id");
    expect(routers).toContain("Este status não pertence à sequência configurada para este pedido.");
    expect(db).toContain("resolveOrderStatusFlowForProduct");
  });

  it("preserva o fluxo padrão para pedidos e produtos sem configuração", () => {
    expect(db).toContain("getDefaultOrderStatusFlowId");
    expect(db).toContain("Padrão H2");
    expect(db).toContain("WHERE isActive = 1");
  });

  it("filtra os botões do ADM e a timeline do cliente pela sequência do pedido", () => {
    expect(orders).toContain("statusFlowOrderMapQuery");
    expect(orders).toContain("getStatusOrderForOrder(order)");
    expect(tracking).toContain("statusFlowForOrderQuery");
    expect(tracking).toContain("statusFlowForOrderQuery.data?.statusKeys");
  });

  it("expõe a tela administrativa de sequências", () => {
    expect(app).toContain('path={"/admin/status-flows"}');
    expect(fs.existsSync(path.join(root, "client/src/pages/AdminStatusFlows.tsx"))).toBe(true);
  });
});
`);
  }
}
