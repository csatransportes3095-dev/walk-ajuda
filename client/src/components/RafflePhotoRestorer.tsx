import { useEffect, useRef } from "react";

const RAFFLE_ADMIN_PATH = "/admin/raffles";
const RAFFLE_PUBLIC_PATH = "/sorteio";

type PhotoMap = Map<number, string>;

function currentPath() {
  return typeof window === "undefined" ? "" : window.location.pathname;
}

function imageFor(photoUrl: string, className: string, alt: string) {
  const image = document.createElement("img");
  image.src = photoUrl;
  image.alt = alt;
  image.className = className;
  image.loading = "lazy";
  image.referrerPolicy = "no-referrer";
  image.onerror = () => image.remove();
  return image;
}

async function fetchPhotoMap(raffleId: number): Promise<PhotoMap> {
  const response = await fetch(`/api/raffle-entry-photos/${raffleId}`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) return new Map();
  const payload = (await response.json()) as {
    entries?: Array<{ number: number; customerProfilePhotoUrl: string | null }>;
  };
  return new Map(
    (payload.entries || [])
      .filter((entry) => Boolean(entry.customerProfilePhotoUrl))
      .map((entry) => [Number(entry.number), String(entry.customerProfilePhotoUrl)]),
  );
}

function findAdminRaffleId(): number | null {
  const tRPCRequests = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
  for (let i = tRPCRequests.length - 1; i >= 0; i -= 1) {
    const url = tRPCRequests[i]?.name || "";
    if (!url.includes("raffles.getById")) continue;
    try {
      const parsed = new URL(url);
      const input = parsed.searchParams.get("input");
      if (!input) continue;
      const decoded = JSON.parse(input);
      const id = Number(decoded?.json?.id ?? decoded?.[0]?.json?.id);
      if (Number.isInteger(id) && id > 0) return id;
    } catch {
      // Ignorar recursos que não sejam a query do sorteio.
    }
  }
  return null;
}

async function findPublicRaffleId(): Promise<number | null> {
  try {
    const response = await fetch("/api/trpc/raffles.active?batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%7D%7D", {
      credentials: "include",
      cache: "no-store",
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const data = Array.isArray(payload) ? payload[0]?.result?.data?.json : payload?.result?.data?.json;
    const id = Number(data?.id);
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

function removeAdminReleaseControls() {
  document.querySelectorAll("button").forEach((button) => {
    if (button.textContent?.trim().toLowerCase() === "liberar") {
      const row = button.closest("tr");
      if (row?.closest("table")) button.remove();
    }
  });

  document.querySelectorAll("h3").forEach((heading) => {
    if (heading.textContent?.trim().toLowerCase().startsWith("liberar número")) {
      heading.closest(".fixed")?.remove();
    }
  });
}

function decorateAdminMap(photoMap: PhotoMap) {
  const labels = Array.from(document.querySelectorAll("p")).filter(
    (element) => element.textContent?.trim().toLowerCase() === "mapa de números:",
  );

  labels.forEach((label) => {
    const grid = label.nextElementSibling;
    if (!(grid instanceof HTMLElement)) return;

    Array.from(grid.children).forEach((cell) => {
      if (!(cell instanceof HTMLElement)) return;
      const number = Number(cell.textContent?.trim());
      if (!Number.isInteger(number)) return;
      const photoUrl = photoMap.get(number);
      if (!photoUrl || cell.querySelector("img[data-raffle-photo]")) return;

      cell.classList.add("relative", "overflow-hidden");
      const image = imageFor(photoUrl, "absolute inset-0 h-full w-full object-cover", `Foto do número ${number}`);
      image.dataset.rafflePhoto = "1";
      cell.prepend(image);

      const badge = document.createElement("span");
      badge.textContent = String(number);
      badge.className = "relative z-10 rounded bg-black/70 px-1 py-0.5 text-[10px] font-black text-white shadow";
      Array.from(cell.childNodes).forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) node.remove();
      });
      cell.appendChild(badge);
    });
  });
}

function decoratePublicGrid(photoMap: PhotoMap) {
  document.querySelectorAll("button").forEach((button) => {
    const text = button.textContent?.trim() || "";
    const number = Number(text);
    if (!Number.isInteger(number) || number < 1 || number > 100) return;
    const photoUrl = photoMap.get(number);
    if (!photoUrl || button.querySelector("img[data-raffle-photo]")) return;

    button.classList.add("relative", "overflow-hidden");
    const image = imageFor(photoUrl, "absolute inset-0 h-full w-full object-cover opacity-90", `Foto do número ${number}`);
    image.dataset.rafflePhoto = "1";
    button.prepend(image);

    const badge = document.createElement("span");
    badge.textContent = String(number);
    badge.className = "relative z-10 rounded bg-black/70 px-1 py-0.5 text-[10px] font-black text-white";
    Array.from(button.childNodes).forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) node.remove();
    });
    button.appendChild(badge);
  });
}

