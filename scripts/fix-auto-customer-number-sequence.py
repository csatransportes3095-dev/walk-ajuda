from pathlib import Path

path = Path("server/db.ts")
text = path.read_text(encoding="utf-8")
old = "SELECT COALESCE(MAX(customerNumber), 0) + 1 AS nextNum FROM customers"
new = "SELECT COALESCE(MAX(CASE WHEN customerNumber <> 99999 THEN customerNumber END), 451) + 1 AS nextNum FROM customers"
if old not in text:
    raise SystemExit("automatic customer number query not found")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
