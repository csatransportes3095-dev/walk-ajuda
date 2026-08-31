export type H2AdsOrderLinkLike = { instanceId: number; registrationId: number; subOrderIndex: number };
export type H2AdsInstanceLike = { id: number; status: string };
export type H2AdsAssignmentLike = { instanceId: number; workerId: number };
export type H2AdsWorkerLike = { id: number; connectionStatus: string };
export type H2AdsBrowserRunLike = { instanceId: number; state: string };

export type H2AdsOrderBrowserShortcutState = {
  linked: true;
  instanceId: number;
  state: string;
  canOpen: boolean;
  canClose: boolean;
  reason: string | null;
};

export function resolveH2AdsOrderBrowserShortcutState(input: {
  registrationId: number;
  subOrderIndex: number;
  links: H2AdsOrderLinkLike[];
  instances: H2AdsInstanceLike[];
  assignments: H2AdsAssignmentLike[];
  workers: H2AdsWorkerLike[];
  runs: H2AdsBrowserRunLike[];
}): H2AdsOrderBrowserShortcutState | null {
  // ABRIR/FECHAR nunca deve adivinhar. O controle direto exige o vínculo exato
  // entre o pedido/subpedido exibido no ADM e a instância H2ADS.
  const link = input.links.find(item => item.registrationId === input.registrationId && item.subOrderIndex === input.subOrderIndex);
  if (!link) return null;

  const instance = input.instances.find(item => item.id === link.instanceId);
  const assignment = input.assignments.find(item => item.instanceId === link.instanceId);
  const worker = assignment ? input.workers.find(item => item.id === assignment.workerId) : undefined;
  const run = input.runs.find(item => item.instanceId === link.instanceId);
  const state = run?.state || "not_prepared";

  if (!instance) return { linked: true, instanceId: link.instanceId, state, canOpen: false, canClose: false, reason: "Instância H2ADS não encontrada." };
  if (instance.status === "archived") return { linked: true, instanceId: link.instanceId, state, canOpen: false, canClose: false, reason: "Instância H2ADS arquivada." };
  if (!assignment) return { linked: true, instanceId: link.instanceId, state, canOpen: false, canClose: false, reason: "Worker ainda não atribuído." };
  if (!worker || worker.connectionStatus !== "online") return { linked: true, instanceId: link.instanceId, state, canOpen: false, canClose: false, reason: "Worker offline." };
  if (state === "queued" || state === "preparing") return { linked: true, instanceId: link.instanceId, state, canOpen: false, canClose: false, reason: "Comando em andamento." };
  if (state === "browser_open") return { linked: true, instanceId: link.instanceId, state, canOpen: false, canClose: true, reason: null };
  if (state === "proxy_verified" || state === "closed") return { linked: true, instanceId: link.instanceId, state, canOpen: true, canClose: false, reason: null };
  if (state === "blocked") return { linked: true, instanceId: link.instanceId, state, canOpen: false, canClose: false, reason: "Instância bloqueada; revise no H2ADS." };
  return { linked: true, instanceId: link.instanceId, state, canOpen: false, canClose: false, reason: "Prepare a instância no H2ADS antes de abrir." };
}

export type H2AdsOrderRepairLike = {
  id: number;
  subOrderIndex?: number | null;
  customerNumber?: number | null;
  orderNumber?: number | null;
  serviceName?: string | null;
  serviceOption?: string | null;
};

export type H2AdsOrderLinkRepairCandidate = {
  instanceId: number;
  linkedRegistrationId: number;
  linkedSubOrderIndex: number;
  linkedOrderNumber: number | null;
  serviceKey: string;
};

function normalizeRepairText(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[º°]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function canonicalH2AdsServiceKey(serviceName: unknown, serviceOption: unknown): string | null {
  const service = normalizeRepairText(serviceName);
  const option = normalizeRepairText(serviceOption);
  const combined = `${service} ${option}`.trim();
  if (!combined) return null;

  let product = service || "servico";
  if (/(?:^| )taxi(?: |$)/.test(combined)) product = "taxi";
  else if (/(?:^| )uber(?: |$)/.test(combined)) product = "uber";
  else if (/(?:^| )99(?: |$)/.test(combined)) product = "99";
  else if (combined.includes("indrive") || combined.includes("in drive")) product = "indrive";

  let optionKey = option || "padrao";
  if (combined.includes("aleatorio")) {
    optionKey = "nome_aleatorio";
  } else if (combined.includes("primeiro nome") || /(?:^| )1(?: o)? nome(?: |$)/.test(combined)) {
    optionKey = "primeiro_nome";
  } else if (combined.includes("nome completo") || (combined.includes("nome") && combined.includes("completo"))) {
    optionKey = "nome_completo";
  }

  return `${product}|${optionKey}`;
}

export function resolveH2AdsOrderLinkRepairCandidate(input: {
  registrationId: number;
  subOrderIndex: number;
  customerNumber: number | null | undefined;
  serviceName: string | null | undefined;
  serviceOption: string | null | undefined;
  links: H2AdsOrderLinkLike[];
  orders: H2AdsOrderRepairLike[];
}): H2AdsOrderLinkRepairCandidate | null {
  // Se o vínculo já é exato, não existe nada para reparar.
  if (input.links.some(link => link.registrationId === input.registrationId && link.subOrderIndex === input.subOrderIndex)) return null;

  const customerNumber = Number(input.customerNumber || 0);
  if (!Number.isInteger(customerNumber) || customerNumber < 1) return null;

  const targetServiceKey = canonicalH2AdsServiceKey(input.serviceName, input.serviceOption);
  if (!targetServiceKey) return null;

  const orderByKey = new Map(input.orders.map(order => [`${order.id}:${Number(order.subOrderIndex || 0)}`, order]));
  const candidates = new Map<number, H2AdsOrderLinkRepairCandidate>();

  for (const link of input.links) {
    const linkedOrder = orderByKey.get(`${link.registrationId}:${link.subOrderIndex}`);
    if (!linkedOrder || Number(linkedOrder.customerNumber || 0) !== customerNumber) continue;

    const linkedServiceKey = canonicalH2AdsServiceKey(linkedOrder.serviceName, linkedOrder.serviceOption);
    if (linkedServiceKey !== targetServiceKey) continue;

    candidates.set(link.instanceId, {
      instanceId: link.instanceId,
      linkedRegistrationId: link.registrationId,
      linkedSubOrderIndex: link.subOrderIndex,
      linkedOrderNumber: linkedOrder.orderNumber == null ? null : Number(linkedOrder.orderNumber),
      serviceKey: linkedServiceKey,
    });
  }

  // Nunca adivinha entre duas instâncias. O ADM só recebe a opção VINCULAR
  // quando existe exatamente um candidato compatível.
  return candidates.size === 1 ? [...candidates.values()][0] : null;
}
