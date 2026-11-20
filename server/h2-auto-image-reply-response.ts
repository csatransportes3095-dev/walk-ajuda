import type { H2AutoPersonalizedAnswer } from "../shared/h2AutoPersonalization";

export function supportsH2AutoImageReplies(capabilities: unknown): boolean {
  return typeof capabilities === "string" && capabilities.split(",")
    .some(capability => capability.trim() === "imageRepliesV1");
}

/** Preserve the established text envelope; attach files only for APKs that explicitly support them. */
export function h2AutoImageReplyFields(answers: readonly H2AutoPersonalizedAnswer[], supported: boolean) {
  const withImage = answers.filter(answer => Boolean(answer.image));
  if (!withImage.length) return {};
  const originalMessage = answers.map(answer => answer.message).filter(Boolean).join("\n\n");
  if (!supported) {
    const needsNotice = withImage.some(answer => answer.message.trim().length === 0);
    return {
      imageReplyStatus: "apk_update_required" as const,
      ...(needsNotice ? { message: [originalMessage, "Não consegui enviar a imagem desta resposta agora."].filter(Boolean).join("\n\n") } : {}),
    };
  }
  const distinct = new Map<string, NonNullable<H2AutoPersonalizedAnswer["image"]> & { faqId: string }>();
  for (const answer of withImage) {
    const image = answer.image!;
    const key = image.id + ":" + image.sha256;
    if (!distinct.has(key)) distinct.set(key, { ...image, faqId: answer.faqId });
  }
  const truncated = distinct.size > 3;
  return {
    images: [...distinct.values()].slice(0, 3),
    imageReplyStatus: truncated ? "limited" as const : "ready" as const,
    ...(truncated ? { imagesTruncated: true,
      message: [originalMessage, "Envie as demais perguntas separadamente para receber as imagens."].filter(Boolean).join("\n\n") } : {}),
  };
}
