import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { SITE_CODE_LENGTH, SITE_CODE_ALPHABET, SITE_ACCESS_LIFETIME_MS, normalizeSiteCode, validSiteCode, displaySiteCode, siteAccessReturnPath } from '../shared/siteAccessCodePolicy';
import { clearSiteCustomerState, closeSiteAccessSession, SITE_LOGOUT_PENDING, SITE_HAD_CUSTOMER, siteCustomerLogoutDetected, siteSessionDeadlineExpired } from '../client/src/lib/siteAccessSessionClient';
function storage(){const values=new Map<string,string>();return {getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>{values.delete(key);}};}
beforeEach(()=>{vi.stubGlobal('localStorage',storage());vi.stubGlobal('sessionStorage',storage());vi.stubGlobal('window',{dispatchEvent:vi.fn()});});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
describe('own site code presentation',()=>{
  it('uses exactly six decimal digits and keeps the 24-hour access lifetime',()=>{expect(SITE_CODE_LENGTH).toBe(6);expect(SITE_CODE_ALPHABET).toBe('0123456789');expect(SITE_ACCESS_LIFETIME_MS).toBe(86400000);});
  it('normalizes pasted separators without losing leading zeroes or converting letters',()=>{expect(normalizeSiteCode(' 012-345 ')).toBe('012345');expect(normalizeSiteCode('oIl')).toBe('oIl');expect(validSiteCode(normalizeSiteCode('o12345'))).toBe(false);});
  it.each(['000000','012345','123456','999999'])('accepts exactly six numeric characters %s',value=>expect(validSiteCode(value)).toBe(true));
  it.each(['','12345','1234567','1234ABCDEFGH','<script>x</script>','12345A','１２３４５６','1e0000','+12345'])('rejects nonnumeric, old or wrong-size code %s',value=>expect(validSiteCode(value)).toBe(false));
  it('displays the six digits without hyphens or other characters',()=>expect(displaySiteCode('012345')).toBe('012345'));
  it.each([null,undefined,123456,{},'1'.repeat(81)])('safely rejects nontext or oversized input %j',value=>expect(normalizeSiteCode(value)).toBe(''));
  it.each([null,'https://evil.test','//evil.test','/\\evil.test','/admin/login','/api/ping','/site-access','/\nattack'])('blocks unsafe return paths %s',value=>expect(siteAccessReturnPath(value)).toBe('/'));
  it('keeps a valid same-site destination',()=>expect(siteAccessReturnPath('/acompanhar?pedido=1')).toBe('/acompanhar?pedido=1'));
});
describe('site session logout and absolute expiry',()=>{
  it('detects removal of a customer token, including after a reload',()=>{expect(siteCustomerLogoutDetected('old','',false)).toBe(true);expect(siteCustomerLogoutDetected('','',true)).toBe(true);});
  it('does not mistake an authorized visitor without a customer account for logout',()=>{expect(siteCustomerLogoutDetected('','',false)).toBe(false);expect(siteCustomerLogoutDetected('old','new',true)).toBe(false);});
  it.each([null,undefined,NaN,Infinity,'100',99,100])('fails closed for invalid or expired deadline %s',value=>expect(siteSessionDeadlineExpired(value,100)).toBe(true));
  it('does not expire an otherwise valid future deadline',()=>expect(siteSessionDeadlineExpired(101,100)).toBe(false));
  it('only clears customer login state, preserving unrelated/admin storage',()=>{
    for(const key of ['cp_token','walk_access_granted','admin_token','saved_draft'])localStorage.setItem(key,'keep-or-clear');
    sessionStorage.setItem(SITE_HAD_CUSTOMER,'1');sessionStorage.setItem('admin_preference','keep');
    clearSiteCustomerState();expect(localStorage.getItem('cp_token')).toBeNull();expect(localStorage.getItem('walk_access_granted')).toBeNull();
    expect(localStorage.getItem('admin_token')).toBe('keep-or-clear');expect(localStorage.getItem('saved_draft')).toBe('keep-or-clear');expect(sessionStorage.getItem('admin_preference')).toBe('keep');
  });
  it('calls the server logout and only then clears the pending marker',async()=>{
    localStorage.setItem('cp_token','test-bearer');const fetcher=vi.fn().mockResolvedValue({ok:true});
    await closeSiteAccessSession('test-bearer',fetcher);expect(fetcher.mock.calls.map(c=>c[0])).toEqual(['/api/trpc/customerPassword.logout','/api/site-access/logout']);
    expect(localStorage.getItem(SITE_LOGOUT_PENDING)).toBeNull();expect(localStorage.getItem('cp_token')).toBeNull();expect(window.dispatchEvent).toHaveBeenCalledTimes(1);
  });
  it('closes site-only visitors without requiring a customer login',async()=>{
    const fetcher=vi.fn().mockResolvedValue({ok:true});await closeSiteAccessSession('',fetcher);expect(fetcher).toHaveBeenCalledTimes(1);expect(fetcher.mock.calls[0][0]).toBe('/api/site-access/logout');
  });
  it('keeps a block marker and does not claim logout success if server revocation fails',async()=>{
    const fetcher=vi.fn().mockResolvedValue({ok:false});await expect(closeSiteAccessSession('',fetcher)).rejects.toThrow('NOT_CONFIRMED');expect(localStorage.getItem(SITE_LOGOUT_PENDING)).not.toBeNull();expect(window.dispatchEvent).not.toHaveBeenCalled();
  });
  it('still revokes the site session when the old customer logout route is unavailable',async()=>{
    const fetcher=vi.fn().mockRejectedValueOnce(new Error('old route unavailable')).mockResolvedValueOnce({ok:true});
    await closeSiteAccessSession('test-bearer',fetcher);expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('installs the boundary above the application and maintains server checks',()=>{
    const main=readFileSync('client/src/main.tsx','utf8'),boundary=readFileSync('client/src/components/SiteAccessSessionBoundary.tsx','utf8');
    expect(main).toContain('<SiteAccessSessionBoundary onClear={()=>queryClient.clear()}>');
    expect(boundary).toContain("fetch('/api/site-access/session'");expect(boundary).toContain("window.addEventListener('storage'");expect(boundary).toContain('siteSessionDeadlineExpired(view.expiresAt)');
  });
});
