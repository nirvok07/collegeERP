import type { ApiClient } from '../../lib/api.ts';

/**
 * Reads for the web dashboard. Each helper maps a server JSON envelope to the
 * shaped object the page renders, so the page never touches wire fields. The
 * endpoints are permission-gated server-side; the client only refines the shape.
 */

/** Admin numbers from `/v1/college/overview` (server: institution.read). */
export interface CollegeOverview {
  staff: number;
  students: number;
  departments: number;
  programs: number;
  sections: number;
  offerings: number;
  rooms: number;
  pendingInvitations: number;
}

/** A class session from `/me/sessions` (self-scoped, no special permission). */
export interface ClassSession {
  id: string;
  title: string;
  code: string;
  startsAt: string;
  endsAt: string;
  room: string;   // room code, '' when none
  subject: string; // component e.g. 'Lecture' 'Lab'
}

export interface WeekSessions {
  today: ClassSession[];
  /** Next 7 days, today excluded. */
  next: ClassSession[];
}

/** A course from `/me/teaching` (self-scoped, no special permission). */
export interface MyCourse {
  id: string;
  title: string;
  code: string;
  programme: string;
}

function ok<T>(r: { ok: boolean; value?: T }): T | undefined {
  return r.ok ? r.value : undefined;
}

/** Reads the college numbers for an admin dashboard (server: institution.read). */
export async function loadOverview(api: ApiClient): Promise<CollegeOverview | undefined> {
  return ok(await api.get<CollegeOverview>('/v1/college/overview'));
}

interface SessionWire {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  component: string;
  room: { code: string } | null;
  course: { code: string; title: string };
}

/** Reads the teacher's own classes for today and the next 7 days. */
export async function loadWeek(api: ApiClient): Promise<WeekSessions | undefined> {
  const result = await api.get<SessionWire[]>('/me/sessions');
  const rows = ok(result) ?? [];
  const today = `${new Date().getFullYear()}-${pad(new Date().getMonth() + 1)}-${pad(new Date().getDate())}`;
  const todayClasses: ClassSession[] = [];
  const nextClasses: ClassSession[] = [];
  for (const s of rows) {
    const start = new Date(s.starts_at);
    if (Number.isNaN(start.getTime())) continue;
    if (s.starts_at.slice(0, 10) === today) todayClasses.push(toClass(s));
    else {
      // Keep only next-week classes for the week-ahead chart.
      const since = Date.now() - 24 * 60 * 60 * 1000;
      const ahead = Date.now() + 7 * 24 * 60 * 60 * 1000;
      if (start.getTime() >= since && start.getTime() <= ahead) nextClasses.push(toClass(s));
    }
  }
  return {
    today: todayClasses.sort(byStart),
    next: nextClasses.sort(byStart),
  };
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

interface OfferingWire {
  id: string;
  course: { code: string; title: string };
  program: { name: string };
}

/** Reads the teacher's own courses. */
export async function loadCourses(api: ApiClient): Promise<MyCourse[] | undefined> {
  const rows = ok(await api.get<OfferingWire[]>('/me/teaching')) ?? [];
  return rows.map((o) => ({
    id: o.id,
    title: o.course.title,
    code: o.course.code,
    programme: o.program?.name ?? '',
  }));
}

function toClass(s: SessionWire): ClassSession {
  return {
    id: s.id,
    title: s.course.title,
    code: s.course.code,
    startsAt: s.starts_at,
    endsAt: s.ends_at,
    room: s.room?.code ?? '',
    subject: s.component,
  };
}

function byStart(a: ClassSession, b: ClassSession): number {
  return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
}