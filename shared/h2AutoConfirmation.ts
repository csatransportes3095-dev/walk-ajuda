import { z } from "zod";

/** All editable H2 AUTO confirmation copy. Navigation and security rules stay server-controlled. */
export const H2_AUTO_CONFIRMATION_DEFAULTS = {
  "identificationWelcome": "⚡ *H2 COLOMBIANO* 🇨🇴\n🤖 *CENTRAL DE ATENDIMENTO*\n\n👋 Olá! Seja bem-vindo!\n\n🔐 Para sua segurança,\nprecisamos identificar\nse você já é nosso cliente.\n\n1️⃣ *SIM, JÁ SOU CLIENTE*\n2️⃣ *NÃO SOU CLIENTE*\n3️⃣ *CONSULTAR MINHAS INDICAÇÕES*\n\n⌨️ Digite *1*, *2* ou *3*.\n🔙 *MENU* para início.\n━━━━━━━━━━━━━━━━\n🛡️ *EQUIPE H2 COLOMBIANO* 🇨🇴",
  "existingCustomerPrompt": "✅ *JÁ SOU CLIENTE*\n\n📱 Informe o telefone\ncadastrado no H2 Colombiano,\ncom DDD, para confirmar\nsua identidade.\n\n⌨️ Envie 11 números com DDD.\n\n🔙 Digite *0* para voltar.\n🏠 Digite *MENU* para início.",
  "newCustomerPrompt": "🆕 *NOVO CLIENTE*\n\n🇨🇴 Atendemos somente\npor indicação.\n\n📱 Informe o telefone\ncom DDD de quem\nindicou você.\n\n⌨️ Envie 11 números com DDD.\n\n🔙 Digite *0* para voltar.\n🏠 Digite *MENU* para início.",
  "phonePrompt": "💰 *MINHAS INDICAÇÕES*\n\nPara proteger seus dados,\nconfirme sua identidade.\n\n📱 Informe seu telefone\ncadastrado com DDD.\n\n⌨️ Digite 11 números.\n🔙 *0* para voltar.\n🏠 *MENU* para início.",
  "phoneInvalid": "O telefone está fora do formato.\nInforme *11 números com DDD*,\nsem espaços ou símbolos.",
  "phoneNotFound": "Não foi possível localizar\nou confirmar um cadastro ativo\ncom esse telefone.",
  "referrerPhoneInvalid": "O telefone do indicador está\nfora do formato. Informe\n*11 números com DDD*.",
  "referrerNotFound": "Não foi possível localizar\nou autorizar o indicador\ncom esse telefone.",
  "referralsPhoneInvalid": "Informe o telefone do seu\ncadastro com *11 números e DDD*,\nsem espaços ou símbolos.",
  "referralsPhoneNotFound": "Não foi possível confirmar\num cadastro autorizado\npara consultar indicações.",
  "noIndicatorMessage": "🔐 *INDICAÇÃO OBRIGATÓRIA*\n\nPara continuar, informe\no telefone de um indicador\ncadastrado e autorizado.\n\n👨‍💻 Digite *6* para ajuda.\n\n🔙 Digite *0* para voltar.\n🏠 Digite *MENU* para início.",
  "codeSent": "📧 *CONFIRMAÇÃO DE E-MAIL*\n\n✅ Enviamos um código ao\ne-mail do seu cadastro.\n\n🔢 Digite os *6 números*.\n⏳ Validade: *10 minutos*.\n\n🔙 *0* para voltar.\n🏠 *MENU* para início.",
  "codePrompt": "🔢 Informe os *6 números*\nrecebidos no e-mail.\n\n🔙 *0* para voltar.\n🏠 *MENU* para início.",
  "codeInvalid": "⚠️ Código inválido ou expirado.\nConfira o e-mail.\n\n🔙 *0* para voltar.\n🏠 *MENU* para início.",
  "codeResendWait": "⏳ Aguarde um minuto\npara solicitar outro código.\n\n🔙 *0* ou *MENU* para voltar.",
  "codeRateLimit": "⏳ Limite de tentativas atingido.\nTente mais tarde.",
  "codeRequestWait": "⏳ Aguarde e tente novamente.",
  "codeSendFailed": "⚠️ Não foi possível enviar\no código agora.\n\nTente novamente.",
  "customerProfileUpdate": "⚠️ *H2 COLOMBIANO* 🇨🇴\n📝 *ATUALIZAÇÃO DE CADASTRO*\n\nPara continuar seu atendimento,\né necessário completar ou\natualizar seu cadastro.\n\n🔗 *ACESSE SEU CADASTRO:*\nhttps://h2colombiano.com/login\n\n✅ Faça login e preencha\nos dados que estiverem pendentes.\n\n📱 Depois, volte ao WhatsApp\ne informe seu telefone com DDD.\n\n👨‍💻 Se não conseguir acessar,\nsolicite atendimento humano.\n\n🛡️ *EQUIPE H2 COLOMBIANO* 🇨🇴",
  "customerAccessNotConfirmed": "⚠️ *H2 COLOMBIANO* 🇨🇴\n🚫 *ACESSO NÃO CONFIRMADO*\n\nNão foi possível confirmar\nseu acesso com esse telefone.\n\n📱 Confira o número com DDD\ne o telefone do seu cadastro.\n\n👨‍💻 Se estiver correto, solicite\natendimento humano.\n\n🛡️ *EQUIPE H2 COLOMBIANO* 🇨🇴",
  "referrerRateLimit": "⏳ Muitas tentativas.\nAguarde e tente novamente.",
  "referralHumanHelp": "👨‍💻 *ATENDIMENTO HUMANO*\n\nSua solicitação foi encaminhada.\n⏳ Tempo médio: 5 minutos.\n\n🏠 *MENU* para início."
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
