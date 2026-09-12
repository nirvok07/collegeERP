import { useEffect, useState, type FormEvent } from 'react';
import { Banner, Button, Drawer, Field } from '../../components/index.tsx';
import type { ApiClient, ApiFailure } from '../../lib/api.ts';
import type { Program } from '../curriculum/types.ts';

/**
 * Admitting a student: one person and one student record, in one step.
 *
 * No password and no invitation. A student record does not need a login on the
 * day it is created, and a registrar admitting four hundred students should not
 * be minting four hundred credentials to do it. An account is issued later,
 * through People, when the student actually needs to sign in.
 */
export function AdmitDrawer({
  open, api, programs, onClose, onAdmitted,
}: {
  open: boolean;
  api: ApiClient;
  programs: Program[];
  onClose: () => void;
  onAdmitted: (name: string) => void;
}) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [number, setNumber] = useState('');
  const [programId, setProgramId] = useState('');
  const [admittedOn, setAdmittedOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);

  useEffect(() => {
    if (!open) return;
    setFullName(''); setEmail(''); setNumber(''); setFailure(null);
    setProgramId(programs.length === 1 ? programs[0]!.id : '');
    setAdmittedOn(new Date().toISOString().slice(0, 10));
  }, [open, programs]);

  if (!open) return null;

  const ready = fullName.trim().length > 1 && number.trim().length > 0
    && programId !== '' && admittedOn !== '';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFailure(null);
    const result = await api.post('/v1/students', {
      full_name: fullName.trim(),
      ...(email.trim() ? { email: email.trim() } : {}),
      enrolment_number: number.trim(),
      program_id: programId,
      admitted_on: admittedOn,
    });
    setBusy(false);
    if (!result.ok) { setFailure(result.error); return; }
    onAdmitted(fullName.trim());
  }

  return (
    <Drawer
      open
      title="Admit a student"
      subtitle="The record every register, mark sheet and transcript will key against."
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" form="admit-form" type="submit" loading={busy} disabled={!ready}>
            Admit
          </Button>
        </>
      }
    >
      <form id="admit-form" onSubmit={submit} noValidate style={{ display: 'contents' }}>
        {failure && <Banner tone="error">{failure.message}</Banner>}

        {programs.length === 0 ? (
          <Banner tone="warning">
            A student is admitted to a program, and none exist yet. Add one under Curriculum first.
          </Banner>
        ) : (
          <div className="field">
            <label className="field__label" htmlFor="admit-program">Program</label>
            <select
              id="admit-program" className="field__input" value={programId}
              onChange={(e) => setProgramId(e.currentTarget.value)}
            >
              <option value="">Choose a program</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>{p.name} · {p.department_name}</option>
              ))}
            </select>
            <span className="field__message">
              {failure?.fieldErrors?.programId ?? ' '}
            </span>
          </div>
        )}

        <Field
          label="Full name" value={fullName} required autoFocus={programs.length === 1}
          placeholder="Nisha Kumar"
          onChange={(e) => setFullName(e.currentTarget.value)}
          error={failure?.fieldErrors?.full_name}
        />
        <Field
          label="Enrolment number" value={number} required placeholder="CSE2026-001"
          hint="What the college calls them on every document it issues. Unique, and permanent."
          onChange={(e) => setNumber(e.currentTarget.value.toUpperCase())}
          error={failure?.fieldErrors?.enrolmentNumber ?? failure?.fieldErrors?.enrolment_number}
        />
        <Field
          label="Email, optional" value={email} type="email" placeholder="nisha@college.edu"
          hint="Needed only when they are given an account to sign in with."
          onChange={(e) => setEmail(e.currentTarget.value)}
          error={failure?.fieldErrors?.email}
        />
        <Field
          label="Admitted on" value={admittedOn} type="date" required
          onChange={(e) => setAdmittedOn(e.currentTarget.value)}
          error={failure?.fieldErrors?.admitted_on}
        />
      </form>
    </Drawer>
  );
}
