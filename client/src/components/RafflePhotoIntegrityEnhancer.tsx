import { useEffect } from "react";

type PhotoEntry = { number: number; customerProfilePhotoUrl: string | null };
type PhotoMapResponse = { entries?: PhotoEntry[] };
type WinnerPhotoResponse = { winnerNumber: number | null; winnerProfilePhotoUrl: string | null };

function hideReleaseButtons() {
  if (!window.location.pathname.startsWith("/admin/raffles")) return;
  document.querySelectorAll("button").forEach((button) => {
    if (button.textContent?.trim().toLowerCase() === "liberar") {
      button.style.display = "none";
      button.setAttribute("aria-hidden", "true");
    }
  });
}

function findAdminNumberGrid(): HTMLElement | null {
  const labels = Array.from(document.querySelectorAll("p"));
  const label = labels.find((node) => node.textContent?.trim() === "Mapa de números:");
  const grid = label?.nextElementSibling;
  return grid instanceof HTMLElement ? grid : null;
}

function paintAdminPhotos(entries: PhotoEntry[]) {
  const grid = findAdminNumberGrid();
  if (!grid) return;
  const byNumber = new Map(entries.map((entry) => [entry.number, entry.customerProfilePhotoUrl]));

  Array.from(grid.children).forEach((child) => {
    if (!(child instanceof HTMLElement)) return;
    const number = Number(child.textContent?.trim());
    if (!Number.isInteger(number)) return;
    const photoUrl = byNumber.get(number);
    if (!photoUrl) return;

    child.style.position = "relative";
    child.style.overflow = "hidden";
    child.style.backgroundImage = `linear-gradient(rgba(0,0,0,.20), rgba(0,0,0,.42)), url("${photoUrl.replace(/"/g, "%22")}")`;
    child.style.backgroundSize = "cover";
    child.style.backgroundPosition = "center";
    child.style.color = "white";
    child.style.textShadow = "0 1px 4px rgba(0,0,0,.95)";
  });
}

function paintWinnerPhoto(data: WinnerPhotoResponse) {
  if (window.location.pathname !== "/sorteio" || !data.winnerProfilePhotoUrl) return;
  const heading = Array.from(document.querySelectorAll("h1, h2")).find((node) =>
    node.textContent?.trim().toUpperCase().includes("GANHADOR"),
  );
  if (!heading) return;

  const container = heading.parentElement;
  if (!container) return;
  const trophy = container.querySelector("svg");
  const circle = trophy?.parentElement;
  if (!(circle instanceof HTMLElement)) return;
  if (circle.dataset.raffleWinnerPhoto === data.winnerProfilePhotoUrl) return;

  circle.dataset.raffleWinnerPhoto = data.winnerProfilePhotoUrl;
  circle.style.position = "relative";
  circle.style.overflow = "hidden";
  circle.style.backgroundImage = `url("${data.winnerProfilePhotoUrl.replace(/"/g, "%22")}")`;
  circle.style.backgroundSize = "cover";
  circle.style.backgroundPosition = "center";
  if (trophy instanceof SVGElement) {
    trophy.style.position = "absolute";
    trophy.style.right = "4px";
    trophy.style.bottom = "4px";
    trophy.style.width = "28px";
    trophy.style.height = "28px";
    trophy.style.padding = "5px";
    trophy.style.borderRadius = "9999px";
    trophy.style.background = "rgba(0,0,0,.72)";
    trophy.style.zIndex = "2";
  }
}

export default function RafflePhotoIntegrityEnhancer() {
  useEffect(() => {
    let disposed = false;
    let adminPhotos: PhotoEntry[] = [];
    let winnerPhoto: WinnerPhotoResponse | null = null;

    const refresh = () => {
      hideReleaseButtons();
      if (adminPhotos.length) paintAdminPhotos(adminPhotos);
      if (winnerPhoto) paintWinnerPhoto(winnerPhoto);
    };

    const load = async () => {
      try {
        if (window.location.pathname.startsWith("/admin/raffles")) {
          const response = await fetch("/api/raffle-entry-photos/active", { credentials: "include", cache: "no-store" });
          if (response.ok) {
            const data = (await response.json()) as PhotoMapResponse;
            adminPhotos = data.entries || [];
          }
        }
        if (window.location.pathname === "/sorteio") {
          const response = await fetch("/api/raffle-winner-photo/latest", { credentials: "include", cache: "no-store" });
          if (response.ok) winnerPhoto = (await response.json()) as WinnerPhotoResponse;
        }
      } catch {
        // A tela original continua funcional mesmo se uma foto não carregar.
      }
      if (!disposed) refresh();
    };

    void load();
    const observer = new MutationObserver(refresh);
    observer.observe(document.body, { childList: true, subtree: true });
    const interval = window.setInterval(() => void load(), 8_000);

    return () => {
      disposed = true;
      observer.disconnect();
      window.clearInterval(interval);
    };
  }, []);

  return null;
}
