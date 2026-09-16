import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button, EmptyState, ErrorState, RefreshBar, StatusChip, useToast, type ChipTone,
} from '../../components/index.tsx';
import type { ApiClient, ApiFailure } from '../../lib/api.ts';
import { addDays, rangeLabel, startOfWeek, today } from '../../lib/dates.ts';
import { RegisterDrawer } from './RegisterDrawer.tsx';
import {
  NO_FILTERS, STATES, filterOverview, isFiltering, isOutstanding, outstandingCount, progressOf,
  type OverviewFilters, type OverviewRow, type SheetStatus,
} from './types.ts';
import './attendance.css';

type Phase = 'loading' | 'refreshing' | 'ready' | 'error';
type View = 'day' | 'week';

const SHEET_TONE: Record<SheetStatus, ChipTone> = { draft: 'warning', submitted: 'success' };
const STATUS_FILTERS: Array<SheetStatus | 'all'> = ['all', 'draft', 'submitted'];

/**
 * Attendance across a day or a week: which registers are done, which are not,
 * and which have gone past their day with nobody accounting for them.
 *
 * That last question is why this screen exists. A register nobody submitted
 * becomes impossible to reconstruct once the term moves on, so it is the one
 * thing surfaced above everything else.
 */
/*
 * There is no permissions prop. Whether this reader may mark, submit or correct
 * is stated per register by the server, which is the only place that can resolve
 * it against the class's own cohort.
 */
export function AttendancePage({ api }: { api: ApiClient }) {
  const [view, setView] = useState<View>('week');
  const [anchor, setAnchor] = useState<string>(today);
  const [rows, setRows] = useState<OverviewRow[]>([]);
  const [phase, setPhase] = useState<Phase>('loading');
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [filters, setFilters] = useState<OverviewFilters>(NO_FILTERS);
  const [openSession, setOpenSession] = useState<string | null>(null);
  const toast = useToast();

  const from = view === 'day' ? anchor : startOfWeek(anchor);
  const to = view === 'day' ? anchor : addDays(startOfWeek(anchor), 6);
  const now = today();

  const load = useCallback(async (mode: 'initial' | 'refresh') => {
    setPhase(mode === 'initial' ? 'loading' : 'refreshing');
    const result = await api.get<OverviewRow[]>(`/v1/attendance?from=${from}&to=${to}`);
    if (!result.ok) {
      setFailure(result.error);
      setPhase(mode === 'initial' ? 'error' : 'ready');
      return;
    }
    setRows(result.value);
    setFailure(null);
    setPhase('ready');
  }, [api, from, to]);

  useEffect(() => { void load('initial'); }, [load]);

  const visible = useMemo(() => filterOverview(rows, filters, now), [rows, filters, now]);
  const outstanding = useMemo(() => outstandingCount(rows, now), [rows, now]);

  if (phase === 'error') {
    return (
      <ErrorState
        message={failure?.message ?? 'Attendance could not be loaded.'}
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
          <h1 className="page__title">Attendance</h1>
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
            className="search" type="search" placeholder="Course, cohort or teacher"
            aria-label="Search attendance" value={filters.query}
            onChange={(e) => setFilters({ ...filters, query: e.currentTarget.value })}
          />
        </div>
      </div>

      <div className="filters">
        {/* The register nobody has accounted for. Everything else is browsing. */}
        {outstanding > 0 && (
          <button
            className={`filter${filters.outstandingOnly ? ' filter--on' : ''}`}
            aria-pressed={filters.outstandingOnly}
            onClick={() => setFilters({ ...filters, outstandingOnly: !filters.outstandingOnly })}
          >
            Not accounted for
            <span className="filter__count tabular">{outstanding}</span>
          </button>
        )}
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            className={`filter${filters.status === s ? ' filter--on' : ''}`}
            aria-pressed={filters.status === s}
            onClick={() => setFilters({ ...filters, status: s })}
          >
            {s === 'all' ? 'All registers' : s === 'draft' ? 'Open' : 'Submitted'}
          </button>
        ))}
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
      ) : rows.length === 0 ? (
        <EmptyState
          title="No classes in this range"
          body="Attendance follows the timetable. Schedule classes under Timetable, and their registers appear here."
        />
      ) : visible.length === 0 ? (
        <EmptyState
          title="Nothing matches"
          body={filters.outstandingOnly
            ? 'Every class that has happened has a submitted register.'
            : 'No class matches these filters.'}
          action={<Button variant="secondary" onClick={() => setFilters(NO_FILTERS)}>Clear filters</Button>}
        />
      ) : (
        <ul className="registers m-stagger">
          {visible.map((row) => (
            <li
              key={row.session_id}
              className={`register-row${isOutstanding(row, now) ? ' register-row--late' : ''}`}
            >
              <span className="register-row__when tabular">
                {row.date}
                <span className="class-row__until">{row.starts_at}</span>
              </span>

              <button className="register-row__main" onClick={() => setOpenSession(row.session_id)}>
                <span className="class-row__course">
                  <code className="entry__code">{row.course.code}</code>
                  {row.course.title}
                </span>
                <span className="class-row__context">
                  {row.program_name} · {row.section.label}
                  {row.teacher ? ` · ${row.teacher.full_name}` : ' · unstaffed'}
                </span>
              </button>

              {/* Counts, not percentages: how they count towards eligibility is
                  a rule that belongs with examinations. */}
              {row.status === 'submitted' && (
                <span className="tally tabular">
                  {STATES.filter((s) => row.counts[s] > 0)
                    .map((s) => `${row.counts[s]} ${s}`)
                    .join(' · ')}
                </span>
              )}

              <span className="register-row__progress">{progressOf(row)}</span>

              <StatusChip tone={row.session_status === 'cancelled' ? 'neutral' : SHEET_TONE[row.status]}>
                {row.session_status === 'cancelled'
                  ? 'cancelled'
                  : row.status === 'submitted' ? 'submitted' : 'open'}
              </StatusChip>
            </li>
          ))}
        </ul>
      )}

      {isFiltering(filters) && visible.length > 0 && (
        <p className="days__note">Showing {visible.length} of {rows.length} classes.</p>
      )}

      <RegisterDrawer
        sessionId={openSession}
        api={api}
        onClose={() => setOpenSession(null)}
        onChanged={(message) => {
          toast(message);
          void load('refresh');
        }}
      />
    </>
  );
}
