/**
 * Normaliza o celular brasileiro ANTES da validação nos três fluxos do H2 AUTO.
 * Aceita número sem máscara, com parênteses, espaços, ponto, hífen e DDI 55,
 * inclusive +55 e 0055. Nunca extrai números de mensagens livres ou combina
 * múltiplos telefones: a entrada precisa conter somente telefone e máscara.
 *
 * Formato é diferente de autorização: cadastro, indicador, OTP e bloqueios
 * continuam sendo verificados pelo fluxo existente.
 */
export function normalizeH2AutoPhone11(answer: string): string {
  if (typeof answer !== "string") return "";
  const value = answer.trim();
  if (!value || value.length > 64 || !/^[0-9\s()+.\-–—/]+$/.test(value)) return "";
  let digits = value.replace(/\D/g, "");
  if (digits.length === 15 && digits.startsWith("0055")) digits = digits.slice(4);
  else if (digits.length === 13 && digits.startsWith("55")) digits = digits.slice(2);
  if (!/^[1-9][1-9]9[0-9]{8}$/.test(digits)) return "";
  if (/^(.)\1{10}$/.test(digits)) return "";
  return digits;
}

/** Validação estrutural, independente da máscara digitada pelo cliente. */
export function validH2AutoPhone11(answer: string): boolean {
  return Boolean(normalizeH2AutoPhone11(answer));
}

/** Menu cannot bypass a phone-number challenge or a persistent block.
 * It remains available only while the customer is entering a verification code.
 */
export function allowsH2AutoMenuReset(stage: string, answer: string): boolean {
  if (stage !== "customer_code") return false;
  const normalized = answer.trim().toLowerCase();
  return normalized === "menu" || normalized === "inicio";
}

/** Phone stages reject every non-mobile answer, including MENU, 0 and words. */
export function invalidH2AutoPhoneStageAnswer(stage: string, answer: string): boolean {
  return (stage === "customer_phone" || stage === "referrals_phone" || stage === "referral_phone") &&
    !validH2AutoPhone11(answer);
}

/** Pedido breve de orientação; nunca conta como telefone ou tentativa de OTP. */
export function isH2AutoHelpRequest(value: string): boolean {
  const text = String(value ?? "").trim().toLowerCase();
  return /^\?{1,3}$/.test(text) || text === "ajuda";
}

/** The first numbered option must be processed even when a conversation has
 * no existing server session. Otherwise the client sees the opening menu again,
 * and a retry of '2' is incorrectly counted as a phone validation attempt.
 */
export function initialH2AutoChoiceStage(input: string):
  "customer_phone" | "referral_phone" | "referrals_phone" | null {
  switch (input.trim()) {
    case "1": return "customer_phone";
    case "2": return "referral_phone";
    case "3": return "referrals_phone";
    default: return null;
  }
}


/**
 * Uma frase claramente de NOVO cliente equivale a escolher 2 no menu.
 * Nao identifica ninguem e nunca libera cadastro: o servidor ainda exige
 * o telefone do INDICADOR e a validacao existente.
 *
 * Somente na etapa "choice"/primeiro contato; nao deve operar em OTP,
 * telefones de clientes ou sessoes ja autenticadas.
 */
export function h2AutoNaturalNewCustomerIntent(input: string): boolean {
  if (typeof input !== "string" || input.length > 220) return false;
  const text = input.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!text || /\d{5,}/.test(text) || /^(?:menu|inicio|voltar|0|[1-9]|10|h2|h3)$/.test(text))
    return false;
  if (/\b(?:nao sou cliente|ainda nao sou cliente|novo cliente|primeiro cadastro|primeira conta)\b/.test(text)) return true;
  // Uma pessoa ja cadastrada, um indicador e pedidos de comissao nao podem
  // cair por engano na validacao de NOVO cliente.
  if (/\b(?:ja sou cliente|sou cliente|cliente antigo|ja tenho cadastro|ja tenho conta|ja comprei|meu pedido|minhas indicacoes|indiquei|sou indicador|comissao|cadastro incompleto|conta desativada|conta bloqueada|reembolso|cancelamento|emprestimo)\b/.test(text))
    return false;
  if (/\b(?:nao fui indicado|nao fui indicada|nao me indicaram|nao me indicou|ninguem me indicou|sem indicador|nao tenho indicador)\b/.test(text))
    return false;
  const referred =
    /\b(?:fui|foi|sou|estou)\s+indicad[oa]\b/.test(text) ||
    /\bme\s+indic(?:ou|aram)\b/.test(text) ||
    /\bindicad[oa]\s+(?:por|pelo|pela)\b/.test(text) ||
    /\bindic(?:ou|aram)\b.{0,55}\b(?:fazer|criar|abrir|comprar|ter)\b.{0,25}\b(?:conta|cadastro)\b/.test(text);
  if (referred) return true;
  if (/\b(?:nao sou cliente|ainda nao sou cliente|novo cliente|primeiro cadastro|primeira conta)\b/.test(text))
    return true;
  // "Queria uma conta" ou "Quero criar uma conta" = novo pedido,
  // mas nunca confundir com duvidas sobre login ou recuperacao de conta.
  if (/\b(?:login|entrar|acessar|acesso|recuperar|codigo|senha|atualizar|editar|minha conta)\b/.test(text))
    return false;
  return /\b(?:quero|queria|gostaria|preciso|necessito)\b.{0,35}\b(?:fazer|criar|abrir|comprar|ter|uma|um)\b.{0,18}\b(?:conta|cadastro)\b/.test(text);
}


