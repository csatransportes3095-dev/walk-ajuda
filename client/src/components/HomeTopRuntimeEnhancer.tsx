import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { trpc } from "@/lib/trpc";
import HomeTopBanner from "@/components/HomeTopBanner";

export default function HomeTopRuntimeEnhancer() {
  const isHome = typeof window !== "undefined" && window.location.pathname === "/";
  const { data: settings } = trpc.settings.getAll.useQuery(undefined, { enabled: isHome });
  const [host, setHost] = useState<HTMLElement | null>(null);

  const enabled = isHome && settings?.home_top_enabled === "1" && Boolean(settings?.home_top_desktop_image_url?.trim());

  useEffect(() => {
    if (!enabled) {
      const existing = document.getElementById("h2-home-top-runtime-host");
      existing?.remove();
      const hero = document.querySelector<HTMLElement>(".h2p-hero");
      if (hero) hero.style.display = "";
      setHost(null);
      return;
    }

    let disposed = false;

    const apply = () => {
      if (disposed) return;
      const hero = document.querySelector<HTMLElement>(".h2p-hero");
      if (!hero || !hero.parentElement) return;

      let portalHost = document.getElementById("h2-home-top-runtime-host") as HTMLElement | null;
      if (!portalHost) {
        portalHost = document.createElement("div");
        portalHost.id = "h2-home-top-runtime-host";
        portalHost.style.width = "100%";
        hero.parentElement.insertBefore(portalHost, hero);
      }

      hero.style.display = "none";
      setHost(portalHost);
    };

    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      disposed = true;
      observer.disconnect();
      const hero = document.querySelector<HTMLElement>(".h2p-hero");
      if (hero) hero.style.display = "";
      document.getElementById("h2-home-top-runtime-host")?.remove();
      setHost(null);
    };
  }, [enabled]);

  if (!enabled || !host) return null;
  return createPortal(<HomeTopBanner settings={settings} />, host);
}
