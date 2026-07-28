import { listOrderStatusTypes } from "./server/db";
const rows = await listOrderStatusTypes();
for (const r of rows) {
  console.log(`id=${r.id} key=${r.key} label="${r.label}" sortOrder=${r.sortOrder} isSystem=${r.isSystem} isActive=${r.isActive}`);
}
