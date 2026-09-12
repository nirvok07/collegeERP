import { useEffect, useState, type FormEvent } from 'react';
import { Banner, Button, Drawer, Field } from '../../components/index.tsx';
import type { ApiClient, ApiFailure } from '../../lib/api.ts';
import type { Program } from './types.ts';

/** Starts a draft for a regulation year the program does not yet have. */
export function VersionDrawer({
  open, api, program, existingYears, onClose, onCreated,
}: {
  open: boolean;
  api: ApiClient;
  program: Program | null;
  existingYears: number[];
  onClose: () => void;
  onCreated: (id: string, year: number) => void;
}) {
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [terms, setTerms] = useState('8');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);

  useEffect(() => {
    if (!open || !program) return;
    setYear(String(new Date().getFullYear()));
    // Semesters run twice a year, so the usual term count follows the duration.
    setTerms(String(program.term_type === 'semester'
      ? Math.round(program.duration_years * 2)
      : Math.round(program.duration_years)));
    setFailure(null);
  }, [open, program]);

  if (!open || !program) return null;

  const taken = existingYears.includes(Number(year));
  const ready = Number(year) > 1900 && Number(terms) > 0 && !taken;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFailure(null);
    const result = await api.post<{ id: string }>('/v1/curriculum-versions', {
      program_id: program!.id,
      regulation_year: Number(year),
      total_terms: Number(terms),
    });
    setBusy(false);
    if (!result.ok) { setFailure(result.error); return; }
    onCreated(result.value.id, Number(year));
  }

  return (
    <Drawer
      open
      title="Start a curriculum draft"
      subtitle={program.name}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" form="version-form" type="submit" loading={busy} disabled={!ready}>
            Start draft
          </Button>
        </>
      }
    >
      <form id="version-form" onSubmit={submit} noValidate style={{ display: 'contents' }}>
        {failure && <Banner tone="error">{failure.message}</Banner>}

        <Field
          label="Regulation year" type="number" value={year} required autoFocus
          hint="The year whose rules this curriculum defines. Students follow the regulation they were admitted under."
          onChange={(e) => setYear(e.currentTarget.value)}
          error={taken ? 'This program already has a curriculum for that year' : failure?.fieldErrors?.regulationYear}
        />
        <Field
          label="Total terms" type="number" value={terms} min={1} max={20} required
          hint={`${program.duration_years} years, ${program.term_type === 'semester' ? 'two terms a year' : 'one term a year'}.`}
          onChange={(e) => setTerms(e.currentTarget.value)}
          error={failure?.fieldErrors?.totalTerms}
        />
        <Banner tone="info">
          A draft is private and freely editable. Publishing is permanent, because students are
          then admitted under it.
        </Banner>
      </form>
    </Drawer>
  );
}
