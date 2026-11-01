import nodemailer from 'nodemailer';
import { displaySiteCode, validSiteCode } from '../shared/siteAccessCodePolicy';

export type SiteCodeDelivery = {channel:'smtp'|'resend';messageId:string};
const emailKey = (value:string) => value.trim().toLowerCase();
function safeFailure(error: unknown): string {
  const value=(error as {code?:unknown})?.code;
  return typeof value==='string' && /^[A-Z0-9_]{2,48}$/.test(value)?value:'DELIVERY_FAILED';
}
/** Generation is internal. Delivery still requires a mail server; SMTP is independent of Resend quota. */
export async function deliverOwnSiteCode(email: string, code: string, purpose: 'site-access' | 'password-recovery' = 'site-access'): Promise<SiteCodeDelivery> {
  if (!validSiteCode(code)) throw new Error('INVALID_GENERATED_CODE');
  const from=process.env.SMTP_FROM || process.env.SMTP_USER || 'h2@h2colombiano.com';
  const subject=purpose === 'password-recovery' ? 'H2 Colombiano - Recuperação de senha' : 'H2 Colombiano - Código de acesso';
  const formatted=displaySiteCode(code);
  const text=purpose === 'password-recovery' ? `Código para recuperar a senha do H2 Colombiano: ${formatted}\n\nEste código vale por 10 minutos e pode ser usado uma única vez para alterar sua senha. Não concede acesso nem libera serviços.\n\nSe não solicitou, ignore este e-mail.` : `Seu código para acessar o site H2 Colombiano: ${formatted}\n\nDigite ou cole os 6 números. Este código é de uso único e vale por 10 minutos. Após confirmar, seu acesso vale por até 24 horas, ou até você sair.\n\nNão compartilhe. Se não solicitou o acesso, ignore esta mensagem.`;
  const html=purpose === 'password-recovery'
    ? '<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px">'
      +'<h2>H2 Colombiano</h2><p>Código para recuperar a senha:</p>'
      +'<p style="font-size:28px;font-weight:bold;letter-spacing:2px">'+formatted+'</p>'
      +'<p>Uso único, válido por 10 minutos. Este código não libera serviços nem autoriza acessos.</p>'
      +'<p>Não compartilhe. Se não solicitou, ignore esta mensagem.</p></div>'
    : '<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px">'
    +'<h2>H2 Colombiano</h2><p>Código para acessar o site:</p>'
    +'<p style="font-size:28px;font-weight:bold;letter-spacing:2px">'+formatted+'</p>'
    +'<p>Digite ou cole os 6 números. Uso único, válido por 10 minutos.</p>'
    +'<p>Após a confirmação, o acesso vale por até 24 horas, ou até você sair.</p>'
    +'<p>Não compartilhe. Se não solicitou o acesso, ignore esta mensagem.</p></div>';
  const pass=process.env.SMTP_PASS || process.env.ZOHO_EMAIL_PASSWORD || '';
  if (pass) {
    const port=Number(process.env.SMTP_PORT || '465');
    const secure=process.env.SMTP_SECURE?[ '1','true','yes','on' ].includes(process.env.SMTP_SECURE.toLowerCase()):port===465;
    const transport=nodemailer.createTransport({
      host:process.env.SMTP_HOST || 'smtp.zoho.com',port,secure,requireTLS:!secure,
      auth:{user:process.env.SMTP_USER || 'h2@h2colombiano.com',pass},
      connectionTimeout:8000,greetingTimeout:8000,socketTimeout:12000,
    });
    try {
      const result=await transport.sendMail({from,to:email,subject,text,html});
      const accepted=(result.accepted??[]).some(value=>emailKey(typeof value==='string'?value:value.address)===emailKey(email));
      if (!accepted) throw Object.assign(new Error('RECIPIENT_NOT_ACCEPTED'),{code:'RECIPIENT_NOT_ACCEPTED'});
      console.info('[SiteCode] channel=smtp state=accepted');
      return {channel:'smtp',messageId:String(result.messageId || '').slice(0,255)};
    } catch(error) {
      console.warn('[SiteCode] channel=smtp state=failed code='+safeFailure(error));
    } finally { transport.close(); }
  }
  const key=process.env.RESEND_API_KEY;
  if (key) {
    try {
      const response=await fetch('https://api.resend.com/emails',{
        method:'POST',signal:AbortSignal.timeout(8000),
        headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
        body:JSON.stringify({from,to:[email],subject,text,html}),
      });
      if (!response.ok) {
        console.warn('[SiteCode] channel=resend state=failed http='+response.status);
        throw Object.assign(new Error('PROVIDER_REJECTED'),{code:'PROVIDER_REJECTED'});
      }
      const result=await response.json() as {id?:unknown};
      if (typeof result.id!=='string'||!result.id) throw new Error('MISSING_PROVIDER_ID');
      console.info('[SiteCode] channel=resend state=accepted');
      return {channel:'resend',messageId:result.id.slice(0,255)};
    } catch(error) {console.warn('[SiteCode] channel=resend state=failed code='+safeFailure(error));}
  }
  // Neither logs nor thrown errors contain OTP, addresses, SQL, credentials or provider response bodies.
  throw new Error('SITE_CODE_DELIVERY_UNAVAILABLE');
}
