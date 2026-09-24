import { useCallback, useEffect, useState } from 'react';
import { Button } from '../../components/index.tsx';
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

/** Catmull-Rom → cubic-Bezier smoothing, so the line reads as one continuous curve, not connected spikes. */
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

const CHART_W = 600;
const CHART_H = 100;

/**
 * The visual form of the punch record: hours worked, one smooth curve across
 * the current month, oldest to newest — the whole month in one glance,
 * instead of a plain list of raw punch times underneath it. A gradient
 * stroke (blue → teal, `--info`/`--primary` to `--success`, all existing
 * tokens) with a soft glow and a fading fill underneath, matching the
 * dashboard's own "no screen invents a colour" rule while giving the curve
 * a premium, illustrative feel. Hovering (a real floating tooltip, not the
 * OS's native title box) gives the exact date, hours and punch times, with
 * a marker dot and guide line on the curve itself. The curve fades and
 * lifts in on mount/update rather than appearing instantly.
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
  const max = Math.max(1, ...bars.map((b) => b.hours));

  const points = bars.map((b, i) => ({
    x: daysInMonth === 1 ? CHART_W / 2 : (i / (daysInMonth - 1)) * CHART_W,
    y: CHART_H - 6 - (b.hours / max) * (CHART_H - 16),
  }));
  const linePath = smoothPath(points);
  const areaPath = points.length > 0
    ? `${linePath} L ${points[points.length - 1].x} ${CHART_H} L ${points[0].x} ${CHART_H} Z`
    : '';

  // Bars behind the curve, same scale as the line — bar height and curve
  // height agree at every day, the two views of the same number.
  const barWidth = CHART_W / daysInMonth;
  const barGap = Math.min(2, barWidth * 0.25);
  const bins = bars.map((b, i) => ({
    iso: b.iso,
    x: i * barWidth + barGap / 2,
    width: Math.max(1, barWidth - barGap),
    top: points[i].y,
  }));

  // The month's best day gets a direct value label, like a headline figure,
  // so the busiest day reads at a glance without hovering.
  const peakIndex = max > 0 ? bars.reduce((best, b, i) => (b.hours > bars[best].hours ? i : best), 0) : -1;

  const [grown, setGrown] = useState(false);
  useEffect(() => {
    setGrown(false);
    const frame = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(frame);
  }, [days]);

  const [hovered, setHovered] = useState<string | null>(null);
  const hoveredIndex = bars.findIndex((b) => b.iso === hovered);
  const hoveredBar = hoveredIndex >= 0 ? bars[hoveredIndex] : null;
  const hoveredPoint = hoveredIndex >= 0 ? points[hoveredIndex] : null;
  const todayIndex = bars.findIndex((b) => b.isToday);
  const todayPoint = todayIndex >= 0 ? points[todayIndex] : null;

  return (
    <div className="dash__chart-wrap" role="img" aria-label={`Hours worked this month, ${daysInMonth} days`}>
      <div className="dash__linechart-plot">
        <svg
          viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none"
          className={`dash__linechart-svg${grown ? ' dash__linechart-svg--grown' : ''}`}
        >
          <defs>
            <linearGradient id="dash-line-stroke" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--info)" />
              <stop offset="55%" stopColor="var(--primary)" />
              <stop offset="100%" stopColor="var(--success)" />
            </linearGradient>
            <linearGradient id="dash-line-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="dash-bar-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--viz-seq-4)" stopOpacity="0.55" />
              <stop offset="100%" stopColor="var(--viz-seq-1)" stopOpacity="0.35" />
            </linearGradient>
          </defs>
          {bins.map((bin) => bin.top >= CHART_H ? null : (
            <rect
              key={bin.iso} x={bin.x} y={bin.top} width={bin.width} height={CHART_H - bin.top}
              rx={1} fill="url(#dash-bar-fill)"
              className={`dash__linechart-bar${hovered === bin.iso ? ' dash__linechart-bar--hover' : ''}`}
            />
          ))}
          <path d={areaPath} fill="url(#dash-line-fill)" className="dash__linechart-area" />
          <path
            d={linePath} fill="none" stroke="url(#dash-line-stroke)" strokeWidth={3}
            strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"
            className="dash__linechart-line"
          />
          {hoveredPoint && (
            <line
              x1={hoveredPoint.x} y1={0} x2={hoveredPoint.x} y2={CHART_H}
              className="dash__linechart-guide" vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
        {/* Dots and the peak label are HTML, not SVG shapes: the SVG above
            stretches non-uniformly (preserveAspectRatio="none", so the curve
            always spans the full card width) which would turn circles into
            ellipses and squash text — percentage-positioned HTML avoids
            that distortion entirely. */}
        {hoveredPoint && (
          <span
            className="dash__linechart-dot"
            style={{ left: `${(hoveredPoint.x / CHART_W) * 100}%`, top: `${(hoveredPoint.y / CHART_H) * 100}%` }}
          />
        )}
        {todayPoint && !hoveredPoint && (
          <span
            className="dash__linechart-dot dash__linechart-dot--today"
            style={{ left: `${(todayPoint.x / CHART_W) * 100}%`, top: `${(todayPoint.y / CHART_H) * 100}%` }}
          />
        )}
        {peakIndex >= 0 && (
          <span
            className="dash__linechart-peak"
            style={{ left: `${(points[peakIndex].x / CHART_W) * 100}%`, top: `${(points[peakIndex].y / CHART_H) * 100}%` }}
          >
            <span className="dash__linechart-peak-dot" />
            <span className="dash__linechart-peak-label">{bars[peakIndex].hours.toFixed(1)}h</span>
          </span>
        )}
        <div className="dash__linechart-zones">
          {bars.map((b) => (
            <div
              key={b.iso}
              className={`dash__linechart-zone${hovered === b.iso ? ' dash__linechart-zone--hover' : ''}`}
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
            />
          ))}
        </div>
      </div>
      <div className="dash__linechart-labels">
        {bars.map((b) => (
          <span key={b.iso} className={b.isToday ? 'dash__linechart-label--today' : undefined}>
            {b.day === 1 || b.day % 5 === 0 || b.isToday ? b.day : ''}
          </span>
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
 * the mobile app's `RingChart` (`core/widgets/charts.dart`). Draws itself
 * in on mount by animating each arc's `stroke-dasharray` from 0. Hovering
 * an arc (or its legend row — they're linked) thickens that arc, dims the
 * rest, swaps the centre readout to that segment, and opens a small
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

  // A chunky, separated-wedge "slab" look (owner reference: an extruded 3D
  // donut) built from flat shapes, no 3D library: each visible segment gets
  // a small rounded gap from its neighbours, and is drawn twice — a darker
  // "side" copy a few px lower first, then the true-colour "top" copy on
  // top of it — so the ring reads as a set of separate, raised pucks.
  const cx = 60, cy = 60, r = 44, strokeWidth = 20;
  const circumference = 2 * Math.PI * r;
  const segments = [
    { key: 'present', value: present, color: 'var(--success)', label: 'Present' },
    { key: 'absent', value: absent, color: 'var(--error)', label: 'Absent' },
    { key: 'holiday', value: holiday, color: 'var(--info)', label: 'Holiday' },
    { key: 'remaining', value: remaining, color: 'var(--outline-strong)', label: 'Days left' },
  ];
  const visibleCount = segments.filter((s) => s.value > 0).length;
  const gap = visibleCount > 1 ? circumference * 0.02 : 0;
  let cumulative = 0;
  const arcs = segments.map((s) => {
    const dash = total > 0 ? (s.value / total) * circumference : 0;
    const fraction = total > 0 ? s.value / total : 0;
    const midAngleDeg = ((cumulative + dash / 2) / circumference) * 360 - 90;
    const midAngleRad = (midAngleDeg * Math.PI) / 180;
    const gapped = dash > 0 ? Math.max(0, dash - gap) : 0;
    const arc = {
      ...s,
      dash: gapped,
      offset: -(cumulative + gap / 2),
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
  const centerValue = active?.value ?? present;
  const centerLabel = active?.label.toLowerCase() ?? 'present';

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
          {/* The "side" of each puck: same shape, a few px lower and darkened
              (a CSS filter on the same token colour, not a new one), so the
              top layer above it reads as sitting proud of the ring. */}
          <g transform="translate(0, 3.5)" aria-hidden="true">
            {arcs.map((a) => a.value === 0 ? null : (
              <circle
                key={a.key}
                className="dash__donut-arc-side"
                cx={cx} cy={cy} r={r} fill="none" stroke={a.color} strokeWidth={strokeWidth}
                strokeDasharray={grown ? `${a.dash} ${circumference - a.dash}` : `0 ${circumference}`}
                strokeDashoffset={a.offset}
                strokeLinecap="round"
                transform={`rotate(-90 ${cx} ${cy})`}
              />
            ))}
          </g>
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
              strokeLinecap="round"
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
