import { useEffect } from "react";

const ENHANCED_CLASS = "h2-modules-enhanced";
const OPEN_CLASS = "h2-modules-open";
const LAUNCHER_CLASS = "h2-modules-launcher";

function buildLauncher(root: HTMLElement, strip: HTMLElement) {
  if (root.querySelector<HTMLElement>(`:scope > .${LAUNCHER_CLASS}`)) return;

  root.classList.add(ENHANCED_CLASS);
  root.classList.remove(OPEN_CLASS);

  strip.id ||= "h2-spreadsheet-module-strip";

  const launcher = document.createElement("button");
  launcher.type = "button";
  launcher.className = LAUNCHER_CLASS;
  launcher.setAttribute("aria-expanded", "false");
  launcher.setAttribute("aria-controls", strip.id);
  launcher.setAttribute("aria-label", "Abrir módulos da planilha");

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
  helper.textContent = "Toque para abrir";

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
    current.textContent = `ATUAL: ${label.toUpperCase()}`;
  };

  const syncOpenState = () => {
    const open = root.classList.contains(OPEN_CLASS);
    launcher.setAttribute("aria-expanded", open ? "true" : "false");
    launcher.setAttribute("aria-label", open ? "Fechar módulos da planilha" : "Abrir módulos da planilha");
    helper.textContent = open ? "Escolha um módulo abaixo" : "Toque para abrir";
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
      root.classList.remove(OPEN_CLASS);
      syncOpenState();
    }, 80);
  });

  const stripObserver = new MutationObserver(syncActiveModule);
  stripObserver.observe(strip, { subtree: true, attributes: true, attributeFilter: ["data-state"] });

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
        margin-bottom: 4px;
      }

      #planilha-modulos .h2-modules-launcher {
        width: 100%;
        min-height: 90px;
        margin: 0;
        padding: 13px 14px;
        display: grid;
        grid-template-columns: 50px minmax(0, 1fr) auto 44px;
        align-items: center;
        gap: 11px;
        position: relative;
        z-index: 2;
        overflow: hidden;
        border: 1px solid rgba(88, 123, 190, .30);
        border-radius: 20px;
        color: #f8fafc;
        text-align: left;
        background:
          radial-gradient(circle at 8% -12%, rgba(46, 127, 255, .18), transparent 45%),
          linear-gradient(145deg, rgba(10, 18, 39, .99), rgba(5, 10, 25, .99));
        box-shadow:
          0 14px 34px rgba(0, 0, 0, .30),
          inset 0 1px 0 rgba(255, 255, 255, .065);
        transition: border-color .22s ease, box-shadow .22s ease, border-radius .22s ease, transform .16s ease;
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
        background: linear-gradient(110deg, rgba(255,255,255,.045), transparent 28% 72%, rgba(59,130,246,.04));
      }

      #planilha-modulos .h2-modules-launcher:active {
        transform: scale(.992);
      }

      #planilha-modulos.${OPEN_CLASS} .h2-modules-launcher {
        border-color: rgba(56, 189, 248, .52);
        border-bottom-left-radius: 0;
        border-bottom-right-radius: 0;
        box-shadow:
          0 10px 26px rgba(0, 0, 0, .28),
          0 0 0 1px rgba(56, 189, 248, .08),
          0 0 24px rgba(37, 99, 235, .10),
          inset 0 1px 0 rgba(255, 255, 255, .07);
      }

      #planilha-modulos .h2-modules-launcher-icon {
        width: 46px;
        height: 46px;
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        grid-template-rows: repeat(2, 1fr);
        gap: 4px;
        padding: 8px;
        border: 1px solid rgba(96, 165, 250, .30);
        border-radius: 14px;
        background: linear-gradient(145deg, rgba(31, 65, 125, .36), rgba(7, 15, 34, .74));
        box-shadow: inset 0 1px 0 rgba(255,255,255,.08), 0 0 18px rgba(37, 99, 235, .10);
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
        gap: 6px;
      }

      #planilha-modulos .h2-modules-launcher-copy > strong {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: clamp(14px, 3.8vw, 18px);
        font-weight: 900;
        letter-spacing: .025em;
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
        font-size: 11px;
        font-weight: 650;
        line-height: 1.2;
      }

      #planilha-modulos .h2-modules-current {
        max-width: 150px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        padding: 3px 7px;
        border: 1px solid rgba(56, 189, 248, .25);
        border-radius: 999px;
        background: rgba(14, 165, 233, .09);
        color: #7dd3fc;
        font-size: 8.5px;
        font-weight: 900;
        letter-spacing: .065em;
        line-height: 1.2;
      }

      #planilha-modulos .h2-modules-color-rail {
        display: flex;
        gap: 4px;
        align-items: center;
        opacity: .82;
      }

      #planilha-modulos .h2-modules-dot {
        width: 5px;
        height: 20px;
        display: block;
        border-radius: 999px;
        opacity: .76;
      }
      #planilha-modulos .h2-modules-dot-1 { background: #10b981; }
      #planilha-modulos .h2-modules-dot-2 { background: #3b82f6; }
      #planilha-modulos .h2-modules-dot-3 { background: #8b5cf6; }
      #planilha-modulos .h2-modules-dot-4 { background: #f59e0b; }
      #planilha-modulos .h2-modules-dot-5 { background: #ef4444; }

      #planilha-modulos .h2-modules-chevron {
        width: 42px;
        height: 42px;
        display: grid;
        place-items: center;
        border: 1px solid rgba(148, 163, 184, .22);
        border-radius: 14px;
        color: #cbd5e1;
        background: linear-gradient(145deg, rgba(31, 41, 67, .80), rgba(17, 24, 39, .68));
        box-shadow: inset 0 1px 0 rgba(255,255,255,.055);
        transition: transform .24s ease, border-color .2s ease, color .2s ease;
      }

      #planilha-modulos .h2-modules-chevron svg {
        width: 20px;
        height: 20px;
      }

      #planilha-modulos.${OPEN_CLASS} .h2-modules-chevron {
        transform: rotate(180deg);
        border-color: rgba(56, 189, 248, .40);
        color: #7dd3fc;
      }

      /*
       * A grade antiga não fica mais solta na página.
       * São os mesmos cards reais do SpreadsheetPage, agora recolhidos
       * e exibidos como corpo do novo seletor.
       */
      #planilha-modulos.${ENHANCED_CLASS} .spreadsheet-module-strip {
        max-height: 0;
        min-height: 0 !important;
        margin: 0 !important;
        padding: 0 13px !important;
        overflow: hidden;
        opacity: 0;
        pointer-events: none;
        transform: translateY(-8px);
        transform-origin: top center;
        border: 0 solid rgba(56, 189, 248, .26);
        border-top: 0;
        border-radius: 0 0 20px 20px;
        background:
          radial-gradient(circle at 15% 0%, rgba(37, 99, 235, .10), transparent 45%),
          linear-gradient(180deg, rgba(7, 14, 32, .99), rgba(4, 9, 22, .99));
        box-shadow: none;
        transition:
          max-height .30s ease,
          opacity .20s ease,
          transform .25s ease,
          padding .25s ease,
          border-width .20s ease,
          margin .25s ease;
      }

      #planilha-modulos.${ENHANCED_CLASS}.${OPEN_CLASS} .spreadsheet-module-strip {
        max-height: 620px;
        margin: 0 0 18px !important;
        padding: 14px 13px 15px !important;
        opacity: 1;
        pointer-events: auto;
        transform: translateY(0);
        border-width: 0 1px 1px;
        box-shadow:
          0 16px 34px rgba(0,0,0,.24),
          inset 0 1px 0 rgba(255,255,255,.025);
      }

      @media (max-width: 520px) {
        #planilha-modulos .h2-modules-launcher {
          grid-template-columns: 46px minmax(0, 1fr) 42px;
          gap: 9px;
          min-height: 84px;
          padding: 11px 12px;
          border-radius: 18px;
        }

        #planilha-modulos.${OPEN_CLASS} .h2-modules-launcher {
          border-bottom-left-radius: 0;
          border-bottom-right-radius: 0;
        }

        #planilha-modulos .h2-modules-launcher-icon {
          width: 42px;
          height: 42px;
          border-radius: 13px;
        }

        #planilha-modulos .h2-modules-color-rail {
          display: none;
        }

        #planilha-modulos .h2-modules-chevron {
          width: 40px;
          height: 40px;
          border-radius: 13px;
        }

        #planilha-modulos.${ENHANCED_CLASS}.${OPEN_CLASS} .spreadsheet-module-strip {
          max-height: 540px;
          padding: 12px 10px 13px !important;
        }
      }
    `}</style>
  );
}
