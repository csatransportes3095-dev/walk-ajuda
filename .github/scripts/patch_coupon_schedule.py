from pathlib import Path


def replace_once(path_str: str, old: str, new: str, label: str) -> None:
    path = Path(path_str)
    text = path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: esperado 1 bloco, encontrado {count}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


replace_once(
    "drizzle/schema.ts",
    '  currentUses: int("currentUses").default(0),\n  expiresAt: timestamp("expiresAt"),',
    '  currentUses: int("currentUses").default(0),\n  startsAt: timestamp("startsAt"),\n  expiresAt: timestamp("expiresAt"),',
    "schema coupons startsAt",
)

replace_once(
    "server/db.ts",
    "// ========== COUPONS ==========\n\nexport async function createCoupon",
    """// ========== COUPONS ==========\n\nlet couponScheduleInfrastructurePromise: Promise<void> | null = null;\n\nasync function ensureCouponScheduleInfrastructure(): Promise<void> {\n  if (!couponScheduleInfrastructurePromise) {\n    couponScheduleInfrastructurePromise = (async () => {\n      const db = await getDb();\n      if (!db) throw new Error('Database not available');\n      try {\n        await db.execute(sql`ALTER TABLE coupons ADD COLUMN startsAt TIMESTAMP NULL AFTER currentUses`);\n      } catch (error) {\n        const mysqlError = error as { code?: string; errno?: number };\n        if (mysqlError.code !== 'ER_DUP_FIELDNAME' && mysqlError.errno !== 1060) throw error;\n      }\n    })().catch((error) => {\n      couponScheduleInfrastructurePromise = null;\n      throw error;\n    });\n  }\n  return couponScheduleInfrastructurePromise;\n}\n\nexport async function createCoupon""",
    "db coupon infrastructure",
)

replace_once(
    "server/db.ts",
    """export async function createCoupon(data: { code: string; discountType: 'percentage' | 'fixed'; discountValue: number; maxUses?: number; expiresAt?: Date | null; }): Promise<Coupon> {\n  const db = await getDb();\n  if (!db) throw new Error('Database not available');\n  await db.insert(coupons).values({ code: data.code.toUpperCase(), discountType: data.discountType, discountValue: data.discountValue, maxUses: data.maxUses || 1, currentUses: 0, expiresAt: data.expiresAt || null, status: 'active' });""",
    """export async function createCoupon(data: { code: string; discountType: 'percentage' | 'fixed'; discountValue: number; maxUses?: number; startsAt?: Date | null; expiresAt?: Date | null; }): Promise<Coupon> {\n  const db = await getDb();\n  if (!db) throw new Error('Database not available');\n  await ensureCouponScheduleInfrastructure();\n  await db.insert(coupons).values({ code: data.code.toUpperCase(), discountType: data.discountType, discountValue: data.discountValue, maxUses: data.maxUses || 1, currentUses: 0, startsAt: data.startsAt || null, expiresAt: data.expiresAt || null, status: 'active' });""",
    "db createCoupon",
)

replace_once(
    "server/db.ts",
    """export async function listCoupons(): Promise<Coupon[]> {\n  const db = await getDb();\n  if (!db) return [];\n  return await db.select().from(coupons);\n}""",
    """export async function listCoupons(): Promise<Coupon[]> {\n  const db = await getDb();\n  if (!db) return [];\n  await ensureCouponScheduleInfrastructure();\n  return await db.select().from(coupons);\n}""",
    "db listCoupons",
)

replace_once(
    "server/db.ts",
    """export async function validateCoupon(code: string): Promise<{ valid: boolean; coupon?: Coupon; reason?: string; discountType?: 'percentage' | 'fixed'; discountValue?: number; }> {\n  const db = await getDb();\n  if (!db) return { valid: false, reason: 'Banco de dados indisponível' };\n  const results = await db.select().from(coupons).where(eq(coupons.code, code.toUpperCase())).limit(1);""",
    """export async function validateCoupon(code: string): Promise<{ valid: boolean; coupon?: Coupon; reason?: string; discountType?: 'percentage' | 'fixed'; discountValue?: number; }> {\n  const db = await getDb();\n  if (!db) return { valid: false, reason: 'Banco de dados indisponível' };\n  await ensureCouponScheduleInfrastructure();\n  const results = await db.select().from(coupons).where(eq(coupons.code, code.toUpperCase())).limit(1);""",
    "db validateCoupon ensure",
)

replace_once(
    "server/db.ts",
    """  const coupon = results[0];\n  if (coupon.status === 'disabled') return { valid: false, reason: 'Este cupom está desativado' };""",
    """  const coupon = results[0];\n  if (coupon.startsAt && new Date() < coupon.startsAt) return { valid: false, reason: 'Este cupom ainda não iniciou' };\n  if (coupon.status === 'disabled') return { valid: false, reason: 'Este cupom está desativado' };""",
    "db validateCoupon startsAt",
)

