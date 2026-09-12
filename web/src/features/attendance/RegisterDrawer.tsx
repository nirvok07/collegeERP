import { useCallback, useEffect, useState } from 'react';
import { Banner, Button, Drawer, Field, StatusChip } from '../../components/index.tsx';
import type { ApiClient, ApiFailure } from '../../lib/api.ts';
import {
  STATES, STATE_LABEL, STATE_LETTER, correctionsFor, submitBlockedReason,
  type AttendanceState, type Register, type RegisterStudent,
} from './types.ts';

/**
 * One class's register: who was there, who recorded it, and every correction
 * since.
 *
 * The administrative and corrective surface. Marking here exists for the real
 * case of a paper register being entered by the office, but the register is
 * taken on a phone by the person teaching it, and this screen does not pretend
 * otherwise.
 */
export function RegisterDrawer({
  sessionId, api, onClose, onChanged,
}: {
  sessionId: string | null;
  api: ApiClient;
  onClose: () => void;
  onChanged: (message: string) => void;
}) {
  const [register, setRegister] = useState<Register | null>(null);
  const [pending, setPending] = useState<Record<string, AttendanceState>>({});
  const [correcting, setCorrecting] = useState<RegisterStudent | null>(null);
  const [nextState, setNextState] = useState<AttendanceState>('present');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);

  const reload = useCallback(async () => {
    if (!sessionId) return;
    const result = await api.get<Register>(`/v1/sessions/${sessionId}/attendance`);
    if (result.ok) { setRegister(result.value); setPending({}); }
    else setFailure(result.error);
  }, [api, sessionId]);

  useEffect(() => {
    if (!sessionId) { setRegister(null); return; }
    setRegister(null); setPending({}); setFailure(null);
    setCorrecting(null); setReason('');
    void reload();
  }, [sessionId, reload]);

  if (!sessionId) return null;

  const dirty = Object.keys(pending).length;
  const blocked = register ? submitBlockedReason(register) : null;

  const stateOf = (student: RegisterStudent): AttendanceState | null =>
    pending[student.student_id] ?? student.state;

  function mark(student: RegisterStudent, state: AttendanceState) {
    setPending((current) => {
      const next = { ...current };
      // Tapping back to what the server holds is not a change, so the unsaved
      // count always means a real difference.
      if (student.state === state) delete next[student.student_id];
      else next[student.student_id] = state;
      return next;
    });
  }

  async function save() {
    if (!register || dirty === 0) return;
    setBusy(true);
    setFailure(null);
    const result = await api.put(`/v1/sessions/${sessionId}/attendance`, {
      version: register.sheet.version,
      marks: Object.entries(pending).map(([student_id, state]) => ({ student_id, state })),
    });
    setBusy(false);
    if (!result.ok) { setFailure(result.error); return; }
    await reload();
    onChanged('Attendance saved');
  }

  async function submit() {
    if (!register) return;
    setBusy(true);
    setFailure(null);
    const result = await api.post(`/v1/sessions/${sessionId}/attendance/submit`, {
      version: register.sheet.version,
    });
    setBusy(false);
    if (!result.ok) { setFailure(result.error); return; }
    await reload();
    onChanged('Register submitted');
  }

  async function correct() {
    if (!correcting?.record_id || !reason.trim()) return;
    setBusy(true);
    setFailure(null);
    const result = await api.post(`/v1/attendance-records/${correcting.record_id}/correct`, {
      state: nextState, reason: reason.trim(),
    });
    setBusy(false);
    if (!result.ok) { setFailure(result.error); return; }
    setCorrecting(null); setReason('');
    await reload();
    onChanged('Mark corrected');
  }

  const submitted = register?.sheet.status === 'submitted';

  return (
    <Drawer
      open
      title={register
        ? `${register.session.course.code} · ${register.session.section.label}`
        : 'Register'}
      subtitle={register
        ? `${register.session.date} · ${register.session.starts_at} to ${register.session.ends_at}`
        : undefined}
      onClose={onClose}
      footer={
        correcting
          ? (
            <>
              <Button variant="secondary" onClick={() => setCorrecting(null)} disabled={busy}>
                Back
              </Button>
              <Button
                variant="primary" loading={busy} disabled={reason.trim().length === 0}
                onClick={() => void correct()}
              >
                Record the correction
              </Button>
            </>
          )
          : (
            <>
              <Button variant="secondary" onClick={onClose} disabled={busy}>Done</Button>
              {register?.can_mark && dirty > 0 && (
                <Button variant="secondary" loading={busy} onClick={() => void save()}>
                  Save {dirty}
                </Button>
              )}
              {register?.can_submit && (
                <Button
                  variant="primary" loading={busy}
                  disabled={blocked !== null || dirty > 0}
                  title={blocked ?? (dirty > 0 ? 'Save your changes first' : undefined)}
                  onClick={() => void submit()}
                >
                  Submit
                </Button>
              )}
            </>
          )
      }
    >
      {failure && <Banner tone="error">{failure.message}</Banner>}

      {!register ? (
        <div className="skeleton" style={{ height: 160 }} />
      ) : correcting ? (
        <>
          <h3 className="drawer__section">Correct {correcting.full_name}</h3>
          <p className="drawer__note">
            The register stays submitted. This records that the mark was{' '}
            {STATE_LABEL[correcting.state ?? 'absent'].toLowerCase()} and who changed it, so the
            change is explicable rather than invisible.
          </p>
          <div className="field">
            <label className="field__label" htmlFor="correct-state">Should be</label>
            <select
              id="correct-state" className="field__input" value={nextState}
              onChange={(e) => setNextState(e.currentTarget.value as AttendanceState)}
            >
              {STATES.filter((s) => s !== correcting.state).map((s) => (
                <option key={s} value={s}>{STATE_LABEL[s]}</option>
              ))}
            </select>
            <span className="field__message"> </span>
          </div>
          <Field
            label="Why is this changing?" value={reason} autoFocus
            placeholder="Signed the paper register; the app entry was wrong"
            onChange={(e) => setReason(e.currentTarget.value)}
            error={failure?.fieldErrors?.reason}
          />
        </>
      ) : (
        <>
          <div className="register__summary">
            <StatusChip tone={submitted ? 'success' : 'warning'}>
              {submitted ? 'submitted' : 'open'}
            </StatusChip>
            <span className="tabular">
              {STATES.map((s) => `${register.summary[s]} ${s}`).join(' · ')}
            </span>
            {register.summary.unmarked > 0 && (
              <span className="register__unmarked tabular">
                {register.summary.unmarked} not marked
              </span>
            )}
          </div>

          {submitted && register.sheet.submitted_by && (
            <p className="drawer__note">
              Submitted by {register.sheet.submitted_by}. A mark now changes only by a
              correction, which is recorded.
            </p>
          )}

          {register.students.length === 0 ? (
            <Banner tone="warning">
              Nobody was enrolled in this course on {register.session.date}, so there is nobody
              to mark.
            </Banner>
          ) : (
            <ul className="register">
              {register.students.map((student) => {
                const state = stateOf(student);
                const history = correctionsFor(register, student.record_id);
                return (
                  <li key={student.student_id} className="register__row">
                    <span className="register__who">
                      <span>{student.full_name}</span>
                      <code className="entry__code">{student.enrolment_number}</code>
                    </span>

                    {register.can_mark ? (
                      <span className="marks" role="group" aria-label={`Mark ${student.full_name}`}>
                        {STATES.map((option) => (
                          <button
                            key={option}
                            className={`mark${state === option ? ` mark--on mark--${option}` : ''}`}
                            aria-pressed={state === option}
                            aria-label={`${STATE_LABEL[option]}, ${student.full_name}`}
                            onClick={() => mark(student, option)}
                          >
                            {STATE_LETTER[option]}
                          </button>
                        ))}
                      </span>
                    ) : (
                      <span className="register__state">
                        {state ? STATE_LABEL[state] : 'Not marked'}
                      </span>
                    )}

                    {register.can_correct && student.record_id && (
                      <Button
                        variant="text"
                        onClick={() => {
                          setCorrecting(student);
                          setNextState(STATES.find((s) => s !== student.state) ?? 'present');
                          setReason('');
                        }}
                      >
                        Correct
                      </Button>
                    )}

                    {history.length > 0 && (
                      <p className="register__history">
                        {history.map((c) => (
                          <span key={c.id}>
                            {STATE_LABEL[c.from_state]} to {STATE_LABEL[c.to_state]}
                            {c.corrected_by ? ` by ${c.corrected_by}` : ''}: {c.reason}
                          </span>
                        ))}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {dirty > 0 && (
            <Banner tone="info">
              {dirty} unsaved {dirty === 1 ? 'mark' : 'marks'}. Nothing is sent until you save.
            </Banner>
          )}

          {blocked && !submitted && <Banner tone="warning">{blocked}</Banner>}
        </>
      )}
    </Drawer>
  );
}
