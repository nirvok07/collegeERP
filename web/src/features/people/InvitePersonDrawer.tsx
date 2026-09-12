import { useState, type FormEvent } from 'react';
import { Banner, Button, Drawer, Field } from '../../components/index.tsx';
import type { ApiClient, ApiFailure } from '../../lib/api.ts';
import type { Role } from './types.ts';

interface InviteResponse {
  person_id: string;
  account_id: string;
  invitation: { token: string; expires_at: string; delivery: string };
}

/**
 * Invite, optionally with initial authority. The backend creates the person,
 * the account and the assignment in one transaction, so a half-invited person
 * with no access cannot exist.
 */
export function InvitePersonDrawer({
  open, api, roles, onClose, onInvited,
}: {
  open: boolean;
  api: ApiClient;
  roles: Role[];
  onClose: () => void;
  onInvited: (r: { token: string; expires_at: string; name: string }) => void;
}) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [personType, setPersonType] = useState<'staff' | 'student'>('staff');
  const [roleKey, setRoleKey] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);

  const role = roles.find((r) => r.key === roleKey);
  // Institution scope needs no reference; anything narrower would need a picker,
  // which arrives with the academic structure module that owns those scopes.
  const scopeType = role?.allowed_scope_types.includes('institution') ? 'institution' : null;

  function reset() {
    setFullName(''); setEmail(''); setPersonType('staff'); setRoleKey(''); setFailure(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFailure(null);

    const result = await api.post<InviteResponse>('/v1/people', {
      full_name: fullName.trim(),
      email: email.trim().toLowerCase(),
      person_type: personType,
      ...(role && scopeType ? { role: { role_key: role.key, scope_type: scopeType } } : {}),
    });
    setSubmitting(false);

    if (!result.ok) { setFailure(result.error); return; }
    onInvited({
      token: result.value.invitation.token,
      expires_at: result.value.invitation.expires_at,
      name: fullName.trim(),
    });
    reset();
  }

  const ready = fullName.trim().length > 1 && email.includes('@');

  return (
    <Drawer
      open={open}
      title="Invite a person"
      subtitle="They receive an invitation and choose their own password."
      onClose={() => { reset(); onClose(); }}
      footer={
        <>
          <Button variant="secondary" onClick={() => { reset(); onClose(); }} disabled={submitting}>Cancel</Button>
          <Button variant="primary" form="invite-form" type="submit" loading={submitting} disabled={!ready}>
            {submitting ? 'Inviting' : 'Send invitation'}
          </Button>
        </>
      }
    >
      <form id="invite-form" onSubmit={submit} noValidate style={{ display: 'contents' }}>
        {failure && <Banner tone="error">{failure.message}</Banner>}

        <Field
          label="Full name" value={fullName} required autoFocus placeholder="Ravi Kumar"
          onChange={(e) => setFullName(e.currentTarget.value)}
          error={failure?.fieldErrors?.fullName ?? failure?.fieldErrors?.full_name}
        />
        <Field
          label="Email" type="email" value={email} required placeholder="ravi@college.edu"
          onChange={(e) => setEmail(e.currentTarget.value)}
          error={failure?.fieldErrors?.email}
        />

        <div className="field">
          <span className="field__label" id="type-label">Type</span>
          <div className="segmented" role="radiogroup" aria-labelledby="type-label">
            {(['staff', 'student'] as const).map((t) => (
              <button
                key={t} type="button" role="radio" aria-checked={personType === t}
                className={`segmented__option${personType === t ? ' segmented__option--on' : ''}`}
                onClick={() => setPersonType(t)}
              >
                {t === 'staff' ? 'Staff' : 'Student'}
              </button>
            ))}
          </div>
          <span className="field__message"> </span>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="invite-role">Access, optional</label>
          <select
            id="invite-role" className="field__input" value={roleKey}
            onChange={(e) => setRoleKey(e.currentTarget.value)}
          >
            <option value="">No access yet</option>
            {roles
              .filter((r) => r.allowed_scope_types.includes('institution'))
              .map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
          </select>
          <span className="field__message">
            {role ? role.summary : 'You can grant access later from the people list.'}
          </span>
        </div>

        {/* A sentence, not a permission list: this is what an operator can check. */}
        {ready && (
          <Banner tone="info">
            {fullName.trim()} will be invited as {personType}.{' '}
            {role ? `On accepting, they can ${role.summary.replace(/^Can /, '')} across the whole college.` : 'They will have no access until you grant some.'}
          </Banner>
        )}
      </form>
    </Drawer>
  );
}
