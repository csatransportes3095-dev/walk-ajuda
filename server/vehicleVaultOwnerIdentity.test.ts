import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { normalizeVehicleVaultOwnerCpfCnpj, parseVehicleVaultOwnerCpfCnpj } from "./vehicleVaultOwner";

const router = readFileSync("server/routers/vehicleVault.ts", "utf8");
const panel = readFileSync("client/src/components/VehicleVaultPanel.tsx", "utf8");
const crlv = (text: string) => "CERTIFICADO DE REGISTRO E LICENCIAMENTO DE VEÍCULO - DIGITAL\n" + text;

describe("Cofre: CPF/CNPJ do proprietário", () => {
  it("valida CPF e CNPJ e não aceita números aleatórios", () => {
    expect(normalizeVehicleVaultOwnerCpfCnpj("529.982.247-25")).toBe("52998224725");
    expect(normalizeVehicleVaultOwnerCpfCnpj("11.222.333/0001-81")).toBe("11222333000181");
    expect(normalizeVehicleVaultOwnerCpfCnpj("529.982.247-26")).toBe("");
    expect(normalizeVehicleVaultOwnerCpfCnpj("111.111.111-11")).toBe("");
  });
  it("identifica CPF rotulado junto ao proprietário", () => {
    expect(parseVehicleVaultOwnerCpfCnpj(crlv("NOME\nMARIA SINTÉTICA DA SILVA\nCPF/CNPJ\n529.982.247-25"))).toBe("52998224725");
  });
  it("identifica CNPJ em relatório do proprietário", () => {
    expect(parseVehicleVaultOwnerCpfCnpj("DADOS DO PROPRIETÁRIO:\nNome: EMPRESA SINTÉTICA LTDA\nCPF/CNPJ: 11.222.333/0001-81")).toBe("11222333000181");
  });
  it("identifica documento alinhado à direita em CRLV", () => {
    const text = crlv([
      "PLACA".padEnd(104) + "NOME",
      "TST1A23".padEnd(104) + "MARIA SINTÉTICA DA SILVA",
      "ANO FABRICAÇÃO ANO MODELO".padEnd(104) + "CPF/CNPJ",
      "2024 2025".padEnd(104) + "529.982.247-25",
    ].join("\n"));
    expect(parseVehicleVaultOwnerCpfCnpj(text)).toBe("52998224725");
  });
  it("não captura CPF de terceiros ou sem nome de proprietário", () => {
    expect(parseVehicleVaultOwnerCpfCnpj("SEGURADO\nNome: MARIA SINTÉTICA\nCPF: 529.982.247-25")).toBe("");
    expect(parseVehicleVaultOwnerCpfCnpj("CPF: 529.982.247-25")).toBe("");
  });
  it("preserva demais campos e recupera foto apenas do cadastro principal", () => {
    expect(router).toContain("c.profilePhotoUrl");
    expect(router).toContain("ownerCpfCnpj");
    expect(panel).toContain("CustomerIdentity person={person}");
    expect(panel).toContain("CustomerIdentity person={l}");
    expect(panel).toContain("CPF / CNPJ DO PROPRIETÁRIO");
    expect(panel).toContain("DESVINCULAR");
  });
});
