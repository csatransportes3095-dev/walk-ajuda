import nodemailer from "nodemailer";
export async function sendH2AutoOrderCode(to:string,code:string,validMinutes=10):Promise<void>{
 if(!Number.isInteger(validMinutes)||validMinutes<5||validMinutes>30)throw Error("INVALID_CODE_TTL");
 if(!/^\d{6}$/.test(code)||!/^\S+@\S+\.\S+$/.test(to))throw Error("INVALID_RECIPIENT_OR_CODE");
 const subject="H2 Colombiano - Confirmação de consulta de pedido";
 const text="Seu código para consultar pedidos pelo H2 AUTO: "+code+"\n\nCódigo de uso único, válido por "+validMinutes+" minutos. Não compartilhe. Se não solicitou, ignore.";
 const html="<div style=\"font-family:Arial;padding:20px;max-width:480px\"><h2>H2 Colombiano</h2><p>Código para acompanhar seu pedido no WhatsApp:</p><p style=\"font-size:30px;font-weight:bold\">"+code+"</p><p>Válido por 10 minutos. Não compartilhe este código.</p></div>";
 const from=process.env.SMTP_FROM||process.env.SMTP_USER||"h2@h2colombiano.com";
 const password=process.env.SMTP_PASS||process.env.ZOHO_EMAIL_PASSWORD;
 if(password){
  const port=Number(process.env.SMTP_PORT||"465");
  const secure=process.env.SMTP_SECURE?["1","true","yes","on"].includes(process.env.SMTP_SECURE.toLowerCase()):port===465;
  const transport=nodemailer.createTransport({host:process.env.SMTP_HOST||"smtp.zoho.com",port,secure,requireTLS:!secure,auth:{user:process.env.SMTP_USER||"h2@h2colombiano.com",pass:password},connectionTimeout:8000,greetingTimeout:8000,socketTimeout:12000});
  try{
   const response=await transport.sendMail({from,to,subject,text,html});
   if((response.accepted||[]).some(x=>String(x).trim().toLowerCase()===to.trim().toLowerCase()))return;
  }catch{}finally{transport.close();}
 }
 const key=process.env.RESEND_API_KEY;
 if(key){
  try{
   const response=await fetch("https://api.resend.com/emails",{method:"POST",signal:AbortSignal.timeout(8000),headers:{Authorization:"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify({from,to:[to],subject,text,html})});
   if(response.ok)return;
  }catch{}
 }
 throw Error("H2_AUTO_EMAIL_UNAVAILABLE");
}
