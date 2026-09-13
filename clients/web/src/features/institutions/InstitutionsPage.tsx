import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Button, EmptyState, ErrorState, RefreshBar, SkeletonRows, StatusChip, useToast,
  type ChipTone,
} from '../../components/index.tsx';
import type { ApiClient, ApiFailure } from '../../lib/api.ts';
import { ProvisionDrawer, type ProvisionedInstitution } from './ProvisionDrawer.tsx';
import { InvitationDrawer } from './InvitationDrawer.tsx';
import { InstitutionDrawer } from './InstitutionDrawer.tsx';
import './institutions.css';

interface Institution {
  id: string; code: string; name: string; status: string; seat_limit: number;
}

/**
 * The list is the product (M1 §10). A dense table with search, not a grid of
 * cards, because an operator scans rows and cards waste the vertical space that
 * makes scanning possible.
 *
 * Status distinguishes "loading with nothing" from "refreshing with data on
 * screen": the first gets skeletons, the second a thin bar, and content stays
 * interactive throughout (§7.6).
 */
type Status = 'loading' | 'refreshing' | 'ready' | 'error';

const STATUS_TONE: Record<string, ChipTone> = {
  active: 'success', trial: 'info', suspended: 'warning', closed: 'neutral',
};

export function InstitutionsPage({ api }: { api: ApiClient }) {
  const [rows, setRows] = useState<Institution[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [query, setQuery] = useState('');
  const [provisionOpen, setProvisionOpen] = useState(false);
  const [invitation, setInvitation] = useState<ProvisionedInstitution | null>(null);
  const [invitationTitle, setInvitationTitle] = useState<string | undefined>(undefined);
  const [selected, setSelected] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const load = useCallback(async (mode: 'initial' | 'refresh') => {
    setStatus(mode === 'initial' ? 'loading' : 'refreshing');
    const result = await api.get<Institution[]>('/v1/institutions');
    if (!result.ok) {
      setFailure(result.error);
      // A refresh failure keeps the data already on screen; only a cold load
      // surrenders the whole surface to an error state.
      setStatus(mode === 'initial' ? 'error' : 'ready');
      return;
    }
    setRows(result.value);
    setFailure(null);
    setStatus('ready');
  }, [api]);

  useEffect(() => { void load('initial'); }, [load]);

  // Keyboard: "/" focuses search, "n" opens the create drawer (§12).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName);
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '/') { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === 'n') { e.preventDefault(); setProvisionOpen(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q) || r.code.includes(q));
  }, [rows, query]);

  return (
    <>
      {status === 'refreshing' ? <RefreshBar /> : <div style={{ height: 2 }} />}
        <div className="page__head">
          <div>
            <h1 className="page__title">Colleges</h1>
            <p className="page__sub">
              {status === 'loading' ? 'Loading' : `${rows.length} total`}
            </p>
          </div>
          <div className="page__actions">
            <input
              ref={searchRef}
              className="search"
              type="search"
              placeholder="Search colleges   /"
              aria-label="Search colleges"
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
            />
            <Button variant="primary" onClick={() => setProvisionOpen(true)}>Add college</Button>
          </div>
        </div>

        {failure && status === 'ready' && (
          <div style={{ marginBottom: 'var(--space-base)' }}>
            <ErrorBanner failure={failure} onRetry={() => void load('refresh')} />
          </div>
        )}

        {status === 'error' ? (
          <ErrorState message={failure?.message ?? 'The list could not be loaded.'} onRetry={() => void load('initial')} />
        ) : status !== 'loading' && rows.length === 0 ? (
          <EmptyState
            title="No colleges yet"
            body="Add the first college and its administrator. They will be able to sign in as soon as they accept the invitation."
            action={<Button variant="primary" onClick={() => setProvisionOpen(true)}>Add college</Button>}
          />
        ) : status !== 'loading' && filtered.length === 0 ? (
          <EmptyState
            title="No colleges match that search"
            body={`Nothing matches "${query}". Clear the search to see all ${rows.length}.`}
            action={<Button variant="secondary" onClick={() => setQuery('')}>Clear search</Button>}
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">College</th>
                  <th scope="col">Code</th>
                  <th scope="col">Status</th>
                  <th scope="col">Seats</th>
                </tr>
              </thead>
              <tbody>
                {status === 'loading'
                  ? <SkeletonRows rows={5} widths={['60%', '40%', '56px', '40px']} />
                  : filtered.map((row) => (
                      <tr key={row.id}>
                        <td className="table__primary">
                          <button type="button" className="row-link" onClick={() => setSelected(row.id)}>
                            {row.name}
                          </button>
                        </td>
                        <td className="table__secondary"><code>{row.code}</code></td>
                        <td>
                          <StatusChip tone={STATUS_TONE[row.status] ?? 'neutral'}>{row.status}</StatusChip>
                        </td>
                        <td className="table__secondary tabular">{row.seat_limit}</td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        )}
      <ProvisionDrawer
        open={provisionOpen}
        api={api}
        onClose={() => setProvisionOpen(false)}
        onProvisioned={(result) => {
          setProvisionOpen(false);
          setInvitationTitle(undefined);
          setInvitation(result);
          toast(`${result.institution.name} created`);
          void load('refresh');
        }}
      />

      <InstitutionDrawer
        api={api}
        id={selected}
        onClose={() => setSelected(null)}
        onChanged={() => void load('refresh')}
        onInvitation={(issued) => {
          setInvitationTitle(`New invitation for ${issued.institution.name}`);
          setInvitation(issued);
          toast('New invitation issued. The previous link no longer works.');
        }}
      />

      <InvitationDrawer result={invitation} title={invitationTitle} onClose={() => setInvitation(null)} />
    </>
  );
}

function ErrorBanner({ failure, onRetry }: { failure: ApiFailure; onRetry: () => void }) {
  return (
    <div className="banner banner--error" role="alert">
      <span style={{ flex: 1 }}>{failure.message}</span>
      <Button variant="text" onClick={onRetry}>Retry</Button>
    </div>
  );
}
