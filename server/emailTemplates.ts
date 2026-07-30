/**
 * Templates de e-mail profissionais â€” H2 COLOMBIANO
 * Todos os e-mails do sistema usam estas funÃ§Ãµes para garantir
 * layout consistente, identidade visual e quebras de linha preservadas.
 */

/** Converte \n em <br> para HTML */
export function nl2br(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

type BrandingInput = {
  siteTitle?: string;
  siteDomain?: string;
  siteBaseUrl?: string;
};

type BrandingResolved = {
  siteTitle: string;
  siteDomain: string;
  siteBaseUrl: string;
};

function normalizeDomain(raw?: string): string {
  if (!raw) return '';
  let value = String(raw).trim().toLowerCase();
  if (!value) return '';
  value = value.replace(/^https?:\/\//i, '');
  value = value.split('/')[0] || value;
  if (value.includes('@')) value = value.split('@')[1] || value;
  return value.trim();
}

function normalizeBaseUrl(raw?: string): string {
  if (!raw) return '';
  let value = String(raw).trim();
  if (!value) return '';
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  try {
    const parsed = new URL(value);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return '';
  }
}

function resolveBranding(input?: BrandingInput): BrandingResolved {
  const fallbackTitle = 'H2 COLOMBIANO';
  const fallbackDomain = 'h2colombiano.com';
  const siteTitle = input?.siteTitle?.trim() || fallbackTitle;
  const siteBaseUrl = normalizeBaseUrl(input?.siteBaseUrl);
  const domainFromBase = siteBaseUrl ? normalizeDomain(siteBaseUrl) : '';
  const siteDomain = normalizeDomain(input?.siteDomain) || domainFromBase || fallbackDomain;
  const resolvedBaseUrl = siteBaseUrl || `https://${siteDomain}`;
  return { siteTitle, siteDomain, siteBaseUrl: resolvedBaseUrl };
}

function withBaseUrl(baseUrl: string, path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}

/** Wrapper base de todos os e-mails */
function baseLayout(content: string, brandingInput?: BrandingInput): string {
  const branding = resolveBranding(brandingInput);
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${branding.siteTitle}</title>
</head>
<body style="margin:0;padding:0;background-color:#0a0a14;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a14;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">

      <!-- CABEÃ‡ALHO -->
      <tr><td style="background:linear-gradient(135deg,#1a0a2e 0%,#0d0d1a 100%);border-radius:12px 12px 0 0;padding:28px 32px;border-bottom:2px solid #a855f7;text-align:center;">
        <div style="font-size:26px;font-weight:900;color:#a855f7;letter-spacing:2px;text-transform:uppercase;">${branding.siteTitle}</div>
        <div style="font-size:12px;color:#888;margin-top:4px;letter-spacing:1px;">${branding.siteDomain}</div>
      </td></tr>

      <!-- CONTEÃšDO -->
      <tr><td style="background:#0d0d1a;padding:32px;border-left:1px solid #1e1e3a;border-right:1px solid #1e1e3a;">
        ${content}
      </td></tr>

      <!-- RODAPÃ‰ -->
      <tr><td style="background:#080810;border-radius:0 0 12px 12px;padding:20px 32px;border:1px solid #1e1e3a;border-top:1px solid #a855f720;text-align:center;">
        <p style="color:#555;font-size:11px;margin:0 0 6px;">Este e-mail foi enviado automaticamente pelo sistema ${branding.siteTitle}.</p>
        <p style="color:#555;font-size:11px;margin:0;">DÃºvidas? Acesse <a href="${branding.siteBaseUrl}" style="color:#a855f7;text-decoration:none;">${branding.siteDomain}</a></p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

/** Linha de dado (label + valor) para tabela de resumo */
function infoRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:7px 12px;color:#888;font-size:13px;font-weight:600;white-space:nowrap;vertical-align:top;">${label}</td>
    <td style="padding:7px 12px;color:#e0e0e0;font-size:13px;vertical-align:top;">${value}</td>
  </tr>`;
}

/** Badge de status colorido */
function statusBadge(label: string, color = '#a855f7'): string {
  return `<div style="display:inline-block;background:${color}22;border:1.5px solid ${color};border-radius:8px;padding:10px 22px;color:${color};font-size:18px;font-weight:800;letter-spacing:1px;text-align:center;">${label}</div>`;
}

/** BotÃ£o CTA */
function ctaButton(text: string, url: string): string {
  return `<div style="text-align:center;margin:24px 0 8px;">
    <a href="${url}" style="display:inline-block;background:#a855f7;color:#fff;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;text-decoration:none;letter-spacing:0.5px;">${text}</a>
  </div>`;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// TEMPLATES PÃšBLICOS
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** E-mail de atualizaÃ§Ã£o de status para o CLIENTE */
export function emailStatusCliente(opts: {
  siteTitle: string;
  siteDomain?: string;
  siteBaseUrl?: string;
  customerName?: string;
  statusLabel: string;
  statusColor?: string;
  orderNumber?: number | string;
  service?: string;
  description?: string;
  note?: string;
  loginData?: string;
  trackingPixelUrl?: string;
  pedidoHtml?: string;
}): string {
  const {
    siteTitle,
    siteDomain,
    siteBaseUrl,
    customerName,
    statusLabel,
    statusColor = '#a855f7',
    orderNumber,
    service,
    description,
    note,
    loginData,
    trackingPixelUrl,
    pedidoHtml,
  } = opts;
  const branding = resolveBranding({ siteTitle, siteDomain, siteBaseUrl });

  const greeting = customerName
    ? `OlÃ¡, <strong style="color:#e0e0e0;">${customerName}</strong>!`
    : 'OlÃ¡!';

  const resumoRows: string[] = [];
  if (orderNumber) resumoRows.push(infoRow('NÂº Pedido:', `<strong>#${orderNumber}</strong>`));
  if (service) resumoRows.push(infoRow('ServiÃ§o:', service));

  const resumoTable = resumoRows.length > 0 ? `
    <table cellpadding="0" cellspacing="0" style="width:100%;background:#0a0a18;border:1px solid #1e1e3a;border-radius:8px;margin-bottom:20px;">
      ${resumoRows.join('')}
    </table>` : '';

  const descBlock = description ? `
    <div style="background:#0f1a10;border-left:3px solid #22c55e;border-radius:0 8px 8px 0;padding:16px 18px;margin-bottom:20px;">
      <p style="color:#22c55e;font-size:11px;font-weight:700;margin:0 0 10px;text-transform:uppercase;letter-spacing:1px;">ðŸ“‹ InstruÃ§Ãµes / InformaÃ§Ãµes</p>
      <p style="color:#ccc;font-size:14px;margin:0;line-height:1.8;">${nl2br(description)}</p>
    </div>` : '';

  const noteBlock = note ? `
    <div style="background:#1a1000;border-left:3px solid #f59e0b;border-radius:0 8px 8px 0;padding:16px 18px;margin-bottom:20px;">
      <p style="color:#f59e0b;font-size:11px;font-weight:700;margin:0 0 10px;text-transform:uppercase;letter-spacing:1px;">ðŸ“ ObservaÃ§Ã£o do Administrador</p>
      <p style="color:#ccc;font-size:14px;margin:0;line-height:1.8;">${nl2br(note)}</p>
    </div>` : '';

  const loginBlock = loginData ? loginData : '';

  const pixel = trackingPixelUrl
    ? `<img src="${trackingPixelUrl}" width="1" height="1" style="display:block;border:0;" alt="" />`
    : '';

  const content = `
    <p style="color:#aaa;font-size:15px;margin:0 0 20px;">${greeting}</p>

    <p style="color:#888;font-size:13px;margin:0 0 12px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">AtualizaÃ§Ã£o do seu pedido:</p>

    <div style="text-align:center;margin-bottom:24px;">
      ${statusBadge(statusLabel, statusColor)}
    </div>

    ${resumoTable}
    ${pedidoHtml || ''}
    ${descBlock}
    ${loginBlock}
    ${noteBlock}

    ${ctaButton('ðŸ“± Acompanhar Meu Pedido', withBaseUrl(branding.siteBaseUrl, '/acompanhar'))}
    <p style="color:#555;font-size:11px;text-align:center;margin:4px 0 0;">Use seu telefone para consultar em ${branding.siteDomain}/acompanhar</p>
    ${pixel}
  `;

  return baseLayout(content, branding);
}

/** E-mail de NOVO PEDIDO para o admin */
export function emailNovoPedidoAdmin(opts: {
  siteTitle?: string;
  siteDomain?: string;
  siteBaseUrl?: string;
  clientName: string;
  phone: string;
  service: string;
  option?: string;
  customerNumber?: string;
  orderNumber?: number | string;
  email?: string;
  cpf?: string;
  extra?: string;
  answers?: { question: string; answer: string }[];
  documents?: { label: string; url: string }[];
  paymentProofUrl?: string;
  city?: string;
  referrer?: string;
  carDocumentYear?: string;
}): string {
  const { siteTitle, siteDomain, siteBaseUrl, clientName, phone, service, option, customerNumber, orderNumber, email, cpf, extra, answers, documents, paymentProofUrl, city, referrer, carDocumentYear } = opts;
  const branding = resolveBranding({ siteTitle, siteDomain, siteBaseUrl });

  const rows: string[] = [
    infoRow('Cliente:', `<strong>${clientName}</strong>`),
    infoRow('Telefone:', phone),
    infoRow('ServiÃ§o:', service),
  ];
  if (option) rows.push(infoRow('OpÃ§Ã£o:', option));
  if (customerNumber) rows.push(infoRow('Cadastro:', `*${customerNumber}`));
  if (orderNumber) rows.push(infoRow('NÂº Pedido:', `<strong>#${orderNumber}</strong>`));
  if (email) rows.push(infoRow('E-mail:', `<a href="mailto:${email}" style="color:#a855f7;text-decoration:none;">${email}</a>`));
  if (cpf) rows.push(infoRow('CPF:', cpf));

  // Bloco de informaÃ§Ãµes extras (cidade, indicaÃ§Ã£o, ano)
  const infoItems: string[] = [];
  if (city) infoItems.push(`ðŸ™ï¸ <strong>Cidade:</strong> ${city}`);
  if (referrer) infoItems.push(`ðŸ‘¤ <strong>Indicado por:</strong> ${referrer}`);
  if (carDocumentYear) infoItems.push(`ðŸ“… <strong>Ano desejado:</strong> ${carDocumentYear}`);

  const infoBlock = infoItems.length > 0 ? `
    <div style="background:#0a1020;border-left:3px solid #3b82f6;border-radius:0 8px 8px 0;padding:14px 16px;margin-top:16px;">
      <p style="color:#3b82f6;font-size:11px;font-weight:700;margin:0 0 10px;text-transform:uppercase;letter-spacing:1px;">â„¹ï¸ InformaÃ§Ãµes do Cliente</p>
      ${infoItems.map(item => `<p style="color:#ccc;font-size:13px;margin:6px 0;line-height:1.6;">${item}</p>`).join('')}
    </div>` : '';

  // Bloco de respostas do formulÃ¡rio (cada pergunta em linha separada)
  const answersBlock = answers && answers.length > 0 ? `
    <div style="background:#1a0a2e;border-left:3px solid #a855f7;border-radius:0 8px 8px 0;padding:14px 16px;margin-top:16px;">
      <p style="color:#a855f7;font-size:11px;font-weight:700;margin:0 0 12px;text-transform:uppercase;letter-spacing:1px;">ðŸ“‹ Respostas do FormulÃ¡rio</p>
      ${answers.map(a => `
        <div style="border-bottom:1px solid #2a1a4a;padding:8px 0;">
          <p style="color:#888;font-size:11px;margin:0 0 2px;font-weight:600;text-transform:uppercase;">${a.question}</p>
          <p style="color:#e0e0e0;font-size:14px;margin:0;line-height:1.5;">${nl2br(a.answer)}</p>
        </div>`).join('')}
    </div>` : '';

  // Bloco de comprovante PIX
  const pixBlock = paymentProofUrl ? `
    <div style="background:#0f1a10;border-left:3px solid #22c55e;border-radius:0 8px 8px 0;padding:14px 16px;margin-top:16px;">
      <p style="color:#22c55e;font-size:11px;font-weight:700;margin:0 0 8px;text-transform:uppercase;letter-spacing:1px;">ðŸ’° Comprovante PIX</p>
      <p style="color:#ccc;font-size:13px;margin:0;"><a href="${paymentProofUrl}" style="color:#22c55e;text-decoration:underline;">ðŸ“Ž Ver comprovante</a></p>
    </div>` : `
    <div style="background:#1a1000;border-left:3px solid #f59e0b;border-radius:0 8px 8px 0;padding:14px 16px;margin-top:16px;">
      <p style="color:#f59e0b;font-size:11px;font-weight:700;margin:0 0 8px;text-transform:uppercase;letter-spacing:1px;">ðŸ’° Comprovante PIX</p>
      <p style="color:#888;font-size:13px;margin:0;">NÃ£o enviado</p>
    </div>`;

  // Bloco de arquivos/documentos
  const docsBlock = documents && documents.length > 0 ? `
    <div style="background:#0a1a1a;border-left:3px solid #06b6d4;border-radius:0 8px 8px 0;padding:14px 16px;margin-top:16px;">
      <p style="color:#06b6d4;font-size:11px;font-weight:700;margin:0 0 10px;text-transform:uppercase;letter-spacing:1px;">ðŸ“ Arquivos Enviados</p>
      ${documents.map(d => `<p style="color:#ccc;font-size:13px;margin:4px 0;"><strong>${d.label}:</strong> <a href="${d.url}" style="color:#06b6d4;text-decoration:underline;">Ver</a></p>`).join('')}
    </div>` : '';

  // Bloco extra legado (fallback caso ainda seja passado como string)
  const extraBlock = extra ? `
    <div style="background:#0f1a10;border-left:3px solid #22c55e;border-radius:0 8px 8px 0;padding:14px 16px;margin-top:16px;">
      <p style="color:#22c55e;font-size:11px;font-weight:700;margin:0 0 8px;text-transform:uppercase;letter-spacing:1px;">InformaÃ§Ãµes Adicionais</p>
      <p style="color:#ccc;font-size:13px;margin:0;line-height:1.8;">${nl2br(extra)}</p>
    </div>` : '';

  const content = `
    <div style="background:#0f1a10;border:1px solid #22c55e40;border-radius:8px;padding:10px 16px;margin-bottom:20px;text-align:center;">
      <span style="color:#22c55e;font-size:13px;font-weight:700;">ðŸ†• NOVO PEDIDO RECEBIDO</span>
    </div>

    <table cellpadding="0" cellspacing="0" style="width:100%;background:#0a0a18;border:1px solid #1e1e3a;border-radius:8px;margin-bottom:16px;">
      ${rows.join('')}
    </table>
    ${infoBlock}
    ${answersBlock}
    ${pixBlock}
    ${docsBlock}
    ${extraBlock}

    ${ctaButton('Ver no Painel', withBaseUrl(branding.siteBaseUrl, '/admin'))}
  `;

  return baseLayout(content, branding);
}

/** E-mail de PEDIDO RECEBIDO para o cliente */
export function emailPedidoRecebidoCliente(opts: {
  siteTitle: string;
  siteDomain?: string;
  siteBaseUrl?: string;
  customerName?: string;
  service: string;
  orderNumber?: number | string;
  pin?: string;
}): string {
  const { siteTitle, siteDomain, siteBaseUrl, customerName, service, orderNumber, pin } = opts;
  const branding = resolveBranding({ siteTitle, siteDomain, siteBaseUrl });

  const greeting = customerName
    ? `OlÃ¡, <strong style="color:#e0e0e0;">${customerName}</strong>!`
    : 'OlÃ¡!';

  const pinBlock = pin ? `
    <div style="background:#0a1020;border:1px solid #3b82f640;border-radius:8px;padding:16px;margin:16px 0;text-align:center;">
      <p style="color:#3b82f6;font-size:11px;font-weight:700;margin:0 0 8px;text-transform:uppercase;letter-spacing:1px;">ðŸ”‘ Sua Senha de Acesso</p>
      <p style="color:#fff;font-size:28px;font-weight:900;margin:0;letter-spacing:6px;">${pin}</p>
      <p style="color:#666;font-size:11px;margin:8px 0 0;">Use esta senha para acompanhar seu pedido</p>
    </div>` : '';

  const rows = [
    infoRow('ServiÃ§o:', service),
    ...(orderNumber ? [infoRow('NÂº Pedido:', `<strong>#${orderNumber}</strong>`)] : []),
  ];

  const content = `
    <p style="color:#aaa;font-size:15px;margin:0 0 20px;">${greeting}</p>

    <div style="background:#0f1a10;border:1px solid #22c55e40;border-radius:8px;padding:14px 16px;margin-bottom:20px;text-align:center;">
      <span style="color:#22c55e;font-size:14px;font-weight:700;">âœ… Seu pedido foi recebido com sucesso!</span>
    </div>

    <table cellpadding="0" cellspacing="0" style="width:100%;background:#0a0a18;border:1px solid #1e1e3a;border-radius:8px;margin-bottom:16px;">
      ${rows.join('')}
    </table>

    ${pinBlock}

    <p style="color:#888;font-size:13px;margin:16px 0 0;line-height:1.7;">Nossa equipe irÃ¡ analisar seu pedido e vocÃª receberÃ¡ atualizaÃ§Ãµes por e-mail. Acompanhe o status do seu pedido pelo link abaixo:</p>

    ${ctaButton('ðŸ“± Acompanhar Meu Pedido', withBaseUrl(branding.siteBaseUrl, '/acompanhar'))}
  `;

  return baseLayout(content, branding);
}

/** E-mail de CADASTRO FINALIZADO para o admin */
export function emailCadastroFinalizadoAdmin(opts: {
  siteTitle?: string;
  siteDomain?: string;
  siteBaseUrl?: string;
  name: string;
  phone: string;
  service?: string;
  email?: string;
  cpf?: string;
  extra?: string;
}): string {
  const { siteTitle, siteDomain, siteBaseUrl, name, phone, service, email, cpf, extra } = opts;
  const branding = resolveBranding({ siteTitle, siteDomain, siteBaseUrl });

  const rows = [
    infoRow('Nome:', `<strong>${name}</strong>`),
    infoRow('Telefone:', phone),
    ...(service ? [infoRow('ServiÃ§o:', service)] : []),
    ...(email ? [infoRow('E-mail:', email)] : []),
    ...(cpf ? [infoRow('CPF:', cpf)] : []),
  ];

  const extraBlock = extra ? `
    <div style="background:#0f1a10;border-left:3px solid #22c55e;border-radius:0 8px 8px 0;padding:14px 16px;margin-top:16px;">
      <p style="color:#22c55e;font-size:11px;font-weight:700;margin:0 0 8px;text-transform:uppercase;letter-spacing:1px;">Dados Adicionais</p>
      <p style="color:#ccc;font-size:13px;margin:0;line-height:1.8;">${nl2br(extra)}</p>
    </div>` : '';

  const content = `
    <div style="background:#0a1020;border:1px solid #3b82f640;border-radius:8px;padding:10px 16px;margin-bottom:20px;text-align:center;">
      <span style="color:#3b82f6;font-size:13px;font-weight:700;">ðŸ“‹ CADASTRO FINALIZADO</span>
    </div>

    <table cellpadding="0" cellspacing="0" style="width:100%;background:#0a0a18;border:1px solid #1e1e3a;border-radius:8px;margin-bottom:16px;">
      ${rows.join('')}
    </table>
    ${extraBlock}

    ${ctaButton('Ver no Painel', withBaseUrl(branding.siteBaseUrl, '/admin'))}
  `;

  return baseLayout(content, branding);
}

/** E-mail de INÃCIO DE CADASTRO para o admin */
export function emailInicioCadastroAdmin(opts: {
  siteTitle?: string;
  siteDomain?: string;
  siteBaseUrl?: string;
  phone: string;
  service?: string;
  extra?: string;
}): string {
  const { siteTitle, siteDomain, siteBaseUrl, phone, service, extra } = opts;
  const branding = resolveBranding({ siteTitle, siteDomain, siteBaseUrl });

  const rows = [
    infoRow('Telefone:', `<strong>${phone}</strong>`),
    ...(service ? [infoRow('ServiÃ§o:', service)] : []),
  ];

  const extraBlock = extra ? `
    <div style="background:#1a1000;border-left:3px solid #f59e0b;border-radius:0 8px 8px 0;padding:14px 16px;margin-top:16px;">
      <p style="color:#f59e0b;font-size:11px;font-weight:700;margin:0 0 8px;text-transform:uppercase;letter-spacing:1px;">Dados Iniciais</p>
      <p style="color:#ccc;font-size:13px;margin:0;line-height:1.8;">${nl2br(extra)}</p>
    </div>` : '';

  const content = `
    <div style="background:#1a1000;border:1px solid #f59e0b40;border-radius:8px;padding:10px 16px;margin-bottom:20px;text-align:center;">
      <span style="color:#f59e0b;font-size:13px;font-weight:700;">ðŸ†• NOVO CLIENTE INICIOU CADASTRO</span>
    </div>

    <table cellpadding="0" cellspacing="0" style="width:100%;background:#0a0a18;border:1px solid #1e1e3a;border-radius:8px;margin-bottom:16px;">
      ${rows.join('')}
    </table>
    ${extraBlock}

    ${ctaButton('Ver no Painel', withBaseUrl(branding.siteBaseUrl, '/admin'))}
  `;

  return baseLayout(content, branding);
}

/** E-mail de INDICAÃ‡ÃƒO para o indicador */
export function emailIndicacaoSucesso(opts: {
  siteTitle?: string;
  siteDomain?: string;
  siteBaseUrl?: string;
  referrerName?: string;
  referredName: string;
  service?: string;
}): string {
  const { siteTitle, siteDomain, siteBaseUrl, referrerName, referredName, service } = opts;
  const branding = resolveBranding({ siteTitle, siteDomain, siteBaseUrl });

  const greeting = referrerName
    ? `OlÃ¡, <strong style="color:#e0e0e0;">${referrerName}</strong>!`
    : 'OlÃ¡!';

  const content = `
    <p style="color:#aaa;font-size:15px;margin:0 0 20px;">${greeting}</p>

    <div style="background:#0f1a10;border:1px solid #22c55e40;border-radius:8px;padding:14px 16px;margin-bottom:20px;text-align:center;">
      <span style="color:#22c55e;font-size:14px;font-weight:700;">ðŸŽ‰ Sua indicaÃ§Ã£o deu certo!</span>
    </div>

    <p style="color:#ccc;font-size:14px;line-height:1.7;margin:0 0 16px;">
      <strong style="color:#e0e0e0;">${referredName}</strong> fez um pedido${service ? ` de <strong>${service}</strong>` : ''} usando sua indicaÃ§Ã£o.
    </p>

    <p style="color:#888;font-size:13px;line-height:1.7;margin:0;">Obrigado por indicar a ${branding.siteTitle}! Continue indicando e ajudando mais pessoas.</p>

    ${ctaButton(`Acessar ${branding.siteTitle}`, branding.siteBaseUrl)}
  `;

  return baseLayout(content, branding);
}

/** E-mail de COMPROVANTE PIX para o admin */
export function emailComprovantePix(opts: {
  siteTitle?: string;
  siteDomain?: string;
  siteBaseUrl?: string;
  clientName: string;
  phone: string;
  service: string;
  extra?: string;
}): string {
  const { siteTitle, siteDomain, siteBaseUrl, clientName, phone, service, extra } = opts;
  const branding = resolveBranding({ siteTitle, siteDomain, siteBaseUrl });

  const rows = [
    infoRow('Cliente:', `<strong>${clientName}</strong>`),
    infoRow('Telefone:', phone),
    infoRow('ServiÃ§o:', service),
  ];

  const extraBlock = extra ? `
    <div style="background:#0a1020;border-left:3px solid #3b82f6;border-radius:0 8px 8px 0;padding:14px 16px;margin-top:16px;">
      <p style="color:#3b82f6;font-size:11px;font-weight:700;margin:0 0 8px;text-transform:uppercase;letter-spacing:1px;">InformaÃ§Ãµes do Comprovante</p>
      <p style="color:#ccc;font-size:13px;margin:0;line-height:1.8;">${nl2br(extra)}</p>
    </div>` : '';

  const content = `
    <div style="background:#0a1020;border:1px solid #3b82f640;border-radius:8px;padding:10px 16px;margin-bottom:20px;text-align:center;">
      <span style="color:#3b82f6;font-size:13px;font-weight:700;">ðŸ’³ COMPROVANTE PIX RECEBIDO</span>
    </div>

    <table cellpadding="0" cellspacing="0" style="width:100%;background:#0a0a18;border:1px solid #1e1e3a;border-radius:8px;margin-bottom:16px;">
      ${rows.join('')}
    </table>
    ${extraBlock}

    ${ctaButton('Ver no Painel', withBaseUrl(branding.siteBaseUrl, '/admin'))}
  `;

  return baseLayout(content, branding);
}

/** E-mail de STATUS ATUALIZADO para o ADMIN */
export function emailStatusAdmin(opts: {
  siteTitle?: string;
  siteDomain?: string;
  siteBaseUrl?: string;
  statusLabel: string;
  customerName?: string;
  customerPhone?: string;
  customerNumber?: string;
  orderNumber?: number | string;
  service?: string;
  option?: string;
  previousStatus?: string;
  note?: string;
}): string {
  const {
    siteTitle,
    siteDomain,
    siteBaseUrl,
    statusLabel,
    customerName,
    customerPhone,
    customerNumber,
    orderNumber,
    service,
    option,
    previousStatus,
    note,
  } = opts;
  const branding = resolveBranding({ siteTitle, siteDomain, siteBaseUrl });

  const rows: string[] = [];
  if (customerNumber) rows.push(infoRow('Cadastro:', `*${customerNumber}`));
  if (orderNumber) rows.push(infoRow('NÂº Pedido:', `<strong>#${orderNumber}</strong>`));
  if (customerName) rows.push(infoRow('Cliente:', `<strong>${customerName}</strong>`));
  if (customerPhone) rows.push(infoRow('Telefone:', customerPhone));
  if (service) rows.push(infoRow('ServiÃ§o:', service));
  if (option) rows.push(infoRow('OpÃ§Ã£o:', option));
  if (previousStatus) rows.push(infoRow('Status Anterior:', `<span style="color:#888;">${previousStatus}</span>`));

  const noteBlock = note ? `
    <div style="background:#1a1000;border-left:3px solid #f59e0b;border-radius:0 8px 8px 0;padding:14px 16px;margin-top:16px;">
      <p style="color:#f59e0b;font-size:11px;font-weight:700;margin:0 0 8px;text-transform:uppercase;letter-spacing:1px;">ðŸ“ ObservaÃ§Ã£o</p>
      <p style="color:#ccc;font-size:13px;margin:0;line-height:1.8;">${nl2br(note)}</p>
    </div>` : '';

  const content = `
    <div style="background:#0f1a10;border:1px solid #22c55e40;border-radius:8px;padding:10px 16px;margin-bottom:20px;">
      <p style="color:#888;font-size:11px;font-weight:700;margin:0 0 6px;text-transform:uppercase;letter-spacing:1px;">Novo Status:</p>
      <p style="color:#22c55e;font-size:16px;font-weight:800;margin:0;">âœ… ${statusLabel}</p>
    </div>

    <table cellpadding="0" cellspacing="0" style="width:100%;background:#0a0a18;border:1px solid #1e1e3a;border-radius:8px;margin-bottom:16px;">
      ${rows.join('')}
    </table>
    ${noteBlock}

    ${ctaButton('Ver no Painel', withBaseUrl(branding.siteBaseUrl, '/admin'))}
  `;

  return baseLayout(content, branding);
}
