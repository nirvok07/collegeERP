/**
 * Pure domain policy: scope containment and authority resolution. No database,
 * because these are the rules, not their storage.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scopeContains, type Scope, type ScopeAncestry } from '../src/modules/identity/domain/scope.ts';
import { can, hasNoAuthority, permissionKeys, type ActiveAssignment, type Authority } from '../src/modules/identity/domain/authority.ts';
import {
  afterFailedAttempt, afterSuccessfulSignIn, evaluateSignIn, validatePassword,
} from '../src/modules/identity/domain/account-policy.ts';

const CAMPUS = 'c0000000-0000-4000-8000-000000000001';
const DEPT = 'd0000000-0000-4000-8000-000000000001';
const OTHER_DEPT = 'd0000000-0000-4000-8000-000000000002';
const SECTION = 's0000000-0000-4000-8000-000000000001';

const at = new Date('2026-09-12T10:00:00Z');

const assignment = (over: Partial<ActiveAssignment> = {}): ActiveAssignment => ({
  id: 'a1', roleId: 'r1', roleKey: 'faculty',
  permissionKeys: ['person.read'],
  scope: { type: 'department', refId: DEPT },
  validFrom: new Date('2026-01-01T00:00:00Z'),
  validTo: null,
  ...over,
});

const authorityOf = (...assignments: ActiveAssignment[]): Authority => ({
  personId: 'p1', tenantId: 't1', assignments,
});

describe('scope containment (BR-14)', () => {
  it('institution scope reaches everything', () => {
    assert.equal(scopeContains({ type: 'institution', refId: null }, { type: 'section', refId: SECTION }, []), true);
  });

  it('an exact scope match is contained', () => {
    assert.equal(scopeContains({ type: 'department', refId: DEPT }, { type: 'department', refId: DEPT }, []), true);
  });

  it('a different department of the same type is not contained', () => {
    assert.equal(scopeContains({ type: 'department', refId: DEPT }, { type: 'department', refId: OTHER_DEPT }, []), false);
  });

  it('department scope reaches a section through its ancestry', () => {
    const target: Scope = { type: 'section', refId: SECTION };
    const ancestry: ScopeAncestry[] = [
      { type: 'program', refId: 'prog-1' },
      { type: 'department', refId: DEPT },
      { type: 'campus', refId: CAMPUS },
    ];
    assert.equal(scopeContains({ type: 'department', refId: DEPT }, target, ancestry), true);
  });

  it('a section does not reach upward to its department', () => {
    assert.equal(
      scopeContains({ type: 'section', refId: SECTION }, { type: 'department', refId: DEPT }, []),
      false,
      'containment is downward only',
    );
  });

  it('campus scope reaches a department on that campus but not another campus', () => {
    const ancestry: ScopeAncestry[] = [{ type: 'campus', refId: CAMPUS }];
    assert.equal(scopeContains({ type: 'campus', refId: CAMPUS }, { type: 'department', refId: DEPT }, ancestry), true);
    assert.equal(scopeContains({ type: 'campus', refId: 'other-campus' }, { type: 'department', refId: DEPT }, ancestry), false);
  });
});

describe('authority resolution (BR-20, AD-18)', () => {
  it('grants when permission and scope both match', () => {
    const a = authorityOf(assignment());
    assert.equal(can(a, 'person.read', { type: 'department', refId: DEPT }, [], at), true);
  });

  it('denies when the permission is absent even though scope matches', () => {
    const a = authorityOf(assignment());
    assert.equal(can(a, 'role.assign', { type: 'department', refId: DEPT }, [], at), false);
  });

  it('denies when the permission is held but out of scope', () => {
    const a = authorityOf(assignment());
    assert.equal(can(a, 'person.read', { type: 'department', refId: OTHER_DEPT }, [], at), false);
  });

  it('denies before validity starts and after it ends', () => {
    const future = authorityOf(assignment({ validFrom: new Date('2027-01-01T00:00:00Z') }));
    assert.equal(can(future, 'person.read', { type: 'department', refId: DEPT }, [], at), false);

    const expired = authorityOf(assignment({ validTo: new Date('2026-06-30T00:00:00Z') }));
    assert.equal(can(expired, 'person.read', { type: 'department', refId: DEPT }, [], at), false);
  });

  it('combines several assignments held at once', () => {
    const a = authorityOf(
      assignment(),
      assignment({
        id: 'a2', roleKey: 'department_head',
        permissionKeys: ['role.assign', 'audit.read'],
        scope: { type: 'department', refId: OTHER_DEPT },
      }),
    );
    assert.equal(can(a, 'person.read', { type: 'department', refId: DEPT }, [], at), true);
    assert.equal(can(a, 'role.assign', { type: 'department', refId: OTHER_DEPT }, [], at), true);
    assert.equal(can(a, 'role.assign', { type: 'department', refId: DEPT }, [], at), false,
      'authority does not leak between the scopes one person holds');
  });

  it('a person with no assignment has no authority, which is a state not an error', () => {
    const none = authorityOf();
    assert.equal(hasNoAuthority(none, at), true);
    assert.equal(can(none, 'person.read', { type: 'institution', refId: null }, [], at), false);
    assert.equal(permissionKeys(none, at).size, 0);
  });

  it('an expired assignment leaves the person with no authority', () => {
    const a = authorityOf(assignment({ validTo: new Date('2026-06-30T00:00:00Z') }));
    assert.equal(hasNoAuthority(a, at), true);
  });
});

describe('account policy (BR-11, BR-12)', () => {
  it('allows an active account', () => {
    assert.deepEqual(
      evaluateSignIn({ status: 'active', failedAttempts: 0, lockedUntil: null }, at),
      { kind: 'allow' },
    );
  });

  it('refuses while the lock has not elapsed, and allows once it has', () => {
    const locked = evaluateSignIn(
      { status: 'locked', failedAttempts: 5, lockedUntil: new Date(at.getTime() + 60_000) }, at,
    );
    assert.equal(locked.kind, 'locked');

    const elapsed = evaluateSignIn(
      { status: 'locked', failedAttempts: 5, lockedUntil: new Date(at.getTime() - 60_000) }, at,
    );
    assert.equal(elapsed.kind, 'allow', 'the lock clears by itself');
  });

  it('reports an invited account distinctly so the message can say what to do', () => {
    const result = evaluateSignIn({ status: 'invited', failedAttempts: 0, lockedUntil: null }, at);
    assert.equal(result.kind, 'not_active');
  });

  it('locks on the fifth failure, not before', () => {
    let state = { status: 'active' as const, failedAttempts: 0, lockedUntil: null as Date | null };
    for (let i = 1; i <= 4; i++) {
      const next = afterFailedAttempt(state, at);
      state = { status: next.status as 'active', failedAttempts: next.failedAttempts, lockedUntil: next.lockedUntil };
      assert.equal(state.lockedUntil, null, `attempt ${i} does not lock`);
    }
    const fifth = afterFailedAttempt(state, at);
    assert.equal(fifth.status, 'locked');
    assert.ok(fifth.lockedUntil);
  });

  it('a successful sign-in clears the counter and releases an elapsed lock', () => {
    const cleared = afterSuccessfulSignIn({ status: 'locked', failedAttempts: 4, lockedUntil: null });
    assert.equal(cleared.failedAttempts, 0);
    assert.equal(cleared.lockedUntil, null);
    assert.equal(cleared.status, 'active');
  });

  it('rejects weak passwords with a usable message', () => {
    assert.ok(validatePassword('short'));
    assert.ok(validatePassword('alllettersonly'));
    assert.equal(validatePassword('goodpassword1'), null);
  });
});
