/** Novo preset opcional: localiza a área realmente branca da foto no print.
 * Opera só na imagem lida localmente; o recorte quadrado existente não é alterado.
 * Se a região branca não for reconhecida, retorna null (nunca inclui fundo escuro).
 */
export type WhitePhotoCrop = { x: number; y: number; width: number; height: number };
type OriginalCrop = { x: number; y: number; size: number };

export function findWhitePhotoCrop(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  offsetX: number,
  offsetY: number,
  original: OriginalCrop,
): WhitePhotoCrop | null {
  if (!Number.isInteger(width) || !Number.isInteger(height) ||
      width < 32 || height < 32 || pixels.length < width * height * 4 ||
      !Number.isFinite(original.size) || original.size < 48) return null;

  const n = width * height;
  const light = new Uint8Array(n);
  const visited = new Uint8Array(n);
  const queue = new Int32Array(n);
  const isWhite = (i: number) => {
    const p = i * 4;
    const r = pixels[p], g = pixels[p + 1], b = pixels[p + 2];
    return pixels[p + 3] >= 128 && r >= 210 && g >= 210 && b >= 210 &&
      Math.max(r, g, b) - Math.min(r, g, b) <= 40;
  };
  for (let i = 0; i < n; i++) light[i] = isWhite(i) ? 1 : 0;
  const sampleDark = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return null;
    const i = (y * width + x) * 4;
    return pixels[i] + pixels[i + 1] + pixels[i + 2] < 540;
  };
  const originalCx = original.x + original.size / 2;
  const originalCy = original.y + original.size / 2;
  let winner: WhitePhotoCrop | null = null;
  let bestScore = -Infinity;

  // Componentes claros conectados delimitam o fundo branco que envolve o rosto.
  // Texto branco solto no fundo escuro não forma uma área retangular suficiente.
  for (let i = 0; i < n; i++) {
    if (!light[i] || visited[i]) continue;
    let read = 0, write = 1, count = 0;
    let minX = width, minY = height, maxX = -1, maxY = -1;
    queue[0] = i;
    visited[i] = 1;
    while (read < write) {
      const idx = queue[read++];
      const x = idx % width, y = (idx - x) / width;
      count++;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      const add = (next: number) => {
        if (!visited[next] && light[next]) {
          visited[next] = 1;
          queue[write++] = next;
        }
      };
      if (x > 0) add(idx - 1);
      if (x + 1 < width) add(idx + 1);
      if (y > 0) add(idx - width);
      if (y + 1 < height) add(idx + width);
    }
    const photoWidth = maxX - minX + 1;
    const photoHeight = maxY - minY + 1;
    if (photoWidth < Math.max(38, original.size * 0.45) ||
        photoHeight < Math.max(45, original.size * 0.52) ||
        photoWidth > original.size * 1.65 ||
        photoHeight > original.size * 1.8 ||
        count / (photoWidth * photoHeight) < 0.14) continue;

    const left = offsetX + minX, top = offsetY + minY;
    const right = left + photoWidth, bottom = top + photoHeight;
    const overlapX = Math.max(0, Math.min(right, original.x + original.size) - Math.max(left, original.x));
    const overlapY = Math.max(0, Math.min(bottom, original.y + original.size) - Math.max(top, original.y));
    const overlap = overlapX * overlapY / (original.size * original.size);
    if (overlap < 0.22 ||
        Math.abs(left + photoWidth / 2 - originalCx) > original.size * 0.63 ||
        Math.abs(top + photoHeight / 2 - originalCy) > original.size * 0.68) continue;

    // Exige contraste real com o lado de fora da fotografia.
    // Se tudo for claro (sem fronteira), não adivinha um recorte.
    let dark = 0, samples = 0;
    const probe = (x: number, y: number) => {
      const result = sampleDark(x, y);
      if (result !== null) { samples++; if (result) dark++; }
    };
    for (const t of [0.2, 0.5, 0.8]) {
      probe(minX - 4, Math.round(minY + photoHeight * t));
      probe(maxX + 4, Math.round(minY + photoHeight * t));
      probe(Math.round(minX + photoWidth * t), minY - 4);
      probe(Math.round(minX + photoWidth * t), maxY + 4);
    }
    if (samples < 5 || dark < 4) continue;

    // Proporção vertical 4:5. Todo o retângulo fica DENTRO do fundo branco.
    // Conservar a altura privilegia rosto inteiro e parte dos ombros.
    const cropHeight = Math.floor(Math.min(photoHeight, photoWidth * 1.25));
    const cropWidth = Math.floor(cropHeight * 0.8);
    if (cropWidth < 40 || cropHeight < 50) continue;
    const cropX = minX + Math.floor((photoWidth - cropWidth) / 2);
    const cropY = minY;
    const nearWhite = (x: number, y: number) =>
      x >= 0 && y >= 0 && x < width && y < height && light[y * width + x] === 1;
    // Os dois cantos superiores da saída devem começar em fundo branco.
    if (!nearWhite(cropX + 2, cropY + 2) ||
        !nearWhite(cropX + cropWidth - 3, cropY + 2)) continue;

    const score = overlap * 100 + count / (photoWidth * photoHeight) * 30 +
      dark / samples * 15 - (Math.abs(left + photoWidth / 2 - originalCx) +
      Math.abs(top + photoHeight / 2 - originalCy)) / original.size * 20;
    if (score > bestScore) {
      bestScore = score;
      winner = { x: offsetX + cropX, y: offsetY + cropY, width: cropWidth, height: cropHeight };
    }
  }
  return winner;
}
