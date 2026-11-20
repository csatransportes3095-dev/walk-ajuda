import { z } from "zod";

export const H2_AUTO_REPLY_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const H2_AUTO_REPLY_IMAGE_MAX_DIMENSION = 2048;

/** Only an owned, authenticated download path crosses the ADM/APK boundary. */
export const h2AutoReplyImageSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{32}$/),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  mimeType: z.enum(["image/jpeg", "image/png"]),
  fileSize: z.number().int().min(1).max(H2_AUTO_REPLY_IMAGE_MAX_BYTES),
  width: z.number().int().min(1).max(H2_AUTO_REPLY_IMAGE_MAX_DIMENSION),
  height: z.number().int().min(1).max(H2_AUTO_REPLY_IMAGE_MAX_DIMENSION),
  downloadPath: z.string().regex(/^\/api\/h2-auto\/reply-images\/[a-f0-9]{24}\/[a-f0-9]{32}$/),
}).strict().refine(image => image.downloadPath.endsWith("/" + image.id), {
  message: "A imagem não corresponde ao arquivo selecionado.", path: ["downloadPath"],
});

export type H2AutoReplyImage = z.infer<typeof h2AutoReplyImageSchema>;

export function h2AutoReplyImagePath(deviceId: string, imageId: string): string {
  return `/api/h2-auto/reply-images/${deviceId}/${imageId}`;
}