replace_once(
    "server/db.ts",
    """export async function consumeCoupon(code: string, usedBy?: string): Promise<void> {\n  const db = await getDb();\n  if (!db) return;\n  const results = await db.select().from(coupons).where(eq(coupons.code, code.toUpperCase())).limit(1);""",
    """export async function consumeCoupon(code: string, usedBy?: string): Promise<void> {\n  const db = await getDb();\n  if (!db) return;\n  await ensureCouponScheduleInfrastructure();\n  const results = await db.select().from(coupons).where(eq(coupons.code, code.toUpperCase())).limit(1);""",
    "db consumeCoupon ensure",
)

replace_once(
    "server/routers.ts",
    """        maxUses: z.number().min(1).default(1),\n        expiresAt: z.string().optional(),""",
    """        maxUses: z.number().min(1).default(1),\n        startsAt: z.string().optional(),\n        expiresAt: z.string().optional(),""",
    "router coupon input",
)

replace_once(
    "server/routers.ts",
    """      .mutation(async ({ input }) => {\n        try {\n          const coupon = await createCoupon({\n            code: input.code, discountType: input.discountType,\n            discountValue: input.discountValue, maxUses: input.maxUses,\n            expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,\n          });""",
    """      .mutation(async ({ input }) => {\n        try {\n          const startsAt = input.startsAt ? new Date(input.startsAt) : null;\n          const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;\n          if ((startsAt && Number.isNaN(startsAt.getTime())) || (expiresAt && Number.isNaN(expiresAt.getTime()))) {\n            return { success: false, message: 'Data ou hora inválida.' };\n          }\n          if (startsAt && expiresAt && expiresAt <= startsAt) {\n            return { success: false, message: 'O fim deve ser posterior ao início.' };\n          }\n          const coupon = await createCoupon({\n            code: input.code, discountType: input.discountType,\n            discountValue: input.discountValue, maxUses: input.maxUses,\n            startsAt, expiresAt,\n          });""",
    "router coupon create schedule",
)

replace_once(
    "client/src/pages/AdminCoupons.tsx",
    '  const [maxUses, setMaxUses] = useState("1");\n  const [expiresAt, setExpiresAt] = useState("");',
    '  const [maxUses, setMaxUses] = useState("1");\n  const [startsAt, setStartsAt] = useState("");\n  const [expiresAt, setExpiresAt] = useState("");',
    "ui startsAt state",
)

replace_once(
    "client/src/pages/AdminCoupons.tsx",
    '        setMaxUses("1");\n        setExpiresAt("");',
    '        setMaxUses("1");\n        setStartsAt("");\n        setExpiresAt("");',
    "ui reset startsAt",
)

replace_once(
    "client/src/pages/AdminCoupons.tsx",
    """    if (discountType === "percentage" && Number(discountValue) > 100) {\n      toast.error("Porcentagem não pode ser maior que 100%");\n      return;\n    }\n    setIsCreating(true);""",
    """    if (discountType === "percentage" && Number(discountValue) > 100) {\n      toast.error("Porcentagem não pode ser maior que 100%");\n      return;\n    }\n    if (startsAt && expiresAt && new Date(expiresAt) <= new Date(startsAt)) {\n      toast.error("O fim deve ser posterior ao início");\n      return;\n    }\n    setIsCreating(true);""",
    "ui schedule validation",
)

replace_once(
    "client/src/pages/AdminCoupons.tsx",
    """      discountValue: Number(discountValue),\n      maxUses: Number(maxUses) || 1,\n      expiresAt: expiresAt || undefined,""",
    """      discountValue: Number(discountValue),\n      maxUses: Number(maxUses) || 1,\n      startsAt: startsAt ? new Date(startsAt).toISOString() : undefined,\n      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,""",
    "ui send schedule",
)

replace_once(
    "client/src/pages/AdminCoupons.tsx",
    """  const formatDiscount = (type: string, value: number) => {\n    if (type === "percentage") return `${value}%`;\n    return `R$ ${value.toFixed(2).replace('.', ',')}`;\n  };""",
    """  const formatDiscount = (type: string, value: number) => {\n    if (type === "percentage") return `${value}%`;\n    return `R$ ${value.toFixed(2).replace('.', ',')}`;\n  };\n\n  const formatDateTime = (value: string | number | Date | null | undefined) => {\n    if (!value) return "-";\n    const date = value instanceof Date ? value : new Date(value);\n    if (Number.isNaN(date.getTime())) return "-";\n    return date.toLocaleString("pt-BR", {\n      timeZone: "America/Sao_Paulo",\n      day: "2-digit",\n      month: "2-digit",\n      year: "numeric",\n      hour: "2-digit",\n      minute: "2-digit",\n    });\n  };""",
    "ui formatDateTime",
)

