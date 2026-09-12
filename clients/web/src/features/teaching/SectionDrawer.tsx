import { useEffect, useState, type FormEvent } from 'react';
import { Banner, Button, Drawer, Field } from '../../components/index.tsx';
import type { ApiClient, ApiFailure } from '../../lib/api.ts';
import type { Program } from '../curriculum/types.ts';
import type { Term } from './types.ts';

/** How many terms a program runs, which bounds where a cohort can sit. */
const termsIn = (program: Program): number =>
  program.duration_years * (program.term_type === 'semester' ? 2 : 1);

/**
 * Adding a cohort.
 *
 * Four answers: which program, how far through it, what the group is called and
 * how many seats it holds. The academic term is not asked, because the workspace
 * is already showing one and asking again invites a mismatch.
 */
export function SectionDrawer({
  open, api, term, programs, onClose, onCreated,
}: {
  open: boolean;
  api: ApiClient;
  term: Term | null;
  programs: Program[];
  onClose: () => void;
  onCreated: (label: string) => void;
}) {
  const [programId, setProgramId] = useState('');
  const [termNumber, setTermNumber] = useState('1');
  const [label, setLabel] = useState('');
  const [capacity, setCapacity] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);

  useEffect(() => {
    if (!open) return;
    setProgramId(programs.length === 1 ? programs[0]!.id : '');
    setTermNumber('1'); setLabel(''); setCapacity(''); setFailure(null);
  }, [open, programs]);

  if (!open || !term) return null;

  const program = programs.find((p) => p.id === programId) ?? null;
  const ready = programId !== '' && label.trim().length > 0
    && (capacity === '' || Number(capacity) > 0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFailure(null);
    const result = await api.post('/v1/sections', {
      program_id: programId,
      term_id: term!.id,
      term_number: Number(termNumber),
      label: label.trim().toUpperCase(),
      ...(capacity === '' ? {} : { capacity: Number(capacity) }),
    });
    setBusy(false);
    if (!result.ok) { setFailure(result.error); return; }
    onCreated(label.trim().toUpperCase());
  }

  return (
    <Drawer
      open
      title="Add a section"
      subtitle={`A cohort taught together in ${term.academic_year_name} · ${term.name}.`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" form="section-form" type="submit" loading={busy} disabled={!ready}>
            Add section
          </Button>
        </>
      }
    >
      <form id="section-form" onSubmit={submit} noValidate style={{ display: 'contents' }}>
        {failure && <Banner tone="error">{failure.message}</Banner>}

        {programs.length === 0 ? (
          <Banner tone="warning">
            A section belongs to a program, and none exist yet. Add one under Curriculum first.
          </Banner>
        ) : (
          <div className="field">
            <label className="field__label" htmlFor="section-program">Program</label>
            <select
              id="section-program" className="field__input" value={programId}
              onChange={(e) => { setProgramId(e.currentTarget.value); setTermNumber('1'); }}
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

        {program && (
          <div className="field">
            <label className="field__label" htmlFor="section-term-number">
              How far through the program
            </label>
            <select
              id="section-term-number" className="field__input" value={termNumber}
              onChange={(e) => setTermNumber(e.currentTarget.value)}
            >
              {Array.from({ length: termsIn(program) }, (_, i) => i + 1).map((n) => (
                <option key={n} value={String(n)}>
                  {program.term_type === 'semester' ? `Semester ${n}` : `Year ${n}`}
                </option>
              ))}
            </select>
            {/* The program's own length bounds this, so the database never has
                to refuse a term the program does not have. */}
            <span className="field__message">
              {program.name} runs {termsIn(program)}{' '}
              {program.term_type === 'semester' ? 'semesters' : 'years'}.
            </span>
          </div>
        )}

        <Field
          label="Section label" value={label} required autoFocus={programs.length === 1}
          placeholder="A"
          hint="Short, and unique within this program and term. Usually A, B, C."
          onChange={(e) => setLabel(e.currentTarget.value.toUpperCase().slice(0, 12))}
          error={failure?.fieldErrors?.label}
        />
        <Field
          label="Seats, optional" value={capacity} type="number" min={1} max={1000}
          placeholder="60"
          hint="Leave empty if the cohort has no fixed size."
          onChange={(e) => setCapacity(e.currentTarget.value)}
          error={failure?.fieldErrors?.capacity}
        />
      </form>
    </Drawer>
  );
}
