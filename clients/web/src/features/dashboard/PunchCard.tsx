import { useCallback, useEffect, useState } from 'react';
import { Button, StatusChip, type ChipTone } from '../../components/index.tsx';
import type { ApiClient } from '../../lib/api.ts';

interface StaffAttendanceDay {
  id: string;
  work_date: string;
  punch_in_at: string;
  punch_out_at: string | null;
}

interface CalendarHoliday {
  id: string;
  on_date: string;
  label: string;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function dateLabel(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/**
 * The visual form of the punch record: hours worked, one bar per day of the
 * current month, oldest to newest — a plain bar chart (owner: the earlier
 * gradient curve "rope jaisi line" is gone), with an hour axis down the
 * left side and the date axis underneath, instead of a plain list of raw
 * punch times. Hovering a bar (a real floating tooltip, not the OS's
 * native title box) gives the exact date, hours and punch times. Bars grow
 * in on mount/update (a `grown` flip one frame after render, so the CSS
 * `height` transition has something to animate from) rather than jumping
 * to their final height.
 */
function HoursChart({ days }: { days: StaffAttendanceDay[] }) {
  const now = new Date();
  const { year, month, daysInMonth } = monthRange(now);
  const todayIso = now.toISOString().slice(0, 10);
  const byDate = new Map(days.map((d) => [d.work_date, d]));

  const bars = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const record = byDate.get(iso);
    const hours = record?.punch_out_at
      ? (new Date(record.punch_out_at).getTime() - new Date(record.punch_in_at).getTime()) / 3_600_000
      : 0;
    bars.push({ day, iso, hours, record, isToday: iso === todayIso, isFuture: iso > todayIso });
  }
  // A fixed 0/4/8/12h scale (a full workday), not a scale that rescales
  // itself to whatever the busiest day happened to be — so a 4h day always
  // reads as "half a normal day" from one glance at the axis, month to
  // month. Overtime past 12h still fits (the bar is capped at 100%).
  const axisMax = 12;

  const [grown, setGrown] = useState(false);
  useEffect(() => {
    setGrown(false);
    const frame = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(frame);
  }, [days]);

  const [hovered, setHovered] = useState<string | null>(null);
  const hoveredBar = bars.find((b) => b.iso === hovered) ?? null;

  return (
    <div className="dash__chart-wrap" role="img" aria-label={`Hours worked this month, ${daysInMonth} days`}>
      <div className="dash__hourschart">
        <div className="dash__hourschart-axis">
          <span>12h</span>
          <span>8h</span>
          <span>4h</span>
          <span>0h</span>
        </div>
        <div className="dash__hourschart-plot">
          {/* Gridlines at the same four ticks as the axis, so the numbers
              on the left actually line up with something in the bars. */}
          <div className="dash__hourschart-grid" aria-hidden="true">
            <span /><span /><span /><span />
          </div>
          <div className="dash__chart dash__chart--month">
            {bars.map((b) => (
              <div
                key={b.iso}
                className={`dash__bar-wrap${b.isToday ? ' dash__bar-wrap--today' : ''}${
                  hovered === b.iso ? ' dash__bar-wrap--hover' : ''
                }`}
                onMouseEnter={() => setHovered(b.iso)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(b.iso)}
                onBlur={() => setHovered(null)}
                tabIndex={0}
                aria-label={
                  b.record
                    ? `${b.iso}: ${formatTime(b.record.punch_in_at)}${
                        b.record.punch_out_at ? ` – ${formatTime(b.record.punch_out_at)}, ${b.hours.toFixed(1)} hours` : ' (still open)'
                      }`
                    : `${b.iso}: no punch`
                }
              >
                {/* A day with nothing keeps a small stub (mirrors the mobile
                    app's BarChart) so it reads as "no hours", not a gap in
                    the chart. */}
                <div
                  className={`dash__bar${b.hours === 0 ? ' dash__bar--empty' : ''}`}
                  style={{ height: grown ? (b.hours === 0 ? 3 : `${Math.min(100, (b.hours / axisMax) * 100)}%`) : 0 }}
                />
              </div>
            ))}
          </div>
          {hoveredBar && (
            <div
              className="dash__chart-tip"
              style={{ left: `${((hoveredBar.day - 0.5) / daysInMonth) * 100}%` }}
            >
              <span className="dash__chart-tip-date">{dateLabel(hoveredBar.iso)}</span>
              {hoveredBar.record ? (
                <>
                  <span className="dash__chart-tip-value">
                    {hoveredBar.record.punch_out_at ? `${hoveredBar.hours.toFixed(1)} hrs worked` : 'Still punched in'}
                  </span>
                  <span className="dash__chart-tip-meta">
                    {formatTime(hoveredBar.record.punch_in_at)}
                    {hoveredBar.record.punch_out_at ? ` – ${formatTime(hoveredBar.record.punch_out_at)}` : ' – now'}
                  </span>
                </>
              ) : (
                <span className="dash__chart-tip-value">{hoveredBar.isFuture ? 'Not reached yet' : 'No punch'}</span>
              )}
            </div>
          )}
        </div>
        <div className="dash__hourschart-dates">
          {bars.map((b) => (
            <span key={b.iso} className={b.isToday ? 'dash__hourschart-dates--today' : undefined}>
              {b.day === 1 || b.day % 5 === 0 || b.isToday ? b.day : ''}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function monthRange(now: Date): { from: string; to: string; year: number; month: number; daysInMonth: number } {
  const year = now.getFullYear();
  const month = now.getMonth();
  const from = new Date(year, month, 1);
  const to = new Date(year, month + 1, 0);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to), year, month, daysInMonth: to.getDate() };
}

interface MonthCounts { present: number; absent: number; holiday: number; remaining: number }

/**
 * Classifies every day of the current month, in order, as: in the future
 * ("remaining", not yet happened), a holiday (the academic calendar,
 * CAL-1/CAL-2), present (a punch-in exists) or absent (a past working day
 * with no punch). Today counts as "absent" until punched in — same rule
 * as any other working day.
 */
function monthCounts(days: StaffAttendanceDay[], holidays: string[], now: Date): MonthCounts {
  const { year, month, daysInMonth } = monthRange(now);
  const todayIso = now.toISOString().slice(0, 10);
  const holidaySet = new Set(holidays);
  const presentSet = new Set(days.map((d) => d.work_date));
  const counts: MonthCounts = { present: 0, absent: 0, holiday: 0, remaining: 0 };
  for (let day = 1; day <= daysInMonth; day++) {
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (iso > todayIso) counts.remaining += 1;
    else if (holidaySet.has(iso)) counts.holiday += 1;
    else if (presentSet.has(iso)) counts.present += 1;
    else counts.absent += 1;
  }
  return counts;
}

/**
 * A "smart" donut: this month at a glance — present, absent, holiday and
 * days still to come — drawn as one ring, no charting library, matching
 * the mobile app's `RingChart` (`core/widgets/charts.dart`). "Smart" means
 * the centre defaults to the attendance rate (present ÷ days actually
 * reached so far) with a qualitative read (On track / Watch this / Needs
 * attention) below the legend, not just a raw present count — the number
 * that actually answers "how am I doing this month". Draws itself in on
 * mount by animating each arc's `stroke-dasharray` from 0. Hovering an arc
 * (or its legend row — they're linked) thickens that arc, dims the rest,
 * swaps the centre readout to that segment's own count, and opens a small
 * tooltip anchored on the ring at the arc's midpoint.
 */
function MonthDonut({ counts, monthLabel }: { counts: MonthCounts; monthLabel: string }) {
  const { present, absent, holiday, remaining } = counts;
  const total = present + absent + holiday + remaining;
  const [grown, setGrown] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  useEffect(() => {
    setGrown(false);
    const frame = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(frame);
  }, [present, absent, holiday, remaining]);

  // Owner: flat 2D, not the extruded 3D-puck look — kept the gloss
  // highlight and per-arc shadow (still "accha se") but the segments touch
  // cleanly again, no gap, no darkened "side" layer.
  const cx = 60, cy = 60, r = 46, strokeWidth = 16;
  const circumference = 2 * Math.PI * r;
  const segments = [
    { key: 'present', value: present, color: 'var(--success)', label: 'Present' },
    { key: 'absent', value: absent, color: 'var(--error)', label: 'Absent' },
    { key: 'holiday', value: holiday, color: 'var(--info)', label: 'Holiday' },
    { key: 'remaining', value: remaining, color: 'var(--outline-strong)', label: 'Days left' },
  ];
  let cumulative = 0;
  const arcs = segments.map((s) => {
    const dash = total > 0 ? (s.value / total) * circumference : 0;
    const fraction = total > 0 ? s.value / total : 0;
    const midAngleDeg = ((cumulative + dash / 2) / circumference) * 360 - 90;
    const midAngleRad = (midAngleDeg * Math.PI) / 180;
    const arc = {
      ...s,
      dash,
      offset: -cumulative,
      percent: Math.round(fraction * 100),
      anchor: {
        xPct: ((cx + (r + strokeWidth / 2 + 6) * Math.cos(midAngleRad)) / 120) * 100,
        yPct: ((cy + (r + strokeWidth / 2 + 6) * Math.sin(midAngleRad)) / 120) * 100,
      },
    };
    cumulative += dash;
    return arc;
  });

  const active = arcs.find((a) => a.key === hovered) ?? null;
  // "Smart": the default readout is the attendance rate (present of days
  // actually reached so far), not just a raw present count — the number
  // that actually answers "how am I doing this month", with a qualitative
  // read below it. Hovering a segment still swaps in that segment's own
  // count, same as before.
  const reached = present + absent;
  const rate = reached > 0 ? Math.round((present / reached) * 100) : null;
  const status: { label: string; tone: ChipTone } | null =
    rate === null ? null
    : rate >= 90 ? { label: 'On track', tone: 'success' }
    : rate >= 75 ? { label: 'Watch this', tone: 'warning' }
    : { label: 'Needs attention', tone: 'error' };
  const centerValue = active ? active.value : rate === null ? present : `${rate}%`;
  const centerLabel = active ? active.label.toLowerCase() : rate === null ? 'present' : 'attendance';

  return (
    <div className="dash__donut">
      <div className="dash__donut-chart">
        <svg
          viewBox="0 0 120 120" width="112" height="112"
          role="img"
          aria-label={`${monthLabel}: ${present} present, ${absent} absent, ${holiday} holiday, ${remaining} days left, of ${total} days`}
        >
          <defs>
            {/* A soft gloss, top-left, for a lightly sculpted ring rather than a flat one. */}
            <radialGradient id="dash-donut-gloss" cx="35%" cy="28%" r="65%">
              <stop offset="0%" stopColor="#fff" stopOpacity="0.35" />
              <stop offset="60%" stopColor="#fff" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--outline)" strokeWidth={strokeWidth} />
          {arcs.map((a) => a.value === 0 ? null : (
            <circle
              key={a.key}
              className={`dash__donut-arc${hovered && hovered !== a.key ? ' dash__donut-arc--dim' : ''}${
                hovered === a.key ? ' dash__donut-arc--active' : ''
              }`}
              cx={cx} cy={cy} r={r} fill="none" stroke={a.color}
              strokeWidth={hovered === a.key ? strokeWidth + 3 : strokeWidth}
              strokeDasharray={grown ? `${a.dash} ${circumference - a.dash}` : `0 ${circumference}`}
              strokeDashoffset={a.offset}
              strokeLinecap="butt"
              transform={`rotate(-90 ${cx} ${cy})`}
              onMouseEnter={() => setHovered(a.key)}
              onMouseLeave={() => setHovered(null)}
            />
          ))}
          <circle
            cx={cx} cy={cy} r={r} fill="none" stroke="url(#dash-donut-gloss)"
            strokeWidth={strokeWidth} aria-hidden="true" pointerEvents="none"
          />
          <text x={cx} y={cy - 3} textAnchor="middle" className="dash__donut-num">{centerValue}</text>
          <text x={cx} y={cy + 15} textAnchor="middle" className="dash__donut-label">{centerLabel}</text>
        </svg>
        {active && active.value > 0 && (
          <div
            className="dash__donut-tip"
            style={{ left: `${active.anchor.xPct}%`, top: `${active.anchor.yPct}%` }}
            role="status"
          >
            <span className="dash__donut-tip-dot" style={{ background: active.color }} />
            <span className="dash__donut-tip-name">{active.label}</span>
            <span className="dash__donut-tip-value">{active.value} {active.value === 1 ? 'day' : 'days'} · {active.percent}%</span>
            <span className="dash__donut-tip-meta">of {total} days in {monthLabel}</span>
          </div>
        )}
      </div>
      <div>
        <ul className="dash__donut-legend">
          {segments.map((s) => (
            <li
              key={s.key}
              className={hovered && hovered !== s.key ? 'dash__donut-legend-row--dim' : undefined}
              onMouseEnter={() => setHovered(s.key)}
              onMouseLeave={() => setHovered(null)}
            >
              <span className="dash__donut-dot" style={{ background: s.color }} />
              {s.label}: {s.value}
            </li>
          ))}
        </ul>
        {status && (
          <div className="dash__donut-status">
            <StatusChip tone={status.tone}>{status.label}</StatusChip>
            <span className="dash__donut-status-note">{rate}% present of {reached} days so far</span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * SA-ATT-1, owner feedback: punch in/out belongs on the dashboard, not one
 * click away on Profile. Self-scoped, no permission needed beyond being
 * signed in — same rule as the week/courses cards next to it. The whole
 * attendance record (history, hours chart) moved here too, off Profile
 * entirely, so there is one place for it.
 */
export function PunchCard({ api }: { api: ApiClient }) {
  const [days, setDays] = useState<StaffAttendanceDay[] | undefined>(undefined);
  const [holidays, setHolidays] = useState<CalendarHoliday[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { from, to } = monthRange(new Date());
    const [history, calendar] = await Promise.all([
      api.get<StaffAttendanceDay[]>('/v1/me/staff-attendance'),
      api.get<{ holidays: CalendarHoliday[] }>(`/v1/calendar?from=${from}&to=${to}`),
    ]);
    setDays(history.ok ? history.value : []);
    setHolidays(calendar.ok ? calendar.value.holidays : []);
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  if (days === undefined) {
    return (
      <section className="dash__band dash__punch-band" aria-label="Attendance">
        <div className="dash__band-head">
          <h2 className="dash__h">Attendance</h2>
        </div>
        <div className="skeleton" style={{ height: 64, borderRadius: 'var(--radius-card)' }} />
        <div className="skeleton" style={{ height: 160 }} />
      </section>
    );
  }

  const iso = new Date().toISOString().slice(0, 10);
  const today = days.find((d) => d.work_date === iso) ?? null;
  const open = today !== null && today.punch_out_at === null;

  async function punch() {
    setBusy(true); setError(null);
    const result = await api.post<StaffAttendanceDay>(`/v1/me/staff-attendance/${open ? 'punch-out' : 'punch-in'}`, {});
    setBusy(false);
    if (!result.ok) { setError(result.error.message); return; }
    setDays((prev) => [result.value, ...(prev ?? []).filter((d) => d.id !== result.value.id)]);
  }

  return (
    <section className="dash__band dash__punch-band" aria-label="Attendance">
      <div className="dash__band-head">
        <h2 className="dash__h">Attendance</h2>
      </div>
      <div className="dash__punch">
        <div>
          <p className="dash__punch-status">
            {today === null
              ? 'Not punched in yet'
              : open
                ? `Punched in at ${formatTime(today.punch_in_at)}`
                : `Punched out at ${formatTime(today.punch_out_at!)}`}
          </p>
          {error && <p className="dash__punch-error" role="alert">{error}</p>}
        </div>
        <span className="dash__punch-btn">
          <Button variant="primary" disabled={busy || (today !== null && !open)} onClick={() => void punch()}>
            {busy ? 'Please wait…' : today !== null && !open ? 'Done' : open ? 'Punch out' : 'Punch in'}
          </Button>
        </span>
      </div>
      <div className="dash__punch-detail">
        <div>
          <h3 className="dash__sub">Hours worked</h3>
          <HoursChart days={days} />
        </div>
        <div>
          <h3 className="dash__sub">This month</h3>
          <MonthDonut
            counts={monthCounts(days, holidays.map((h) => h.on_date), new Date())}
            monthLabel={new Date().toLocaleDateString([], { month: 'long', year: 'numeric' })}
          />
        </div>
      </div>
    </section>
  );
}