/** Natural language may select a secure entry flow, never grant access.
 * Only runs on first contact / audience choice (and duplicate phone prompts).
 */
function normalizeH2AutoIntent(input: string): string {
  if (typeof input !== "string" || input.length > 220) return "";
  const text = input.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!text || /\d{5,}/.test(text) ||
      /^(?:menu|inicio|voltar|0|[1-9]|10|h2|h3)$/.test(text) ||
      /(?:https?:\/\/|www\.|@)/i.test(input)) return "";
  return text;
}

/** "Quero acompanhar meu pedido" -> prompt for REGISTERED CUSTOMER phone + e-mail OTP.
 * The returned intent never discloses any personal order data.
 */
export function h2AutoNaturalExistingCustomerIntent(input: string): boolean {
  const text = normalizeH2AutoIntent(input);
  if (!text || /\b(?:nao sou cliente|ainda nao sou cliente|novo cliente|nao tenho cadastro|nao tenho conta)\b/.test(text) ||
      /\b(?:minhas indicacoes|meus indicados|quem indiquei|comissoes|comissao|indicador|indicacao)\b/.test(text)) return false;
  if (/^(?:ja sou cliente|sou cliente|ja tenho cadastro|tenho cadastro|ja tenho conta|sou cliente antigo)$/.test(text))
    return true;
  return /\b(?:acompanhar|consultar|ver|rastrear|checar|saber)\b.{0,60}\b(?:meu|meus|o)\s+pedidos?\b/.test(text) ||
    /\b(?:status|andamento|situacao)\b.{0,42}\b(?:do|dos|de)\s+(?:meu|meus)?\s*pedidos?\b/.test(text) ||
    /\b(?:meu|meus)\s+pedidos?\b.{0,35}\b(?:status|andamento|situacao)\b/.test(text);
}

/** Existing registered referrers use the separate indications phone/OTP flow. */
export function h2AutoNaturalReferralsIntent(input: string): boolean {
  const text = normalizeH2AutoIntent(input);
  if (!text || /\b(?:indicador|fui indicado|nao sou cliente|novo cliente|me indicou)\b/.test(text))
    return false;
  return /\b(?:minhas indicacoes|meus indicados|quem indiquei|minhas comissoes|minha comissao|consultar comissao|ver comissao|ver indicacoes)\b/.test(text) ||
    /\b(?:consultar|ver|acompanhar)\b.{0,40}\b(?:minhas|as)\s+indicacoes\b/.test(text);
}

/** Greeting only at audience choice: preserve the full ADM-defined menu. */
export function h2AutoGreetingWelcome(input: string, menu: string): string {
  const text = normalizeH2AutoIntent(input);
  const prefix: Record<string,string> = {
    "bom dia": "☀️ *Bom dia!* 😊",
    "boa tarde": "🌤️ *Boa tarde!* 😊",
    "boa noite": "🌙 *Boa noite!* 😊",
    "oi": "👋 *Olá!* 😊",
    "ola": "👋 *Olá!* 😊",
    "opa": "👋 *Olá!* 😊",
  };
  const greeting = prefix[text];
  return greeting ? greeting + "\n\nPode escrever sua dúvida ou escolher uma opção:\n\n" + menu : menu;
}

/** Ignore only exact repeated selections matching the current phone stage.
 * Never grant access or reset a security block with these duplicate inputs.
 */
export function repeatedH2AutoChoice(stage: string, input: string): boolean {
  return initialH2AutoChoiceStage(input) === stage ||
    (stage === "customer_phone" && h2AutoNaturalExistingCustomerIntent(input)) ||
    (stage === "referrals_phone" && h2AutoNaturalReferralsIntent(input));
}

/** Navigation takes priority over phone format validation, never over a block. */
export function h2AutoNavigationCommand(answer: string): "home" | "back" | null {
  const normalized=answer.trim().toLowerCase();
  if (normalized==="menu" || normalized==="inicio" || normalized==="início" || normalized==="manu") return "home";
  if (normalized==="0" || normalized==="voltar") return "back";
  return null;
}
