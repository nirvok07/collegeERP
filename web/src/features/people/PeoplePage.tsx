import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Button, EmptyState, ErrorState, RefreshBar, SkeletonRows, StatusChip, useToast,
  type ChipTone,
} from '../../components/index.tsx';
import type { ApiClient, ApiFailure } from '../../lib/api.ts';
import { InvitePersonDrawer } from './InvitePersonDrawer.tsx';
import { AssignRoleDrawer } from './AssignRoleDrawer.tsx';
import { InvitationDrawer } from '../institutions/InvitationDrawer.tsx';
import type { Person, Role } from './types.ts';
import './people.css';

type Status = 'loading' | 'refreshing' | 'ready' | 'error';

const ACCOUNT_TONE: Record<string, ChipTone> = {
  active: 'success', invited: 'info', locked: 'warning',
  suspended: 'warning', deactivated: 'neutral',
};

/**
 * The People list. Dense table, saved-free filtering, and the two actions an
 * administrator performs constantly: invite someone, and change what they can do.
 *
 * Roles render as chips rather than a permission list, because nobody reads a
 * permission list and predicts its effect.
 */
export function PeoplePage({ api, canManage }: { api: ApiClient; canManage: boolean }) {
  const [rows, setRows] = useState<Person[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'staff' | 'student'>('all');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [assignTo, setAssignTo] = useState<Person | null>(null);
  const [invitation, setInvitation] = useState<{ token: string; expires_at: string; name: string } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const load = useCallback(async (mode: 'initial' | 'refresh') => {
    setStatus(mode === 'initial' ? 'loading' : 'refreshing');
    const result = await api.get<Person[]>('/v1/people');
    if (!result.ok) {
      setFailure(result.error);
      setStatus(mode === 'initial' ? 'error' : 'ready');
      return;
    }
    setRows(result.value);
    setFailure(null);
    setStatus('ready');
  }, [api]);

  useEffect(() => { void load('initial'); }, [load]);

  useEffect(() => {
    void api.get<Role[]>('/v1/roles').then((r) => { if (r.ok) setRoles(r.value); });
  }, [api]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName);
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '/') { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === 'i' && canManage) { e.preventDefault(); setInviteOpen(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canManage]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (typeFilter !== 'all' && r.person_type !== typeFilter) return false;
      if (!q) return true;
      return r.full_name.toLowerCase().includes(q) || (r.email ?? '').toLowerCase().includes(q);
    });
  }, [rows, query, typeFilter]);

  const counts = useMemo(() => ({
    all: rows.length,
    staff: rows.filter((r) => r.person_type === 'staff').length,
    student: rows.filter((r) => r.person_type === 'student').length,
  }), [rows]);

  return (
    <>
      {status === 'refreshing' ? <RefreshBar /> : <div style={{ height: 2 }} />}

      <div className="page__head">
        <div>
          <h1 className="page__title">People</h1>
          <p className="page__sub">{status === 'loading' ? 'Loading' : `${rows.length} total`}</p>
        </div>
        <div className="page__actions">
          <input
            ref={searchRef}
            className="search"
            type="search"
            placeholder="Search name or email   /"
            aria-label="Search people"
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
          />
          {canManage && (
            <Button variant="primary" onClick={() => setInviteOpen(true)}>Invite person</Button>
          )}
        </div>
      </div>

      {/* Counts live on the filters, where they are actionable, not in cards above. */}
      <div className="filters" role="group" aria-label="Filter by type">
        {(['all', 'staff', 'student'] as const).map((t) => (
          <button
            key={t}
            className={`filter${typeFilter === t ? ' filter--on' : ''}`}
            aria-pressed={typeFilter === t}
            onClick={() => setTypeFilter(t)}
          >
            {t === 'all' ? 'Everyone' : t === 'staff' ? 'Staff' : 'Students'}
            <span className="filter__count tabular">{counts[t]}</span>
          </button>
        ))}
      </div>

      {failure && status === 'ready' && (
        <div className="banner banner--error" role="alert" style={{ marginBottom: 'var(--space-base)' }}>
          <span style={{ flex: 1 }}>{failure.message}</span>
          <Button variant="text" onClick={() => void load('refresh')}>Retry</Button>
        </div>
      )}

      {status === 'error' ? (
        <ErrorState
          message={failure?.message ?? 'The list could not be loaded.'}
          onRetry={() => void load('initial')}
        />
      ) : status !== 'loading' && rows.length === 0 ? (
        <EmptyState
          title="No people yet"
          body="Invite your first member of staff. They choose their own password from the invitation, and you decide what they can see."
          action={canManage ? <Button variant="primary" onClick={() => setInviteOpen(true)}>Invite person</Button> : undefined}
        />
      ) : status !== 'loading' && filtered.length === 0 ? (
        <EmptyState
          title="Nobody matches those filters"
          body={query ? `Nothing matches "${query}".` : 'No one of that type yet.'}
          action={<Button variant="secondary" onClick={() => { setQuery(''); setTypeFilter('all'); }}>Clear filters</Button>}
        />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Access</th>
                <th scope="col">Account</th>
                <th scope="col">Last active</th>
                {canManage && <th scope="col"><span className="visually-hidden">Actions</span></th>}
              </tr>
            </thead>
            <tbody>
              {status === 'loading' ? (
                <SkeletonRows rows={6} widths={['45%', '30%', '64px', '72px']} />
              ) : (
                filtered.map((person) => (
                  <tr key={person.person_id}>
                    <td>
                      <div className="table__primary">{person.full_name}</div>
                      <div className="table__secondary">{person.email ?? '—'}</div>
                    </td>
                    <td>
                      {person.role_keys.length === 0 ? (
                        <span className="table__muted">No access yet</span>
                      ) : (
                        <span className="chips">
                          {person.role_keys.map((key) => (
                            <StatusChip key={key} tone="neutral">{roleName(roles, key)}</StatusChip>
                          ))}
                        </span>
                      )}
                    </td>
                    <td>
                      <StatusChip tone={ACCOUNT_TONE[person.account_status ?? ''] ?? 'neutral'}>
                        {person.account_status ?? 'no account'}
                      </StatusChip>
                    </td>
                    <td className="table__secondary tabular">
                      {person.last_login_at ? new Date(person.last_login_at).toLocaleDateString() : 'Never'}
                    </td>
                    {canManage && (
                      <td className="table__actions">
                        <Button variant="text" onClick={() => setAssignTo(person)}>Manage access</Button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <InvitePersonDrawer
        open={inviteOpen}
        api={api}
        roles={roles}
        onClose={() => setInviteOpen(false)}
        onInvited={(result) => {
          setInviteOpen(false);
          setInvitation({ token: result.token, expires_at: result.expires_at, name: result.name });
          toast(`${result.name} invited`);
          void load('refresh');
        }}
      />

      <AssignRoleDrawer
        person={assignTo}
        api={api}
        roles={roles}
        onClose={() => setAssignTo(null)}
        onChanged={(message) => { toast(message); void load('refresh'); }}
      />

      {invitation && (
        <InvitationDrawer
          result={{
            institution: { id: '', code: '', name: invitation.name, status: '', seat_limit: 0 },
            administrator: { person_id: '', account_id: '' },
            invitation: { token: invitation.token, expires_at: invitation.expires_at, delivery: 'pending' },
          }}
          onClose={() => setInvitation(null)}
        />
      )}
    </>
  );
}

const roleName = (roles: Role[], key: string) => roles.find((r) => r.key === key)?.name ?? key;
