from pathlib import Path

path = Path('client/src/pages/AdminVip.tsx')
text = path.read_text(encoding='utf-8')
anchor = '<a href="/vip" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-violet-400/45 bg-violet-500/10 px-4 py-3 text-sm font-black text-violet-200"><ExternalLink className="h-4 w-4" /> Ver página VIP</a>'
replacement = '''<div className="flex flex-wrap gap-2">
<a href="/admin/vip-recebiveis" className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/45 bg-cyan-500/10 px-4 py-3 text-sm font-black text-cyan-200"><ExternalLink className="h-4 w-4" /> Recebíveis VIP</a>
<a href="/vip" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-violet-400/45 bg-violet-500/10 px-4 py-3 text-sm font-black text-violet-200"><ExternalLink className="h-4 w-4" /> Ver página VIP</a>
</div>'''
if '/admin/vip-recebiveis' not in text:
    if text.count(anchor) != 1:
        raise SystemExit('Admin VIP header anchor mismatch')
    text = text.replace(anchor, replacement, 1)
path.write_text(text, encoding='utf-8')
