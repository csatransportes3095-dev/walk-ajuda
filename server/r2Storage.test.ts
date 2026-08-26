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
    AbortMultipartUploadCommand: FakeCommand,
    CompleteMultipartUploadCommand: FakeCommand,
    CreateMultipartUploadCommand: FakeCommand,
    UploadPartCommand: FakeCommand,
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

  it("registra upload multipart concluído sem expor segredos e retorna bytes/status/etag", async () => {
    sendMock.mockImplementation(async (command: { input?: { Body?: AsyncIterable<Uint8Array>; PartNumber?: number; MultipartUpload?: unknown } }) => {
      const input = command.input || {};
      for await (const _chunk of input.Body || []) { /* simula o consumo do body pelo cliente S3 */ }
      if (input.MultipartUpload) return { $metadata: { httpStatusCode: 200 }, ETag: '"etag-test"' };
      if (input.PartNumber) return { $metadata: { httpStatusCode: 200 }, ETag: `"etag-part-${input.PartNumber}"` };
      return { UploadId: "upload-test" };
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      const result = await r2PutObjectStream(
        "system-backups/test.wajuda.enc",
        Readable.from([Buffer.from("abc")]),
        "application/octet-stream",
        3,
        { backupId: "backup-test", stage: "r2-upload" },
      );
      expect(result).toMatchObject({ bytesSent: 3, httpStatus: 200, etag: '"etag-test"' });
      const partCall = sendMock.mock.calls.find(([command]) => (command as { input?: { PartNumber?: number } }).input?.PartNumber === 1);
      expect(partCall?.[0]).toMatchObject({ input: { PartNumber: 1, ContentLength: 3 } });
      const output = logSpy.mock.calls.flat().join(" ");
      expect(output).toContain("event=started");
      expect(output).toContain("event=completed");
      expect(output).not.toContain("test-secret-key");
      expect(output).not.toContain("https://r2.test.invalid");
    } finally {
      logSpy.mockRestore();
    }
  });

  it("divide o stream em partes com Content-Length individual", async () => {
    const partSizes: number[] = [];
    sendMock.mockImplementation(async (command: { input?: { Body?: AsyncIterable<Uint8Array>; PartNumber?: number; MultipartUpload?: unknown } }) => {
      const input = command.input || {};
      let bytes = 0;
      for await (const chunk of input.Body || []) bytes += typeof chunk === "number" ? 1 : chunk.length;
      if (input.MultipartUpload) return { $metadata: { httpStatusCode: 200 }, ETag: '"etag-multipart"' };
      if (input.PartNumber) {
        partSizes.push(bytes);
        return { $metadata: { httpStatusCode: 200 }, ETag: `"etag-part-${input.PartNumber}"` };
      }
      return { UploadId: "upload-split" };
    });
    const firstPart = Buffer.alloc(8 * 1024 * 1024, 1);
    const secondPart = Buffer.from("final");
    const result = await r2PutObjectStream(
      "system-backups/split.wajuda.enc",
      Readable.from([firstPart, secondPart]),
      "application/octet-stream",
      firstPart.length + secondPart.length,
      { backupId: "backup-split", stage: "r2-upload" },
    );
    expect(result.bytesSent).toBe(firstPart.length + secondPart.length);
    expect(partSizes).toEqual([firstPart.length, secondPart.length]);
    const partCommands = sendMock.mock.calls
      .map(([command]) => (command as { input?: { PartNumber?: number; ContentLength?: number } }).input)
      .filter((input): input is { PartNumber: number; ContentLength: number } => Boolean(input?.PartNumber));
    expect(partCommands.map((input) => input.ContentLength)).toEqual(partSizes);
  });

  it("registra e propaga falha ao iniciar upload multipart", async () => {
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

  it("faz retry de ECONNRESET e aborta o multipart sem deixar upload incompleto", async () => {
    let partAttempts = 0;
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    sendMock.mockImplementation(async (command: { input?: { PartNumber?: number; UploadId?: string } }) => {
      const input = command.input || {};
      if (input.PartNumber) {
        partAttempts += 1;
        const error = Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" });
        throw error;
      }
      if (input.UploadId) return { $metadata: { httpStatusCode: 204 } };
      return { UploadId: "upload-reset" };
    });
    try {
      await expect(r2PutObjectStream(
        "system-backups/reset.wajuda.enc",
        Readable.from([Buffer.from("abc")]),
        "application/octet-stream",
        3,
        { backupId: "backup-reset", stage: "r2-upload" },
      )).rejects.toThrow("read ECONNRESET");
      expect(partAttempts).toBe(3);
      expect(sendMock.mock.calls.some(([command]) => !(command as { input?: { PartNumber?: number; UploadId?: string } }).input?.PartNumber && (command as { input?: { UploadId?: string } }).input?.UploadId)).toBe(true);
      const output = logSpy.mock.calls.flat().join(" ");
      expect(output).toContain("event=part-retry");
      expect(output).toContain("event=aborted");
      expect(output).not.toContain("read ECONNRESET\n");
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
