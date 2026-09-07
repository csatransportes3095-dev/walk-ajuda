import { useEffect } from "react";
import { toast } from "sonner";

const COPY_ATTR = "data-h2-login-copy";

function normalizeText(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function findInputNearLabel(label: HTMLLabelElement) {
  const ownFor = label.getAttribute("for");
  if (ownFor) {
    const byId = document.getElementById(ownFor);
    if (byId instanceof HTMLInputElement) return byId;
  }

  let node: HTMLElement | null = label.parentElement;
  for (let depth = 0; node && depth < 4; depth += 1, node = node.parentElement) {
    const input = node.querySelector<HTMLInputElement>("input");
    if (input) return input;
  }
  return null;
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const ok = document.execCommand("copy");
  textarea.remove();
  if (!ok) throw new Error("copy_failed");
}

function createCopyButton(kind: string) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "📋 Copiar";
  button.title = `Copiar ${kind}`;
  button.setAttribute(COPY_ATTR, kind);
  button.className = "shrink-0 rounded-lg border border-violet-400/35 bg-violet-500/10 px-2.5 py-1.5 text-[11px] font-extrabold text-violet-200 transition hover:bg-violet-500/20";
  return button;
}

export default function AdminOrderLoginCopyEnhancer() {
  useEffect(() => {
    if (!window.location.pathname.toLowerCase().startsWith("/admin/orders")) return;

    const listeners = new Map<HTMLButtonElement, (event: Event) => void>();

    const bind = (label: HTMLLabelElement, kind: "telefone" | "email" | "senha") => {
      const input = findInputNearLabel(label);
      const row = input?.parentElement;
      if (!input || !row) return;
      if (row.querySelector(`[${COPY_ATTR}="${kind}"]`)) return;

      const button = createCopyButton(kind);
      const onClick = async (event: Event) => {
        event.preventDefault();
        event.stopPropagation();

        const value = input.value.trim();
        if (!value) {
          toast.info(`Não há ${kind} para copiar.`);
          return;
        }

        try {
          await copyText(value);
          button.textContent = "✓ Copiado";
          toast.success(`${kind === "email" ? "E-mail" : kind === "senha" ? "Senha" : "Telefone"} copiado.`);
          window.setTimeout(() => {
            if (button.isConnected) button.textContent = "📋 Copiar";
          }, 1200);
        } catch {
          toast.error("Não foi possível copiar automaticamente.");
        }
      };

      button.addEventListener("click", onClick);
      listeners.set(button, onClick);

      const children = Array.from(row.children);
      const clearButton = children.find(child => child instanceof HTMLButtonElement && normalizeText(child.textContent) === "");
      if (clearButton) row.insertBefore(button, clearButton);
      else row.appendChild(button);
    };

    const scan = () => {
      if (!window.location.pathname.toLowerCase().startsWith("/admin/orders")) return;
      const labels = Array.from(document.querySelectorAll<HTMLLabelElement>("label"));
      labels.forEach(label => {
        const text = normalizeText(label.textContent);
        if (text.includes("LOGIN 1") && text.includes("TELEFONE")) bind(label, "telefone");
        else if (text.includes("LOGIN 2") && text.includes("EMAIL")) bind(label, "email");
        else if (text.includes("SENHA PARA ENTRAR NA SUA CONTA")) bind(label, "senha");
      });
    };

    scan();
    const observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("popstate", scan);

    return () => {
      observer.disconnect();
      window.removeEventListener("popstate", scan);
      listeners.forEach((listener, button) => button.removeEventListener("click", listener));
    };
  }, []);

  return null;
}
