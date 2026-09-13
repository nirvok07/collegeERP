import { useCallback, useEffect, useState } from 'react';
import { Banner, Button, Drawer, ReasonDrawer, StatusChip } from '../../components/index.tsx';
import type { ApiClient, ApiFailure } from '../../lib/api.ts';
import {
  ROLES, ROLE_LABEL, ROLE_SUMMARY, STATUS_COPY, STATUS_LABEL, STATUS_TONE, formatWhen,
  type PlatformAccountDetail, type PlatformRole,
} from './accounts.ts';
import './accounts.css';

type Pending = 'disable' | 'enable' | 'change_role' | null;

/**
 * One platform account: its status, role and role history, and the changes
 * the server says this viewer may make. Nobody may change their own account.
 */
export function AccountDrawer({
  api, id, canManage, canAssignRoles, onClose, onChanged,
}: {
  api: ApiClient; id: string | null; canManage: boolean; canAssignRoles: boolean;
  onClose: () => void; onChanged: () => void;
}) {
  const [detail, setDetail] = useState<PlatformAccountDetail | null>(null);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [nextRole, setNextRole] = useState<PlatformRole | ''>('');

  const load = useCallback(async (target: string) => {
    setFailure(null);
    const result = await api.get<PlatformAccountDetail>(`/v1/platform/accounts/${target}`);
    if (result.ok) setDetail(result.value);
    else setFailure(result.error);
  }, [api]);

  useEffect(() => {
    setDetail(null);
    if (id) void load(id);
  }, [id, load]);

  if (!id) return null;

  const allowed = (a: 'disable' | 'enable' | 'change_role') =>
    Boolean(detail?.actions.includes(a)) && (a === 'change_role' ? canAssignRoles : canManage);

  async function confirm(reason: string): Promise<string | null> {
    if (!detail || !pending) return 'Still loading.';
    const result = pending === 'change_role'
      ? await api.post<PlatformAccountDetail>(`/v1/platform/accounts/${detail.id}/role`, {
          role: nextRole, expected_role: detail.role, reason,
        })
      : await api.post<PlatformAccountDetail>(`/v1/platform/accounts/${detail.id}/${pending}`, { reason });
    if (!result.ok) return result.error.message;
    setDetail(result.value);
    onChanged();
    return null;
  }

  const copy = pending === 'disable' || pending === 'enable' ? STATUS_COPY[pending] : null;

  return (
    <>
      <Drawer
        open
        title={detail?.full_name ?? 'Platform account'}
        subtitle={detail?.email ?? 'Loading'}
        onClose={onClose}
        footer={detail && (allowed('disable') || allowed('enable') || allowed('change_role')) ? (
          <div className="drawer-actions">
            {allowed('change_role') && (
              <Button variant="secondary" onClick={() => { setNextRole(''); setPending('change_role'); }}>
                Change role
              </Button>
            )}
            {allowed('enable') && <Button variant="primary" onClick={() => setPending('enable')}>Enable</Button>}
            {allowed('disable') && <Button variant="danger" onClick={() => setPending('disable')}>Disable</Button>}
          </div>
        ) : undefined}
      >
        {failure && (
          <Banner tone="error">
            {failure.message}{' '}
            {!detail && <Button variant="text" onClick={() => void load(id)}>Try again</Button>}
          </Banner>
        )}
        {!detail && !failure && <p className="page__sub">Loading</p>}
        {detail && (
          <>
            {detail.is_you && <Banner tone="info">This is your account. Another Owner must change it.</Banner>}
            <dl className="detail">
              <div><dt>Status</dt><dd><StatusChip tone={STATUS_TONE[detail.status]}>{STATUS_LABEL[detail.status]}</StatusChip></dd></div>
              <div><dt>Role</dt><dd>{detail.role ? ROLE_LABEL[detail.role] : 'No role'}</dd></div>
              <div><dt>Last sign-in</dt><dd>{formatWhen(detail.last_login_at)}</dd></div>
              <div><dt>Created</dt><dd>{formatWhen(detail.created_at)}</dd></div>
            </dl>
            {detail.role && <p className="table__secondary">{ROLE_SUMMARY[detail.role]}</p>}

            <h3 className="drawer-section">Role history</h3>
            <ul className="role-history">
              {detail.role_history.map((h, i) => (
                <li key={i}>
                  <strong>{ROLE_LABEL[h.role]}</strong>{' '}
                  <span className="table__secondary">
                    from {formatWhen(h.granted_at)}{h.ended_at ? ` to ${formatWhen(h.ended_at)}` : ', current'}
                    {h.reason ? `. ${h.reason}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Drawer>

      <ReasonDrawer
        open={pending !== null}
        title={pending === 'change_role' ? 'Change platform role' : copy?.title ?? ''}
        subtitle={detail?.full_name}
        label="Reason"
        placeholder="Why this change is needed"
        confirmLabel={pending === 'change_role' ? 'Change role' : copy?.confirmLabel ?? 'Confirm'}
        body={
          pending === 'change_role' && detail ? (
            <fieldset className="role-choice">
              <legend className="field__label">New role</legend>
              {ROLES.filter((r) => r !== detail.role).map((role) => (
                <label key={role} className="role-choice__option">
                  <input type="radio" name="next-role" checked={nextRole === role} onChange={() => setNextRole(role)} />
                  <span><strong>{ROLE_LABEL[role]}</strong><span className="table__secondary"> {ROLE_SUMMARY[role]}</span></span>
                </label>
              ))}
              {detail.role === 'owner' && (
                <Banner tone="warning">They lose Owner authority at once, including account management.</Banner>
              )}
            </fieldset>
          ) : copy ? <Banner tone={copy.danger ? 'warning' : 'info'}>{copy.body}</Banner> : undefined
        }
        onClose={() => setPending(null)}
        onConfirm={(reason) => (pending === 'change_role' && !nextRole ? Promise.resolve('Choose the new role.') : confirm(reason))}
      />
    </>
  );
}
