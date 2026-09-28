/**
 * Development only: builds runbook 09's complete college
 * (docs/runbook/09-example-iit-delhi.md) inside the college you sign in to,
 * through the public API only, as its College Administrator.
 *
 * Sign-in comes from server/.seed-login.local.json (git-ignored):
 *   { "institution_code": "...", "identifier": "admin email", "password": "..." }
 *
 * Re-runnable: every step first finds what already exists (by code, name,
 * label, enrolment number or email) and reuses it, so a second run creates
 * nothing new and an interrupted run simply continues.
 *
 * Teacher invitation tokens and one student's activation code are written to
 * server/.college-tree.local.json (git-ignored, owner-only). Nothing secret is
 * printed.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config/config.ts';

const config = loadConfig();
if (config.NODE_ENV === 'production') throw new Error('Refusing to seed example data in production.');

const API = process.env.SEED_API ?? 'http://localhost:3000';
const LOGIN = fileURLToPath(new URL('../.seed-login.local.json', import.meta.url));
const OUT = fileURLToPath(new URL('../.college-tree.local.json', import.meta.url));

/* ----------------------------------------------------------------- the tree */

const DEPARTMENTS = [
  ['Department of Computer Science and Engineering', 'cse'],
  ['Department of Electrical Engineering', 'ee'],
  ['Department of Mechanical Engineering', 'mech'],
  ['Department of Mathematics', 'maths'],
  ['Department of Physics', 'physics'],
] as const;

const PROGRAMS = [
  ['B.Tech Computer Science and Engineering', 'btech-cse', 'cse', 'B.Tech', 4],
  ['B.Tech Electrical Engineering', 'btech-ee', 'ee', 'B.Tech', 4],
  ['M.Tech Computer Science and Engineering', 'mtech-cse', 'cse', 'M.Tech', 2],
  ['M.Sc Mathematics', 'msc-maths', 'maths', 'M.Sc', 2],
] as const;

const YEAR = { name: '2026-27', starts_on: '2026-07-01', ends_on: '2027-06-30' };
const TERMS = [
  [1, 'Semester I', '2026-07-20', '2026-11-30'],
  [2, 'Semester II', '2027-01-04', '2027-05-10'],
  [3, 'Summer term', '2027-05-17', '2027-06-30'],
] as const;

const COURSES = [
  ['MTL100', 'Calculus'],
  ['MTL101', 'Linear Algebra and Differential Equations'],
  ['PYL101', 'Electromagnetics'],
  ['CML101', 'Introduction to Chemistry'],
  ['APL100', 'Engineering Mechanics'],
  ['COL100', 'Introduction to Computer Science'],
  ['ELL101', 'Introduction to Electrical Engineering'],
  ['COL106', 'Data Structures and Algorithms'],
  ['COL202', 'Discrete Mathematical Structures'],
  ['ELL201', 'Digital Electronics'],
  ['COL216', 'Computer Architecture'],
  ['COL226', 'Programming Languages'],
  ['COL331', 'Operating Systems'],
  ['COL334', 'Computer Networks'],
  ['COL351', 'Analysis and Design of Algorithms'],
  ['COL362', 'Database Management Systems'],
  ['COL333', 'Principles of Artificial Intelligence'],
  ['COL380', 'Introduction to Parallel and Distributed Programming'],
  ['COL772', 'Natural Language Processing'],
  ['COD492', 'B.Tech Project Part 1'],
  ['COD494', 'B.Tech Project Part 2'],
] as const;

type Requirement = 'core' | 'elective';
const REGULATION: [term: number, code: string, credits: number, requirement: Requirement, group?: string][] = [
  [1, 'MTL100', 4, 'core'], [1, 'PYL101', 4, 'core'], [1, 'COL100', 4, 'core'], [1, 'APL100', 4, 'core'],
  [2, 'MTL101', 4, 'core'], [2, 'CML101', 4, 'core'], [2, 'ELL101', 4, 'core'],
  [3, 'COL106', 5, 'core'], [3, 'COL202', 4, 'core'], [3, 'ELL201', 4, 'core'],
  [4, 'COL216', 4, 'core'], [4, 'COL226', 4, 'core'],
  [5, 'COL331', 4, 'core'], [5, 'COL334', 4, 'core'], [5, 'COL351', 4, 'core'],
  [6, 'COL362', 4, 'core'], [6, 'COL333', 4, 'core'], [6, 'COL380', 3, 'elective', 'Systems'],
  [7, 'COL772', 3, 'elective', 'AI'], [7, 'COD492', 4, 'core'],
  [8, 'COD494', 8, 'core'],
];

