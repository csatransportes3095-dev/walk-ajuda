import fs from 'node:fs';

function replaceOnce(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`Anchor not found: ${label}`);
  return source.replace(from, to);
}

// Backend: normalize optional HTTP(S) URLs before Zod validation.
{
  const path = 'server/routers/adCampaigns.ts';
  let src = fs.readFileSync(path, 'utf8');
  const anchor = `import { adCampaigns, adImpressions, spreadsheetSessions } from "../../drizzle/schema";\n`;
  const helper = `${anchor}\nconst normalizeCampaignUrlInput = (value: unknown): unknown => {\n  if (typeof value !== "string") return value;\n  const trimmed = value.trim();\n  if (!trimmed) return null;\n  if (/^https?:\\/\\//i.test(trimmed)) return trimmed;\n  if (/^\\/\\//.test(trimmed)) return \`https:\${trimmed}\`;\n  if (/^[a-z0-9.-]+\\.[a-z]{2,}(?::\\d+)?(?:[\\/?#]|$)/i.test(trimmed)) return \`https://\${trimmed}\`;\n  return trimmed;\n};\n\nconst campaignHttpUrlSchema = z.preprocess(\n  normalizeCampaignUrlInput,\n  z.string().url("URL inválida. Informe um endereço como https://h2colombiano.com").refine(\n    value => /^https?:\\/\\//i.test(value),\n    "A URL deve começar com http:// ou https://",\n  ).optional().nullable(),\n);\n`;
  src = replaceOnce(src, anchor, helper, 'backend url helper');
  src = src.replaceAll('imageUrl: z.string().url().optional().nullable(),', 'imageUrl: campaignHttpUrlSchema,');
  src = src.replaceAll('videoUrl: z.string().url().optional().nullable(),', 'videoUrl: campaignHttpUrlSchema,');
  src = src.replaceAll('linkUrl: z.string().url().optional().nullable(),', 'linkUrl: campaignHttpUrlSchema,');
  fs.writeFileSync(path, src);
}

