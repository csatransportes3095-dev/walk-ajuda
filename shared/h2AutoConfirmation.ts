import { z } from "zod";

/** All editable H2 AUTO confirmation copy. Navigation and security rules stay server-controlled. */
export const H2_AUTO_CONFIRMATION_DEFAULTS = {
  identificationWelcome:
    "⚡ *H2 COLOMBIANO* 🇨🇴\n📋 *COMO DESEJA CONTINUAR?*\n\n1️⃣ *JÁ SOU CLIENTE*\n2️⃣ *AINDA NÃO SOU CLIENTE*\n3️⃣ *MINHAS INDICAÇÕES*\n\n⌨️ Digite *1, 2 ou 3*.\n🏠 *MENU* para início.",
  existingCustomerPrompt:
    "✅ *JÁ SOU CLIENTE*\n\n📱 Digite seu telefone\ncom DDD (11 números).\n\n🔙 *0* para voltar.\n🏠 *MENU* para início.",
  newCustomerPrompt:
    "🆕 *NOVO CLIENTE*\n\n📱 Informe o telefone\ncom DDD do seu indicador.\n\n🔙 *0* para voltar.\n🏠 *MENU* para início.",
  phonePrompt:
    "💰 *MINHAS INDICAÇÕES*\n\n📱 Informe seu telefone\ncadastrado com DDD.\n\n🔙 *0* para voltar.\n🏠 *MENU* para início.",
  phoneInvalid:
    "⚠️ Informe um celular válido\nDigite 11 números com DDD.",
  phoneNotFound:
    "⚠️ Não foi possível confirmar\nseu acesso. Confira o DDD.",
  referrerPhoneInvalid:
    "⚠️ Informe o celular do indicador\nDigite 11 números com DDD.",
  referrerNotFound:
    "⚠️ Não foi possível confirmar\no indicador informado.",
  referralsPhoneInvalid:
    "⚠️ Telefone inválido.\nDigite 11 números com DDD.",
  referralsPhoneNotFound:
    "⚠️ Não foi possível confirmar\no acesso às indicações.",
  noIndicatorMessage:
    "🔐 *INDICADOR OBRIGATÓRIO*\n\n📱 Informe o telefone\ncom DDD de um indicador\ncadastrado e autorizado.\n\n🏠 *MENU* para início.",
  codeSent:
    "📧 *CÓDIGO ENVIADO*\n\n🔢 Digite os 6 números\nenviados ao seu e-mail.\n⏳ Válido por 10 minutos.\n\n🔙 *0* para voltar.",
  codePrompt:
    "🔢 Digite o código de\n6 números do e-mail.\n\n🔙 *0* para voltar.",
  codeInvalid:
    "⚠️ Código inválido ou\nexpirado. Confira o e-mail.\n\n🔙 *0* para voltar.",
  codeResendWait:
    "⏳ Aguarde 1 minuto\npara pedir outro código.",
  codeRateLimit:
    "⏳ Muitas tentativas.\nTente mais tarde.",
  codeRequestWait:
    "⏳ Aguarde e tente novamente.",
  codeSendFailed:
    "⚠️ Código não enviado.\nTente novamente.",
  customerProfileUpdate:
    "📝 *ATUALIZE SEU CADASTRO*\n\n✅ Complete os dados pendentes:\nhttps://h2colombiano.com/login\n\n📱 Depois, volte aqui.\n🏠 *MENU* para início.",
  customerAccessNotConfirmed:
    "🚫 *ACESSO NÃO CONFIRMADO*\n\n📱 Confira seu telefone\ncom DDD. Se persistir,\nsolicite atendimento.",
  referrerRateLimit:
    "⏳ Muitas tentativas.\nAguarde e tente novamente.",
  referralHumanHelp:
    "👨‍💻 *ATENDIMENTO HUMANO*\n\n✅ Encaminhado à equipe.\n⏳ Espera média: 5 minutos.\n🕒 Atendimento: 11h às 23h.\n\n🏠 *MENU* para início.",
} as const;

