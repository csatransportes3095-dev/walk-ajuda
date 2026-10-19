import React, { type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { filteredSiteAccessAction, indexFilteredSiteAccess } from '../shared/siteSecurityFilteredAccess';
import { SiteSecurityFilteredCandidate, type SiteSecurityFilteredCandidateProps } from '../client/src/components/SiteSecurityFilteredCandidate';

const entry = {id: 81, email: 'person@example.test', status: 'active', expiresAt: null};
const candidate = {
  id: 227, name: 'Pessoa de teste', email: entry.email, phone: '11900000000',
  orderCount: 0, loanCount: 2, activeOrders: 0, deliveredOrders: 0, inProgressOrders: 0,
  alreadyAuthorized: true,
};
afterEach(() => vi.restoreAllMocks());

function props(overrides: Partial<SiteSecurityFilteredCandidateProps> = {}): SiteSecurityFilteredCandidateProps {
  return {candidate, authorization: entry, selected: false, bulkRunning: false, showLoans: false,
    actionDisabled: false, actionPending: false, onSelect: vi.fn(), onChangeStatus: vi.fn(), ...overrides};
}
function elements(node: ReactNode, type: string): ReactElement<any>[] {
  return React.Children.toArray(node).flatMap(child => {
    if (!React.isValidElement<{children?: ReactNode}>(child)) return [];
    return [...(child.type === type ? [child] : []), ...elements(child.props.children, type)];
  });
}
function html(overrides: Partial<SiteSecurityFilteredCandidateProps> = {}) {
  return renderToStaticMarkup(React.createElement(SiteSecurityFilteredCandidate, props(overrides)));
}

describe('filtered authorization identity', () => {
  it('uses the authorization id, not the customer id or the first person on the list', () => {
    const index = indexFilteredSiteAccess([{id: 1, email: 'other@example.test', status: 'active'}, entry]);
    expect(filteredSiteAccessAction(candidate.email, index.get(candidate.email))).toEqual({id:81,status:'suspended',label:'Suspender',badge:'Já autorizado'});
  });
  it('normalizes email case and outer spaces for an exact match', () => {
    const index = indexFilteredSiteAccess([{...entry, email: ' PERSON@EXAMPLE.TEST '}]);
    expect(filteredSiteAccessAction(' Person@Example.Test ', index.get('person@example.test'))?.id).toBe(81);
  });
  it.each(['another@example.test','person2@example.test','person@example.test.evil','person@other.test'])('does not match a different email: %s', email => {
    expect(filteredSiteAccessAction(email, entry)).toBeNull();
  });
  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects an invalid authorization id: %s', id => {
    const broken = {...entry, id};
    expect(indexFilteredSiteAccess([broken]).get(entry.email)).toBeNull();
    expect(filteredSiteAccessAction(entry.email, broken)).toBeNull();
  });
  it.each([undefined, null])('shows no action without an authorization: %s', missing => {
    expect(filteredSiteAccessAction(entry.email, missing)).toBeNull();
  });
  it.each(['unknown','deleted','ACTIVE',''])('does not invent an action for an unexpected status: %s', status => {
    expect(filteredSiteAccessAction(entry.email, {...entry,status})).toBeNull();
  });
  it('offers reactivation only for a suspended record', () => {
    expect(filteredSiteAccessAction(entry.email, {...entry,status:'suspended'})).toEqual({id:81,status:'active',label:'Reativar',badge:'Suspenso'});
  });
  it.each(['2020-01-01T00:00:00Z','invalid'])('does not describe expired or invalid expiry as authorized: %s', expiresAt => {
    expect(filteredSiteAccessAction(entry.email, {...entry,expiresAt})).toMatchObject({status:'suspended',badge:'Autorização vencida'});
  });
  it('allows suspension of an authorization with a future expiry without editing expiry', () => {
    const future = {...entry,expiresAt:new Date(Date.now()+86400000)};
    expect(filteredSiteAccessAction(entry.email, future)).toMatchObject({status:'suspended',badge:'Já autorizado'});
    expect(future.status).toBe('active');
  });
  it('does not choose between ambiguous normalized records, including a third match', () => {
    const duplicates = [entry,{...entry,id:82,email:' PERSON@EXAMPLE.TEST '},{...entry,id:83}];
    const index = indexFilteredSiteAccess(duplicates);
    expect(index.get(entry.email)).toBeNull();
    expect(filteredSiteAccessAction(entry.email,index.get(entry.email))).toBeNull();
  });
  it('does not ignore a malformed duplicate and use a different matching id', () => {
    expect(indexFilteredSiteAccess([{...entry,id:0},entry]).get(entry.email)).toBeNull();
    expect(indexFilteredSiteAccess([entry,{...entry,id:0}]).get(entry.email)).toBeNull();
  });
  it.each(['','invalid','person@',' person @example.test','x'.repeat(321)])('ignores invalid emails: %s', email => {
    expect(indexFilteredSiteAccess([{...entry,email}]).size).toBe(0);
    expect(filteredSiteAccessAction(email,{...entry,email})).toBeNull();
  });
  it('is presentation-only and does not change source data', () => {
    const frozen = Object.freeze({...entry});
    const list = Object.freeze([frozen]);
    expect(filteredSiteAccessAction(entry.email,indexFilteredSiteAccess(list).get(entry.email))?.label).toBe('Suspender');
    expect(frozen).toEqual(entry);
  });
});

