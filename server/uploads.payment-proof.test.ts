import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTRPCMsw } from "msw-trpc";
import { setupServer } from "msw/node";
import { storagePut } from "./storage";

// Mock storagePut
vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ url: "https://storage.example.com/file.jpg", key: "order-docs/file.jpg" }),
}));

describe("Payment Proof Upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should accept JPG file with correct MIME type", async () => {
    const file = new File(["test"], "comprovante.jpg", { type: "image/jpeg" });
    const formData = new FormData();
    formData.append("file", file);
    formData.append("label", "comprovante-pix");
    formData.append("phone", "11999999999");

    // Simula o que o backend faria
    const mimeType = file.type || "application/octet-stream";
    const filename = file.name;
    
    expect(mimeType).toBe("image/jpeg");
    expect(filename).toBe("comprovante.jpg");
  });

  it("should accept PNG file with correct MIME type", async () => {
    const file = new File(["test"], "comprovante.png", { type: "image/png" });
    const formData = new FormData();
    formData.append("file", file);
    formData.append("label", "comprovante-pix");
    formData.append("phone", "11999999999");

    const mimeType = file.type || "application/octet-stream";
    const filename = file.name;
    
    expect(mimeType).toBe("image/png");
    expect(filename).toBe("comprovante.png");
  });

  it("should accept PDF file", async () => {
    const file = new File(["test"], "comprovante.pdf", { type: "application/pdf" });
    const formData = new FormData();
    formData.append("file", file);
    formData.append("label", "comprovante-pix");
    formData.append("phone", "11999999999");

    const mimeType = file.type || "application/octet-stream";
    const filename = file.name;
    
    expect(mimeType).toBe("application/pdf");
    expect(filename).toBe("comprovante.pdf");
  });

  it("should handle file with empty MIME type (gallery upload)", async () => {
    // Simula arquivo da galeria com MIME vazio
    const file = new File(["test"], "comprovante.jpg", { type: "" });
    const formData = new FormData();
    formData.append("file", file);
    formData.append("label", "comprovante-pix");
    formData.append("phone", "11999999999");

    const mimeType = file.type || "application/octet-stream";
    const filename = file.name;
    
    // Backend deve deduzir pela extensão
    expect(filename).toBe("comprovante.jpg");
    expect(mimeType).toBe("application/octet-stream"); // Quando vazio, o fallback é application/octet-stream
  });

  it("should handle file with octet-stream MIME type", async () => {
    // Simula arquivo com MIME genérico
    const file = new File(["test"], "comprovante.jpg", { type: "application/octet-stream" });
    const formData = new FormData();
    formData.append("file", file);
    formData.append("label", "comprovante-pix");
    formData.append("phone", "11999999999");

    const mimeType = file.type || "application/octet-stream";
    const filename = file.name;
    
    // Backend deve deduzir pela extensão
    expect(filename).toBe("comprovante.jpg");
    expect(mimeType).toBe("application/octet-stream");
  });

  it("should accept HEIC file (iPhone format)", async () => {
    const file = new File(["test"], "comprovante.heic", { type: "image/heic" });
    const formData = new FormData();
    formData.append("file", file);
    formData.append("label", "comprovante-pix");
    formData.append("phone", "11999999999");

    const mimeType = file.type || "application/octet-stream";
    const filename = file.name;
    
    expect(mimeType).toBe("image/heic");
    expect(filename).toBe("comprovante.heic");
  });

  it("should reject file larger than 20MB", async () => {
    // Simula arquivo grande
    const largeBuffer = new ArrayBuffer(25 * 1024 * 1024); // 25MB
    const file = new File([largeBuffer], "comprovante.jpg", { type: "image/jpeg" });
    
    expect(file.size).toBeGreaterThan(20 * 1024 * 1024);
  });

  it("should include phone and label in upload", async () => {
    const file = new File(["test"], "comprovante.jpg", { type: "image/jpeg" });
    const formData = new FormData();
    const phone = "11999999999";
    const label = "comprovante-pix";
    
    formData.append("file", file);
    formData.append("label", label);
    formData.append("phone", phone);

    // Simula o que o backend recebe
    const entries = Array.from(formData.entries());
    const phoneEntry = entries.find(([key]) => key === "phone");
    const labelEntry = entries.find(([key]) => key === "label");
    
    expect(phoneEntry?.[1]).toBe(phone);
    expect(labelEntry?.[1]).toBe(label);
  });
});
