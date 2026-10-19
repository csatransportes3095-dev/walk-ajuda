import React from 'react';
import type { SiteBulkCandidate } from '@shared/siteSecurityBulk';
import { filteredSiteAccessAction, type FilteredSiteAccessEntry } from '@shared/siteSecurityFilteredAccess';

export type SiteSecurityFilteredCandidateProps = {
  candidate: SiteBulkCandidate;
  authorization?: FilteredSiteAccessEntry | null;
  selected: boolean;
  bulkRunning: boolean;
  showLoans: boolean;
  actionDisabled: boolean;
  actionPending: boolean;
  onSelect: (customerId: number, checked: boolean) => void;
  onChangeStatus: (input: {id: number; status: 'active' | 'suspended'}) => void;
};

/** Reuses the existing owner-only mutation; a customer id must never be sent as an access id. */
export function SiteSecurityFilteredCandidate(props: SiteSecurityFilteredCandidateProps) {
  const {candidate, authorization, selected, bulkRunning, showLoans, actionDisabled, actionPending, onSelect, onChangeStatus} = props;
  const action = candidate.alreadyAuthorized ? filteredSiteAccessAction(candidate.email, authorization) : null;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-white/5">
      <label className="flex min-w-0 flex-1 items-center gap-3">
        <input
          type="checkbox"
          className="h-4 w-4 shrink-0"
          disabled={candidate.alreadyAuthorized || bulkRunning}
          checked={selected}
          onChange={event => onSelect(candidate.id, event.target.checked)}
        />
        <span className="min-w-0 flex-1">
          <span className="break-words font-bold [overflow-wrap:anywhere]">{candidate.name}</span>
          <span className="block break-all text-xs text-white/60">
            {candidate.email} · {candidate.orderCount} pedido(s){showLoans ? ' · ' + candidate.loanCount + ' empréstimo(s)' : ''}
          </span>
        </span>
      </label>
      {candidate.alreadyAuthorized && (
        <div className="flex w-full shrink-0 flex-wrap items-center justify-end gap-2 sm:w-auto">
          <span className="text-xs text-white/50">{action?.badge ?? 'Já cadastrado'}</span>
          {action && (
            <button
              type="button"
              disabled={actionDisabled || actionPending || bulkRunning}
              aria-label={action.label + ' acesso de ' + candidate.name}
              onClick={() => {
                if (actionDisabled || actionPending || bulkRunning) return;
                onChangeStatus({id: action.id, status: action.status});
              }}
              className="rounded-lg border border-white/20 p-2 text-xs disabled:cursor-wait disabled:opacity-50"
            >
              {actionPending ? 'Salvando...' : action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
