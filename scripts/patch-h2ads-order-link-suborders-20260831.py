from pathlib import Path
import re


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label}: esperado 1 trecho, encontrado {count}")
    return source.replace(old, new, 1)


def regex_once(source: str, pattern: str, replacement: str, label: str) -> str:
    updated, count = re.subn(pattern, replacement, source, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"{label}: esperado 1 trecho, encontrado {count}")
    return updated


# 1) Backend: busca de criação precisa respeitar todos os pedidos/subpedidos reais.
path = Path('server/h2adsOrderLink.ts')
source = path.read_text(encoding='utf-8')
source = replace_once(
    source,
    'export function splitH2AdsOrderHistory(historyNewestFirst: HistoryEntry[], initialStatus: string): HistoryEntry[][] {\n  const chronological = [...historyNewestFirst].reverse();\n  const groups: HistoryEntry[][] = [];\n  let current: HistoryEntry[] = [];',
    'export function splitH2AdsOrderHistory<T extends HistoryEntry>(historyNewestFirst: T[], initialStatus: string): T[][] {\n  const chronological = [...historyNewestFirst].reverse();\n  const groups: T[][] = [];\n  let current: T[] = [];',
    'split generico preserva metadados',
)

new_search = r'''export async function searchH2AdsCustomersForNewInstance(search: string): Promise<H2AdsCustomerOrderSearchResult[]> {
  const db = await requireH2AdsDb();
  const raw = search.trim();
  if (!raw) return [];
  const exactMatch = raw.match(/^\*(\d+)$/);
  const digits = raw.replace(/\D/g, "");
  const text = raw.replace(/^[#*]+/, "").trim();

  let customerRows: Array<Record<string, unknown>> = [];
  if (exactMatch) {
    const customerNumber = Number(exactMatch[1]);
    customerRows = rowsFrom(await db.execute(sql`
      SELECT id, customerNumber, name, phone, profilePhotoUrl
      FROM customers
      WHERE customerNumber = ${customerNumber} AND deletedAt IS NULL
      LIMIT 1
    `));
  } else {
    const like = `%${text}%`;
    const phoneLike = `%${digits}%`;
    customerRows = rowsFrom(await db.execute(sql`
      SELECT id, customerNumber, name, phone, profilePhotoUrl
      FROM customers
      WHERE deletedAt IS NULL AND (
        name LIKE ${like}
        OR CAST(customerNumber AS CHAR) LIKE ${like}
        OR (${digits ? sql.raw(normalizePhoneSql("phone")) : sql`''`}) LIKE ${phoneLike}
      )
      ORDER BY customerNumber DESC, id DESC
      LIMIT 20
    `));
  }

  const initialStatus = await getInitialOrderStatus();
  const linkedRows = rowsFrom(await db.execute(sql`
    SELECT registrationId, subOrderIndex FROM h2ads_order_links
  `));
  const linkedKeys = new Set(linkedRows.map(row => `${Number(row.registrationId)}:${Number(row.subOrderIndex || 0)}`));
  const candidates: Array<{ result: H2AdsCustomerOrderSearchResult; sortAt: number }> = [];

  for (const customer of customerRows) {
    const phone = String(customer.phone || "").replace(/\D/g, "");
    if (!phone) continue;
    const orderRows = rowsFrom(await db.execute(sql.raw(`
      SELECT registrationId, orderNumber, status, serviceName, serviceOption, createdAt, id
      FROM orderStatusHistory
      WHERE ${normalizePhoneSql("customerPhone")} = '${phone.replace(/'/g, "''")}'
      ORDER BY createdAt DESC, id DESC
      LIMIT 500
    `)));

    const rowsByRegistration = new Map<number, Array<Record<string, unknown> & { status: string }>>();
    for (const row of orderRows) {
      const registrationId = Number(row.registrationId);
      if (!Number.isInteger(registrationId) || registrationId < 1) continue;
      const current = rowsByRegistration.get(registrationId) ?? [];
      current.push({ ...row, status: String(row.status || "") });
      rowsByRegistration.set(registrationId, current);
    }

    for (const [registrationId, historyNewestFirst] of rowsByRegistration) {
      const subOrders = splitH2AdsOrderHistory(historyNewestFirst, initialStatus);
      for (let subOrderIndex = 0; subOrderIndex < subOrders.length; subOrderIndex += 1) {
        const segment = subOrders[subOrderIndex];
        const latest = segment[segment.length - 1];
        if (!latest || latest.status === "cancelado") continue;
        const key = `${registrationId}:${subOrderIndex}`;
        if (linkedKeys.has(key)) continue;

        const latestWith = (field: string): unknown => {
          for (let index = segment.length - 1; index >= 0; index -= 1) {
            const value = segment[index]?.[field];
            if (value !== null && value !== undefined && value !== "") return value;
          }
          return null;
        };
        const createdAtValue = latestWith("createdAt");
        const sortAt = createdAtValue instanceof Date ? createdAtValue.getTime() : Date.parse(String(createdAtValue || "")) || 0;

        candidates.push({
          sortAt,
          result: {
            registrationId,
            subOrderIndex,
            customerNumber: customer.customerNumber === null || customer.customerNumber === undefined ? null : Number(customer.customerNumber),
            customerName: customer.name ? String(customer.name) : null,
            phone: customer.phone ? String(customer.phone) : null,
            orderNumber: latestWith("orderNumber") === null ? null : Number(latestWith("orderNumber")),
            serviceName: latestWith("serviceName") ? String(latestWith("serviceName")) : null,
            serviceOption: latestWith("serviceOption") ? String(latestWith("serviceOption")) : null,
            latestStatus: latest.status || null,
            customerProfilePhotoUrl: customer.profilePhotoUrl ? String(customer.profilePhotoUrl) : null,
          },
        });
      }
    }
  }

  candidates.sort((a, b) => b.sortAt - a.sortAt || (b.result.orderNumber ?? b.result.registrationId) - (a.result.orderNumber ?? a.result.registrationId));
  const unique = new Map<string, H2AdsCustomerOrderSearchResult>();
  for (const candidate of candidates) {
    const key = `${candidate.result.registrationId}:${candidate.result.subOrderIndex}`;
    if (!unique.has(key)) unique.set(key, candidate.result);
  }
  return [...unique.values()].slice(0, exactMatch ? 20 : 12);
}
'''
source = regex_once(
    source,
    r'export async function searchH2AdsCustomersForNewInstance\(search: string\): Promise<H2AdsCustomerOrderSearchResult\[]> \{.*?\n\}\n\nexport async function listH2AdsOrderLinks',
    new_search + '\nexport async function listH2AdsOrderLinks',
    'busca subpedido-aware',
)

