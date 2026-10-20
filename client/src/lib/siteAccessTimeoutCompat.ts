/** Older client browsers still support AbortController, but not the newer timeout helper. */
export function installSiteAccessTimeoutCompat():void {
  if(typeof AbortSignal==='undefined'||typeof AbortController==='undefined'||typeof AbortSignal.timeout==='function')return;
  Object.defineProperty(AbortSignal,'timeout',{
    configurable:true,writable:true,
    value:(milliseconds:number):AbortSignal=>{
      if(!Number.isFinite(milliseconds)||milliseconds<0)throw new RangeError('Invalid timeout');
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),milliseconds);
      // Node-based isolated tests must not stay alive only for a browser timeout.
      if(typeof timer==='object'&&'unref' in timer)timer.unref();
      return controller.signal;
    },
  });
}
installSiteAccessTimeoutCompat();
