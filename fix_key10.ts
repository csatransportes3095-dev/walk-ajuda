import { getDb } from "./server/db";
import { orderStatusTypes } from "./drizzle/schema";
import { eq } from "drizzle-orm";

const db = await getDb();
if (!db) { console.log("DB not available"); process.exit(1); }

// Corrigir o registro com key="10" para usar uma chave válida
await db.update(orderStatusTypes)
  .set({ key: "conta_ativa_custom" })
  .where(eq(orderStatusTypes.key, "10"));

console.log("Corrigido! key '10' → 'conta_ativa_custom'");

// Verificar resultado
const rows = await db.select().from(orderStatusTypes);
for (const r of rows) {
  console.log(`id=${r.id} key=${r.key} label="${r.label}" sortOrder=${r.sortOrder}`);
}
