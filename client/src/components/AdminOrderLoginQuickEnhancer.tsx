import { useEffect, useRef } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

const PHONE_BUTTON_ATTR = "data-h2-order-login-phone-generator";
const EMAIL_BUTTON_ATTR = "data-h2-order-login-email-generator";
const QR_BOUND_ATTR = "data-h2-order-login-qr-autogen";
const QR_DELETE_BOUND_ATTR = "data-h2-order-login-qr-delete-autosave";

const FIRST_NAMES = ["Ana","Bruno","Carlos","Daniel","Eduardo","Fernanda","Gabriel","Helena","Igor","Julia","Kevin","Lucas","Marcos","Natalia","Olivia","Paulo","Rafael","Sandra","Thiago","Vanessa","William","Xavier","Yasmin","Zeca","Adriana","Beatriz","Camila","Diego","Elisa","Felipe"];
const LAST_NAMES = ["Silva","Santos","Oliveira","Souza","Lima","Pereira","Costa","Ferreira","Rodrigues","Almeida","Nascimento","Carvalho","Gomes","Martins","Araujo","Melo","Barbosa","Ribeiro","Rocha","Cardoso","Mendes","Castro","Moreira","Nunes"];
const VALID_PHONE_DDDS = ["71","73","74","75","77","79","81","82","83","84","85","86","87","88","89","91","92","93","94","95","96","97","98","99"];
const phoneSessionHistory = new Set<string>();

type ZohoGroup = {
  serverId: number;
  serverName?: string;
  domain?: string;
  users?: Array<{ primaryEmailAddress?: string | null }>;
  error?: string | null;
};

function normalizeText(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function cryptoRandInt(min: number, max: number) {
  const range = max - min + 1;
  const maxUint = 0x100000000;
  const limit = maxUint - (maxUint % range);
  const values = new Uint32Array(1);
  do crypto.getRandomValues(values); while (values[0] >= limit);
  return min + (values[0] % range);
}

function generatePhoneRaw() {
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const ddd = VALID_PHONE_DDDS[cryptoRandInt(0, VALID_PHONE_DDDS.length - 1)];
    const secondDigit = cryptoRandInt(0, 9);
    let rest = "";
    for (let index = 0; index < 7; index += 1) rest += String(cryptoRandInt(0, 9));
    const raw = `${ddd}9${secondDigit}${rest}`;
    if (!phoneSessionHistory.has(raw)) {
      phoneSessionHistory.add(raw);
      return raw;
    }
  }
  throw new Error("Não foi possível gerar um telefone único nesta sessão.");
}

function formatPhone(raw: string) {
  return `(${raw.slice(0, 2)}) ${raw[2]} ${raw.slice(3, 7)}-${raw.slice(7, 11)}`;
}

function pick<T>(items: T[]) {
  return items[cryptoRandInt(0, items.length - 1)];
}

