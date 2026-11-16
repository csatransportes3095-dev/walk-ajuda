import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const server = readFileSync(new URL("./_core/index.ts", import.meta.url), "utf8");

describe("public video aborted stream must not crash the entire service", () => {
  it("awaits Node pipeline so aborted streaming becomes a caught route failure", () => {
    const start = server.indexOf('app.get("/video/:slug"');
    const end = server.indexOf("// Endpoint para broadcast email", start);
    expect(start).toBeGreaterThan(0);
    const route = server.slice(start, end);
    expect(route).toContain("import('node:stream/promises')");
    expect(route).toContain("await pipeline(Readable.fromWeb(upstream.body as any), res)");
    expect(route).not.toContain("Readable.fromWeb(upstream.body as any).pipe(res)");
    expect(route).toContain("} catch (err) {");
    expect(route).toContain("if (!res.headersSent)");
  });
});
