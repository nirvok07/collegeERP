import { useEffect, useState } from 'react';
import { Banner, Button, Drawer, Field } from '../../components/index.tsx';
import type { ApiClient, ApiFailure } from '../../lib/api.ts';
import type { CurriculumVersion } from './types.ts';

type Kind = 'revision' | 'amendment';

/**
 * Two distinct actions, never one generic "edit".
 *
 * A revision corrects what was always intended and moves affected students to
 * the corrected version. An amendment changes requirements and leaves existing
 * cohorts where they are. They look similar and behave oppositely, so the
 * choice is put to the person making it rather than guessed.
 */
export function SuccessorDrawer({
  open, api, version, onClose, onCreated,
}: {
  open: boolean;
  api: ApiClient;
  version: CurriculumVersion;
  onClose: () => void;
  onCreated: (id: string, message: string) => void;
}) {
  const [kind, setKind] = useState<Kind | null>(null);
  const [year, setYear] = useState(String(version.regulation_year + 1));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);

  useEffect(() => {
    if (!open) return;
    setKind(null);
    setYear(String(version.regulation_year + 1));
    setReason('');
    setFailure(null);
  }, [open, version.regulation_year]);

  if (!open) return null;

  async function submit() {
    if (!kind) return;
    setBusy(true);
    setFailure(null);
    const result = await api.post<{ id: string }>(
      `/v1/curriculum-versions/${version.id}/successor`,
      {
        kind,
        reason: reason.trim(),
        ...(kind === 'amendment' ? { regulation_year: Number(year) } : {}),
      },
    );
    setBusy(false);
    if (!result.ok) { setFailure(result.error); return; }
    onCreated(
      result.value.id,
      kind === 'revision'
        ? `Revision ${version.revision + 1} of ${version.regulation_year} started`
        : `Draft started for regulation ${year}`,
    );
  }

  const ready = kind !== null
    && reason.trim().length > 0
    && (kind === 'revision' || Number(year) > version.regulation_year);

  return (
    <Drawer
      open
      title="New version"
      subtitle={`From regulation ${version.regulation_year}${version.revision > 1 ? ` revision ${version.revision}` : ''}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" loading={busy} disabled={!ready} onClick={() => void submit()}>
            {kind === 'revision' ? 'Start revision' : kind === 'amendment' ? 'Start new regulation' : 'Choose one'}
          </Button>
        </>
      }
    >
      {failure && <Banner tone="error">{failure.message}</Banner>}

      <p className="choice__lead">
        The published regulation stays exactly as it is either way. What differs is who ends up
        following the new one.
      </p>

      <div className="choices" role="radiogroup" aria-label="Kind of new version">
        <button
          type="button" role="radio" aria-checked={kind === 'revision'}
          className={`choice${kind === 'revision' ? ' choice--on' : ''}`}
          onClick={() => setKind('revision')}
        >
          <span className="choice__title">Correct an error</span>
          <span className="choice__body">
            Something was recorded wrongly and the requirements were always meant to be different.
            Stays in regulation <span className="tabular">{version.regulation_year}</span> as
            revision <span className="tabular">{version.revision + 1}</span>, and students on this
            regulation move to the corrected version.
          </span>
        </button>

        <button
          type="button" role="radio" aria-checked={kind === 'amendment'}
          className={`choice${kind === 'amendment' ? ' choice--on' : ''}`}
          onClick={() => setKind('amendment')}
        >
          <span className="choice__title">Change the requirements</span>
          <span className="choice__body">
            The syllabus is genuinely changing for future intakes. Starts a new regulation year.
            Students already admitted keep following{' '}
            <span className="tabular">{version.regulation_year}</span>.
          </span>
        </button>
      </div>

      {kind === 'amendment' && (
        <Field
          label="New regulation year" type="number" value={year}
          min={version.regulation_year + 1}
          onChange={(e) => setYear(e.currentTarget.value)}
          error={failure?.fieldErrors?.regulationYear}
          hint={`Must be later than ${version.regulation_year}.`}
        />
      )}

      {kind && (
        <>
          <Field
            label="Reason" value={reason} required
            placeholder={kind === 'revision' ? 'Credits transcribed incorrectly' : 'Syllabus revised by the academic council'}
            hint="Recorded in the audit trail, and read years later by whoever asks why this changed."
            onChange={(e) => setReason(e.currentTarget.value)}
            error={failure?.fieldErrors?.reason}
          />
          <Banner tone="info">
            Every course from regulation{' '}
            <span className="tabular">{version.regulation_year}</span> is copied into the new
            draft, so you start from what exists rather than retyping it.
            {kind === 'revision' && ' Moving students onto the corrected version is handled separately, with student records.'}
          </Banner>
        </>
      )}
    </Drawer>
  );
}
