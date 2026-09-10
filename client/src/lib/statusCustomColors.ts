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

type Rgb = { r: number; g: number; b: number };

export function normalizeHex(value: string | null | undefined, fallback = "#3b82f6"): string {
  const raw = String(value || "").trim();
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(raw)) {
    return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`.toLowerCase();
  }
  return fallback.toLowerCase();
}

function hexToRgb(value: string): Rgb {
  const hex = normalizeHex(value).slice(1);
  const number = Number.parseInt(hex, 16);
  return {
    r: (number >> 16) & 255,
    g: (number >> 8) & 255,
    b: number & 255,
  };
}

function rgba(value: string, alpha: number): string {
  const { r, g, b } = hexToRgb(value);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function perceivedBrightness(rgb: Rgb): number {
  return (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
}

export function getReadableStatusTextColor(primaryValue: string, secondaryValue?: string): "#111111" | "#ffffff" {
  const primary = hexToRgb(primaryValue);
  const secondary = secondaryValue ? hexToRgb(secondaryValue) : primary;
  const average: Rgb = {
    r: Math.round((primary.r + secondary.r) / 2),
    g: Math.round((primary.g + secondary.g) / 2),
    b: Math.round((primary.b + secondary.b) / 2),
  };

  return perceivedBrightness(average) >= 158 ? "#111111" : "#ffffff";
}

function buildGlassBackground(primary: string, secondary: string | undefined): string {
  const end = secondary || primary;
  return [
    "linear-gradient(120deg, rgba(255,255,255,.28) 0%, rgba(255,255,255,.10) 18%, rgba(255,255,255,0) 43%, rgba(255,255,255,.08) 72%, rgba(255,255,255,0) 100%)",
    `linear-gradient(135deg, ${rgba(primary, 0.92)} 0%, ${rgba(end, 0.92)} 100%)`,
  ].join(", ");
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
  const activeSecondary = selection.split ? secondary : undefined;
  const textColor = getReadableStatusTextColor(primary, activeSecondary);

  return {
    background: buildGlassBackground(primary, activeSecondary),
    backgroundColor: primary,
    borderColor: rgba(primary, 0.92),
    color: textColor,
    textShadow: textColor === "#ffffff"
      ? "0 1px 2px rgba(0,0,0,.72), 0 0 8px rgba(0,0,0,.24)"
      : "0 1px 1px rgba(255,255,255,.58), 0 0 8px rgba(255,255,255,.18)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,.30), inset 0 -1px 0 rgba(255,255,255,.08), 0 10px 28px rgba(0,0,0,.24)",
    backdropFilter: "blur(12px) saturate(130%)",
    WebkitBackdropFilter: "blur(12px) saturate(130%)",
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
      const activeSecondary = selection.split ? secondary : undefined;
      const textColor = getReadableStatusTextColor(primary, activeSecondary);
      const background = buildGlassBackground(primary, activeSecondary);
      const textShadow = textColor === "#ffffff"
        ? "0 1px 2px rgba(0,0,0,.72),0 0 8px rgba(0,0,0,.24)"
        : "0 1px 1px rgba(255,255,255,.58),0 0 8px rgba(255,255,255,.18)";

      return [
        `.h2-status-bg-${suffix}{background:${background}!important;background-color:${primary}!important;border-color:${rgba(primary, 0.92)}!important;color:${textColor}!important;text-shadow:${textShadow}!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.30),inset 0 -1px 0 rgba(255,255,255,.08),0 10px 28px rgba(0,0,0,.24)!important;-webkit-backdrop-filter:blur(12px) saturate(130%);backdrop-filter:blur(12px) saturate(130%);}`,
        `.h2-status-bg-${suffix} *{color:inherit;}`,
        `.h2-status-color-${suffix}{color:${textColor}!important;text-shadow:${textShadow}!important;}`,
        `.h2-status-border-${suffix}{border-color:${rgba(primary, 0.92)}!important;}`,
      ].join("");
    })
    .join("\n");
}
