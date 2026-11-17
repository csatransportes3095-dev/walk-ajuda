import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";

const server = readFileSync(new URL("./_core/index.ts", import.meta.url), "utf8");
const storage = readFileSync(new URL("./_core/storageProxy.ts", import.meta.url), "utf8");

describe("isolated streaming failures do not become unhandled process errors", () => {
  it("awaits public video transfer failures inside its existing route handler", () => {
    const start = server.indexOf('app.get("/video/:slug"');
    const end = server.indexOf("// Endpoint para broadcast email", start);
    expect(start).toBeGreaterThan(0);
    const route = server.slice(start, end);
    expect(route).toContain("import('node:stream/promises')");
    expect(route).toContain("await pipeline(Readable.fromWeb(upstream.body as any), res)");
    expect(route).not.toContain("Readable.fromWeb(upstream.body as any).pipe(res)");
    expect(route).toContain("} catch (err) {");
  });
  it("protects storage media and preserves byte Range forwarding", () => {
    expect(storage).toContain('upstreamHeaders["Range"] = req.headers["range"] as string');
    expect(storage).toContain("await pipeline(nodeReadable, res)");
    expect(storage).not.toContain("nodeReadable.pipe(res)");
    expect(storage).toContain("if (!res.headersSent)");
  });
  it("protects admin backup downloads without changing access checks", () => {
    const start = server.indexOf('app.get("/api/admin/backups/:id/download"');
    const end = server.indexOf("ensureApkTable()", start);
    expect(start).toBeGreaterThan(0);
    const route = server.slice(start, end);
    expect(route).toContain("await getBackupDownload(req, req.params.id)");
    expect(route).toContain("await pipeline(artifact.body, res)");
    expect(route).not.toContain("artifact.body.pipe(res)");
  });
  it("an aborted upstream rejects through awaited pipeline for local handling", async () => {
    const aborted = new Error("terminated");
    const source = new Readable({
      read() {
        this.destroy(aborted);
      },
    });
    const sink = new Writable({ write(_chunk, _enc, cb) { cb(); } });
    await expect(pipeline(source, sink)).rejects.toThrow("terminated");
  });
});
