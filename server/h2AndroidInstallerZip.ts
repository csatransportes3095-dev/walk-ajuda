/**
 * Small zero-dependency ZIP (STORED entries).
 * Only bundled, server-owned Windows installer files are supported.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let crc = n;
  for (let i = 0; i < 8; i++) crc = (crc & 1) ? (0xEDB88320 ^ (crc >>> 1)) : (crc >>> 1);
  return crc >>> 0;
});

function checksum(data: Buffer): number {
  let crc = 0xFFFFFFFF;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

export function packAndroidWindowsInstaller(entries: { name: string; content: Buffer }[]): Buffer {
  if (!entries.length || entries.length > 4) throw new Error("Quantidade invalida de arquivos");
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    if (!/^[A-Za-z0-9_.-]{1,80}$/.test(entry.name)) throw new Error("Nome de arquivo invalido");
    if (entry.content.length > 512 * 1024) throw new Error("Arquivo do instalador muito grande");
    const filename = Buffer.from(entry.name, "utf8");
    const crc = checksum(entry.content);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034B50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8); // store, no compression
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(entry.content.length, 18);
    localHeader.writeUInt32LE(entry.content.length, 22);
    localHeader.writeUInt16LE(filename.length, 26);
    local.push(localHeader, filename, entry.content);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014B50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(entry.content.length, 20);
    centralHeader.writeUInt32LE(entry.content.length, 24);
    centralHeader.writeUInt16LE(filename.length, 28);
    centralHeader.writeUInt32LE(offset, 42);
    central.push(centralHeader, filename);
    offset += localHeader.length + filename.length + entry.content.length;
  }
  const centralBytes = central.reduce((n, buf) => n + buf.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054B50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBytes, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, end]);
}

export async function getAndroidWindowsInstallerZip(): Promise<Buffer> {
  const directory = path.resolve(process.cwd(), "workers", "windows");
  const names = ["Instalar-H2-Android.cmd", "H2AndroidAgent.ps1"];
  const entries = await Promise.all(names.map(async name => ({
    name,
    content: await readFile(path.join(directory, name)),
  })));
  return packAndroidWindowsInstaller(entries);
}
