from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: esperado 1 trecho, encontrado {count} em {path}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")
    print(f"OK: {label}")


def replace_all_exact(path: str, old: str, new: str, expected: int, label: str):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count != expected:
        raise RuntimeError(f"{label}: esperado {expected}, encontrado {count} em {path}")
    p.write_text(text.replace(old, new), encoding="utf-8")
    print(f"OK: {label} ({count})")


# 1) /gastos: remove manifesto duplicado e reduz polling excessivo.
replace_once(
    "client/src/pages/GastosPage.tsx",
    "import { PostLoginReferralManifest } from '@/components/PostLoginReferralManifest';\n",
    "",
    "remover import do manifesto antigo",
)
replace_once(
    "client/src/pages/GastosPage.tsx",
    "  const [manifestCompleted, setManifestCompleted] = useState(false);\n",
    "",
    "remover estado de manifesto",
)
replace_all_exact(
    "client/src/pages/GastosPage.tsx",
    "    setManifestCompleted(false);\n",
    "",
    2,
    "remover resets de manifesto",
)
replace_once(
    "client/src/pages/GastosPage.tsx",
    "    { enabled: !!token && isLoggedIn, retry: false, refetchOnWindowFocus: true, refetchInterval: 1000 },\n",
    "    { enabled: !!token && isLoggedIn, retry: false, refetchOnWindowFocus: true, refetchInterval: 60000 },\n",
    "reduzir polling de permissao",
)
replace_once(
    "client/src/pages/GastosPage.tsx",
    "  if (!manifestCompleted) {\n    return <PostLoginReferralManifest token={token || ''} route=\"gastos\" onComplete={() => setManifestCompleted(true)} />;\n  }\n\n",
    "",
    "remover manifesto pos-login",
)

