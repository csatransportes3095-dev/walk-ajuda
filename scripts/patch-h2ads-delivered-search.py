from pathlib import Path

shared = Path('shared/h2adsOrderSearch.ts')
text = shared.read_text(encoding='utf-8')
marker = 'export function matchesH2AdsOrderSearch(order: H2AdsOrderSearchable, search: string): boolean {'
helper = '''export function canShowH2AdsOrderForLink(status: string | null | undefined, isCurrent: boolean, hasSearch: boolean): boolean {
  if (isCurrent) return true;
  if (status === "cancelado") return false;
  if (status === "pedido_entregue" || status === "entregue" || status === "login_de_acesso") return hasSearch;
  return true;
}

'''
if 'canShowH2AdsOrderForLink' not in text:
    if marker not in text:
        raise SystemExit('shared helper marker not found')
    text = text.replace(marker, helper + marker, 1)
shared.write_text(text, encoding='utf-8')

component = Path('client/src/components/H2AdsOrderLinkControl.tsx')
text = component.read_text(encoding='utf-8')
old_import = 'import { getExactH2AdsCustomerNumberSearch, matchesH2AdsOrderSearch, normalizeH2AdsOrderSearch } from "@shared/h2adsOrderSearch";'
new_import = 'import { canShowH2AdsOrderForLink, getExactH2AdsCustomerNumberSearch, matchesH2AdsOrderSearch, normalizeH2AdsOrderSearch } from "@shared/h2adsOrderSearch";'
if old_import in text:
    text = text.replace(old_import, new_import, 1)
old_filter = '''    const active = order.latestStatus !== "pedido_entregue" && order.latestStatus !== "cancelado";
    if (!active && key !== currentKey) return false;
    if (!normalizedSearch || key === currentKey) return true;
    return matchesH2AdsOrderSearch(order, search);'''
new_filter = '''    const isCurrent = key === currentKey;
    if (!canShowH2AdsOrderForLink(order.latestStatus, isCurrent, Boolean(normalizedSearch))) return false;
    if (!normalizedSearch || isCurrent) return true;
    return matchesH2AdsOrderSearch(order, search);'''
if old_filter not in text:
    raise SystemExit('H2ADS filter marker not found')
text = text.replace(old_filter, new_filter, 1)
component.write_text(text, encoding='utf-8')

test = Path('server/h2adsOrderSearch.test.ts')
t = test.read_text(encoding='utf-8')
t = t.replace('import { getExactH2AdsCustomerNumberSearch, matchesH2AdsOrderSearch, normalizeH2AdsOrderSearch } from "../shared/h2adsOrderSearch";', 'import { canShowH2AdsOrderForLink, getExactH2AdsCustomerNumberSearch, matchesH2AdsOrderSearch, normalizeH2AdsOrderSearch } from "../shared/h2adsOrderSearch";')
insert = '''
  it("libera pedido entregue apenas dentro de busca do H2ADS", () => {
    expect(canShowH2AdsOrderForLink("pedido_entregue", false, false)).toBe(false);
    expect(canShowH2AdsOrderForLink("pedido_entregue", false, true)).toBe(true);
    expect(canShowH2AdsOrderForLink("entregue", false, true)).toBe(true);
    expect(canShowH2AdsOrderForLink("login_de_acesso", false, true)).toBe(true);
    expect(canShowH2AdsOrderForLink("cancelado", false, true)).toBe(false);
    expect(canShowH2AdsOrderForLink("pedido_entregue", true, false)).toBe(true);
  });
'''
if 'libera pedido entregue apenas dentro de busca do H2ADS' not in t:
    end = '\n});\n'
    if not t.endswith(end):
        raise SystemExit('test end marker not found')
    t = t[:-len(end)] + insert + end
test.write_text(t, encoding='utf-8')