function generateEmailAccount(existingEmails: string[], domain: string) {
  const normalizedDomain = String(domain || "h2colombiano.com").trim().toLowerCase();
  const existing = new Set(existingEmails.map(value => String(value || "").trim().toLowerCase()));

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const firstName = pick(FIRST_NAMES);
    const lastName = pick(LAST_NAMES);
    const suffix = cryptoRandInt(100, 999);
    const username = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${suffix}`;
    const email = `${username}@${normalizedDomain}`;
    if (!existing.has(email)) {
      return {
        username,
        firstName,
        lastName,
        displayName: `${firstName} ${lastName}`,
        password: "Walk@@3095",
      };
    }
  }

  const firstName = pick(FIRST_NAMES);
  const lastName = pick(LAST_NAMES);
  const suffix = `${Date.now().toString(36).slice(-5)}${cryptoRandInt(10, 99)}`;
  return {
    username: `user_${suffix}`,
    firstName,
    lastName,
    displayName: `${firstName} ${lastName}`,
    password: "Walk@@3095",
  };
}

function getNativeInputSetter() {
  return Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
}

function setReactInputValue(input: HTMLInputElement, value: string) {
  const setter = getNativeInputSetter();
  if (setter) setter.call(input, value);
  else input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function labelInput(label: HTMLLabelElement) {
  const parent = label.parentElement;
  if (!parent) return null;
  return parent.querySelector<HTMLInputElement>('input[type="text"], input:not([type])');
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

function waitForFrame() {
  return new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
}

async function waitForCondition(check: () => boolean, timeoutMs = 2800, intervalMs = 60) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (check()) return true;
    await new Promise(resolve => window.setTimeout(resolve, intervalMs));
  }
  return false;
}

async function clickExistingSaveButton(start: Element) {
  await waitForFrame();
  await waitForFrame();
  const located = findSaveSection(start);
  if (!located) throw new Error("Botão Salvar Dados de Login não encontrado.");

  await waitForCondition(() => !located.saveButton.disabled, 4000, 80);
  if (located.saveButton.disabled) throw new Error("O salvamento ainda está ocupado. Tente novamente.");
  located.saveButton.click();
}

function createQuickButton(text: string, accent: "cyan" | "emerald") {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = text;
  button.className = accent === "cyan"
    ? "h2-order-login-quick-btn shrink-0 rounded-lg border border-cyan-400/35 bg-cyan-500/10 px-2.5 py-1.5 text-[11px] font-extrabold text-cyan-200 hover:bg-cyan-500/20 disabled:cursor-wait disabled:opacity-50"
    : "h2-order-login-quick-btn shrink-0 rounded-lg border border-emerald-400/35 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-extrabold text-emerald-200 hover:bg-emerald-500/20 disabled:cursor-wait disabled:opacity-50";
  return button;
}

function normalizeBase32Secret(value: string) {
  return String(value || "")
    .toUpperCase()
    .replace(/[\s-]+/g, "")
    .replace(/=+$/g, "");
}

function isValidBase32Secret(secret: string) {
  return secret.length >= 16 && secret.length <= 256 && /^[A-Z2-7]+$/.test(secret);
}

function dataUrlToPngFile(dataUrl: string) {
  const encoded = dataUrl.split(",")[1] || "";
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new File([bytes], `qr-autenticador-${Date.now()}.png`, { type: "image/png" });
}

function findQrFileInput(section: HTMLElement) {
  const candidates = Array.from(section.querySelectorAll<HTMLInputElement>('input[type="file"]'));
  return candidates.find(input => {
    let node: HTMLElement | null = input.parentElement;
    for (let depth = 0; node && depth < 7; depth += 1, node = node.parentElement) {
      if (normalizeText(node.textContent).includes("QR CODE / IMAGEM DO AUTENTICADOR")) return true;
    }
    return false;
  }) || null;
}

function findPasswordInput(section: HTMLElement) {
  const labels = Array.from(section.querySelectorAll<HTMLLabelElement>("label"));
  const label = labels.find(item => normalizeText(item.textContent).includes("SENHA PARA ENTRAR NA SUA CONTA"));
  return label ? labelInput(label) : null;
}

export default function AdminOrderLoginQuickEnhancer() {
  const isOrdersPage = typeof window !== "undefined" && window.location.pathname.toLowerCase().startsWith("/admin/orders");
  const emailListQuery = trpc.email.list.useQuery(undefined, {
    enabled: isOrdersPage,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });
  const createEmailMutation = trpc.email.create.useMutation();

  const emailGroupsRef = useRef<ZohoGroup[]>([]);
  const emailRefetchRef = useRef(emailListQuery.refetch);
  const createEmailRef = useRef(createEmailMutation.mutateAsync);
  const emailGenerationBusyRef = useRef(false);

  emailGroupsRef.current = ((emailListQuery.data || []) as ZohoGroup[]);
  emailRefetchRef.current = emailListQuery.refetch;
  createEmailRef.current = createEmailMutation.mutateAsync;

  useEffect(() => {
    if (!isOrdersPage) return;

    const cleanupCallbacks: Array<() => void> = [];
    const qrTimers = new WeakMap<HTMLInputElement, number>();
    const generatedSecrets = new WeakMap<HTMLInputElement, string>();

    const injectPhoneButton = (label: HTMLLabelElement) => {
      const input = labelInput(label);
      const row = input?.parentElement;
      if (!input || !row || row.querySelector(`[${PHONE_BUTTON_ATTR}]`)) return;

      const button = createQuickButton("⚡ Gerar", "emerald");
      button.setAttribute(PHONE_BUTTON_ATTR, "true");
      button.title = "Gerar telefone usando o mesmo padrão do Gerador de Telefones e salvar neste pedido";

      const onClick = async (event: Event) => {
        event.preventDefault();
        event.stopPropagation();
        const current = input.value.trim();
        if (current && !window.confirm("Já existe um telefone de login. Gerar outro e substituir?")) return;
        button.disabled = true;
        const originalText = button.textContent || "⚡ Gerar";
        button.textContent = "Gerando...";
        try {
          const formatted = formatPhone(generatePhoneRaw());
          setReactInputValue(input, formatted);
          await clickExistingSaveButton(input);
          toast.success(`Telefone gerado e enviado para os dados de login: ${formatted}`);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Não foi possível gerar o telefone.");
        } finally {
          button.disabled = false;
          button.textContent = originalText;
        }
      };

      button.addEventListener("click", onClick);
      row.appendChild(button);
      cleanupCallbacks.push(() => button.removeEventListener("click", onClick));
    };

    const injectEmailButton = (label: HTMLLabelElement) => {
      const input = labelInput(label);
      const row = input?.parentElement;
      if (!input || !row || row.querySelector(`[${EMAIL_BUTTON_ATTR}]`)) return;

      const button = createQuickButton("⚡ Gerar", "cyan");
      button.setAttribute(EMAIL_BUTTON_ATTR, "true");
      button.title = "Criar uma conta no Gerador de Emails e salvar direto neste pedido";

      const onClick = async (event: Event) => {
        event.preventDefault();
        event.stopPropagation();
        if (emailGenerationBusyRef.current) {
          toast.info("Já existe uma criação de e-mail em andamento.");
          return;
        }

        const located = findSaveSection(input);
        if (!located) {
          toast.error("Não localizei a área de Dados de Login deste pedido.");
          return;
        }
        const passwordInput = findPasswordInput(located.section);
        if (!passwordInput) {
          toast.error("Campo de senha do pedido não encontrado. Nada foi alterado.");
          return;
        }

        if ((input.value.trim() || passwordInput.value.trim()) && !window.confirm("Já existem dados de e-mail/senha neste pedido. Criar uma nova conta e substituir?")) return;

        emailGenerationBusyRef.current = true;
        button.disabled = true;
        const originalText = button.textContent || "⚡ Gerar";
        button.textContent = "Criando...";

        try {
          let groups = emailGroupsRef.current;
          if (!groups.length) {
            const refreshed = await emailRefetchRef.current();
            groups = ((refreshed.data || []) as ZohoGroup[]);
            emailGroupsRef.current = groups;
          }

          const available = groups
            .filter(group => !group.error && Number(group.serverId) > 0 && (group.users?.length || 0) < 5)
            .sort((a, b) => (a.users?.length || 0) - (b.users?.length || 0));
          const selectedServer = available[0];
          if (!selectedServer) throw new Error("Nenhum servidor Zoho disponível para criar uma nova conta.");

          const allEmails = groups.flatMap(group => (group.users || []).map(user => String(user.primaryEmailAddress || "")));
          const account = generateEmailAccount(allEmails, selectedServer.domain || "h2colombiano.com");
          const result = await createEmailRef.current({
            username: account.username,
            displayName: account.displayName,
            password: account.password,
            firstName: account.firstName,
            lastName: account.lastName,
            type: "membro",
            serverId: Number(selectedServer.serverId),
          });

          const createdEmail = String((result as any)?.user?.primaryEmailAddress || `${account.username}@${selectedServer.domain || "h2colombiano.com"}`).trim();
          if (!createdEmail.includes("@")) throw new Error("O Zoho criou a conta, mas não retornou um endereço válido. Verifique o Gerador de Emails antes de tentar novamente.");

          setReactInputValue(input, createdEmail);
          setReactInputValue(passwordInput, account.password);

          try {
            await clickExistingSaveButton(input);
            toast.success(`E-mail criado e salvo no pedido: ${createdEmail}`);
          } catch (saveError) {
            toast.error(`O e-mail ${createdEmail} foi criado, mas não consegui acionar o salvamento do pedido. Os campos ficaram preenchidos; clique em Salvar Dados de Login.`);
            console.error("[OrderLoginQuickEnhancer] email criado, falha ao acionar save", saveError);
          }

          void emailRefetchRef.current();
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Não foi possível criar o e-mail.");
        } finally {
          emailGenerationBusyRef.current = false;
          button.disabled = false;
          button.textContent = originalText;
        }
      };

      button.addEventListener("click", onClick);
      row.appendChild(button);
      cleanupCallbacks.push(() => button.removeEventListener("click", onClick));
    };

    const bindQrAutoGeneration = (label: HTMLLabelElement) => {
      const input = labelInput(label);
      if (!input || input.hasAttribute(QR_BOUND_ATTR)) return;
      const located = findSaveSection(input);
      if (!located || !findQrFileInput(located.section)) return;

      input.setAttribute(QR_BOUND_ATTR, "true");

      const generateAndSave = async () => {
        const secret = normalizeBase32Secret(input.value);
        if (!isValidBase32Secret(secret)) return;
        if (generatedSecrets.get(input) === secret) return;

        const currentTimer = qrTimers.get(input);
        if (currentTimer) window.clearTimeout(currentTimer);

        const timer = window.setTimeout(async () => {
          try {
            const latestSecret = normalizeBase32Secret(input.value);
            if (!isValidBase32Secret(latestSecret) || generatedSecrets.get(input) === latestSecret) return;

            const currentSection = findSaveSection(input);
            if (!currentSection) throw new Error("Área de login não localizada para gerar o QR.");
            const fileInput = findQrFileInput(currentSection.section);
            if (!fileInput) throw new Error("Campo de imagem do QR não localizado.");

            const issuer = "H2 Colombiano";
            const accountLabel = "Login do Cliente";
            const otpAuthUrl = `otpauth://totp/${encodeURIComponent(`${issuer}:${accountLabel}`)}?secret=${encodeURIComponent(latestSecret)}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
            const dataUrl = await QRCode.toDataURL(otpAuthUrl, {
              width: 420,
              margin: 2,
              errorCorrectionLevel: "M",
              type: "image/png",
            });

            const transfer = new DataTransfer();
            transfer.items.add(dataUrlToPngFile(dataUrl));
            fileInput.files = transfer.files;
            fileInput.dispatchEvent(new Event("change", { bubbles: true }));

            const previewReady = await waitForCondition(() => {
              const fresh = findSaveSection(input);
              if (!fresh) return false;
              const image = Array.from(fresh.section.querySelectorAll<HTMLImageElement>("img")).find(img =>
                normalizeText(img.alt).includes("QR CODE DO AUTENTICADOR")
              );
              return Boolean(image && image.src === dataUrl);
            });

            if (!previewReady) {
              throw new Error("O QR foi gerado, mas a prévia não ficou pronta a tempo. O código foi mantido; use Salvar Dados de Login para confirmar.");
            }

            generatedSecrets.set(input, latestSecret);
            await clickExistingSaveButton(input);
            toast.success("QR do autenticador gerado automaticamente e enviado para salvamento.");
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Não foi possível gerar o QR automaticamente.");
          }
        }, 650);

        qrTimers.set(input, timer);
      };

      const onInput = () => { void generateAndSave(); };
      input.addEventListener("input", onInput);
      cleanupCallbacks.push(() => input.removeEventListener("input", onInput));
    };

    const bindDeleteAutoSave = () => {
      const qrHeadings = Array.from(document.querySelectorAll<HTMLElement>("p")).filter(element =>
        normalizeText(element.textContent).includes("QR CODE / IMAGEM DO AUTENTICADOR")
      );

      qrHeadings.forEach(heading => {
        let root: HTMLElement | null = heading.parentElement;
        for (let depth = 0; root && depth < 5; depth += 1, root = root.parentElement) {
          if (!root.querySelector('input[type="file"]')) continue;
          const deleteButton = Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find(button => normalizeText(button.textContent) === "EXCLUIR");
          if (!deleteButton || deleteButton.hasAttribute(QR_DELETE_BOUND_ATTR)) return;
          deleteButton.setAttribute(QR_DELETE_BOUND_ATTR, "true");

          const onDelete = () => {
            const saveSection = findSaveSection(deleteButton);
            if (!saveSection) return;
            window.setTimeout(async () => {
              const stillHasQr = Array.from(saveSection.section.querySelectorAll<HTMLImageElement>("img")).some(img =>
                normalizeText(img.alt).includes("QR CODE DO AUTENTICADOR")
              );
              if (stillHasQr) return;
              try {
                await clickExistingSaveButton(saveSection.section);
                toast.success("QR removido e alteração enviada para salvamento.");
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "QR removido da tela, mas não foi possível salvar automaticamente.");
              }
            }, 220);
          };

          deleteButton.addEventListener("click", onDelete);
          cleanupCallbacks.push(() => deleteButton.removeEventListener("click", onDelete));
          break;
        }
      });
    };

    const scan = () => {
      if (!window.location.pathname.toLowerCase().startsWith("/admin/orders")) return;
      const labels = Array.from(document.querySelectorAll<HTMLLabelElement>("label"));
      labels.forEach(label => {
        const text = normalizeText(label.textContent);
        if (text.includes("LOGIN 1") && text.includes("TELEFONE")) injectPhoneButton(label);
        else if (text.includes("LOGIN 2") && text.includes("EMAIL")) injectEmailButton(label);
        else if (text === "CODIGO AUTENTICADOR" || text.startsWith("CODIGO AUTENTICADOR ")) bindQrAutoGeneration(label);
      });
      bindDeleteAutoSave();
    };

    scan();
    const observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      cleanupCallbacks.forEach(cleanup => cleanup());
      document.querySelectorAll(`[${PHONE_BUTTON_ATTR}], [${EMAIL_BUTTON_ATTR}]`).forEach(element => element.remove());
    };
  }, [isOrdersPage]);

  return null;
}
