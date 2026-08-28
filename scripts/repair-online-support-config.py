from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"expected snippet not found in {path}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")


service = Path("server/online-support/service.ts")
text = service.read_text(encoding="utf-8")
old_service = '''async function ensureOnlineSupportBotAvatarColumn() {
  if (onlineSupportBotAvatarColumnReady) return;
  const db = await getDb();
  if (!db) return;
  try {
    await db.execute(sql.raw("ALTER TABLE onlineSupportConfig ADD COLUMN IF NOT EXISTS botAvatar VARCHAR(1024) NULL"));
  } catch {
    try { await db.execute(sql.raw("ALTER TABLE onlineSupportConfig ADD COLUMN botAvatar VARCHAR(1024) NULL")); } catch { /* coluna já existe */ }
  }
  onlineSupportBotAvatarColumnReady = true;
}'''
new_service = '''async function ensureOnlineSupportBotAvatarColumn() {
  if (onlineSupportBotAvatarColumnReady) return;
  const db = await getDb();
  if (!db) return;

  const ensureColumn = async (definition: string) => {
    try {
      await db.execute(sql.raw(`ALTER TABLE onlineSupportConfig ADD COLUMN IF NOT EXISTS ${definition}`));
    } catch {
      try { await db.execute(sql.raw(`ALTER TABLE onlineSupportConfig ADD COLUMN ${definition}`)); } catch { /* coluna já existe */ }
    }
  };

  await ensureColumn("buttonSortOrder INT NOT NULL DEFAULT 3");
  await ensureColumn("customStatusText VARCHAR(128) NULL");
  await ensureColumn("botAvatar VARCHAR(1024) NULL");
  onlineSupportBotAvatarColumnReady = true;
}'''
if old_service not in text:
    raise SystemExit("service repair snippet not found")
service.write_text(text.replace(old_service, new_service, 1), encoding="utf-8")

admin = Path("client/src/pages/AdminOnlineSupport.tsx")
text = admin.read_text(encoding="utf-8")
old_mut = '''  const configMut = trpc.onlineSupport.adminConfigUpdate.useMutation({
    onSuccess: () => { configQ.refetch(); toast.success("Configurações salvas!"); }
  });'''
new_mut = '''  const configMut = trpc.onlineSupport.adminConfigUpdate.useMutation({
    onSuccess: async () => {
      await configQ.refetch();
      toast.success("Configurações salvas!");
    },
    onError: (error) => {
      toast.error(error?.message || "Não foi possível salvar as configurações do bot.");
    },
  });'''
if old_mut not in text:
    raise SystemExit("admin mutation snippet not found")
text = text.replace(old_mut, new_mut, 1)
old_button = '''              <button
                onClick={() => configMut.mutate({ buttonLabel: cfgLabel, welcomeMessage: cfgWelcome, buttonColor: cfgColor, botAvatar: cfgBotAvatar || null, chatEnabled: cfgEnabled, customStatusText: cfgStatusText, buttonSortOrder: cfgSortOrder } as any)}
                className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm transition-colors"
              >
                Salvar Configurações
              </button>'''
new_button = '''              <button
                onClick={() => configMut.mutate({ buttonLabel: cfgLabel.trim() || "ATENDIMENTO ONLINE", welcomeMessage: cfgWelcome, buttonColor: cfgColor, botAvatar: cfgBotAvatar || null, chatEnabled: cfgEnabled, customStatusText: cfgStatusText.trim(), buttonSortOrder: cfgSortOrder } as any)}
                disabled={configMut.isPending}
                className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-sm transition-colors"
              >
                {configMut.isPending ? "Salvando..." : "Salvar Configurações"}
              </button>'''
if old_button not in text:
    raise SystemExit("admin save button snippet not found")
admin.write_text(text.replace(old_button, new_button, 1), encoding="utf-8")

welcome = Path("client/src/components/WelcomeScreen.tsx")
text = welcome.read_text(encoding="utf-8")
old_visible = '''  const supportVisible =
    !!onlineSupportState?.chatEnabled &&
    !!onlineSupportState?.welcomeButtonEnabled &&
    !!onlineSupportState?.showOnPage;'''
new_visible = '''  const supportVisible = location === "/"
    ? !!onlineSupportState?.chatEnabled
    : !!onlineSupportState?.chatEnabled &&
      !!onlineSupportState?.welcomeButtonEnabled &&
      !!onlineSupportState?.showOnPage;'''
if old_visible in text:
    welcome.write_text(text.replace(old_visible, new_visible, 1), encoding="utf-8")