# 2) Segurança: update/delete sempre escopados pelo userId autenticado.
security_helpers = [
    (
        "export async function updateEarning(id: number, data: Partial<InsertSpreadsheetEarning>) {\n  const db = await getDb();\n  if (!db) throw new Error(\"Database connection failed\");\n  return await db.update(spreadsheetEarnings).set(data).where(eq(spreadsheetEarnings.id, id));\n}",
        "export async function updateEarning(id: number, data: Partial<InsertSpreadsheetEarning>, userId?: number) {\n  const db = await getDb();\n  if (!db) throw new Error(\"Database connection failed\");\n  const where = userId === undefined ? eq(spreadsheetEarnings.id, id) : and(eq(spreadsheetEarnings.id, id), eq(spreadsheetEarnings.userId, userId));\n  return await db.update(spreadsheetEarnings).set(data).where(where);\n}",
        "proteger updateEarning",
    ),
    (
        "export async function deleteEarning(id: number) {\n  const db = await getDb();\n  if (!db) throw new Error(\"Database connection failed\");\n  return await db.delete(spreadsheetEarnings).where(eq(spreadsheetEarnings.id, id));\n}",
        "export async function deleteEarning(id: number, userId?: number) {\n  const db = await getDb();\n  if (!db) throw new Error(\"Database connection failed\");\n  const where = userId === undefined ? eq(spreadsheetEarnings.id, id) : and(eq(spreadsheetEarnings.id, id), eq(spreadsheetEarnings.userId, userId));\n  return await db.delete(spreadsheetEarnings).where(where);\n}",
        "proteger deleteEarning",
    ),
    (
        "export async function updateExpense(id: number, data: Partial<InsertSpreadsheetExpense>) {\n  const db = await getDb();\n  if (!db) throw new Error(\"Database connection failed\");\n  return await db.update(spreadsheetExpenses).set(data).where(eq(spreadsheetExpenses.id, id));\n}",
        "export async function updateExpense(id: number, data: Partial<InsertSpreadsheetExpense>, userId?: number) {\n  const db = await getDb();\n  if (!db) throw new Error(\"Database connection failed\");\n  const where = userId === undefined ? eq(spreadsheetExpenses.id, id) : and(eq(spreadsheetExpenses.id, id), eq(spreadsheetExpenses.userId, userId));\n  return await db.update(spreadsheetExpenses).set(data).where(where);\n}",
        "proteger updateExpense",
    ),
    (
        "export async function deleteExpense(id: number) {\n  const db = await getDb();\n  if (!db) throw new Error(\"Database connection failed\");\n  return await db.delete(spreadsheetExpenses).where(eq(spreadsheetExpenses.id, id));\n}",
        "export async function deleteExpense(id: number, userId?: number) {\n  const db = await getDb();\n  if (!db) throw new Error(\"Database connection failed\");\n  const where = userId === undefined ? eq(spreadsheetExpenses.id, id) : and(eq(spreadsheetExpenses.id, id), eq(spreadsheetExpenses.userId, userId));\n  return await db.delete(spreadsheetExpenses).where(where);\n}",
        "proteger deleteExpense",
    ),
    (
        "export async function updateOperational(id: number, data: Partial<InsertSpreadsheetOperational>) {\n  const db = await getDb() as any;\n  if (!db) throw new Error(\"Database connection failed\");\n  return await db.update(spreadsheetOperational).set(data).where(eq(spreadsheetOperational.id, id));\n}",
        "export async function updateOperational(id: number, data: Partial<InsertSpreadsheetOperational>, userId?: number) {\n  const db = await getDb() as any;\n  if (!db) throw new Error(\"Database connection failed\");\n  const where = userId === undefined ? eq(spreadsheetOperational.id, id) : and(eq(spreadsheetOperational.id, id), eq(spreadsheetOperational.userId, userId));\n  return await db.update(spreadsheetOperational).set(data).where(where);\n}",
        "proteger updateOperational",
    ),
    (
        "export async function deleteOperational(id: number) {\n  const db = await getDb();\n  if (!db) throw new Error(\"Database connection failed\");\n  return await db.delete(spreadsheetOperational).where(eq(spreadsheetOperational.id, id));\n}",
        "export async function deleteOperational(id: number, userId?: number) {\n  const db = await getDb();\n  if (!db) throw new Error(\"Database connection failed\");\n  const where = userId === undefined ? eq(spreadsheetOperational.id, id) : and(eq(spreadsheetOperational.id, id), eq(spreadsheetOperational.userId, userId));\n  return await db.delete(spreadsheetOperational).where(where);\n}",
        "proteger deleteOperational",
    ),
    (
        "export async function updateGoal(id: number, data: Partial<InsertSpreadsheetGoal>) {\n  const db = await getDb();\n  if (!db) throw new Error(\"Database connection failed\");\n  return await db.update(spreadsheetGoals).set(data).where(eq(spreadsheetGoals.id, id));\n}",
        "export async function updateGoal(id: number, data: Partial<InsertSpreadsheetGoal>, userId?: number) {\n  const db = await getDb();\n  if (!db) throw new Error(\"Database connection failed\");\n  const where = userId === undefined ? eq(spreadsheetGoals.id, id) : and(eq(spreadsheetGoals.id, id), eq(spreadsheetGoals.userId, userId));\n  return await db.update(spreadsheetGoals).set(data).where(where);\n}",
        "proteger updateGoal",
    ),
    (
        "export async function deleteGoal(id: number) {\n  const db = await getDb();\n  if (!db) throw new Error(\"Database connection failed\");\n  return await db.delete(spreadsheetGoals).where(eq(spreadsheetGoals.id, id));\n}",
        "export async function deleteGoal(id: number, userId?: number) {\n  const db = await getDb();\n  if (!db) throw new Error(\"Database connection failed\");\n  const where = userId === undefined ? eq(spreadsheetGoals.id, id) : and(eq(spreadsheetGoals.id, id), eq(spreadsheetGoals.userId, userId));\n  return await db.delete(spreadsheetGoals).where(where);\n}",
        "proteger deleteGoal",
    ),
]
for old, new, label in security_helpers:
    replace_once("server/db.ts", old, new, label)

