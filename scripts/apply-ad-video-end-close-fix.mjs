import fs from 'node:fs';

const pages = [
  'client/src/pages/Home.tsx',
  'client/src/pages/OrderTracking.tsx',
  'client/src/pages/SpreadsheetPage.tsx',
];

function replaceOnce(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`Anchor not found: ${label}`);
  return source.replace(from, to);
}

function replaceEndedBlock(source, path) {
  const start = source.indexOf('onEnded={(e) => {');
  if (start < 0) throw new Error(`onEnded start not found: ${path}`);
  const errorStart = source.indexOf('onError=', start);
  if (errorStart < 0) throw new Error(`onError anchor not found after onEnded: ${path}`);
  const before = source.slice(0, start);
  const after = source.slice(errorStart);
  const replacement = `onEnded={() => {\n                      setAdProgress(100);\n                      setAdCanClose(true);\n                      setTimeout(() => setAdVisible(false), 250);\n                    }}\n                    `;
  return before + replacement + after;
}

for (const path of pages) {
  let src = fs.readFileSync(path, 'utf8');

  src = replaceOnce(
    src,
    "if (!adVisible || !adCampaign) return;",
    "if (!adVisible || !adCampaign || adCampaign.type !== 'image') return;",
    `${path} image-only timer`,
  );

  src = replaceEndedBlock(src, path);

  src = src.replaceAll(
    "{adCanClose ? 'Propaganda concluída' : `Encerrando em ${Math.ceil((adCampaign.requiredSeconds || 20) * (1 - adProgress / 100))}s`}",
    "{adCanClose ? 'Propaganda concluída' : adCampaign.type === 'video' ? 'Reproduzindo vídeo' : `Encerrando em ${Math.ceil((adCampaign.requiredSeconds || 20) * (1 - adProgress / 100))}s`}",
  );

  src = src.replaceAll(
    "{adCanClose ? 'Fechar propaganda ✕' : `Aguarde ${Math.ceil((adCampaign.requiredSeconds || 20) * (1 - adProgress / 100))}s para fechar`}",
    "{adCanClose ? 'Fechar propaganda ✕' : adCampaign.type === 'video' ? 'Aguarde o fim do vídeo' : `Aguarde ${Math.ceil((adCampaign.requiredSeconds || 20) * (1 - adProgress / 100))}s para fechar`}",
  );

  if (src.includes('const videoDuration = v.duration || 0;')) throw new Error(`old duration gate still present: ${path}`);
  fs.writeFileSync(path, src);
}

fs.writeFileSync('server/adCampaignVideoEndClose.test.ts', `import { describe, expect, it } from "vitest";\nimport fs from "node:fs";\n\nconst files = [\n  "client/src/pages/Home.tsx",\n  "client/src/pages/OrderTracking.tsx",\n  "client/src/pages/SpreadsheetPage.tsx",\n];\n\ndescribe("video da propaganda fecha no tempo real do arquivo", () => {\n  for (const file of files) {\n    it(file, () => {\n      const src = fs.readFileSync(file, "utf8");\n      expect(src).toContain("adCampaign.type !== 'image'");\n      expect(src).toContain("onEnded={() => {");\n      expect(src).toContain("setTimeout(() => setAdVisible(false), 250)");\n      expect(src).toContain("adCampaign.type === 'video' ? 'Reproduzindo vídeo'");\n      expect(src).toContain("adCampaign.type === 'video' ? 'Aguarde o fim do vídeo'");\n      expect(src).not.toContain("const videoDuration = v.duration || 0;");\n      expect(src).not.toContain("if (videoDuration <= required)");\n    });\n  }\n});\n`);

console.log('ad video end-close patch applied');
