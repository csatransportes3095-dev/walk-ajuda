/** Resolve a saved client's profile image only for the Super Admin authorized-person list. */
export type SiteAccessPhotoLink = { email: string; customerId: number | null };
export type SiteAccessCustomerPhoto = {
  id: number;
  email: string | null;
  profilePhotoUrl: string | null;
  deletedAt: Date | null;
};

export const normalizeSiteAccessEmail = (email: string | null | undefined): string =>
  String(email || "").trim().toLowerCase();

/** Avoid exposing unsafe schemes, empty values, or protocol-relative external sources as image URLs. */
export function safeSiteAccessPhotoUrl(raw: string | null | undefined): string | null {
  const url = String(raw || "").trim();
  if (!url || url.length > 2048 || /\s/.test(url)) return null;
  if (/^https?:\/\/[^/?#\s]+(?:[/?#][^\s]*)?$/i.test(url) || /^\/(?!\/)[^\s]*$/.test(url)) {
    return url;
  }
  return null;
}

export function attachSiteAccessProfilePhotos<T extends SiteAccessPhotoLink>(
  entries: readonly T[],
  customerRows: readonly SiteAccessCustomerPhoto[],
): Array<T & { profilePhotoUrl: string | null }> {
  const byId = new Map<number, SiteAccessCustomerPhoto>();
  const byEmail = new Map<string, SiteAccessCustomerPhoto | null>();

  for (const customer of customerRows) {
    // Deleted customers have no current profile to display.
    if (customer.deletedAt) continue;
    byId.set(customer.id, customer);
    const email = normalizeSiteAccessEmail(customer.email);
    if (!email) continue;
    // Multiple different client registrations with the same email are ambiguous.
    if (byEmail.has(email)) byEmail.set(email, null);
    else byEmail.set(email, customer);
  }

  return entries.map(entry => {
    const customer = entry.customerId != null
      ? byId.get(entry.customerId)
      : byEmail.get(normalizeSiteAccessEmail(entry.email));
    return { ...entry, profilePhotoUrl: safeSiteAccessPhotoUrl(customer?.profilePhotoUrl) };
  });
}
