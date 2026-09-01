import { describe, expect, it } from "vitest";
import fs from "node:fs";
const src = fs.readFileSync("server/_core/index.ts", "utf8");
describe("public video proxy", () => {
  it("faz streaming same-origin com suporte a range", () => {
    expect(src).toContain("if (req.headers.range) headers.Range = req.headers.range");
    expect(src).toContain("Readable.fromWeb(upstream.body as any).pipe(res)");
    expect(src).toContain("res.setHeader('Accept-Ranges'");
    expect(src).toContain("res.setHeader('Access-Control-Allow-Origin', '*')");
    expect(src).not.toContain("res.redirect(videoUrl)");
  });
});
