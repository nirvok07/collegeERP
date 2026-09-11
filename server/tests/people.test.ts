/**
 * M1 write surface: invite, assign, revoke. The rules under test are the ones
 * that stop an administrator escalating their own privilege or locking a
 * college out of itself.
 */
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { LightMyRequestResponse } from 'fastify';
import {
  buildTestApp, provisionCollege, resetData, seedPlatformAccount,
  setupDatabase, signInPlatform, MIGRATOR_URL, type TestApp,
} from './helpers.ts';
import { createPool } from '../src/infrastructure/db/pool.ts';

let harness: TestApp;

before(async () => { await setupDatabase(); harness = await buildTestApp(); });
after(async () => harness.close());
beforeEach(resetData);

/** A college whose administrator is signed in and ready to act. */
async function collegeWithAdmin(code = 'hill-college') {
  // A distinct platform account per college: the email is unique per platform.
  const platform = await seedPlatformAccount(`owner+${code}@nirvok.com`);
  const login = await signInPlatform(harness.app, platform.email, platform.password);
  const prov = await provisionCollege(harness.app, login.body.data.access_token, {
    code, name: 'Hill College', adminEmail: `admin@${code}.edu`,
  });
  await harness.app.inject({
    method: 'POST', url: '/v1/auth/accept-invite',
    payload: { institution_code: code, token: prov.body.data.invitation.token, password: 'admin-strong-99' },
  });
  const signedIn = (await harness.app.inject({
    method: 'POST', url: '/v1/auth/login',
    payload: { institution_code: code, identifier: `admin@${code}.edu`, password: 'admin-strong-99' },
  })) as LightMyRequestResponse;
  return {
    code,
    token: signedIn.json().data.access_token as string,
    personId: prov.body.data.administrator.person_id as string,
    tenantId: prov.body.data.institution.id as string,
  };
}

const as = (token: string) => ({ authorization: `Bearer ${token}` });

const post = (url: string, token: string, payload: unknown) =>
  harness.app.inject({ method: 'POST', url, headers: as(token), payload: payload as never }) as Promise<LightMyRequestResponse>;

const get = (url: string, token: string) =>
  harness.app.inject({ method: 'GET', url, headers: as(token) }) as Promise<LightMyRequestResponse>;

describe('inviting people', () => {
  it('invites a person and returns a one-time invitation', async () => {
    const college = await collegeWithAdmin();
    const res = await post('/v1/people', college.token, {
      full_name: 'Ravi Kumar', email: 'ravi@hill.edu', person_type: 'staff',
    });
    assert.equal(res.statusCode, 201);
    assert.ok(res.json().data.invitation.token);
    assert.equal(res.json().data.invitation.delivery, 'pending');
  });

  it('grants initial authority in the same transaction as the invite', async () => {
    const college = await collegeWithAdmin();
    const res = await post('/v1/people', college.token, {
      full_name: 'Sunita Das', email: 'sunita@hill.edu', person_type: 'staff',
      role: { role_key: 'faculty', scope_type: 'department', scope_ref_id: crypto.randomUUID() },
    });
    assert.equal(res.statusCode, 201);

    const people = await get('/v1/people?q=Sunita', college.token);
    assert.deepEqual(people.json().data[0].role_keys, ['faculty']);
  });

  it('refuses a duplicate email rather than creating a second identity', async () => {
    const college = await collegeWithAdmin();
    await post('/v1/people', college.token, {
      full_name: 'Ravi Kumar', email: 'ravi@hill.edu', person_type: 'staff',
    });
    const again = await post('/v1/people', college.token, {
      full_name: 'Ravi K', email: 'ravi@hill.edu', person_type: 'staff',
    });
    assert.equal(again.statusCode, 409);
    assert.ok(again.json().error.field_errors.email);
  });

  it('refuses a role at a level that role does not allow', async () => {
    const college = await collegeWithAdmin();
    const res = await post('/v1/people', college.token, {
      full_name: 'Wrong Scope', email: 'ws@hill.edu', person_type: 'staff',
      role: { role_key: 'college_admin', scope_type: 'department', scope_ref_id: crypto.randomUUID() },
    });
    assert.equal(res.statusCode, 422);
    assert.ok(res.json().error.field_errors.scopeType);
  });

  it('an invited person can activate and sign in', async () => {
    const college = await collegeWithAdmin();
    const invited = await post('/v1/people', college.token, {
      full_name: 'Ravi Kumar', email: 'ravi@hill.edu', person_type: 'staff',
      role: { role_key: 'faculty', scope_type: 'department', scope_ref_id: crypto.randomUUID() },
    });
    const accepted = await harness.app.inject({
      method: 'POST', url: '/v1/auth/accept-invite',
      payload: {
        institution_code: college.code,
        token: invited.json().data.invitation.token,
        password: 'ravi-strong-99',
      },
    });
    assert.equal(accepted.statusCode, 200);

    const signedIn = (await harness.app.inject({
      method: 'POST', url: '/v1/auth/login',
      payload: { institution_code: college.code, identifier: 'ravi@hill.edu', password: 'ravi-strong-99' },
    })) as LightMyRequestResponse;
    assert.equal(signedIn.statusCode, 200);

    const me = await get('/v1/auth/me', signedIn.json().data.access_token);
    assert.equal(me.json().data.assignments[0].role_key, 'faculty');
  });
});

