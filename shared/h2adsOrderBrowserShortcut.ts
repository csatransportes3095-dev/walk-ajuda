import { normalizeH2AdsRoutingText } from "./h2adsGroupRouting";

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
  instanceId?: number;
}): H2AdsOrderBrowserShortcutState | null {
  // ABRIR/FECHAR nunca deve adivinhar. O controle direto exige o vínculo exato
  // entre o pedido/subpedido exibido no ADM e a instância H2ADS.
  const matches = input.links.filter(item => item.registrationId === input.registrationId && item.subOrderIndex === input.subOrderIndex);
  // Fail closed: multiple instances require an explicit selection; never silently pick the first.
  if (matches.length > 1 && input.instanceId === undefined) return null;
  const link = matches.find(item => input.instanceId === undefined || item.instanceId === input.instanceId);
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
  latestStatus?: string | null;
};

export type H2AdsOrderRepairInstanceLike = { id: number; groupId?: number | null };
export type H2AdsOrderRepairGroupLike = { id: number; name: string };

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

/** Pedidos finalizados/cancelados nunca emprestam instâncias a novos pedidos. */
export function isH2AdsFinalizedOrderStatus(status: unknown): boolean {
  return ["entregue", "pedido entregue", "documento entregue", "login de acesso", "cancelado"]
    .includes(normalizeH2AdsRoutingText(status));
}

/** O grupo ENTREGUE no H2ADS também significa que a instância pertence ao pedido anterior. */
export function isH2AdsDeliveredGroupName(groupName: unknown): boolean {
  return /^(?:grupo )?entregues?$/.test(normalizeH2AdsRoutingText(groupName));
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
  instances?: H2AdsOrderRepairInstanceLike[];
  groups?: H2AdsOrderRepairGroupLike[];
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

    // Nunca sugerir transferência de uma instância pertencente a um pedido finalizado.
    // A instância pode estar no grupo ENTREGUE mesmo que o status do pedido esteja desatualizado.
    if (isH2AdsFinalizedOrderStatus(linkedOrder.latestStatus)) continue;
    const instance = input.instances?.find(item => item.id === link.instanceId);
    if (input.instances && !instance) continue;
    const group = input.groups?.find(item => item.id === instance?.groupId);
    if (isH2AdsDeliveredGroupName(group?.name)) continue;

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


/**
 * Texto operacional seguro para o ADM. As categorias vêm do Worker, nunca
 * de detalhes sensíveis do proxy; não libera o botão ABRIR nem ignora verificações.
 */
export function describeH2AdsOrderBrowserBlock(input: {
  state: string;
  reason: string | null;
  errorCategory?: string | null;
  networkHealthStatus?: string | null;
}): { message: string; guidance: string } {
  const { state, reason, errorCategory, networkHealthStatus } = input;
  if (reason === "Worker offline.") return {
    message: "Worker offline.",
    guidance: "Confira o Worker no Windows e o status ONLINE no H2ADS. Não crie outra instância.",
  };
  if (reason === "Worker ainda não atribuído.") return {
    message: "Instância sem Worker atribuído.",
    guidance: "Atribua o Worker desta instância no painel H2ADS.",
  };
  if (reason === "Instância H2ADS arquivada.") return {
    message: "Instância arquivada.",
    guidance: "Confira o status da instância no painel H2ADS antes de tentar abrir.",
  };
  if (state === "queued" || state === "preparing") return {
    message: "Preparação do navegador em andamento.",
    guidance: "Aguarde a confirmação do Worker. A tela atualiza automaticamente.",
  };
  if (state === "browser_open") return {
    message: "Chrome já registrado como aberto.",
    guidance: "Confira a janela no Windows. Não prepare novamente enquanto estiver aberto.",
  };
  if (networkHealthStatus && networkHealthStatus !== "healthy") return {
    message: "Rota do proxy não aprovada (" + networkHealthStatus + ").",
    guidance: "Use PREPARAR NOVAMENTE: o sistema verificará a rota antes de preparar. Não troque o proxy sem confirmar a falha.",
  };
  const categoryHints: Record<string, string> = {
    proxy_dns_timeout: "o endereço do proxy demorou a responder",
    proxy_dns_failed: "o endereço do proxy não foi encontrado (DNS)",
    proxy_dns_temporary_failure: "a resolução de DNS do proxy falhou temporariamente",
    proxy_tcp_timeout: "o proxy não respondeu à conexão TCP",
    proxy_tcp_refused: "o proxy recusou a conexão",
    proxy_tcp_failed: "a conexão TCP com o proxy falhou",
    proxy_auth_407: "o proxy rejeitou o usuário ou a senha",
    proxy_tls_failed: "falha no TLS do proxy",
    proxy_request_timeout: "a requisição através do proxy expirou",
    proxy_https_failed: "a conexão HTTPS através do proxy falhou",
    proxy_unavailable: "o proxy está indisponível",
    proxy_input_invalid_json: "a configuração do proxy é inválida",
    route_unavailable: "a rota protegida da instância está indisponível",
    relay_setup_failed: "o relay local do Worker não foi preparado",
    hard_kill_switch_unavailable: "o firewall obrigatório do H2ADS não foi validado",
    dedicated_browser_unavailable: "o navegador dedicado H2ADS não foi encontrado",
    node_missing: "o Node.js está ausente do Worker",
    npm_missing: "o npm está ausente do Worker",
    profile_missing: "o perfil local não foi preparado",
    profile_snapshot_failed: "o snapshot do perfil falhou",
    leak_protection_failed: "a proteção contra vazamento de rede falhou",
    worker_execution_failed: "a execução do comando no Worker falhou",
  };
  if (state === "blocked") return {
    message: errorCategory && Object.hasOwn(categoryHints, errorCategory)
      ? "Preparação bloqueada: " + categoryHints[errorCategory] + "."
      : "A preparação foi bloqueada pelo Worker" + (errorCategory && /^[a-z0-9_]{1,64}$/i.test(errorCategory) ? " (" + errorCategory + ")" : "") + ".",
    guidance: "Use PREPARAR NOVAMENTE para revalidar a rota. Se continuar bloqueado, consulte o proxy e o Worker no H2ADS.",
  };
  if (state === "not_prepared") return {
    message: "Instância ainda não preparada.",
    guidance: "Clique PREPARAR NOVAMENTE. O botão ABRIR será liberado quando o Worker aprovar a rota.",
  };
  return {
    message: reason || "O navegador ainda não foi liberado.",
    guidance: "Confira o status da instância no H2ADS. Não crie um perfil novo para tentar corrigir.",
  };
}
