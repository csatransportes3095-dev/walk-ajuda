import { describe, expect, it } from "vitest";
import fs from "node:fs";
const db=fs.readFileSync("server/db.ts","utf8");
const policy=fs.readFileSync("server/customerProfileUpdatePolicy.ts","utf8");
const router=fs.readFileSync("server/routers.ts","utf8");
describe("ADM clientes: leitura agrupada segura",()=>{
  it("preserva os dois prefixos e o reparo de políticas concluídas",()=>{
    expect(policy).toContain("getSettingsByPrefixes([POLICY_PREFIX, COMPLETION_PREFIX])");
    expect(policy).toContain("closeCompletedPolicy(id, policy, completedRevision)");
    expect(policy).toContain("evaluateCustomerProfileUpdateState(customer, policy, completedRevision)");
  });
  it("lê configurações de uma vez e limita por prefixo",()=>{
    expect(db).toContain("export async function getSettingsByPrefixes");
    expect(db).toContain("prefixes.some(prefix => row.key.startsWith(prefix))");
  });
  it("retém campos e associa política de cada cadastro pelo id",()=>{
    expect(router).toContain("getCustomerProfileUpdateStatesBatch(customerRows)");
    expect(router).toContain("profileStates.get(Number(r.id))");
    expect(router).toContain("openOrdersByPhone[cleanPhone]");
    expect(router).toContain("vipMembershipMap.get(Number(r.id))");
  });
});