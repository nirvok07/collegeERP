import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button, EmptyState, ErrorState, RefreshBar, StatusChip, useToast,
} from '../../components/index.tsx';
import type { ApiClient, ApiFailure } from '../../lib/api.ts';
import { buildTree, type Campus, type Department } from './types.ts';
import { UnitDrawer } from './UnitDrawer.tsx';
import './organisation.css';

type Status = 'loading' | 'refreshing' | 'ready' | 'error';

/**
 * The organisational tree: campuses, and the departments inside them.
 *
 * Hierarchy is shown as actual nesting rather than a flat table with a campus
 * column, because the relationship is the point. An administrator here is
 * answering "what is this college made of", not scanning rows.
 */
export function OrganisationPage({ api, canManage }: { api: ApiClient; canManage: boolean }) {
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [drawer, setDrawer] = useState<
    | { kind: 'campus' }
    | { kind: 'department'; campus: Campus }
    | { kind: 'archive'; unit: Campus | Department; type: 'campus' | 'department' }
    | null
  >(null);
  const toast = useToast();

  const load = useCallback(async (mode: 'initial' | 'refresh') => {
    setStatus(mode === 'initial' ? 'loading' : 'refreshing');
    const suffix = showArchived ? '?archived=true' : '';
    const [c, d] = await Promise.all([
      api.get<Campus[]>(`/v1/campuses${suffix}`),
      api.get<Department[]>(`/v1/departments${suffix}`),
    ]);
    if (!c.ok || !d.ok) {
      setFailure(c.ok ? (d as { error: ApiFailure }).error : c.error);
      setStatus(mode === 'initial' ? 'error' : 'ready');
      return;
    }
    setCampuses(c.value);
    setDepartments(d.value);
    setFailure(null);
    setStatus('ready');
  }, [api, showArchived]);

  useEffect(() => { void load('initial'); }, [load]);

  const tree = useMemo(() => buildTree(campuses, departments), [campuses, departments]);
  const totals = useMemo(() => ({
    campuses: campuses.filter((c) => c.status === 'active').length,
    departments: departments.filter((d) => d.status === 'active').length,
  }), [campuses, departments]);

  return (
    <>
      {status === 'refreshing' ? <RefreshBar /> : <div style={{ height: 2 }} />}

      <div className="page__head">
        <div>
          <h1 className="page__title">Organisation</h1>
          <p className="page__sub">
            {status === 'loading'
              ? 'Loading'
              : `${totals.campuses} ${totals.campuses === 1 ? 'campus' : 'campuses'}, ${totals.departments} ${totals.departments === 1 ? 'department' : 'departments'}`}
          </p>
        </div>
        <div className="page__actions">
          <label className="toggle">
            <input
              type="checkbox" checked={showArchived}
              onChange={(e) => setShowArchived(e.currentTarget.checked)}
            />
            Show archived
          </label>
          {canManage && (
            <Button variant="primary" onClick={() => setDrawer({ kind: 'campus' })}>Add campus</Button>
          )}
        </div>
      </div>

      {failure && status === 'ready' && (
        <div className="banner banner--error" role="alert" style={{ marginBottom: 'var(--space-base)' }}>
          <span style={{ flex: 1 }}>{failure.message}</span>
          <Button variant="text" onClick={() => void load('refresh')}>Retry</Button>
        </div>
      )}

      {status === 'error' ? (
        <ErrorState
          message={failure?.message ?? 'The organisation could not be loaded.'}
          onRetry={() => void load('initial')}
        />
      ) : status === 'loading' ? (
        <div className="org-skeleton">
          {[0, 1].map((i) => <div key={i} className="skeleton" style={{ height: 96 }} />)}
        </div>
      ) : tree.length === 0 ? (
        <EmptyState
          title="No campuses yet"
          body="Every college has at least one campus. Add it, then create the departments inside it."
          action={canManage ? <Button variant="primary" onClick={() => setDrawer({ kind: 'campus' })}>Add campus</Button> : undefined}
        />
      ) : (
        <ul className="org-tree m-stagger">
          {tree.map(({ campus, departments: children }) => (
            <li key={campus.id} className={`org-campus${campus.status === 'archived' ? ' org-campus--archived' : ''}`}>
              <div className="org-campus__head">
                <div className="org-campus__identity">
                  <h2 className="org-campus__name">{campus.name}</h2>
                  <code className="org-code">{campus.code}</code>
                  {campus.is_default && <StatusChip tone="info">Main campus</StatusChip>}
                  {campus.status === 'archived' && <StatusChip tone="neutral">Archived</StatusChip>}
                </div>
                {canManage && campus.status === 'active' && (
                  <div className="org-campus__actions">
                    <Button variant="text" onClick={() => setDrawer({ kind: 'department', campus })}>
                      Add department
                    </Button>
                    {!campus.is_default && (
                      <Button
                        variant="text"
                        onClick={() => setDrawer({ kind: 'archive', unit: campus, type: 'campus' })}
                      >
                        Archive
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {children.length === 0 ? (
                <p className="org-empty">
                  No departments yet.
                  {canManage && campus.status === 'active' && ' Add one to start scoping access to it.'}
                </p>
              ) : (
                <ul className="org-departments">
                  {children.map((department) => (
                    <li
                      key={department.id}
                      className={`org-department${department.status === 'archived' ? ' org-department--archived' : ''}`}
                    >
                      <span className="org-department__name">{department.name}</span>
                      <code className="org-code">{department.code}</code>
                      {department.status === 'archived' && <StatusChip tone="neutral">Archived</StatusChip>}
                      {canManage && department.status === 'active' && (
                        <span className="row-action org-department__actions">
                          <Button
                            variant="text"
                            onClick={() => setDrawer({ kind: 'archive', unit: department, type: 'department' })}
                          >
                            Archive
                          </Button>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      <UnitDrawer
        request={drawer}
        api={api}
        onClose={() => setDrawer(null)}
        onDone={(message) => { setDrawer(null); toast(message); void load('refresh'); }}
      />
    </>
  );
}
