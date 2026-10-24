import React, { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import { siteAccessReturnPath } from '@shared/siteAccessCodePolicy';
import { clearSiteCustomerState, closeSiteAccessSession, SITE_LOGOUT_PENDING, SITE_HAD_CUSTOMER, SITE_LOGOUT_EVENT, siteCustomerLogoutDetected, siteSessionDeadlineExpired } from '@/lib/siteAccessSessionClient';

type SessionView={phase:'checking'|'ready'|'error'|'closing';required:boolean;expiresAt:number|null};
/** UX mirror only: the gateway and server-side session registry remain authoritative. */
export default function SiteAccessSessionBoundary({children,onClear}:{children:ReactNode;onClear:()=>void}) {
  const [path]=useLocation();
  const publicTokenRoute=path.startsWith('/confirmacao-foto/')||path.startsWith('/agendar/');
  const excluded=path==='/site-access'||path==='/admin'||path.startsWith('/admin/')||publicTokenRoute;
  const [view,setView]=useState<SessionView>({phase:'checking',required:false,expiresAt:null});
  const checking=useRef(false),closing=useRef(false),lastToken=useRef('');
  const active=useRef(true);
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  const redirect=useCallback(()=>{
    clearSiteCustomerState();onClear();
    const next=siteAccessReturnPath(window.location.pathname+window.location.search);
    window.location.replace('/site-access?next='+encodeURIComponent(next));
  },[onClear]);
  const logout=useCallback(async()=>{
    if(closing.current)return;
    closing.current=true;setView({phase:'closing',required:true,expiresAt:null});
    try {
      let token=lastToken.current;
      try{token=localStorage.getItem('cp_token')||token;}catch{}
      await closeSiteAccessSession(token);
      redirect();
    }catch{if(active.current)setView({phase:'error',required:true,expiresAt:null});}
    finally{closing.current=false;}
  },[redirect]);
  const check=useCallback(async()=>{
    if(excluded||checking.current||closing.current)return;
    try{if(localStorage.getItem(SITE_LOGOUT_PENDING)){await logout();return;}}catch{}
    checking.current=true;
    try {
      const response=await fetch('/api/site-access/session',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(12000)});
      if(!response.ok)throw new Error('SESSION_UNAVAILABLE');
      const result=await response.json() as {required?:boolean;authorized?:boolean;expiresAt?:number};
      if(result.required===true&&(!result.authorized||siteSessionDeadlineExpired(result.expiresAt))){redirect();return;}
      if(result.required!==false&&result.required!==true)throw new Error('INVALID_SESSION_RESPONSE');
      if(active.current)setView({phase:'ready',required:result.required===true,expiresAt:result.required?result.expiresAt!:null});
    }catch{if(active.current)setView({phase:'error',required:true,expiresAt:null});}
    finally{checking.current=false;}
  },[excluded,logout,redirect]);
  useEffect(()=>{
    if(excluded)return;
    void check();
    const focus=()=>{void check();};
    const visible=()=>{if(document.visibilityState==='visible')void check();};
    const timer=window.setInterval(focus,30000);
    window.addEventListener('focus',focus);window.addEventListener('pageshow',focus);
    document.addEventListener('visibilitychange',visible);
    return()=>{window.clearInterval(timer);window.removeEventListener('focus',focus);window.removeEventListener('pageshow',focus);document.removeEventListener('visibilitychange',visible);};
  },[excluded,path,check]);
  useEffect(()=>{
    if(excluded||!view.required||view.phase!=='ready')return;
    const sync=()=>{
      try {
        const current=localStorage.getItem('cp_token')||'';
        const had=sessionStorage.getItem(SITE_HAD_CUSTOMER)==='1';
        if(siteCustomerLogoutDetected(lastToken.current,current,had)){void logout();return;}
        if(current){lastToken.current=current;sessionStorage.setItem(SITE_HAD_CUSTOMER,'1');}
        if(localStorage.getItem(SITE_LOGOUT_PENDING)){void logout();return;}
      }catch{}
      if(siteSessionDeadlineExpired(view.expiresAt))redirect();
    };
    sync();const timer=window.setInterval(sync,500);
    const onStorage=(event:StorageEvent)=>{if(event.key==='h2_site_logout_at'){redirect();}else sync();};
    window.addEventListener('storage',onStorage);
    window.addEventListener(SITE_LOGOUT_EVENT,redirect);
    return()=>{window.clearInterval(timer);window.removeEventListener('storage',onStorage);window.removeEventListener(SITE_LOGOUT_EVENT,redirect);};
  },[excluded,view,logout,redirect]);
  if(excluded)return <>{children}</>;
  if(view.phase!=='ready')return <div className="fixed inset-0 z-[100000] flex flex-col items-center justify-center gap-4 bg-[#070b18] p-6 text-center text-white">
    <p>{view.phase==='error'?'Não foi possível confirmar a segurança do acesso.':view.phase==='closing'?'Encerrando acesso com segurança...':'Verificando autorização...'}</p>
    {view.phase==='error'&&<button type="button" onClick={()=>void check()} className="rounded-lg bg-yellow-400 px-5 py-3 font-bold text-black">Tentar novamente</button>}
  </div>;
  return <>{children}{view.required&&<button type="button" onClick={()=>void logout()} title="Encerra a autorização neste navegador e exige um novo código" className="fixed bottom-3 left-3 z-[80] rounded-lg border border-red-400/40 bg-[#17101c] px-3 py-2 text-xs font-semibold text-red-200 shadow-lg">Sair do site</button>}</>;
}
