import { useEffect, useState, type FormEvent } from 'react';
import { Banner, Button, Drawer, Field } from '../../components/index.tsx';
import type { ApiClient, ApiFailure } from '../../lib/api.ts';
import type { Department } from '../organisation/types.ts';

const slug = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);

export function ProgramDrawer({
  open, api, onClose, onCreated,
}: {
  open: boolean;
  api: ApiClient;
  onClose: () => void;
  onCreated: (name: string) => void;
}) {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentId, setDepartmentId] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [codeEdited, setCodeEdited] = useState(false);
  const [award, setAward] = useState('');
  const [years, setYears] = useState('4');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(''); setCode(''); setCodeEdited(false); setAward(''); setYears('4');
    setFailure(null); setDepartmentId('');
    void api.get<Department[]>('/v1/departments').then((r) => {
      if (r.ok) {
        const active = r.value.filter((d) => d.status === 'active');
        setDepartments(active);
        if (active.length === 1) setDepartmentId(active[0]!.id);
      }
    });
  }, [open, api]);

  if (!open) return null;

  const effectiveCode = codeEdited ? code : slug(name);
  const ready = departmentId !== '' && name.trim().length > 1 && effectiveCode.length > 0
    && Number(years) > 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFailure(null);
    const result = await api.post('/v1/programs', {
      department_id: departmentId,
      name: name.trim(),
      code: effectiveCode,
      duration_years: Number(years),
      term_type: 'semester',
      ...(award.trim() ? { award: award.trim() } : {}),
    });
    setBusy(false);
    if (!result.ok) { setFailure(result.error); return; }
    onCreated(name.trim());
  }

  return (
    <Drawer
      open
      title="Add a program"
      subtitle="The qualification your college awards."
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" form="program-form" type="submit" loading={busy} disabled={!ready}>
            Add program
          </Button>
        </>
      }
    >
      <form id="program-form" onSubmit={submit} noValidate style={{ display: 'contents' }}>
        {failure && <Banner tone="error">{failure.message}</Banner>}

        {departments.length === 0 ? (
          <Banner tone="warning">
            A program belongs to a department, and none exist yet. Create one under Organisation
            first.
          </Banner>
        ) : (
          <div className="field">
            <label className="field__label" htmlFor="program-department">Department</label>
            <select
              id="program-department" className="field__input" value={departmentId}
              onChange={(e) => setDepartmentId(e.currentTarget.value)}
            >
              <option value="">Choose a department</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name} · {d.campus_name}</option>
              ))}
            </select>
            {/* A program belongs to one department on one campus (AD-37). A
                campus running its own variant gets its own program. */}
            <span className="field__message">
              A campus running its own variant of this program needs its own program record.
            </span>
          </div>
        )}

        <Field
          label="Program name" value={name} required autoFocus
          placeholder="B.Tech Computer Science"
          onChange={(e) => setName(e.currentTarget.value)}
          error={failure?.fieldErrors?.name}
        />
        <Field
          label="Short code" value={effectiveCode} required
          hint="Appears in identifiers and reports."
          onChange={(e) => { setCodeEdited(true); setCode(e.currentTarget.value.toLowerCase()); }}
          error={failure?.fieldErrors?.code}
        />
        <Field
          label="Award, optional" value={award} placeholder="Bachelor of Technology"
          onChange={(e) => setAward(e.currentTarget.value)}
        />
        <Field
          label="Duration in years" type="number" value={years} min={1} max={10} step={0.5}
          onChange={(e) => setYears(e.currentTarget.value)}
          error={failure?.fieldErrors?.durationYears}
        />
      </form>
    </Drawer>
  );
}
