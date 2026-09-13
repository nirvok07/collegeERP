/**
 * Development only: a dedicated `device-test` college for validating the
 * Flutter app on a real phone, so no existing data is touched.
 *
 * Everything goes through the public API except the platform account, which
 * has no API by design; it is inserted exactly as tests/helpers.ts does.
 * Passwords are random and written only to server/.device-test.local.json
 * (git-ignored, owner-only). Nothing secret is printed.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config/config.ts';
import { createPool } from '../src/infrastructure/db/pool.ts';
import { ScryptPasswordHasher } from '../src/infrastructure/crypto/adapters.ts';

const config = loadConfig();
if (config.NODE_ENV === 'production') throw new Error('Refusing to seed test data in production.');

const API = process.env.SEED_API ?? 'http://localhost:3000';
const OUT = fileURLToPath(new URL('../.device-test.local.json', import.meta.url));
const CODE = 'device-test';
if (existsSync(OUT)) {
  console.log('Already seeded. Credentials: server/.device-test.local.json');
  process.exit(0);
}

// The password policy needs a letter and a number; hex alone might lack a letter.
const secret = () => `Dt${randomBytes(12).toString('hex')}7`;
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

async function call(method: string, path: string, body?: unknown, token?: string) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { data?: any; error?: { code: string; message: string } };
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${json.error?.code}: ${json.error?.message}`);
  return json.data;
}

const platform = { email: `owner+${CODE}@nirvok.dev`, password: secret() };
const admin = { email: `admin@${CODE}.dev`, password: secret() };
const teacher = { email: `teacher@${CODE}.dev`, password: secret() };

// Resumable: a run that stopped part-way leaves this script's own test owner
// and college behind. Only those rows are touched, and only here.
const pool = createPool(config.MIGRATION_DATABASE_URL ?? config.DATABASE_URL);
let inviteToken: string | undefined;
try {
  const hash = await new ScryptPasswordHasher().hash(platform.password);
  const existing = await pool.query('SELECT id FROM platform_accounts WHERE email = $1', [platform.email]);
  if (existing.rowCount) {
    await pool.query('UPDATE platform_accounts SET credential_hash = $2 WHERE email = $1', [platform.email, hash]);
  } else {
    await pool.query(
      `INSERT INTO platform_accounts (id, email, full_name, credential_hash, status)
       VALUES ($1,$2,'Device Test Owner',$3,'active')`,
      [randomUUID(), platform.email, hash],
    );
  }

  const college = await pool.query('SELECT id FROM institutions WHERE code = $1', [CODE]);
  if (college.rowCount) {
    // The admin's invitation was never accepted, and its token was only ever
    // returned once. Give that same invitation a fresh token.
    inviteToken = randomBytes(24).toString('base64url');
    const reissued = await pool.query(
      `UPDATE invitation_tokens SET token_hash = $2, expires_at = now() + interval '1 day'
        WHERE tenant_id = $1 AND consumed_at IS NULL`,
      [college.rows[0].id, createHash('sha256').update(inviteToken).digest('hex')],
    );
    if (reissued.rowCount !== 1) throw new Error('device-test exists but has no single pending invitation; not resuming.');
  }
} finally {
  await pool.end();
}

const owner = (await call('POST', '/v1/auth/platform/login', platform)).access_token;
if (!inviteToken) {
  const provisioned = await call('POST', '/v1/institutions', {
    code: CODE, name: 'Device Test College', admin: { full_name: 'Device Test Admin', email: admin.email },
  }, owner);
  inviteToken = provisioned.invitation.token as string;
}
await call('POST', '/v1/auth/accept-invite', {
  institution_code: CODE, token: inviteToken, password: admin.password,
});
const t = (await call('POST', '/v1/auth/login', {
  institution_code: CODE, identifier: admin.email, password: admin.password,
})).access_token;

const campus = (await call('GET', '/v1/campuses', undefined, t))[0].id;
const department = (await call('POST', '/v1/departments', { campus_id: campus, name: 'Computer Science', code: 'cse' }, t)).id;
const program = (await call('POST', '/v1/programs', {
  department_id: department, name: 'B.Tech CSE', code: 'btech-cse', duration_years: 4, term_type: 'semester',
}, t)).id;
const year = (await call('POST', '/v1/academic-years', {
  name: '2026-27', starts_on: '2026-06-01', ends_on: '2027-05-31', make_current: true,
}, t)).id;
const term = (await call('POST', '/v1/terms', {
  academic_year_id: year, sequence: 1, name: 'Semester 1', starts_on: '2026-06-01', ends_on: '2026-11-30',
}, t)).id;
const section = (await call('POST', '/v1/sections', { program_id: program, term_id: term, term_number: 5, label: 'A' }, t)).id;
await call('POST', `/v1/sections/${section}/status`, { status: 'open' }, t);
await call('POST', `/v1/sections/${section}/status`, { status: 'active' }, t);
const course = (await call('POST', '/v1/courses', { code: 'CS301', title: 'Operating Systems' }, t)).id;
const offering = (await call('POST', '/v1/offerings', { section_id: section, course_id: course }, t)).id;

const invited = await call('POST', '/v1/people', {
  full_name: 'Test Teacher', email: teacher.email, person_type: 'staff',
  role: { role_key: 'faculty', scope_type: 'section', scope_ref_id: section },
}, t);
await call('POST', '/v1/auth/accept-invite', {
  institution_code: CODE, token: invited.invitation.token, password: teacher.password,
});
await call('POST', `/v1/offerings/${offering}/instructors`, { person_id: invited.person_id, role: 'lead' }, t);

for (const [name, number] of [['Nisha Kumar', 'dt-001'], ['Ravi Nair', 'dt-002'], ['Meera Iyer', 'dt-003']]) {
  const student = await call('POST', '/v1/students', {
    full_name: name, enrolment_number: number, program_id: program, admitted_on: '2026-06-01',
  }, t);
  await call('POST', `/v1/sections/${section}/members`, { student_id: student.id, from: '2026-06-01' }, t);
}

const sessions: string[] = [];
for (const [starts, ends] of [['00:05', '00:55'], ['01:00', '01:50']]) {
  sessions.push((await call('POST', '/v1/sessions', {
    offering_id: offering, session_date: today, starts_at: starts, ends_at: ends,
  }, t)).id);
}

writeFileSync(OUT, JSON.stringify({ institution_code: CODE, platform, admin, teacher, sessions, date: today }, null, 2), { mode: 0o600 });
console.log(`Seeded ${CODE}: 1 section, 3 students, ${sessions.length} classes on ${today}. Credentials: server/.device-test.local.json`);
