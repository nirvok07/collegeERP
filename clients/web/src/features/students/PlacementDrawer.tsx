import { useEffect, useState } from 'react';
import { Banner, Button, Drawer, Field } from '../../components/index.tsx';
import type { ApiClient, ApiFailure } from '../../lib/api.ts';
import type { Section } from '../teaching/types.ts';
import { placementBlockedReason, type Placement, type Student } from './types.ts';

/**
 * Putting a student in a cohort, which also enrols them in what that cohort is
 * taught.
 *
 * Stated plainly in the drawer, because it is the part an operator would
 * otherwise have to discover: placing somebody into term five is not eight
 * separate decisions about eight core courses, and an elective is dropped
 * afterwards from the course itself.
 */
export function PlacementDrawer({
  student, api, sections, onClose, onChanged,
}: {
  student: Student | null;
  api: ApiClient;
  sections: Section[];
  onClose: () => void;
  onChanged: (message: string) => void;
}) {
  const [sectionId, setSectionId] = useState('');
  const [from, setFrom] = useState('');
  const [reason, setReason] = useState('');
  const [history, setHistory] = useState<Placement[]>([]);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);

  const studentId = student?.id ?? null;

  useEffect(() => {
    if (!studentId) return;
    setSectionId(''); setReason(''); setFailure(null);
    setFrom(new Date().toISOString().slice(0, 10));
    void api.get<Placement[]>(`/v1/students/${studentId}/placements`).then((r) => {
      if (r.ok) setHistory(r.value);
    });
  }, [studentId, api]);

  if (!student) return null;

  const blocked = placementBlockedReason(student);
  const moving = student.section !== null;
  const eligible = sections.filter((s) => s.id !== student.section?.id);
  const ready = sectionId !== '' && from !== '' && (!moving || reason.trim().length > 0);

  async function place() {
    setBusy(true);
    setFailure(null);

    // A move is two facts, in this order: they left the old cohort on that date,
    // and joined the new one. Doing it the other way round would leave them in
    // two cohorts in the same term, which the database refuses anyway.
    if (moving && student!.section) {
      const ended = await api.post(
        `/v1/sections/${student!.section.id}/members/${student!.id}/end`,
        { on: from, reason: reason.trim() },
      );
      if (!ended.ok) { setBusy(false); setFailure(ended.error); return; }
    }

    const result = await api.post(`/v1/sections/${sectionId}/members`, {
      student_id: student!.id, from,
    });
    setBusy(false);
    if (!result.ok) { setFailure(result.error); return; }

    const target = sections.find((s) => s.id === sectionId);
    const courses = (result.value as { coursesEnrolled?: number } | null)?.coursesEnrolled ?? 0;
    onChanged(
      `${student!.full_name} placed in ${target?.label ?? 'the cohort'}`
      + (courses > 0 ? `, enrolled in ${courses} ${courses === 1 ? 'course' : 'courses'}` : ''),
    );
  }

  return (
    <Drawer
      open
      title={moving ? `Move ${student.full_name}` : `Place ${student.full_name}`}
      subtitle={`${student.enrolment_number} · ${student.program.name}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button
            variant="primary" loading={busy} disabled={!ready || blocked !== null}
            onClick={() => void place()}
          >
            {moving ? 'Move' : 'Place'}
          </Button>
        </>
      }
    >
      {failure && <Banner tone="error">{failure.message}</Banner>}
      {blocked && <Banner tone="warning">{blocked}</Banner>}

      {!blocked && (
        <>
          <p className="drawer__note">
            Placing a student in a cohort enrols them in every course it is taught. An elective
            they are not taking is dropped afterwards, from the course itself.
          </p>

          {eligible.length === 0 ? (
            <Banner tone="warning">
              No cohort can take a student right now. Add a section under Teaching first.
            </Banner>
          ) : (
            <div className="field">
              <label className="field__label" htmlFor="placement-section">Cohort</label>
              <select
                id="placement-section" className="field__input" value={sectionId}
                onChange={(e) => setSectionId(e.currentTarget.value)}
              >
                <option value="">Choose a cohort</option>
                {eligible.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.program.name} · term {s.term_number} · {s.label}
                  </option>
                ))}
              </select>
              <span className="field__message">
                A student sits in one cohort per term.
              </span>
            </div>
          )}

          <Field
            label="From" value={from} type="date" required
            hint="Registers before this date do not expect them, and registers after it do."
            onChange={(e) => setFrom(e.currentTarget.value)}
            error={failure?.fieldErrors?.from}
          />

          {moving && (
            <Field
              label="Why are they moving?" value={reason} required
              placeholder="Section balancing after the first week"
              onChange={(e) => setReason(e.currentTarget.value)}
              error={failure?.fieldErrors?.reason}
            />
          )}
        </>
      )}

      {history.length > 0 && (
        <>
          <h3 className="drawer__section">Cohorts they have been in</h3>
          <ul className="history">
            {history.map((p) => (
              <li key={p.id} className="history__row">
                <span className="assignee__name">
                  {p.is_current ? 'Now' : 'Until ' + p.valid_to}
                </span>
                <span className="assignee__since">from {p.valid_from}</span>
                {p.end_reason && <span className="history__reason">{p.end_reason}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </Drawer>
  );
}
