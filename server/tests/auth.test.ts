/**
 * W1 activation and W2 authentication, end to end through HTTP.
 */
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTestApp, provisionCollege, resetData, seedPlatformAccount,
  setupDatabase, signInPlatform, type TestApp,
} from './helpers.ts';

let harness: TestApp;

before(async () => {
  await setupDatabase();
  harness = await buildTestApp();
});
after(async () => harness.close());
beforeEach(resetData);

async function collegeWithInvitedAdmin() {
  const account = await seedPlatformAccount();
  const login = await signInPlatform(harness.app, account.email, account.password);
  const res = await provisionCollege(harness.app, login.body.data.access_token, {
    code: 'sunrise-college', name: 'Sunrise College', adminEmail: 'priya@sunrise.edu',
  });
  return {
    code: 'sunrise-college',
    email: 'priya@sunrise.edu',
    invitationToken: res.body.data.invitation.token as string,
    tenantId: res.body.data.institution.id as string,
  };
}

const post = (url: string, payload: unknown) =>
  harness.app.inject({ method: 'POST', url, payload });

describe('platform authentication', () => {
  it('signs in with correct credentials', async () => {
    const account = await seedPlatformAccount();
    const res = await signInPlatform(harness.app, account.email, account.password);
    assert.equal(res.status, 200);
    assert.ok(res.body.data.access_token);
    assert.ok(res.body.data.refresh_token);
    assert.equal(res.body.data.actor.actor_type, 'platform');
  });

  it('BR-24: an unknown email and a wrong password fail identically', async () => {
    const account = await seedPlatformAccount();
    const unknown = await post('/v1/auth/platform/login', {
      email: 'nobody@nowhere.com', password: 'whatever-123',
    });
    const wrong = await post('/v1/auth/platform/login', {
      email: account.email, password: 'wrong-password-123',
    });
    assert.equal(unknown.statusCode, wrong.statusCode);
    assert.deepEqual(unknown.json().error, wrong.json().error, 'no enumeration of identifiers');
  });

  it('BR-11: locks the account after five failures and says when it clears', async () => {
    const account = await seedPlatformAccount();
    for (let i = 0; i < 5; i++) {
      await post('/v1/auth/platform/login', { email: account.email, password: 'bad-password-1' });
    }
    const res = await post('/v1/auth/platform/login', {
      email: account.email, password: account.password,
    });
    assert.equal(res.statusCode, 423);
    assert.equal(res.json().error.code, 'ACCOUNT_LOCKED');
    assert.match(res.json().error.message, /try again/i);
  });
});

