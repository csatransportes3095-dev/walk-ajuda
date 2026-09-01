import fs from 'node:fs';

for (const path of ['client/src/pages/Home.tsx', 'client/src/pages/OrderTracking.tsx']) {
  let src = fs.readFileSync(path, 'utf8');
  const oldLine = "if (!adVisible || !adCampaign || adCampaign.type !== 'image') return;";
  const newLine = "if (!adVisible || !adCampaign) return;";
  if (!src.includes(oldLine)) throw new Error(`Timer antigo nao encontrado em ${path}`);
  src = src.replace(oldLine, newLine);
  fs.writeFileSync(path, src);
}

fs.writeFileSync('server/adCampaignVideoAntiStuck.test.ts', `import { describe, expect, it } from "vitest";\nimport fs from "node:fs";\n\nconst home = fs.readFileSync("client/src/pages/Home.tsx", "utf8");\nconst tracking = fs.readFileSync("client/src/pages/OrderTracking.tsx", "utf8");\nconst gastos = fs.readFileSync("client/src/pages/SpreadsheetPage.tsx", "utf8");\n\ndescribe("propaganda de video nao pode travar a pagina", () => {\n  it("usa o tempo obrigatorio em Home, Acompanhar e Gastos independente do tipo da campanha", () => {\n    for (const source of [home, tracking, gastos]) {\n      expect(source).toContain("if (!adVisible || !adCampaign) return;");\n    }\n    expect(home).not.toContain("adCampaign.type !== 'image'");\n    expect(tracking).not.toContain("adCampaign.type !== 'image'");\n  });\n});\n`);

console.log('ad video anti-stuck patch applied');
