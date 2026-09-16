import { useCallback, useEffect, useState } from 'react';
import {
  Button, EmptyState, ErrorState, RefreshBar, SkeletonRows, StatusChip, useToast,
} from '../../components/index.tsx';
import type { ApiClient, ApiFailure } from '../../lib/api.ts';
import {
  MFA_LABEL, ROLE_LABEL, STATUS_LABEL, STATUS_TONE, formatWhen, type IssuedInvitation, type PlatformAccount,
} from './accounts.ts';
import { InviteLinkDrawer } from './InviteLinkDrawer.tsx';
import { AccountDrawer } from './AccountDrawer.tsx';
import { CreateAccountDrawer } from './CreateAccountDrawer.tsx';

type Status = 'loading' | 'refreshing' | 'ready' | 'error';

/**
 * Who can act on the platform, and with which role (SA-3a). The actions an
 * account offers come from the server; these props only hide what the
 * viewer's role could never do.
 */
export function AccountsPage({
  api, canManage, canAssignRoles,
}: { api: ApiClient; canManage: boolean; canAssignRoles: boolean }) {
  const [rows, setRows] = useState<PlatformAccount[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ name: string; invitation: IssuedInvitation } | null>(null);
  const toast = useToast();

  const load = useCallback(async (mode: 'initial' | 'refresh') => {
    setStatus(mode === 'initial' ? 'loading' : 'refreshing');
    const result = await api.get<PlatformAccount[]>('/v1/platform/accounts');
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

  return (
    <>
      {status === 'refreshing' ? <RefreshBar /> : <div style={{ height: 2 }} />}
      <div className="page__head">
        <div>
          <p className="page__eyebrow">Platform</p>
          <h1 className="page__title">Platform accounts</h1>
          <p className="page__sub">{status === 'loading' ? 'Loading' : `${rows.length} accounts`}</p>
        </div>
        <div className="page__actions">
          {canManage && <Button variant="primary" onClick={() => setCreating(true)}>Add account</Button>}
        </div>
      </div>

      {failure && status === 'ready' && (
        <div className="banner banner--error" role="alert">
          <span style={{ flex: 1 }}>{failure.message}</span>
          <Button variant="text" onClick={() => void load('refresh')}>Retry</Button>
        </div>
      )}

      {status === 'error' ? (
        <ErrorState message={failure?.message ?? 'Accounts could not be loaded.'} onRetry={() => void load('initial')} />
      ) : status !== 'loading' && rows.length === 0 ? (
        <EmptyState title="No platform accounts" body="Platform accounts appear here once they exist." />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Email</th>
                <th scope="col">Role</th>
                <th scope="col">Status</th>
                <th scope="col">Authenticator</th>
                <th scope="col">Last sign-in</th>
              </tr>
            </thead>
            <tbody>
              {status === 'loading'
                ? <SkeletonRows rows={4} widths={['36%', '36%', '64px', '96px', '80px', '120px']} />
                : rows.map((row) => (
                    <tr key={row.id}>
                      <td className="table__primary">
                        <button type="button" className="row-link" onClick={() => setSelected(row.id)}>
                          {row.full_name}
                        </button>
                        {row.is_you && <span className="table__secondary"> (you)</span>}
                      </td>
                      <td className="table__secondary">{row.email}</td>
                      <td className="table__secondary">{row.role ? ROLE_LABEL[row.role] : 'No role'}</td>
                      <td><StatusChip tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</StatusChip></td>
                      <td className="table__secondary">{MFA_LABEL[row.mfa]}</td>
                      <td className="table__secondary tabular">{formatWhen(row.last_login_at)}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateAccountDrawer
        open={creating}
        api={api}
        onClose={() => setCreating(false)}
        onCreated={(name, invitation) => {
          setCreating(false);
          setIssued({ name, invitation });
          toast(`${name} added. Send them the invitation link.`);
          void load('refresh');
        }}
      />
      <AccountDrawer
        api={api}
        id={selected}
        canManage={canManage}
        canAssignRoles={canAssignRoles}
        onClose={() => setSelected(null)}
        onChanged={() => void load('refresh')}
        onInvitation={(name, invitation) => setIssued({ name, invitation })}
      />
      <InviteLinkDrawer name={issued?.name ?? ''} invitation={issued?.invitation ?? null} onClose={() => setIssued(null)} />
    </>
  );
}
