import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button, EmptyState, ErrorState, RefreshBar, StatusChip, useToast, type ChipTone,
} from '../../components/index.tsx';
import type { ApiClient, ApiFailure } from '../../lib/api.ts';
import type { Program } from '../curriculum/types.ts';
import { SessionDrawer } from './SessionDrawer.tsx';
import { SetupDrawer } from './SetupDrawer.tsx';
import {
  COMPONENT_LABEL, NO_FILTERS, addDays, dayLabel, filterSessions, groupByDate, isFiltering,
  isUnmarked, needsAttention, rangeLabel, sessionWarnings, startOfWeek, today, unmarkedCount,
  type ClassSession, type Room, type SessionFilters, type SessionStatus,
} from './types.ts';
import './delivery.css';

type Phase = 'loading' | 'refreshing' | 'ready' | 'error';
type View = 'day' | 'week';

export interface DeliveryPermissions {
  manageSessions: boolean;
  manageRooms: boolean;
  manageCalendar: boolean;
}

const SESSION_TONE: Record<SessionStatus, ChipTone> = {
  scheduled: 'info', completed: 'success', cancelled: 'warning',
};
const STATUS_FILTERS: Array<SessionStatus | 'all'> = ['all', 'scheduled', 'completed', 'cancelled'];

/**
 * The delivery workspace: what is being taught, to whom, when, where, by whom,
 * and whether it happened.
 *
 * Organised by day rather than by entity, because the operational question is
 * "what is happening today, and is anything broken". Both views are lists: a
 * seven-column grid is a wall to read and cannot carry a room, a teacher and a
 * state on every cell without becoming unreadable.
 */
