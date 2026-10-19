import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addManualSiteAccess, siteAccessSqlFailure } from './siteAccessManualAdd';
import { manualSiteAccessFeedback, manualSiteAccessErrorMessage } from '../shared/siteSecurityManualFeedback';

afterEach(()=>vi.restoreAllMocks());

describe('manual authorization error diagnostics',()=>{
  it('extracts the driver cause without SQL or parameters',()=>{
    const cause={code:'ER_DUP_ENTRY',errno:1062,sqlState:'23000',sql:'INSERT PRIVATE',sqlMessage:'private@example.test'};
    const error={message:'Failed query: INSERT PRIVATE',cause};
    expect(siteAccessSqlFailure(error)).toEqual({code:'ER_DUP_ENTRY',errno:1062,sqlState:'23000'});
  });
  it('handles nested wrappers',()=>{
    expect(siteAccessSqlFailure({cause:{cause:{code:'ER_NO_DEFAULT_FOR_FIELD',errno:1364,sqlState:'HY000'}}})).toEqual({code:'ER_NO_DEFAULT_FOR_FIELD',errno:1364,sqlState:'HY000'});
  });
  it.each([null,undefined,'arbitrary error',new Error('private@example.test'),{code:'bad private value',errno:NaN,sqlState:'unsafe string'}])('does not log unsanitized diagnostics: %j',error=>{
    expect(siteAccessSqlFailure(error)).toEqual({code:'UNKNOWN',errno:null,sqlState:null});
  });
  it('terminates on a cyclic driver cause',()=>{
    const error:any={};error.cause=error;
    expect(siteAccessSqlFailure(error).code).toBe('UNKNOWN');
  });
  it('accepts numeric-only driver code without using its message',()=>{
    expect(siteAccessSqlFailure({errno:1062,message:'private SQL'})).toEqual({code:'MYSQL_ERROR',errno:1062,sqlState:null});
  });
  it('does not return success if MySQL does not allocate a valid id',async()=>{
    const audit=vi.fn();
    const fakeDb:any={
      select:()=>({from:()=>({where:()=>({limit:async()=>[]})})}),
      transaction:async(fn:any)=>fn({execute:async()=>[{insertId:0}],insert:audit}),
    };
    const log=vi.spyOn(console,'error').mockImplementation(()=>{});
    await expect(addManualSiteAccess(fakeDb,'test-owner',{displayName:'Teste',email:'private@example.test'})).rejects.toMatchObject({code:'INTERNAL_SERVER_ERROR',message:expect.stringContaining('SAE_ADD')});
    expect(audit).not.toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain('private@example.test');
  });
  it('does not leak database connection or SQL details on lookup failure',async()=>{
    const error={message:'password=SECRET; SQL private@example.test',cause:{code:'ER_ACCESS_DENIED_ERROR',errno:1045,sqlState:'28000'}};
    const fakeDb:any={select:()=>{throw error}};
    const log=vi.spyOn(console,'error').mockImplementation(()=>{});
    await expect(addManualSiteAccess(fakeDb,'test-owner',{displayName:'Teste',email:'private@example.test'})).rejects.toMatchObject({message:'Não foi possível salvar a autorização. Tente novamente. Código: SAE_ADD.'});
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/SECRET|private@example|password|SQL/);
  });
});

describe('manual authorization feedback',()=>{
  it('announces a newly persisted authorization',()=>{
    expect(manualSiteAccessFeedback({created:true,status:'active',expired:false})).toEqual({kind:'success',clearForm:true,message:'Autorização registrada.'});
  });
  it('warns clearly when the email is already authorized without claiming a new registration',()=>{
    expect(manualSiteAccessFeedback({created:false,status:'active',expired:false})).toEqual({kind:'warning',clearForm:false,message:'Este e-mail já está autorizado. Não é necessário adicioná-lo novamente.'});
  });
  it('does not claim that adding an existing suspended email reactivates it',()=>{
    expect(manualSiteAccessFeedback({created:false,status:'suspended',expired:false})).toMatchObject({kind:'warning',clearForm:false,message:expect.stringContaining('continua suspenso')});
  });
  it('does not claim that adding an expired email renews it',()=>{
    expect(manualSiteAccessFeedback({created:false,status:'active',expired:true})).toMatchObject({kind:'warning',clearForm:false,message:expect.stringContaining('vencida')});
  });
  it('fails closed for an unknown authorization state',()=>{
    expect(manualSiteAccessFeedback({created:false,status:'unknown',expired:false})).toMatchObject({kind:'warning',clearForm:false});
  });
  it.each(['INTERNAL_SERVER_ERROR',undefined,'other','Failed query INSERT private@example.test'])('never prints raw server messages for %s',code=>{
    expect(manualSiteAccessErrorMessage(code)).toBe('Não foi possível salvar a autorização. Tente novamente. Código: SAE_ADD.');
  });
  it.each(['BAD_REQUEST','FORBIDDEN','UNAUTHORIZED','CONFLICT'])('gives a safe actionable message for %s',code=>{
    expect(manualSiteAccessErrorMessage(code)).not.toContain('SAE_ADD');
    expect(manualSiteAccessErrorMessage(code).length).toBeGreaterThan(15);
  });
});

describe('manual authorization wiring',()=>{
  const router=readFileSync('server/siteSecurityRouter.ts','utf8');
  const ui=readFileSync('client/src/pages/AdminSiteSecurity.tsx','utf8');
  it('keeps owner verification before the helper',()=>{
    const add=router.slice(router.indexOf('  add: adminProcedure'),router.indexOf('  changeStatus: adminProcedure'));
    expect(add.indexOf('requireSiteOwner(ctx.req)')).toBeGreaterThan(0);
    expect(add.indexOf('requireSiteOwner(ctx.req)')).toBeLessThan(add.indexOf('addManualSiteAccess(db,actor,input)'));
    expect(add).not.toContain('db.insert(siteAccessEntries)');
  });
  it('refreshes authorized people and bulk candidates after manual add',()=>{
    const add=ui.slice(ui.indexOf(' const add='),ui.indexOf(' const change='));
    expect(add).toContain('utils.siteSecurity.list.invalidate()');
    expect(add).toContain('utils.siteSecurity.bulkCandidates.invalidate()');
    expect(add).toContain('manualSiteAccessFeedback(result)');
    expect(add).toContain('manualSiteAccessErrorMessage(e.data?.code)');
    expect(add).not.toContain('toast.error(e.message)');
  });
  it('guards duplicate form submits without changing the form layout',()=>{
    expect(ui).toContain('if(add.isPending)return;add.mutate(');
    expect(ui).toContain('disabled={add.isPending}');
    expect(ui).toContain('placeholder="Telefone (opcional)"');
  });
});
