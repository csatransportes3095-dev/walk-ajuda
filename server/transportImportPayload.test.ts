import { describe, it, expect } from "vitest";
import { transportInputItem, normalizeTransportStorageFields, normalizeTransportCnae } from "./transportImportPayload";
describe("CNAE descritivo", () => {
 const base = {cnpj:"04.252.011/0001-10",name:"Empresa",uf:"SP",city:"Jandira",type:"carga" as const,cnae:"4930-2/02 - Transporte rodoviário de carga, exceto produtos perigosos",notes:""};
 it("aceita a descrição longa e guarda o código",()=>{
  const p=transportInputItem.parse(base);
  const normalized=normalizeTransportStorageFields(p,"Importação");
  expect(normalized.cnae).toBe("4930-2/02");
  expect(normalized.notes).toContain("Transporte rodoviário");
  expect(normalized.uf).toBe("SP");
  expect(normalized.cnpj).toBe("04252011000110");
 });
 it("não excede 32 caracteres no CNAE desconhecido",()=>{expect(normalizeTransportCnae("A".repeat(200))).toHaveLength(32)});
});
