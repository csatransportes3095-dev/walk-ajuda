from pathlib import Path

path = Path("server/online-support/service.ts")
text = path.read_text(encoding="utf-8")
old = '  const rows = await db.select().from(onlineSupportConfig).limit(1);'
new = '  const rows = await db.select().from(onlineSupportConfig).orderBy(desc(onlineSupportConfig.id)).limit(1);'
if old not in text:
    raise SystemExit("config selector snippet not found")
text = text.replace(old, new, 1)
old2 = '  const afterInsert = await db.select().from(onlineSupportConfig).limit(1);'
new2 = '  const afterInsert = await db.select().from(onlineSupportConfig).orderBy(desc(onlineSupportConfig.id)).limit(1);'
if old2 in text:
    text = text.replace(old2, new2, 1)
path.write_text(text, encoding="utf-8")
