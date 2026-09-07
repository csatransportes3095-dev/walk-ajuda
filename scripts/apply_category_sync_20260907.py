from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Patch target missing: {label}")
    return text.replace(old, new, 1)


admin_path = Path("client/src/pages/AdminProducts.tsx")
admin = admin_path.read_text(encoding="utf-8")

if 'useState, useRef, useCallback, useEffect' not in admin:
    admin = replace_once(
        admin,
        'import { useState, useRef, useCallback } from "react";',
        'import { useState, useRef, useCallback, useEffect } from "react";',
        "useEffect import",
    )

anchor = "  const [vipHighlightText, setVipHighlightText] = useState(model.vipHighlightText || 'VIP');\n  const updateMut = trpc.optionPriceModels.update.useMutation({ onSuccess: onChanged });"
replacement = """  const [vipHighlightText, setVipHighlightText] = useState(model.vipHighlightText || 'VIP');

  useEffect(() => {
    setLabel(model.label);
    setPrincipalPrice(model.originalPrice?.trim() ? model.originalPrice : model.price);
    setPromotionalPrice(model.originalPrice?.trim() ? model.price : '');
    setPromoEndsAt(model.promoEndsAt ? new Date(model.promoEndsAt).toISOString().slice(0, 16) : '');
    setActive(model.isActive === 1);
    setVipAccessMode(model.vipAccessMode || 'all');
    setVipDiscountType(model.vipDiscountType || 'percentage');
    setVipDiscountValue(String(model.vipDiscountValue || ''));
    setVipHighlight(model.vipHighlight === 1);
    setVipHighlightText(model.vipHighlightText || 'VIP');
  }, [model.id, model.label, model.price, model.originalPrice, model.promoEndsAt, model.isActive, model.vipAccessMode, model.vipDiscountType, model.vipDiscountValue, model.vipHighlight, model.vipHighlightText]);

  const updateMut = trpc.optionPriceModels.update.useMutation({
    onSuccess: () => {
      onChanged();
      toast.success('Categoria atualizada e sincronizada com o cliente!');
    },
  });"""

if "Categoria atualizada e sincronizada com o cliente!" not in admin:
    admin = replace_once(admin, anchor, replacement, "row sync")

old_refresh = "  const refresh = () => { utils.optionPriceModels.list.invalidate({ optionId }); utils.products.list.invalidate(); };"
new_refresh = """  const refresh = () => {
    utils.optionPriceModels.list.invalidate({ optionId });
    utils.optionPriceModels.listActive.invalidate();
    utils.products.list.invalidate();
    utils.products.listActive.invalidate();
  };"""
if "utils.optionPriceModels.listActive.invalidate();" not in admin:
    admin = replace_once(admin, old_refresh, new_refresh, "public cache invalidation")

admin_path.write_text(admin, encoding="utf-8")

home_path = Path("client/src/pages/Home.tsx")
home = home_path.read_text(encoding="utf-8")
old_query = """  const { data: activeOptionPriceModels = [] } = trpc.optionPriceModels.listActive.useQuery(
    { optionIds },
    { enabled: optionIds.length > 0, staleTime: 30_000, refetchOnWindowFocus: true }
  );"""
new_query = """  const { data: activeOptionPriceModels = [] } = trpc.optionPriceModels.listActive.useQuery(
    { optionIds },
    {
      enabled: optionIds.length > 0,
      staleTime: 0,
      refetchInterval: 10_000,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    }
  );"""
if "refetchInterval: 10_000" not in home:
    home = replace_once(home, old_query, new_query, "storefront freshness")
home_path.write_text(home, encoding="utf-8")

checks = [
    ("admin success feedback", "Categoria atualizada e sincronizada com o cliente!" in admin),
    ("admin invalidates public models", "utils.optionPriceModels.listActive.invalidate();" in admin),
    ("admin invalidates public products", "utils.products.listActive.invalidate();" in admin),
    ("admin resyncs server value", "setLabel(model.label);" in admin),
    ("storefront zero stale time", "staleTime: 0" in home),
    ("storefront periodic refresh", "refetchInterval: 10_000" in home),
    ("storefront reconnect refresh", "refetchOnReconnect: true" in home),
]
for name, passed in checks:
    if not passed:
        raise SystemExit(f"FAIL: {name}")
    print(f"OK: {name}")
print(f"{len(checks)}/{len(checks)} category sync checks OK")
