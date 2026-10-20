import React from 'react';
import { siteDirectoryFilters, type SiteDirectoryFilter } from '@shared/siteSecurityDirectory';

export type SiteSecurityDirectoryControlsProps = {
  filter: SiteDirectoryFilter;
  search: string;
  found: number;
  total: number;
  loading: boolean;
  onFilter: (value: SiteDirectoryFilter) => void;
  onSearch: (value: string) => void;
  onClear: () => void;
};
const labels: Record<SiteDirectoryFilter, string> = {
  all: 'Todas as autorizações',
  without_registration: 'Sem cadastro — somente autorização',
  registered_without_orders: 'Com cadastro e sem pedido',
  with_orders: 'Com pedido',
};

export function SiteSecurityDirectoryControls(props: SiteSecurityDirectoryControlsProps) {
  return <div className="min-w-0 rounded-xl border border-white/10 bg-black/20 p-3 space-y-3" role="region" aria-label="Pesquisar pessoas autorizadas">
    <p className="font-bold">Gerenciar autorizações</p>
    <p className="text-sm text-white/65">Encontre também quem recebeu acesso por e-mail e ainda não tem cadastro de cliente.</p>
    <div className="grid min-w-0 grid-cols-1 sm:grid-cols-2 gap-2">
      <select aria-label="Filtrar autorizações por cadastro" value={props.filter} onChange={event=>{
        const value=event.target.value as SiteDirectoryFilter;
        if(siteDirectoryFilters.includes(value))props.onFilter(value);
      }} className="min-w-0 w-full bg-[#292939] border border-white/20 rounded-lg p-3">
        {siteDirectoryFilters.map(value=><option key={value} value={value}>{labels[value]}</option>)}
      </select>
      <input aria-label="Pesquisar autorizações por nome, e-mail ou telefone" value={props.search} maxLength={320} onChange={event=>props.onSearch(event.target.value)} placeholder="Nome, e-mail ou telefone" className="min-w-0 w-full bg-[#292939] border border-white/20 rounded-lg p-3"/>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p role="status" className="text-sm text-white/70">{props.loading?'Atualizando autorizações...':`${props.found} de ${props.total} autorização(ões)`}</p>
      <button type="button" onClick={props.onClear} disabled={!props.search&&props.filter==='all'} className="rounded-lg border border-white/20 px-3 py-2 text-sm disabled:opacity-40">Limpar busca</button>
    </div>
  </div>;
}