for marker in [
    'const subOrders = splitH2AdsOrderHistory(historyNewestFirst, initialStatus);',
    'subOrderIndex,',
    'return [...unique.values()].slice(0, exactMatch ? 20 : 12);',
    'SELECT registrationId, subOrderIndex FROM h2ads_order_links',
]:
    if marker not in source:
        raise SystemExit(f'backend marcador ausente: {marker}')
if 'subOrderIndex: 0,' in source[source.index('export async function searchH2AdsCustomersForNewInstance'):source.index('export async function listH2AdsOrderLinks')]:
    raise SystemExit('backend ainda força subOrderIndex 0 na busca de nova instância')
path.write_text(source, encoding='utf-8')


# 2) Picker: deixa claro quando há mais de um item/pedido do mesmo cliente.
path = Path('client/src/components/H2AdsNewInstanceOrderPicker.tsx')
source = path.read_text(encoding='utf-8')
source = replace_once(
    source,
    'Busca direto no cadastro do cliente e vincula ao pedido encontrado.',
    'Busca o cadastro e mostra cada pedido/subpedido disponível para você vincular o item correto.',
    'texto picker',
)
source = replace_once(
    source,
    'Pedido #{value.orderNumber || value.registrationId} · {[value.serviceName, value.serviceOption].filter(Boolean).join(" · ") || "Pedido"}',
    'Pedido #{value.orderNumber || value.registrationId}{value.subOrderIndex > 0 ? ` · item ${value.subOrderIndex + 1}` : ""} · {[value.serviceName, value.serviceOption].filter(Boolean).join(" · ") || "Pedido"}',
    'item selecionado',
)
source = replace_once(
    source,
    '#{order.orderNumber || order.registrationId} · {[order.serviceName, order.serviceOption].filter(Boolean).join(" · ") || "Pedido"}',
    source='#{order.orderNumber || order.registrationId}{order.subOrderIndex > 0 ? ` · item ${order.subOrderIndex + 1}` : ""} · {[order.serviceName, order.serviceOption].filter(Boolean).join(" · ") || "Pedido"}',
    label='item resultado',
)
path.write_text(source, encoding='utf-8')


