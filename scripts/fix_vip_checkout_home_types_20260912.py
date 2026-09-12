from pathlib import Path

home = Path('client/src/pages/Home.tsx')
s = home.read_text(encoding='utf-8')

# Existing cart bug: the cart payload already sends the item's own priceModelId.
# A second priceModelId from the currently selected storefront item overwrote it and
# also makes the object literal invalid in TypeScript. Remove only the duplicate
# inside the cart item submission block; keep the single-product payload intact.
cart_start_marker = '          const itemResult = await submitMutation.mutateAsync({'
cart_end_marker = '            if (!isPersistedOrderResult(itemResult)) {'
if cart_start_marker not in s or cart_end_marker not in s:
    raise SystemExit('cart submission anchors not found')
cart_start = s.index(cart_start_marker)
cart_end = s.index(cart_end_marker, cart_start)
cart_block = s[cart_start:cart_end]
duplicate_line = '              priceModelId: selectedPriceModel?.id || undefined,\n'
if duplicate_line in cart_block:
    cart_block = cart_block.replace(duplicate_line, '', 1)
    s = s[:cart_start] + cart_block + s[cart_end:]

# Existing cart render bug: option is nullable when an item is price-model driven.
unsafe = "{item.priceModel?.price || resellerPriceMap[item.option.id] || item.option.price}"
safe = "{item.priceModel?.price || (item.option ? (resellerPriceMap[item.option.id] || item.option.price) : '')}"
if unsafe in s:
    s = s.replace(unsafe, safe, 1)

home.write_text(s, encoding='utf-8')
