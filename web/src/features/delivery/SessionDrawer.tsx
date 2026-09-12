import { useEffect, useState } from 'react';
import { Banner, Button, Drawer, Field, StatusChip } from '../../components/index.tsx';
import type { ApiClient, ApiFailure } from '../../lib/api.ts';
import type { Person } from '../people/types.ts';
import {
  COMPONENT_LABEL, dayLabel, sessionWarnings, type ClassSession, type Room,
} from './types.ts';

type Mode = 'detail' | 'move' | 'cancel' | 'reassign';

/**
 * One class: where it is, who teaches it, and what can still be done to it.
 *
 * A class that has been taught shows the same facts and offers no actions,
 * because its record is what attendance will point at. Saying that plainly is
 * better than hiding the buttons and letting somebody hunt for them.
 */
export function SessionDrawer({
  session, api, rooms, canManage, onClose, onChanged,
}: {
  session: ClassSession | null;
  api: ApiClient;
  rooms: Room[];
  canManage: boolean;
  onClose: () => void;
  onChanged: (message: string) => void;
}) {
  const [mode, setMode] = useState<Mode>('detail');
  const [date, setDate] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [roomId, setRoomId] = useState('');
  const [standInId, setStandInId] = useState('');
  const [reason, setReason] = useState('');
  const [staff, setStaff] = useState<Person[]>([]);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);

  useEffect(() => {
    if (!session) return;
    setMode('detail'); setFailure(null); setReason('');
    setDate(session.date);
    setStartsAt(session.starts_at);
    setEndsAt(session.ends_at);
    setRoomId(session.room?.id ?? '');
    setStandInId(session.stand_in ? session.teacher?.id ?? '' : '');
  }, [session]);

  useEffect(() => {
    if (mode !== 'reassign' || staff.length > 0) return;
    void api.get<Person[]>('/v1/people?type=staff').then((r) => { if (r.ok) setStaff(r.value); });
  }, [mode, staff.length, api]);

  if (!session) return null;

  const warnings = sessionWarnings(session);
  const finished = session.status !== 'scheduled';

  async function send(
    path: string, body: unknown, message: string,
  ) {
    setBusy(true);
    setFailure(null);
    const result = await api.post(path, body);
    setBusy(false);
    if (!result.ok) { setFailure(result.error); return; }
    onChanged(message);
  }

  const move = () => send(`/v1/sessions/${session.id}/reschedule`, {
    session_date: date, starts_at: startsAt, ends_at: endsAt,
    room_id: roomId || null, ...(reason.trim() ? { reason: reason.trim() } : {}),
  }, `${session.course.code} moved to ${dayLabel(date)}`);

  const cancel = () => send(`/v1/sessions/${session.id}/cancel`, {
    reason: reason.trim(),
  }, `${session.course.code} on ${dayLabel(session.date)} cancelled`);

  // A room or stand-in change is a partial edit of the class, so it is a PATCH.
  // Moving and cancelling are transitions, which is why those are POSTs to
  // named endpoints rather than field updates.
  const reassign = async () => {
    setBusy(true);
    setFailure(null);
    const result = await api.patch(`/v1/sessions/${session.id}`, {
      room_id: roomId || null, stand_in_person_id: standInId || null,
      ...(reason.trim() ? { reason: reason.trim() } : {}),
    });
    setBusy(false);
    if (!result.ok) { setFailure(result.error); return; }
    onChanged(`${session.course.code} updated`);
  };

  return (
    <Drawer
      open
      title={`${session.course.code} · ${session.course.title}`}
      subtitle={`${session.program.name} · ${session.section.label} · ${
        COMPONENT_LABEL[session.component] ?? session.component}`}
      onClose={onClose}
      footer={
        mode === 'detail'
          ? <Button variant="secondary" onClick={onClose}>Done</Button>
          : (
            <>
              <Button variant="secondary" onClick={() => setMode('detail')} disabled={busy}>
                Back
              </Button>
              {mode === 'move' && (
                <Button variant="primary" loading={busy} onClick={() => void move()}>
                  Move this class
                </Button>
              )}
              {mode === 'cancel' && (
                <Button
                  variant="danger" loading={busy} disabled={reason.trim().length === 0}
                  onClick={() => void cancel()}
                >
                  Cancel this class
                </Button>
              )}
              {mode === 'reassign' && (
                <Button variant="primary" loading={busy} onClick={() => void reassign()}>
                  Save
                </Button>
              )}
            </>
          )
      }
    >
      {failure && <Banner tone="error">{failure.message}</Banner>}

      {mode === 'detail' && (
        <>
          <dl className="detail">
            <div>
              <dt>When</dt>
              <dd>{dayLabel(session.date)}, {session.starts_at} to {session.ends_at}</dd>
            </div>
            <div>
              <dt>Where</dt>
              <dd>
                {session.room
                  ? `${session.room.code} · ${session.room.name}`
                  : 'No room set'}
              </dd>
            </div>
            <div>
              <dt>Taught by</dt>
              <dd>
                {session.teacher?.full_name ?? 'Nobody assigned'}
                {session.stand_in && ' (standing in)'}
              </dd>
            </div>
            <div>
              <dt>State</dt>
              <dd><StatusChip tone={session.status === 'completed' ? 'success' : 'info'}>
                {session.status}
              </StatusChip></dd>
            </div>
            {session.moved_from && (
              <div>
                <dt>Moved from</dt>
                <dd>{dayLabel(session.moved_from.date)}
                  {session.moved_from.starts_at ? `, ${session.moved_from.starts_at}` : ''}</dd>
              </div>
            )}
          </dl>

          {warnings.map((w) => <Banner key={w} tone="warning">{w}</Banner>)}

          {session.status === 'cancelled' && session.cancelled_reason && (
            <Banner tone="info">Cancelled: {session.cancelled_reason}</Banner>
          )}

          {finished && session.status === 'completed' && (
            <Banner tone="info">
              This class has been taught. Its record stays exactly as it is, because attendance
              and marks will point at it.
            </Banner>
          )}

          {canManage && !finished && (
            <div className="drawer__row">
              <Button variant="secondary" onClick={() => setMode('move')}>Move</Button>
              <Button variant="secondary" onClick={() => setMode('reassign')}>
                Room or stand-in
              </Button>
              <Button variant="text" onClick={() => setMode('cancel')}>Cancel class</Button>
            </div>
          )}
        </>
      )}

      {mode === 'move' && (
        <>
          <p className="drawer__note">
            A class that has not been taught can move freely. Where it came from is kept, so the
            change stays explicable next term.
          </p>
          <Field
            label="Date" type="date" value={date}
            onChange={(e) => setDate(e.currentTarget.value)}
            error={failure?.fieldErrors?.session_date}
          />
          <div className="drawer__row">
            <div className="field field--inline">
              <label className="field__label" htmlFor="session-from">Starts</label>
              <input
                id="session-from" className="field__input" type="time" value={startsAt}
                onChange={(e) => setStartsAt(e.currentTarget.value)}
              />
            </div>
            <div className="field field--inline">
              <label className="field__label" htmlFor="session-to">Ends</label>
              <input
                id="session-to" className="field__input" type="time" value={endsAt}
                onChange={(e) => setEndsAt(e.currentTarget.value)}
              />
            </div>
          </div>
          <RoomPicker rooms={rooms} value={roomId} onChange={setRoomId} />
          <Field
            label="Why, optional" value={reason} placeholder="Teacher at a university meeting"
            onChange={(e) => setReason(e.currentTarget.value)}
          />
        </>
      )}

      {mode === 'cancel' && (
        <>
          <p className="drawer__note">
            The class stays on the record, marked cancelled. That is what answers "why was there
            no class" later, which a deleted row cannot.
          </p>
          <Field
            label="Why is there no class?" value={reason} autoFocus
            placeholder="Teacher unwell"
            onChange={(e) => setReason(e.currentTarget.value)}
            error={failure?.fieldErrors?.reason}
          />
        </>
      )}

      {mode === 'reassign' && (
        <>
          <RoomPicker rooms={rooms} value={roomId} onChange={setRoomId} />
          <div className="field">
            <label className="field__label" htmlFor="session-stand-in">Stand-in, optional</label>
            <select
              id="session-stand-in" className="field__input" value={standInId}
              onChange={(e) => setStandInId(e.currentTarget.value)}
            >
              <option value="">Whoever leads the course</option>
              {staff.map((p) => (
                <option key={p.person_id} value={p.person_id}>{p.full_name}</option>
              ))}
            </select>
            {/* Substitution reduced to its data. Clearing it returns the class
                to the course's lead instructor. */}
            <span className="field__message">
              Applies to this one class, not to the course.
            </span>
          </div>
          <Field
            label="Why, optional" value={reason} placeholder="Lead at a conference"
            onChange={(e) => setReason(e.currentTarget.value)}
          />
        </>
      )}
    </Drawer>
  );
}

function RoomPicker({
  rooms, value, onChange,
}: { rooms: Room[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="field">
      <label className="field__label" htmlFor="session-room">Room</label>
      <select
        id="session-room" className="field__input" value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
      >
        <option value="">No room</option>
        {rooms.filter((r) => r.status === 'active').map((r) => (
          <option key={r.id} value={r.id}>
            {r.code} · {r.name}{r.capacity === null ? '' : ` · ${r.capacity} seats`}
          </option>
        ))}
      </select>
      <span className="field__message">
        A room smaller than the cohort is allowed, and flagged.
      </span>
    </div>
  );
}
