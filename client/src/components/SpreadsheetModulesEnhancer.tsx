import { useEffect } from "react";

const ENHANCED_CLASS = "h2-modules-enhanced";
const OPEN_CLASS = "h2-modules-open";

function buildLauncher(root: HTMLElement, strip: HTMLElement) {
  if (root.querySelector<HTMLElement>(":scope > .h2-modules-launcher")) return;

  root.classList.add(ENHANCED_CLASS);
  if (window.matchMedia("(min-width: 768px)").matches) root.classList.add(OPEN_CLASS);

  const launcher = document.createElement("button");
  launcher.type = "button";
  launcher.className = "h2-modules-launcher";
  launcher.setAttribute("aria-expanded", root.classList.contains(OPEN_CLASS) ? "true" : "false");
  launcher.setAttribute("aria-controls", "h2-spreadsheet-module-strip");
  strip.id ||= "h2-spreadsheet-module-strip";

  const icon = document.createElement("span");
  icon.className = "h2-modules-launcher-icon";
  icon.setAttribute("aria-hidden", "true");
  for (let index = 0; index < 4; index += 1) {
    const cell = document.createElement("i");
    cell.className = `h2-modules-icon-cell h2-modules-icon-cell-${index + 1}`;
    icon.appendChild(cell);
  }

  const copy = document.createElement("span");
  copy.className = "h2-modules-launcher-copy";

  const title = document.createElement("strong");
  title.textContent = "MÓDULOS DA PLANILHA";

  const meta = document.createElement("span");
  meta.className = "h2-modules-launcher-meta";

  const helper = document.createElement("span");
  helper.className = "h2-modules-helper";
  helper.textContent = "Toque para ver os serviços";

  const current = document.createElement("span");
  current.className = "h2-modules-current";
  current.setAttribute("aria-live", "polite");

  meta.append(helper, current);
  copy.append(title, meta);

  const colorRail = document.createElement("span");
  colorRail.className = "h2-modules-color-rail";
  colorRail.setAttribute("aria-hidden", "true");
  for (let index = 0; index < 5; index += 1) {
    const dot = document.createElement("i");
    dot.className = `h2-modules-dot h2-modules-dot-${index + 1}`;
    colorRail.appendChild(dot);
  }

  const chevron = document.createElement("span");
  chevron.className = "h2-modules-chevron";
  chevron.setAttribute("aria-hidden", "true");
  chevron.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  launcher.append(icon, copy, colorRail, chevron);
  root.insertBefore(launcher, root.firstChild);

  const syncActiveModule = () => {
    const active = strip.querySelector<HTMLElement>('[role="tab"][data-state="active"]');
    const label = active?.textContent?.replace(/NOVO/gi, "").trim() || "Gastos";
    current.textContent = label.toUpperCase();
  };

  const syncOpenState = () => {
    const open = root.classList.contains(OPEN_CLASS);
    launcher.setAttribute("aria-expanded", open ? "true" : "false");
    helper.textContent = open ? "Escolha o módulo abaixo" : "Toque para ver os serviços";
  };

  launcher.addEventListener("click", () => {
    root.classList.toggle(OPEN_CLASS);
    syncOpenState();
  });

  strip.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    if (!target?.closest('[role="tab"], button')) return;
    window.setTimeout(() => {
      syncActiveModule();
      if (window.matchMedia("(max-width: 767px)").matches) {
        root.classList.remove(OPEN_CLASS);
        syncOpenState();
      }
    }, 60);
  });

  const stripObserver = new MutationObserver(syncActiveModule);
  stripObserver.observe(strip, { subtree: true, attributes: true, attributeFilter: ["data-state"] });

  const media = window.matchMedia("(min-width: 768px)");
  const handleMediaChange = (event: MediaQueryListEvent) => {
    if (event.matches) root.classList.add(OPEN_CLASS);
    else root.classList.remove(OPEN_CLASS);
    syncOpenState();
  };
  media.addEventListener?.("change", handleMediaChange);

  syncActiveModule();
  syncOpenState();
}

