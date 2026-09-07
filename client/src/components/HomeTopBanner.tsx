import type { CSSProperties } from "react";
import "../home-top-banner.css";

type SettingsMap = Record<string, string | undefined>;

export default function HomeTopBanner({ settings }: { settings?: SettingsMap }) {
  const enabled = settings?.home_top_enabled === "1";
  const desktopImage = settings?.home_top_desktop_image_url?.trim() || "";
  const mobileImage = settings?.home_top_mobile_image_url?.trim() || desktopImage;
  const link = settings?.home_top_link_url?.trim() || "";
  const openNewTab = settings?.home_top_open_new_tab === "1";
  const desktopHeight = Math.max(180, Math.min(900, Number(settings?.home_top_desktop_height) || 420));
  const mobileHeight = Math.max(140, Math.min(700, Number(settings?.home_top_mobile_height) || 250));

  if (!enabled || !desktopImage) return null;

  const style = {
    "--home-top-desktop-height": `${desktopHeight}px`,
    "--home-top-mobile-height": `${mobileHeight}px`,
  } as CSSProperties;

  const content = (
    <div className="h2-home-top-banner" style={style}>
      <picture>
        {mobileImage && <source media="(max-width: 768px)" srcSet={mobileImage} />}
        <img src={desktopImage} alt="Topo H2 Colombiano" />
      </picture>
    </div>
  );

  if (!link) return content;

  return (
    <a
      href={link}
      target={openNewTab ? "_blank" : undefined}
      rel={openNewTab ? "noopener noreferrer" : undefined}
      className="h2-home-top-link"
    >
      {content}
    </a>
  );
}
