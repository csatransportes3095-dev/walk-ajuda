from pathlib import Path

router_path = Path('server/routers.ts')
router = router_path.read_text(encoding='utf-8')
anchor = """      // Adicionar flag hasNewDocResponse, hasNewTrackingAnswer e pasta personalizada em cada pedido\n      const finalOrdersWithFlag = finalOrders.map((o: any) => {\n"""
insert = r'''      // Resolver a garantia exibida no ADM sem depender apenas do texto salvo em serviceOption.
      // Compatibilidade: pedidos novos com tier explícito, pedidos antigos com warranty fixo
      // e pedidos legados onde o tier pode ser identificado de forma inequívoca pelo valor pago.
      const warrantyCatalog = new Map<string, any[]>();
      const warrantyOptionOnlyCatalog = new Map<string, any[]>();
      try {
        const warrantyRowsResult = await db.execute(sql.raw(`
          SELECT
            p.name AS serviceName,
            po.label AS optionLabel,
            po.warranty AS fixedWarranty,
            wt.id AS tierId,
            wt.warrantyType,
            wt.warrantyValue,
            wt.warrantyLabel,
            wt.price AS tierPrice
          FROM productOptions po
          INNER JOIN products p ON p.id = po.productId
          LEFT JOIN warrantyTiers wt ON wt.optionId = po.id AND wt.isActive = 1
          WHERE po.isActive = 1
        `));
        const warrantyRows = ((warrantyRowsResult as any)[0] as any[]) || [];
        const normalizeWarrantyKey = (value: unknown) => String(value ?? '').trim().toLocaleUpperCase('pt-BR').replace(/\s+/g, ' ');
        for (const row of warrantyRows) {
          const serviceKey = normalizeWarrantyKey(row.serviceName);
          const optionKey = normalizeWarrantyKey(row.optionLabel);
          const exactKey = `${serviceKey}::${optionKey}`;
          const exact = warrantyCatalog.get(exactKey) ?? [];
          exact.push(row);
          warrantyCatalog.set(exactKey, exact);
          const optionOnly = warrantyOptionOnlyCatalog.get(optionKey) ?? [];
          optionOnly.push(row);
          warrantyOptionOnlyCatalog.set(optionKey, optionOnly);
        }
      } catch (e) {
        console.error('[listOrders] Erro ao resolver catálogo de garantias:', e);
      }

      const moneyToCents = (value: unknown): number | null => {
        const raw = String(value ?? '').trim();
        if (!raw) return null;
        const digits = raw.replace(/[^0-9]/g, '');
        if (!digits) return null;
        return Number(digits);
      };
      const normalizeWarrantyKey = (value: unknown) => String(value ?? '').trim().toLocaleUpperCase('pt-BR').replace(/\s+/g, ' ');
      const formatWarrantyTier = (row: any): string | null => {
        const type = String(row?.warrantyType ?? '').trim();
        const label = String(row?.warrantyLabel ?? '').trim();
        const value = Number(row?.warrantyValue ?? 0);
        if (type === 'livre') return label ? `Garantia: ${label}` : null;
        if (!type || !Number.isFinite(value) || value <= 0) return label ? `Garantia: ${label}` : null;
        return `Garantia: ${value} ${type}${label ? ` ${label}` : ''}`;
      };
      const resolveOrderWarranty = (order: any): string | null => {
        const serviceOption = String(order?.serviceOption ?? '').trim();
        const explicit = serviceOption.match(/(?:^|[-—]\s*)Garantia:\s*(.+)$/i);
        if (explicit?.[1]) return `Garantia: ${explicit[1].trim()}`;

        const baseOption = serviceOption
          .split(/\s+-\s+Garantia:/i)[0]
          .split(/\s+—\s+Garantia:/i)[0]
          .trim();
        if (!baseOption) return null;

        const serviceKey = normalizeWarrantyKey(order?.serviceName);
        const optionKey = normalizeWarrantyKey(baseOption);
        let candidates = warrantyCatalog.get(`${serviceKey}::${optionKey}`) ?? [];
        if (candidates.length === 0) {
          const optionOnly = warrantyOptionOnlyCatalog.get(optionKey) ?? [];
          const distinctServices = new Set(optionOnly.map((row: any) => normalizeWarrantyKey(row.serviceName)));
          if (distinctServices.size === 1) candidates = optionOnly;
        }
        if (candidates.length === 0) return null;

        const fixedWarranty = candidates
          .map((row: any) => String(row?.fixedWarranty ?? '').trim())
          .find((value: string) => value.length > 0);
        if (fixedWarranty) return `Garantia: ${fixedWarranty}`;

        const paidCents = moneyToCents(order?.pricePaid);
        if (paidCents == null) return null;
        const matchedTiers = candidates.filter((row: any) => row?.tierId && moneyToCents(row?.tierPrice) === paidCents);
        const uniqueTierIds = [...new Set(matchedTiers.map((row: any) => Number(row.tierId)))];
        if (uniqueTierIds.length !== 1) return null;
        return formatWarrantyTier(matchedTiers[0]);
      };

      // Adicionar flag hasNewDocResponse, hasNewTrackingAnswer, pasta e garantia em cada pedido
      const finalOrdersWithFlag = finalOrders.map((o: any) => {
'''
if anchor not in router:
    raise SystemExit('ERRO: anchor finalOrdersWithFlag nao encontrado')
