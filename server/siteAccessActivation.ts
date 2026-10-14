import type { SiteAccessMode } from "./siteAccessPolicy";

export type ActivationConfiguration = {
  enforced: boolean;
  ownerPresent: boolean;
  secretLength: number;
};

/**
 * A lockdown cannot be enabled just because its DB tables exist.
 * It requires a verified owner, a dedicated signing secret, and the
 * independently controlled Express gateway to be switched on.
 */
export function modeActivationFailure(
  mode: SiteAccessMode,
  configuration: ActivationConfiguration,
): string | null {
  if (mode === "public") return null;
  if (!configuration.ownerPresent) return "Proprietário do site não configurado no servidor.";
  if (configuration.secretLength < 32) return "Segredo dedicado de acesso não configurado corretamente.";
  if (!configuration.enforced) return "Ative e teste a proteção do servidor antes de restringir o site.";
  return null;
}

export function configuredActivationState(): ActivationConfiguration {
  return {
    enforced: process.env.H2_SITE_ACCESS_ENFORCE === "true",
    ownerPresent: Boolean(process.env.H2_SITE_SECURITY_OWNER?.trim()),
    secretLength: (process.env.H2_SITE_ACCESS_SECRET || "").length,
  };
}