router_replacements = [
    ("      await resolveClientId(input.token);\n      const { token, ...rest } = input;\n      return await updateEarning(rest.id, rest);", "      const clientId = await resolveClientId(input.token);\n      const { token, ...rest } = input;\n      return await updateEarning(rest.id, rest, clientId);", "escopo update earning"),
    ("      await resolveClientId(input.token);\n      return await deleteEarning(input.id);", "      const clientId = await resolveClientId(input.token);\n      return await deleteEarning(input.id, clientId);", "escopo delete earning"),
    ("      await resolveClientId(input.token);\n      const { token, ...rest } = input;\n      return await updateExpense(rest.id, rest);", "      const clientId = await resolveClientId(input.token);\n      const { token, ...rest } = input;\n      return await updateExpense(rest.id, rest, clientId);", "escopo update expense"),
    ("      await resolveClientId(input.token);\n      return await deleteExpense(input.id);", "      const clientId = await resolveClientId(input.token);\n      return await deleteExpense(input.id, clientId);", "escopo delete expense"),
    ("      await resolveClientId(input.token);\n      const { token, ...rest } = input;\n      const data: any = { ...rest };", "      const clientId = await resolveClientId(input.token);\n      const { token, ...rest } = input;\n      const data: any = { ...rest };", "capturar cliente update operacional"),
    ("      return await updateOperational(rest.id, data);", "      return await updateOperational(rest.id, data, clientId);", "escopo update operacional"),
    ("      await resolveClientId(input.token);\n      return await deleteOperational(input.id);", "      const clientId = await resolveClientId(input.token);\n      return await deleteOperational(input.id, clientId);", "escopo delete operacional"),
]
for old, new, label in router_replacements:
    replace_once("server/routers/spreadsheet.ts", old, new, label)

# Goals têm trechos similares; substitui chamadas somente quando o clientId já foi resolvido no bloco.
replace_once(
    "server/routers/spreadsheet.ts",
    "      await resolveClientId(input.token);\n      return await deleteGoal(input.id);",
    "      const clientId = await resolveClientId(input.token);\n      return await deleteGoal(input.id, clientId);",
    "escopo delete goal",
)
replace_once(
    "server/routers/spreadsheet.ts",
    "      await resolveClientId(input.token);\n      const { token, ...rest } = input;\n      return await updateGoal(rest.id, rest);",
    "      const clientId = await resolveClientId(input.token);\n      const { token, ...rest } = input;\n      return await updateGoal(rest.id, rest, clientId);",
    "escopo update goal",
)

# 3) Endpoints de backup/restauração no mesmo router autenticado.
replace_once(
    "server/routers/spreadsheet.ts",
    'import { getCustomerProfileUpdateState } from "../customerProfileUpdatePolicy";\n',
    'import { getCustomerProfileUpdateState } from "../customerProfileUpdatePolicy";\nimport { buildSpreadsheetClientBackup, restoreSpreadsheetClientBackup } from "../spreadsheetClientBackup";\n',
    "importar backup da planilha",
)
backup_endpoints = '''  // Backup local do cliente: exporta apenas dados da própria planilha autenticada.\n  exportBackup: publicProcedure\n    .input(z.object({ token: z.string() }))\n    .query(async ({ input }) => {\n      const clientId = await resolveClientId(input.token);\n      try {\n        return await buildSpreadsheetClientBackup(clientId);\n      } catch (error: any) {\n        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error?.message || 'Não foi possível gerar o backup.' });\n      }\n    }),\n\n  // Restauração substitui somente os dados da conta autenticada; IDs/userIds do arquivo são ignorados.\n  restoreBackup: publicProcedure\n    .input(z.object({ token: z.string(), payload: z.string().max(15_000_000) }))\n    .mutation(async ({ input }) => {\n      const clientId = await resolveClientId(input.token);\n      try {\n        return await restoreSpreadsheetClientBackup(clientId, input.payload);\n      } catch (error: any) {\n        throw new TRPCError({ code: 'BAD_REQUEST', message: error?.message || 'Não foi possível restaurar o backup.' });\n      }\n    }),\n\n'''
replace_once(
    "server/routers/spreadsheet.ts",
    "  // === ANALISADOR DE CORRIDAS ===\n",
    backup_endpoints + "  // === ANALISADOR DE CORRIDAS ===\n",
    "adicionar endpoints backup/restauracao",
)

# 4) Painel visual/inteligência na SpreadsheetPage.
replace_once(
    "client/src/pages/SpreadsheetPage.tsx",
    'import { H2AssistantPanel, type H2AssistantNavigationTarget } from "@/components/H2AssistantPanel";\n',
    'import { H2AssistantPanel, type H2AssistantNavigationTarget } from "@/components/H2AssistantPanel";\nimport { SpreadsheetInsightsPanel } from "@/components/SpreadsheetInsightsPanel";\n',
    "importar painel inteligente",
)
replace_once(
    "client/src/pages/SpreadsheetPage.tsx",
    'const DATE_COLORS = ["#ff6b6b", "#4ecdc4", "#45b7d1", "#f9ca24", "#6c5ce7", "#a29bfe", "#fd79a8", "#fdcb6e", "#6c5ce7", "#00b894"];\n',
    'const DATE_COLORS = ["#ff6b6b", "#4ecdc4", "#45b7d1", "#f9ca24", "#6c5ce7", "#a29bfe", "#fd79a8", "#fdcb6e", "#6c5ce7", "#00b894"];\nconst EXPENSE_CATEGORY_LABELS: Record<string, string> = { fuel: "Combustível", carRental: "Aluguel", maintenance: "Manutenção", oilChange: "Troca de óleo", washing: "Lavagem", insurance: "Seguro", internetPhone: "Internet/Telefone", food: "Alimentação", parking: "Estacionamento", tolls: "Pedágios", financing: "Financiamento", fines: "Multas", accessories: "Acessórios", otherExpenses: "Outros" };\n',
    "labels amigaveis dos graficos",
)