describe('filtered row rendering and actions', () => {
  it('shows Suspender next to Ja autorizado even when the filtered client has zero orders', () => {
    const output = html();
    expect(output).toContain('Já autorizado');
    expect(output).toContain('>Suspender</button>');
    expect(output).toContain('0 pedido(s)');
  });
  it('puts the action outside the checkbox label and prevents form submission', () => {
    const tree = SiteSecurityFilteredCandidate(props());
    expect(elements(tree,'label')).toHaveLength(1);
    expect(elements(elements(tree,'label')[0],'button')).toHaveLength(0);
    expect(elements(tree,'button')[0].props.type).toBe('button');
    expect(elements(tree,'input')[0].props.disabled).toBe(true);
  });
  it('click dispatches only the matched authorization id and the explicit target status', () => {
    const p = props();
    elements(SiteSecurityFilteredCandidate(p),'button')[0].props.onClick();
    expect(p.onChangeStatus).toHaveBeenCalledTimes(1);
    expect(p.onChangeStatus).toHaveBeenCalledWith({id:81,status:'suspended'});
    expect(p.onSelect).not.toHaveBeenCalled();
  });
  it('changes to Reativar after the confirmed data has status suspended', () => {
    const p = props({authorization:{...entry,status:'suspended'}});
    const tree = SiteSecurityFilteredCandidate(p);
    expect(renderToStaticMarkup(tree)).toContain('>Reativar</button>');
    expect(renderToStaticMarkup(tree)).toContain('Suspenso');
    elements(tree,'button')[0].props.onClick();
    expect(p.onChangeStatus).toHaveBeenCalledTimes(1);
    expect(p.onChangeStatus).toHaveBeenCalledWith({id:81,status:'active'});
  });
  it.each(['actionDisabled','actionPending','bulkRunning'] as const)('blocks mutation while %s is true', field => {
    const p = props({[field]:true});
    const button = elements(SiteSecurityFilteredCandidate(p),'button')[0];
    expect(button.props.disabled).toBe(true);
    button.props.onClick();
    expect(p.onChangeStatus).not.toHaveBeenCalled();
  });
  it('shows a pending label without claiming success', () => {
    expect(html({actionPending:true})).toContain('Salvando...');
    expect(html({actionPending:true})).not.toContain('Acesso suspenso.');
  });
  it.each([undefined,null,{...entry,email:'other@example.test'},{...entry,status:'unknown'}])('has no status action when the match is missing or invalid: %j', authorization => {
    const p = props({authorization});
    expect(elements(SiteSecurityFilteredCandidate(p),'button')).toHaveLength(0);
    expect(p.onChangeStatus).not.toHaveBeenCalled();
  });
  it('keeps new-customer checkbox selection independent and does not offer suspension', () => {
    const p = props({candidate:{...candidate,alreadyAuthorized:false},authorization:undefined});
    const tree = SiteSecurityFilteredCandidate(p);
    const checkbox = elements(tree,'input')[0];
    expect(checkbox.props.disabled).toBe(false);
    expect(elements(tree,'button')).toHaveLength(0);
    checkbox.props.onChange({target:{checked:true}});
    expect(p.onSelect).toHaveBeenCalledTimes(1);
    expect(p.onSelect).toHaveBeenCalledWith(227,true);
    expect(p.onChangeStatus).not.toHaveBeenCalled();
  });
  it('keeps the loans filter information', () => {
    expect(html({showLoans:true})).toContain('2 empréstimo(s)');
    expect(html()).not.toContain('empréstimo(s)');
  });
  it('escapes customer text instead of rendering HTML', () => {
    expect(html({candidate:{...candidate,name:'<script>alert(1)</script>'}})).toContain('&lt;script&gt;');
    expect(html({candidate:{...candidate,name:'<script>alert(1)</script>'}})).not.toContain('<script>');
  });
});

describe('page integration preserves the existing operation', () => {
  const page = readFileSync('client/src/pages/AdminSiteSecurity.tsx','utf8');
  it('uses the existing mutation without creating a new endpoint or a customer-id action', () => {
    expect(page.match(/trpc\.siteSecurity\.changeStatus\.useMutation/g)).toHaveLength(1);
    expect(page).toContain('authorization={accessByEmail.get(siteBulkEmail(c.email))}');
    expect(page).not.toContain('change.mutate({id:c.id');
  });
  it('refreshes both lists after success and keeps the filter/search state', () => {
    const mutation = page.slice(page.indexOf(' const change='),page.indexOf(' const remove='));
    expect(mutation).toContain('await Promise.all([utils.siteSecurity.list.invalidate(),utils.siteSecurity.bulkCandidates.invalidate()])');
    expect(mutation).not.toMatch(/setBulkSearch|setBulkFilter|setSelectedIds|setBulkOpen/);
    expect(mutation).not.toContain('toast.error(e.message)');
  });
  it('keeps already-authorized clients out of the batch selection', () => {
    expect(page).toContain('const eligible=candidates.filter(c=>!c.alreadyAuthorized)');
    expect(page).toContain('const selected=selectedIds.filter(id=>eligible.some(c=>c.id===id))');
  });
  it('does not reuse authorization data after a read error', () => {
    expect(page).toContain('indexFilteredSiteAccess(people.isError?[]:people.data??[])');
    expect(page).toContain('actionDisabled={change.isPending||people.isFetching||people.isError||bulk.isFetching||bulk.isError}');
  });
});
