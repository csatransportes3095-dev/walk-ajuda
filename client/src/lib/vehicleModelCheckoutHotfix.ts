type AnyRecord = Record<string, any>;

const PATCH_FLAG = "__h2VehicleModelCheckoutHotfixInstalled";
const MODEL_ENHANCED_ATTR = "data-h2-vehicle-model-select";

function normalizeText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function isBrandQuestion(question: unknown) {
  const q = normalizeText(question);
  return q.includes("QUAL A MARCA") || q === "MARCA" || q.includes("MARCA DO VEICULO");
}

function isModelQuestion(question: unknown) {
  const q = normalizeText(question);
  return q.includes("MODELO DO VEICULO") || q.includes("QUAL MODELO") || q === "MODELO";
}

/**
 * O banco possui, em algumas opções, uma pergunta de modelo para cada marca.
 * A tela pública já tem catálogo dinâmico de modelos por marca, então manter
 * todas essas perguntas simultaneamente faz a validação cobrar uma pergunta
 * diferente da que o cliente acabou de responder.
 *
 * Aqui o payload público é normalizado SOMENTE no navegador do pedido:
 * - preserva marca, ano, cor e todas as demais perguntas;
 * - mantém uma única pergunta de modelo para cada pergunta-pai de marca;
 * - remove somente o trigger de marca dessa pergunta de modelo, pois a própria
 *   tela já filtra os modelos usando a marca escolhida.
 */
function normalizeVehicleModelQuestions(questions: AnyRecord[]) {
  if (!Array.isArray(questions) || questions.length === 0) return questions;

  const byId = new Map<number, AnyRecord>();
  for (const question of questions) {
    if (question && Number.isFinite(Number(question.id))) byId.set(Number(question.id), question);
  }

  const firstModelByBrandParent = new Map<number, AnyRecord>();
  for (const question of questions) {
    if (!question || !isModelQuestion(question.question)) continue;
    const parentId = Number(question.parentQuestionId || 0);
    if (!parentId) continue;
    const parent = byId.get(parentId);
    if (!parent || !isBrandQuestion(parent.question)) continue;
    if (!firstModelByBrandParent.has(parentId)) firstModelByBrandParent.set(parentId, question);
  }

  if (firstModelByBrandParent.size === 0) return questions;

  return questions
    .filter((question) => {
      if (!question || !isModelQuestion(question.question)) return true;
      const parentId = Number(question.parentQuestionId || 0);
      const selected = firstModelByBrandParent.get(parentId);
      return !selected || Number(selected.id) === Number(question.id);
    })
    .map((question) => {
      if (!question || !isModelQuestion(question.question)) return question;
      const parentId = Number(question.parentQuestionId || 0);
      const selected = firstModelByBrandParent.get(parentId);
      if (!selected || Number(selected.id) !== Number(question.id)) return question;
      return {
        ...question,
        triggerOption: null,
      };
    });
}

function patchProductTree(value: unknown, seen = new WeakSet<object>()): void {
  if (!value || typeof value !== "object") return;
  if (seen.has(value as object)) return;
  seen.add(value as object);

  if (Array.isArray(value)) {
    value.forEach((item) => patchProductTree(item, seen));
    return;
  }

  const record = value as AnyRecord;
  if (Array.isArray(record.questions)) {
    record.questions = normalizeVehicleModelQuestions(record.questions);
  }

  for (const child of Object.values(record)) {
    patchProductTree(child, seen);
  }
}

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function installProductsResponsePatch() {
  const globalRecord = globalThis as typeof globalThis & Record<string, any>;
  if (globalRecord[PATCH_FLAG]) return;
  globalRecord[PATCH_FLAG] = true;

  const nativeFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await nativeFetch(input, init);
    const url = requestUrl(input);

    if (!url.includes("/api/trpc") || !url.includes("products.listActive") || !response.ok) {
      return response;
    }

    try {
      const body = await response.clone().json();
      patchProductTree(body);

      const headers = new Headers(response.headers);
      headers.delete("content-length");
      headers.delete("content-encoding");

      return new Response(JSON.stringify(body), {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (error) {
      console.warn("[VehicleModelHotfix] Falha ao normalizar catálogo; resposta original preservada.", error);
      return response;
    }
  };
}

function setNativeInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (setter) setter.call(input, value);
  else input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function enhanceModelInput(input: HTMLInputElement) {
  if (input.hasAttribute(MODEL_ENHANCED_ATTR)) return;

  const listId = input.getAttribute("list");
  if (!listId || !listId.startsWith("vehicle-models-")) return;
  const datalist = document.getElementById(listId) as HTMLDataListElement | null;
  if (!datalist) return;

  const models = Array.from(datalist.querySelectorAll("option"))
    .map((option) => String(option.value || "").trim())
    .filter(Boolean);
  if (models.length === 0) return;

  input.setAttribute(MODEL_ENHANCED_ATTR, "true");
  input.style.setProperty("display", "none", "important");
  input.setAttribute("aria-hidden", "true");
  input.tabIndex = -1;

  const select = document.createElement("select");
  select.className = `${input.className} h2-vehicle-model-real-select`;
  select.setAttribute("aria-label", "Selecione o modelo do veículo");
  select.style.width = "100%";
  select.style.backgroundColor = "#ffffff";
  select.style.color = "#000000";
  select.style.fontSize = "16px";
  select.style.fontWeight = "600";
  select.style.textAlign = "center";
  select.style.border = "2px solid rgba(255,255,255,0.20)";
  select.style.borderRadius = "8px";
  select.style.padding = "12px";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Selecione o modelo do veículo";
  select.appendChild(placeholder);

  for (const model of models) {
    const option = document.createElement("option");
    option.value = model;
    option.textContent = model;
    select.appendChild(option);
  }

  const currentValue = String(input.value || "").trim().toUpperCase();
  if (currentValue && models.includes(currentValue)) select.value = currentValue;

  select.addEventListener("change", () => {
    setNativeInputValue(input, select.value);
  });

  input.addEventListener("input", () => {
    const next = String(input.value || "").trim().toUpperCase();
    select.value = models.includes(next) ? next : "";
  });

  input.insertAdjacentElement("afterend", select);
}

function scanModelInputs() {
  if (typeof document === "undefined") return;
  document
    .querySelectorAll<HTMLInputElement>('input[list^="vehicle-models-"]')
    .forEach(enhanceModelInput);
}

function installRealModelSelect() {
  if (typeof document === "undefined") return;

  const start = () => {
    scanModelInputs();
    const observer = new MutationObserver(scanModelInputs);
    observer.observe(document.body, { childList: true, subtree: true });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
}

installProductsResponsePatch();
installRealModelSelect();

export {};
