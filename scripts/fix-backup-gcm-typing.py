from pathlib import Path

path = Path("server/backupService.ts")
text = path.read_text(encoding="utf-8")
old = '  let decipher: ReturnType<typeof createDecipheriv> | null = null;'
new = '  let decipher: any = null; // createDecipheriv(aes-256-gcm) exposes setAuthTag at runtime; Node typings widen the return type.'
if old not in text:
    raise SystemExit("AES-GCM decipher typing anchor not found")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
