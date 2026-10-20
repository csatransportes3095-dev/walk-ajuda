import './siteAccessTimeoutCompat';
export const SITE_LOGOUT_PENDING='h2_site_logout_pending';
export const SITE_HAD_CUSTOMER='h2_site_had_customer_session';
export const SITE_LOGOUT_EVENT='h2-site-access-logout';
export function clearSiteCustomerState():void {
  // Do not clear admin sessions, preferences, photos, drafts or unrelated storage.
  try {
    for(const key of ['cp_token','walk_access_granted','walk_access_code','walk_access_type','walk_access_expires','walk_client_phone'])localStorage.removeItem(key);
    for(const key of ['ot_searchPhone','ot_phoneInput','ot_searched','ot_adm','h2_customer_return_to',SITE_HAD_CUSTOMER])sessionStorage.removeItem(key);
  }catch{}
}
export function siteCustomerLogoutDetected(previousToken:string,currentToken:string,hadCustomer:boolean):boolean {
  return (!!previousToken||hadCustomer)&&!currentToken;
}
export function siteSessionDeadlineExpired(expiresAt:unknown,now=Date.now()):boolean {
  return typeof expiresAt!=='number'||!Number.isFinite(expiresAt)||expiresAt<=now;
}
export async function closeSiteAccessSession(customerToken:string,fetcher:typeof fetch=fetch):Promise<void> {
  try{localStorage.setItem(SITE_LOGOUT_PENDING,String(Date.now()));}catch{}
  // Preserve the existing customer's logout operation when its bearer is available.
  // Even when that route is unavailable, closing the outer site authorization is mandatory.
  if(customerToken) {
    await fetcher('/api/trpc/customerPassword.logout',{
      method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({json:{token:customerToken}}),signal:AbortSignal.timeout(10000),
    }).catch(()=>undefined);
  }
  const response=await fetcher('/api/site-access/logout',{
    method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(15000),
  });
  if(!response.ok)throw new Error('SITE_LOGOUT_NOT_CONFIRMED');
  clearSiteCustomerState();
  try{localStorage.removeItem(SITE_LOGOUT_PENDING);localStorage.setItem('h2_site_logout_at',String(Date.now()));}catch{}
  window.dispatchEvent(new Event(SITE_LOGOUT_EVENT));
}