export function DeliveryPage({ api, can }: { api: ApiClient; can: DeliveryPermissions }) {
  const [view, setView] = useState<View>('week');
  const [anchor, setAnchor] = useState<string>(today);
  const [sessions, setSessions] = useState<ClassSession[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [phase, setPhase] = useState<Phase>('loading');
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [filters, setFilters] = useState<SessionFilters>(NO_FILTERS);
  const [openSession, setOpenSession] = useState<ClassSession | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const toast = useToast();

  const from = view === 'day' ? anchor : startOfWeek(anchor);
  const to = view === 'day' ? anchor : addDays(startOfWeek(anchor), 6);

  useEffect(() => {
    void Promise.all([
      api.get<Room[]>('/v1/rooms'),
      api.get<Program[]>('/v1/programs'),
    ]).then(([r, p]) => {
      if (r.ok) setRooms(r.value);
      if (p.ok) setPrograms(p.value.filter((x) => x.status === 'active'));
    });
  }, [api]);

  const load = useCallback(async (mode: 'initial' | 'refresh') => {
    setPhase(mode === 'initial' ? 'loading' : 'refreshing');
    const result = await api.get<ClassSession[]>(`/v1/sessions?from=${from}&to=${to}`);
    if (!result.ok) {
      setFailure(result.error);
      // A failed refresh keeps the day on screen. Losing it because one poll
      // failed is worse than showing it with a warning.
      setPhase(mode === 'initial' ? 'error' : 'ready');
      return;
    }
    setSessions(result.value);
    setFailure(null);
    setPhase('ready');
  }, [api, from, to]);

  useEffect(() => { void load('initial'); }, [load]);

  const visible = useMemo(() => filterSessions(sessions, filters), [sessions, filters]);
  const groups = useMemo(() => groupByDate(visible), [visible]);
  const unmarked = useMemo(() => unmarkedCount(sessions), [sessions]);

  async function complete(session: ClassSession) {
    const result = await api.post(`/v1/sessions/${session.id}/complete`, {});
    if (!result.ok) { toast(result.error.message, 'error'); return; }
    toast(`${session.course.code} recorded as taught`);
    void load('refresh');
  }

  if (phase === 'error') {
    return (
      <ErrorState
        message={failure?.message ?? 'The timetable could not be loaded.'}
        onRetry={() => { setFailure(null); void load('initial'); }}
      />
    );
  }

  const step = view === 'day' ? 1 : 7;

  return (
    <>
      {phase === 'refreshing' ? <RefreshBar /> : <div className="refresh-bar__spacer" />}

      <div className="page__head">
        <div>
          <p className="page__eyebrow">Academic</p>
          <h1 className="page__title">Timetable</h1>
          <p className="page__sub">{rangeLabel(from, to)}</p>
        </div>
        <div className="page__actions">
          <div className="stepper">
            <button
              className="stepper__btn" aria-label={`Previous ${view}`}
              onClick={() => setAnchor(addDays(anchor, -step))}
            >
              &#8592;
            </button>
            <button className="stepper__now" onClick={() => setAnchor(today())}>Today</button>
            <button
              className="stepper__btn" aria-label={`Next ${view}`}
              onClick={() => setAnchor(addDays(anchor, step))}
            >
              &#8594;
            </button>
          </div>
          <div className="segmented" role="group" aria-label="View">
            {(['day', 'week'] as View[]).map((v) => (
              <button
                key={v}
                className={`segmented__option${view === v ? ' segmented__option--on' : ''}`}
                aria-pressed={view === v}
                onClick={() => setView(v)}
              >
                {v === 'day' ? 'Day' : 'Week'}
              </button>
            ))}
          </div>
          <input
            className="search" type="search" placeholder="Course, cohort, room or teacher"
            aria-label="Search the timetable" value={filters.query}
            onChange={(e) => setFilters({ ...filters, query: e.currentTarget.value })}
          />
          {(can.manageRooms || can.manageCalendar) && (
            <Button variant="secondary" onClick={() => setSetupOpen(true)}>Rooms and holidays</Button>
          )}
        </div>
      </div>

      <div className="filters">
        {/* The question worth a dedicated filter: which classes nobody has
            said ran. Everything else is scanning. */}
        {unmarked > 0 && (
          <button
            className={`filter${filters.unmarkedOnly ? ' filter--on' : ''}`}
            aria-pressed={filters.unmarkedOnly}
            onClick={() => setFilters({ ...filters, unmarkedOnly: !filters.unmarkedOnly })}
          >
            Not marked
            <span className="filter__count tabular">{unmarked}</span>
          </button>
        )}
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            className={`filter${filters.status === s ? ' filter--on' : ''}`}
            aria-pressed={filters.status === s}
            onClick={() => setFilters({ ...filters, status: s })}
          >
            {s === 'all' ? 'All classes' : s}
          </button>
        ))}
        {rooms.length > 1 && (
          <select
            className="filter filter--select" aria-label="Room"
            value={filters.roomId ?? ''}
            onChange={(e) => setFilters({ ...filters, roomId: e.currentTarget.value || null })}
          >
            <option value="">Every room</option>
            {rooms.map((r) => <option key={r.id} value={r.id}>{r.code}</option>)}
          </select>
        )}
        {programs.length > 1 && (
          <select
            className="filter filter--select" aria-label="Program"
            value={filters.programId ?? ''}
            onChange={(e) => setFilters({ ...filters, programId: e.currentTarget.value || null })}
          >
            <option value="">Every program</option>
            {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
      </div>

      {failure && phase === 'ready' && (
        <div className="banner banner--error teaching__degraded" role="alert">
          <span>{failure.message}</span>
          <Button variant="text" onClick={() => void load('refresh')}>Retry</Button>
        </div>
      )}

      {phase === 'loading' ? (
        <div className="cohort-skeleton" aria-hidden="true">
          {[0, 1].map((i) => <div key={i} className="skeleton cohort-skeleton__card" />)}
        </div>
      ) : sessions.length === 0 ? (
        <EmptyState
          title="No classes scheduled"
          body={`Nothing is scheduled for ${rangeLabel(from, to).toLowerCase()}. Set a weekly pattern on a course under Teaching, then schedule it across the term.`}
        />
      ) : groups.length === 0 ? (
        <EmptyState
          title="Nothing matches"
          body={filters.unmarkedOnly
            ? 'Every class this week has been marked.'
            : 'No class matches these filters.'}
          action={<Button variant="secondary" onClick={() => setFilters(NO_FILTERS)}>Clear filters</Button>}
        />
      ) : (
        <ul className="days m-stagger">
          {groups.map(({ date, sessions: ofDay }) => (
            <li key={date} className="day">
              <div className="day__head">
                <h2 className="day__name">{dayLabel(date)}</h2>
                <span className="day__count tabular">
                  {ofDay.length} {ofDay.length === 1 ? 'class' : 'classes'}
                </span>
              </div>
              <ul className="classes">
                {ofDay.map((session) => {
                  const warnings = sessionWarnings(session);
                  return (
                    <li
                      key={session.id}
                      className={`class-row${needsAttention(session) ? ' class-row--flagged' : ''}${
                        session.status === 'cancelled' ? ' class-row--off' : ''}`}
                    >
                      <span className="class-row__time tabular">
                        {session.starts_at}
                        <span className="class-row__until">{session.ends_at}</span>
                      </span>

                      <button className="class-row__main" onClick={() => setOpenSession(session)}>
                        <span className="class-row__course">
                          <code className="entry__code">{session.course.code}</code>
                          {session.course.title}
                          {session.component !== 'lecture' && (
                            <span className="offering__component">
                              {COMPONENT_LABEL[session.component] ?? session.component}
                            </span>
                          )}
                        </span>
                        <span className="class-row__context">
                          {session.program.name} · {session.section.label}
                        </span>
                      </button>

                      <span className="class-row__where">
                        {session.room ? session.room.code : 'No room'}
                      </span>
                      <span className="class-row__who">
                        {session.teacher?.full_name ?? 'Unstaffed'}
                        {session.stand_in && <span className="class-row__tag">standing in</span>}
                      </span>

                      <StatusChip tone={SESSION_TONE[session.status]}>
                        {isUnmarked(session) ? 'not marked' : session.status}
                      </StatusChip>

                      {can.manageSessions && session.allowed_actions.includes('complete') && (
                        <Button variant="text" onClick={() => void complete(session)}>Taught</Button>
                      )}

                      {/* Written out, not left to a tooltip on a disabled
                          control that a keyboard user would never reach. */}
                      {warnings.length > 0 && (
                        <p className="class-row__warning">{warnings[0]}</p>
                      )}
                      {session.status === 'cancelled' && session.cancelled_reason && (
                        <p className="class-row__warning">Cancelled: {session.cancelled_reason}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}

      {isFiltering(filters) && sessions.length > 0 && groups.length > 0 && (
        <p className="days__note">
          Showing {visible.length} of {sessions.length} classes.
        </p>
      )}

      <SessionDrawer
        session={openSession}
        api={api}
        rooms={rooms}
        canManage={can.manageSessions}
        onClose={() => setOpenSession(null)}
        onChanged={(message) => {
          setOpenSession(null);
          toast(message);
          void load('refresh');
        }}
      />

      <SetupDrawer
        open={setupOpen}
        api={api}
        can={can}
        onClose={() => { setSetupOpen(false); void load('refresh'); }}
        onRoomsChanged={(next) => setRooms(next)}
      />
    </>
  );
}