# 3) Resolver compartilhado: encontra candidato de reparo somente quando é único e compatível.
path = Path('shared/h2adsOrderBrowserShortcut.ts')
source = path.read_text(encoding='utf-8')
source += r'''

export type H2AdsOrderRepairLike = {
  id: number;
  subOrderIndex?: number | null;
  customerNumber?: number | null;
  serviceName?: string | null;
  serviceOption?: string | null;
};

function normalizeRepairText(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function resolveH2AdsOrderLinkRepairCandidate(input: {
  registrationId: number;
  subOrderIndex: number;
  customerNumber: number | null | undefined;
  serviceName: string | null | undefined;
  serviceOption: string | null | undefined;
  links: H2AdsOrderLinkLike[];
  orders: H2AdsOrderRepairLike[];
}): number | null {
  if (input.links.some(link => link.registrationId === input.registrationId && link.subOrderIndex === input.subOrderIndex)) return null;
  const customerNumber = Number(input.customerNumber || 0);
  if (!Number.isInteger(customerNumber) || customerNumber < 1) return null;
  const serviceKey = `${normalizeRepairText(input.serviceName)}|${normalizeRepairText(input.serviceOption)}`;
  if (serviceKey === "|") return null;

  const orderByKey = new Map(input.orders.map(order => [`${order.id}:${Number(order.subOrderIndex || 0)}`, order]));
  const candidates = new Set<number>();
  for (const link of input.links) {
    const linkedOrder = orderByKey.get(`${link.registrationId}:${link.subOrderIndex}`);
    if (!linkedOrder || Number(linkedOrder.customerNumber || 0) !== customerNumber) continue;
    const linkedServiceKey = `${normalizeRepairText(linkedOrder.serviceName)}|${normalizeRepairText(linkedOrder.serviceOption)}`;
    if (linkedServiceKey === serviceKey) candidates.add(link.instanceId);
  }
  return candidates.size === 1 ? [...candidates][0] : null;
}
'''
path.write_text(source, encoding='utf-8')