panel_markup = '''        <SpreadsheetInsightsPanel\n          token={token}\n          selectedMonth={selectedMonth}\n          onSelectedMonthChange={setSelectedMonth}\n          onNavigate={(target) => {\n            setActiveModule(target);\n            window.requestAnimationFrame(() => document.getElementById("planilha-modulos")?.scrollIntoView({ behavior: "smooth", block: "start" }));\n          }}\n          onDataChanged={async () => {\n            await Promise.all([refetchEarnings(), refetchExpenses(), refetchYearlyEarnings(), refetchYearlyExpenses(), refetchOperational(), refetchGoals()]);\n          }}\n        />\n\n'''
replace_once(
    "client/src/pages/SpreadsheetPage.tsx",
    "        {/* Resumo por periodo */}\n",
    panel_markup + "        {/* Resumo por periodo legado (ocultado pelo painel inteligente) */}\n",
    "montar painel inteligente",
)

replace_once(
    "client/src/pages/SpreadsheetPage.tsx",
    '          <TabsList aria-label="Módulos da Planilha de Gastos" className="!grid !w-full grid-cols-3 md:grid-cols-5 xl:grid-cols-9 !h-auto !items-stretch gap-2.5 sm:gap-3 bg-transparent p-0 mb-5">',
    '          <TabsList aria-label="Módulos da Planilha de Gastos" className="spreadsheet-module-strip !grid !w-full grid-cols-3 md:grid-cols-5 xl:grid-cols-9 !h-auto !items-stretch gap-2.5 sm:gap-3 bg-transparent p-0 mb-5">',
    "compactar navegacao mobile",
)

# 5) Gráficos: incluir dias com somente gastos e traduzir categorias.
replace_once(
    "client/src/pages/SpreadsheetPage.tsx",
    "    const dates = Array.from(new Set(earnings.map(e => e.date))).sort();",
    "    const dates = Array.from(new Set([...earnings.map(e => e.date), ...expenses.map(e => e.date)])).sort();",
    "incluir datas somente com gastos no grafico",
)
replace_all_exact(
    "client/src/pages/SpreadsheetPage.tsx",
    "({ name: k, value: v })",
    "({ name: EXPENSE_CATEGORY_LABELS[k] || k, value: v })",
    1,
    "traduzir categorias no grafico de gastos",
)

