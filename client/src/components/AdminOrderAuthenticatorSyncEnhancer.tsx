import { useEffect } from "react";

const BOUND = "data-h2-auth-sync";

function norm(value: string | null | undefined) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
}

function setValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (setter) setter.call(input, value); else input.value = value;
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

function orderIdentity() {
  const pageText = document.body.innerText;
  const code = pageText.match(/(?:^|\s)#(\d{1,8})(?:\s|$)/m)?.[1] || pageText.match(/PEDIDO:\s*#?(\d+)/i)?.[1] || "";
  const customerHeading = Array.from(document.querySelectorAll<HTMLElement>("h1,h2,h3,h4,strong,b,div,span")).find(el => {
    const text = norm(el.textContent);
    return Boolean(code && text.includes(`#${code}`) && text.length < 180);
  });
  let name = "";
  if (customerHeading) {
    name = String(customerHeading.textContent || "")
      .replace(new RegExp(`#?${code}`, "g"), " ")
      .replace(/PEDIDO:?/gi, " ")
      .replace(/\(\d+\)\s*[\d\s()-]+/g, " ")
      .replace(/\s+/g, " ").trim();
  }
  if (!name) {
    const candidate = Array.from(document.querySelectorAll<HTMLElement>("strong,b,h3,h4")).map(el => String(el.textContent || "").trim()).find(text => /^[A-ZÀ-Ý][A-ZÀ-Ý\s.'-]{4,80}$/i.test(text) && !/PEDIDO|STATUS|LOGIN|CLIENTE|CONFIRMADO/i.test(text));
    name = candidate || "Cliente";
  }
  return { code, name };
}

function base32(value: string) {
  return String(value || "").toUpperCase().replace(/[\s-]+/g, "").replace(/=+$/g, "");
}

export default function AdminOrderAuthenticatorSyncEnhancer() {
  useEffect(() => {
    if (!location.pathname.toLowerCase().startsWith("/admin/orders")) return;
    const cleanups: Array<() => void> = [];

    const scan = () => {
      const labels = Array.from(document.querySelectorAll<HTMLLabelElement>("label"));
      const issuerLabel = labels.find(l => norm(l.textContent).startsWith("EMISSOR"));
      const secretLabel = labels.find(l => norm(l.textContent).includes("CHAVE SECRETA BASE32"));
      const codeLabel = labels.find(l => norm(l.textContent) === "CODIGO AUTENTICADOR");
      const issuer = issuerLabel ? nearInput(issuerLabel) : null;
      const secret = secretLabel ? nearInput(secretLabel) : null;
      const code = codeLabel ? nearInput(codeLabel) : null;
      if (!secret || !code) return;

      const identity = orderIdentity();
      const displayName = `${identity.code ? `#${identity.code} ` : ""}${identity.name}`.trim();
      if (issuer && displayName && (!issuer.value.trim() || norm(issuer.value).includes("LOGIN DO CLIENTE"))) setValue(issuer, displayName);

      const sync = (from: HTMLInputElement, to: HTMLInputElement) => {
        const value = base32(from.value);
        if (value && to.value !== value) setValue(to, value);
        if (issuer && displayName && issuer.value !== displayName) setValue(issuer, displayName);
      };

      if (!secret.hasAttribute(BOUND)) {
        secret.setAttribute(BOUND, "true");
        const fn = () => sync(secret, code);
        secret.addEventListener("input", fn);
        secret.addEventListener("change", fn);
        cleanups.push(() => { secret.removeEventListener("input", fn); secret.removeEventListener("change", fn); });
      }
      if (!code.hasAttribute(BOUND)) {
        code.setAttribute(BOUND, "true");
        const fn = () => sync(code, secret);
        code.addEventListener("input", fn);
        code.addEventListener("change", fn);
        cleanups.push(() => { code.removeEventListener("input", fn); code.removeEventListener("change", fn); });
      }

      if (secret.value && !code.value) sync(secret, code);
      else if (code.value && !secret.value) sync(code, secret);
    };

    scan();
    const observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => { observer.disconnect(); cleanups.forEach(fn => fn()); };
  }, []);
  return null;
}