type RoomKind = 'classroom' | 'lab' | 'seminar' | 'auditorium';
const ROOMS: [campus: 'main' | 'sonipat', code: string, name: string, kind: RoomKind, seats: number][] = [
  ['main', 'LH-108', 'Lecture Hall 108, Lecture Hall Complex', 'classroom', 250],
  ['main', 'LH-121', 'Lecture Hall 121, Lecture Hall Complex', 'classroom', 120],
  ['main', 'LH-310', 'Lecture Hall 310', 'classroom', 60],
  ['main', 'CSE-LAB-1', 'Computer Lab 1, Bharti Building', 'lab', 60],
  ['main', 'BHARTI-201', 'Seminar Room 201, Bharti Building', 'seminar', 40],
  ['main', 'DOGRA-HALL', 'Dogra Hall', 'auditorium', 600],
  ['sonipat', 'SNP-LH-01', 'Lecture Hall 1, Sonipat', 'classroom', 100],
];

// Emails use the placeholder domain the runbook uses; every person is invented.
const TEACHERS = [
  ['ananya', 'Dr. Ananya Rao', 'ananya.rao@iitd.example', 'cse', 'hod'],
  ['vikram', 'Dr. Vikram Sethi', 'vikram.sethi@iitd.example', 'cse', 'faculty'],
  ['neha', 'Dr. Neha Kapoor', 'neha.kapoor@iitd.example', 'cse', 'faculty'],
  ['meera', 'Dr. Meera Iyer', 'meera.iyer@iitd.example', 'maths', 'faculty'],
  ['rohan', 'Dr. Rohan Das', 'rohan.das@iitd.example', 'physics', 'faculty'],
  // Every department has at least one teacher, even those this script does
  // not yet assign a course: onboarding still creates the person and account.
  ['sanjay', 'Dr. Sanjay Malhotra', 'sanjay.malhotra@iitd.example', 'ee', 'faculty'],
  ['priya', 'Dr. Priya Nambiar', 'priya.nambiar@iitd.example', 'mech', 'faculty'],
] as const;
type TeacherKey = (typeof TEACHERS)[number][0];

const ADMITTED_ON = '2026-07-20';
const STUDENTS = [
  ['2026CS10001', 'Aarav Sharma', 'A'],
  ['2026CS10002', 'Diya Patel', 'A'],
  ['2026CS10003', 'Kabir Singh', 'A'],
  ['2026CS10004', 'Ishita Verma', 'A'],
  ['2026CS10005', 'Rehan Khan', 'B'],
  ['2026CS10006', 'Sanya Gupta', 'B'],
  ['2026CS10007', 'Aditya Menon', 'B'],
  ['2026CS10008', 'Tara Joshi', 'B'],
  ['2026CS10009', 'Vivaan Chatterjee', 'A'],
  ['2026CS10010', 'Ananya Bhatt', 'B'],
] as const;

type Component = 'lecture' | 'lab';
type Slot = [day: number, starts: string, ends: string, room: string];
type Taught = {
  course: string; component: Component;
  teachers: [TeacherKey, 'lead' | 'co'][];
  slots: Slot[];
};

// Section A is the runbook's timetable. Section B is not given one there; its
// times are chosen so no room or teacher is ever in two places (generation
// refuses a clash), with teachers swapped as the runbook suggests.
const TAUGHT: Record<'A' | 'B', Taught[]> = {
  A: [
    { course: 'MTL100', component: 'lecture', teachers: [['meera', 'lead']],
      slots: [[1, '08:00', '09:00', 'LH-108'], [3, '08:00', '09:00', 'LH-108'], [5, '08:00', '09:00', 'LH-108']] },
    { course: 'PYL101', component: 'lecture', teachers: [['rohan', 'lead']],
      slots: [[1, '11:00', '12:00', 'LH-310'], [4, '11:00', '12:00', 'LH-310']] },
    { course: 'COL100', component: 'lecture', teachers: [['vikram', 'lead']],
      slots: [[2, '09:30', '11:00', 'LH-121'], [4, '09:30', '11:00', 'LH-121']] },
    { course: 'COL100', component: 'lab', teachers: [['neha', 'lead']],
      slots: [[3, '14:00', '17:00', 'CSE-LAB-1']] },
    { course: 'APL100', component: 'lecture', teachers: [['vikram', 'lead'], ['neha', 'co']],
      slots: [[2, '12:00', '13:00', 'LH-121'], [5, '12:00', '13:00', 'LH-121']] },
  ],
  B: [
    { course: 'MTL100', component: 'lecture', teachers: [['meera', 'lead']],
      slots: [[1, '10:00', '11:00', 'LH-310'], [3, '10:00', '11:00', 'LH-310'], [5, '10:00', '11:00', 'LH-310']] },
    { course: 'PYL101', component: 'lecture', teachers: [['rohan', 'lead']],
      slots: [[2, '14:00', '15:00', 'LH-310'], [5, '14:00', '15:00', 'LH-310']] },
    { course: 'COL100', component: 'lecture', teachers: [['neha', 'lead']],
      slots: [[1, '14:00', '15:30', 'LH-121'], [4, '14:00', '15:30', 'LH-121']] },
    { course: 'COL100', component: 'lab', teachers: [['vikram', 'lead']],
      slots: [[5, '14:00', '17:00', 'CSE-LAB-1']] },
    { course: 'APL100', component: 'lecture', teachers: [['vikram', 'lead']],
      slots: [[3, '10:00', '11:00', 'LH-121'], [4, '12:00', '13:00', 'LH-121']] },
  ],
};

