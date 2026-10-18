import { describe, expect, it } from "vitest";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
// @ts-ignore Worker module intentionally uses .mjs without a TypeScript declaration.
import { verifyCrx3 } from "../workers/windows/h2ads-extension-sync.mjs";

function varint(n: number): Buffer {
  const bytes: number[] = [];
  do {
    let b = n % 128; n = Math.floor(n / 128);
    if (n > 0) b |= 128;
    bytes.push(b);
  } while (n > 0);
  return Buffer.from(bytes);
}
function field(id: number, buf: Buffer): Buffer {
  return Buffer.concat([varint(id * 8 + 2), varint(buf.length), buf]);
}
describe("H2ADS extension package validation", () => {
  it("verifies CRX3 cryptographic signature and expected ID", () => {
    const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const publicKey = pair.publicKey.export({ format: "der", type: "spki" }) as Buffer;
    const idBytes = createHash("sha256").update(publicKey).digest().subarray(0, 16);
    const id = [...idBytes].map(x => x.toString(16).padStart(2, "0")).join("").replace(/[0-9a-f]/g, x => String.fromCharCode(97 + Number.parseInt(x, 16)));
    const zip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("synthetic-test-archive")]);
    const signedData = field(1, idBytes);
    const prefix = Buffer.concat([Buffer.from("CRX3 SignedData", "ascii"), Buffer.from([0])]);
    const len = Buffer.alloc(4); len.writeUInt32LE(signedData.length);
    const signature = sign("sha256", Buffer.concat([prefix, len, signedData, zip]), pair.privateKey);
    const header = Buffer.concat([field(2, Buffer.concat([field(1, publicKey), field(2, signature)])), field(10000, signedData)]);
    const crxPrefix = Buffer.alloc(12);
    crxPrefix.write("Cr24", 0, "ascii"); crxPrefix.writeUInt32LE(3, 4); crxPrefix.writeUInt32LE(header.length, 8);
    const payload = Buffer.concat([crxPrefix, header, zip]);
    expect(verifyCrx3(payload, id).key).toBe(publicKey.toString("base64"));
    const tampered = Buffer.from(payload); tampered[tampered.length - 1] ^= 1;
    expect(() => verifyCrx3(tampered, id)).toThrow("crx_signature_invalid");
    expect(() => verifyCrx3(payload, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")).toThrow();
  });
});