replace_once(
    "client/src/pages/AdminCoupons.tsx",
    """            <div className="grid grid-cols-2 gap-3">\n              <div>\n                <label className="block text-sm text-white/70 mb-1">Limite de Usos</label>\n                <input\n                  type="number"\n                  value={maxUses}\n                  onChange={(e) => setMaxUses(e.target.value)}\n                  placeholder="1"\n                  min="1"\n                  style={whiteInputStyle}\n                />\n              </div>\n              <div>\n                <label className="block text-sm text-white/70 mb-1">Validade (opcional)</label>\n                <input\n                  type="date"\n                  value={expiresAt}\n                  onChange={(e) => setExpiresAt(e.target.value)}\n                  min={new Date().toISOString().split('T')[0]}\n                  style={{\n                    ...whiteInputStyle,\n                    cursor: 'pointer',\n                    colorScheme: 'light',\n                  }}\n                />\n              </div>\n            </div>""",
    """            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">\n              <div>\n                <label className="block text-sm text-white/70 mb-1">Limite de Usos</label>\n                <input\n                  type="number"\n                  value={maxUses}\n                  onChange={(e) => setMaxUses(e.target.value)}\n                  placeholder="1"\n                  min="1"\n                  style={whiteInputStyle}\n                />\n              </div>\n              <div>\n                <label className="block text-sm text-white/70 mb-1">Início — data e hora</label>\n                <input\n                  type="datetime-local"\n                  value={startsAt}\n                  onChange={(e) => setStartsAt(e.target.value)}\n                  style={{\n                    ...whiteInputStyle,\n                    cursor: 'pointer',\n                    colorScheme: 'light',\n                  }}\n                />\n              </div>\n              <div>\n                <label className="block text-sm text-white/70 mb-1">Fim — data e hora</label>\n                <input\n                  type="datetime-local"\n                  value={expiresAt}\n                  onChange={(e) => setExpiresAt(e.target.value)}\n                  min={startsAt || undefined}\n                  style={{\n                    ...whiteInputStyle,\n                    cursor: 'pointer',\n                    colorScheme: 'light',\n                  }}\n                />\n              </div>\n            </div>""",
    "ui date time controls",
)

replace_once(
    "client/src/pages/AdminCoupons.tsx",
    """                      <div>\n                        <span className="text-white/50 text-xs">Validade</span>\n                        <p className="text-white/80">\n                          {coupon.expiresAt\n                            ? new Date(coupon.expiresAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })\n                            : "Sem validade"}\n                        </p>\n                      </div>""",
    """                      <div>\n                        <span className="text-white/50 text-xs">Início</span>\n                        <p className="text-white/80">{coupon.startsAt ? formatDateTime(coupon.startsAt) : "Imediato"}</p>\n                      </div>\n                      <div>\n                        <span className="text-white/50 text-xs">Fim</span>\n                        <p className="text-white/80">{coupon.expiresAt ? formatDateTime(coupon.expiresAt) : "Sem limite"}</p>\n                      </div>""",
    "ui mobile schedule",
)

replace_once(
    "client/src/pages/AdminCoupons.tsx",
    """                      <th className="text-left py-3 px-4 text-white/70 text-sm font-medium">Usos</th>\n                      <th className="text-left py-3 px-4 text-white/70 text-sm font-medium">Validade</th>\n                      <th className="text-left py-3 px-4 text-white/70 text-sm font-medium">Usado por</th>""",
    """                      <th className="text-left py-3 px-4 text-white/70 text-sm font-medium">Usos</th>\n                      <th className="text-left py-3 px-4 text-white/70 text-sm font-medium">Início</th>\n                      <th className="text-left py-3 px-4 text-white/70 text-sm font-medium">Fim</th>\n                      <th className="text-left py-3 px-4 text-white/70 text-sm font-medium">Usado por</th>""",
    "ui desktop schedule headers",
)

replace_once(
    "client/src/pages/AdminCoupons.tsx",
    """                        <td className="py-3 px-4 text-white/70 text-sm">\n                          {coupon.expiresAt\n                            ? new Date(coupon.expiresAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })\n                            : "Sem validade"}\n                        </td>""",
    """                        <td className="py-3 px-4 text-white/70 text-sm whitespace-nowrap">\n                          {coupon.startsAt ? formatDateTime(coupon.startsAt) : "Imediato"}\n                        </td>\n                        <td className="py-3 px-4 text-white/70 text-sm whitespace-nowrap">\n                          {coupon.expiresAt ? formatDateTime(coupon.expiresAt) : "Sem limite"}\n                        </td>""",
    "ui desktop schedule cells",
)

replace_once(
    "client/src/pages/AdminCoupons.tsx",
    '          <p><strong className="text-white/70">Limite de Usos:</strong> Quantas vezes o cupom pode ser utilizado.</p>',
    '          <p><strong className="text-white/70">Limite de Usos:</strong> Quantas vezes o cupom pode ser utilizado.</p>\n          <p><strong className="text-white/70">Início / Fim:</strong> Define a data e a hora exatas em que o cupom passa a valer e deixa de valer.</p>',
    "ui schedule help",
)