describe('assigning and revoking authority', () => {
  async function invitee(college: Awaited<ReturnType<typeof collegeWithAdmin>>, email = 'meena@hill.edu') {
    const res = await post('/v1/people', college.token, {
      full_name: 'Meena Iyer', email, person_type: 'staff',
    });
    return res.json().data.person_id as string;
  }

  it('assigns a role and the person sees it immediately', async () => {
    const college = await collegeWithAdmin();
    const personId = await invitee(college);
    const res = await post('/v1/assignments', college.token, {
      person_id: personId, role_key: 'department_head',
      scope_type: 'department', scope_ref_id: crypto.randomUUID(),
    });
    assert.equal(res.statusCode, 201);

    const people = await get('/v1/people?q=Meena', college.token);
    assert.deepEqual(people.json().data[0].role_keys, ['department_head']);
  });

  it('refuses a duplicate grant of the same role at the same scope', async () => {
    const college = await collegeWithAdmin();
    const personId = await invitee(college);
    const scope = crypto.randomUUID();
    await post('/v1/assignments', college.token, {
      person_id: personId, role_key: 'faculty', scope_type: 'department', scope_ref_id: scope,
    });
    const again = await post('/v1/assignments', college.token, {
      person_id: personId, role_key: 'faculty', scope_type: 'department', scope_ref_id: scope,
    });
    assert.equal(again.statusCode, 409);
  });

  it('an administrator cannot grant authority to themselves', async () => {
    const college = await collegeWithAdmin();
    const res = await post('/v1/assignments', college.token, {
      person_id: college.personId, role_key: 'department_head',
      scope_type: 'department', scope_ref_id: crypto.randomUUID(),
    });
    assert.equal(res.statusCode, 403, 'the one role able to escalate itself is stopped from doing so');
  });

  it('revokes an assignment, and the person loses the access at once', async () => {
    const college = await collegeWithAdmin();
    const personId = await invitee(college);
    const granted = await post('/v1/assignments', college.token, {
      person_id: personId, role_key: 'faculty',
      scope_type: 'department', scope_ref_id: crypto.randomUUID(),
    });

    const res = await post(
      `/v1/assignments/${granted.json().data.assignmentId}/revoke`,
      college.token,
      { reason: 'Left the department' },
    );
    assert.equal(res.statusCode, 200);

    const people = await get('/v1/people?q=Meena', college.token);
    assert.deepEqual(people.json().data[0].role_keys, []);
  });

  it('requires a reason to revoke, so the audit trail is never blank', async () => {
    const college = await collegeWithAdmin();
    const personId = await invitee(college);
    const granted = await post('/v1/assignments', college.token, {
      person_id: personId, role_key: 'faculty',
      scope_type: 'department', scope_ref_id: crypto.randomUUID(),
    });
    const res = await post(
      `/v1/assignments/${granted.json().data.assignmentId}/revoke`, college.token, { reason: '' },
    );
    assert.equal(res.statusCode, 422);
  });

  it('BR-8: refuses to remove the only administrator', async () => {
    const college = await collegeWithAdmin();
    const pool = createPool(MIGRATOR_URL);
    let assignmentId: string;
    try {
      const { rows } = await pool.query(
        `SELECT ra.id FROM role_assignments ra JOIN role_definitions rd ON rd.id = ra.role_id
          WHERE rd.key = 'college_admin' AND ra.tenant_id = $1`, [college.tenantId],
      );
      assignmentId = rows[0].id;
    } finally { await pool.end(); }

    // Another administrator revokes it, so the self-revocation rule is not what
    // is being tested here.
    const second = await post('/v1/people', college.token, {
      full_name: 'Second Admin', email: 'second@hill.edu', person_type: 'staff',
      role: { role_key: 'college_admin', scope_type: 'institution' },
    });
    await harness.app.inject({
      method: 'POST', url: '/v1/auth/accept-invite',
      payload: {
        institution_code: college.code,
        token: second.json().data.invitation.token,
        password: 'second-strong-99',
      },
    });
    const secondLogin = (await harness.app.inject({
      method: 'POST', url: '/v1/auth/login',
      payload: { institution_code: college.code, identifier: 'second@hill.edu', password: 'second-strong-99' },
    })) as LightMyRequestResponse;

    // Two administrators now exist, so removing one is allowed.
    const ok = await post(`/v1/assignments/${assignmentId}/revoke`,
      secondLogin.json().data.access_token, { reason: 'Handover complete' });
    assert.equal(ok.statusCode, 200);

    const third = await post('/v1/people', college.token, {
      full_name: 'Third Person', email: 'third@hill.edu', person_type: 'staff',
    });
    assert.equal(third.statusCode, 403, 'the revoked administrator lost access immediately');

    // Only one administrator remains. Two independent rules now protect it, and
    // the self-revocation rule is the one reachable here: the sole remaining
    // administrator is the only actor holding institution-scoped role.assign,
    // so any attempt to remove the last administrator is necessarily an attempt
    // to remove one's own access.
    const pool2 = createPool(MIGRATOR_URL);
    let lastId: string;
    try {
      const { rows } = await pool2.query(
        `SELECT ra.id FROM role_assignments ra JOIN role_definitions rd ON rd.id = ra.role_id
          WHERE rd.key = 'college_admin' AND ra.status = 'active' AND ra.tenant_id = $1`,
        [college.tenantId],
      );
      lastId = rows[0].id;
    } finally { await pool2.end(); }

    const refused = await post(`/v1/assignments/${lastId}/revoke`,
      secondLogin.json().data.access_token, { reason: 'trying to lock everyone out' });
    assert.equal(refused.statusCode, 403, 'a college cannot be left with no administrator');
    assert.match(refused.json().error.message, /your own access/i);
  });

  it('BR-8: the count rule holds independently of the self-revocation rule', async () => {
    const college = await collegeWithAdmin('count-rule');
    const pool = createPool(MIGRATOR_URL);
    let adminAssignmentId: string;
    try {
      const { rows } = await pool.query(
        `SELECT ra.id FROM role_assignments ra JOIN role_definitions rd ON rd.id = ra.role_id
          WHERE rd.key = 'college_admin' AND ra.status = 'active' AND ra.tenant_id = $1`,
        [college.tenantId],
      );
      adminAssignmentId = rows[0].id;
    } finally { await pool.end(); }

    // Call the use case directly as a different person, which the HTTP surface
    // cannot produce while only one administrator exists. This proves the count
    // rule stands on its own rather than being masked by the self rule.
    const { revokeAssignment } = await import('../src/modules/identity/application/manage-people.ts');
    const result = await revokeAssignment(
      harness.container.managePeople,
      { tenantId: college.tenantId, personId: crypto.randomUUID() },
      { assignmentId: adminAssignmentId, reason: 'attempting to remove the only administrator' },
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error.code, 'CONFLICT');
    assert.match(result.error.message, /only administrator/i);
  });

  it('records both the grant and the revocation in the audit trail', async () => {
    const college = await collegeWithAdmin();
    const personId = await invitee(college);
    const granted = await post('/v1/assignments', college.token, {
      person_id: personId, role_key: 'faculty',
      scope_type: 'department', scope_ref_id: crypto.randomUUID(),
    });
    await post(`/v1/assignments/${granted.json().data.assignmentId}/revoke`,
      college.token, { reason: 'Role ended' });

    const pool = createPool(MIGRATOR_URL);
    try {
      const { rows } = await pool.query(
        `SELECT action, reason FROM audit_events
          WHERE subject_id = $1 ORDER BY at`, [granted.json().data.assignmentId],
      );
      assert.deepEqual(rows.map((r) => r.action), ['assignment.granted', 'assignment.revoked']);
      assert.equal(rows[1].reason, 'Role ended');
    } finally { await pool.end(); }
  });
});

