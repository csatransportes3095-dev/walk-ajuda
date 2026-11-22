import { describe, expect, it, vi } from "vitest";
import { loadColombiaBotPhotoFromR2, parseColombiaBotPhotoSource, parseColombiaBotPhotoRequest, optimizeColombiaBotWhatsappPhoto } from "./colombiaBotCustomerPhotoPreview";

const valid = "https://midia.h2colombiano.com/profile-photos/11993425306-1791754942385.png";

describe("ColombiaBot: foto do cliente em link WhatsApp", () => {
  it("aceita apenas arquivos de foto no domínio de mídia autorizado", () => {
    expect(parseColombiaBotPhotoSource(valid)?.pathname).toContain("profile-photos/");
    for (const invalid of [
      "http://midia.h2colombiano.com/profile-photos/test.png",
      "https://evil.example.com/profile-photos/test.png",
      "https://midia.h2colombiano.com@evil.example.com/profile-photos/test.png",
      "https://midia.h2colombiano.com/private/test.png",
      "https://midia.h2colombiano.com/profile-photos/../private/test.png",
      "https://midia.h2colombiano.com/profile-photos/test.png?token=foo",
    ]) {
      expect(parseColombiaBotPhotoSource(invalid)).toBeNull();
    }
  });
  it("aceita a chave curta e os links antigos, sem permitir outros diretórios", () => {
    const key = "profile-photos/11993425306-1791754942385.png";
    expect(parseColombiaBotPhotoRequest({ k: key })?.toString()).toBe(valid);
    expect(parseColombiaBotPhotoRequest({ src: valid })?.toString()).toBe(valid);
    expect(parseColombiaBotPhotoRequest({ k: "../secret.png", src: valid })).toBeNull();
    expect(parseColombiaBotPhotoRequest({ k: "other/file.png" })).toBeNull();
  });
  it("otimiza a miniatura para JPEG sem modificar os bytes de origem", async () => {
    const sharp = (await import("sharp")).default;
    const original = await sharp({
      create: { width: 1200, height: 900, channels: 3, background: "#72a2bf" },
    }).png().toBuffer();
    const copy = Buffer.from(original);
    const optimized = await optimizeColombiaBotWhatsappPhoto({ buffer: original, contentType: "image/png" });
    expect(optimized.contentType).toBe("image/jpeg");
    expect(optimized.buffer.subarray(0, 3).toString("hex")).toBe("ffd8ff");
    const meta = await sharp(optimized.buffer).metadata();
    expect(meta.width).toBeLessThanOrEqual(800);
    expect(meta.height).toBeLessThanOrEqual(800);
    expect(original.equals(copy)).toBe(true);
  });
  it("recupera bytes do arquivo privado somente quando o caminho está autorizado", async () => {
    const get = vi.fn(async (_key: string) => Buffer.from([137, 80, 78, 71]));
    const head = vi.fn(async (_key: string) => ({ contentLength: 4 }));
    const result = await loadColombiaBotPhotoFromR2(new URL(valid), { head, get });
    expect(result?.contentType).toBe("image/png");
    expect(result?.buffer.length).toBe(4);
    expect(head).toHaveBeenCalledWith("profile-photos/11993425306-1791754942385.png");
    expect(get).toHaveBeenCalledTimes(1);
  });
  it("não baixa arquivos inexistentes, vazios ou maiores que 5 MB", async () => {
    const get = vi.fn(async () => Buffer.from("abc"));
    const sourceUrl = new URL(valid);
    expect(await loadColombiaBotPhotoFromR2(sourceUrl, { head: async () => ({ contentLength: 0 }), get })).toBeNull();
    expect(await loadColombiaBotPhotoFromR2(sourceUrl, { head: async () => ({ contentLength: 7 * 1024 * 1024 }), get })).toBeNull();
    expect(get).not.toHaveBeenCalled();
    expect(await loadColombiaBotPhotoFromR2(sourceUrl, { head: async () => ({ contentLength: 4 }), get })).toBeNull();
  });
});
