import { describe, expect, it } from "vitest";
import { faceCropToPixels } from "./facePhotoCropMath";

describe("faceCropToPixels", () => {
  it("mantém a resolução original ao converter recorte percentual", () => {
    expect(
      faceCropToPixels({ x: 10, y: 20, width: 60, height: 50 }, 1200, 800),
    ).toEqual({ x: 120, y: 160, width: 720, height: 400 });
  });

  it("limita recortes nas bordas da foto", () => {
    expect(
      faceCropToPixels({ x: 75, y: 75, width: 60, height: 60 }, 800, 600),
    ).toEqual({ x: 600, y: 450, width: 200, height: 150 });
  });

  it("recusa dimensões inválidas", () => {
    expect(() => faceCropToPixels({ x: 0, y: 0, width: 80, height: 80 }, 0, 400))
      .toThrow("Imagem ou recorte inválido.");
  });
});