export const H2_AUTO_CONFIRMATION_GROUPS = [
  {
    "id": "inicio",
    "title": "Boas-vindas e identificação",
    "description": "Estas mensagens são enviadas pelo servidor antes do fluxo de atendimento.",
    "fields": [
      {
        "key": "identificationWelcome",
        "label": "Mensagem inicial (1 SIM / 2 NÃO / 3 indicações)",
        "help": "Não altere os números 1, 2 e 3; eles fazem parte do fluxo."
      },
      {
        "key": "existingCustomerPrompt",
        "label": "1 — Já sou cliente: solicitar telefone",
        "help": ""
      },
      {
        "key": "newCustomerPrompt",
        "label": "2 — Não sou cliente: solicitar indicador",
        "help": ""
      },
      {
        "key": "phonePrompt",
        "label": "3 — Minhas indicações: solicitar telefone",
        "help": ""
      }
    ]
  },
  {
    "id": "validacao",
    "title": "Confirmações e erros de telefone",
    "description": "Mensagens usadas em cada etapa. O contador de tentativas e o bloqueio do robô permanecem obrigatórios.",
    "fields": [
      {
        "key": "phoneInvalid",
        "label": "Telefone do cliente em formato inválido",
        "help": "O aviso de tentativas é acrescentado automaticamente."
      },
      {
        "key": "phoneNotFound",
        "label": "Cadastro não confirmado",
        "help": "Não revelar se um telefone específico existe no banco."
      },
      {
        "key": "referrerPhoneInvalid",
        "label": "Telefone do indicador em formato inválido",
        "help": ""
      },
      {
        "key": "referrerNotFound",
        "label": "Indicador não validado",
        "help": ""
      },
      {
        "key": "referralsPhoneInvalid",
        "label": "Telefone para consultar indicações inválido",
        "help": ""
      },
      {
        "key": "referralsPhoneNotFound",
        "label": "Cadastro de indicações não confirmado",
        "help": ""
      },
      {
        "key": "noIndicatorMessage",
        "label": "Cliente informa que não tem indicador",
        "help": ""
      }
    ]
  },
  {
    "id": "email",
    "title": "Confirmação de e-mail e código",
    "description": "O código de 6 dígitos, validade, envio e limite de tentativas não são alterados por estes textos.",
    "fields": [
      {
        "key": "codeSent",
        "label": "Código enviado ao e-mail",
        "help": ""
      },
      {
        "key": "codePrompt",
        "label": "Pedir código com 6 números",
        "help": ""
      },
      {
        "key": "codeInvalid",
        "label": "Código inválido ou expirado",
        "help": ""
      },
      {
        "key": "codeResendWait",
        "label": "Aguardar para pedir outro código",
        "help": ""
      },
      {
        "key": "codeRateLimit",
        "label": "Limite de tentativas de código/telefone",
        "help": ""
      },
      {
        "key": "codeRequestWait",
        "label": "Código ainda sendo processado",
        "help": ""
      },
      {
        "key": "codeSendFailed",
        "label": "Não foi possível enviar o código",
        "help": ""
      }
    ]
  },
  {
    "id": "outros",
    "title": "Cadastro e atendimento",
    "description": "Mensagens de situações especiais, sem alterar validações ou permissões.",
    "fields": [
      {
        "key": "customerProfileUpdate",
        "label": "Cadastro incompleto — atualizar dados",
        "help": ""
      },
      {
        "key": "customerAccessNotConfirmed",
        "label": "Acesso do cliente não confirmado",
        "help": ""
      },
      {
        "key": "referrerRateLimit",
        "label": "Muitas tentativas de indicar",
        "help": ""
      },
      {
        "key": "referralHumanHelp",
        "label": "Novo cliente solicita atendente (6)",
        "help": ""
      }
    ]
  }
] as const;

export const h2AutoConfirmationSchema = z.object({
  identificationWelcome: z.string().trim().min(1).max(2000).default(H2_AUTO_CONFIRMATION_DEFAULTS.identificationWelcome),
  existingCustomerPrompt: z.string().trim().min(1).max(2000).default(H2_AUTO_CONFIRMATION_DEFAULTS.existingCustomerPrompt),
  newCustomerPrompt: z.string().trim().min(1).max(2000).default(H2_AUTO_CONFIRMATION_DEFAULTS.newCustomerPrompt),
  phonePrompt: z.string().trim().min(1).max(2000).default(H2_AUTO_CONFIRMATION_DEFAULTS.phonePrompt),
  phoneInvalid: z.string().trim().min(1).max(2000).default(H2_AUTO_CONFIRMATION_DEFAULTS.phoneInvalid),
  phoneNotFound: z.string().trim().min(1).max(2000).default(H2_AUTO_CONFIRMATION_DEFAULTS.phoneNotFound),
  referrerPhoneInvalid: z.string().trim().min(1).max(2000).default(H2_AUTO_CONFIRMATION_DEFAULTS.referrerPhoneInvalid),
  referrerNotFound: z.string().trim().min(1).max(2000).default(H2_AUTO_CONFIRMATION_DEFAULTS.referrerNotFound),
  referralsPhoneInvalid: z.string().trim().min(1).max(2000).default(H2_AUTO_CONFIRMATION_DEFAULTS.referralsPhoneInvalid),
  referralsPhoneNotFound: z.string().trim().min(1).max(2000).default(H2_AUTO_CONFIRMATION_DEFAULTS.referralsPhoneNotFound),
  noIndicatorMessage: z.string().trim().min(1).max(2000).default(H2_AUTO_CONFIRMATION_DEFAULTS.noIndicatorMessage),
  codeSent: z.string().trim().min(1).max(2000).default(H2_AUTO_CONFIRMATION_DEFAULTS.codeSent),
  codePrompt: z.string().trim().min(1).max(2000).default(H2_AUTO_CONFIRMATION_DEFAULTS.codePrompt),
  codeInvalid: z.string().trim().min(1).max(2000).default(H2_AUTO_CONFIRMATION_DEFAULTS.codeInvalid),
  codeResendWait: z.string().trim().min(1).max(2000).default(H2_AUTO_CONFIRMATION_DEFAULTS.codeResendWait),
  codeRateLimit: z.string().trim().min(1).max(2000).default(H2_AUTO_CONFIRMATION_DEFAULTS.codeRateLimit),
  codeRequestWait: z.string().trim().min(1).max(2000).default(H2_AUTO_CONFIRMATION_DEFAULTS.codeRequestWait),
  codeSendFailed: z.string().trim().min(1).max(2000).default(H2_AUTO_CONFIRMATION_DEFAULTS.codeSendFailed),
  customerProfileUpdate: z.string().trim().min(1).max(2000).default(H2_AUTO_CONFIRMATION_DEFAULTS.customerProfileUpdate),
  customerAccessNotConfirmed: z.string().trim().min(1).max(2000).default(H2_AUTO_CONFIRMATION_DEFAULTS.customerAccessNotConfirmed),
  referrerRateLimit: z.string().trim().min(1).max(2000).default(H2_AUTO_CONFIRMATION_DEFAULTS.referrerRateLimit),
  referralHumanHelp: z.string().trim().min(1).max(2000).default(H2_AUTO_CONFIRMATION_DEFAULTS.referralHumanHelp),
});
export type H2AutoConfirmation = z.infer<typeof h2AutoConfirmationSchema>;
export type H2AutoConfirmationKey = keyof H2AutoConfirmation;