function decorateWinnerPhoto() {
  if (document.querySelector("img[data-raffle-winner-photo]")) return;

  const winnerCard = Array.from(document.querySelectorAll("div")).find((element) =>
    element.className.includes("from-yellow-500/20") && element.className.includes("to-orange-500/20"),
  );
  if (!(winnerCard instanceof HTMLElement)) return;

  const winnerNumberElement = Array.from(winnerCard.querySelectorAll("div")).find((element) =>
    /^#\d+$/.test(element.textContent?.trim() || ""),
  );
  const winnerNumber = Number(winnerNumberElement?.textContent?.replace("#", ""));
  if (!Number.isInteger(winnerNumber)) return;

  void fetchPhotoMapFromLatestResult(winnerNumber, winnerCard);
}

async function fetchPhotoMapFromLatestResult(winnerNumber: number, winnerCard: HTMLElement) {
  try {
    const response = await fetch("/api/trpc/raffles.result?batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%7D%7D", {
      credentials: "include",
      cache: "no-store",
    });
    if (!response.ok) return;
    const payload = await response.json();
    const result = Array.isArray(payload) ? payload[0]?.result?.data?.json : payload?.result?.data?.json;
    const photoUrl = result?.winnerProfilePhotoUrl;
    if (!photoUrl || Number(result?.winnerNumber) !== winnerNumber) return;

    const frame = document.createElement("div");
    frame.className = "mx-auto mb-4 h-28 w-28 overflow-hidden rounded-full border-4 border-yellow-400 shadow-2xl shadow-yellow-500/30";
    const image = imageFor(String(photoUrl), "h-full w-full object-cover", "Foto do ganhador");
    image.dataset.raffleWinnerPhoto = "1";
    frame.appendChild(image);
    winnerCard.prepend(frame);
  } catch {
    // A foto é um reforço visual; o resultado textual continua disponível.
  }
}

export default function RafflePhotoRestorer() {
  const lastRaffleIdRef = useRef<number | null>(null);
  const photoMapRef = useRef<PhotoMap>(new Map());

  useEffect(() => {
    const path = currentPath();
    if (path !== RAFFLE_ADMIN_PATH && path !== RAFFLE_PUBLIC_PATH) return;

    let disposed = false;
    let loading = false;

    const refresh = async () => {
      if (disposed || loading) return;
      loading = true;
      try {
        if (path === RAFFLE_ADMIN_PATH) removeAdminReleaseControls();
        if (path === RAFFLE_PUBLIC_PATH) decorateWinnerPhoto();

        const raffleId = path === RAFFLE_ADMIN_PATH ? findAdminRaffleId() : await findPublicRaffleId();
        if (raffleId && raffleId !== lastRaffleIdRef.current) {
          photoMapRef.current = await fetchPhotoMap(raffleId);
          lastRaffleIdRef.current = raffleId;
        } else if (raffleId) {
          // Atualiza periodicamente para que novos números recebam a foto sem refresh.
          photoMapRef.current = await fetchPhotoMap(raffleId);
        }

        if (path === RAFFLE_ADMIN_PATH) decorateAdminMap(photoMapRef.current);
        if (path === RAFFLE_PUBLIC_PATH) decoratePublicGrid(photoMapRef.current);
      } finally {
        loading = false;
      }
    };

    void refresh();
    const interval = window.setInterval(() => void refresh(), 2_500);
    const observer = new MutationObserver(() => {
      if (path === RAFFLE_ADMIN_PATH) {
        removeAdminReleaseControls();
        decorateAdminMap(photoMapRef.current);
      } else {
        decoratePublicGrid(photoMapRef.current);
        decorateWinnerPhoto();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      disposed = true;
      window.clearInterval(interval);
      observer.disconnect();
    };
  }, []);

  return null;
}
