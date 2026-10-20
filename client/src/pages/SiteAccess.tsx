import React, { useEffect, useState } from 'react';
import { normalizeSiteCode, validSiteCode, siteAccessReturnPath, SITE_ACCESS_DENIED_CODE, SITE_ACCESS_DENIED_MESSAGE } from '@shared/siteAccessCodePolicy';

export default function SiteAccess() {
  const [email,setEmail]=useState('');
  const [code,setCode]=useState('');
  const [stage,setStage]=useState<'email'|'code'>('email');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [remaining,setRemaining]=useState(0);
  const next=siteAccessReturnPath(new URLSearchParams(window.location.search).get('next'));
  useEffect(()=>{
    if(remaining<=0)return;
    const timer=window.setTimeout(()=>setRemaining(value=>Math.max(0,value-1)),1000);
    return()=>window.clearTimeout(timer);
  },[remaining]);
  async function request(event?:React.FormEvent) {
    event?.preventDefault();
    if(busy||remaining>0)return;
    setBusy(true);setMessage('');
    try {
      const response=await fetch('/api/site-access/request',{
        method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({email:email.trim().toLowerCase()}),signal:AbortSignal.timeout(45000),
      });
      const result=await response.json().catch(()=>({}));
      if(response.status===403&&result.code===SITE_ACCESS_DENIED_CODE){
        setStage('email');setCode('');setRemaining(0);setMessage(SITE_ACCESS_DENIED_MESSAGE);return;
      }
      if(response.status===429){setRemaining(Math.max(1,Number(result.retryAfter)||60));setMessage('Muitas solicitações ou reenvio recente. Aguarde a contagem antes de pedir outro código.');return;}
      if(response.status===400){setMessage('Confira se o e-mail foi digitado corretamente.');return;}
      if(!response.ok||result.ok!==true||result.codeSent!==true){setMessage('Não foi possível enviar o código agora. Aguarde um minuto e tente novamente.');setRemaining(60);return;}
      setEmail(value=>value.trim().toLowerCase());setCode('');setStage('code');setRemaining(60);
      setMessage('Código enviado. Confira a caixa de entrada e o spam.');
    }catch{setMessage('Não foi possível confirmar o envio. Confira seu e-mail antes de tentar novamente.');setRemaining(60);}
    finally{setBusy(false);}
  }
  async function verify(event:React.FormEvent) {
    event.preventDefault();if(busy)return;
    const normalized=normalizeSiteCode(code);
    if(!validSiteCode(normalized)){setMessage('Digite os 6 números do código recebido.');return;}
    setBusy(true);setMessage('');
    try {
      const response=await fetch('/api/site-access/verify',{
        method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({email,code:normalized}),signal:AbortSignal.timeout(20000),
      });
      const result=await response.json().catch(()=>({}));
      if(response.status===429){setRemaining(Math.max(1,Number(result.retryAfter)||60));setMessage('Limite de tentativas de verificação. Aguarde antes de tentar novamente.');return;}
      if(!response.ok){setMessage(response.status===401?'Código inválido, expirado, já utilizado ou e-mail sem autorização ativa.':'Verificação indisponível. Aguarde e tente novamente.');return;}
      try{localStorage.removeItem('h2_site_logout_pending');sessionStorage.removeItem('h2_site_had_customer_session');}catch{}
      window.location.replace(next);
    }catch{setMessage('Falha de conexão durante a verificação. Tente novamente em instantes.');}
    finally{setBusy(false);}
  }
  return <main className="min-h-screen bg-[#070b18] text-white p-4 flex items-center justify-center">
    <section className="w-full max-w-md min-w-0 rounded-2xl border border-yellow-400/30 bg-[#12192b] p-6 shadow-xl">
      <h1 className="text-2xl font-black text-yellow-300 mb-2">H2 COLOMBIANO</h1>
      <h2 className="text-lg font-bold">Acesso restrito</h2>
      <p className="text-sm text-white/65 my-4">Use o e-mail autorizado pela equipe. Não é necessário ter cadastro de cliente ou pedido para verificar o acesso.</p>
      {stage==='email'?<form onSubmit={request} className="space-y-3">
        <label className="block text-sm">E-mail autorizado<input type="email" autoComplete="email" autoCapitalize="none" required maxLength={320} value={email} disabled={busy} onChange={event=>setEmail(event.target.value)} className="mt-1 block w-full min-w-0 p-3 rounded-lg bg-white/10 border border-white/20"/></label>
        <button disabled={busy||remaining>0} className="w-full p-3 rounded-lg bg-yellow-400 disabled:opacity-50 text-black font-bold">{busy?'Verificando...':remaining>0?`Aguarde ${remaining}s`:'Enviar código'}</button>
      </form>:<form onSubmit={verify} className="space-y-3">
        <p className="text-sm text-white/70 break-all">{email}</p>
        <label className="block text-sm">Código de 6 números<input type="text" inputMode="numeric" pattern="[0-9]{6}" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={6} required autoComplete="one-time-code" value={code} disabled={busy} onChange={event=>{const value=normalizeSiteCode(event.target.value);if(/^[0-9]{0,6}$/.test(value))setCode(value);}} onPaste={event=>{event.preventDefault();const value=normalizeSiteCode(event.clipboardData.getData('text'));if(validSiteCode(value))setCode(value);else setMessage('Cole um código com 6 números, sem letras.');}} placeholder="000000" className="mt-1 block w-full min-w-0 p-3 rounded-lg bg-white/10 border border-white/20 tracking-wider font-mono"/></label>
        <p className="text-xs text-white/60">O código é de uso único e vale por 10 minutos. Depois de confirmar, o acesso vale por até 24 horas ou até você sair.</p>
        <button disabled={busy} className="w-full p-3 rounded-lg bg-yellow-400 disabled:opacity-50 text-black font-bold">{busy?'Aguarde...':'Confirmar e entrar'}</button>
        <button type="button" disabled={busy||remaining>0} onClick={()=>void request()} className="w-full rounded-lg border border-yellow-400/30 p-3 text-sm text-yellow-200 disabled:opacity-50">{remaining>0?`Reenviar em ${remaining}s`:'Reenviar código'}</button>
        <button type="button" disabled={busy} className="w-full text-sm text-white/65" onClick={()=>{setStage('email');setCode('');setMessage('');}}>Trocar e-mail</button>
      </form>}
      {message&&<p role={message===SITE_ACCESS_DENIED_MESSAGE?'alert':'status'} className={'mt-4 text-sm leading-relaxed '+(message===SITE_ACCESS_DENIED_MESSAGE?'font-semibold text-red-300':'text-yellow-100')}>{message}</p>}
      <p className="mt-5 text-xs text-white/45">A cada 24 horas, uma nova verificação é necessária. Não compartilhe seu código.</p>
    </section>
  </main>;
}