const HOLIDAYS = [
  ['2026-08-15', 'Independence Day'],
  ['2026-10-02', 'Gandhi Jayanti'],
  ['2026-10-20', 'Dussehra'],
  ['2026-11-08', 'Diwali'],
  ['2026-11-24', 'Guru Nanak Jayanti'],
  ['2027-01-26', 'Republic Day'],
] as const;

/* --------------------------------------------------------------- plumbing */

class ApiError extends Error {
  constructor(readonly status: number, readonly code: string | undefined, message: string) {
    super(message);
  }
}

let token = '';

async function call<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}/v1${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { data?: T; error?: { code: string; message: string } };
  if (!res.ok) {
    throw new ApiError(res.status, json.error?.code, `${method} ${path} → ${res.status} ${json.error?.code}: ${json.error?.message}`);
  }
  return json.data as T;
}

const tally = { created: 0, kept: 0 };

/** Reuses what exists, else creates it; says which. */
async function ensure<T>(what: string, found: T | undefined, create: () => Promise<T>): Promise<T> {
  if (found !== undefined) {
    tally.kept++;
    console.log(`  = ${what}`);
    return found;
  }
  const made = await create();
  tally.created++;
  console.log(`  + ${what}`);
  return made;
}

function step(title: string) {
  console.log(`\n${title}`);
}

type Id = { id: string };
const byId = <T extends Id>(rows: T[]) => new Map(rows.map((r) => [r.id, r]));

/** A lookup an earlier step filled; stops loudly rather than send undefined. */
function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`Internal: ${what} was not set up by an earlier step.`);
  return value;
}

/* ------------------------------------------------------------------ sign in */

if (!existsSync(LOGIN)) throw new Error('Put your sign-in in server/.seed-login.local.json first.');
const login = JSON.parse(readFileSync(LOGIN, 'utf8')) as { institution_code: string; identifier: string; password: string };
if (Object.values(login).some((v) => typeof v !== 'string' || v.startsWith('PUT-YOUR-'))) {
  throw new Error('server/.seed-login.local.json still has a placeholder in it.');
}
const college = login.institution_code.trim().toLowerCase();
token = (await call<{ access_token: string }>('POST', '/auth/login', {
  institution_code: college,
  identifier: login.identifier.trim().toLowerCase(),
  password: login.password,
})).access_token;
console.log(`Signed in to ${college} as its administrator.`);

const saved = (existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {}) as {
  teachers?: Record<string, { name: string; email: string; invitation_token: string; expires_at: string }>;
  student_access?: Record<string, { code: string; expires_at: string; login_identifier: string }>;
};
saved.teachers ??= {};
saved.student_access ??= {};

/* ------------------------------------------------------------ 1. organisation */

step('1. Organisation');
const campuses = await call<(Id & { code: string; name: string; is_default: boolean; fence: { latitude: number; longitude: number; radius_m: number } | null })[]>('GET', '/campuses');
// A college starts with one campus; keep it as the main campus rather than add a second.
const main = await ensure(
  'main campus',
  campuses.find((c) => c.code === 'hauz-khas') ?? campuses.find((c) => c.is_default) ?? campuses[0],
  () => call('POST', '/campuses', { name: 'Hauz Khas main campus', code: 'hauz-khas' }),
);
const sonipat = await ensure(
  'campus sonipat',
  campuses.find((c) => c.code === 'sonipat'),
  () => call('POST', '/campuses', { name: 'Sonipat campus', code: 'sonipat' }),
);
if (!main.fence || main.fence.latitude !== 28.5456 || main.fence.longitude !== 77.1926 || main.fence.radius_m !== 200) {
  await call('PATCH', `/campuses/${main.id}/fence`, { latitude: 28.5456, longitude: 77.1926, radius_m: 200 });
  console.log('  + main campus attendance fence');
} else {
  console.log('  = main campus attendance fence');
}

const departments = await call<(Id & { code: string })[]>('GET', '/departments');
const dept: Record<string, Id> = {};
for (const [name, code] of DEPARTMENTS) {
  dept[code] = await ensure(`department ${code}`, departments.find((d) => d.code === code),
    () => call('POST', '/departments', { campus_id: main.id, name, code }));
}

/* ---------------------------------------------------------------- 2. programs */

step('2. Programs');
const programs = await call<(Id & { code: string })[]>('GET', '/programs');
const program: Record<string, Id> = {};
for (const [name, code, department, award, years] of PROGRAMS) {
  program[code] = await ensure(`program ${code}`, programs.find((p) => p.code === code),
    () => call('POST', '/programs', {
      department_id: must(dept[department], department).id, name, code, award, duration_years: years, term_type: 'semester',
    }));
}
const btech = must(program['btech-cse'], 'btech-cse');

