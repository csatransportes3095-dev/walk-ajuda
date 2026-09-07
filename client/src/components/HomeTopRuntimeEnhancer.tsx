import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { trpc } from "@/lib/trpc";
import HomeTopBanner from "@/components/HomeTopBanner";

const HOME_TOP_MOUNT_ATTR = "data-h2-home-top-mount";

export default function HomeTopRuntimeEnhancer() {
  const { data: settings } = trpc.settings.getAll.useQuery();
  const [isHome, setIsHome] = useState(() => typeof window !== "undefined" && window.location.pathname === "/");
  const [homeMount, setHomeMount] = useState<HTMLElement | null>(null);
  const enabled = settings?.home_top_enabled === "1" && Boolean(settings?.home_top_desktop_image_url?.trim());

  useEffect(() => {
    const syncPath = () => setIsHome(window.location.pathname === "/");
    syncPath();
    window.addEventListener("popstate", syncPath);
    const timer = window.setInterval(syncPath, 500);
    return () => {
      window.removeEventListener("popstate", syncPath);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const removeHomeMount = () => {
      document.querySelectorAll<HTMLElement>(`[${HOME_TOP_MOUNT_ATTR}="1"]`).forEach((node) => node.remove());
      setHomeMount(null);
    };

    const restoreHero = () => {
      const hero = document.querySelector<HTMLElement>(".h2p-hero");
      if (hero) hero.style.removeProperty("display");
    };

    if (!enabled) {
      document.documentElement.classList.remove("h2-global-top-active");
      restoreHero();
      removeHomeMount();
      return;
    }

    document.documentElement.classList.add("h2-global-top-active");

    if (!isHome) {
      restoreHero();
      removeHomeMount();
      return () => document.documentElement.classList.remove("h2-global-top-active");
    }

    const syncHomeTop = () => {
      const page = document.querySelector<HTMLElement>(".h2p-page");
      if (!page) return;

      const hero = page.querySelector<HTMLElement>(":scope > .h2p-hero");
      if (hero) hero.style.setProperty("display", "none", "important");

      const services = page.querySelector<HTMLElement>(":scope > .h2p-services");
      if (!services) return;

      let mount = page.querySelector<HTMLElement>(`:scope > [${HOME_TOP_MOUNT_ATTR}="1"]`);
      if (!mount) {
        mount = document.createElement("div");
        mount.setAttribute(HOME_TOP_MOUNT_ATTR, "1");
        mount.style.width = "100%";
        mount.style.display = "block";
        services.before(mount);
      }

      setHomeMount((current) => current === mount ? current : mount);
    };

    syncHomeTop();
    const observer = new MutationObserver(syncHomeTop);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      document.documentElement.classList.remove("h2-global-top-active");
      restoreHero();
      removeHomeMount();
    };
  }, [enabled, isHome]);

  if (!enabled) return null;

  const banner = <HomeTopBanner settings={settings} />;

  // Na home premium o banner precisa ocupar exatamente o antigo espaço do hero.
  // Enquanto o ponto de montagem ainda não existe, não renderizamos como sibling,
  // evitando que a imagem apareça acidentalmente depois do rodapé.
  if (isHome) return homeMount ? createPortal(banner, homeMount) : null;

  // Nas demais páginas continua sendo um topo global antes do conteúdo do App.
  return banner;
}
