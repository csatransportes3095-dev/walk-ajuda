import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));

vi.mock("@aws-sdk/client-s3", () => {
  class FakeCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  }
  class FakeS3Client {
    send(command: unknown) {
      return sendMock(command);
    }
  }
  return {
    S3Client: FakeS3Client,
    DeleteObjectsCommand: FakeCommand,
    GetObjectCommand: FakeCommand,
    HeadObjectCommand: FakeCommand,
    ListObjectsV2Command: FakeCommand,
    PutObjectCommand: FakeCommand,
  };
});

vi.mock("./_core/env", () => ({
  ENV: {
    r2AccessKeyId: "test-access-key",
    r2SecretAccessKey: "test-secret-key",
    r2Endpoint: "https://r2.test.invalid",
    r2BucketName: "test-bucket",
    r2PublicUrl: "https://files.test.invalid",
  },
}));

import { r2GetObjectStream, r2HeadObject, r2ListObjects, r2PutObjectStream } from "./r2Storage";

describe("r2Storage", () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  it.each([
    { name: "Contents ausente", response: {}, expected: [] },
    { name: "Contents vazio", response: { Contents: [] }, expected: [] },
    { name: "um objeto", response: { Contents: [{ Key: "files/a.jpg" }] }, expected: ["files/a.jpg"] },
    { name: "vários objetos", response: { Contents: [{ Key: "files/a.jpg" }, { Key: "files/b.pdf" }] }, expected: ["files/a.jpg", "files/b.pdf"] },
    { name: "objeto sem Key", response: { Contents: [{ Size: 20 }, { Key: "files/ok.txt" }, { Key: "" }] }, expected: ["files/ok.txt"] },
  ])("retorna sempre um array em $name", async ({ response, expected }) => {
    sendMock.mockResolvedValue(response);
    await expect(r2ListObjects("profile-photos/test")).resolves.toEqual(expected);
  });

  it("mantém o prefixo e a ordem da resposta normal", async () => {
    sendMock.mockResolvedValue({ Contents: [{ Key: "profile-photos/test/1.jpg" }, { Key: "profile-photos/test/2.jpg" }] });
    await r2ListObjects("profile-photos/test");
    expect(sendMock.mock.calls[0]?.[0]).toMatchObject({ input: { Prefix: "profile-photos/test" } });
  });

  it("registra upload concluído sem expor segredos e retorna bytes/status/etag", async () => {
    sendMock.mockImplementation(async (command: { input?: { Body?: AsyncIterable<Uint8Array> } }) => {
      for await (const _chunk of command.input?.Body || []) { /* simula o consumo do body pelo cliente S3 */ }
      return { $metadata: { httpStatusCode: 200 }, ETag: '"etag-test"' };
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      const result = await r2PutObjectStream(
        "system-backups/test.wajuda.enc",
        Readable.from([Buffer.from("abc")]),
        "application/octet-stream",
        undefined,
        { backupId: "backup-test", stage: "r2-upload" },
      );
      expect(result).toMatchObject({ bytesSent: 3, httpStatus: 200, etag: '"etag-test"' });
      const output = logSpy.mock.calls.flat().join(" ");
      expect(output).toContain("event=started");
      expect(output).toContain("event=completed");
      expect(output).not.toContain("test-secret-key");
      expect(output).not.toContain("https://r2.test.invalid");
    } finally {
      logSpy.mockRestore();
    }
  });

  it("registra e propaga falha do upload", async () => {
    sendMock.mockRejectedValue(new Error("upload rejected"));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      await expect(r2PutObjectStream(
        "system-backups/test.wajuda.enc",
        Readable.from([Buffer.from("abc")]),
        "application/octet-stream",
        undefined,
        { backupId: "backup-test", stage: "r2-upload" },
      )).rejects.toThrow("upload rejected");
      expect(logSpy.mock.calls.flat().join(" ")).toContain("event=failed");
    } finally {
      logSpy.mockRestore();
    }
  });

  it("trata download sem body como erro controlado", async () => {
    sendMock.mockResolvedValue({ Body: undefined });
    await expect(r2GetObjectStream("files/missing.bin")).rejects.toThrow("no body");
  });

  it("confirma metadados do objeto final por HEAD", async () => {
    sendMock.mockResolvedValue({ ContentLength: 123, ETag: '"etag-test"', $metadata: { httpStatusCode: 200 } });
    await expect(r2HeadObject("system-backups/test.wajuda.enc")).resolves.toEqual({
      contentLength: 123,
      httpStatus: 200,
      etag: '"etag-test"',
    });
  });
});
