import { useCallback, useEffect, useMemo, useState } from 'react';
import { Banner, Button, Drawer, Field, StatusChip } from '../../components/index.tsx';
import type { ApiClient, ApiFailure } from '../../lib/api.ts';
import type { Person } from '../people/types.ts';
import {
  COMPONENT_LABEL, ROLE_LABEL, assignmentClosedReason,
  type AssignmentHistoryEntry, type Instructor, type InstructorRole, type Offering,
} from './types.ts';

const ROLES: InstructorRole[] = ['lead', 'co', 'assistant'];

/**
 * Who teaches one course, and who taught it before.
 *
 * Assignment is a record rather than a field, so a mid-term handover leaves both
 * teachers in the history and attendance taken in week three still points at
 * whoever was teaching in week three. That is why ending an assignment needs a
 * reason and never deletes anything.
 */
export function InstructorDrawer({
  offering, api, canAssign, onClose, onChanged,
}: {
  offering: Offering | null;
  api: ApiClient;
  canAssign: boolean;
  onClose: () => void;
  onChanged: (message: string) => void;
}) {
  const [live, setLive] = useState<Offering | null>(offering);
  const [history, setHistory] = useState<AssignmentHistoryEntry[]>([]);
  const [staff, setStaff] = useState<Person[]>([]);
  const [query, setQuery] = useState('');
  const [role, setRole] = useState<InstructorRole>('lead');
  const [ending, setEnding] = useState<Instructor | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [staffFailure, setStaffFailure] = useState<ApiFailure | null>(null);

  const offeringId = offering?.id ?? null;

  // Re-read after every change rather than patching local state, so the panel
  // always shows what the server actually holds.
  const reload = useCallback(async () => {
    if (!offeringId) return;
    const [fresh, past] = await Promise.all([
      api.get<Offering>(`/v1/offerings/${offeringId}`),
      api.get<AssignmentHistoryEntry[]>(`/v1/offerings/${offeringId}/instructor-history`),
    ]);
    if (fresh.ok) setLive(fresh.value);
    if (past.ok) setHistory(past.value);
  }, [api, offeringId]);

  useEffect(() => {
    if (!offering) { setLive(null); return; }
    setLive(offering);
    setQuery(''); setReason(''); setEnding(null); setFailure(null); setShowHistory(false);
    setRole(offering.instructors.some((i) => i.role === 'lead') ? 'co' : 'lead');
    void reload();
  }, [offering, reload]);

  // Only staff can teach, which the database enforces too. Asking for the
  // filtered list keeps an operator from picking a student and being refused.
  useEffect(() => {
    if (!offeringId || staff.length > 0) return;
    setStaffFailure(null);
    void api.get<Person[]>('/v1/people?type=staff').then((r) => {
      // Saying why the list is empty matters: "no staff yet" and "you may not
      // read the directory" call for completely different actions.
      if (r.ok) setStaff(r.value);
      else setStaffFailure(r.error);
    });
  }, [offeringId, staff.length, api]);

  const current = live?.instructors ?? [];
  const closed = live ? assignmentClosedReason(live) : null;
  const hasLead = current.some((i) => i.role === 'lead');

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    const assigned = new Set(current.map((i) => i.person_id));
    return staff
      .filter((p) => !assigned.has(p.person_id))
      .filter((p) => !q || p.full_name.toLowerCase().includes(q)
        || (p.email ?? '').toLowerCase().includes(q))
      .slice(0, 40);
  }, [staff, current, query]);

  const past = history.filter((h) => !h.is_current);

  if (!offering || !live) return null;

  async function assign(person: Person) {
    setBusy(true);
    setFailure(null);
    const result = await api.post(`/v1/offerings/${live!.id}/instructors`, {
      person_id: person.person_id, role,
    });
    setBusy(false);
    if (!result.ok) { setFailure(result.error); return; }
    setQuery('');
    await reload();
    onChanged(`${person.full_name} now teaches ${live!.course.code}`);
  }

  async function endAssignment() {
    if (!ending || !reason.trim()) return;
    setBusy(true);
    setFailure(null);
    const result = await api.post(
      `/v1/instructor-assignments/${ending.assignment_id}/end`, { reason: reason.trim() },
    );
    setBusy(false);
    if (!result.ok) { setFailure(result.error); return; }
    const name = ending.full_name;
    setEnding(null); setReason('');
    await reload();
    onChanged(`${name} no longer teaches ${live!.course.code}`);
  }

  return (
    <Drawer
      open
      title={`${live.course.code} · ${live.course.title}`}
      subtitle={`${live.section.label} · ${live.program.name} · ${COMPONENT_LABEL[live.component]}`}
      onClose={onClose}
      footer={<Button variant="secondary" onClick={onClose}>Done</Button>}
    >
      {failure && <Banner tone="error">{failure.message}</Banner>}
      {closed && <Banner tone="info">{closed}</Banner>}

      {/* Ending an assignment asks for the reason in place, because a bare end
          date explains nothing to whoever reads the history next term. */}
      {ending ? (
        <>
          <h3 className="drawer__section">End {ending.full_name}'s assignment</h3>
          <p className="drawer__note">
            The record stays. Attendance and marks already taken keep pointing at{' '}
            {ending.full_name}, which is what makes the term explicable later.
          </p>
          <Field
            label="Why is this changing?" value={reason} autoFocus
            placeholder="On medical leave from 14 August"
            onChange={(e) => setReason(e.currentTarget.value)}
            error={failure?.fieldErrors?.reason}
          />
          <div className="drawer__row">
            <Button variant="secondary" onClick={() => { setEnding(null); setReason(''); }}>
              Keep the assignment
            </Button>
            <Button
              variant="danger" loading={busy} disabled={reason.trim().length === 0}
              onClick={() => void endAssignment()}
            >
              End assignment
            </Button>
          </div>
        </>
      ) : (
        <>
          <h3 className="drawer__section">Teaching now</h3>
          {current.length === 0 ? (
            <p className="drawer__note">
              Nobody is assigned. This course cannot start teaching until somebody is, because
              attendance is recorded against whoever teaches it.
            </p>
          ) : (
            <ul className="assignees">
              {current.map((i) => (
                <li key={i.assignment_id} className="assignee">
                  <span className="assignee__name">{i.full_name}</span>
                  <StatusChip tone={i.role === 'lead' ? 'info' : 'neutral'}>
                    {ROLE_LABEL[i.role]}
                  </StatusChip>
                  <span className="assignee__since">since {onDay(i.since)}</span>
                  {canAssign && !closed && (
                    <Button variant="text" onClick={() => setEnding(i)}>End</Button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {canAssign && !closed && (
            <>
              <h3 className="drawer__section">Assign someone</h3>
              <div className="drawer__row">
                <div className="field field--inline">
                  <label className="field__label" htmlFor="instructor-role">Role</label>
                  <select
                    id="instructor-role" className="field__input" value={role}
                    onChange={(e) => setRole(e.currentTarget.value as InstructorRole)}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r} disabled={r === 'lead' && hasLead}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {/* One lead at a time, so responsibility for a course is never
                  ambiguous. A second teacher joins as a co-teacher. */}
              {hasLead && (
                <p className="drawer__note">
                  This course already has a lead. Anyone else joins as a co-teacher or assistant.
                </p>
              )}

              <Field
                label="Find a colleague" value={query} placeholder="Name or email"
                onChange={(e) => setQuery(e.currentTarget.value)}
              />
              <div className="catalog" role="listbox" aria-label="Staff">
                {candidates.length === 0 ? (
                  <p className="catalog__empty">
                    {staffFailure
                      ? staffFailure.message
                      : staff.length === 0
                        ? 'No staff records yet. Invite teaching staff under People first.'
                        : query
                          ? `Nobody matches "${query}".`
                          : 'Everyone on staff already teaches this course.'}
                  </p>
                ) : (
                  candidates.map((p) => (
                    <button
                      key={p.person_id} type="button" role="option" aria-selected={false}
                      className="catalog__row" disabled={busy}
                      onClick={() => void assign(p)}
                    >
                      <span className="catalog__title">{p.full_name}</span>
                      {p.email && <span className="catalog__flag catalog__flag--muted">{p.email}</span>}
                      <span className="catalog__flag">Assign as {ROLE_LABEL[role].toLowerCase()}</span>
                    </button>
                  ))
                )}
              </div>
            </>
          )}

          {past.length > 0 && (
            <>
              <h3 className="drawer__section">
                Taught before
                <Button variant="text" onClick={() => setShowHistory(!showHistory)}>
                  {showHistory ? 'Hide' : `Show ${past.length}`}
                </Button>
              </h3>
              {showHistory && (
                <ul className="history">
                  {past.map((h) => (
                    <li key={h.id} className="history__row">
                      <span className="assignee__name">{h.full_name}</span>
                      <span className="assignee__since">
                        {ROLE_LABEL[h.role]} · {onDay(h.valid_from)} to{' '}
                        {h.valid_to ? onDay(h.valid_to) : 'now'}
                      </span>
                      {h.end_reason && <span className="history__reason">{h.end_reason}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}
    </Drawer>
  );
}

const onDay = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
