import { useEffect } from "react";

function norm(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function setValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (setter) setter.call(input, value);
  else input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function nearInput(label: HTMLLabelElement) {
  let node: HTMLElement | null = label.parentElement;
  for (let depth = 0; node && depth < 4; depth += 1, node = node.parentElement) {
    const input = node.querySelector<HTMLInputElement>("input");
    if (input) return input;
  }
  return null;
}

function isPollutedValue(value: string) {
  const clean = norm(value).replace(/\s+/g, "");
  return /^#\d+(CLIENTE|PEDIDO|CADASTRO)/.test(clean) || /^#\d+[A-ZÀ-Ý]+$/.test(clean);
}

export default function AdminOrderAuthenticatorSyncEnhancer() {
  useEffect(() => {
    if (!location.pathname.toLowerCase().startsWith("/admin/orders")) return;

    const cleanupPollutedCode = () => {
      const labels = Array.from(document.querySelectorAll<HTMLLabelElement>("label"));
      labels.forEach((label) => {
        if (norm(label.textContent) !== "CODIGO AUTENTICADOR") return;
        const input = nearInput(label);
        if (!input) return;

        // Remove somente o valor incorreto criado pela versão anterior.
        // O campo fica independente para o ADM colar a chave real de cada pedido.
        if (input.value && isPollutedValue(input.value)) {
          setValue(input, "");
        }
      });
    };

    cleanupPollutedCode();
    const observer = new MutationObserver(cleanupPollutedCode);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
