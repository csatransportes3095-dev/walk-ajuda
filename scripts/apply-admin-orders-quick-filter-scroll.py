from pathlib import Path

path = Path('client/src/pages/AdminOrders.tsx')
text = path.read_text(encoding='utf-8')

old_start = '''                      return (\n                        <div className="flex w-full items-stretch gap-2 overflow-x-auto pb-1 pr-1 snap-x" style={{ scrollbarWidth: "none" }} aria-label="Filtros operacionais de pedidos">\n                          {quickFilters.map(f => {'''

new_start = '''                      return (\n                        <div className="flex w-full min-w-0 items-stretch gap-1.5" aria-label="Navegação dos filtros operacionais de pedidos">\n                          <button\n                            type="button"\n                            onClick={(e) => {\n                              const scroller = e.currentTarget.parentElement?.querySelector<HTMLElement>('[data-quick-filter-scroll]');\n                              scroller?.scrollBy({ left: -Math.max(260, scroller.clientWidth * 0.7), behavior: 'smooth' });\n                            }}\n                            className="shrink-0 w-9 rounded-xl border border-zinc-700 bg-zinc-900/95 text-zinc-300 hover:border-zinc-500 hover:bg-zinc-800 hover:text-white transition-colors flex items-center justify-center"\n                            title="Ver filtros anteriores"\n                            aria-label="Ver filtros anteriores"\n                          >\n                            <ChevronDown className="h-4 w-4 rotate-90" />\n                          </button>\n                          <div\n                            data-quick-filter-scroll\n                            className="flex min-w-0 flex-1 items-stretch gap-2 overflow-x-auto pb-2 snap-x snap-mandatory"\n                            style={{ scrollbarWidth: 'thin', scrollbarColor: '#52525b #18181b' }}\n                            aria-label="Filtros operacionais de pedidos"\n                          >\n                          {quickFilters.map(f => {'''

if old_start not in text:
    raise SystemExit('ERRO: inicio da faixa de filtros nao encontrado')
text = text.replace(old_start, new_start, 1)

old_end = '''                          })}\n                        </div>\n                      );'''
new_end = '''                          })}\n                          </div>\n                          <button\n                            type="button"\n                            onClick={(e) => {\n                              const scroller = e.currentTarget.parentElement?.querySelector<HTMLElement>('[data-quick-filter-scroll]');\n                              scroller?.scrollBy({ left: Math.max(260, scroller.clientWidth * 0.7), behavior: 'smooth' });\n                            }}\n                            className="shrink-0 w-9 rounded-xl border border-zinc-700 bg-zinc-900/95 text-zinc-300 hover:border-zinc-500 hover:bg-zinc-800 hover:text-white transition-colors flex items-center justify-center"\n                            title="Ver próximos filtros"\n                            aria-label="Ver próximos filtros"\n                          >\n                            <ChevronDown className="h-4 w-4 -rotate-90" />\n                          </button>\n                        </div>\n                      );'''

# Restrict replacement to the first closing immediately after quickFilters in this exact block.
anchor = text.find('data-quick-filter-scroll')
end_pos = text.find(old_end, anchor)
if end_pos < 0:
    raise SystemExit('ERRO: final da faixa de filtros nao encontrado')
text = text[:end_pos] + text[end_pos:].replace(old_end, new_end, 1)

path.write_text(text, encoding='utf-8')
print('Filtro responsivo aplicado.')
