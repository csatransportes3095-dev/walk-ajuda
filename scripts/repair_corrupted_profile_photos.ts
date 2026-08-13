import { r2GetObjectBuffer, r2PutObject } from "../server/r2Storage";

const TARGETS = [
  { label: "foto 1", key: "profile-photos/11993425366-1786598497749.jpg" },
  { label: "foto 2", key: "profile-photos/11993425394-1786594938014.jpg" },
  { label: "foto 3", key: "profile-photos/11993425399-1786593788896.jpg" },
] as const;

function startsWithJpeg(buffer: Buffer): boolean {
  return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

function findJpegStart(buffer: Buffer): number {
  for (let index = 0; index <= buffer.length - 3; index += 1) {
    if (buffer[index] === 0xff && buffer[index + 1] === 0xd8 && buffer[index + 2] === 0xff) {
      return index;
    }
  }
  return -1;
}

async function repairProfilePhoto(label: string, key: string) {
  const original = await r2GetObjectBuffer(key);
  if (startsWithJpeg(original)) {
    console.log(`[reparo-foto] ${label}: já íntegra; nenhuma alteração aplicada.`);
    return { label, status: "already-valid" as const };
  }

  const jpegOffset = findJpegStart(original);
  if (jpegOffset <= 0 || jpegOffset > 64) {
    throw new Error(`${label}: assinatura JPEG não encontrada em posição segura para reparo.`);
  }

  const repaired = original.subarray(jpegOffset);
  if (!startsWithJpeg(repaired)) {
    throw new Error(`${label}: validação do JPEG reparado falhou.`);
  }

  await r2PutObject(key, repaired, "image/jpeg");
  const verified = await r2GetObjectBuffer(key);
  if (!startsWithJpeg(verified) || verified.length !== repaired.length) {
    throw new Error(`${label}: a verificação após a gravação falhou.`);
  }

  console.log(`[reparo-foto] ${label}: concluído; removidos ${jpegOffset} bytes indevidos.`);
  return { label, status: "repaired" as const, removedBytes: jpegOffset };
}

async function main() {
  const results = [];
  for (const target of TARGETS) {
    results.push(await repairProfilePhoto(target.label, target.key));
  }
  const repaired = results.filter((result) => result.status === "repaired").length;
  const alreadyValid = results.filter((result) => result.status === "already-valid").length;
  console.log(`[reparo-foto] resumo: ${repaired} reparada(s), ${alreadyValid} já íntegra(s).`);
}

main().catch((error) => {
  console.error("[reparo-foto] falha:", error instanceof Error ? error.message : "erro desconhecido");
  process.exitCode = 1;
});
