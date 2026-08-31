import { useEffect, useState } from "react";

type PhotoEntry = { number: number; customerProfilePhotoUrl: string | null };
type PhotoMapResponse = { raffleId?: number | null; entries?: PhotoEntry[] };
type WinnerPhotoResponse = { winnerNumber: number | null; winnerProfilePhotoUrl: string | null };
type ReopenStatus = {
  canReopen: boolean;
  raffle: null | {
    id: number;
    title: string;
    status: string;
    winnerNumber: number | null;
    winnerName: string | null;
  };
};

function hideReleaseButtons() {
  if (!window.location.pathname.startsWith("/admin/raffles")) return;
  document.querySelectorAll("button").forEach((button) => {
    if (button.textContent?.trim().toLowerCase() === "liberar") {
      button.style.display = "none";
      button.setAttribute("aria-hidden", "true");
      button.setAttribute("tabindex", "-1");
    }
  });
}

function paintNumberCells(entries: PhotoEntry[], scope: "admin" | "public") {
  const byNumber = new Map(entries.map((entry) => [Number(entry.number), entry.customerProfilePhotoUrl]));

  if (scope === "admin") {
    const labels = Array.from(document.querySelectorAll("p")).filter(
      (node) => node.textContent?.trim().toLowerCase() === "mapa de números:",
    );
    labels.forEach((label) => {
      const grid = label.nextElementSibling;
      if (!(grid instanceof HTMLElement)) return;
      Array.from(grid.children).forEach((cell) => {
        if (!(cell instanceof HTMLElement)) return;
        const number = Number(cell.textContent?.trim());
        const photoUrl = byNumber.get(number);
        if (!Number.isInteger(number) || !photoUrl) return;
        cell.style.backgroundImage = `linear-gradient(rgba(0,0,0,.18), rgba(0,0,0,.50)), url("${photoUrl.replace(/"/g, "%22")}")`;
        cell.style.backgroundSize = "cover";
        cell.style.backgroundPosition = "center";
        cell.style.color = "white";
        cell.style.textShadow = "0 1px 5px rgba(0,0,0,.95)";
      });
    });
    return;
  }

  document.querySelectorAll("button").forEach((button) => {
    const number = Number(button.textContent?.trim());
    const photoUrl = byNumber.get(number);
    if (!Number.isInteger(number) || number < 1 || number > 100 || !photoUrl) return;
    button.style.backgroundImage = `linear-gradient(rgba(0,0,0,.18), rgba(0,0,0,.55)), url("${photoUrl.replace(/"/g, "%22")}")`;
    button.style.backgroundSize = "cover";
    button.style.backgroundPosition = "center";
    button.style.color = "white";
    button.style.textShadow = "0 1px 5px rgba(0,0,0,.95)";
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
  const [reopenStatus, setReopenStatus] = useState<ReopenStatus | null>(null);
  const [reopening, setReopening] = useState(false);
  const [reopenError, setReopenError] = useState("");

  useEffect(() => {
    let disposed = false;
    let photos: PhotoEntry[] = [];
    let winnerPhoto: WinnerPhotoResponse | null = null;

    const refreshStyles = () => {
      const path = window.location.pathname;
      if (path.startsWith("/admin/raffles")) {
        hideReleaseButtons();
        if (photos.length) paintNumberCells(photos, "admin");
      }
      if (path === "/sorteio") {
        if (photos.length) paintNumberCells(photos, "public");
        if (winnerPhoto) paintWinnerPhoto(winnerPhoto);
      }
    };

    const load = async () => {
      const path = window.location.pathname;
      try {
        if (path.startsWith("/admin/raffles")) {
          const [photoResponse, reopenResponse] = await Promise.all([
            fetch("/api/raffle-entry-photos/active", { credentials: "include", cache: "no-store" }),
            fetch("/api/admin/raffle/reopen-status", { credentials: "include", cache: "no-store" }),
          ]);
          if (photoResponse.ok) {
            const data = (await photoResponse.json()) as PhotoMapResponse;
            photos = data.entries || [];
          }
          if (reopenResponse.ok && !disposed) {
            setReopenStatus((await reopenResponse.json()) as ReopenStatus);
          }
        } else if (path === "/sorteio") {
          const activeResponse = await fetch("/api/raffle-entry-photos/active", {
            credentials: "include",
            cache: "no-store",
          });
          if (activeResponse.ok) {
            const data = (await activeResponse.json()) as PhotoMapResponse;
            photos = data.entries || [];
          }
          const winnerResponse = await fetch("/api/raffle-winner-photo/latest", {
            credentials: "include",
            cache: "no-store",
          });
          if (winnerResponse.ok) winnerPhoto = (await winnerResponse.json()) as WinnerPhotoResponse;
        }
      } catch {
        // Falha de foto nunca derruba o sorteio.
      }
      if (!disposed) refreshStyles();
    };

    void load();
    const observer = new MutationObserver(refreshStyles);
    observer.observe(document.body, { childList: true, subtree: true });
    const interval = window.setInterval(() => void load(), 6_000);

    return () => {
      disposed = true;
      observer.disconnect();
      window.clearInterval(interval);
    };
  }, []);

  const reopen = async () => {
    const raffle = reopenStatus?.raffle;
    if (!raffle || !reopenStatus?.canReopen || reopening) return;
    const confirmed = window.confirm(
      `Reabrir o sorteio "${raffle.title}" para sortear novamente?\n\nTodos os números e participantes serão preservados. Apenas o resultado anterior será limpo.`,
    );
    if (!confirmed) return;

    setReopening(true);
    setReopenError("");
    try {
      const response = await fetch("/api/admin/raffle/reopen", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raffleId: raffle.id }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Não foi possível reabrir o sorteio.");
      }
      window.location.reload();
    } catch (error) {
      setReopenError(error instanceof Error ? error.message : "Erro ao reabrir sorteio.");
      setReopening(false);
    }
  };

  if (!window.location.pathname.startsWith("/admin/raffles") || !reopenStatus?.canReopen || !reopenStatus.raffle) {
    return null;
  }

  return (
    <div className="fixed bottom-5 right-5 z-[9999] w-[min(92vw,360px)] rounded-2xl border border-yellow-500/50 bg-[#11111b]/95 p-4 shadow-2xl backdrop-blur-md">
      <p className="text-sm font-black text-yellow-300">Sorteio marcado como realizado</p>
      <p className="mt-1 text-xs text-white/65">
        O resultado anterior pode ser limpo sem apagar nenhum número nem participante.
      </p>
      {reopenError && <p className="mt-2 text-xs font-semibold text-red-400">{reopenError}</p>}
      <button
        type="button"
        onClick={reopen}
        disabled={reopening}
        className="mt-3 w-full rounded-xl bg-yellow-500 px-4 py-3 text-sm font-black text-black transition hover:bg-yellow-400 disabled:opacity-60"
      >
        {reopening ? "REABRINDO..." : "REABRIR PARA SORTEAR DE NOVO"}
      </button>
    </div>
  );
}
