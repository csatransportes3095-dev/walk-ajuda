from pathlib import Path

path = Path("client/src/components/WelcomeScreen.tsx")
text = path.read_text(encoding="utf-8")

old_status = '''  const supportSortOrder = Number(onlineSupportState?.buttonSortOrder || 3);
  const supportStatusText = (onlineSupportState as any)?.customStatusText || (onlineSupportState?.onlineNow ? "online" : "fora do horário");'''
new_status = '''  const supportSortOrder = Number(onlineSupportState?.buttonSortOrder || 3);
  const supportCustomStatusText = String((onlineSupportState as any)?.customStatusText || "").trim();
  const supportStatusText = supportCustomStatusText || (onlineSupportState?.onlineNow ? "online" : "fora do horário");'''
if old_status not in text:
    raise SystemExit("status declaration snippet not found")
text = text.replace(old_status, new_status, 1)

old_meta = '''          <span className="mt-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-white/75">
            <span className={`h-1.5 w-1.5 rounded-full ${onlineSupportState?.onlineNow ? "bg-lime-300 animate-pulse" : "bg-white/40"}`} />
            {onlineSupportState?.onlineNow ? "Atendimento online" : "Atendimento disponível"}
          </span>'''
new_meta = '''          {!supportCustomStatusText && (
            <span className="mt-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-white/75">
              <span className={`h-1.5 w-1.5 rounded-full ${onlineSupportState?.onlineNow ? "bg-lime-300 animate-pulse" : "bg-white/40"}`} />
              {onlineSupportState?.onlineNow ? "Atendimento online" : "Fora do horário"}
            </span>
          )}'''
if old_meta not in text:
    raise SystemExit("status meta snippet not found")
text = text.replace(old_meta, new_meta, 1)

path.write_text(text, encoding="utf-8")
