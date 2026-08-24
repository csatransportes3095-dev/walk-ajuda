const API_BASE = "https://api.resend.com";
const API_KEY = String(process.env.RESEND_API_KEY || "").trim();

if (!API_KEY) {
  console.log("RESEND_API_KEY AUSENTE");
  console.log("Os pedidos antigos nao podem ser lidos pelo Resend nesta instancia.");
  process.exit(2);
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function requestJson(path, attempt = 1) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (response.status === 429 && attempt <= 5) {
    const retryAfter = Number(response.headers.get("retry-after") || 1);
    await sleep(Math.max(1000, retryAfter * 1000));
    return requestJson(path, attempt + 1);
  }
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text };
  }
  if (!response.ok) {
    const message = data?.message || data?.error || response.statusText;
    throw new Error(`Resend ${response.status}: ${message}`);
  }
  return data;
}

async function listAllSentEmails() {
  const emails = [];
  let after = "";
  for (let page = 0; page < 200; page += 1) {
    const query = new URLSearchParams({ limit: "100" });
    if (after) query.set("after", after);
    const result = await requestJson(`/emails?${query.toString()}`);
    const rows = Array.isArray(result.data) ? result.data : [];
    emails.push(...rows);
    if (!result.has_more || rows.length === 0) break;
    after = String(rows.at(-1)?.id || "");
    if (!after) break;
  }
  return emails;
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function plainText(value) {
  return decodeEntities(String(value || "")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function extractInfoRows(html) {
  const rows = {};
  const regex = /<td\b[^>]*>([\s\S]*?)<\/td>\s*<td\b[^>]*>([\s\S]*?)<\/td>/gi;
  for (const match of String(html || "").matchAll(regex)) {
    const label = plainText(match[1]).replace(/:\s*$/, "").toLowerCase();
    const value = plainText(match[2]);
    if (label && value && rows[label] === undefined) rows[label] = value;
  }
  return rows;
}

function digits(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizePhone(value) {
  const valueDigits = digits(value);
  return valueDigits.length >= 10 ? valueDigits.slice(-11) : "";
}

function normalizeOrderNumber(value) {
  const match = String(value || "").match(/\d+/);
  return match ? match[0] : "";
}

function statusFromText(text) {
  const normalized = String(text || "");
  const known = [
    [/(?:pedido\s+)?entregue|conclu[ií]do|finalizado/i, "entregue"],
    [/conta\s+ativa/i, "conta_ativa"],
    [/aguardando\s+ativa/i, "aguardando_ativacao"],
    [/foto\s+em\s+an[aá]lise/i, "foto_em_analise"],
    [/aguardando\s+agendamento/i, "aguardando_agendamento"],
    [/cancelado|recusado/i, "cancelado_ou_recusado"],
  ];
  return known.find(([pattern]) => pattern.test(normalized))?.[1] || "";
}

function isOrderRelated(email) {
  const subject = String(email.subject || "");
  return /(pedido|status|cadastro|comprovante)/i.test(subject);
}

async function inspectEmail(email) {
  const detail = await requestJson(`/emails/${encodeURIComponent(email.id)}`);
  const html = String(detail.html || "");
  const text = plainText(html || detail.text || "");
  const rows = extractInfoRows(html);
  const combined = `${email.subject || ""} ${text}`;
  const kind = /NOVO PEDIDO RECEBIDO/i.test(combined)
    ? "novo_pedido"
    : /(Atualiza[cç][aã]o do seu pedido|Novo Status|status)/i.test(combined)
      ? "atualizacao_status"
      : /pedido/i.test(combined)
        ? "pedido"
        : "outro";
  return {
    id: String(email.id),
    createdAt: String(email.created_at || detail.created_at || ""),
    subject: String(email.subject || detail.subject || ""),
    kind,
    orderNumber: normalizeOrderNumber(rows["nº pedido"] || rows["n° pedido"] || rows["pedido"]),
    phone: normalizePhone(rows["telefone"]),
    clientName: String(rows["cliente"] || rows["nome"] || "").trim(),
    service: String(rows["serviço"] || rows["servico"] || "").trim(),
    option: String(rows["opção"] || rows["opcao"] || "").trim(),
    email: String(rows["e-mail"] || rows["email"] || "").trim(),
    cpf: digits(rows["cpf"]).slice(-11),
    status: statusFromText(combined),
  };
}

function orderEvidenceKey(item) {
  if (item.orderNumber) return `N:${item.orderNumber}`;
  if (item.phone && item.service) {
    const day = item.createdAt.slice(0, 10);
    return `P:${item.phone}|${item.service.toUpperCase()}|${day}`;
  }
  return "";
}

async function main() {
  const all = await listAllSentEmails();
  const candidates = all.filter(isOrderRelated);
  const inspected = [];
  for (const email of candidates) {
    inspected.push(await inspectEmail(email));
    await sleep(230);
  }

  const evidence = inspected.filter(item => item.kind !== "outro");
  const uniqueOrders = new Set(evidence.map(orderEvidenceKey).filter(Boolean));
  const dated = all.map(item => String(item.created_at || "")).filter(Boolean).sort();
  const subjectCounts = {};
  for (const item of candidates) {
    const subject = String(item.subject || "(sem assunto)").replace(/\s+/g, " ").trim();
    subjectCounts[subject] = (subjectCounts[subject] || 0) + 1;
  }
  const topSubjects = Object.entries(subjectCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([assunto, total]) => ({ assunto, total }));

  console.log("VARREDURA RESEND — TODOS OS EMAILS ANTIGOS", {
    emailsEnviadosTotal: all.length,
    primeiraData: dated[0] || null,
    ultimaData: dated.at(-1) || null,
    emailsRelacionadosAPedidos: candidates.length,
    novosPedidosEncontrados: evidence.filter(item => item.kind === "novo_pedido").length,
    atualizacoesDeStatusEncontradas: evidence.filter(item => item.kind === "atualizacao_status").length,
    referenciasUnicasDePedido: uniqueOrders.size,
    pedidosComNumero: new Set(evidence.map(item => item.orderNumber).filter(Boolean)).size,
    clientesComTelefone: new Set(evidence.map(item => item.phone).filter(Boolean)).size,
    evidenciasDeEntregue: evidence.filter(item => item.status === "entregue").length,
  });
  console.log("ASSUNTOS RELACIONADOS", topSubjects);
  console.log("STATUS ENCONTRADOS", evidence.reduce((totals, item) => {
    const key = item.status || "sem_status_identificado";
    totals[key] = (totals[key] || 0) + 1;
    return totals;
  }, {}));
  console.log("MODO VARREDURA: nenhum pedido foi alterado");
}

main().catch(error => {
  console.error("FALHA NA VARREDURA DO RESEND", error);
  process.exit(1);
});
