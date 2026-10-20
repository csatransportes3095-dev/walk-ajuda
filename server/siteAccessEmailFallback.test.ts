import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deliverOwnSiteCode } from './siteAccessCodeDelivery';
const mocks=vi.hoisted(()=>({send:vi.fn(),close:vi.fn(),transport:vi.fn(),fetch:vi.fn()}));
vi.mock('nodemailer',()=>({default:{createTransport:mocks.transport}}));
const email='authorized@example.test',code='1234ABCDEFGH';
beforeEach(()=>{
  vi.stubEnv('SMTP_HOST','smtp.example.test');vi.stubEnv('SMTP_PORT','465');vi.stubEnv('SMTP_SECURE','true');
  vi.stubEnv('SMTP_USER','sender@example.test');vi.stubEnv('SMTP_FROM','sender@example.test');vi.stubEnv('SMTP_PASS','test-only-password');vi.stubEnv('ZOHO_EMAIL_PASSWORD','');vi.stubEnv('RESEND_API_KEY','test-only-api-key');
  mocks.send.mockReset().mockResolvedValue({accepted:[email],rejected:[],messageId:'smtp-test'});mocks.close.mockReset();
  mocks.transport.mockReset().mockReturnValue({sendMail:mocks.send,close:mocks.close});
  mocks.fetch.mockReset().mockResolvedValue({ok:true,status:200,json:async()=>({id:'resend-test'})});
  vi.stubGlobal('fetch',mocks.fetch);vi.spyOn(console,'info').mockImplementation(()=>{});vi.spyOn(console,'warn').mockImplementation(()=>{});
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();});
describe('own code delivery: direct SMTP with HTTPS contingency',()=>{
  it('uses existing SMTP credentials directly without contacting Resend when accepted',async()=>{
    expect(await deliverOwnSiteCode(email,code)).toEqual({channel:'smtp',messageId:'smtp-test'});expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.transport).toHaveBeenCalledWith(expect.objectContaining({host:'smtp.example.test',port:465,secure:true}));expect(mocks.close).toHaveBeenCalledTimes(1);
  });
  it('falls back to HTTPS only when SMTP fails',async()=>{
    mocks.send.mockRejectedValue(Object.assign(new Error('private provider error'),{code:'ETIMEDOUT'}));
    expect(await deliverOwnSiteCode(email,code)).toEqual({channel:'resend',messageId:'resend-test'});expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });
  it('requires recipient acceptance, not merely a resolved SMTP promise',async()=>{
    mocks.send.mockResolvedValue({accepted:[],rejected:[email],messageId:'rejected'});
    expect((await deliverOwnSiteCode(email,code)).channel).toBe('resend');
  });
  it('does not mistake another accepted recipient for this recipient',async()=>{
    mocks.send.mockResolvedValue({accepted:['other@example.test'],rejected:[email]});expect((await deliverOwnSiteCode(email,code)).channel).toBe('resend');
  });
  it('supports nodemailer Address objects in accepted',async()=>{
    mocks.send.mockResolvedValue({accepted:[{name:'Test',address:email}],messageId:'smtp-test'});expect((await deliverOwnSiteCode(email,code)).channel).toBe('smtp');
  });
  it('sends the same generated code, not two independent codes, on fallback',async()=>{
    mocks.send.mockRejectedValue(new Error('network'));await deliverOwnSiteCode(email,code);
    const smtp=mocks.send.mock.calls[0][0],api=JSON.parse(mocks.fetch.mock.calls[0][1].body);
    expect(smtp.text).toBe(api.text);expect(smtp.html).toBe(api.html);expect(api.to).toEqual([email]);
  });
  it('separates 10-minute code validity from 24-hour access',async()=>{
    await deliverOwnSiteCode(email,code);const message=mocks.send.mock.calls[0][0];
    expect(message.text).toContain('1234-ABCD-EFGH');expect(message.text).toContain('10 minutos');expect(message.text).toContain('24 horas');expect(message.subject).not.toContain(code);
  });
  it('never logs plaintext code, recipient or password',async()=>{
    mocks.send.mockRejectedValue(Object.assign(new Error(email+' '+code+' test-only-password'),{code:'EAUTH'}));await deliverOwnSiteCode(email,code);
    const log=JSON.stringify([vi.mocked(console.info).mock.calls,vi.mocked(console.warn).mock.calls]);
    for(const privateValue of [email,code,'test-only-password'])expect(log).not.toContain(privateValue);
  });
  it('throws safely if SMTP and the exhausted Resend both fail',async()=>{
    mocks.send.mockRejectedValue(new Error('private details'));mocks.fetch.mockResolvedValue({ok:false,status:429});
    await expect(deliverOwnSiteCode(email,code)).rejects.toThrow('SITE_CODE_DELIVERY_UNAVAILABLE');expect(mocks.close).toHaveBeenCalledTimes(1);
  });
  it('uses STARTTLS when the configured SMTP port is 587',async()=>{
    vi.stubEnv('SMTP_PORT','587');vi.stubEnv('SMTP_SECURE','false');await deliverOwnSiteCode(email,code);
    expect(mocks.transport).toHaveBeenCalledWith(expect.objectContaining({secure:false,requireTLS:true}));
  });
  it('uses Zoho password fallback without changing the sender',async()=>{
    vi.stubEnv('SMTP_PASS','');vi.stubEnv('ZOHO_EMAIL_PASSWORD','test-only-zoho');await deliverOwnSiteCode(email,code);
    expect(mocks.transport).toHaveBeenCalledWith(expect.objectContaining({auth:{user:'sender@example.test',pass:'test-only-zoho'}}));
  });
  it('does not invent success when provider returns no message id',async()=>{
    vi.stubEnv('SMTP_PASS','');mocks.fetch.mockResolvedValue({ok:true,json:async()=>({})});await expect(deliverOwnSiteCode(email,code)).rejects.toThrow('UNAVAILABLE');
  });
  it('fails closed when there is no configured delivery channel',async()=>{
    vi.stubEnv('SMTP_PASS','');vi.stubEnv('RESEND_API_KEY','');await expect(deliverOwnSiteCode(email,code)).rejects.toThrow('UNAVAILABLE');
    expect(mocks.send).not.toHaveBeenCalled();expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it('rejects malformed codes before any provider contact',async()=>{
    await expect(deliverOwnSiteCode(email,'<script>')).rejects.toThrow('INVALID_GENERATED_CODE');expect(mocks.send).not.toHaveBeenCalled();expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
