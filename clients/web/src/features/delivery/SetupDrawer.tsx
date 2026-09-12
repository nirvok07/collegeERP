import { useEffect, useState, type FormEvent } from 'react';
import { Banner, Button, Drawer, Field } from '../../components/index.tsx';
import type { ApiClient, ApiFailure } from '../../lib/api.ts';
import type { Department } from '../organisation/types.ts';
import type { DeliveryPermissions } from './DeliveryPage.tsx';
import {
  ROOM_KIND_LABEL, dayLabel, type NonTeachingDay, type Room, type RoomKind,
} from './types.ts';

interface Campus { id: string; name: string }

/**
 * The two pieces of reference data a timetable needs: places to teach in, and
 * days nobody teaches.
 *
 * One drawer rather than two navigation entries, because both are set up rarely
 * and neither deserves a permanent place in the sidebar. A room list is not a
 * facilities console: four facts, and archiving is refused while a timetable
 * still uses it.
 */
export function SetupDrawer({
  open, api, can, onClose, onRoomsChanged,
}: {
  open: boolean;
  api: ApiClient;
  can: DeliveryPermissions;
  onClose: () => void;
  onRoomsChanged: (rooms: Room[]) => void;
}) {
  const [tab, setTab] = useState<'rooms' | 'days'>('rooms');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [days, setDays] = useState<NonTeachingDay[]>([]);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [busy, setBusy] = useState(false);

  const [campusId, setCampusId] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [kind, setKind] = useState<RoomKind>('classroom');
  const [capacity, setCapacity] = useState('');

  const [dayDate, setDayDate] = useState('');
  const [dayLabelText, setDayLabelText] = useState('');

  useEffect(() => {
    if (!open) return;
    setFailure(null); setTab('rooms');
    setCode(''); setName(''); setKind('classroom'); setCapacity('');
    setDayDate(''); setDayLabelText('');
    void api.get<Room[]>('/v1/rooms?include_archived=true').then((r) => {
      if (r.ok) setRooms(r.value);
    });
    void api.get<NonTeachingDay[]>('/v1/non-teaching-days').then((r) => {
      if (r.ok) setDays(r.value);
    });
    void api.get<Campus[] | Department[]>('/v1/campuses').then((r) => {
      if (!r.ok) return;
      const list = r.value as Campus[];
      setCampuses(list);
      if (list.length === 1) setCampusId(list[0]!.id);
    });
  }, [open, api]);

  if (!open) return null;

  async function refreshRooms() {
    const r = await api.get<Room[]>('/v1/rooms?include_archived=true');
    if (r.ok) {
      setRooms(r.value);
      onRoomsChanged(r.value.filter((room) => room.status === 'active'));
    }
  }

  async function addRoom(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFailure(null);
    const result = await api.post('/v1/rooms', {
      campus_id: campusId,
      code: code.trim().toUpperCase(),
      name: name.trim(),
      kind,
      ...(capacity === '' ? {} : { capacity: Number(capacity) }),
    });
    setBusy(false);
    if (!result.ok) { setFailure(result.error); return; }
    setCode(''); setName(''); setCapacity('');
    await refreshRooms();
  }

  async function archive(room: Room) {
    setFailure(null);
    const result = await api.post(`/v1/rooms/${room.id}/archive`, {});
    if (!result.ok) { setFailure(result.error); return; }
    await refreshRooms();
  }

  async function addDay(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFailure(null);
    const result = await api.post('/v1/non-teaching-days', {
      on_date: dayDate, label: dayLabelText.trim(),
    });
    setBusy(false);
    if (!result.ok) { setFailure(result.error); return; }
    setDayDate(''); setDayLabelText('');
    const r = await api.get<NonTeachingDay[]>('/v1/non-teaching-days');
    if (r.ok) setDays(r.value);
  }

  async function removeDay(day: NonTeachingDay) {
    setFailure(null);
    const result = await api.del(`/v1/non-teaching-days/${day.id}`);
    if (!result.ok) { setFailure(result.error); return; }
    setDays((current) => current.filter((d) => d.id !== day.id));
  }

  const roomReady = campusId !== '' && code.trim().length > 0 && name.trim().length > 0;

  return (
    <Drawer
      open
      title="Rooms and holidays"
      subtitle="What a timetable needs before it can be built."
      onClose={onClose}
      footer={<Button variant="secondary" onClick={onClose}>Done</Button>}
    >
      {failure && <Banner tone="error">{failure.message}</Banner>}

      <div className="segmented" role="group" aria-label="Setup section">
        <button
          className={`segmented__option${tab === 'rooms' ? ' segmented__option--on' : ''}`}
          aria-pressed={tab === 'rooms'} onClick={() => setTab('rooms')}
        >
          Rooms
        </button>
        <button
          className={`segmented__option${tab === 'days' ? ' segmented__option--on' : ''}`}
          aria-pressed={tab === 'days'} onClick={() => setTab('days')}
        >
          Non-teaching days
        </button>
      </div>

      {tab === 'rooms' ? (
        <>
          <ul className="assignees">
            {rooms.length === 0 && (
              <li className="drawer__note">No rooms yet. A class with no room leaves nobody
                knowing where to go.</li>
            )}
            {rooms.map((room) => (
              <li key={room.id} className="assignee">
                <span className="assignee__name">
                  <code className="entry__code">{room.code}</code> {room.name}
                </span>
                <span className="assignee__since">
                  {ROOM_KIND_LABEL[room.kind]}
                  {room.capacity === null ? '' : ` · ${room.capacity} seats`}
                  {room.status === 'archived' ? ' · archived' : ''}
                </span>
                {can.manageRooms && room.status === 'active' && (
                  <Button variant="text" onClick={() => void archive(room)}>Archive</Button>
                )}
              </li>
            ))}
          </ul>

          {can.manageRooms && (
            <form onSubmit={addRoom} noValidate style={{ display: 'contents' }}>
              <h3 className="drawer__section">Add a room</h3>
              {campuses.length > 1 && (
                <div className="field">
                  <label className="field__label" htmlFor="room-campus">Campus</label>
                  <select
                    id="room-campus" className="field__input" value={campusId}
                    onChange={(e) => setCampusId(e.currentTarget.value)}
                  >
                    <option value="">Choose a campus</option>
                    {campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <span className="field__message"> </span>
                </div>
              )}
              <Field
                label="Code" value={code} placeholder="LH-204"
                hint="As written on the door. Unique on the campus."
                onChange={(e) => setCode(e.currentTarget.value.toUpperCase())}
                error={failure?.fieldErrors?.code}
              />
              <Field
                label="Name" value={name} placeholder="Lecture Hall 204"
                onChange={(e) => setName(e.currentTarget.value)}
                error={failure?.fieldErrors?.name}
              />
              <div className="drawer__row">
                <div className="field field--inline">
                  <label className="field__label" htmlFor="room-kind">Kind</label>
                  <select
                    id="room-kind" className="field__input" value={kind}
                    onChange={(e) => setKind(e.currentTarget.value as RoomKind)}
                  >
                    {(Object.keys(ROOM_KIND_LABEL) as RoomKind[]).map((k) => (
                      <option key={k} value={k}>{ROOM_KIND_LABEL[k]}</option>
                    ))}
                  </select>
                </div>
                <div className="field field--inline">
                  <label className="field__label" htmlFor="room-capacity">Seats, optional</label>
                  <input
                    id="room-capacity" className="field__input" type="number" min={1} max={2000}
                    value={capacity} placeholder="70"
                    onChange={(e) => setCapacity(e.currentTarget.value)}
                  />
                </div>
              </div>
              <Button variant="primary" type="submit" loading={busy} disabled={!roomReady}>
                Add room
              </Button>
            </form>
          )}
        </>
      ) : (
        <>
          <p className="drawer__note">
            Days the college does not teach. Scheduling skips them by name, so a term has no
            phantom classes on a festival.
          </p>
          <ul className="assignees">
            {days.length === 0 && <li className="drawer__note">No non-teaching days recorded.</li>}
            {days.map((day) => (
              <li key={day.id} className="assignee">
                <span className="assignee__name">{dayLabel(day.on_date)}</span>
                <span className="assignee__since">{day.label}</span>
                {can.manageCalendar && (
                  <Button variant="text" onClick={() => void removeDay(day)}>Remove</Button>
                )}
              </li>
            ))}
          </ul>

          {can.manageCalendar && (
            <form onSubmit={addDay} noValidate style={{ display: 'contents' }}>
              <h3 className="drawer__section">Close a day</h3>
              <Field
                label="Date" type="date" value={dayDate}
                onChange={(e) => setDayDate(e.currentTarget.value)}
                error={failure?.fieldErrors?.on_date}
              />
              <Field
                label="Why" value={dayLabelText} placeholder="Diwali"
                onChange={(e) => setDayLabelText(e.currentTarget.value)}
                error={failure?.fieldErrors?.label}
              />
              {/* Removing a day does not create the classes it prevented.
                  Scheduling is idempotent, so running it again is the fix. */}
              <span className="field__message">
                Classes already scheduled around a day are not changed by removing it. Schedule
                the course again to fill the gap.
              </span>
              <Button
                variant="primary" type="submit" loading={busy}
                disabled={dayDate === '' || dayLabelText.trim().length === 0}
              >
                Close this day
              </Button>
            </form>
          )}
        </>
      )}
    </Drawer>
  );
}