router = router.replace(anchor, insert, 1)
old_return = """          scheduleConfirmedAt: scheduleSlotMap.get(`${o.id}_${o.subOrderIndex}`)?.confirmedAt ?? null,\n        };\n"""
new_return = """          scheduleConfirmedAt: scheduleSlotMap.get(`${o.id}_${o.subOrderIndex}`)?.confirmedAt ?? null,\n          warrantyDisplay: resolveOrderWarranty(o),\n        };\n"""
if old_return not in router:
    raise SystemExit('ERRO: retorno finalOrdersWithFlag nao encontrado')
router = router.replace(old_return, new_return, 1)
router_path.write_text(router, encoding='utf-8')

admin_path = Path('client/src/pages/AdminOrders.tsx')
admin = admin_path.read_text(encoding='utf-8')
old_type = """  resellerDiscountApplied?: number | null;\n};\n"""
new_type = """  resellerDiscountApplied?: number | null;\n  warrantyDisplay?: string | null;\n};\n"""
if old_type not in admin:
    raise SystemExit('ERRO: tipo Order nao encontrado')
admin = admin.replace(old_type, new_type, 1)
old_block = r'''                          const svcOpt = order.serviceOption;
                          const garantiaMatch = svcOpt ? svcOpt.match(/^(.*?)\s*-?\s*(Garantia:.*)$/i) : null;
                          const mainOpt = garantiaMatch ? garantiaMatch[1].replace(/\s*-\s*$/, '').trim() : svcOpt;
                          const garantiaPart = garantiaMatch ? garantiaMatch[2] : null;
'''
new_block = r'''                          const svcOpt = order.serviceOption;
                          const garantiaMatch = svcOpt ? svcOpt.match(/^(.*?)\s*-?\s*(Garantia:.*)$/i) : null;
                          const mainOpt = garantiaMatch ? garantiaMatch[1].replace(/\s*-\s*$/, '').trim() : svcOpt;
                          const garantiaPart = garantiaMatch ? garantiaMatch[2] : (order.warrantyDisplay || null);
'''
if old_block not in admin:
    raise SystemExit('ERRO: bloco de garantia do card nao encontrado')
admin = admin.replace(old_block, new_block, 1)
admin_path.write_text(admin, encoding='utf-8')

test_path = Path('server/orderWarrantyDisplay.test.ts')
test_path.write_text(r'''import { describe, expect, it } from "vitest";
import fs from "node:fs";

const router = fs.readFileSync("server/routers.ts", "utf8");
const admin = fs.readFileSync("client/src/pages/AdminOrders.tsx", "utf8");

describe("garantia no card do pedido", () => {
  it("resolve garantia fixa e tier no backend", () => {
    expect(router).toContain("const resolveOrderWarranty = (order: any)");
    expect(router).toContain("fixedWarranty");
    expect(router).toContain("uniqueTierIds.length !== 1");
    expect(router).toContain("warrantyDisplay: resolveOrderWarranty(o)");
  });

  it("preserva garantia explicita ja salva no serviceOption", () => {
    expect(router).toContain("Garantia: ${explicit[1].trim()}");
  });

  it("card usa warrantyDisplay quando serviceOption nao contem Garantia", () => {
    expect(admin).toContain("warrantyDisplay?: string | null");
    expect(admin).toContain("garantiaMatch ? garantiaMatch[2] : (order.warrantyDisplay || null)");
  });
});
''', encoding='utf-8')

print('Patch de garantia aplicado com sucesso.')
