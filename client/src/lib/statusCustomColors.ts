import type { CSSProperties } from "react";

export type StatusColorSelection = {
  primary: string;
  secondary: string;
  split: boolean;
};

export const CUSTOM_STATUS_PREFIX = "custom:";

const LEGACY_TEXT_TO_HEX: Record<string, string> = {
  "text-blue-400": "#60a5fa",
  "text-emerald-400": "#34d399",
  "text-yellow-400": "#facc15",
  "text-orange-400": "#fb923c",
  "text-orange-300": "#fdba74",
  "text-amber-400": "#fbbf24",
  "text-amber-300": "#fcd34d",
  "text-purple-400": "#c084fc",
  "text-green-400": "#4ade80",
  "text-lime-400": "#a3e635",
  "text-teal-400": "#2dd4bf",
  "text-red-400": "#f87171",
  "text-pink-400": "#f472b6",
  "text-cyan-400": "#22d3ee",
  "text-gray-400": "#9ca3af",
  "text-zinc-300": "#d4d4d8",
};

export function normalizeHex(value: string | null | undefined, fallback = "#3b82f6"): string {
  const raw = String(value || "").trim();
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(raw)) {
    return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`.toLowerCase();
  }
  return fallback.toLowerCase();
}

export function isCustomStatusBackground(bgColor: string | null | undefined): boolean {
  return String(bgColor || "").startsWith(CUSTOM_STATUS_PREFIX);
}

export function parseStatusColorSelection(
  bgColor: string | null | undefined,
  legacyTextColor?: string | null,
): StatusColorSelection {
  const raw = String(bgColor || "");
  if (raw.startsWith(CUSTOM_STATUS_PREFIX)) {
    const values = raw.slice(CUSTOM_STATUS_PREFIX.length).split("|");
    const primary = normalizeHex(values[0]);
    const secondary = normalizeHex(values[1], "#ef4444");
    return { primary, secondary, split: values.length > 1 };
  }

  return {
    primary: LEGACY_TEXT_TO_HEX[String(legacyTextColor || "")] || "#3b82f6",
    secondary: "#ef4444",
    split: false,
  };
}

export function serializeStatusBackground(selection: StatusColorSelection): string {
  const primary = normalizeHex(selection.primary);
  if (!selection.split) return `${CUSTOM_STATUS_PREFIX}${primary}`;
  const secondary = normalizeHex(selection.secondary, "#ef4444");
  return `${CUSTOM_STATUS_PREFIX}${primary}|${secondary}`;
}

export function statusSelectionStyle(selection: StatusColorSelection): CSSProperties {
  const primary = normalizeHex(selection.primary);
  const secondary = normalizeHex(selection.secondary, "#ef4444");
  const background = selection.split
    ? `linear-gradient(90deg, ${primary} 0%, ${primary} 50%, ${secondary} 50%, ${secondary} 100%)`
    : primary;
  return {
    background,
    borderColor: primary,
    color: "#ffffff",
  };
}

export function getStatusInlineStyle(bgColor: string | null | undefined): CSSProperties | undefined {
  if (!isCustomStatusBackground(bgColor)) return undefined;
  return statusSelectionStyle(parseStatusColorSelection(bgColor));
}

function runtimeKey(key: string): string {
  const normalized = String(key || "status").toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  return normalized || "status";
}

export function getStatusRuntimeClasses(
  key: string,
  bgColor: string | null | undefined,
  textColor: string | null | undefined,
) {
  if (isCustomStatusBackground(bgColor)) {
    const suffix = runtimeKey(key);
    return {
      custom: true,
      bg: `h2-status-bg-${suffix}`,
      color: `h2-status-color-${suffix}`,
      border: `h2-status-border-${suffix}`,
    };
  }

  const legacyBg = String(bgColor || "bg-white/10");
  const border = legacyBg.match(/(?:^|\s)(border-[\w/-]+)/)?.[1] || "border-white/20";
  return {
    custom: false,
    bg: legacyBg,
    color: String(textColor || "text-white/60"),
    border,
  };
}

export function buildStatusRuntimeCss(
  statuses: Array<{ key: string; bgColor?: string | null }> | null | undefined,
): string {
  return (statuses || [])
    .filter((status) => isCustomStatusBackground(status.bgColor))
    .map((status) => {
      const suffix = runtimeKey(status.key);
      const selection = parseStatusColorSelection(status.bgColor);
      const primary = normalizeHex(selection.primary);
      const secondary = normalizeHex(selection.secondary, "#ef4444");
      const background = selection.split
        ? `linear-gradient(90deg, ${primary} 0%, ${primary} 50%, ${secondary} 50%, ${secondary} 100%)`
        : primary;
      return [
        `.h2-status-bg-${suffix}{background:${background}!important;background-color:${primary}!important;border-color:${primary}!important;}`,
        `.h2-status-color-${suffix}{color:#fff!important;}`,
        `.h2-status-border-${suffix}{border-color:${primary}!important;}`,
      ].join("");
    })
    .join("\n");
}
