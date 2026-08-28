from pathlib import Path

path = Path("client/src/components/WelcomeScreen.tsx")
text = path.read_text(encoding="utf-8")
old = '''  const supportVisible = location === "/"
    ? !!onlineSupportState?.chatEnabled
    : !!onlineSupportState?.chatEnabled &&
      !!onlineSupportState?.welcomeButtonEnabled &&
      !!onlineSupportState?.showOnPage;'''
new = '''  const supportVisible = location === "/"
    ? (onlineSupportState ? !!onlineSupportState.chatEnabled : true)
    : !!onlineSupportState?.chatEnabled &&
      !!onlineSupportState?.welcomeButtonEnabled &&
      !!onlineSupportState?.showOnPage;'''
if old not in text:
    raise SystemExit("supportVisible current snippet not found")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
