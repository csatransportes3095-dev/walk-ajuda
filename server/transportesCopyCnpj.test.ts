import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { writeSingleTransportCnpj } from "../shared/transportes";

const page = readFileSync("client/src/pages/AdminTransportes.tsx", "utf8");

describe("Transportes: copiar CNPJ individual por card", () => {
  it("associa cada botão ao próprio card e não exporta a lista", () => {
    expect(page).toContain("COPIAR CNPJ");
    expect(page).toContain("copyTransportCnpj(r.cnpj)");
    expect(page).toContain("writeSingleTransportCnpj(cnpj, navigator.clipboard)");
    expect(page).toContain("CNPJ copiado:");
  });

  it("copia apenas os 14 dígitos do card clicado, mesmo ao alternar cartões", async () => {
    const writeText = vi.fn(async (_text: string) => {});
    const clipboard = { writeText };
    expect(await writeSingleTransportCnpj("02.406.603/0001-13", clipboard)).toBe("02406603000113");
    expect(await writeSingleTransportCnpj("51.939.868/0001-92", clipboard)).toBe("51939868000192");
    expect(writeText.mock.calls.map(([text]) => text)).toEqual(["02406603000113", "51939868000192"]);
  });

  it("não copia entradas inválidas nem conteúdo de outros cards", async () => {
    const writeText = vi.fn(async (_text: string) => {});
    await expect(writeSingleTransportCnpj("123", { writeText })).rejects.toThrow("CNPJ inválido");
    expect(writeText).not.toHaveBeenCalled();
  });
});
