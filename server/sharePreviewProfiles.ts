import { getSettings } from "./db";

export const SHARE_PREVIEW_PROFILE_IDS = [
  "institutional",
  "tracking",
  "schedule",
  "quote",
  "receipt",
  "video",
  "tutorial",
  "app",
] as const;

export type SharePreviewProfileId = (typeof SHARE_PREVIEW_PROFILE_IDS)[number];

export type SharePreviewProfile = {
  id: SharePreviewProfileId;
  label: string;
  description: string;
  title: string;
  summary: string;
  imageUrl: string | null;
  imageType: string | null;
  imageVersion: string;
};

type SharePreviewDefaults = Omit<SharePreviewProfile, "imageVersion">;

const H2_SHIELD_IMAGE = "/h2-brand-512.png";

const PROFILE_DEFAULTS: Record<SharePreviewProfileId, SharePreviewDefaults> = {
  institutional: {
    id: "institutional",
    label: "Institucional",
    description: "Página inicial, acompanhamento, login e links públicos gerais.",
    title: "H2 COLOMBIANO",
    summary: "Atendimento rápido para motoristas de app.",
    imageUrl: H2_SHIELD_IMAGE,
    imageType: "image/png",
  },
  tracking: {
    id: "tracking",
    label: "Acompanhamento",
    description: "Link enviado pelo WhatsApp para acompanhar o pedido.",
    title: "Acompanhe seu pedido — H2 COLOMBIANO",
    summary: "Consulte o andamento do seu pedido com segurança.",
    imageUrl: H2_SHIELD_IMAGE,
    imageType: "image/png",
  },
  schedule: {
    id: "schedule",
    label: "Agendamento",
    description: "Links de agendamento e reagendamento.",
    title: "Agendamento — H2 COLOMBIANO",
    summary: "Escolha a melhor data e horário para seu atendimento.",
    imageUrl: H2_SHIELD_IMAGE,
    imageType: "image/png",
  },
  quote: {
    id: "quote",
    label: "Orçamento",
    description: "Links públicos de orçamento.",
    title: "Orçamento — H2 COLOMBIANO",
    summary: "Consulte os detalhes do seu orçamento.",
    imageUrl: H2_SHIELD_IMAGE,
    imageType: "image/png",
  },
  receipt: {
    id: "receipt",
    label: "Recibo",
    description: "Links públicos de recibo.",
    title: "Recibo — H2 COLOMBIANO",
    summary: "Consulte os detalhes do seu recibo.",
    imageUrl: H2_SHIELD_IMAGE,
    imageType: "image/png",
  },
  video: {
    id: "video",
    label: "Vídeos",
    description: "Links de vídeos publicados pelo ADM.",
    title: "Vídeo — H2 COLOMBIANO",
    summary: "Assista ao conteúdo enviado pela H2 Colômbia.",
    imageUrl: H2_SHIELD_IMAGE,
    imageType: "image/png",
  },
  tutorial: {
    id: "tutorial",
    label: "Tutorial",
    description: "Link público do tutorial em vídeo.",
    title: "Tutorial — H2 COLOMBIANO",
    summary: "Assista ao tutorial e siga as orientações.",
    imageUrl: H2_SHIELD_IMAGE,
    imageType: "image/png",
  },
  app: {
    id: "app",
    label: "App Android",
    description: "Páginas públicas de download dos aplicativos Android.",
    title: "App Android — H2 COLOMBIANO",
    summary: "Baixe o aplicativo H2 Colômbia.",
    imageUrl: H2_SHIELD_IMAGE,
    imageType: "image/png",
  },
};

function settingKey(profileId: SharePreviewProfileId, field: "title" | "summary" | "image_url" | "image_type" | "image_version") {
  return `share_preview_${profileId}_${field}`;
}

export function isSharePreviewProfileId(value: string): value is SharePreviewProfileId {
  return (SHARE_PREVIEW_PROFILE_IDS as readonly string[]).includes(value);
}

export function getSharePreviewProfileSettingKeys(profileId: SharePreviewProfileId) {
  return [
    settingKey(profileId, "title"),
    settingKey(profileId, "summary"),
    settingKey(profileId, "image_url"),
    settingKey(profileId, "image_type"),
    settingKey(profileId, "image_version"),
  ];
}

export function getAllSharePreviewSettingKeys() {
  return SHARE_PREVIEW_PROFILE_IDS.flatMap(getSharePreviewProfileSettingKeys);
}

export function defaultSharePreviewProfile(profileId: SharePreviewProfileId): SharePreviewProfile {
  return { ...PROFILE_DEFAULTS[profileId], imageVersion: "1" };
}

export function resolveSharePreviewProfileFromSettings(
  profileId: SharePreviewProfileId,
  settings: Record<string, string>,
): SharePreviewProfile {
  const fallback = defaultSharePreviewProfile(profileId);
  const configuredImage = settings[settingKey(profileId, "image_url")];
  const imageUrl = configuredImage === undefined ? fallback.imageUrl : (configuredImage || null);
  const configuredType = settings[settingKey(profileId, "image_type")];

  return {
    ...fallback,
    title: settings[settingKey(profileId, "title")] || fallback.title,
    summary: settings[settingKey(profileId, "summary")] || fallback.summary,
    imageUrl,
    imageType: imageUrl ? (configuredType || inferImageType(imageUrl)) : null,
    imageVersion: settings[settingKey(profileId, "image_version")] || fallback.imageVersion,
  };
}

export async function getSharePreviewProfile(profileId: SharePreviewProfileId): Promise<SharePreviewProfile> {
  const settings = await getSettings(getSharePreviewProfileSettingKeys(profileId));
  return resolveSharePreviewProfileFromSettings(profileId, settings);
}

export async function getSharePreviewProfiles(): Promise<Record<SharePreviewProfileId, SharePreviewProfile>> {
  const settings = await getSettings(getAllSharePreviewSettingKeys());
  return SHARE_PREVIEW_PROFILE_IDS.reduce((profiles, profileId) => {
    profiles[profileId] = resolveSharePreviewProfileFromSettings(profileId, settings);
    return profiles;
  }, {} as Record<SharePreviewProfileId, SharePreviewProfile>);
}

export function inferImageType(imageUrl: string): string {
  const normalized = imageUrl.toLowerCase().split("?")[0];
  if (normalized.endsWith(".png")) return "image/png";
  if (normalized.endsWith(".webp")) return "image/webp";
  if (normalized.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

export function sharePreviewProfileForPath(requestPath: string): SharePreviewProfileId {
  const pathname = `/${String(requestPath || "/").split("?")[0].replace(/^\/+/, "")}`;
  if (pathname === "/link/acompanhamento" || pathname === "/acompanhar") return "tracking";
  if (/^\/agendar\/[a-f0-9]{32}$/i.test(pathname)) return "schedule";
  if (/^\/orcamento\/[^/]+$/i.test(pathname)) return "quote";
  if (/^\/recibo\/[^/]+$/i.test(pathname)) return "receipt";
  if (pathname === "/video/tutorial") return "tutorial";
  if (/^\/video\/[^/]+$/i.test(pathname)) return "video";
  if (pathname === "/app" || pathname === "/app-pro") return "app";
  return "institutional";
}

export function sharePreviewProxyPath(profileId: SharePreviewProfileId): string {
  return `/share-preview/${profileId}`;
}

export const SHARE_PREVIEW_H2_SHIELD = H2_SHIELD_IMAGE;