describe('tenant authentication', () => {
  it('an invited administrator cannot sign in until the invitation is accepted', async () => {
    const college = await collegeWithInvitedAdmin();
    const res = await post('/v1/auth/login', {
      institution_code: college.code, identifier: college.email, password: 'anything-1234',
    });
    assert.equal(res.statusCode, 403);
    assert.equal(res.json().error.code, 'ACCOUNT_NOT_ACTIVE');
    assert.match(res.json().error.message, /invitation/i, 'the message says what to do next');
  });

  it('accepts the invitation, then signs in and reports real authority', async () => {
    const college = await collegeWithInvitedAdmin();

    const accepted = await post('/v1/auth/accept-invite', {
      institution_code: college.code, token: college.invitationToken, password: 'strong-pass-99',
    });
    assert.equal(accepted.statusCode, 200);

    const login = await post('/v1/auth/login', {
      institution_code: college.code, identifier: college.email, password: 'strong-pass-99',
    });
    assert.equal(login.statusCode, 200);

    const me = await harness.app.inject({
      method: 'GET', url: '/v1/auth/me',
      headers: { authorization: `Bearer ${login.json().data.access_token}` },
    });
    const body = me.json().data;
    assert.equal(body.actor_type, 'person');
    assert.equal(body.tenant_id, college.tenantId);
    assert.equal(body.has_access, true);
    assert.equal(body.assignments.length, 1);
    assert.equal(body.assignments[0].role_key, 'college_admin');
    assert.equal(body.assignments[0].scope_type, 'institution');
    assert.ok(body.permissions.includes('role.assign'));
    assert.ok(body.permissions.includes('person.manage'));
  });

  it('rejects a weak password at activation with a field error', async () => {
    const college = await collegeWithInvitedAdmin();
    const res = await post('/v1/auth/accept-invite', {
      institution_code: college.code, token: college.invitationToken, password: 'short',
    });
    assert.equal(res.statusCode, 422);
    assert.ok(res.json().error.field_errors.password);
  });

  it('an invitation token is single use', async () => {
    const college = await collegeWithInvitedAdmin();
    const first = await post('/v1/auth/accept-invite', {
      institution_code: college.code, token: college.invitationToken, password: 'strong-pass-99',
    });
    assert.equal(first.statusCode, 200);
    const second = await post('/v1/auth/accept-invite', {
      institution_code: college.code, token: college.invitationToken, password: 'another-pass-99',
    });
    assert.equal(second.statusCode, 401, 'a consumed token is refused');
  });

  it('an unknown institution code fails exactly like a bad credential', async () => {
    const college = await collegeWithInvitedAdmin();
    const unknownCollege = await post('/v1/auth/login', {
      institution_code: 'no-such-college', identifier: college.email, password: 'x-1234567890',
    });
    assert.equal(unknownCollege.statusCode, 401);
    assert.equal(unknownCollege.json().error.code, 'UNAUTHENTICATED');
  });

  it('a credential from one college does not work at another', async () => {
    const account = await seedPlatformAccount();
    const login = await signInPlatform(harness.app, account.email, account.password);
    const token = login.body.data.access_token;

    const a = await provisionCollege(harness.app, token, {
      code: 'east-college', name: 'East College', adminEmail: 'shared@x.edu',
    });
    await provisionCollege(harness.app, token, {
      code: 'west-college', name: 'West College', adminEmail: 'shared@x.edu',
    });

    await post('/v1/auth/accept-invite', {
      institution_code: 'east-college', token: a.body.data.invitation.token, password: 'east-pass-123',
    });

    const crossTenant = await post('/v1/auth/login', {
      institution_code: 'west-college', identifier: 'shared@x.edu', password: 'east-pass-123',
    });
    assert.notEqual(crossTenant.statusCode, 200, 'identities are per tenant, per OD-M1-5');
  });
});

describe('authorization surface', () => {
  it('an unauthenticated caller cannot provision an institution', async () => {
    const res = await harness.app.inject({
      method: 'POST', url: '/v1/institutions',
      payload: { code: 'x-college', name: 'X College', admin: { full_name: 'A B', email: 'a@b.edu' } },
    });
    assert.equal(res.statusCode, 401);
  });

  it('a tenant user gets not-found rather than forbidden on a platform endpoint', async () => {
    const college = await collegeWithInvitedAdmin();
    await post('/v1/auth/accept-invite', {
      institution_code: college.code, token: college.invitationToken, password: 'strong-pass-99',
    });
    const login = await post('/v1/auth/login', {
      institution_code: college.code, identifier: college.email, password: 'strong-pass-99',
    });

    const res = await harness.app.inject({
      method: 'POST', url: '/v1/institutions',
      headers: { authorization: `Bearer ${login.json().data.access_token}` },
      payload: { code: 'y-college', name: 'Y College', admin: { full_name: 'A B', email: 'a@b.edu' } },
    });
    assert.equal(res.statusCode, 404, 'forbidden would confirm the endpoint exists for someone else');
  });

  it('a tampered access token is rejected', async () => {
    const account = await seedPlatformAccount();
    const login = await signInPlatform(harness.app, account.email, account.password);
    const parts = (login.body.data.access_token as string).split('.');
    const forged = `${parts[0]}.${Buffer.from(JSON.stringify({ sub: 'x', act: 'platform' })).toString('base64url')}.${parts[2]}`;
    const res = await harness.app.inject({
      method: 'GET', url: '/v1/auth/me', headers: { authorization: `Bearer ${forged}` },
    });
    assert.equal(res.statusCode, 401);
  });
});
