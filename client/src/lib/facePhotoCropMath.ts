/** Converte um recorte percentual da interface para pixels da foto original. */
export type FaceCropPercent = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type FaceCropPixels = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function faceCropToPixels(
  crop: FaceCropPercent,
  naturalWidth: number,
  naturalHeight: number,
): FaceCropPixels {
  if (
    !Number.isFinite(naturalWidth) ||
    !Number.isFinite(naturalHeight) ||
    naturalWidth < 1 ||
    naturalHeight < 1 ||
    !Object.values(crop).every(Number.isFinite)
  ) {
    throw new Error("Imagem ou recorte inválido.");
  }

  const startX = clamp(Math.round((crop.x / 100) * naturalWidth), 0, naturalWidth - 1);
  const startY = clamp(Math.round((crop.y / 100) * naturalHeight), 0, naturalHeight - 1);
  const endX = clamp(Math.round(((crop.x + crop.width) / 100) * naturalWidth), startX + 1, naturalWidth);
  const endY = clamp(Math.round(((crop.y + crop.height) / 100) * naturalHeight), startY + 1, naturalHeight);

  return { x: startX, y: startY, width: endX - startX, height: endY - startY };
}