describe('authorization on the people surface', () => {
  it('a faculty member cannot list people', async () => {
    const college = await collegeWithAdmin();
    const invited = await post('/v1/people', college.token, {
      full_name: 'Plain Faculty', email: 'plain@hill.edu', person_type: 'staff',
      role: { role_key: 'faculty', scope_type: 'department', scope_ref_id: crypto.randomUUID() },
    });
    await harness.app.inject({
      method: 'POST', url: '/v1/auth/accept-invite',
      payload: {
        institution_code: college.code,
        token: invited.json().data.invitation.token, password: 'plain-strong-99',
      },
    });
    const signedIn = (await harness.app.inject({
      method: 'POST', url: '/v1/auth/login',
      payload: { institution_code: college.code, identifier: 'plain@hill.edu', password: 'plain-strong-99' },
    })) as LightMyRequestResponse;

    // Faculty holds person.read at department scope only, so an
    // institution-scoped list is out of reach.
    const res = await get('/v1/people', signedIn.json().data.access_token);
    assert.equal(res.statusCode, 403);

    const assign = await post('/v1/assignments', signedIn.json().data.access_token, {
      person_id: college.personId, role_key: 'college_admin', scope_type: 'institution',
    });
    assert.equal(assign.statusCode, 403, 'and cannot grant themselves anything');
  });

  it('people from another college are never visible', async () => {
    const a = await collegeWithAdmin('alpha-hill');
    const b = await collegeWithAdmin('beta-hill');
    await post('/v1/people', b.token, {
      full_name: 'Beta Person', email: 'beta.person@hill.edu', person_type: 'staff',
    });

    const seen = await get('/v1/people', a.token);
    const names = seen.json().data.map((p: { full_name: string }) => p.full_name);
    assert.ok(!names.includes('Beta Person'), 'tenant isolation holds on the list query');
  });
});
