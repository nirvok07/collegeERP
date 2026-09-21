import { useEffect, useState, type CSSProperties } from 'react';
import { Button, ErrorState, StatusChip } from '../../components/index.tsx';
import type { ApiClient, ApiFailure } from '../../lib/api.ts';
import { useShellNav } from '../shell/AppShell.tsx';
import { MODULE_ICONS } from '../shell/icons.tsx';
import { loadCourses, loadOverview, loadWeek, type CollegeOverview, type MyCourse, type WeekSessions } from './dashboardData.ts';
import './dashboard.css';

/**
 * The web dashboard landing (WID-2), mirroring the mobile app's dashboard-first
 * home. The owner asked why the web console "isn't arranged well, unlike
 * mobile"; the root cause found during exploration is that the web had no home
 * landing at all — after sign-in the shell landed on the first nav tab (People).
 *
 * This page stays behind the same server permissions the shell already resolves
 * (CLAUDE.md §19): the numbers and tiles render only for what the actor may
 * read, and the server data endpoints are themselves permission-gated.
 */
export function DashboardPage({
  permissions, api,
}: {
  permissions: Set<string> | null;
  api: ApiClient;
}) {
  const [overview, setOverview] = useState<CollegeOverview | undefined>();
  const [week, setWeek] = useState<WeekSessions | undefined>();
  const [courses, setCourses] = useState<MyCourse[] | undefined>();
  const [failure, setFailure] = useState<ApiFailure | null>(null);

  const canReadCollege = permissions?.has('institution.read') ?? false;
  const canReadSessions = permissions?.has('session.read') ?? false;

  // The two read groups are independent: an admin reads the college overview, a
  // teacher reads their own sessions and courses (self-scoped, so no special
  // permission is required beyond being signed in). Loading decision is made
  // here so a person with neither still gets a home rather than an error.
  useEffect(() => {
    const jobs: Promise<unknown>[] = [];
    setFailure(null);
    if (canReadCollege) jobs.push(loadOverview(api).then(setOverview).catch(() => undefined));
    if (canReadSessions) {
      jobs.push(loadWeek(api).then(setWeek).catch(() => undefined));
      jobs.push(loadCourses(api).then(setCourses).catch(() => undefined));
    }
    void Promise.all(jobs).catch(() => setFailure({
      code: 'NETWORK', message: 'Could not load your dashboard. Check your connection and try again.',
    }));
  }, [api, canReadCollege, canReadSessions]);

  const tiles = buildTiles(permissions);

  return (
    <>
      <div className="page__head">
        <div>
          <h1 className="page__title">Dashboard</h1>
          <p className="page__sub">What's happening across your college, at a glance.</p>
        </div>
        {failure && !overview && !week && (
          <Button variant="text" onClick={() => window.location.reload()}>Retry</Button>
        )}
      </div>
      <DashboardBody
        overview={overview}
        week={week}
        courses={courses}
        tiles={tiles}
        failure={failure}
        canReadCollege={canReadCollege}
        canReadSessions={canReadSessions}
      />
    </>
  );
}

function DashboardBody({
  overview, week, courses, tiles, failure, canReadCollege, canReadSessions,
}: {
  overview: CollegeOverview | undefined;
  week: WeekSessions | undefined;
  courses: MyCourse[] | undefined;
  tiles: Tile[];
  failure: ApiFailure | null;
  canReadCollege: boolean;
  canReadSessions: boolean;
}) {
  if (failure && !overview && !week) {
    return <ErrorState message={failure.message} onRetry={() => window.location.reload()} />;
  }
  const loaded =
    (!canReadCollege || overview !== undefined) &&
    (!canReadSessions || (week !== undefined && courses !== undefined));
  if (!loaded) return <DashboardSkeleton />;

  return (
    <div className="dash m-stagger">
      {canReadCollege && overview && <CollegeStatBand overview={overview} />}
      {canReadSessions && week && <TeacherPanel week={week} courses={courses ?? []} />}
      {tiles.length > 0 && <TileGrid tiles={tiles} />}
      {tiles.length === 0 && <NoAccessCard />}
    </div>
  );
}

/** Admin hero card: the college's headline numbers. */
function CollegeStatBand({ overview }: { overview: CollegeOverview }) {
  const pending = overview.pendingInvitations;
  return (
    <section className="dash__band" aria-label="Your college">
      <div className="dash__band-head">
        <h2 className="dash__h">Your college</h2>
        {pending > 0 && (
          <StatusChip tone="warning">{pending} {pending === 1 ? 'person has' : 'people have'} not signed in yet</StatusChip>
        )}
      </div>
      <div className="dash__stats">
        <Stat label="Staff" value={overview.staff} />
        <Stat label="Students" value={overview.students} />
        <Stat label="Departments" value={overview.departments} />
        <span className="dash__stat-divider" aria-hidden="true" />
        <Stat label="Programs" value={overview.programs} />
        <Stat label="Sections" value={overview.sections} />
        <Stat label="Course offerings" value={overview.offerings} />
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="dash__stat">
      <span className="dash__stat-value tabular">{value}</span>
      <span className="dash__stat-label">{label}</span>
    </div>
  );
}

/** Teacher panel: today's classes, next week ahead, my courses. */
function TeacherPanel({ week, courses }: { week: WeekSessions; courses: MyCourse[] }) {
  return (
    <section className="dash__teacher" aria-label="Your teaching">
      <div className="dash__band-head">
        <h2 className="dash__h">This week</h2>
      </div>
      <div className="dash__cols">
        <TodayList today={week.today} />
        <WeekAhead next={week.next} />
        <CourseList courses={courses} />
      </div>
    </section>
  );
}

