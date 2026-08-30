from pathlib import Path
import json

# Schema: persist cardColor on H2 Ads groups.
p = Path('drizzle/schema.ts')
s = p.read_text(encoding='utf-8')
marker = '  status: mysqlEnum("status", ["active", "archived"]).notNull().default("active"),\n  sortOrder: int("sortOrder").notNull().default(0),'
replacement = '  status: mysqlEnum("status", ["active", "archived"]).notNull().default("active"),\n  cardColor: varchar("cardColor", { length: 32 }).notNull().default("#148CFF"),\n  sortOrder: int("sortOrder").notNull().default(0),'
if 'cardColor: varchar("cardColor"' not in s:
    if marker not in s: raise SystemExit('schema group marker missing')
    s = s.replace(marker, replacement, 1)
p.write_text(s, encoding='utf-8')

# Safe idempotent migration.
Path('drizzle/0144_h2ads_group_card_color.sql').write_text('''ALTER TABLE `h2ads_groups`\n  ADD COLUMN IF NOT EXISTS `cardColor` varchar(32) NOT NULL DEFAULT '#148CFF' AFTER `status`;\n''', encoding='utf-8')
Path('scripts/apply-h2ads-group-card-color-migration.ts').write_text('''import { readFile } from "node:fs/promises";\nimport path from "node:path";\nimport { createConnection } from "mysql2/promise";\n\nasync function main() {\n  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL não configurada para a migration de cor dos grupos H2 Ads.");\n  const migrationPath = path.resolve(process.cwd(), "drizzle", "0144_h2ads_group_card_color.sql");\n  const sql = (await readFile(migrationPath, "utf8")).trim();\n  if (!/^ALTER TABLE `h2ads_groups`[\\s\\S]+ADD COLUMN IF NOT EXISTS `cardColor`/i.test(sql)) throw new Error("Migration H2 Ads cardColor inválida.");\n  const connection = await createConnection(process.env.DATABASE_URL);\n  try { await connection.query(sql); } finally { await connection.end(); }\n}\nmain().catch((error) => { console.error("[H2ADS-MIGRATION] group card color", error instanceof Error ? error.message : "falhou"); process.exit(1); });\n''', encoding='utf-8')

# Server data layer accepts cardColor on create/update.
p = Path('server/h2ads.ts')
s = p.read_text(encoding='utf-8')
s = s.replace('Partial<Pick<H2AdsGroup, "description" | "status" | "sortOrder">>', 'Partial<Pick<H2AdsGroup, "description" | "status" | "cardColor" | "sortOrder">>')
s = s.replace('    status: input.status ?? "active",\n    sortOrder: input.sortOrder ?? 0,', '    status: input.status ?? "active",\n    cardColor: input.cardColor ?? "#148CFF",\n    sortOrder: input.sortOrder ?? 0,', 1)
p.write_text(s, encoding='utf-8')

# Router validates persisted group color.
p = Path('server/routers/h2ads.ts')
s = p.read_text(encoding='utf-8')
s = s.replace('  status: h2AdsGroupStatusSchema.optional().default("active"),\n  sortOrder:', '  status: h2AdsGroupStatusSchema.optional().default("active"),\n  cardColor: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/).optional().default("#148CFF"),\n  sortOrder:', 1)
s = s.replace('  status: h2AdsGroupStatusSchema.optional(),\n  sortOrder:', '  status: h2AdsGroupStatusSchema.optional(),\n  cardColor: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/).optional(),\n  sortOrder:', 1)
p.write_text(s, encoding='utf-8')

# Client: group form owns the card color and every instance inherits it.
p = Path('client/src/pages/H2Ads.tsx')
s = p.read_text(encoding='utf-8')
s = s.replace('type GroupForm = { id?: number; name: string; description: string; status: "active" | "archived" };', 'type GroupForm = { id?: number; name: string; description: string; status: "active" | "archived"; cardColor: string };')
s = s.replace('const emptyGroup: GroupForm = { name: "", description: "", status: "active" };', 'const emptyGroup: GroupForm = { name: "", description: "", status: "active", cardColor: INSTANCE_DEFAULT_COLOR };')
s = s.replace('const payload = { name, description: groupForm.description.trim() || null, status: groupForm.status };', 'const payload = { name, description: groupForm.description.trim() || null, status: groupForm.status, cardColor: groupForm.cardColor.toUpperCase() };', 1)
s = s.replace('onEditGroup={() => setGroupForm({ id: group.id, name: group.name, description: group.description ?? "", status: group.status })}', 'onEditGroup={() => setGroupForm({ id: group.id, name: group.name, description: group.description ?? "", status: group.status, cardColor: group.cardColor || INSTANCE_DEFAULT_COLOR })}', 1)