/* ---------------------------------------------------------------- 3. calendar */

step('3. Calendar');
const years = await call<(Id & { name: string; ends_on: string })[]>('GET', '/academic-years');
const yearRow = years.find((y) => y.name === YEAR.name);
const year = await ensure(`academic year ${YEAR.name}`, yearRow,
  () => call('POST', '/academic-years', { ...YEAR, make_current: true }));
await ensure(
  'prior academic year 2025-26',
  years.find((y) => y.name === '2025-26'),
  () => call('POST', '/academic-years', {
    name: '2025-26', starts_on: '2025-07-01', ends_on: '2026-06-30', make_current: false,
  }),
);
const terms = await call<(Id & { sequence: number; name: string })[]>('GET', `/terms?academic_year_id=${year.id}`);
const term: Record<string, Id> = {};
for (const [sequence, name, starts_on, ends_on] of TERMS) {
  // Matched by sequence, which is what the server enforces uniqueness on
  // within a year; an existing college may already name its terms differently
  // ("Semester 1" rather than "Semester I"), and that existing term is kept.
  const existing = terms.find((t) => t.sequence === sequence);
  if (!existing && yearRow && ends_on > yearRow.ends_on) {
    console.log(`  · skipped term ${sequence} ${name}: the year already ends ${yearRow.ends_on}, no room left`);
    continue;
  }
  term[name] = await ensure(
    existing ? `term ${sequence} (kept as "${existing.name}")` : `term ${name}`,
    existing,
    () => call('POST', '/terms', { academic_year_id: year.id, sequence, name, starts_on, ends_on }),
  );
}
const semesterOne = must(term['Semester I'], 'Semester I');

/* ------------------------------------------------------------ 4. course catalogue */

step('4. Course catalogue');
const courses = await call<(Id & { code: string })[]>('GET', '/courses');
const course: Record<string, Id> = {};
for (const [code, title] of COURSES) {
  course[code] = await ensure(`course ${code}`, courses.find((c) => c.code === code),
    () => call('POST', '/courses', { code, title }));
}

/* ---------------------------------------------------------------- 5. regulation */

step('5. Regulation 2026 for B.Tech CSE');
const versions = await call<(Id & { regulation_year: number; status: string })[]>(
  'GET', `/curriculum-versions?program_id=${btech.id}`,
);
const version = await ensure('regulation 2026', versions.find((v) => v.regulation_year === 2026),
  () => call('POST', '/curriculum-versions', {
    program_id: btech.id, regulation_year: 2026, title: 'Regulation 2026', total_terms: 8,
  }));
const current = await call<{ status: string; terms: { term_number: number; courses: { code: string }[] }[] }>(
  'GET', `/curriculum-versions/${version.id}`,
);
if (current.status === 'draft') {
  const present = new Set(current.terms.flatMap((t) => t.courses.map((c) => `${t.term_number}:${c.code}`)));
  for (const [termNumber, code, credits, requirement, group] of REGULATION) {
    await ensure(`term ${termNumber} ${code}`, present.has(`${termNumber}:${code}`) ? true : undefined,
      () => call('POST', `/curriculum-versions/${version.id}/entries`, {
        course_id: must(course[code], code).id, term_number: termNumber, credits, requirement,
        ...(group ? { elective_group: group } : {}),
      }));
  }
  await call('POST', `/curriculum-versions/${version.id}/publish`, {});
  tally.created++;
  console.log('  + published');
} else {
  tally.kept++;
  console.log(`  = already ${current.status}`);
}

/* -------------------------------------------------------------------- 6. rooms */

step('6. Rooms');
const rooms = await call<(Id & { code: string })[]>('GET', '/rooms');
const room: Record<string, Id> = {};
for (const [campus, code, name, kind, capacity] of ROOMS) {
  room[code] = await ensure(`room ${code}`, rooms.find((r) => r.code === code),
    () => call('POST', '/rooms', {
      campus_id: (campus === 'main' ? main : sonipat).id, code, name, kind, capacity,
    }));
}

/* ----------------------------------------------------------------- 7. teachers */

