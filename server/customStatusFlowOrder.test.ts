import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

describe("custom status flow ordering", () => {
  it("keeps the custom sequence order controlled by the admin", () => {
    const page = read("client/src/pages/AdminStatusFlows.tsx");
    expect(page).toContain("Esta sequência tem ordem própria");
    expect(page).toContain("moveStatus(index, -1)");
    expect(page).toContain("moveStatus(index, 1)");
    expect(page).toContain("const orderedKeys = Array.from(new Set([initialKey, ...statusKeys]))");
    expect(page).not.toContain("A ordem segue a ordem configurada na tela principal de Status.");
  });

  it("backend persists flow item sort order and admin uses saved statusKeys", () => {
    const db = read("server/db.ts");
    const orders = read("client/src/pages/AdminOrders.tsx");
    expect(db).toContain("INSERT INTO orderStatusFlowItems (flowId, statusKey, sortOrder)");
    expect(db).toContain("ORDER BY i.sortOrder ASC, i.id ASC");
    expect(orders).toContain("return Array.isArray(keys) && keys.length > 0 ? keys : ACTIVE_STATUS_ORDER");
  });
});
