import React, { type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { attachSiteDirectoryMetadata, filterSiteDirectory, siteDirectoryAccessLabel, siteDirectoryRegistrationLabel, type SiteDirectoryEntry, type SiteDirectoryCustomer } from '../shared/siteSecurityDirectory';
import { selectVisibleSiteBulkOrders } from '../shared/siteSecurityBulk';
import { SiteSecurityDirectoryControls, type SiteSecurityDirectoryControlsProps } from '../client/src/components/SiteSecurityDirectoryControls';

const person = (extra: Partial<SiteDirectoryEntry> = {}): SiteDirectoryEntry => ({id:81,customerId:null,displayName:'José Novo',email:'novo@example.test',phone:null,status:'active',expiresAt:null,...extra});
const customer = (extra: Partial<SiteDirectoryCustomer> = {}): SiteDirectoryCustomer => ({id:227,name:'José do Cadastro',email:'novo@example.test',phone:'11999990000',deletedAt:null,...extra});
const prepare = (entries = [person()], customers: SiteDirectoryCustomer[] = [], orders: Array<{customerPhone:string;status:string}> = []) => attachSiteDirectoryMetadata(entries,customers,orders);

describe('authorization directory is independent of client registration',()=>{
  it('retains a manual-only email without a phone or orders',()=>{
    expect(prepare()).toEqual([expect.objectContaining({id:81,email:'novo@example.test',registrationState:'none',visibleOrderCount:null,status:'active'})]);
  });
  it.each(['active','suspended','unknown'])('does not change the access state %s during classification',status=>{
    const entry=person({status});
    expect(prepare([entry])[0].status).toBe(status);
    expect(entry.status).toBe(status);
  });
  it('detects a later registration by normalized email without rewriting the authorization',()=>{
    const entry=Object.freeze({...person({status:'suspended'}),sessionVersion:7});
    const [result]=attachSiteDirectoryMetadata([entry],[customer({email:' NOVO@EXAMPLE.TEST '})],[]);
    expect(result).toMatchObject({id:81,customerId:null,status:'suspended',sessionVersion:7,registrationState:'registered',visibleOrderCount:0});
    expect(entry).not.toHaveProperty('registrationState');
  });
  it('gives a confirmed existing customer id priority over a changed email',()=>{
    const [result]=prepare([person({customerId:227})],[customer({email:'changed@example.test'}),customer({id:228,phone:'11888880000'})]);
    expect(result.registeredPhone).toBe('11999990000');
  });
  it('can classify by email after a stale customer link without modifying that link',()=>{
    expect(prepare([person({customerId:999})],[customer()])[0]).toMatchObject({customerId:999,registrationState:'registered'});
  });
  it('does not identify a client merely because their phone matches a manual authorization',()=>{
    expect(prepare([person({phone:'11999990000'})],[customer({email:'other@example.test'})])[0].registrationState).toBe('none');
  });
  it('does not treat an email substring as a match',()=>{
    expect(prepare(undefined,[customer({email:'other-novo@example.test'})])[0].registrationState).toBe('none');
  });
  it('excludes deleted registrations but retains the authorization',()=>{
    expect(prepare(undefined,[customer({deletedAt:new Date()})])[0]).toMatchObject({id:81,registrationState:'none'});
  });
  it('treats duplicate email matches as ambiguous rather than claiming no registration/orders',()=>{
    const [result]=prepare(undefined,[customer(),customer({id:228}),customer({id:229})]);
    expect(result).toMatchObject({registrationState:'ambiguous',visibleOrderCount:null,registeredName:null});
    expect(filterSiteDirectory([result],'without_registration')).toHaveLength(0);
    expect(filterSiteDirectory([result],'registered_without_orders')).toHaveLength(0);
  });
  it('does not invent a zero order count for an unusable customer phone',()=>{
    const [result]=prepare(undefined,[customer({phone:''})]);
    expect(result).toMatchObject({registrationState:'registered',visibleOrderCount:null});
  });
  it('counts visible suborders once rather than status events and excludes hidden suborders',()=>{
    const events=[
      {id:1,registrationId:501,customerPhone:'11999990000',status:'recebido'},
      {id:2,registrationId:501,customerPhone:'11999990000',status:'entregue'},
      {id:3,registrationId:501,customerPhone:'11999990000',status:'recebido'},
      {id:4,registrationId:501,customerPhone:'11999990000',status:'em_analise'},
      {id:5,registrationId:502,customerPhone:'(11) 99999-0000',status:'recebido'},
    ];
    const orders=selectVisibleSiteBulkOrders(events,[{registrationId:501,subOrderIndex:1}]);
    expect(attachSiteDirectoryMetadata([person()],[customer()],orders)[0].visibleOrderCount).toBe(2);
  });
  it('preserves all entry ids and list order, including suspended manual entries',()=>{
    const entries=[person({id:99}),person({id:81,email:'manual@example.test',status:'suspended'})];
    expect(prepare(entries,[customer()]).map(p=>p.id)).toEqual([99,81]);
  });
  it('does not create directory rows for customers without authorizations',()=>{
    expect(prepare([], [customer()])).toEqual([]);
  });
});

describe('independent directory filters and search',()=>{
  const entries=attachSiteDirectoryMetadata([
    person(),person({id:82,email:'registered@example.test',phone:'(61) 99999-1234'}),person({id:83,email:'order@example.test'}),person({id:84,email:'suspended@example.test',status:'suspended'}),
  ],[
    customer({id:228,email:'registered@example.test',phone:'61999991234'}),customer({id:229,email:'order@example.test',phone:'21999990000'}),
  ],[{customerPhone:'21999990000',status:'em_analise'}]);
  it.each([
    ['all',[81,82,83,84]],['without_registration',[81,84]],['registered_without_orders',[82]],['with_orders',[83]],
  ] as const)('filter %s retains the correct authorization ids', (filter,ids)=>{
    expect(filterSiteDirectory(entries,filter).map(p=>p.id)).toEqual(ids);
  });
  it.each(['novo@example.test',' NOVO@EXAMPLE.TEST ','Jose Novo','JOSÉ NOVO'])('finds manual authorization with query %s',query=>{
    expect(filterSiteDirectory(entries,'without_registration',query).map(p=>p.id)).toContain(81);
  });
  it('finds a saved phone ignoring spaces and punctuation',()=>{
    expect(filterSiteDirectory(entries,'all','(61) 99999-1234').map(p=>p.id)).toEqual([82]);
  });
  it('finds a linked client name and phone even if the manual record has neither',()=>{
    const rows=prepare([person({displayName:'227',phone:null})],[customer()]);
    expect(filterSiteDirectory(rows,'all','do Cadastro')).toHaveLength(1);
    expect(filterSiteDirectory(rows,'all','11999990000')).toHaveLength(1);
  });
  it('never turns digits within an unmatched email into a broad phone match',()=>{
    expect(filterSiteDirectory(entries,'all','61@not-matching.test')).toEqual([]);
  });
  it('keeps a suspended person in the same registration filter',()=>{
    expect(filterSiteDirectory(entries,'without_registration','suspended')).toMatchObject([{id:84,status:'suspended'}]);
  });
  it('combines search and filter rather than searching a different data set',()=>{
    expect(filterSiteDirectory(entries,'with_orders','novo')).toEqual([]);
  });
  it('is safe for a temporarily cached row without the new metadata',()=>{
    expect(filterSiteDirectory([person()],'all')).toHaveLength(1);
    expect(filterSiteDirectory([person()],'without_registration')).toHaveLength(0);
  });
  it('does not sort or mutate the supplied entries',()=>{
    const before=JSON.stringify(entries);filterSiteDirectory(entries,'all','Jose');
    expect(JSON.stringify(entries)).toBe(before);
  });
});

describe('directory labels',()=>{
  it.each([
    [{registrationState:'none'},'Sem cadastro de cliente'],
    [{registrationState:'registered',visibleOrderCount:0},'Com cadastro • Sem pedido'],
    [{registrationState:'registered',visibleOrderCount:2},'Com cadastro • 2 pedido(s)'],
    [{registrationState:'ambiguous'},'Cadastro encontrado — vínculo a conferir'],
    [{registrationState:'registered',visibleOrderCount:null},'Com cadastro • Pedidos não identificados'],
    [{},'Vínculo de cadastro não disponível'],
  ] as const)('shows registration label without changing access: %j',(entry,label)=>expect(siteDirectoryRegistrationLabel(entry)).toBe(label));
  it('does not label suspended manual entries as access released',()=>expect(siteDirectoryAccessLabel(person({status:'suspended'}))).toBe('Acesso suspenso'));
  it('shows active access only for a valid nonexpired authorization',()=>expect(siteDirectoryAccessLabel(person())).toBe('Acesso autorizado'));
  it.each(['2020-01-01T00:00:00Z','invalid'])('shows expired/invalid expiry safely: %s',expiresAt=>expect(siteDirectoryAccessLabel(person({expiresAt}))).toBe('Autorização vencida'));
  it('does not claim unknown states are authorized',()=>expect(siteDirectoryAccessLabel(person({status:'unknown'}))).toBe('Situação do acesso a conferir'));
});

function elements(node: ReactNode, type: string): ReactElement<any>[] {
  if(Array.isArray(node))return node.flatMap(n=>elements(n,type));
  if(!React.isValidElement(node))return [];
  const element=node as ReactElement<{children?:ReactNode}>;
  return [...(element.type===type?[element]:[]),...elements(element.props.children,type)];
}
const controls = (extra: Partial<SiteSecurityDirectoryControlsProps> = {}): SiteSecurityDirectoryControlsProps => ({filter:'all',search:'',found:2,total:4,loading:false,onFilter:vi.fn(),onSearch:vi.fn(),onClear:vi.fn(),...extra});

describe('directory controls',()=>{
  it('renders all four options and an independent labeled search',()=>{
    const html=renderToStaticMarkup(SiteSecurityDirectoryControls(controls()));
    expect(html).toContain('Todas as autorizações');expect(html).toContain('Sem cadastro');
    expect(html).toContain('Com cadastro e sem pedido');expect(html).toContain('Com pedido');
    expect(html).toContain('2 de 4 autorização(ões)');expect(html).toContain('Pesquisar autorizações por nome');
  });
  it('changes only the explicit directory filter',()=>{
    const p=controls();elements(SiteSecurityDirectoryControls(p),'select')[0].props.onChange({target:{value:'without_registration'}});
    expect(p.onFilter).toHaveBeenCalledWith('without_registration');expect(p.onSearch).not.toHaveBeenCalled();
  });
  it('ignores unknown filter values',()=>{
    const p=controls();elements(SiteSecurityDirectoryControls(p),'select')[0].props.onChange({target:{value:'INVALID'}});
    expect(p.onFilter).not.toHaveBeenCalled();
  });
  it('passes a manual-only email to the controlled directory search',()=>{
    const p=controls();elements(SiteSecurityDirectoryControls(p),'input')[0].props.onChange({target:{value:'novo@example.test'}});
    expect(p.onSearch).toHaveBeenCalledWith('novo@example.test');
  });
  it('clears through a non-submit button',()=>{
    const p=controls({search:'novo'});const button=elements(SiteSecurityDirectoryControls(p),'button')[0];
    expect(button.props.type).toBe('button');button.props.onClick();expect(p.onClear).toHaveBeenCalledOnce();
  });
  it('shows update status rather than claiming no registrations while loading',()=>{
    expect(renderToStaticMarkup(SiteSecurityDirectoryControls(controls({loading:true})))).toContain('Atualizando autorizações');
  });
  it('has shrinking, stacked controls for narrow screens',()=>{
    const html=renderToStaticMarkup(SiteSecurityDirectoryControls(controls()));
    expect(html).toContain('grid-cols-1 sm:grid-cols-2');expect(html).toContain('min-w-0 w-full');
  });
});

describe('directory integration stays read-only and preserves suspension',()=>{
  const router=readFileSync('server/siteSecurityRouter.ts','utf8');
  const page=readFileSync('client/src/pages/AdminSiteSecurity.tsx','utf8');
  const loader=readFileSync('server/siteSecurityDirectory.ts','utf8');
  it('enriches the existing owner-only list rather than requiring a customer or creating an endpoint',()=>{
    const list=router.slice(router.indexOf('  list: adminProcedure'),router.indexOf('  bulkCandidates:'));
    expect(list).toContain('await requireSiteOwner(ctx.req)');expect(list).toContain('.from(siteAccessEntries)');
    expect(list).toContain('loadSiteDirectory(db,attachSiteAccessProfilePhotos(entries,matching),matching)');
    expect(list+loader).not.toMatch(/\.insert\(|\.update\(|\.delete\(/);
  });
  it('keeps registration/search state separate from the bulk filter',()=>{
    expect(page).toContain('filterSiteDirectory(people.isError?[]:people.data??[],directoryFilter,directorySearch)');
    expect(page).toContain('onClear={()=>{setDirectorySearch("");setDirectoryFilter("all");}}');
    expect(page).toContain('const candidates=bulk.data||[]');
  });
  it('retains the existing real-authorization-id status mutation in the filtered list',()=>{
    expect(page).toContain('directoryPeople.map(p=>');
    expect(page).toContain('change.mutate({id:p.id,status:p.status==="active"?"suspended":"active"})');
    const change=router.slice(router.indexOf('  changeStatus:'),router.indexOf('  remove:'));
    expect(change).toContain('sessionVersion + 1');expect(change).toContain('requireSiteOwner');
    expect(change).not.toContain('customers.id');
  });
  it('does not reset either search when suspending or reactivating',()=>{
    const mutation=page.slice(page.indexOf(' const change='),page.indexOf(' const remove='));
    expect(mutation).not.toMatch(/setDirectory|setBulkSearch|setBulkFilter/);
    expect(mutation).toContain('utils.siteSecurity.list.invalidate()');
  });
});
