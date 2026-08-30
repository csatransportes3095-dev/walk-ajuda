from pathlib import Path
import runpy

p = Path('drizzle/schema.ts')
s = p.read_text(encoding='utf-8')
marker = '  status: mysqlEnum("status", ["active", "archived"]).notNull().default("active"),\n  sortOrder: int("sortOrder").notNull().default(0),'
replacement = '  status: mysqlEnum("status", ["active", "archived"]).notNull().default("active"),\n  cardColor: varchar("cardColor", { length: 32 }).notNull().default("#148CFF"),\n  sortOrder: int("sortOrder").notNull().default(0),'
if replacement not in s:
    if marker not in s:
        raise SystemExit('h2ads_groups schema marker missing')
    s = s.replace(marker, replacement, 1)
    p.write_text(s, encoding='utf-8')

runpy.run_path('scripts/patch-h2ads-group-card-colors.py', run_name='__main__')
