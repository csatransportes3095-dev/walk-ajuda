/**
 * Presentation-only cleanup: don't repeat the status title as the first line
 * of the client's description. The original ADM content remains untouched.
 */
export function compactCurrentDescription(
  description: string | null | undefined,
  statusLabel: string,
): string | null {
  const value = (description ?? "").trim();
  if (!value) return null;
  const withoutLeadingSymbols = (text: string) =>
    text.replace(/^[^\p{L}\p{N}]+/u, "").trimStart();
  const title = withoutLeadingSymbols(statusLabel.trim());
  const body = withoutLeadingSymbols(value);

  if (title && body.toLocaleLowerCase("pt-BR").startsWith(title.toLocaleLowerCase("pt-BR"))) {
    const rest = body.slice(title.length);
    // Don't remove just a partial word that happens to start with the same letters.
    if (!rest || /^[^\p{L}\p{N}]/u.test(rest)) return rest.trim() || null;
  }
  return value;
}
