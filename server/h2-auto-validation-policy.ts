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
  if (/\b(?:login|entrar|acessar|acesso|recuperar|codigo|senha|atualizar|editar|minha conta|meu cadastro)\b/.test(text))
    return false;
  return /\b(?:quero|queria|gostaria|preciso|necessito)\b.{0,35}\b(?:fazer|criar|abrir|comprar|ter|uma|um)\b.{0,18}\b(?:conta|cadastro)\b/.test(text);
}

/** Ignore only exact repeated selections matching the current phone stage.
 * Never grant access or reset a security block with these duplicate inputs.
 */
export function repeatedH2AutoChoice(stage: string, input: string): boolean {
  return initialH2AutoChoiceStage(input) === stage;
}

/** Navigation takes priority over phone format validation, never over a block. */
export function h2AutoNavigationCommand(answer: string): "home" | "back" | null {
  const normalized=answer.trim().toLowerCase();
  if (normalized==="menu" || normalized==="inicio" || normalized==="início" || normalized==="manu") return "home";
  if (normalized==="0" || normalized==="voltar") return "back";
  return null;
}
