import { useCallback, useEffect, useState } from 'react';
import { Banner, Button, Drawer, Field, StatusChip } from '../../components/index.tsx';
import type { ApiClient, ApiFailure } from '../../lib/api.ts';
import { today } from '../../lib/dates.ts';
import {
  MARK_LABEL, MARK_STATUSES, STATUS_LABEL, parseScore, resultLabel, submitBlockedReason,
  type MarkStatus, type Sheet, type SheetStudent,
} from './types.ts';

interface Pending { status: MarkStatus; raw: string }

/**
 * One component's mark sheet: entry, submission, verification and correction.
 *
 * The department's surface. Teachers enter marks on Flutter (AD-24); this
 * accepts entry too, for an office transcribing a paper sheet, but its real job
 * is to verify and to correct with a reason.
 */
export function AssessmentSheetDrawer({
  componentId, api, onClose, onChanged,
}: {
  componentId: string | null;
  api: ApiClient;
  onClose: () => void;
  onChanged: (message: string) => void;
}) {
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [pending, setPending] = useState<Record<string, Pending>>({});
  const [heldOn, setHeldOn] = useState('');
  const [correcting, setCorrecting] = useState<SheetStudent | null>(null);
  const [toStatus, setToStatus] = useState<MarkStatus>('scored');
  const [toScore, setToScore] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);

  const reload = useCallback(async () => {
    if (!componentId) return;
    const result = await api.get<Sheet>(`/v1/assessments/${componentId}/sheet`);
    if (result.ok) { setSheet(result.value); setPending({}); }
    else setFailure(result.error);
  }, [api, componentId]);

  useEffect(() => {
    if (!componentId) { setSheet(null); return; }
    setSheet(null); setPending({}); setFailure(null); setCorrecting(null);
    setHeldOn(''); setReason('');
    void reload();
  }, [componentId, reload]);

  if (!componentId) return null;

  const max = sheet?.component.max_marks ?? 0;
  const errors = Object.entries(pending)
    .filter(([, p]) => p.status === 'scored')
    .map(([id, p]) => [id, parseScore(p.raw, max)] as const)
    .filter(([, r]) => !r.ok);
  const unsaved = Object.keys(pending).length;
  const blocked = sheet ? submitBlockedReason(sheet, unsaved) : null;

  function effective(s: SheetStudent): { status: MarkStatus | null; raw: string } {
    const p = pending[s.student_id];
    if (p) return p;
    return { status: s.status, raw: s.score === null ? '' : String(s.score) };
  }

  function change(s: SheetStudent, next: Pending) {
    setPending((current) => {
      const copy = { ...current };
      const same = next.status === s.status
        && (next.status !== 'scored' || next.raw.trim() === (s.score === null ? '' : String(s.score)));
      // Back to what the server holds is not a change, so "unsaved" is honest.
      if (same) delete copy[s.student_id];
      else copy[s.student_id] = next;
      return copy;
    });
  }

  async function run(path: string, body: unknown, message: string, method: 'post' | 'put' = 'post') {
    setBusy(true);
    setFailure(null);
    const result = method === 'put' ? await api.put(path, body) : await api.post(path, body);
    setBusy(false);
    if (!result.ok) { setFailure(result.error); return false; }
    await reload();
    onChanged(message);
    return true;
  }

  const save = () => run(`/v1/assessments/${componentId}/marks`, {
    version: sheet!.component.version,
    marks: Object.entries(pending).map(([student_id, p]) => ({
      student_id, status: p.status,
      score: p.status === 'scored' ? Number(p.raw) : null,
    })),
  }, 'Marks saved', 'put');

  async function correct() {
    if (!correcting?.mark_id) return;
    const parsed = toStatus === 'scored' ? parseScore(toScore, max) : null;
    if (parsed && !parsed.ok) { setFailure({ code: 'VALIDATION_FAILED', message: parsed.error }); return; }
    const done = await run(`/v1/assessment-marks/${correcting.mark_id}/correct`, {
      status: toStatus, score: parsed?.ok ? parsed.value : null, reason: reason.trim(),
    }, 'Mark corrected');
    if (done) { setCorrecting(null); setReason(''); }
  }

  const c = sheet?.component;

  return (
    <Drawer
      open
      title={c ? `${c.course.code} · ${c.name}` : 'Mark sheet'}
      subtitle={c ? `${c.section.label} · out of ${c.max_marks} · ${c.weight}%` : undefined}
      onClose={onClose}
      footer={correcting
        ? (
          <>
            <Button variant="secondary" onClick={() => setCorrecting(null)} disabled={busy}>Back</Button>
            <Button variant="primary" loading={busy} disabled={reason.trim() === ''} onClick={() => void correct()}>
              Record the correction
            </Button>
          </>
        )
        : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={busy}>Done</Button>
            {sheet?.can_mark && unsaved > 0 && (
              <Button variant="secondary" loading={busy} disabled={errors.length > 0} onClick={() => void save()}>
                Save {unsaved}
              </Button>
            )}
            {sheet?.can_submit && (
              <Button
                variant="primary" loading={busy} disabled={blocked !== null}
                title={blocked ?? undefined}
                onClick={() => void run(`/v1/assessments/${componentId}/submit`,
                  { version: sheet.component.version }, 'Sheet submitted')}
              >
                Submit
              </Button>
            )}
            {sheet?.can_verify && (
              <Button
                variant="primary" loading={busy}
                onClick={() => void run(`/v1/assessments/${componentId}/verify`,
                  { version: sheet.component.version }, 'Sheet verified')}
              >
                Verify
              </Button>
            )}
          </>
        )}
    >
      {failure && <Banner tone="error">{failure.message}</Banner>}

      {!sheet ? (
        <div className="skeleton" style={{ height: 160 }} />
      ) : correcting ? (
        <>
          <h3 className="drawer__section">Correct {correcting.full_name}</h3>
          <p className="drawer__note">
            The sheet stays {STATUS_LABEL[sheet.component.status].toLowerCase()}. This records that
            the result was {resultLabel(correcting.status, correcting.score).toLowerCase()}, who
            changed it and why.
          </p>
          <div className="field">
            <label className="field__label" htmlFor="correct-status">Should be</label>
            <select
              id="correct-status" className="field__input" value={toStatus}
              onChange={(e) => setToStatus(e.currentTarget.value as MarkStatus)}
            >
              {MARK_STATUSES.map((s) => <option key={s} value={s}>{MARK_LABEL[s]}</option>)}
            </select>
            <span className="field__message"> </span>
          </div>
          {toStatus === 'scored' && (
            <Field
              label={`Score, out of ${max}`} value={toScore} inputMode="decimal"
              onChange={(e) => setToScore(e.currentTarget.value)}
            />
          )}
          <Field
            label="Why is this changing?" value={reason} autoFocus
            placeholder="Sat the test late with permission"
            onChange={(e) => setReason(e.currentTarget.value)}
            error={failure?.fieldErrors?.reason}
          />
        </>
      ) : (
        <>
          <div className="register__summary">
            <StatusChip tone={sheet.component.status === 'verified' ? 'success' : 'info'}>
              {STATUS_LABEL[sheet.component.status]}
            </StatusChip>
            <span className="tabular">
              {sheet.summary.scored} scored · {sheet.summary.absent} absent · {sheet.summary.exempt} exempt
            </span>
            {sheet.summary.unmarked > 0 && (
              <span className="register__unmarked tabular">{sheet.summary.unmarked} not entered</span>
            )}
          </div>

          {/* The roster is taken as of this date, so nothing else can happen first. */}
          {sheet.needs_date ? (
            sheet.can_mark ? (
              <>
                <p className="drawer__note">
                  Record when this was held. The class list is taken as of that day, and the date
                  is fixed once the first mark is entered.
                </p>
                <div className="drawer__row">
                  <Field
                    label="Held on" type="date" value={heldOn} max={today()}
                    onChange={(e) => setHeldOn(e.currentTarget.value)}
                  />
                  <Button
                    variant="primary" loading={busy} disabled={heldOn === ''}
                    onClick={() => void run(`/v1/assessments/${componentId}/held-on`,
                      { version: sheet.component.version, held_on: heldOn }, 'Date recorded')}
                  >
                    Record date
                  </Button>
                </div>
              </>
            ) : (
              <Banner tone="info">Not held yet, so there is no class list to show.</Banner>
            )
          ) : sheet.students.length === 0 ? (
            <Banner tone="warning">Nobody was enrolled in this course on {sheet.component.held_on}.</Banner>
          ) : (
            <ul className="register">
              {sheet.students.map((s) => {
                const e = effective(s);
                const parsed = e.status === 'scored' && pending[s.student_id]
                  ? parseScore(e.raw, max) : null;
                return (
                  <li key={s.student_id} className="register__row">
                    <span className="register__who">
                      <span>{s.full_name}</span>
                      <code className="entry__code">{s.enrolment_number}</code>
                    </span>
                    {sheet.can_mark ? (
                      <span className="score-entry">
                        <input
                          className="score-entry__input tabular" inputMode="decimal"
                          aria-label={`Score for ${s.full_name}, out of ${max}`}
                          value={e.status === 'scored' ? e.raw : ''}
                          placeholder={e.status && e.status !== 'scored' ? MARK_LABEL[e.status] : '—'}
                          onChange={(ev) => change(s, { status: 'scored', raw: ev.currentTarget.value })}
                        />
                        {(['absent', 'exempt'] as MarkStatus[]).map((st) => (
                          <button
                            key={st}
                            className={`mark${e.status === st ? ` mark--on mark--${st === 'absent' ? 'absent' : 'excused'}` : ''}`}
                            aria-pressed={e.status === st}
                            aria-label={`${MARK_LABEL[st]}, ${s.full_name}`}
                            onClick={() => change(s, { status: st, raw: '' })}
                          >
                            {st === 'absent' ? 'A' : 'E'}
                          </button>
                        ))}
                        {parsed && !parsed.ok && <span className="score-entry__error">{parsed.error}</span>}
                      </span>
                    ) : (
                      <span className="register__state tabular">{resultLabel(s.status, s.score)}</span>
                    )}
                    {sheet.can_correct && s.mark_id && (
                      <Button
                        variant="text"
                        onClick={() => {
                          setCorrecting(s);
                          setToStatus(s.status === 'scored' ? 'absent' : 'scored');
                          setToScore(''); setReason('');
                        }}
                      >
                        Correct
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {sheet.corrections.length > 0 && (
            <>
              <h3 className="drawer__section">Corrections</h3>
              <ul className="history">
                {sheet.corrections.map((k) => (
                  <li key={k.id} className="history__row">
                    <span className="assignee__name">{k.student_name}</span>
                    <span className="assignee__since tabular">
                      {resultLabel(k.from_status, k.from_score)} to {resultLabel(k.to_status, k.to_score)}
                      {k.corrected_by ? ` by ${k.corrected_by}` : ''}
                    </span>
                    <span className="history__reason">{k.reason}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {unsaved > 0 && (
            <Banner tone="info">{unsaved} unsaved {unsaved === 1 ? 'change' : 'changes'}. Nothing is sent until you save.</Banner>
          )}
          {blocked && sheet.component.status === 'draft' && sheet.can_submit && (
            <Banner tone="warning">{blocked}</Banner>
          )}
        </>
      )}
    </Drawer>
  );
}