step('7. Teachers');
const roles = await call<{ key: string; name: string; allowed_scope_types: string[] }[]>('GET', '/roles');
const roleFor = (wanted: 'hod' | 'faculty') => {
  const role = wanted === 'hod'
    ? roles.find((r) => r.key === 'hod' || /head of department/i.test(r.name))
    : roles.find((r) => r.key === 'faculty');
  if (!role) throw new Error(`No "${wanted}" role in this college's role list.`);
  return role;
};
const people = await call<{ person_id: string; email: string | null }[]>('GET', '/people?type=staff&limit=500');
const teacher: Record<string, string> = {};
for (const [key, name, email, department, wanted] of TEACHERS) {
  const role = roleFor(wanted);
  // Scoped to their department where the role allows it, as the runbook grants it.
  const scope = role.allowed_scope_types.includes('department')
    ? { scope_type: 'department', scope_ref_id: must(dept[department], department).id }
    : { scope_type: 'institution', scope_ref_id: null };
  const existing = people.find((p) => p.email?.toLowerCase() === email);
  teacher[key] = (await ensure(`${name} (${role.key})`, existing, async () => {
    const invited = await call<{ person_id: string; invitation: { token: string; expires_at: string } }>(
      'POST', '/people', { full_name: name, email, person_type: 'staff', role: { role_key: role.key, ...scope } },
    );
    saved.teachers![key] = { name, email, invitation_token: invited.invitation.token, expires_at: invited.invitation.expires_at };
    return { person_id: invited.person_id, email };
  })).person_id;
}
const morePeople = await call<{ person_id: string; email: string | null }[]>('GET', '/people?type=staff&limit=500');
const facultyRole = roleFor('faculty');
for (let i = 1; i <= 31; i++) {
  const department = DEPARTMENTS[(i - 1) % DEPARTMENTS.length]![1];
  const email = `faculty${i}@iitd.example`;
  if (morePeople.some((p) => p.email?.toLowerCase() === email)) continue;
  await call('POST', '/people', {
    full_name: `Seed Faculty ${i}`, email, person_type: 'staff',
    role: { role_key: facultyRole.key, scope_type: 'department', scope_ref_id: must(dept[department], department).id },
  });
}
for (const [roleKey, name, email] of [
  ['accountant', 'Seed Accountant', 'accountant@iitd.example'],
  ['cashier', 'Seed Cashier', 'cashier@iitd.example'],
] as const) {
  if (!roles.some((r) => r.key === roleKey) || morePeople.some((p) => p.email?.toLowerCase() === email)) continue;
  await call('POST', '/people', {
    full_name: name, email, person_type: 'staff',
    role: { role_key: roleKey, scope_type: 'institution', scope_ref_id: null },
  });
}

/* ----------------------------------------------------------------- 8. students */

step('8. Students (B.Tech CSE, admitted 20 Jul 2026)');
type StudentRow = Id & { enrolment_number: string; section: { id: string } | null };
const students = await call<StudentRow[]>('GET', `/students?program_id=${btech.id}&limit=500`);
const student: Record<string, StudentRow> = {};
for (const [number, name] of STUDENTS) {
  student[number] = await ensure(`student ${number}`, students.find((s) => s.enrolment_number === number),
    async () => ({
      ...(await call<Id>('POST', '/students', {
        full_name: name, enrolment_number: number, program_id: btech.id, admitted_on: ADMITTED_ON,
      })),
      enrolment_number: number,
      section: null,
    }));
}
const mtechStudents = await call<StudentRow[]>('GET', `/students?program_id=${program['mtech-cse'].id}&limit=500`);
const extraBtech: StudentRow[] = [];
for (let i = 11; i <= 360; i++) {
  const number = `2026CS${String(i).padStart(5, '0')}`;
  const existing = students.find((s) => s.enrolment_number === number);
  const made = existing ?? await call<StudentRow>('POST', '/students', {
    full_name: `Seed Student ${i}`, email: `${number.toLowerCase()}@iitd.example`,
    enrolment_number: number, program_id: btech.id, admitted_on: ADMITTED_ON,
  });
  extraBtech.push(made);
}
for (let i = 1; i <= 40; i++) {
  const number = `2026MT${String(i).padStart(5, '0')}`;
  if (mtechStudents.some((s) => s.enrolment_number === number)) continue;
  await call('POST', '/students', {
    full_name: `Seed MTech Student ${i}`, email: `${number.toLowerCase()}@iitd.example`,
    enrolment_number: number, program_id: program['mtech-cse'].id, admitted_on: ADMITTED_ON,
  });
}

/* ------------------------------------------------------------------ 9. sections */

step('9. Sections for Semester I');
const sections = await call<(Id & { label: string; status: string; program: Id; term: Id })[]>(
  'GET', `/sections?term_id=${semesterOne.id}&program_id=${btech.id}`,
);
const section: Record<string, Id> = {};
for (const label of ['A', 'B'] as const) {
  const found = sections.find((s) => s.label === label);
  const made = await ensure(`section ${label}`, found,
    () => call<Id & { status: string }>('POST', '/sections', {
      program_id: btech.id, term_id: semesterOne.id, term_number: 1, label, capacity: 60,
    }));
  section[label] = made;
  let status = found?.status ?? 'planned';
  if (status === 'planned') {
    await call('POST', `/sections/${made.id}/status`, { status: 'open' });
    status = 'open';
  }
  for (const [number, , inSection] of STUDENTS) {
    if (inSection !== label) continue;
    await ensure(`  ${number} in section ${label}`,
      must(student[number], number).section?.id === made.id ? true : undefined,
      () => call('POST', `/sections/${made.id}/members`, { student_id: must(student[number], number).id, from: ADMITTED_ON }));
  }
  if (status === 'open') {
    await call('POST', `/sections/${made.id}/status`, { status: 'active' });
    console.log(`  + section ${label} started teaching`);
  }
}