# 4) Atalho no pedido: se o vínculo exato não existe mas há um único candidato compatível, oferece reparar.
path = Path('client/src/components/OrderH2AdsBrowserShortcut.tsx')
source = path.read_text(encoding='utf-8')
source = replace_once(
    source,
    'import { resolveH2AdsOrderBrowserShortcutState } from "@shared/h2adsOrderBrowserShortcut";',
    'import { resolveH2AdsOrderBrowserShortcutState, resolveH2AdsOrderLinkRepairCandidate } from "@shared/h2adsOrderBrowserShortcut";',
    'import repair resolver',
)
source = replace_once(
    source,
    'export default function OrderH2AdsBrowserShortcut({ registrationId, subOrderIndex }: { registrationId: number; subOrderIndex: number }) {',
    'export default function OrderH2AdsBrowserShortcut({ registrationId, subOrderIndex, customerNumber, serviceName, serviceOption }: { registrationId: number; subOrderIndex: number; customerNumber?: number | null; serviceName?: string | null; serviceOption?: string | null }) {',
    'props do pedido',
)
source = replace_once(
    source,
    '  const launchBrowser = trpc.h2Ads.launchBrowser.useMutation();\n  const closeBrowser = trpc.h2Ads.closeBrowser.useMutation();',
    '  const ordersQuery = trpc.orderStatus.listOrders.useQuery(undefined, { staleTime: 0, refetchOnWindowFocus: true });\n  const launchBrowser = trpc.h2Ads.launchBrowser.useMutation();\n  const closeBrowser = trpc.h2Ads.closeBrowser.useMutation();\n  const setOrderLink = trpc.h2Ads.setOrderLink.useMutation();',
    'queries e mutation repair',
)
source = replace_once(
    source,
    '  if (!shortcut) return null;\n\n  const pending = launchBrowser.isPending || closeBrowser.isPending;',
    '''  const repairCandidateInstanceId = shortcut ? null : resolveH2AdsOrderLinkRepairCandidate({
    registrationId,
    subOrderIndex,
    customerNumber,
    serviceName,
    serviceOption,
    links: (linksQuery.data ?? []) as any[],
    orders: (ordersQuery.data ?? []) as any[],
  });

  const pending = launchBrowser.isPending || closeBrowser.isPending || setOrderLink.isPending;
  if (!shortcut && repairCandidateInstanceId === null) return null;''',
    'fallback de reparo',
)
source = replace_once(
    source,
    '  const statusTitle = shortcut.reason || (shortcut.state === "browser_open" ? "Browser H2ADS aberto" : "Browser H2ADS pronto");\n\n  return <span',
    '''  const repairLink = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (repairCandidateInstanceId === null || pending) return;
    try {
      await setOrderLink.mutateAsync({ instanceId: repairCandidateInstanceId, registrationId, subOrderIndex });
      toast.success("Vínculo H2ADS corrigido para este pedido.");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível corrigir o vínculo H2ADS.");
    }
  };

  if (!shortcut) {
    return <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/35 bg-amber-500/10 p-0.5" title="Existe uma instância compatível vinculada a outro pedido deste mesmo cliente/serviço." onClick={event => event.stopPropagation()}>
      <span className="px-1 text-[9px] font-black uppercase tracking-wide text-amber-300">H2ADS</span>
      <button type="button" onClick={repairLink} disabled={pending} className="rounded-full border border-amber-500/35 bg-amber-500/15 px-2 py-1 text-[9px] font-black text-amber-200 transition hover:bg-amber-500/25 disabled:opacity-30">VINCULAR</button>
    </span>;
  }

  const statusTitle = shortcut.reason || (shortcut.state === "browser_open" ? "Browser H2ADS aberto" : "Browser H2ADS pronto");

  return <span''',
    'ui reparar vínculo',
)
path.write_text(source, encoding='utf-8')


# 5) Card do pedido passa os dados de compatibilidade sem mudar sua estrutura.
path = Path('client/src/pages/AdminOrders.tsx')
source = path.read_text(encoding='utf-8')
source = replace_once(
    source,
    '<OrderH2AdsBrowserShortcut registrationId={order.id} subOrderIndex={order.subOrderIndex ?? 0} />',
    '<OrderH2AdsBrowserShortcut registrationId={order.id} subOrderIndex={order.subOrderIndex ?? 0} customerNumber={order.customerNumber} serviceName={order.serviceName} serviceOption={order.serviceOption} />',
    'props atalho admin',
)
path.write_text(source, encoding='utf-8')

print('H2ADS_ORDER_LINK_SUBORDERS_PATCH_OK')