// Frontend: normalize URLs, local datetime handling, friendly validation/messages.
{
  const path = 'client/src/pages/AdminAdCampaigns.tsx';
  let src = fs.readFileSync(path, 'utf8');
  const anchor = `const FREQUENCY_LABELS: Record<string, string> = {\n  once: "Apenas uma vez",\n  every_access: "A cada acesso",\n  every_reload: "A cada atualização",\n  custom: "Período personalizado",\n};\n`;
  const helper = `${anchor}\nfunction normalizeCampaignUrl(value: string): string {\n  const trimmed = value.trim();\n  if (!trimmed) return "";\n  if (/^https?:\\/\\//i.test(trimmed)) return trimmed;\n  if (/^\\/\\//.test(trimmed)) return \`https:\${trimmed}\`;\n  if (/^[a-z0-9.-]+\\.[a-z]{2,}(?::\\d+)?(?:[\\/?#]|$)/i.test(trimmed)) return \`https://\${trimmed}\`;\n  return trimmed;\n}\n\nfunction isValidCampaignHttpUrl(value: string): boolean {\n  if (!value) return true;\n  try {\n    const url = new URL(value);\n    return url.protocol === "http:" || url.protocol === "https:";\n  } catch {\n    return false;\n  }\n}\n\nfunction toDatetimeLocalValue(value: string | Date | null | undefined): string {\n  if (!value) return "";\n  const date = new Date(value);\n  if (Number.isNaN(date.getTime())) return "";\n  const pad = (n: number) => String(n).padStart(2, "0");\n  return \`${date.getFullYear()}-\${pad(date.getMonth() + 1)}-\${pad(date.getDate())}T\${pad(date.getHours())}:\${pad(date.getMinutes())}\`;\n}\n\nfunction localDatetimeToIso(value: string): string | null {\n  if (!value) return null;\n  const date = new Date(value);\n  return Number.isNaN(date.getTime()) ? null : date.toISOString();\n}\n\nfunction campaignSaveErrorMessage(error: unknown): string {\n  const message = error instanceof Error ? error.message : String(error || "");\n  if (/invalid_format|invalid url|url inválida/i.test(message)) return "Confira as URLs informadas. Use um endereço válido, por exemplo https://h2colombiano.com";\n  return message || "Não foi possível salvar a campanha.";\n}\n`;
  src = replaceOnce(src, anchor, helper, 'frontend helpers');

  src = replaceOnce(
    src,
    `      startsAt: c.startsAt ? (typeof c.startsAt === 'string' ? c.startsAt : new Date(c.startsAt as any).toISOString()).slice(0, 16) : "",\n      endsAt: c.endsAt ? (typeof c.endsAt === 'string' ? c.endsAt : new Date(c.endsAt as any).toISOString()).slice(0, 16) : "",`,
    `      startsAt: toDatetimeLocalValue(c.startsAt),\n      endsAt: toDatetimeLocalValue(c.endsAt),`,
    'edit datetime local',
  );

  const validationAnchor = `    if (form.type === "image" && !form.imageUrl.trim()) { toast({ title: "URL da imagem obrigatória", variant: "destructive" }); return; }\n    if (form.type === "video" && !form.videoUrl.trim()) { toast({ title: "URL do vídeo obrigatória", variant: "destructive" }); return; }\n    setSaving(true);\n    try {\n      const payload = {\n        ...form,\n        imageUrl: form.imageUrl || null,\n        videoUrl: form.videoUrl || null,\n        title: form.title || null,\n        description: form.description || null,\n        linkUrl: form.linkUrl || null,\n        frequencyMinutes: form.frequency === "custom" ? form.frequencyMinutes : null,\n        startsAt: form.startsAt || null,\n        endsAt: form.endsAt || null,`;
  const validationReplacement = `    if (form.type === "image" && !form.imageUrl.trim()) { toast({ title: "URL da imagem obrigatória", variant: "destructive" }); return; }\n    if (form.type === "video" && !form.videoUrl.trim()) { toast({ title: "URL do vídeo obrigatória", variant: "destructive" }); return; }\n\n    const normalizedImageUrl = normalizeCampaignUrl(form.imageUrl);\n    const normalizedVideoUrl = normalizeCampaignUrl(form.videoUrl);\n    const normalizedLinkUrl = normalizeCampaignUrl(form.linkUrl);\n    if (normalizedImageUrl && !isValidCampaignHttpUrl(normalizedImageUrl)) { toast({ title: "URL da imagem inválida", description: "Use um endereço completo, como https://...", variant: "destructive" }); return; }\n    if (normalizedVideoUrl && !isValidCampaignHttpUrl(normalizedVideoUrl)) { toast({ title: "URL do vídeo inválida", description: "Use um endereço http/https que entregue o vídeo diretamente.", variant: "destructive" }); return; }\n    if (normalizedLinkUrl && !isValidCampaignHttpUrl(normalizedLinkUrl)) { toast({ title: "Link de destino inválido", description: "Exemplo: https://h2colombiano.com", variant: "destructive" }); return; }\n\n    const startsAtIso = localDatetimeToIso(form.startsAt);\n    const endsAtIso = localDatetimeToIso(form.endsAt);\n    if (form.startsAt && !startsAtIso) { toast({ title: "Data de início inválida", variant: "destructive" }); return; }\n    if (form.endsAt && !endsAtIso) { toast({ title: "Data de término inválida", variant: "destructive" }); return; }\n    if (startsAtIso && endsAtIso && new Date(endsAtIso).getTime() <= new Date(startsAtIso).getTime()) {\n      toast({ title: "Período inválido", description: "A data de término precisa ser posterior à data de início.", variant: "destructive" });\n      return;\n    }\n\n    setSaving(true);\n    try {\n      const payload = {\n        ...form,\n        imageUrl: normalizedImageUrl || null,\n        videoUrl: normalizedVideoUrl || null,\n        title: form.title.trim() || null,\n        description: form.description.trim() || null,\n        linkUrl: normalizedLinkUrl || null,\n        frequencyMinutes: form.frequency === "custom" ? form.frequencyMinutes : null,\n        startsAt: startsAtIso,\n        endsAt: endsAtIso,`;
  src = replaceOnce(src, validationAnchor, validationReplacement, 'save validation');

  src = replaceOnce(
    src,
    `      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });`,
    `      toast({ title: "Erro ao salvar", description: campaignSaveErrorMessage(e), variant: "destructive" });`,
    'friendly save error',
  );

  src = replaceOnce(
    src,
    `<p className="text-xs text-gray-500 mt-1">Suporta MP4 direto, YouTube embed, etc.</p>`,
    `<p className="text-xs text-gray-500 mt-1">Use uma URL HTTP/HTTPS que entregue um vídeo reproduzível diretamente (ex.: MP4/WebM). Link de página ou YouTube comum não é reproduzido pelo player atual.</p>`,
    'video help text',
  );

  src = src.replace(
    `<Input value={form.linkUrl} onChange={e => setForm(f => ({ ...f, linkUrl: e.target.value }))} placeholder="https://..." className="bg-white/5 border-white/10 text-white" />`,
    `<Input value={form.linkUrl} onChange={e => setForm(f => ({ ...f, linkUrl: e.target.value }))} onBlur={() => setForm(f => ({ ...f, linkUrl: normalizeCampaignUrl(f.linkUrl) }))} placeholder="https://h2colombiano.com" className="bg-white/5 border-white/10 text-white" />`,
  );

  src = src.replace(
    `<Input value={form.imageUrl} onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))} placeholder="https://..." className="bg-white/5 border-white/10 text-white" />`,
    `<Input value={form.imageUrl} onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))} onBlur={() => setForm(f => ({ ...f, imageUrl: normalizeCampaignUrl(f.imageUrl) }))} placeholder="https://..." className="bg-white/5 border-white/10 text-white" />`,
  );

  src = src.replace(
    `<Input value={form.videoUrl} onChange={e => setForm(f => ({ ...f, videoUrl: e.target.value }))} placeholder="https://..." className="bg-white/5 border-white/10 text-white" />`,
    `<Input value={form.videoUrl} onChange={e => setForm(f => ({ ...f, videoUrl: e.target.value }))} onBlur={() => setForm(f => ({ ...f, videoUrl: normalizeCampaignUrl(f.videoUrl) }))} placeholder="https://..." className="bg-white/5 border-white/10 text-white" />`,
  );

  fs.writeFileSync(path, src);
}