const extraSections = await call<(Id & { label: string; status: string })[]>(
  'GET', `/sections?term_id=${semesterOne.id}&program_id=${btech.id}`,
);
const extraLabels = ['C', 'D', 'E', 'F', 'G', 'H'] as const;
for (const label of extraLabels) {
  const existing = extraSections.find((s) => s.label === label);
  const made = existing ?? await call<Id & { status: string }>('POST', '/sections', {
    program_id: btech.id, term_id: semesterOne.id, term_number: 1, label, capacity: 60,
  });
  if (made.status === 'planned') await call('POST', `/sections/${made.id}/status`, { status: 'open' });
  if (made.status === 'planned' || made.status === 'open') await call('POST', `/sections/${made.id}/status`, { status: 'active' });
  const assigned = extraBtech.filter((_, index) => index % extraLabels.length === extraLabels.indexOf(label));
  for (const studentRow of assigned) {
    if (studentRow.section?.id === made.id) continue;
    await call('POST', `/sections/${made.id}/members`, { student_id: studentRow.id, from: ADMITTED_ON });
  }
}

/* -------------------------------------------------------------- 10. holidays */

step('10. Non-teaching days (before classes are generated, so they are skipped)');
const days = await call<{ on_date: string; label: string }[]>('GET', `/non-teaching-days?from=${YEAR.starts_on}&to=${YEAR.ends_on}`);
for (const [on_date, label] of HOLIDAYS) {
  await ensure(`${on_date} ${label}`, days.find((d) => d.on_date.startsWith(on_date)) ? true : undefined,
    () => call('POST', '/non-teaching-days', { on_date, label }));
}
await ensure(
  'October multi-day break',
  days.some((d) => d.on_date.startsWith('2026-10-26') && d.label === 'Mid-semester break') ? true : undefined,
  () => call('POST', '/non-teaching-days', {
    on_date: '2026-10-26', to_date: '2026-10-30', label: 'Mid-semester break',
  }),
);
const calendar = await call<{ events?: { title: string; on_date: string }[] }>(
  'GET', `/calendar?from=${YEAR.starts_on}&to=${YEAR.ends_on}`,
);
const events = calendar.events ?? [];
for (const event of [
  { title: 'Freshers orientation', on_date: '2026-07-25', note: 'Main auditorium' },
  { title: 'Annual sports day', on_date: '2026-11-14', starts_at: '09:00', ends_at: '16:00' },
]) {
  await ensure(
    `calendar event ${event.title}`,
    events.find((e) => e.title === event.title && e.on_date.startsWith(event.on_date)),
    () => call('POST', '/calendar/events', event),
  );
}

/* ------------------------------------ 11. courses taught, teachers, timetable */

// Classes from today to the end of Semester I: generating from July would leave
// two months of past classes waiting to be marked on every teacher's dashboard.
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const semesterEnd = TERMS[0][3];
const generated: string[] = [];
const seededOfferings: string[] = [];

for (const label of ['A', 'B'] as const) {
  step(`11. Section ${label}: courses taught, teachers, weekly timetable, classes`);
  type Offering = Id & { component: string; status: string; course: Id; instructors: { person_id: string }[] };
  const sectionId = must(section[label], `section ${label}`).id;
  const offerings = byId(await call<Offering[]>('GET', `/offerings?section_id=${sectionId}`));
  for (const taught of TAUGHT[label]) {
    const what = `${taught.course} ${taught.component}`;
    const found = [...offerings.values()].find(
      (o) => o.course.id === must(course[taught.course], taught.course).id && o.component === taught.component,
    );
    const offering = await ensure(what, found, () => call<Offering>('POST', '/offerings', {
      section_id: sectionId, course_id: must(course[taught.course], taught.course).id, component: taught.component,
    }));
    seededOfferings.push(offering.id);

    const teaching = new Set((found?.instructors ?? []).map((i) => i.person_id));
    for (const [key, role] of taught.teachers) {
      const personId = must(teacher[key], key);
      await ensure(`  ${key} (${role})`, teaching.has(personId) ? true : undefined,
        () => call('POST', `/offerings/${offering.id}/instructors`, { person_id: personId, role }));
    }

    const status = found?.status ?? 'planned';
    if (status === 'planned') {
      await call('POST', `/offerings/${offering.id}/enrolments/cohort`, { from: ADMITTED_ON });
      await call('POST', `/offerings/${offering.id}/status`, { status: 'active' });
      console.log(`  + section ${label} enrolled, teaching started`);
    }

    const slots = await call<{ day_of_week: number; starts_at: string }[]>('GET', `/slots?offering_id=${offering.id}`);
    for (const [day, starts, ends, roomCode] of taught.slots) {
      await ensure(`  day ${day} ${starts}–${ends} ${roomCode}`,
        slots.find((s) => s.day_of_week === day && s.starts_at.startsWith(starts)) ? true : undefined,
        () => call('POST', `/offerings/${offering.id}/slots`, {
          day_of_week: day, starts_at: starts, ends_at: ends, room_id: must(room[roomCode], roomCode).id,
        }));
    }

    if (today > semesterEnd) continue;
    const window = { from: today, to: semesterEnd };
    const preview = await call<{ created: number; clashes: { kind: string; date: string; subject: string }[] }>(
      'POST', `/offerings/${offering.id}/sessions`, { ...window, preview: true },
    );
    const [clash] = preview.clashes;
    if (clash) {
      console.log(`  ! ${what}: ${preview.clashes.length} clashes, no classes generated`
        + ` (first: ${clash.kind} ${clash.date} ${clash.subject})`);
      continue;
    }
    const report = await call<{ created: number; already_scheduled: number; skipped_days: unknown[] }>(
      'POST', `/offerings/${offering.id}/sessions`, window,
    );
    tally.created += report.created;
    console.log(`  + ${report.created} classes (${report.already_scheduled} already there, `
      + `${report.skipped_days.length} holidays skipped)`);
    generated.push(`${label} ${what}: ${report.created}`);
  }
}