old_modal = '<Field label="Descrição"><textarea value={groupForm.description} onChange={event => setGroupForm({ ...groupForm, description: event.target.value })} placeholder="Opcional" /></Field><Field label="Estado"><select value={groupForm.status}'
new_modal = '<Field label="Descrição"><textarea value={groupForm.description} onChange={event => setGroupForm({ ...groupForm, description: event.target.value })} placeholder="Opcional" /></Field><Field label="Cor dos cards das instâncias"><div className="flex items-center gap-3"><input type="color" value={groupForm.cardColor} onChange={event => setGroupForm({ ...groupForm, cardColor: event.target.value.toUpperCase() })} className="h-11 w-16 cursor-pointer rounded-lg border border-white/10 bg-black/20 p-1" /><div className="flex-1 rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-slate-300" style={{ backgroundColor: colorBackground(groupForm.cardColor), borderColor: groupForm.cardColor }}>{groupForm.cardColor} · todas as instâncias deste grupo</div></div></Field><Field label="Estado"><select value={groupForm.status}'
if old_modal not in s: raise SystemExit('group modal marker missing')
s = s.replace(old_modal, new_modal, 1)

# GroupSection type and color source.
s = s.replace('group: { id: number; name: string; description: string | null; status: "active" | "archived"; sortOrder: number }', 'group: { id: number; name: string; description: string | null; status: "active" | "archived"; cardColor: string; sortOrder: number }', 1)
s = s.replace('const groupColor = visualColors[visualColorKey("group", group.id)] ?? GROUP_DEFAULT_COLOR;', 'const groupColor = group.cardColor || INSTANCE_DEFAULT_COLOR;', 1)

# Remove local group color picker from header (color is edited in group modal).
old_picker = '<label className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-white/10 bg-black/30" title="Escolher cor do grupo"><input type="color" value={groupColor} onChange={event => onVisualColor("group", group.id, event.target.value)} className="h-5 w-5 cursor-pointer border-0 bg-transparent p-0" aria-label={`Cor do grupo ${group.name}`} /></label>'
s = s.replace(old_picker, '', 1)

# Each instance receives group color, not individual local color.
old_instance_call = 'visualColor={visualColors[visualColorKey("instance", instance.id)] ?? INSTANCE_DEFAULT_COLOR} actionState={instanceAction[instance.id]} onVisualColor={color => onVisualColor("instance", instance.id, color)}'
new_instance_call = 'visualColor={groupColor} actionState={instanceAction[instance.id]}'
if old_instance_call not in s: raise SystemExit('instance visual color marker missing')
s = s.replace(old_instance_call, new_instance_call, 1)

# InstanceCard signature removes individual color mutation.
s = s.replace('visualColor, actionState, onVisualColor, onAssignWorker', 'visualColor, actionState, onAssignWorker', 1)
s = s.replace('visualColor: string; actionState?: string; onVisualColor: (color: string) => void; onAssignWorker:', 'visualColor: string; actionState?: string; onAssignWorker:', 1)

# Whole card gets group-derived background and border. Remove per-instance picker.
s = s.replace('return <article className="min-w-0 rounded-2xl border border-white/10 bg-[#10131A]/90 p-4 xl:p-4">', 'return <article className="min-w-0 rounded-2xl border p-4 xl:p-4" style={{ borderColor: `${visualColor}66`, background: `linear-gradient(145deg, ${visualColor}2E 0%, ${visualColor}14 42%, #10131AEF 100%)`, boxShadow: `inset 0 1px 0 ${visualColor}22` }}>')
old_instance_picker = '<label className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-white/10 bg-black/30" title="Escolher cor da instância"><input type="color" value={visualColor} onChange={event => onVisualColor(event.target.value)} className="h-4 w-4 cursor-pointer border-0 bg-transparent p-0" aria-label={`Cor da instância ${instance.name}`} /></label>'
s = s.replace(old_instance_picker, '', 1)
p.write_text(s, encoding='utf-8')

# Package script.
p = Path('package.json')
data = json.loads(p.read_text(encoding='utf-8'))
data['scripts']['db:migrate:h2ads-group-card-color'] = 'tsx scripts/apply-h2ads-group-card-color-migration.ts'
p.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')

# Render boot migration before server start.
p = Path('scripts/render-start.sh')
s = p.read_text(encoding='utf-8')
marker = 'run_boot_step "db-migrate-h2ads-order-links" pnpm run db:migrate:h2ads-order-links\n'
step = 'run_boot_step "db-migrate-h2ads-group-card-color" pnpm run db:migrate:h2ads-group-card-color\n'
if step not in s:
    if marker not in s: raise SystemExit('render start marker missing')
    s = s.replace(marker, marker + step, 1)
p.write_text(s, encoding='utf-8')
