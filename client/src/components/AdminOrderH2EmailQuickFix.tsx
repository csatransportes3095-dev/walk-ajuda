import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

const EMAIL_BUTTON_ATTR = "data-h2-order-login-email-generator";
const H2_EMAIL_BUTTON_ATTR = "data-h2-order-login-h2-email-generator";
const CONFIG_KEY = "h2_email_generator_config_v1";
const HISTORY_KEY = "h2_email_generator_history_v3";
const LEGACY_HISTORY_KEY = "h2_email_generator_random_v2";
const ACCOUNT_PASSWORD = "fusca123";

type GeneratorConfig = {
  prefix: string;
  domains: string[];
  activeDomain: string;
  referenceInbox: string;
};

type HistoryItem = {
  id: string;
  email: string;
  domain: string;
  createdAt: string;
};

const DEFAULT_CONFIG: GeneratorConfig = {
  prefix: "h2walk",
  domains: ["h2colombiano.com"],
  activeDomain: "h2colombiano.com",
  referenceInbox: "h2walk@h2colombiano.com",
};

function normalizeText(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function normalizeDomain(value: string) {
  let normalized = value.trim().toLowerCase();
  normalized = normalized.replace(/^https?:\/\//, "");
  if (normalized.includes("@")) normalized = normalized.split("@").pop() || "";
  normalized = normalized.split("/")[0].replace(/^\.+|\.+$/g, "");
  return normalized;
}

function isValidDomain(value: string) {
  return /^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(value);
}

function normalizePrefix(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 48);
}

function parseConfig(raw?: string): GeneratorConfig {
  if (!raw) return DEFAULT_CONFIG;
  try {
    const parsed = JSON.parse(raw) as Partial<GeneratorConfig>;
    const domains = Array.isArray(parsed.domains)
      ? Array.from(new Set(parsed.domains.map(item => normalizeDomain(String(item))).filter(isValidDomain)))
      : [];
    const safeDomains = domains.length ? domains : DEFAULT_CONFIG.domains;
    const activeCandidate = normalizeDomain(String(parsed.activeDomain || ""));
    const activeDomain = safeDomains.includes(activeCandidate) ? activeCandidate : safeDomains[0];
    const prefix = normalizePrefix(String(parsed.prefix || DEFAULT_CONFIG.prefix)) || DEFAULT_CONFIG.prefix;
    const referenceInbox = String(parsed.referenceInbox || `${prefix}@${activeDomain}`).trim().toLowerCase();
    return { prefix, domains: safeDomains, activeDomain, referenceInbox };
  } catch {
    return DEFAULT_CONFIG;
  }
}

function randomInt(min: number, max: number) {
  const range = max - min + 1;
  const maxUint = 0x100000000;
  const limit = maxUint - (maxUint % range);
  const values = new Uint32Array(1);
  do globalThis.crypto.getRandomValues(values); while (values[0] >= limit);
  return min + (values[0] % range);
}

function pick(value: string) {
  return value[randomInt(0, value.length - 1)];
}

function randomName() {
  const consonants = "bcdfghjklmnpqrstvwxyz";
  const vowels = "aeiou";
  const length = randomInt(3, 5);
  let result = "";
  let useConsonant = randomInt(0, 1) === 1;
  for (let index = 0; index < length; index += 1) {
    result += useConsonant ? pick(consonants) : pick(vowels);
    useConsonant = !useConsonant;
  }
  return result;
}

function randomNumber() {
  const length = randomInt(2, 4);
  return randomInt(10 ** (length - 1), 10 ** length - 1);
}

function readHistory(): HistoryItem[] {
  if (typeof window === "undefined") return [];
  const read = (key: string) => {
    try {
      return JSON.parse(window.localStorage.getItem(key) || "null");
    } catch {
      return null;
    }
  };

  const current = read(HISTORY_KEY);
  if (current && Array.isArray(current.used)) {
    return current.used
      .filter((item: unknown): item is HistoryItem => Boolean(item && typeof item === "object" && typeof (item as HistoryItem).email === "string"))
      .map((item, index) => ({
        id: item.id || `saved-${index}-${item.createdAt || Date.now()}`,
        email: item.email,
        domain: item.domain || item.email.split("@")[1] || "",
        createdAt: item.createdAt || new Date().toISOString(),
      }));
  }

  const legacy = read(LEGACY_HISTORY_KEY);
  if (legacy && Array.isArray(legacy.used)) {
    return legacy.used
      .filter((item: unknown): item is { email: string; createdAt?: string } => Boolean(item && typeof item === "object" && typeof (item as { email?: unknown }).email === "string"))
      .map((item, index) => ({
        id: `legacy-${index}-${item.createdAt || Date.now()}`,
        email: item.email,
        domain: item.email.split("@")[1] || "",
        createdAt: item.createdAt || new Date().toISOString(),
      }));
  }

  return [];
}

function generateH2CatchAll(config: GeneratorConfig) {
  const activeDomain = config.domains.includes(config.activeDomain) ? config.activeDomain : config.domains[0];
  const safePrefix = normalizePrefix(config.prefix) || DEFAULT_CONFIG.prefix;
  const history = readHistory();
  const used = new Set(history.map(item => item.email.toLowerCase()));

  for (let attempt = 0; attempt < 5000; attempt += 1) {
    const email = `${safePrefix}.${randomName()}.${randomNumber()}@${activeDomain}`.toLowerCase();
    if (used.has(email)) continue;

    const item: HistoryItem = {
      id: `${Date.now()}-${randomInt(1000, 9999)}`,
      email,
      domain: activeDomain,
      createdAt: new Date().toISOString(),
    };
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify({ used: [item, ...history] }));
    return email;
  }

  throw new Error("Não foi possível gerar um e-mail H2 único. Tente novamente.");
}

function setReactInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (setter) setter.call(input, value);
  else input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
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

function findSaveSection(start: Element | null) {
  let node = start?.parentElement || null;
  for (let depth = 0; node && depth < 14; depth += 1, node = node.parentElement) {
    const saveButton = Array.from(node.querySelectorAll<HTMLButtonElement>("button")).find(button =>
      normalizeText(button.textContent).includes("SALVAR DADOS DE LOGIN")
    );
    if (saveButton) return { section: node, saveButton };
  }
  return null;
}

function findPasswordInput(section: HTMLElement) {
  const labels = Array.from(section.querySelectorAll<HTMLLabelElement>("label"));
  const label = labels.find(item => normalizeText(item.textContent).includes("SENHA PARA ENTRAR NA SUA CONTA"));
  return label ? findInputNearLabel(label) : null;
}

function createButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "⚡ Gerar H2";
  button.className = "h2-order-login-quick-btn shrink-0 rounded-lg border border-cyan-400/35 bg-cyan-500/10 px-2.5 py-1.5 text-[11px] font-extrabold text-cyan-200 hover:bg-cyan-500/20 disabled:cursor-wait disabled:opacity-50";
  button.setAttribute(EMAIL_BUTTON_ATTR, "true");
  button.setAttribute(H2_EMAIL_BUTTON_ATTR, "true");
  button.title = "Gerar e-mail secundário pelo Gerador de E-mails H2 (Catch-All)";
  return button;
}

async function waitForSaveReady(button: HTMLButtonElement, timeoutMs = 4000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (!button.disabled) return true;
    await new Promise(resolve => window.setTimeout(resolve, 80));
  }
  return !button.disabled;
}

export default function AdminOrderH2EmailQuickFix() {
  const isOrdersPage = typeof window !== "undefined" && window.location.pathname.toLowerCase().startsWith("/admin/orders");
  const configQuery = trpc.config.get.useQuery(undefined, {
    enabled: isOrdersPage,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
  const configRef = useRef<GeneratorConfig>(DEFAULT_CONFIG);

  useEffect(() => {
    if (!isOrdersPage) return;
    configRef.current = parseConfig(configQuery.data?.[CONFIG_KEY]);
  }, [configQuery.data, isOrdersPage]);

  useEffect(() => {
    if (!isOrdersPage) return;

    const listeners = new Map<HTMLButtonElement, (event: Event) => void>();

    const scan = () => {
      if (!window.location.pathname.toLowerCase().startsWith("/admin/orders")) return;

      const labels = Array.from(document.querySelectorAll<HTMLLabelElement>("label"));
      labels.forEach(label => {
        const text = normalizeText(label.textContent);
        if (!(text.includes("LOGIN 2") && text.includes("EMAIL"))) return;

        const input = findInputNearLabel(label);
        const row = input?.parentElement;
        if (!input || !row) return;

        const currentH2Button = row.querySelector<HTMLButtonElement>(`[${H2_EMAIL_BUTTON_ATTR}]`);
        if (currentH2Button) return;

        row.querySelectorAll<HTMLButtonElement>(`[${EMAIL_BUTTON_ATTR}]`).forEach(oldButton => oldButton.remove());

        const button = createButton();
        const onClick = async (event: Event) => {
          event.preventDefault();
          event.stopPropagation();

          const located = findSaveSection(input);
          if (!located) {
            toast.error("Não localizei a área de Dados de Login deste pedido.");
            return;
          }

          const passwordInput = findPasswordInput(located.section);
          if (!passwordInput) {
            toast.error("Campo de senha de acesso da conta não encontrado. Nada foi alterado.");
            return;
          }

          if ((input.value.trim() || passwordInput.value.trim()) && !window.confirm("Já existem dados de login neste pedido. Gerar novo e-mail H2 e aplicar a senha padrão fusca123?")) return;

          button.disabled = true;
          button.textContent = "Gerando...";
          try {
            let config = configRef.current;
            if (!configQuery.data) {
              const refreshed = await configQuery.refetch();
              config = parseConfig(refreshed.data?.[CONFIG_KEY]);
              configRef.current = config;
            }

            const email = generateH2CatchAll(config);
            setReactInputValue(input, email);
            setReactInputValue(passwordInput, ACCOUNT_PASSWORD);

            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            const ready = await waitForSaveReady(located.saveButton);
            if (!ready) throw new Error("O salvamento do pedido ainda está ocupado.");
            located.saveButton.click();

            toast.success(`E-mail H2 gerado no Login 2 e senha de acesso definida: ${email}`);
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Não foi possível gerar o e-mail H2.");
          } finally {
            button.disabled = false;
            button.textContent = "⚡ Gerar H2";
          }
        };

        button.addEventListener("click", onClick);
        listeners.set(button, onClick);
        row.appendChild(button);
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
  }, [configQuery, isOrdersPage]);

  return null;
}
