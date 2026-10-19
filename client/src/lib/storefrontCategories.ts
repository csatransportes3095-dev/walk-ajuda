/** Categories are derived only from product data already present in the active storefront. */
export const CATALOG_CATEGORIES = ["Todos", "Uber", "Táxi", "Documentos", "99", "Outros"] as const;
export type CatalogCategory = typeof CATALOG_CATEGORIES[number];

type CatalogProduct = { name: string; description?: string | null };
type CatalogEntry = { category: CatalogCategory };

function searchText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
}

/** Match explicit product families; never treat uncategorized items as Uber. */
export function getCatalogCategory(product: CatalogProduct): CatalogCategory {
  const title = searchText(product.name || "");
  const description = searchText(product.description || "");
  const classify = (value: string): CatalogCategory | null => {
    if (/\b(?:DOC|DOCUMENTO|DOCUMENTOS|CRLV|CRV|CHASSI|DESPACHANTE)\b|VEICUL|\bEDICAO\b/.test(value)) return "Documentos";
    if (/(?:^|\D)99(?:\D|$)/.test(value)) return "99";
    if (/\b(?:TAXI|TAXISTA|CONDUTAXI)\b/.test(value)) return "Táxi";
    if (/\bUBER\b/.test(value)) return "Uber";
    return null;
  };
  // A name is authoritative; a generic description must not turn a different
  // product into an Uber or 99 shortcut merely because it mentions the apps.
  return classify(title) || classify(description) || "Outros";
}

/** The "Todos" reset always exists; other shortcuts need real active, visible options. */
export function catalogCategoryAvailability(items: readonly CatalogEntry[]): {
  categories: CatalogCategory[];
  counts: Record<CatalogCategory, number>;
} {
  const counts: Record<CatalogCategory, number> = { Todos: items.length, Uber: 0, "Táxi": 0, Documentos: 0, "99": 0, Outros: 0 };
  for (const { category } of items) {
    if (category !== "Todos" && Object.prototype.hasOwnProperty.call(counts, category)) counts[category] += 1;
  }
  return {
    categories: CATALOG_CATEGORIES.filter(category => category === "Todos" || counts[category] > 0),
    counts,
  };
}
