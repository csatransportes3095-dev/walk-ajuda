from pathlib import Path

service = Path("server/online-support/service.ts")
text = service.read_text(encoding="utf-8")
old = '''export async function getPublicState(pathname: string) {
  const config = await getOrCreateConfig();
  const menuItems = await listMenuItems(true);
  const notifications = config.notificationsEnabled === 1;
  const allowedPages = parseJson<string[]>(config.allowedPages, ["/"]);

  return {
    chatEnabled: config.chatEnabled === 1,
    welcomeButtonEnabled: pathname === "/" && config.chatEnabled === 1 ? true : config.welcomeButtonEnabled === 1,
    floatingBubbleEnabled: config.floatingBubbleEnabled === 1,
    maintenanceMode: config.maintenanceMode === 1,
    buttonLabel: config.buttonLabel,
    buttonDescription: config.buttonDescription,
    buttonIcon: config.buttonIcon,
    buttonColor: config.buttonColor,
    botAvatar: config.botAvatar || null,
    buttonSortOrder: config.buttonSortOrder,
    customStatusText: config.customStatusText || null,
    openMode: config.openMode,
    disabledMessage: config.disabledMessage,
    welcomeMessage: config.welcomeMessage,
    outOfHoursMessage: config.outOfHoursMessage,
    notificationsEnabled: notifications,
    allowedPages,
    showOnPage: pathname === "/" && config.chatEnabled === 1 ? true : allowedPages.length === 0 || allowedPages.includes(pathname),
    menuItems,
    onlineNow: await isInWorkingHours(),
  };
}'''
new = '''export async function getPublicState(pathname: string) {
  const config = await getOrCreateConfig();
  const notifications = config.notificationsEnabled === 1;
  const allowedPages = parseJson<string[]>(config.allowedPages, ["/"]);

  // A configuracao principal do ADM nunca deve deixar de chegar ao cliente
  // por falha em tabelas auxiliares restauradas (menu/horarios).
  let menuItems: Awaited<ReturnType<typeof listMenuItems>> = [];
  try {
    menuItems = await listMenuItems(true);
  } catch (error) {
    console.error("[online-support] falha ao carregar menu publico", error);
  }

  let onlineNow = false;
  try {
    onlineNow = await isInWorkingHours();
  } catch (error) {
    console.error("[online-support] falha ao carregar horario publico", error);
  }

  return {
    chatEnabled: config.chatEnabled === 1,
    welcomeButtonEnabled: pathname === "/" && config.chatEnabled === 1 ? true : config.welcomeButtonEnabled === 1,
    floatingBubbleEnabled: config.floatingBubbleEnabled === 1,
    maintenanceMode: config.maintenanceMode === 1,
    buttonLabel: config.buttonLabel,
    buttonDescription: config.buttonDescription,
    buttonIcon: config.buttonIcon,
    buttonColor: config.buttonColor,
    botAvatar: config.botAvatar || null,
    buttonSortOrder: config.buttonSortOrder,
    customStatusText: config.customStatusText || null,
    openMode: config.openMode,
    disabledMessage: config.disabledMessage,
    welcomeMessage: config.welcomeMessage,
    outOfHoursMessage: config.outOfHoursMessage,
    notificationsEnabled: notifications,
    allowedPages,
    showOnPage: pathname === "/" && config.chatEnabled === 1 ? true : allowedPages.length === 0 || allowedPages.includes(pathname),
    menuItems,
    onlineNow,
  };
}'''
if old not in text:
    raise SystemExit("getPublicState snippet not found")
service.write_text(text.replace(old, new, 1), encoding="utf-8")

welcome = Path("client/src/components/WelcomeScreen.tsx")
text = welcome.read_text(encoding="utf-8")
old = '''  const supportVisible = location === "/"
    ? (onlineSupportState ? !!onlineSupportState.chatEnabled : true)
    : !!onlineSupportState?.chatEnabled &&
      !!onlineSupportState?.welcomeButtonEnabled &&
      !!onlineSupportState?.showOnPage;'''
new = '''  const supportVisible = location === "/"
    ? !!onlineSupportState?.chatEnabled
    : !!onlineSupportState?.chatEnabled &&
      !!onlineSupportState?.welcomeButtonEnabled &&
      !!onlineSupportState?.showOnPage;'''
if old not in text:
    raise SystemExit("supportVisible fallback snippet not found")
welcome.write_text(text.replace(old, new, 1), encoding="utf-8")
