import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const page=readFileSync("client/src/pages/AdminH2Bico.tsx","utf8");
describe("H2BICO ADM compactado",()=>{
  it("mostra sete modulos em cards recolhiveis sem descartar estados visitados",()=>{
    expect(page).toContain("const H2BICO_GROUPS = [");
    expect(page).toContain("const [visitedGroups,setVisitedGroups]");
    expect(page).toContain('visitedGroups.has("bulk")');
    expect(page).toContain('visitedGroups.has("intelligence")');
    expect(page).toContain('visitedGroups.has("lotes")');
    expect(page).toContain('visitedGroups.has("fotos")');
    expect(page).toContain('visitedGroups.has("prints")');
    expect(page).toContain('visitedGroups.has("cpf")');
    expect(page).toContain('visitedGroups.has("cadastros")');
    expect(page).toContain("aria-expanded={opened}");
    expect(page).toContain("<H2BicoReviewLotes/>");
    expect(page).toContain("<H2BicoIntelligence/>");
    expect(page).toContain("<H2BicoBulkManager/>");
    expect(page).toContain("<H2BicoScreenshotImporter/>");
  });
  it("reduz fotos e limita cards visiveis com paginacao e filtros de conferencias",()=>{
    expect(page).toContain("const H2BICO_CARD_PAGE_SIZE = 24");
    expect(page).toContain("cardsOnPage.map");
    expect(page).toContain("max-h-[70vh]");
    expect(page).toContain("Filtrar conferência");
    expect(page).toContain("setCardPage");
    expect(page).toContain("COM EAR");
    expect(page).toContain("SEM EAR");
    expect(page).toContain("Marcar como usado");
  });
});
