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
  serviceName?: string | null;
  serviceOption?: string | null;
};

function normalizeRepairText(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function resolveH2AdsOrderLinkRepairCandidate(input: {
  registrationId: number;
  subOrderIndex: number;
  customerNumber: number | null | undefined;
  serviceName: string | null | undefined;
  serviceOption: string | null | undefined;
  links: H2AdsOrderLinkLike[];
  orders: H2AdsOrderRepairLike[];
}): number | null {
  if (input.links.some(link => link.registrationId === input.registrationId && link.subOrderIndex === input.subOrderIndex)) return null;
  const customerNumber = Number(input.customerNumber || 0);
  if (!Number.isInteger(customerNumber) || customerNumber < 1) return null;
  const serviceKey = `${normalizeRepairText(input.serviceName)}|${normalizeRepairText(input.serviceOption)}`;
  if (serviceKey === "|") return null;

  const orderByKey = new Map(input.orders.map(order => [`${order.id}:${Number(order.subOrderIndex || 0)}`, order]));
  const candidates = new Set<number>();
  for (const link of input.links) {
    const linkedOrder = orderByKey.get(`${link.registrationId}:${link.subOrderIndex}`);
    if (!linkedOrder || Number(linkedOrder.customerNumber || 0) !== customerNumber) continue;
    const linkedServiceKey = `${normalizeRepairText(linkedOrder.serviceName)}|${normalizeRepairText(linkedOrder.serviceOption)}`;
    if (linkedServiceKey === serviceKey) candidates.add(link.instanceId);
  }
  return candidates.size === 1 ? [...candidates][0] : null;
}
