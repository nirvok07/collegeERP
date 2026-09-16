import { Fragment, useCallback, useEffect, useState } from 'react';
import {
  Banner, Button, EmptyState, ErrorState, RefreshBar, SkeletonRows,
} from '../../components/index.tsx';
import type { ApiClient, ApiFailure } from '../../lib/api.ts';
import {
  EMPTY_FILTERS, PLATFORM_ACTIONS, actionLabel, auditPath, changeSummary, detailEntries,
  formatAt, isFiltering, rangeError, type AuditEvent, type AuditFilters, type AuditPageData,
} from './audit.ts';
import './audit.css';

type Status = 'loading' | 'refreshing' | 'ready' | 'error';
interface College { id: string; code: string; name: string }

/**
 * What platform accounts did, newest first (SA-2). A dense table an operator
 * scans, filters that change the query rather than hide rows, and a detail row
 * per event. Reading this is not audited; there is no policy asking for it.
 */
export function AuditPage({ api }: { api: ApiClient }) {
  const [filters, setFilters] = useState<AuditFilters>(EMPTY_FILTERS);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [colleges, setColleges] = useState<College[]>([]);

  useEffect(() => {
    void api.get<College[]>('/v1/institutions').then((r) => { if (r.ok) setColleges(r.value); });
  }, [api]);

  const invalid = rangeError(filters);

  const load = useCallback(async (f: AuditFilters, mode: 'initial' | 'refresh') => {
    setStatus(mode === 'initial' ? 'loading' : 'refreshing');
    const result = await api.get<AuditPageData>(auditPath(f));
    if (!result.ok) {
      setFailure(result.error);
      setStatus(mode === 'initial' ? 'error' : 'ready');
      return;
    }
    setEvents(result.value.events);
    setCursor(result.value.next_cursor);
    setFailure(null);
    setStatus('ready');
  }, [api]);

  useEffect(() => {
    if (rangeError(filters)) return;
    void load(filters, events.length === 0 ? 'initial' : 'refresh');
    // Reloads when the filters change; the event count only picks the mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, load]);

  async function more() {
    if (!cursor) return;
    setLoadingMore(true);
    const result = await api.get<AuditPageData>(auditPath(filters, cursor));
    setLoadingMore(false);
    if (!result.ok) { setFailure(result.error); return; }
    setEvents((prev) => [...prev, ...result.value.events]);
    setCursor(result.value.next_cursor);
  }

  const set = (patch: Partial<AuditFilters>) => setFilters((f) => ({ ...f, ...patch }));

  return (
    <>
      {status === 'refreshing' ? <RefreshBar /> : <div style={{ height: 2 }} />}
      <div className="page__head">
        <div>
          <p className="page__eyebrow">Platform</p>
          <h1 className="page__title">Audit</h1>
          <p className="page__sub">What platform accounts did, newest first. A college's own activity is not shown.</p>
        </div>
      </div>

      <div className="audit-filters" role="search">
        <label>
          <span>College</span>
          <select value={filters.college} onChange={(e) => set({ college: e.currentTarget.value })}>
            <option value="">All colleges</option>
            {colleges.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>
          <span>Action</span>
          <select value={filters.action} onChange={(e) => set({ action: e.currentTarget.value })}>
            <option value="">All actions</option>
            {PLATFORM_ACTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </label>
        <label>
          <span>From</span>
          <input type="date" value={filters.from} onChange={(e) => set({ from: e.currentTarget.value })} />
        </label>
        <label>
          <span>To</span>
          <input type="date" value={filters.to} onChange={(e) => set({ to: e.currentTarget.value })} />
        </label>
        {isFiltering(filters) && (
          <Button variant="text" onClick={() => setFilters(EMPTY_FILTERS)}>Clear</Button>
        )}
      </div>

      {invalid && <Banner tone="warning">{invalid}</Banner>}
      {failure && status === 'ready' && (
        <div className="banner banner--error" role="alert">
          <span style={{ flex: 1 }}>{failure.message}</span>
          <Button variant="text" onClick={() => void load(filters, 'refresh')}>Retry</Button>
        </div>
      )}

      {status === 'error' ? (
        <ErrorState message={failure?.message ?? 'The audit trail could not be loaded.'} onRetry={() => void load(filters, 'initial')} />
      ) : status !== 'loading' && events.length === 0 ? (
        <EmptyState
          title={isFiltering(filters) ? 'Nothing matches these filters' : 'No platform activity yet'}
          body={isFiltering(filters)
            ? 'Widen the date range or clear a filter.'
            : 'Provisioning, lifecycle changes, invitations and platform sign-ins will appear here.'}
          action={isFiltering(filters) ? <Button variant="secondary" onClick={() => setFilters(EMPTY_FILTERS)}>Clear filters</Button> : undefined}
        />
      ) : (
        <div className="table-wrap">
          <table className="table audit-table">
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Action</th>
                <th scope="col">College</th>
                <th scope="col">By</th>
                <th scope="col">Reason</th>
              </tr>
            </thead>
            <tbody>
              {status === 'loading'
                ? <SkeletonRows rows={8} widths={['130px', '40%', '30%', '25%', '30%']} />
                : events.map((e) => {
                    const expanded = open === e.id;
                    const summary = changeSummary(e);
                    return (
                      <Fragment key={e.id}>
                        <tr>
                          <td className="table__secondary tabular nowrap">{formatAt(e.at)}</td>
                          <td>
                            <button
                              type="button"
                              className="row-link"
                              aria-expanded={expanded}
                              onClick={() => setOpen(expanded ? null : e.id)}
                            >
                              {actionLabel(e.action)}
                            </button>
                            {summary && <div className="table__secondary">{summary}</div>}
                          </td>
                          <td className="table__secondary">{e.college?.name ?? <em>Platform</em>}</td>
                          <td className="table__secondary">{e.actor?.name ?? e.actor?.email ?? 'Operator (system)'}</td>
                          <td className="table__secondary">{e.reason ?? '—'}</td>
                        </tr>
                        {expanded && (
                          <tr className="audit-detail">
                            <td colSpan={5}>
                              <dl className="audit-detail__list">
                                <div><dt>Action code</dt><dd><code>{e.action}</code></dd></div>
                                <div><dt>Subject</dt><dd><code>{e.subject.type}</code> {e.subject.id ?? ''}</dd></div>
                                {e.actor?.email && <div><dt>Account</dt><dd>{e.actor.email}</dd></div>}
                                <div><dt>Correlation</dt><dd><code>{e.correlation_id}</code></dd></div>
                                {detailEntries(e).map(([k, v]) => (
                                  <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
                                ))}
                              </dl>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
            </tbody>
          </table>
        </div>
      )}

      {status !== 'loading' && events.length > 0 && (
        <div className="audit-pager">
          <span className="table__secondary">{events.length} shown{cursor ? '' : ', the whole range'}</span>
          {cursor && <Button variant="secondary" loading={loadingMore} onClick={() => void more()}>Load more</Button>}
        </div>
      )}
    </>
  );
}