export default function SpreadsheetModulesEnhancer() {
  useEffect(() => {
    const enhance = () => {
      if (!window.location.pathname.toLowerCase().startsWith("/gastos")) return;
      const root = document.getElementById("planilha-modulos");
      const strip = root?.querySelector<HTMLElement>(".spreadsheet-module-strip");
      if (!root || !strip) return;
      buildLauncher(root, strip);
    };

    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("popstate", enhance);

    return () => {
      observer.disconnect();
      window.removeEventListener("popstate", enhance);
    };
  }, []);

  return (
    <style>{`
      #planilha-modulos.${ENHANCED_CLASS} {
        position: relative;
      }

      #planilha-modulos .h2-modules-launcher {
        width: 100%;
        min-height: 96px;
        margin: 0 0 14px;
        padding: 14px 14px;
        display: grid;
        grid-template-columns: 52px minmax(0, 1fr) auto 48px;
        align-items: center;
        gap: 12px;
        position: relative;
        overflow: hidden;
        border: 1px solid rgba(88, 123, 190, .26);
        border-radius: 20px;
        color: #f8fafc;
        text-align: left;
        background:
          radial-gradient(circle at 10% 0%, rgba(50, 119, 255, .12), transparent 42%),
          linear-gradient(145deg, rgba(10, 18, 39, .97), rgba(6, 11, 27, .98));
        box-shadow:
          0 14px 34px rgba(0, 0, 0, .28),
          inset 0 1px 0 rgba(255, 255, 255, .055);
        transition: border-color .2s ease, box-shadow .2s ease, transform .16s ease;
        -webkit-tap-highlight-color: transparent;
      }

      #planilha-modulos .h2-modules-launcher::before {
        content: "";
        position: absolute;
        inset: 0 auto 0 0;
        width: 3px;
        background: linear-gradient(180deg, #22d3ee, #6366f1 52%, #a855f7);
        box-shadow: 0 0 16px rgba(34, 211, 238, .55);
      }

      #planilha-modulos .h2-modules-launcher::after {
        content: "";
        position: absolute;
        inset: 0;
        pointer-events: none;
        background: linear-gradient(110deg, rgba(255,255,255,.045), transparent 28% 72%, rgba(59,130,246,.035));
      }

      #planilha-modulos .h2-modules-launcher:active {
        transform: scale(.992);
      }

      #planilha-modulos.${OPEN_CLASS} .h2-modules-launcher {
        border-color: rgba(56, 189, 248, .48);
        box-shadow:
          0 14px 36px rgba(0, 0, 0, .3),
          0 0 0 1px rgba(56, 189, 248, .08),
          0 0 24px rgba(37, 99, 235, .08),
          inset 0 1px 0 rgba(255, 255, 255, .07);
      }

      #planilha-modulos .h2-modules-launcher-icon {
        width: 48px;
        height: 48px;
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        grid-template-rows: repeat(2, 1fr);
        gap: 4px;
        padding: 8px;
        border: 1px solid rgba(96, 165, 250, .28);
        border-radius: 15px;
        background: linear-gradient(145deg, rgba(31, 65, 125, .34), rgba(7, 15, 34, .72));
        box-shadow: inset 0 1px 0 rgba(255,255,255,.08), 0 0 18px rgba(37, 99, 235, .09);
      }

      #planilha-modulos .h2-modules-icon-cell {
        display: block;
        border-radius: 3px;
      }
      #planilha-modulos .h2-modules-icon-cell-1 { background: #34d399; box-shadow: 0 0 7px rgba(52,211,153,.32); }
      #planilha-modulos .h2-modules-icon-cell-2 { background: #60a5fa; box-shadow: 0 0 7px rgba(96,165,250,.32); }
      #planilha-modulos .h2-modules-icon-cell-3 { background: #c084fc; box-shadow: 0 0 7px rgba(192,132,252,.32); }
      #planilha-modulos .h2-modules-icon-cell-4 { background: #fbbf24; box-shadow: 0 0 7px rgba(251,191,36,.32); }

      #planilha-modulos .h2-modules-launcher-copy {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 5px;
      }

      #planilha-modulos .h2-modules-launcher-copy > strong {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: clamp(15px, 4vw, 18px);
        font-weight: 900;
        letter-spacing: .035em;
        line-height: 1.05;
        color: #fff;
      }

      #planilha-modulos .h2-modules-launcher-meta {
        min-width: 0;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 7px;
      }

      #planilha-modulos .h2-modules-helper {
        color: #94a3b8;
        font-size: 11.5px;
        font-weight: 600;
        line-height: 1.2;
      }

      #planilha-modulos .h2-modules-current {
        max-width: 120px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        padding: 3px 7px;
        border: 1px solid rgba(56, 189, 248, .24);
        border-radius: 999px;
        background: rgba(14, 165, 233, .08);
        color: #7dd3fc;
        font-size: 8.5px;
        font-weight: 900;
        letter-spacing: .08em;
        line-height: 1.2;
      }

      #planilha-modulos .h2-modules-color-rail {
        display: flex;
        gap: 4px;
        align-items: center;
        opacity: .78;
      }

      #planilha-modulos .h2-modules-dot {
        width: 5px;
        height: 20px;
        display: block;
        border-radius: 999px;
        opacity: .72;
      }
      #planilha-modulos .h2-modules-dot-1 { background: #10b981; }
      #planilha-modulos .h2-modules-dot-2 { background: #3b82f6; }
      #planilha-modulos .h2-modules-dot-3 { background: #8b5cf6; }
      #planilha-modulos .h2-modules-dot-4 { background: #f59e0b; }
      #planilha-modulos .h2-modules-dot-5 { background: #ef4444; }

      #planilha-modulos .h2-modules-chevron {
        width: 44px;
        height: 44px;
        display: grid;
        place-items: center;
        border: 1px solid rgba(148, 163, 184, .20);
        border-radius: 15px;
        color: #cbd5e1;
        background: linear-gradient(145deg, rgba(31, 41, 67, .78), rgba(17, 24, 39, .66));
        box-shadow: inset 0 1px 0 rgba(255,255,255,.055);
        transition: transform .24s ease, border-color .2s ease, color .2s ease;
      }

      #planilha-modulos .h2-modules-chevron svg {
        width: 21px;
        height: 21px;
      }

      #planilha-modulos.${OPEN_CLASS} .h2-modules-chevron {
        transform: rotate(180deg);
        border-color: rgba(56, 189, 248, .36);
        color: #7dd3fc;
      }

      #planilha-modulos .spreadsheet-module-strip {
        transform-origin: top center;
        transition: max-height .28s ease, opacity .2s ease, transform .24s ease, margin .24s ease;
      }

      @media (max-width: 767px) {
        #planilha-modulos.${ENHANCED_CLASS} .spreadsheet-module-strip {
          max-height: 0;
          margin-bottom: 0 !important;
          overflow: hidden;
          opacity: 0;
          pointer-events: none;
          transform: translateY(-7px) scale(.99);
        }

        #planilha-modulos.${ENHANCED_CLASS}.${OPEN_CLASS} .spreadsheet-module-strip {
          max-height: 440px;
          margin-bottom: 20px !important;
          opacity: 1;
          pointer-events: auto;
          transform: translateY(0) scale(1);
        }
      }

      @media (max-width: 430px) {
        #planilha-modulos .h2-modules-launcher {
          grid-template-columns: 48px minmax(0, 1fr) 44px;
          gap: 10px;
          min-height: 88px;
          padding: 12px;
          border-radius: 18px;
        }

        #planilha-modulos .h2-modules-launcher-icon {
          width: 44px;
          height: 44px;
          border-radius: 14px;
        }

        #planilha-modulos .h2-modules-color-rail {
          display: none;
        }

        #planilha-modulos .h2-modules-chevron {
          width: 42px;
          height: 42px;
          border-radius: 14px;
        }
      }

      @media (min-width: 768px) {
        #planilha-modulos .h2-modules-launcher {
          min-height: 82px;
          margin-bottom: 16px;
        }

        #planilha-modulos.${ENHANCED_CLASS} .spreadsheet-module-strip {
          max-height: none !important;
          opacity: 1 !important;
          pointer-events: auto !important;
          transform: none !important;
        }
      }
    `}</style>
  );
}
