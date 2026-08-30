import fs from 'node:fs';

const path = 'client/src/components/WelcomeScreen.tsx';
let s = fs.readFileSync(path, 'utf8');

function replaceOnce(from, to, label) {
  const count = s.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: esperado 1 trecho, encontrado ${count}`);
  s = s.replace(from, to);
}

replaceOnce(
`function hasActiveHomeAccessGrant() {\n  const expiresAt = Number(sessionStorage.getItem(HOME_ACCESS_GRANTED_KEY) || 0);`,
`function clearPreviousCustomerIdentity() {\n  const localKeys = [\n    "cp_token",\n    "walk_access_granted",\n    "walk_access_code",\n    "walk_access_type",\n    "walk_access_expires",\n    "walk_client_phone",\n    "customer_update_phone_hint",\n    "customer_update_token",\n  ];\n  for (const key of localKeys) localStorage.removeItem(key);\n\n  const sessionKeys = [\n    "h2_customer_return_to",\n    "walk_home_existing_phone",\n    "walk_home_referral_phone",\n    "walk_home_new_phone",\n  ];\n  for (const key of sessionKeys) sessionStorage.removeItem(key);\n}\n\nfunction hasActiveHomeAccessGrant() {\n  const expiresAt = Number(sessionStorage.getItem(HOME_ACCESS_GRANTED_KEY) || 0);`,
  'helper para limpar identidade anterior',
);

replaceOnce(
`    if (location === "/") {\n      if (justClickedCard.current) {`,
`    if (location === "/") {\n      // A tela inicial nunca herda a identidade do cliente anterior.\n      // Primeiro o usuario escolhe a rota; depois informa telefone/login;\n      // somente entao o sistema pode verificar se existe atualizacao pendente.\n      clearPreviousCustomerIdentity();\n      if (justClickedCard.current) {`,
  'limpeza ao entrar na home',
);

replaceOnce(
`  const handleFazerPedido = () => {\n    justClickedCard.current = true;`,
`  const handleFazerPedido = () => {\n    clearPreviousCustomerIdentity();\n    justClickedCard.current = true;`,
  'limpeza no fazer pedido',
);

replaceOnce(
`  const handleAcompanhar = () => {\n    sessionStorage.setItem(WELCOME_CHOICE_KEY, "acompanhar");`,
`  const handleAcompanhar = () => {\n    clearPreviousCustomerIdentity();\n    sessionStorage.setItem(WELCOME_CHOICE_KEY, "acompanhar");`,
  'limpeza no acompanhar',
);

replaceOnce(
`  const handleExtraBtn = (url: string, waMsg?: string, openInNewTab?: number) => {\n    sessionStorage.setItem(WELCOME_CHOICE_KEY, "extra");`,
`  const handleExtraBtn = (url: string, waMsg?: string, openInNewTab?: number) => {\n    clearPreviousCustomerIdentity();\n    sessionStorage.setItem(WELCOME_CHOICE_KEY, "extra");`,
  'limpeza nos botoes extras',
);

fs.writeFileSync(path, s);
console.log('Home corrigida: nenhuma rota reutiliza cliente anterior antes do telefone/login.');