// Regression test based on source contracts to catch accidental removal of the protections.
fs.writeFileSync('server/adCampaignFlowAudit.test.ts', `import { describe, expect, it } from "vitest";\nimport fs from "node:fs";\n\nconst router = fs.readFileSync("server/routers/adCampaigns.ts", "utf8");\nconst admin = fs.readFileSync("client/src/pages/AdminAdCampaigns.tsx", "utf8");\n\ndescribe("fluxo de campanhas ADM", () => {\n  it("normaliza URLs no backend antes da validacao", () => {\n    expect(router).toContain("normalizeCampaignUrlInput");\n    expect(router).toContain("linkUrl: campaignHttpUrlSchema");\n    expect(router).toContain("videoUrl: campaignHttpUrlSchema");\n  });\n\n  it("normaliza URLs e datas no formulario antes de salvar", () => {\n    expect(admin).toContain("normalizeCampaignUrl(form.linkUrl)");\n    expect(admin).toContain("localDatetimeToIso(form.startsAt)");\n    expect(admin).toContain("toDatetimeLocalValue(c.startsAt)");\n  });\n\n  it("impede termino anterior ao inicio e explica o contrato real do video", () => {\n    expect(admin).toContain("A data de término precisa ser posterior à data de início.");\n    expect(admin).toContain("Link de página ou YouTube comum não é reproduzido pelo player atual.");\n  });\n});\n`);

console.log('Ad campaign flow patch applied.');