function TodayList({ today }: { today: WeekSessions['today'] }) {
  return (
    <div className="dash__col">
      <h3 className="dash__sub">Today</h3>
      {today.length === 0 ? (
        <p className="dash__muted">No classes today.</p>
      ) : (
        <ul className="dash__list">
          {today.map((c) => (
            <li key={c.id} className="dash__item">
              <span className="dash__item-time tabular">{time(c.startsAt)}</span>
              <span className="dash__item-body">
                <span className="dash__item-title">{c.title} <span className="dash__item-code">{c.code}</span></span>
                {c.room && <span className="dash__item-meta">{c.room} · {c.subject}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function WeekAhead({ next }: { next: WeekSessions['next'] }) {
  // Aggregate the next-week classes by day for a compact sequential bar chart.
  const byDay = new Map<string, number>();
  for (const c of next) {
    const day = weekday(new Date(c.startsAt));
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const max = Math.max(1, ...byDay.values());
  return (
    <div className="dash__col">
      <h3 className="dash__sub">Week ahead</h3>
      {next.length === 0 ? (
        <p className="dash__muted">Nothing scheduled for the next 7 days.</p>
      ) : (
        <div className="dash__chart" role="img" aria-label={`Classes per weekday, up to ${max} on your busiest day`}>
          {days.map((d) => {
            const count = byDay.get(d) ?? 0;
            return (
              <div key={d} className="dash__bar-wrap" title={`${d}: ${count}`}>
                <div className="dash__bar" style={{ height: `${(count / max) * 100}%` }} />
                <span className="dash__bar-day">{d}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CourseList({ courses }: { courses: MyCourse[] }) {
  return (
    <div className="dash__col">
      <h3 className="dash__sub">My courses</h3>
      {courses.length === 0 ? (
        <p className="dash__muted">You are not teaching any courses this term.</p>
      ) : (
        <ul className="dash__list">
          {courses.map((c) => (
            <li key={c.id} className="dash__item">
              <span className="dash__item-body">
                <span className="dash__item-title">{c.title} <span className="dash__item-code">{c.code}</span></span>
                {c.programme && <span className="dash__item-meta">{c.programme}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---- Module grid -------------------------------------------------------- */

interface Tile {
  key: string;
  label: string;
  hint: string;
}

/**
 * The permission→section gate mirrors `sectionsFor()` in App.tsx exactly, so a
 * tile only ever appears when the section it opens is actually present. Keeping
 * the two lists in one place would couple the shell to a screen; instead this is
 * the one screen that lists the gates, deliberately matching the shell.
 */
function buildTiles(permissions: Set<string> | null): Tile[] {
  const p = permissions;
  const tiles: Tile[] = [];
  const t = (key: string, label: string, hint: string) => tiles.push({ key, label, hint });
  if (p?.has('person.read')) {
    t('people', 'People', 'Staff, invitations and access');
    t('organisation', 'Organisation', 'Campuses, departments, curriculum');
    t('curriculum', 'Curriculum', 'Programs, courses, structure');
  }
  if (p?.has('institution.read')) t('college', 'College', 'Name, look and onboarding');
  if (p?.has('section.read')) t('teaching', 'Teaching', 'Sections, offerings, instructing');
  if (p?.has('student.read')) t('students', 'Students', 'Enrolment and records');
  if (p?.has('session.read')) t('timetable', 'Timetable', 'Sessions, rooms, calendar');
  if (p?.has('attendance.read')) t('attendance', 'Attendance', 'Registers and marking');
  if (p?.has('assessment.verify')) t('assessment', 'Assessment', 'Verification queue');
  return tiles;
}

/** Exported for tests: the gate→section list is a contract worth pinning. */
export function dashboardTileKeys(permissions: Set<string> | null): string[] {
  return buildTiles(permissions).map((x) => x.key);
}

function TileGrid({ tiles }: { tiles: Tile[] }) {
  const go = useShellNav();
  return (
    <section className="dash__grid-wrap" aria-label="Modules">
      <h2 className="dash__h">Modules<span className="dash__count">{tiles.length}</span></h2>
      <div className="dash__grid">
        {tiles.map((tile, i) => (
          <button
            key={tile.key}
            className="dash__tile"
            onClick={() => go(tile.key)}
            aria-label={`Open ${tile.label}`}
            style={{ '--tile-i': i } as CSSProperties}
          >
            <span className="dash__tile-icon" aria-hidden="true">{MODULE_ICONS[tile.key]}</span>
            <span className="dash__tile-body">
              <span className="dash__tile-title">{tile.label}</span>
              <span className="dash__tile-hint">{tile.hint}</span>
            </span>
            <span className="dash__tile-chevron" aria-hidden="true">›</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function NoAccessCard() {
  return (
    <section className="state" style={{ margin: 'var(--space-xl) 0' }}>
      <h2 className="state__title">No access yet</h2>
      <p className="state__body">
        Your account is active, but nobody has given you access to anything yet.
        Ask your college administrator to grant you a role.
      </p>
    </section>
  );
}

function DashboardSkeleton() {
  return (
    <div className="dash">
      <div className="skeleton" style={{ height: 8, width: 140 }} />
      <div className="dash__stats dash__stats--skeleton">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div className="skeleton" key={i} style={{ height: 44, marginBlock: 8 }} />
        ))}
      </div>
      <div className="dash__grid dash__grid--skeleton">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div className="skeleton" key={i} style={{ height: 'var(--nd-row-min-height)', borderRadius: 'var(--nd-card-radius)' }} />
        ))}
      </div>
    </div>
  );
}

/* ---- small helpers ------------------------------------------------------ */

function time(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ap = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return `${h}:${m}${ap}`;
}

function weekday(d: Date): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[d.getDay()];
}