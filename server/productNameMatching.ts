/**
 * Conservative reconciliation for legacy orders which stored only free-text
 * service names (no product ID). Never infer from option label alone.
 */
export type NamedProduct={
  id:number;
  name:string;
  options:{label:string}[];
};
export function normalizeProductLabel(value:unknown):string {
  return String(value??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-zA-Z0-9]+/g," ").replace(/\s+/g," ").trim().toLowerCase();
}
export function baseOrderOptionForSync(value:unknown):string {
  const raw=String(value??"").split(/\s*[-–—]?\s*Garantia\s*:/i)[0]
    .split(/\s+—\s+/)[0];
  return normalizeProductLabel(raw);
}
export function findUniqueLegacyProduct(
  products:readonly NamedProduct[],
  oldService:string,
  oldOption:string|null,
):NamedProduct|null {
  const oldName=normalizeProductLabel(oldService);
  const option=baseOrderOptionForSync(oldOption);
  if(!oldName || oldName.split(" ").length<2 || !option)return null;
  // A historical product name can differ only by an added/removed suffix,
  // with at least two matching name tokens and the same normalized option.
  const candidates=products.filter(product=>{
    const current=normalizeProductLabel(product.name);
    if(!current || oldName===current)return false;
    const prefix=(oldName.startsWith(current+" ")||current.startsWith(oldName+" "));
    if(!prefix || Math.min(oldName.split(" ").length,current.split(" ").length)<2)return false;
    return product.options.some(opt=>normalizeProductLabel(opt.label)===option);
  });
  return candidates.length===1?candidates[0]:null;
}
