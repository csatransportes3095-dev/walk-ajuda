import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseVaultPlateList, normalizeVaultPlate, MAX_PLATES_PER_LOOKUP } from "../client/src/components/vehicleVaultPlateBatchUtils";

const read = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");
const server = read("./routers/vehicleVault.ts");
const panel = read("../client/src/components/VehicleVaultPanel.tsx");
const lookup = read("../client/src/components/VehicleVaultPlateLookupPanel.tsx");

describe("Consulta de placas em lote sem cadastrar duplicatas",()=>{
  it("normaliza placa Mercosul e antiga, remove duplicatas mantendo a ordem",()=>{
    const p=parseVaultPlateList("ABC-1D23\nabc1d23\nDEF 4567\nZZZ9H88;DEF4567");
    expect(p.plates).toEqual(["ABC1D23","DEF4567","ZZZ9H88"]);
    expect(p.duplicates).toEqual(["ABC1D23","DEF4567"]);
    expect(p.invalid).toEqual([]);
    expect(normalizeVaultPlate(" tcp-3g20 ")).toBe("TCP3G20");
  });
  it("rejeita linhas sem placas e reconhece várias placas no mesmo trecho",()=>{
    const p=parseVaultPlateList("erro\nABC1D23 DEF4G56\n1234\nABC-1D23");
    expect(p.plates).toEqual(["ABC1D23","DEF4G56"]);
    expect(p.invalid).toEqual(["erro","1234"]);
    expect(p.duplicates).toEqual(["ABC1D23"]);
    expect(MAX_PLATES_PER_LOOKUP).toBe(2000);
  });
  it("consulta banco completo, incluindo inativos, independente da busca limitada",()=>{
    expect(server).toContain("checkPlates: adminProcedure");
    expect(server).toContain("z.array(z.string().regex(");
    expect(server).toContain("max(2000)");
    expect(server).toContain("SELECT plate,inactive FROM vehicle_vault_documents");
    expect(server).toContain("registered:unique.filter(plate=>registered.has(plate))");
    expect(server).toContain("available:unique.filter(plate=>!registered.has(plate))");
    expect(lookup).toContain("trpc.vehicleVault.checkPlates.useMutation()");
    expect(lookup).toContain("navigator.clipboard.writeText(result.available.join");
    expect(lookup).toContain("result.registered");
    expect(lookup).toContain("CONSULTAR E DESCARTAR CADASTRADAS");
  });
  it("adiciona atalho de avaliação abaixo da categoria sem alterar outros campos",()=>{
    expect(panel).toContain('key==="category"&&<div');
    expect(panel).toContain("setDraftApproval(current=>current===value?");
    expect(panel).toContain("approvalStatus:draftApproval");
    expect(panel).toContain("setDraftApproval((d.approvalStatus");
    expect(server).toContain('approvalStatus: z.enum(["pending","approved","rejected"]).optional()');
    expect(server).toContain("approvalStatus=${input.approvalStatus ?? previousApproval}");
    expect(panel).toContain("<VehicleVaultPlateLookupPanel/>");
    expect(lookup).toContain("Nenhum documento será cadastrado, alterado, aprovado ou excluído.");
  });
});