/* --------------------------------------------------------------- 12. fees */

step('12. Fee ledger (paid, part-paid, overdue and reversed examples)');
type FeeHead = Id & { code: string };
const feeHeads = await call<FeeHead[]>('GET', '/fees/heads');
const tuition = await ensure(
  'tuition fee head', feeHeads.find((h) => h.code === 'tuition'),
  () => call<FeeHead>('POST', '/fees/heads', { name: 'Tuition fee', code: 'tuition' }),
);
type FeeStructure = Id & { program_id: string; academic_year_id: string; status: string };
const structures = await call<FeeStructure[]>('GET', `/fees/structures?program_id=${btech.id}`);
let feeStructure = structures.find((s) => s.academic_year_id === year.id);
if (!feeStructure) {
  feeStructure = await call<FeeStructure>('POST', '/fees/structures', {
    program_id: btech.id, academic_year_id: year.id,
  });
  tally.created++;
  console.log('  + tuition fee structure');
}
const feeDetail = await call<{
  id: string; status: string; instalments: { id: string; seq: number; lines: { fee_head_id: string }[] }[];
}>('GET', `/fees/structures/${feeStructure.id}`);
for (const [seq, dueDate] of [[1, '2026-07-01'], [2, '2026-11-01']] as const) {
  let instalment = feeDetail.instalments.find((i) => i.seq === seq);
  if (!instalment) {
    instalment = await call('POST', `/fees/structures/${feeStructure.id}/instalments`, {
      seq, due_date: dueDate, late_fee_paise: 5000,
    });
  }
  if (!instalment) throw new Error(`Could not create fee instalment ${seq}`);
  if (feeDetail.status === 'draft' && !((instalment.lines ?? []).some((l) => l.fee_head_id === tuition.id))) {
    await call('POST', `/fees/instalments/${instalment.id}/lines`, {
      fee_head_id: tuition.id, amount_paise: 500000,
    });
  }
}
if (feeDetail.status === 'draft') await call('POST', `/fees/structures/${feeStructure.id}/publish`, {});
await call('POST', `/fees/structures/${feeStructure.id}/invoices`, {});
const feeStudents = STUDENTS.slice(0, 3).map(([number]) => must(student[number], number).id);
for (const [index, studentId] of feeStudents.entries()) {
  const payments = await call<{ id: string; kind: string }[]>('GET', `/fees/students/${studentId}/payments`);
  if (payments.length > 0) continue;
  const payment = await call<{ payment: { id: string } }>('POST', '/fees/payments', {
    student_id: studentId, method: index === 1 ? 'upi' : 'cash',
    amount_paise: index === 0 ? 100000 : 500000,
    ...(index === 1 ? { reference: 'SEED-UPI-001' } : {}),
  });
  if (index === 2) await call('POST', `/fees/payments/${payment.payment.id}/cancel`, { reason: 'Seeded reversal example' });
}
const waiverStudent = feeStudents[0];
if (waiverStudent) {
  const waiverInvoices = await call<{ id: string; kind: string }[]>('GET', `/fees/students/${waiverStudent}/invoices`);
  let fine = waiverInvoices.find((i) => i.kind === 'fine');
  if (!fine) {
    fine = await call<{ id: string; kind: string }>('POST', `/fees/students/${waiverStudent}/fines`, {
      amount_paise: 25000, reason: 'Library book not returned (seed example)',
    });
  }
  const requests = await call<{ id: string; kind: string; invoice_id: string; status: string }[]>(
    'GET', `/fees/requests?student_id=${waiverStudent}`,
  );
  let waiver = requests.find((r) => r.kind === 'waiver' && r.invoice_id === fine!.id);
  if (!waiver) {
    waiver = await call<{ id: string; kind: string; invoice_id: string; status: string }>('POST', '/fees/waivers', {
      invoice_id: fine.id, reason: 'Seeded hardship waiver example',
    });
  }
  if (waiver.status === 'pending') await call('POST', `/fees/requests/${waiver.id}/approve`, { reason: 'Seed fixture approved' });
}

