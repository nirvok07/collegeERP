import { useEffect, useState } from 'react';
import { Banner, Button, Drawer, Field } from '../../components/index.tsx';
import type { ApiClient } from '../../lib/api.ts';
import { ROLES, ROLE_LABEL, ROLE_SUMMARY, validateNewAccount, type IssuedInvitation, type NewAccountForm } from './accounts.ts';

const EMPTY: NewAccountForm = { full_name: '', email: '', role: '' };

/** Creates the account and its role; it cannot sign in until authenticator enrolment exists. */
export function CreateAccountDrawer({
  open, api, onClose, onCreated,
}: { open: boolean; api: ApiClient; onClose: () => void; onCreated: (name: string, invitation: IssuedInvitation) => void }) {
  const [form, setForm] = useState<NewAccountForm>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) { setForm(EMPTY); setErrors({}); setFailure(null); setBusy(false); }
  }, [open]);

  async function submit() {
    const found = validateNewAccount(form);
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    const result = await api.post<{ invitation: IssuedInvitation }>('/v1/platform/accounts', {
      full_name: form.full_name.trim(), email: form.email.trim(), role: form.role,
    });
    setBusy(false);
    if (!result.ok) {
      setFailure(result.error.message);
      setErrors(result.error.fieldErrors ?? {});
      return;
    }
    onCreated(form.full_name.trim(), result.value.invitation);
  }

  return (
    <Drawer
      open={open}
      title="Add a platform account"
      onClose={onClose}
      footer={
        <>
          <Button variant="text" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={() => void submit()}>Add account</Button>
        </>
      }
    >
      <Banner tone="info">
        You receive an invitation link to send them. With it they set a password and an
        authenticator app; the account cannot sign in until both are done.
      </Banner>
      {failure && <Banner tone="error">{failure}</Banner>}
      <Field
        label="Full name"
        value={form.full_name}
        error={errors.full_name}
        onChange={(e) => setForm({ ...form, full_name: e.currentTarget.value })}
      />
      <Field
        label="Email"
        type="email"
        value={form.email}
        error={errors.email}
        autoComplete="off"
        onChange={(e) => setForm({ ...form, email: e.currentTarget.value })}
      />
      <fieldset className="role-choice">
        <legend className="field__label">Role</legend>
        {ROLES.map((role) => (
          <label key={role} className="role-choice__option">
            <input
              type="radio"
              name="role"
              value={role}
              checked={form.role === role}
              onChange={() => setForm({ ...form, role })}
            />
            <span>
              <strong>{ROLE_LABEL[role]}</strong>
              <span className="table__secondary"> {ROLE_SUMMARY[role]}</span>
            </span>
          </label>
        ))}
        {errors.role && <span className="field__message" role="alert">{errors.role}</span>}
      </fieldset>
    </Drawer>
  );
}
