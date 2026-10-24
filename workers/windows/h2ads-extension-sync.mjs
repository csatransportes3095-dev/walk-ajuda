import { createHash, createPublicKey, verify } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

const exec = promisify(execFile);
const ID = /^[a-p]{32}$/;
const CRX_PREFIX = Buffer.from("CRX3 SignedData\0", "ascii");

const BLOCKED_EXTENSION_PERMISSIONS = new Set([
  "proxy",
  "nativeMessaging",
  "debugger",
  "management",
  "privacy",
  "vpnProvider",
]);

function auditExtensionManifest(manifest, id) {
  if (!manifest || ![2, 3].includes(manifest.manifest_version)) throw new Error("unsupported_extension_manifest");
  const permissions = [
    ...(Array.isArray(manifest.permissions) ? manifest.permissions : []),
    ...(Array.isArray(manifest.optional_permissions) ? manifest.optional_permissions : []),
  ].filter(item => typeof item === "string");

  const blocked = permissions.filter(permission => BLOCKED_EXTENSION_PERMISSIONS.has(permission));
  if (blocked.length) throw new Error(`extension_permission_blocked:${id}:${blocked.join(",")}`);

  // Extensions may not silently alter browser proxy/privacy controls or invoke native code.
  const background = manifest.background;
  if (background && typeof background === "object" && Array.isArray(background.scripts) && background.scripts.length > 100) {
    throw new Error("extension_manifest_suspicious");
  }
  return true;
}

async function auditInstalledExtension(destination, id) {
  const manifestPath = join(destination, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  auditExtensionManifest(manifest, id);
  return manifest;
}
function varint(data, pos) {
  let n = 0, shift = 0;
  while (pos < data.length && shift < 56) {
    const b = data[pos++];
    n += (b & 127) * 2 ** shift;
    if (!(b & 128)) return [n, pos];
    shift += 7;
  }
  throw new Error("invalid_crx_varint");
}
function fields(data) {
  const out = new Map();
  let pos = 0;
  while (pos < data.length) {
    let tag; [tag, pos] = varint(data, pos);
    const wire = tag & 7, number = Math.floor(tag / 8);
    if (wire === 0) { [, pos] = varint(data, pos); continue; }
    if (wire !== 2) throw new Error("unsupported_crx_field");
    let length; [length, pos] = varint(data, pos);
    if (!Number.isSafeInteger(length) || length < 0 || length > data.length - pos) throw new Error("invalid_crx_field");
    if (!out.has(number)) out.set(number, []);
    out.get(number).push(data.subarray(pos, pos + length));
    pos += length;
  }
  return out;
}
function extensionId(publicKey) {
  return createHash("sha256").update(publicKey).digest().subarray(0, 16).toString("hex").replace(/[0-9a-f]/g, c => String.fromCharCode(97 + Number.parseInt(c, 16)));
}
export function verifyCrx3(buffer, id) {
  if (!ID.test(id) || buffer.length < 24 || buffer.toString("ascii", 0, 4) !== "Cr24" || buffer.readUInt32LE(4) !== 3) throw new Error("invalid_crx3");
  const length = buffer.readUInt32LE(8);
  if (length < 8 || length > 1024 * 1024 || length + 12 >= buffer.length) throw new Error("invalid_crx_header");
  const header = fields(buffer.subarray(12, 12 + length));
  const signed = header.get(10000)?.[0];
  const zip = buffer.subarray(12 + length);
  if (!signed || signed.length < 18 || zip.toString("ascii", 0, 2) !== "PK") throw new Error("invalid_crx_content");
  const signedFields = fields(signed);
  const crxId = signedFields.get(1)?.[0];
  // SignedData.crx_id is the first 16 bytes of the SHA-256 of the public key.
  const idHex = [...id].map(c => (c.charCodeAt(0) - 97).toString(16)).join("");
  if (!crxId || crxId.length !== 16 || crxId.toString("hex") !== idHex) throw new Error("crx_id_mismatch");
  const message = Buffer.concat([CRX_PREFIX, Buffer.alloc(4), signed, zip]);
  message.writeUInt32LE(signed.length, CRX_PREFIX.length);
  for (const proof of header.get(2) ?? []) {
    const parts = fields(proof);
    const key = parts.get(1)?.[0], sig = parts.get(2)?.[0];
    if (!key || !sig || extensionId(key) !== id) continue;
    const publicKey = createPublicKey({ key, format: "der", type: "spki" });
    if (verify("sha256", message, publicKey, sig)) return { zip, key: key.toString("base64") };
  }
  throw new Error("crx_signature_invalid");
}
export async function syncH2AdsExtensions({ panelUrl, headers, proxyPort, root }) {
  const response = await fetch(panelUrl.replace(/\/$/, "") + "/api/h2ads/worker/extensions/enabled", { headers, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error("extension_catalog_unavailable");
  const entries = await response.json();
  if (!Array.isArray(entries) || entries.length > 40) throw new Error("invalid_extension_catalog");
  const paths = [];
  for (const entry of entries) {
    const id = entry?.id;
    if (!ID.test(id)) continue;
    const destination = join(root, id);
    if (existsSync(join(destination, "manifest.json"))) {
      try {
        await auditInstalledExtension(destination, id);
        paths.push(destination);
      } catch (error) {
        console.error("[H2ADS] extensao bloqueada", id, String(error?.message || error));
      }
      continue;
    }
    const temp = await mkdtemp(join(tmpdir(), "h2ads-crx-"));
    try {
      const crxPath = join(temp, "extension.crx"), zipPath = join(temp, "extension.zip");
      const params = new URLSearchParams({
        response: "redirect", prodversion: "156.0.8078.12", acceptformat: "crx3",
        os: "win", arch: "x64", prod: "chromecrx", x: "id=" + id + "&uc",
      });
      const upstream = "https://clients2.google.com/service/update2/crx?" + params.toString();
      await exec("curl.exe", ["--fail", "--silent", "--show-error", "--location", "--proto", "=https", "--proto-redir", "=https", "--max-redirs", "4", "--max-time", "40", "--max-filesize", "25000000", "--proxy", "http://127.0.0.1:" + proxyPort, "--output", crxPath, upstream], { windowsHide: true, timeout: 45000 });
      const data = await readFile(crxPath);
      if (data.length > 25000000) throw new Error("crx_too_large");
      const unpacked = verifyCrx3(data, id);
      await writeFile(zipPath, unpacked.zip);
      const output = join(temp, "unpacked");
      const quote = value => "'" + value.replaceAll("'", "''") + "'";
      await exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "Expand-Archive -LiteralPath " + quote(zipPath) + " -DestinationPath " + quote(output) + " -Force"], { windowsHide: true, timeout: 30000 });
      const manifestPath = join(output, "manifest.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      auditExtensionManifest(manifest, id);
      manifest.key = unpacked.key;
      await writeFile(manifestPath, JSON.stringify(manifest));
      await mkdir(root, { recursive: true });
      await rename(output, destination);
      paths.push(destination);
    } catch (error) {
      // Extension failures never bypass proxy or interrupt the browser session.
      console.error("[H2ADS] extensao", id, String(error?.message || error));
    } finally { await rm(temp, { recursive: true, force: true }).catch(() => undefined); }
  }
  return paths;
}