/* ---------------------------------------------------------- 13. assessment */

step('13. Assessment examples');
const firstOffering = seededOfferings[0];
if (firstOffering) {
  type Component = Id & { status: string; held_on: string | null; version: number };
  const components = await call<Component[]>('GET', `/offerings/${firstOffering}/assessments`);
  let component = components[0];
  if (!component) {
    component = await call<Component>('POST', `/offerings/${firstOffering}/assessments`, {
      name: 'Mid-semester test', kind: 'test', max_marks: 50, weight: 40,
    });
  }
  if (!components.some((c) => c.id !== component!.id && c.status === 'draft')) {
    await call('POST', `/offerings/${firstOffering}/assessments`, {
      name: 'Final examination (unmarked)', kind: 'exam', max_marks: 100, weight: 60,
    });
  }
  const sheet = await call<{ component: Component; students: { student_id: string; status: string | null }[] }>(
    'GET', `/assessments/${component.id}/sheet`,
  );
  if (!sheet.component.held_on) {
    await call('POST', `/assessments/${component.id}/held-on`, {
      version: sheet.component.version, held_on: '2026-09-15',
    });
  }
  let latest = await call<{ component: Component; students: { student_id: string; status: string | null }[] }>(
    'GET', `/assessments/${component.id}/sheet`,
  );
  if (latest.students.length > 0 && latest.students.every((s) => s.status === null)) {
    await call('PUT', `/assessments/${component.id}/marks`, {
      version: latest.component.version,
      marks: latest.students.map((s, index) => index === 0
        ? { student_id: s.student_id, status: 'scored', score: 42 }
        : { student_id: s.student_id, status: 'absent' }),
    });
  }
  latest = await call('GET', `/assessments/${component.id}/sheet`);
  if (latest.component.status === 'draft' && latest.students.length > 0 && latest.students.every((s) => s.status !== null)) {
    await call('POST', `/assessments/${component.id}/submit`, {
      version: latest.component.version,
    });
    const submitted = await call<{ component: Component }>('GET', `/assessments/${component.id}/sheet`);
    await call('POST', `/assessments/${component.id}/verify`, { version: submitted.component.version });
  }
}

/* ------------------------------------------------------ 14. attendance */

step('14. Attendance records and correction example');
if (firstOffering) {
  type SeedSession = Id & { status: string };
  const sessions = await call<SeedSession[]>('GET', `/sessions?offering_id=${firstOffering}&limit=20`);
  const live = sessions.find((s) => s.status !== 'cancelled');
  if (live) {
    let sheet = await call<{
      sheet: { status: string; version: number };
      students: { student_id: string; state: string | null; record_id: string | null }[];
      corrections: { record_id: string }[];
    }>('GET', `/sessions/${live.id}/attendance`);
    if (sheet.sheet.status === 'draft' && sheet.students.length > 0) {
      const marked = await call<{ version: number }>('PUT', `/sessions/${live.id}/attendance`, {
        version: sheet.sheet.version,
        marks: sheet.students.map((s, index) => ({
          student_id: s.student_id, state: index === 1 ? 'absent' : 'present',
        })),
      });
      await call('POST', `/sessions/${live.id}/attendance/submit`, { version: marked.version });
      sheet = await call('GET', `/sessions/${live.id}/attendance`);
    }
    const correctable = sheet.students.find((s) => s.record_id && !sheet.corrections.some((c) => c.record_id === s.record_id));
    if (correctable?.record_id) {
      await call('POST', `/attendance-records/${correctable.record_id}/correct`, {
        state: 'late', reason: 'Seeded attendance correction example',
      });
    }
  }
  const cancelable = sessions.find((s) => s.id !== live?.id && s.status === 'scheduled');
  if (cancelable) await call('POST', `/sessions/${cancelable.id}/cancel`, { reason: 'Seeded cancelled class example' });
}

/* --------------------------------------------------------- 15. student access */

step('12. Student app access (one student, so you can try the student app)');
const first = STUDENTS[0][0];
if (saved.student_access![first]) {
  tally.kept++;
  console.log(`  = ${first} already has a code (see server/.college-tree.local.json)`);
} else {
  const access = await call<{ code: string; expires_at: string; login_identifier: string }>(
    'POST', `/students/${must(student[first], first).id}/access`,
  );
  saved.student_access![first] = access;
  tally.created++;
  console.log(`  + ${first} activation code written to server/.college-tree.local.json`);
}

/* ------------------------------------------------------------------- the end */

writeFileSync(OUT, JSON.stringify({ institution_code: college, ...saved }, null, 2), { mode: 0o600 });
console.log(`\nDone: ${tally.created} created, ${tally.kept} already there.`);
console.log('Teacher invitations and the student code: server/.college-tree.local.json (never commit it).');
