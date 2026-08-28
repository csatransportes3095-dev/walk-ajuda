from pathlib import Path

zoho = Path("server/zoho.ts")
text = zoho.read_text(encoding="utf-8")
text = text.replace("// Cache de credenciais de todos os servidores ativos (expira em 30s)", "// Cache curto: servidor criado/ativado no ADM deve aparecer quase imediatamente")
old = "cachedActiveConfigs = all.filter((c: any) => c.isActive === 1);\n    configCacheExpiresAt = now + 30_000;"
new = "cachedActiveConfigs = all.filter((c: any) => Number(c.isActive) === 1);\n    configCacheExpiresAt = now + 1_000;"
if old not in text:
    raise SystemExit("Zoho active-config cache snippet not found")
zoho.write_text(text.replace(old, new, 1), encoding="utf-8")

page = Path("client/src/pages/AdminEmail.tsx")
text = page.read_text(encoding="utf-8")
old = "const { data: groups = [], isLoading, refetch } = trpc.email.list.useQuery();"
new = "const { data: groups = [], isLoading, refetch } = trpc.email.list.useQuery(undefined, { staleTime: 0, refetchInterval: 2_000, refetchIntervalInBackground: true, refetchOnWindowFocus: true });"
if old not in text:
    raise SystemExit("AdminEmail query snippet not found")
page.write_text(text.replace(old, new, 1), encoding="utf-8")
