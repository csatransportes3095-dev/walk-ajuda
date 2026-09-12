from pathlib import Path


def one(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 anchor, found {count}")
    return text.replace(old, new, 1)


p = Path("server/vipInstallmentContracts.ts")
text = p.read_text(encoding="utf-8")
text = one(
    text,
    'import { VIP_INSTALLMENT_CHECKOUT_RESERVATION_MS, isVipInstallmentOrderInsideReservation, type VipInstallmentQuote } from "../shared/vipInstallments";',
    'import { VIP_INSTALLMENT_CHECKOUT_RESERVATION_MS, isVipInstallmentOrderInsideReservation, type VipInstallmentQuote } from "../shared/vipInstallments";\nimport { parseBrazilMoneyToCents } from "../shared/vipCheckoutPricing";',
    "money parser import",
)
old_bind = '''    const item = pricing?.items?.[0];
    if (!item || String(order.serviceName || '').trim().toLowerCase() !== String(item.productName || '').trim().toLowerCase()) {
      throw new TRPCError({ code: "CONFLICT", message: "Produto do pedido não corresponde à reserva do Parcelamento VIP." });
    }

    await tx.execute(sql`'''
new_bind = '''    const item = pricing?.items?.[0];
    if (!item || String(order.serviceName || '').trim().toLowerCase() !== String(item.productName || '').trim().toLowerCase()) {
      throw new TRPCError({ code: "CONFLICT", message: "Produto do pedido não corresponde à reserva do Parcelamento VIP." });
    }
    let orderPriceCents = 0;
    try { orderPriceCents = parseBrazilMoneyToCents(String(order.pricePaid || '')); } catch { orderPriceCents = 0; }
    if (orderPriceCents !== Number(pricing.totalCents || 0)) {
      throw new TRPCError({ code: "CONFLICT", message: "Valor do pedido não corresponde ao valor congelado na reserva VIP." });
    }

    await tx.execute(sql`'''
text = one(text, old_bind, new_bind, "immediate bind price check")
old_filter = '''      const optionText = String(row.serviceOption || '').trim().toLowerCase();
      const optionName = String(item.optionName || '').trim().toLowerCase();
      if (optionName && !optionText.includes(optionName)) return false;
      return true;'''
new_filter = '''      const optionText = String(row.serviceOption || '').trim().toLowerCase();
      const optionName = String(item.optionName || '').trim().toLowerCase();
      if (optionName && !optionText.includes(optionName)) return false;
      let candidatePriceCents = 0;
      try { candidatePriceCents = parseBrazilMoneyToCents(String(row.pricePaid || '')); } catch { candidatePriceCents = 0; }
      if (candidatePriceCents !== Number(pricing.totalCents || 0)) return false;
      return true;'''
text = one(text, old_filter, new_filter, "recovery candidate price check")
p.write_text(text, encoding="utf-8")
