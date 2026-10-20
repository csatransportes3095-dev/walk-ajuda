import { sql } from 'drizzle-orm';
import { orderStatusHistory } from '../drizzle/schema';
import type { getDb } from './db';
import { attachSiteDirectoryMetadata, type SiteDirectoryCustomer, type SiteDirectoryEntry } from '../shared/siteSecurityDirectory';
import { selectVisibleSiteBulkOrders, siteBulkPhone } from '../shared/siteSecurityBulk';

type SiteDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/** Called only after the list procedure's existing Super Admin/owner check. No persistence or access changes. */
export async function loadSiteDirectory<T extends SiteDirectoryEntry>(
  db: SiteDb, entries: readonly T[], customers: readonly SiteDirectoryCustomer[],
) {
  if (!customers.some(customer => !customer.deletedAt && siteBulkPhone(customer.phone).length >= 10)) {
    return attachSiteDirectoryMetadata(entries, customers, []);
  }
  // Use the same visible suborder resolution as the existing bulk filter, not historical event counts.
  const [history, hiddenResult, initialResult] = await Promise.all([
    db.select({id:orderStatusHistory.id,registrationId:orderStatusHistory.registrationId,customerPhone:orderStatusHistory.customerPhone,status:orderStatusHistory.status})
      .from(orderStatusHistory).orderBy(orderStatusHistory.id),
    db.execute(sql`SELECT registrationId, subOrderIndex FROM hiddenSubOrders`),
    db.execute(sql`SELECT \`key\` FROM orderStatusTypes WHERE isActive = 1 AND isGlobal = 1 ORDER BY sortOrder ASC, id ASC LIMIT 1`),
  ]);
  const hidden = (hiddenResult as unknown as [Array<{registrationId:number;subOrderIndex:number}>])[0];
  const initial = (initialResult as unknown as [Array<{key:string}>])[0];
  return attachSiteDirectoryMetadata(entries, customers, selectVisibleSiteBulkOrders(history, hidden, initial[0]?.key || 'recebido'));
}
