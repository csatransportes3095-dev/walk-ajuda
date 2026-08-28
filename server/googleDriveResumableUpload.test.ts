import { describe, expect, it, vi } from "vitest";
import { nextGoogleDriveOffset, uploadGoogleDriveResumableFile, validateGoogleDriveChunkSize } from "./googleDriveResumableUpload";
import { mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

describe("googleDriveResumableUpload", () => {
  it("interpreta o Range confirmado pelo Google", () => {
    expect(nextGoogleDriveOffset("bytes=0-262143")).toBe(262144);
    expect(nextGoogleDriveOffset(null)).toBe(0);
  });

  it("exige blocos múltiplos de 256 KB", () => {
    expect(validateGoogleDriveChunkSize(256 * 1024)).toBe(256 * 1024);
    expect(() => validateGoogleDriveChunkSize(123)).toThrow(/256 KB/);
  });

  it("envia em blocos e usa Content-Range até receber o ID", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "drive-upload-test-"));
    const file = path.join(dir, "backup.enc");
    const total = 512 * 1024;
    await writeFile(file, Buffer.alloc(total, 7));
    const calls: Array<{ range: string | null; length: string | null }> = [];
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      calls.push({ range: headers.get("content-range"), length: headers.get("content-length") });
      if (calls.length === 1) return new Response(null, { status: 308, headers: { Range: "bytes=0-262143" } });
      return new Response(JSON.stringify({ id: "drive-file-id" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as unknown as typeof fetch;

    const result = await uploadGoogleDriveResumableFile({
      uploadUrl: "https://example.invalid/session",
      accessToken: "token",
      filePath: file,
      totalBytes: total,
      chunkBytes: 256 * 1024,
      fetchImpl,
    });

    expect(result.id).toBe("drive-file-id");
    expect(calls).toEqual([
      { range: `bytes 0-262143/${total}`, length: "262144" },
      { range: `bytes 262144-524287/${total}`, length: "262144" },
    ]);
  });
});