# 6) Analisador: somar todos os lançamentos do dia.
replace_once(
    "client/src/pages/SpreadsheetPage.tsx",
    "  const todayExpense = expensesMonth?.find((e: any) => e.date === today);\n  const todayFuel = parseFloat(todayExpense?.fuel || '0');\n\n  // Buscar ganhos do dia para resumo\n  const { data: earningsMonth, refetch: refetchEarnings } = trpc.spreadsheet.getEarningsByMonth.useQuery({ token, month: todayMonth }, { enabled: !!token });\n  const todayEarning = earningsMonth?.find((e: any) => e.date === today);",
    "  const todayExpenses = (expensesMonth || []).filter((e: any) => String(e.date).slice(0, 10) === today);\n  const todayFuel = todayExpenses.reduce((sum: number, e: any) => sum + parseFloat(e.fuel || '0'), 0);\n  const { data: operationalMonth } = trpc.spreadsheet.getOperationalByMonth.useQuery({ token, month: todayMonth }, { enabled: !!token });\n\n  // Buscar ganhos do dia para resumo\n  const { data: earningsMonth, refetch: refetchEarnings } = trpc.spreadsheet.getEarningsByMonth.useQuery({ token, month: todayMonth }, { enabled: !!token });\n  const todayEarnings = (earningsMonth || []).filter((e: any) => String(e.date).slice(0, 10) === today);",
    "somar todos lancamentos do dia",
)
replace_once(
    "client/src/pages/SpreadsheetPage.tsx",
    "    totalKm: number; fuelCost: number; netProfit: number; ratePerKm: number; score: number; label: string; color: string;",
    "    totalKm: number; fuelCost: number; operatingCost: number; realCostPerKm: number; netProfit: number; ratePerKm: number; score: number; label: string; color: string;",
    "ampliar analise de custo real",
)
replace_once(
    "client/src/pages/SpreadsheetPage.tsx",
    "  const costPerKm = fuelPrice / kmPerLiter;\n",
    "  const costPerKm = fuelPrice / kmPerLiter;\n  const monthKm = (operationalMonth || []).reduce((sum: number, row: any) => sum + Math.max(0, parseFloat(row.kmFinal || '0') - parseFloat(row.kmInitial || '0')), 0);\n  const otherMonthlyCosts = (expensesMonth || []).reduce((sum: number, row: any) => sum + ['carRental','maintenance','oilChange','washing','insurance','internetPhone','food','parking','tolls','financing','fines','accessories','otherExpenses'].reduce((inner, key) => inner + parseFloat(row[key] || '0'), 0), 0);\n  const historicalOtherCostPerKm = monthKm > 0 ? otherMonthlyCosts / monthKm : 0;\n  const realCostPerKm = costPerKm + historicalOtherCostPerKm;\n",
    "calcular custo real por km",
)
replace_once(
    "client/src/pages/SpreadsheetPage.tsx",
    "    const fuelCost = totalKm * costPerKm;\n    const netProfit = fare - fuelCost;\n    const ratePerKm = fare / totalKm;",
    "    const fuelCost = totalKm * costPerKm;\n    const operatingCost = totalKm * realCostPerKm;\n    const netProfit = fare - operatingCost;\n    const ratePerKm = fare / totalKm;",
    "usar custo real no lucro da corrida",
)
replace_once(
    "client/src/pages/SpreadsheetPage.tsx",
    "    setAnalysis({ totalKm, fuelCost, netProfit, ratePerKm, score, label, color });",
    "    setAnalysis({ totalKm, fuelCost, operatingCost, realCostPerKm, netProfit, ratePerKm, score, label, color });",
    "salvar custo real na analise",
)
replace_once(
    "client/src/pages/SpreadsheetPage.tsx",
    "  const todayTotal = todayEarning ? ['uber','ninetynine','indrive','particular','deliveries','tips','otherEarnings'].reduce((s, k) => s + parseFloat((todayEarning as any)[k] || '0'), 0) : 0;",
    "  const todayTotal = todayEarnings.reduce((sum: number, row: any) => sum + ['uber','ninetynine','indrive','particular','deliveries','tips','otherEarnings'].reduce((s, k) => s + parseFloat(row[k] || '0'), 0), 0);",
    "total correto de ganhos do dia",
)
replace_once(
    "client/src/pages/SpreadsheetPage.tsx",
    "            <div className=\"bg-background/50 rounded-lg p-2\">\n              <p className=\"text-xs text-muted-foreground\">Lucro líquido</p>\n              <p className={`font-bold ${analysis.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>R$ {analysis.netProfit.toFixed(2)}</p>\n            </div>",
    "            <div className=\"bg-background/50 rounded-lg p-2\">\n              <p className=\"text-xs text-muted-foreground\">Custo real estimado</p>\n              <p className=\"font-bold text-amber-300\">R$ {analysis.operatingCost.toFixed(2)}</p>\n              <p className=\"text-[10px] text-muted-foreground\">R$ {analysis.realCostPerKm.toFixed(2)}/km</p>\n            </div>\n            <div className=\"bg-background/50 rounded-lg p-2\">\n              <p className=\"text-xs text-muted-foreground\">Lucro líquido</p>\n              <p className={`font-bold ${analysis.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>R$ {analysis.netProfit.toFixed(2)}</p>\n            </div>",
    "mostrar custo real no analisador",
)

# Remove os arquivos temporários da automação do commit final.
for temp in [Path(".github/scripts/apply_gastos_v2.py"), Path(".github/workflows/apply-gastos-v2.yml")]:
    if temp.exists():
        temp.unlink()

print("Todas as alterações Gastos V2 foram aplicadas com sucesso.")
