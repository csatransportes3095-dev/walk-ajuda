import { describe, expect, it } from "vitest";
import fs from "node:fs";

const files = [
  "client/src/pages/Home.tsx",
  "client/src/pages/OrderTracking.tsx",
  "client/src/pages/SpreadsheetPage.tsx",
];

describe("video da propaganda fecha no tempo real do arquivo", () => {
  for (const file of files) {
    it(file, () => {
      const src = fs.readFileSync(file, "utf8");
      expect(src).toContain("adCampaign.type !== 'image'");
      expect(src).toContain("onEnded={() => {");
      expect(src).toContain("setTimeout(() => setAdVisible(false), 250)");
      expect(src).toContain("adCampaign.type === 'video' ? 'Reproduzindo vídeo'");
      expect(src).toContain("adCampaign.type === 'video' ? 'Aguarde o fim do vídeo'");
      expect(src).not.toContain("const videoDuration = v.duration || 0;");
      expect(src).not.toContain("if (videoDuration <= required)");
    });
  }
});
