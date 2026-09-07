import { useEffect } from "react";
import { trpc } from "@/lib/trpc";
import HomeTopBanner from "@/components/HomeTopBanner";

export default function HomeTopRuntimeEnhancer() {
  const { data: settings } = trpc.settings.getAll.useQuery();
  const enabled = settings?.home_top_enabled === "1" && Boolean(settings?.home_top_desktop_image_url?.trim());

  useEffect(() => {
    if (!enabled) {
      document.documentElement.classList.remove("h2-global-top-active");
      const hero = document.querySelector<HTMLElement>(".h2p-hero");
      if (hero) hero.style.removeProperty("display");
      return;
    }

    document.documentElement.classList.add("h2-global-top-active");

    const hideLegacyHomeHero = () => {
      const hero = document.querySelector<HTMLElement>(".h2p-hero");
      if (hero) hero.style.setProperty("display", "none", "important");
    };

    hideLegacyHomeHero();
    const observer = new MutationObserver(hideLegacyHomeHero);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      document.documentElement.classList.remove("h2-global-top-active");
      const hero = document.querySelector<HTMLElement>(".h2p-hero");
      if (hero) hero.style.removeProperty("display");
    };
  }, [enabled]);

  if (!enabled) return null;
  return <HomeTopBanner settings={settings} />;
}
