import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const FACEX_COMMIT = "af7ca9937705a10901ca4b72c4eb19ef49a4ac53";
const OUT_DIR = path.resolve("client/public/face-model");

const assets = [
  {
    name: "facex.js",
    url: `https://raw.githubusercontent.com/facex-engine/facex/${FACEX_COMMIT}/wasm/facex.js`,
    minBytes: 25_000,
  },
  {
    name: "facex.wasm",
    url: `https://raw.githubusercontent.com/facex-engine/facex/${FACEX_COMMIT}/wasm/facex.wasm`,
    minBytes: 40_000,
  },
  {
    name: "edgeface_xs_fp32.bin",
    url: "https://github.com/facex-engine/facex/releases/download/v1.0.0/edgeface_xs_fp32.bin",
    minBytes: 7_000_000,
    sha256: "d23f7b3cf8bcda5e451b48cf012e7dc6c4963d5703fafb8893f956d0203691d8",
  },
];

async function sha256(filePath) {
  const bytes = await readFile(filePath);
  return createHash("sha256").update(bytes).digest("hex");
}

async function validExisting(asset, filePath) {
  try {
    const info = await stat(filePath);
    if (info.size < asset.minBytes) return false;
    if (asset.sha256) return (await sha256(filePath)) === asset.sha256;
    return true;
  } catch {
    return false;
  }
}

async function download(asset, filePath) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(asset.url, {
        redirect: "follow",
        headers: { "user-agent": "H2-Colombiano-Build/1.0" },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length < asset.minBytes) {
        throw new Error(`arquivo menor que o esperado: ${bytes.length} bytes`);
      }
      if (asset.sha256) {
        const digest = createHash("sha256").update(bytes).digest("hex");
        if (digest !== asset.sha256) {
          throw new Error(`SHA-256 inválido: ${digest}`);
        }
      }
      await writeFile(filePath, bytes);
      console.log(`[face-model] ${asset.name}: ${bytes.length} bytes OK`);
      return;
    } catch (error) {
      lastError = error;
      console.warn(`[face-model] tentativa ${attempt}/3 falhou para ${asset.name}: ${error}`);
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1200));
    }
  }
  throw new Error(`Falha ao preparar ${asset.name}: ${lastError}`);
}

await mkdir(OUT_DIR, { recursive: true });

for (const asset of assets) {
  const filePath = path.join(OUT_DIR, asset.name);
  if (await validExisting(asset, filePath)) {
    console.log(`[face-model] ${asset.name}: já disponível e válido`);
    continue;
  }
  await download(asset, filePath);
}

console.log("[face-model] assets 112x112 preparados com sucesso.");
