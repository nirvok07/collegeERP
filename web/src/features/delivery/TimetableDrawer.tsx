import { useCallback, useEffect, useState } from 'react';
import { Banner, Button, Drawer } from '../../components/index.tsx';
import type { ApiClient, ApiFailure } from '../../lib/api.ts';
import type { Offering } from '../teaching/types.ts';
import {
  COMPONENT_LABEL, DAY_NAMES, ROOM_KIND_LABEL, dayLabel,
  type GenerationReport, type Room, type Slot,
} from './types.ts';

/**
 * When a course meets, and turning that into actual classes.
 *
 * Opened from the course itself in the teaching workspace, because a weekly
 * pattern is a property of that course and sending an operator to a separate
 * screen would hide the relationship.
 *
 * Scheduling previews first, always. Generation is all or nothing, so finding
 * out about a room clash by having the fortieth class fail is not an answer.
 */
export function TimetableDrawer({
  offering, api, canManage, onClose, onScheduled,
}: {
  offering: Offering | null;
  api: ApiClient;
  canManage: boolean;
  onClose: () => void;
  onScheduled: (message: string) => void;
}) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [day, setDay] = useState('1');
  const [startsAt, setStartsAt] = useState('09:00');
  const [endsAt, setEndsAt] = useState('10:00');
  const [roomId, setRoomId] = useState('');
  const [preview, setPreview] = useState<GenerationReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);

  const offeringId = offering?.id ?? null;

  const reload = useCallback(async () => {
    if (!offeringId) return;
    const result = await api.get<Slot[]>(`/v1/slots?offering_id=${offeringId}`);
    if (result.ok) setSlots(result.value);
  }, [api, offeringId]);

  useEffect(() => {
    if (!offeringId) return;
    setDay('1'); setStartsAt('09:00'); setEndsAt('10:00'); setRoomId('');
    setPreview(null); setFailure(null);
    void reload();
    void api.get<Room[]>('/v1/rooms').then((r) => { if (r.ok) setRooms(r.value); });
  }, [offeringId, api, reload]);

  if (!offering) return null;

  async function addSlot() {
    setBusy(true);
    setFailure(null);
    const result = await api.post(`/v1/offerings/${offering!.id}/slots`, {
      day_of_week: Number(day), starts_at: startsAt, ends_at: endsAt,
      room_id: roomId || null,
    });
    setBusy(false);
    if (!result.ok) { setFailure(result.error); return; }
    setPreview(null);
    await reload();
  }

  async function removeSlot(slot: Slot) {
    setFailure(null);
    const result = await api.del(`/v1/slots/${slot.id}`);
    if (!result.ok) { setFailure(result.error); return; }
    setPreview(null);
    await reload();
  }

  async function schedule(dryRun: boolean) {
    setBusy(true);
    setFailure(null);
    const result = await api.post<GenerationReport>(
      `/v1/offerings/${offering!.id}/sessions`, { preview: dryRun },
    );
    setBusy(false);
    if (!result.ok) { setFailure(result.error); setPreview(null); return; }
    if (dryRun) { setPreview(result.value); return; }
    setPreview(null);
    onScheduled(result.value.created === 0
      ? 'Everything was already scheduled.'
      : `${result.value.created} classes scheduled for ${offering!.course.code}`);
  }

  const ready = endsAt > startsAt;

  return (
    <Drawer
      open
      title={`When ${offering.course.code} meets`}
      subtitle={`${offering.program.name} · ${offering.section.label} · ${
        COMPONENT_LABEL[offering.component] ?? offering.component}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Done</Button>
          {canManage && slots.length > 0 && (
            preview && preview.clashes.length === 0
              ? (
                <Button variant="primary" loading={busy} onClick={() => void schedule(false)}>
                  Schedule {preview.occurrences.length} classes
                </Button>
              )
              : (
                <Button variant="secondary" loading={busy} onClick={() => void schedule(true)}>
                  Check the term
                </Button>
              )
          )}
        </>
      }
    >
      {failure && <Banner tone="error">{failure.message}</Banner>}

      <h3 className="drawer__section">Weekly pattern</h3>
      {slots.length === 0 ? (
        <p className="drawer__note">
          Nothing yet. A pattern is what turns one course into a term of classes.
        </p>
      ) : (
        <ul className="assignees">
          {slots.map((slot) => (
            <li key={slot.id} className="assignee">
              <span className="assignee__name">
                {DAY_NAMES[slot.day_of_week - 1]}
              </span>
              <span className="assignee__since tabular">
                {slot.starts_at} to {slot.ends_at}
              </span>
              <span className="assignee__since">
                {slot.room ? slot.room.code : 'No room'}
              </span>
              {canManage && (
                <Button variant="text" onClick={() => void removeSlot(slot)}>Remove</Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <>
          <h3 className="drawer__section">Add a weekly class</h3>
          <div className="drawer__row">
            <div className="field field--inline">
              <label className="field__label" htmlFor="slot-day">Day</label>
              <select
                id="slot-day" className="field__input" value={day}
                onChange={(e) => setDay(e.currentTarget.value)}
              >
                {DAY_NAMES.map((label, i) => (
                  <option key={label} value={String(i + 1)}>{label}</option>
                ))}
              </select>
            </div>
            <div className="field field--inline">
              <label className="field__label" htmlFor="slot-from">Starts</label>
              <input
                id="slot-from" className="field__input" type="time" value={startsAt}
                onChange={(e) => setStartsAt(e.currentTarget.value)}
              />
            </div>
            <div className="field field--inline">
              <label className="field__label" htmlFor="slot-to">Ends</label>
              <input
                id="slot-to" className="field__input" type="time" value={endsAt}
                onChange={(e) => setEndsAt(e.currentTarget.value)}
              />
            </div>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="slot-room">Room</label>
            <select
              id="slot-room" className="field__input" value={roomId}
              onChange={(e) => setRoomId(e.currentTarget.value)}
            >
              <option value="">Decide later</option>
              {rooms.filter((r) => r.status === 'active').map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code} · {ROOM_KIND_LABEL[r.kind]}
                  {r.capacity === null ? '' : ` · ${r.capacity} seats`}
                </option>
              ))}
            </select>
            <span className="field__message">
              Two courses cannot hold one room at the same hour in the same term.
            </span>
          </div>
          <Button variant="secondary" loading={busy} disabled={!ready} onClick={() => void addSlot()}>
            Add to the pattern
          </Button>
        </>
      )}

      {preview && (
        <>
          <h3 className="drawer__section">Across the term</h3>
          {preview.clashes.length > 0 ? (
            <Banner tone="error">
              {preview.clashes.length === 1 ? 'One clash' : `${preview.clashes.length} clashes`}
              {' '}stop this from being scheduled. Nothing has been written.
            </Banner>
          ) : preview.occurrences.length === 0 ? (
            <Banner tone="info">
              Every class in this pattern is already scheduled. {preview.already_scheduled} in
              total.
            </Banner>
          ) : (
            <Banner tone="info">
              {preview.occurrences.length} classes between {preview.from} and {preview.to}.
              {preview.already_scheduled > 0
                && ` ${preview.already_scheduled} already exist and will not be duplicated.`}
            </Banner>
          )}

          {preview.clashes.slice(0, 5).map((clash) => (
            <p key={`${clash.date}${clash.starts_at}${clash.subject}`} className="clash">
              <strong>{dayLabel(clash.date)}, {clash.starts_at}</strong>{' '}
              {clash.kind === 'room'
                ? `${clash.subject} already holds ${clash.with_course_code} for section ${clash.with_section_label}.`
                : `${clash.subject} already teaches ${clash.with_course_code} to section ${clash.with_section_label}.`}
            </p>
          ))}
          {preview.clashes.length > 5 && (
            <p className="drawer__note">
              And {preview.clashes.length - 5} more.
            </p>
          )}

          {preview.skipped_days.length > 0 && (
            <p className="drawer__note">
              Skipping {preview.skipped_days.map((d) => d.label).join(', ')}.
            </p>
          )}
        </>
      )}
    </Drawer>
  );
}
