import { useEffect, useState } from 'react';
import { Banner, Button, Drawer, Field, StatusChip } from '../../components/index.tsx';
import type { ApiClient, ApiFailure } from '../../lib/api.ts';
import type { Assignment, Person, Role } from './types.ts';

/**
 * Manage one person's authority: what they hold, grant more, remove some.
 *
 * Revocation asks for a reason because the server requires one, which keeps the
 * audit trail from ever reading "someone removed this".
 */
export function AssignRoleDrawer({
  person, api, roles, onClose, onChanged,
}: {
  person: Person | null;
  api: ApiClient;
  roles: Role[];
  onClose: () => void;
  onChanged: (message: string) => void;
}) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [roleKey, setRoleKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [revoking, setRevoking] = useState<Assignment | null>(null);
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!person) return;
    setLoading(true);
    setFailure(null);
    setRoleKey('');
    void api.get<Assignment[]>('/v1/assignments').then((r) => {
      setLoading(false);
      if (r.ok) setAssignments(r.value.filter((a) => a.person_id === person.person_id));
      else setFailure(r.error);
    });
  }, [person, api]);

  if (!person) return null;

  const role = roles.find((r) => r.key === roleKey);
  const held = new Set(assignments.map((a) => a.role_key));
  const grantable = roles.filter(
    (r) => r.allowed_scope_types.includes('institution') && !held.has(r.key),
  );

  async function grant() {
    if (!role || !person) return;
    setBusy(true);
    setFailure(null);
    const result = await api.post('/v1/assignments', {
      person_id: person.person_id,
      role_key: role.key,
      scope_type: 'institution',
    });
    setBusy(false);
    if (!result.ok) { setFailure(result.error); return; }
    onChanged(`${person.full_name} can now ${role.summary.replace(/^Can /, '')}`);
    onClose();
  }

  async function revoke() {
    if (!revoking || !person) return;
    setBusy(true);
    setFailure(null);
    const result = await api.post(`/v1/assignments/${revoking.id}/revoke`, { reason: reason.trim() });
    setBusy(false);
    if (!result.ok) { setFailure(result.error); return; }
    onChanged(`${revoking.role_name} removed from ${person.full_name}`);
    setRevoking(null);
    setReason('');
    onClose();
  }

  return (
    <Drawer
      open
      title={person.full_name}
      subtitle={person.email ?? undefined}
      onClose={onClose}
      footer={
        revoking ? (
          <>
            <Button variant="secondary" onClick={() => { setRevoking(null); setReason(''); }} disabled={busy}>
              Keep access
            </Button>
            <Button variant="danger" onClick={() => void revoke()} loading={busy} disabled={!reason.trim()}>
              Remove access
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>Close</Button>
            <Button variant="primary" onClick={() => void grant()} loading={busy} disabled={!role}>
              Grant access
            </Button>
          </>
        )
      }
    >
      {failure && <Banner tone="error">{failure.message}</Banner>}

      {revoking ? (
        <>
          <Banner tone="warning">
            {person.full_name} will immediately lose {revoking.role_name}. They stay signed in, but
            the access disappears on their next action.
          </Banner>
          <Field
            label="Reason" value={reason} required autoFocus
            placeholder="Moved to another department"
            hint="Recorded in the audit trail against your name."
            onChange={(e) => setReason(e.currentTarget.value)}
          />
        </>
      ) : (
        <>
          <section>
            <h3 className="section__title">Current access</h3>
            {loading ? (
              <div className="skeleton" style={{ height: 44 }} />
            ) : assignments.length === 0 ? (
              <p className="table__muted">No access yet. This person can sign in but sees nothing.</p>
            ) : (
              <ul className="access-list">
                {assignments.map((a) => (
                  <li key={a.id} className="access-row">
                    <div>
                      <div className="table__primary">{a.role_name}</div>
                      <div className="table__secondary">
                        Whole college
                        {a.valid_to ? ` · until ${new Date(a.valid_to).toLocaleDateString()}` : ''}
                        {a.source === 'bootstrap' ? ' · created with the college' : ''}
                      </div>
                    </div>
                    <Button variant="text" onClick={() => setRevoking(a)}>Remove</Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="section__title">Grant more</h3>
            {grantable.length === 0 ? (
              <p className="table__muted">They already hold every role available at college level.</p>
            ) : (
              <div className="field">
                <label className="field__label" htmlFor="grant-role">Role</label>
                <select
                  id="grant-role" className="field__input" value={roleKey}
                  onChange={(e) => setRoleKey(e.currentTarget.value)}
                >
                  <option value="">Choose a role</option>
                  {grantable.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
                </select>
                <span className="field__message">{role ? role.summary : ' '}</span>
              </div>
            )}
            {role && (
              <Banner tone="info">
                {person.full_name} will be able to {role.summary.replace(/^Can /, '')} across the
                whole college, effective immediately.
              </Banner>
            )}
            <p className="table__muted" style={{ marginTop: 'var(--space-sm)' }}>
              <StatusChip tone="neutral">Note</StatusChip>{' '}
              You cannot change your own access. Ask another administrator.
            </p>
          </section>
        </>
      )}
    </Drawer>
  );
}
