# M1 — Identity and Access

**Phase 0. Status: specification for review.**

## Context carried in

Referenced rather than repeated:

- [AD-1](../adr.md) authority is role × scope × validity
- [AD-2](../adr.md) campus is a first-class scope
- [AD-12](../adr.md) optimistic versioning, conflicts surfaced
- [AD-13](../adr.md) correction is a workflow, never a database edit
- [Blueprint 1](../01-actors.md) §1.3 the authority model
- [Blueprint 3](../03-modules.md) §3.3 data ownership
- Platform capabilities P1 approvals, P2 notifications, P6 audit, P7 search

**Assumption recorded for this module:** back-office screens are specified desktop-first with
defined mobile behaviour, with the web console resolved by AD-24 and AD-54. The administrative screens
here become the weakest part of the product, and I would raise that again before building.

---

## 1. Module Overview

**Purpose.** Establish who a person is, prove it at each visit, and decide what they may do,
over which part of the institution, during which period.

**Business problem.** Colleges run on informal authority. A clerk "handles admissions", a senior
professor "looks after the exam cell", the office shares one login because creating accounts is
painful. Three failures follow, and all three are expensive.

1. **Shared accounts destroy accountability.** When five clerks use one login, no mark change,
   fee waiver or record edit can be attributed to a person. Every audit requirement in the
   product collapses at this point. Reducing account friction is therefore a security feature,
   not a convenience feature.
2. **A role column cannot model a real college.** A professor is faculty for four courses, head
   of a department, and a member of the exam committee, each with different reach.
3. **Authority outlives the job.** People change roles every June. Systems that never revoke
   leave a decade of standing access nobody reviews.

**Module owner.** System Administrator operates it. The Principal owns the policy of who may
hold which authority.

**Primary users.** System Administrator, HR Officer, Principal.

**Secondary users.** Every user for their own sign-in, profile, devices and access view.
Registrar and Admission Officer, whose work creates identities. Platform Support for
impersonation. Auditor for the access trail.

**Responsibilities.** Person identity and deduplication. Accounts and credentials.
Authentication, sessions and devices. The permission catalogue. Role definitions. Role
assignments with scope and validity. Delegation. Committee membership as authority. Guardian
links and consent. Impersonation. Account lifecycle from invitation to archive. The access
audit trail.

### Boundaries

| Inside M1 | Outside M1 | Owner |
|---|---|---|
| Person, account, credential, session | The organizational tree itself | M2 |
| Role definition and assignment | Employee record, service book, salary | M13 |
| Committee membership as authority | Committee remit and constitution | M2 |
| Guardian link and consent | Student academic record | M5 |
| Impersonation grants | Applicant record | M4 |
| Access audit events emitted | Audit storage and browsing | P6 |
| Approval requests raised | The approval engine | P1 |
| Notification triggers | Delivery across channels | P2 |

**The distinction that shapes everything:** a **Person** is a human the institution knows about.
A **UserAccount** is a way to sign in. They are not the same. A guardian who never logs in, an
applicant who is rejected, and a staff member who left five years ago are all persons without
active accounts. Conflating them forces the creation of fake accounts for people who will never
authenticate, which is how directories fill with unusable records.

---

## 2. Actors in this module

| Actor | What they do here | What they must not do |
|---|---|---|
| System Administrator | Invite, deactivate, assign roles within delegated limits, manage sessions, resolve duplicates | Grant themselves financial or result authority, read academic or financial content |
| Principal | Approve sensitive authority grants, approve impersonation, review the access register | Day-to-day account administration |
| HR Officer | Create staff persons and trigger invitations, set employment periods | Assign academic or financial authority |
| Registrar or Admission Officer | Cause student identities to exist through admission | Assign staff roles |
| Head of Department | Delegate their own authority, view who holds what inside their department | Grant authority they do not hold |
| Any user | Sign in, manage own devices, see own access, request access | See another person's sessions or access |
| Student | Sign in, manage guardian consent | Anything administrative |
| Platform Support | Request time-boxed read-only impersonation | Write anything, export anything |
| Auditor | Read the access and audit register within an agreed scope | Any mutation |

---

## 3. User journeys

Journeys differ by role. The same module presents four genuinely different products.

**J1. System Administrator, new academic year staffing.** Opens People, filters to staff with
assignments expiring this month, selects forty rows, bulk-extends validity to the new academic
year, reviews the eleven that failed validation because their employment period ends sooner,
resolves those individually. Elapsed time target: under ten minutes. This is the journey that
decides whether the module is loved or hated.

**J2. New faculty member, first day.** Receives an invitation, sets a password, is required to
enrol a second factor because their role will carry mark-entry authority, lands on a home screen
that already shows their assigned courses because HR and the timetable ran ahead of them.

**J3. A teacher who cannot see their class.** Opens My Access, sees in plain language that they
hold Faculty for three courses and that the fourth was never assigned, and taps Request access,
which raises an approval to their Head of Department rather than a phone call to the office.

**J4. Head of Department going on leave.** Opens Delegation, picks the colleague, the date range
and which of their authorities to delegate, confirms. Approvals route to the delegate for that
window and the audit trail records both names.

**J5. Principal reviewing authority.** Opens the access register, sees every assignment granting
financial or result authority on one screen with who granted it and when, and revokes two that
belong to people who changed jobs.

**J6. Auditor asking who saw a student's marks.** Filters the access audit by the student, the
date range and the event type, exports with a reason recorded against the export itself.

**J7. Support investigating a tenant issue.** Requests impersonation with a stated reason, waits
for the institution's approval, works read-only inside a persistently banner-marked session that
expires automatically.

---

## 4. Workflows

Format per workflow: trigger, actor, preconditions, inputs, validation, rules, decision, state
change, data change, notification, approval, next, success, failure, correction, audit.

### W0 — Provision a college with its initial administrator

The first workflow chronologically, and the only one that creates a tenant. One flow, one
transaction, three entities that stay conceptually separate.

- **Trigger.** A new college is onboarded.
- **Actor.** Platform Owner. No other actor can perform it.
- **Preconditions.** None inside the tenant, because the tenant does not exist yet. This is the
  only workflow in the system with no preconditions, which is precisely what makes it a bootstrap.
- **Inputs.** College identity and configuration, plus the initial administrator's name, email
  and phone, entered in the same form.
- **Validation.** College code unique across the platform. Administrator email well-formed.
  Seat and plan limits set. The administrator's email is validated for deliverability shape but
  not for prior existence, since prior existence is scoped to a tenant that does not yet exist.
- **Business rules.** BR-25 and BR-26 below.
- **State change, all inside one transaction.**
  1. Institution created with status `active` or `trial`. Owned by M2.
  2. Person created, `person_type` staff, status `provisional`. Owned by M1.
  3. UserAccount created with status `invited`. Owned by M1.
  4. RoleAssignment created: role College Administrator, `scope_type` institution,
     `scope_ref_id` the new institution, validity open-ended, `source` bootstrap,
     `granted_by` the Platform Owner, status `active`.
  5. InvitationToken issued.
- **Outside the transaction.** Invitation delivery, which is queued and retried. Email cannot be
  transactional, so the boundary sits exactly here: every record commits together, delivery is
  best-effort with visible status.
- **Notification.** Invitation to the administrator. Confirmation to the Platform Owner carrying
  the delivery status, not a claim of success.
- **Approval.** None inside the tenant. Authorization comes from the platform, per BR-25.
- **Success.** The administrator activates, sets a credential, enrols a second factor because the
  role is sensitive, and has full authority over their college immediately.
- **Failure.** Any step failing rolls back all of it. A college with no administrator is not a
  recoverable state, it is a support ticket, so partial success is not permitted.
- **Correction.** Wrong email is corrected by reissuing the invitation, which invalidates the
  previous token. A wrong person entirely is corrected by assigning a second administrator and
  revoking the first, which is the ordinary W4 and W5 path and needs no special mechanism.
- **Audit.** Institution created, person created, account created and assignment granted, all
  under one correlation id, attributed to the Platform Owner, with the bootstrap source recorded
  so this grant is distinguishable from every ordinary grant during a later access review.

### W1 — Invite and activate an account

- **Trigger.** A person needs access, usually from `employee.created` or `student.admitted`.
- **Actor.** System Administrator or HR Officer, or the system automatically.
- **Preconditions.** A Person record exists, or is created in the same transaction as part of
  W0 or a bulk import. No active account for that person.
- **Inputs.** Person, contact channel, initial role assignment, validity.
- **Validation.** Contact is unique among active accounts in the tenant. The person has no
  active account. The proposed assignment is within the inviter's own authority.
- **Rules.** BR-2 sensitive roles need approval before the invitation is sent, not after.
  BR-15 one active account per person.
- **Decision.** Sensitive role, or ordinary role.
- **State change.** UserAccount `none → invited`.
- **Data.** UserAccount created, InvitationToken issued with an expiry, RoleAssignment created
  in `pending` or `active`.
- **Notification.** Invitation to the contact channel, with an expiry stated in it.
- **Approval.** Principal, only for sensitive authority.
- **Next.** Activation, reminder, or expiry.
- **Success.** Person sets a credential, enrols a factor if required, account becomes `active`.
- **Failure.** Token expired, contact unreachable, person already has an account.
- **Correction.** Reissue the invitation, which invalidates the previous token.
- **Audit.** Invitation issued, by whom, with which assignment. Activation with device and IP.

### W2 — Authenticate

- **Trigger.** A sign-in attempt.
- **Actor.** Any user.
- **Preconditions.** Account exists and is `active` or `invited` with a valid token.
- **Inputs.** Identifier and credential, second factor where required, device fingerprint.
- **Validation.** Credential correct, account not locked or suspended, tenant not suspended.
- **Rules.** BR-11 lock after five failures in fifteen minutes, unlocking automatically after
  thirty. BR-12 second factor mandatory for financial and result authority. BR-16 concurrent
  sessions from more than three distinct devices raise a shared-account signal.
- **Decision.** Grant, challenge for a second factor, deny, or lock.
- **State change.** Session `none → active`. On repeated failure, account `active → locked`.
- **Data.** Session, Device, LoginAttempt written whether successful or not.
- **Notification.** New device sign-in to the account owner. Lock notification. Shared-account
  signal to the System Administrator.
- **Next.** Landing route resolved from the effective permission set.
- **Failure.** Wrong credential, locked, suspended, tenant suspended, factor unavailable. Each
  gets a distinct, non-enumerating message: the user is told what to do, never whether the
  identifier exists.
- **Correction.** Reset, or an administrator unlock which is itself audited.
- **Audit.** Every attempt, successful or not, with device, address and outcome.

### W3 — Reset a forgotten credential

- **Trigger.** User request, or administrator action.
- **Validation.** The identifier resolves to exactly one active account. Rate limited per
  identifier and per address.
- **Rules.** A reset never reveals whether an identifier exists. Tokens are single-use and
  short-lived. All sessions end on a successful reset.
- **State change.** Sessions `active → revoked`. Account `locked → active` if it was locked.
- **Notification.** Reset link, then a confirmation that the credential changed, which is the
  signal a victim needs if the reset was not theirs.
- **Audit.** Requested, completed, and by whom if administrator-initiated.

### W4 — Assign a role with scope and validity

- **Trigger.** Appointment, committee constitution, or a granted access request.
- **Actor.** System Administrator, HOD within their department, Principal.
- **Preconditions.** Person has an account. Scope exists. Assigner holds the authority.
- **Inputs.** Person, role, scope type and reference, validity window, reason.
- **Validation.** BR-4 validity lies inside the employment period. Scope is within the
  assigner's own scope. No identical active assignment already exists. Validity start is not in
  the past beyond a configured grace, because backdated authority is how audit trails are
  laundered.
- **Rules.** BR-2 sensitive roles need Principal approval. BR-20 scope containment governs
  every later check.
- **Decision.** Immediate, or pending approval.
- **State change.** RoleAssignment `draft → pending → active`, or `draft → active`.
- **Data.** RoleAssignment written. Effective permission cache invalidated for that person.
- **Notification.** To the person, stating what they can now do and where. To the approver when
  pending.
- **Approval.** Per BR-2.
- **Success.** Access takes effect within one cache generation, which is bounded and stated.
- **Failure.** Outside the assigner's scope, conflicts with the employment period, duplicate.
- **Correction.** Revoke and reassign. Never edit an active assignment's scope, because that
  would retroactively change what past actions were authorized by.
- **Audit.** Granted by whom, to whom, what, where, for how long, and why.

### W5 — Revoke or expire an assignment

- **Trigger.** Manual revocation, validity expiry, `employee.exited`, academic year rollover.
- **Rules.** BR-8 the last active System Administrator cannot be removed. BR-19 exit expires
  every assignment at the exit date. BR-13 year-scoped assignments expire at rollover.
  Assignments expire, they are never deleted, so historical actions stay explicable.
- **State change.** `active → revoked` or `active → expired`.
- **Side effect.** Pending approvals raised under the revoked authority do not silently vanish.
  They are reassigned to the role's current holder and flagged, because an orphaned approval
  queue is where requests go to die.
- **Notification.** To the person, and to anyone whose pending request was reassigned.
- **Audit.** Who revoked, why, and what pending work moved.

### W6 — Delegate authority

- **Trigger.** Planned absence.
- **Actor.** Any holder of delegable authority.
- **Inputs.** Delegate, authorities to delegate, date range, reason.
- **Validation.** BR-5 the delegation cannot exceed the delegator's own authority nor outlast
  it. BR-6 the delegate may not sub-delegate. The delegate must hold an active account.
- **State change.** Delegation `scheduled → active → ended`, automatically on dates.
- **Rules.** During the window both the delegator and the delegate can act. Every act by the
  delegate is recorded as performed by the delegate on behalf of the delegator, in both names.
- **Notification.** To the delegate on creation and on activation. To the delegator on expiry.
- **Correction.** Cancel, which takes effect immediately and does not unwind completed acts.
- **Audit.** The delegation itself, and each act performed under it.

### W7 — Constitute a committee

- **Trigger.** A board or Principal decision.
- **Rules.** Committee membership is a role assignment whose scope is the committee. There is no
  second authority mechanism. This is how an ordinary faculty member gains authority to approve
  a mark correction without becoming an administrator.
- **Validation.** Committees with approval authority need a minimum membership, and a quorum
  rule where decisions require one.
- **State change.** Assignments created with the committee's term as their validity.
- **Audit.** Constitution, each membership, and dissolution.

### W8 — Link a guardian with consent

- **Trigger.** Admission, or a guardian request.
- **Rules.** BR-10 for a student under eighteen the registered guardian is linked automatically.
  For an adult student the link requires the student's consent, which is withdrawable at any
  time and takes effect immediately. A guardian sees attendance, results, fees and notices for
  the linked ward only, and nothing else, ever.
- **State change.** GuardianLink and ConsentRecord `requested → active → withdrawn`.
- **Notification.** To the student when a link is requested and when it activates. To the
  guardian on withdrawal, worded so it does not read as an accusation.
- **Audit.** Consent granted and withdrawn, with timestamps, because this is a data protection
  obligation rather than a convenience.

### W9 — Offboard

- **Trigger.** `employee.exited` or `student.status_changed` to an exit status.
- **Rules.** All assignments expire at the effective date. Sessions end. The account moves to
  `deactivated`, never deleted. The person record is retained under the retention policy so that
  historical marks, approvals and receipts remain attributable.
- **Failure.** If the person holds pending approvals or unsubmitted marks, offboarding does not
  block, but it raises a handover task listing exactly what must be reassigned. Blocking an exit
  is unrealistic. Losing the work is unacceptable.
- **Audit.** Offboarding, what expired, what was handed over.

### W10 — Support impersonation

- **Trigger.** A support case.
- **Rules.** BR-9. Read-only. Institution approval required. Maximum sixty minutes. A persistent
  banner throughout. Every read audited, not merely the session. Export and write are refused at
  the policy layer, not hidden in the interface.
- **State change.** ImpersonationGrant `requested → approved → active → ended`, or `denied`.
- **Notification.** To the Principal on request, and to the institution on start and end.
- **Audit.** The grant, the reason, every record read during the session.

### W11 — Merge duplicate persons

- **Trigger.** Duplicate detected by rule or reported.
- **Validation.** Both records must be the same human, confirmed by an administrator with a
  recorded justification. Two accounts with different active employment cannot be merged.
- **Rules.** The surviving record keeps one identity. The merged record becomes a permanent
  alias so historical references still resolve. A merge is reversible for seven days, then
  becomes terminal.
- **Data.** PersonMergeRecord retains both original states in full.
- **Audit.** The merge, the justification, and the reversal window.

### W12 — Sessions and devices

- **Trigger.** User or administrator action.
- **Rules.** A user may end any of their own sessions. An administrator may end another's with
  a reason, which notifies that user. Ending a session is immediate, not on next request, which
  matters when a device is lost.
- **Audit.** Session ended, by whom, why.

---

## 5. State machines

### UserAccount

```
        invite                activate
none ───────────▶ invited ──────────────▶ active ◀────────────┐
                    │                      │  │               │ unlock (auto or admin)
                    │ expire               │  │ 5 failures    │
                    ▼                      │  └──────────────▶ locked
                 expired                   │
                    │ reissue              │ suspend / reinstate
                    └──────────▶ invited   ├───────────────▶ suspended
                                           │ offboard
                                           ▼
                                      deactivated ──── retention ────▶ archived
```

Terminal: `archived`. Reversible: `locked`, `suspended`, and `deactivated` on rejoining, which
creates a new employment period rather than erasing the old one. Automatic: lock on failures,
unlock on cooldown, deactivation on an exit event, archival on retention expiry.

### RoleAssignment

`draft → pending → active → expiring → expired`, with `active → revoked` at any time and
`pending → rejected`. `expiring` is a real state, entered thirty days before the validity end,
because its only purpose is to drive the renewal report that prevents the June access cliff.
Expiry and entry to `expiring` are automatic. `expired` and `revoked` are terminal, and renewal
creates a new assignment rather than resurrecting an old one.

### Delegation

`scheduled → active → ended`, plus `cancelled` from either. Both transitions to and from
`active` are scheduled and automatic. Nothing about a delegation is retroactive.

### GuardianConsent

`requested → active → withdrawn`, plus `expired` when the student graduates or the link's
validity ends. Withdrawal is immediate, always available to the student, and terminal for that
link. A new link requires new consent.

### ImpersonationGrant

`requested → approved → active → ended`, plus `denied` and `expired`. Automatic expiry at sixty
minutes. `ended` is terminal. No extension exists, by design, because an extendable grant is an
unbounded grant.

### Person

`provisional → verified`, plus `merged` which is terminal and `archived` under retention.
Provisional exists because an applicant is a person before anyone has checked a document.

---

## 6. Business rules

**Bootstrap**

- BR-25 IF a role assignment is created during tenant provisioning THEN it is authorized by
  platform authority and BR-2's in-tenant approval requirement does not apply. Without this
  exception the first administrator can never be created, because their approver would have to
  exist inside a tenant that has no users yet. The exception is narrow: it applies only to
  `source = bootstrap`, only at institution scope, only to the College Administrator role, and
  only while the tenant has no other active administrator.
- BR-26 The initial administrator holds an ordinary role assignment. It carries no flag, no
  primacy and no special status. Replacement, suspension, revocation and additional
  administrators are the ordinary W4 and W5 paths, and the bootstrap grant is revocable like any
  other once a second administrator exists, per BR-8.

**Authorization**

- BR-1 IF a user holds no active assignment THEN they authenticate successfully and see a
  designed "no access yet" screen naming who to contact, never an error and never a blank page.
- BR-2 IF a role grants financial, result-publication, or role-granting authority THEN the
  assignment requires Principal approval before it takes effect.
- BR-20 IF any active assignment grants permission P AND its scope contains the target record's
  scope THEN access is granted. Otherwise denied. Deny is the default.
- BR-14 Department scope implies its programs and sections. Scope containment is evaluated up
  the tree at request time. A flattened scope list is never stored, because it is stale the
  moment a section is created.
- BR-21 IF a permission is scoped to an academic year THEN access to records of other years is
  read-only for reporting roles and denied for operational roles.

**Assignment integrity**

- BR-3 Email is unique per tenant among active accounts. Enrollment number and employee code are
  each unique per tenant. None of them is unique across tenants, because one person may work at
  two colleges.
- BR-4 An assignment's validity must lie inside the person's employment period where one exists.
- BR-15 A person holds at most one active account. A second requires an explicit merge.
- BR-8 The system refuses the removal of the last active System Administrator.
- BR-22 An active assignment's role or scope is never edited. Revoke and reassign, so that past
  actions remain explicable by the authority that existed when they happened.
- BR-13 Year-scoped assignments expire automatically at rollover and appear in the pre-flight
  report before it runs.
- BR-19 On exit, every assignment expires at the exit date and all sessions end.

**Delegation and approval**

- BR-5 A delegation may not exceed the delegator's authority nor outlast their own assignment.
- BR-6 No sub-delegation. A delegate may not delegate onward.
- BR-7 No self-approval. An approver may not approve a request they raised, including through a
  delegation. Where this leaves no eligible approver, the request escalates to the Principal.

**Credentials and sessions**

- BR-11 Five failures within fifteen minutes locks the account for thirty, and the lock is
  announced to the owner.
- BR-12 A second factor is mandatory for financial and result authority and optional elsewhere,
  configurable upward per tenant but never downward below that floor.
- BR-23 A credential change ends every session for that account.
- BR-16 More than three concurrent sessions across distinct devices raises a shared-account
  signal to the administrator rather than blocking, because blocking mid-admission-season would
  be worse than the problem.
- BR-24 Authentication never reveals whether an identifier exists.

**Privacy**

- BR-10 A guardian link for an adult student requires their consent and is withdrawable
  immediately. For a minor it is automatic to the registered guardian.
- BR-18 Exporting personal data requires a distinct export permission, and every export records
  who, what, how many rows and why.
- BR-9 Impersonation is read-only, institution-approved, capped at sixty minutes,
  banner-marked, and every read is audited.
- BR-17 Nothing here is hard-deleted while any audit record references it.

---

## 7. Data model

Classification: **M** master, **T** transactional, **R** reference, **D** derived, **A** audit.

### Person — M

Purpose: the human, independent of whether they can sign in.

`id`, `tenant_id`, `full_name`, `preferred_name`, `date_of_birth`, `gender`, `photo_id`,
`primary_email`, `primary_phone`, `person_type` (staff, student, guardian, applicant, external),
`status` (provisional, verified, merged, archived), `merged_into_id`, `created_at`,
`updated_at`, `version`, `deleted_at`.

Unique: none globally. Duplicate detection is a rule over name, date of birth and phone, not a
constraint, because real duplicates are legitimate near-matches that a human must judge.
History: name changes are retained, since certificates were issued under the old one.

### UserAccount — M

`id`, `tenant_id`, `person_id`, `login_identifier`, `status`, `mfa_required`, `mfa_enrolled_at`,
`last_login_at`, `failed_attempts`, `locked_until`, `must_change_credential`, `activated_at`,
`deactivated_at`, `created_at`, `updated_at`, `version`.

Unique: `login_identifier` per tenant among non-deactivated accounts. One active account per
person, enforced by a partial unique index rather than by application code.

### Credential — M, sensitive

`id`, `account_id`, `hash`, `algorithm`, `updated_at`, `previous_hashes` (last five, for reuse
prevention only). Never read outside authentication. Never logged. Never exported.

### AuthFactor — M, sensitive

`id`, `account_id`, `type` (totp, sms, email), `secret_ref`, `verified_at`, `last_used_at`,
`status`. Secrets live in a secret store, not in this row.

### PermissionDefinition — R

`key` (`attendance.mark`, `result.publish`, `person.export`), `module`, `label`, `description`,
`sensitivity` (normal, sensitive, critical), `requires_mfa`, `delegable`.

Seeded by the platform, not editable per tenant. A tenant composes roles from these, it does not
invent permissions, because an invented permission enforces nothing.

### RoleDefinition — R, per tenant

`id`, `tenant_id`, `key`, `name`, `description`, `permission_keys[]`, `is_system`,
`allowed_scope_types[]`, `requires_approval`, `version`, `status`.

System roles ship as templates. A tenant may clone and adjust but not edit a system role in
place, so an upgrade can safely add a permission to a template.

### RoleAssignment — M, the heart of the module

`id`, `tenant_id`, `person_id`, `role_id`, `scope_type` (institution, campus, department,
program, section, committee, self), `scope_ref_id`, `valid_from`, `valid_to`, `status`,
`granted_by`, `granted_at`, `reason`, `approval_id`, `revoked_by`, `revoked_at`,
`revocation_reason`, `source` (manual, import, automatic, request), `version`.

Unique: one active assignment per person, role and scope. Indexed on person and status for the
permission resolution path, which is the hottest query in the system.

### Delegation — T

`id`, `tenant_id`, `delegator_person_id`, `delegate_person_id`, `assignment_ids[]`,
`valid_from`, `valid_to`, `reason`, `status`, `cancelled_by`, `cancelled_at`.

### GuardianLink — M, and ConsentRecord — A

Link: `id`, `guardian_person_id`, `student_person_id`, `relationship`, `is_primary`, `status`,
`valid_from`, `valid_to`.
Consent: `id`, `link_id`, `granted_by_person_id`, `granted_at`, `withdrawn_at`, `method`,
`evidence_ref`. Append-only. A withdrawal is a new row, never an update.

### Session — T

`id`, `account_id`, `device_id`, `issued_at`, `last_seen_at`, `expires_at`, `revoked_at`,
`revoked_by`, `revocation_reason`, `ip_hash`, `user_agent_family`, `impersonation_grant_id`.
Addresses are stored hashed, retained ninety days.

### Device — T

`id`, `account_id`, `fingerprint_hash`, `platform`, `label`, `first_seen_at`, `last_seen_at`,
`trusted`, `push_token_ref`.

### ImpersonationGrant — T

`id`, `tenant_id`, `support_person_id`, `requested_at`, `reason`, `approved_by`, `approved_at`,
`started_at`, `ended_at`, `expires_at`, `status`, `records_read_count`.

### InvitationToken, ResetToken — T, sensitive

`id`, `account_id`, `token_hash`, `expires_at`, `consumed_at`, `issued_by`. Hashed at rest.
Single use. Superseded by reissue.

### LoginAttempt — A

`id`, `tenant_id`, `identifier_hash`, `account_id`, `outcome`, `failure_reason`, `ip_hash`,
`device_fingerprint_hash`, `at`. Written for failures too, which is the point.

### PersonMergeRecord — A

`id`, `surviving_person_id`, `merged_person_id`, `merged_by`, `merged_at`, `justification`,
`before_state` (both records in full), `reversed_at`, `reversal_deadline`.

### EffectivePermissionSet — D, never persisted as truth

Computed per person from active assignments and delegations. Cached with a generation counter
per person, invalidated on any assignment, delegation, role definition or scope-tree change.
Cache lifetime is bounded at fifteen minutes so that a missed invalidation self-heals rather
than granting stale authority indefinitely.

**Deliberately absent tables.** There is no `committee_member` table, because membership is a
role assignment. There is no `user_permission` table, because direct permission grants bypass
the role model and become unreviewable. There is no `role` column on any other module's tables.

---

## 8. Source of truth

| Data | Owner | Who may modify | Who may read | Consumers | On change |
|---|---|---|---|---|---|
| Person identity | M1 | System Administrator, HR for staff, Admissions for applicants | Scoped by permission | Every module | `person.updated` |
| Account and credential | M1 | The owner, and administrators for lifecycle only | Nobody reads credentials | Authentication only | `account.status_changed` |
| Role assignment | M1 | Administrator, HOD in scope, Principal | The person, their chain, auditors | Every permission check | `assignment.changed`, cache invalidated |
| Permission catalogue | Platform | Platform only | All | Role editor | Versioned with the release |
| Delegation | M1 | The delegator | The pair, and auditors | P1 approvals | `delegation.activated`, `delegation.ended` |
| Guardian link and consent | M1, consent owned by the student | The student, guardians request only | The pair | M5, M7, M10, M11 | `guardian.link_changed` |
| Session | M1 | The owner, administrators | The owner, administrators | All requests | Immediate revocation |
| Employment period | M13 | HR | M1 reads it | Assignment validation | Constrains BR-4 |
| Organizational tree | M2 | Registrar, Administrator | M1 reads it | Scope resolution | Scope tree change invalidates caches |

M1 **owns** identity and authority. It **reads** the organizational tree and employment periods
and never writes them. No other module writes a role assignment; they request one through W4.

---

## 9. Permission matrix

Operations: V view, C create, E edit, S submit, A approve, R reject, X cancel, Z reverse,
D delete, P export, B bulk.

| Role | Person | Account lifecycle | Role assignment | Role definition | Delegation | Sessions | Impersonation | Audit |
|---|---|---|---|---|---|---|---|---|
| Platform Owner | — | — | — | — | — | — | C | V of platform events |
| Platform Support | V under grant | — | — | — | — | — | S | — |
| Principal | V B P | V E | V C A R Z B | V | V X | V | A R | V P |
| System Administrator | V C E B P | V C E X | V C E B, non-sensitive only | V C E | V | V E | — | V |
| HR Officer | V C E B for staff | S invite | V within HR scope | — | — | — | — | — |
| Head of Department | V in department | — | V C in department for teaching roles | — | V C X own | — | — | V own department |
| Faculty | V own, V directory | V own | V own | — | V C X own | V E own | — | V own |
| Student | V own | V own | V own | — | — | V E own | — | V own |
| Guardian | V linked ward, limited fields | V own | — | — | — | V E own | — | — |
| Auditor | V in agreed scope | V | V | V | V | V | V | V P |

**Contextual restrictions beyond the role.**

- **Scope.** Every row above is further constrained by the actor's scope. A Head of Department's
  view of People is their department, not the institution.
- **Campus.** Where a tenant has campuses, an assignment scoped to one campus grants nothing in
  another, including for administrators, unless scoped at institution level.
- **Academic year.** Year-scoped roles lose operational authority over closed years and retain
  read access only where the role includes reporting.
- **Record level.** A person may always read their own record. Nobody may edit their own role
  assignments, including the System Administrator, which prevents privilege escalation by the
  one role positioned to perform it.
- **Sensitive fields.** Date of birth, full address, guardian phone, government identifiers,
  photograph and every credential field are sensitive. They are masked by default in lists,
  revealed individually on a record with the reveal itself audited, and excluded from exports
  unless the export permission explicitly includes them.
- **Bulk and export.** Both are separate permissions from edit and view. The ability to change
  one record is not the ability to change four hundred, and the ability to read a record on
  screen is not the ability to carry the directory out of the building.

---

## 10. UI information architecture

The module is presented as **People and Access**, not as "User Management". Administrators think
in people, not in accounts.

```
People and Access
├── People                  the workhorse list, all persons in scope
│   └── Person detail       Profile · Access · Sessions · Activity
├── Access review           every assignment, filtered, bulk-operable
│   ├── Expiring            the renewal queue
│   └── Sensitive           financial and result authority on one screen
├── Roles                   definitions and their permissions
├── Delegations             active and scheduled
├── Requests                inbound access requests, an approval queue
└── Audit                   the access trail, filtered and exportable

Available to every user, outside the module:
├── My access               what I can do and where, and how to ask for more
├── My devices              sessions and sign-in history
└── Profile                 own details, credential, second factor
```

Four rules govern the interface.

1. **The list is the product.** Administrators live in the People list. It is a dense table with
   saved views, not a grid of cards. Cards waste the vertical space that makes a table scannable.
2. **Drawers for context, pages for work.** Assigning a role opens a drawer over the person, so
   the administrator keeps their place in the list. Editing a role definition is a page, because
   it affects everyone who holds it and deserves full attention.
3. **Modals only for confirmation.** Destructive or irreversible actions get a modal. Nothing
   else does.
4. **Every screen answers "why".** Access states show their cause. "No access to Section B"
   reads as "You hold Faculty for CS301 in Section A only", with the request action beside it.

### Navigation by role

Navigation is not one menu with disabled items. Disabled items advertise capabilities a user
will never have and generate support calls.

| Role | What they see |
|---|---|
| System Administrator | The full module |
| Principal | Access review, Requests, Audit. Not the People list as a primary surface, since they do not administer accounts |
| HR Officer | People filtered to staff, and invitations |
| Head of Department | A department-scoped People view, Delegations, Requests |
| Faculty, Student, Guardian | No module. Only My access, My devices and Profile in their own settings |

---

## 11. Screen specifications

### S1 — People list

- **Purpose.** Find a person and act, in seconds, at a scale of tens of thousands.
- **User.** System Administrator, HR Officer, Head of Department in scope.
- **Entry.** Module home, global search, command palette, a deep link from any other module.
- **Layout.** A persistent filter rail on the left at desktop width, a dense table filling the
  rest, a detail drawer sliding from the right. No top hero, no statistics cards above the
  table. Counts live in the filter chips where they are actionable.
- **Columns.** Name with photo and a status dot, identifier (enrollment or employee code), type,
  department, roles as up to two chips with an overflow count, account status, last active.
  Sensitive fields never appear here.
- **Sorting.** Any column, default by most recently updated, which surfaces the work in progress.
- **Pagination.** Cursor-based infinite scroll with a sticky header, plus a jump-to-letter rail.
  Page numbers are meaningless on a list this size.
- **Search.** One field matching name, identifier, email and phone, with results ranked by exact
  identifier first. Typing digits searches identifiers before names.
- **Filters.** Type, status, department, campus, role, assignment expiry window, second factor
  enrolled, never signed in, dormant. Combinations are saveable as named views, shareable within
  the tenant. Saved views are how a returning administrator resumes yesterday's work.
- **Bulk.** Select across pages with a clear count, then invite, extend validity, assign a role,
  deactivate or export. Every bulk action previews its effect and names how many rows will fail
  validation before it runs. Bulk actions run as a job with progress and a per-row result.
- **Inline.** Row hover reveals view, assign role and reset. A right-click context menu carries
  the same actions for keyboard and power users.
- **Primary action.** Add person, which offers single entry or import.
- **Loading.** Skeleton rows matching the real column widths. The filter rail stays interactive.
- **Empty.** No people yet gives an import-led empty state. No results for a filter gives a
  different one that names the filters and offers to clear them, which is the far more common case
  and must not be confused with the first.
- **Error.** An inline banner above the table retaining the last good data beneath it.
- **Permission.** Rows outside scope are absent, not greyed. Actions the user cannot perform are
  absent, not disabled.
- **Responsive.** Below 900px the table becomes a list of two-line rows with name, identifier and
  status, filters move into a bottom sheet, and bulk selection is retained but capped.

### S2 — Person detail

- **Purpose.** Everything about one person, and every action on them.
- **Layout.** A header carrying name, photo, identifier, type and account status, with primary
  actions. Four tabs beneath.
  - **Profile.** Identity fields. Sensitive fields masked with a reveal that is audited.
  - **Access.** The important tab. Active assignments as rows of role, scope, validity and who
    granted it. Expiring ones flagged. Below them, expired and revoked assignments collapsed by
    default, because history matters but should not compete with the present.
  - **Sessions.** Active sessions and devices, sign-in history, with end-session actions.
  - **Activity.** A timeline of what happened to this person's identity, sourced from the audit
    trail. Not what the person did elsewhere in the system, which belongs to the audit browser.
- **Primary action.** Assign role, opening S3.
- **Secondary.** Invite or reinvite, reset credential, suspend, deactivate, merge, export record.
- **States.** A deactivated person shows a full-width neutral banner stating when and why, and
  every mutating action is absent rather than failing on click.
- **Responsive.** Tabs become a scrollable segmented control. The header collapses to name and
  status on scroll.

### S3 — Assign role drawer

- **Purpose.** Grant authority correctly in under twenty seconds.
- **Layout.** A drawer over the person, four fields, one confirmation.
  - **Role.** Searchable, grouped by module, each showing a one-line plain-language summary of
    what it permits. Sensitive roles carry a marker and a note that approval is required.
  - **Scope.** A tree picker constrained to the granter's own scope, so an out-of-scope grant is
    impossible to express rather than rejected after the fact.
  - **Validity.** Defaults to the current academic year, which is right most of the time.
  - **Reason.** Required for sensitive roles, optional otherwise.
- **Live summary.** A sentence at the foot reading "Priya will be able to mark attendance and
  enter internal marks for Computer Science, until 30 June 2027." Permission lists are unreadable.
  A sentence is not.
- **Validation.** Inline and immediate. Employment period conflicts, duplicates and scope
  violations are all shown before submission.
- **Success.** The drawer closes, the new row animates into the access list, a toast confirms
  with an undo that is live for ten seconds.
- **Failure.** The drawer stays open with the field-level error attached to its field. Nothing
  typed is lost.

### S4 — Role definition editor

- **Purpose.** Compose a role from permissions without producing an unreviewable checkbox wall.
- **Layout.** A page. Permissions grouped by module, collapsed by default, each group showing a
  count of selected permissions. Presets sit at the top: Faculty, Class Advisor, Exam Cell,
  Accounts, and so on.
- **The critical element.** A live "what this role can do" panel in plain language, and a count
  of how many people currently hold the role. Editing a role held by four hundred people must
  feel consequential.
- **Validation.** Saving a role that removes a permission warns with the number of affected
  people and what they will lose.
- **System roles.** Read-only with a clone action.

### S5 — Bulk import

- **Purpose.** Onboard hundreds of people without hand entry.
- **Flow.** Upload, map columns with remembered mappings per tenant, **dry run** showing exactly
  what will be created, updated, skipped and rejected with per-row reasons, then commit as a
  background job with live progress and a downloadable result.
- **Rule.** No import commits without a dry run. This is the most destructive screen in the
  module and it must be impossible to use carelessly.

### S6 — Sign in

- **Purpose.** Get the right person in, fast, on a phone, often on a poor connection.
- **Layout.** Institution logo, one identifier field, one credential field, sign in. Nothing else
  above the fold. Forgotten credential below.
- **Detail that matters.** The identifier field accepts email, employee code or enrollment
  number, and detects which. Students do not know their email and should not have to.
- **States.** Inline errors, never a full-page error. A locked account states when it unlocks.
  A suspended account names who to contact. A second-factor challenge is a separate step with a
  paste-friendly single input and an obvious resend.
- **Failure.** Offline shows a specific message stating that sign-in needs a connection while
  previously saved data remains available, per AD-9.

### S7 — My access

- **Purpose.** Cut support load by answering "why can't I see this" without a phone call.
- **Layout.** Plain-language statements of what the user can do and where, grouped by area, each
  with its validity. A prominent request-access action. Below, the devices and sessions summary.
- **Why it exists.** Added during the UX review in section 20. It was not in the first draft, and
  its absence would have generated a large and entirely avoidable support burden.

### S8 — Access review

- **Purpose.** Let the Principal and the administrator see and fix authority in bulk.
- **Layout.** A table of assignments rather than people, filtered by expiry, sensitivity, role,
  scope and grantor. Two saved views ship by default, Expiring and Sensitive.
- **Bulk.** Extend, revoke, reassign, with the same preview-and-fail-count discipline as S1.

### S9 — Requests

An approval queue rendered by P1, carrying the requester, what they asked for, why, their current
access for comparison, and approve or reject with a reason. Keyboard-operable end to end, because
an approver processing twenty requests should never touch the mouse.

### S10 — Audit browser

Filter by actor, subject, event type, date, scope. Each row expands to before and after values.
Export requires the export permission and records its own reason. Read-only by construction.

---

## 12. UX interactions

- **Optimistic where safe, never where it matters.** Filtering, saved views and reordering apply
  instantly. Granting or revoking authority waits for the server and says so, because a role that
  appears granted but is not is worse than a half-second wait.
- **Undo over confirm.** Reversible actions such as assigning a role show a toast with a ten
  second undo. Irreversible ones such as deactivation or merge use a modal that requires typing
  the person's name. Confirmation dialogs on reversible actions train people to click through
  them, which is precisely what disarms the dialog that matters.
- **Inline validation on blur, not on keystroke.** Validating while someone types an email tells
  them they are wrong before they have finished being right.
- **Bulk progress is honest.** A job shows the running count of succeeded, failed and remaining,
  and the failures are reviewable while it runs.
- **Keyboard.** `/` focuses search. `g p` goes to People. `j` and `k` move rows. `Enter` opens.
  `a` assigns a role. `Escape` closes drawers. `Cmd K` opens the command palette, which searches
  people and actions together, so "assign Priya faculty" is reachable without navigation.
- **Autosave.** Filters and saved-view drafts autosave. Forms that create authority never do,
  because a half-typed grant must not become real.
- **Skeletons match reality.** Skeleton rows have the real column widths, so nothing shifts when
  data lands.
- **Motion.** The drawer slides 250ms with easing. A new assignment row fades and expands over
  200ms. Status changes cross-fade. Nothing else moves. All of it collapses to a cross-fade under
  reduced motion.

---

## 13. Responsive behaviour

| Surface | Desktop ≥1200 | Tablet 600-1199 | Mobile <600 |
|---|---|---|---|
| People list | Filter rail, dense table, right drawer | Filters in a collapsible sheet, table loses department and last-active columns | Two-line list rows, filters in a bottom sheet, drawer becomes a full page |
| Person detail | Header plus four tabs, drawer actions | Same, narrower | Tabs become a segmented control, actions collapse into an overflow menu, sticky primary action at the bottom |
| Assign role | Right drawer | Right drawer | Full-screen sheet with a sticky footer action |
| Role editor | Two-column, permissions beside the live summary | Stacked | Discouraged. Available read-only, with an explicit note that editing is better done on a larger screen |
| Bulk import | Full page wizard | Full page wizard | Not offered. The screen is refused with an explanation rather than shrunk into something dangerous |
| Sign in, My access, My devices | Centred, comfortable | Same | Designed mobile-first. These are the only screens most users ever see |

The principle: administrative bulk work is not made available on a phone in a degraded form.
A shrunken bulk-deactivate is a way to cause an incident on a bus.

---

## 14. Accessibility

- Every action reachable by keyboard, in visual order, with a visible focus ring that meets
  contrast on both themes.
- The table is a real table with proper headers and scope attributes, so a screen reader
  announces "Priya Sharma, Faculty, Computer Science, active" rather than reading eleven
  unlabelled cells.
- Drawers and modals trap focus, restore it on close, are labelled, and close on Escape.
- Status is never colour alone. Every status dot carries a label or an icon.
- Form fields have real labels, never placeholders as labels. Errors are associated with their
  field and announced politely.
- Bulk selection announces its count on change, because a silent selection is invisible to a
  screen reader user about to act on four hundred rows.
- Reduced motion collapses every transition to a cross-fade.
- The whole module works at 200 percent text scaling. The table scrolls horizontally inside its
  own container rather than breaking the page.

---

## 15. Notifications

| Trigger | Recipient | Channel | Priority | Purpose | Timing | Action |
|---|---|---|---|---|---|---|
| Invitation issued | Invitee | Email, SMS if no email | High | Get them in | Immediate | Activate |
| Invitation expiring | Invitee, then administrator | Email, in-app | Normal | Prevent a stalled onboarding | 48h before | Reissue |
| Account activated | Administrator | In-app | Low | Close the loop | Immediate | — |
| Role granted | Person | In-app, push | Normal | State what they can now do | Immediate | Open My access |
| Role expiring | Person and their head | In-app, email | Normal | Prevent the access cliff | 30, 7 and 1 days | Request extension |
| Role revoked | Person | In-app, email | High | They will notice anyway. Better from the system | Immediate | Contact |
| Approval required | Approver | In-app, push | High | Unblock someone | Immediate | Approve or reject |
| Approval decided | Requester | In-app, push | Normal | Close the loop | Immediate | View |
| New device sign-in | Owner | Push, email | High | The only defence a user has against a stolen credential | Immediate | End session |
| Account locked | Owner | Email, SMS | High | Explain, and state when it clears | Immediate | Reset |
| Credential changed | Owner | Email, SMS | Critical | The signal a victim needs | Immediate | Contact support |
| Delegation activating and ending | Delegate and delegator | In-app | Normal | Nobody should be surprised by authority | On transition | View |
| Guardian link requested | Student | In-app, push | High | Consent must be a decision | Immediate | Approve or decline |
| Impersonation requested | Principal | Email, push | Critical | Someone wants into your institution | Immediate | Approve or deny |
| Impersonation started and ended | Principal | Email | High | Transparency | On transition | View audit |
| Shared-account signal | Administrator | In-app | Normal | The biggest real threat to the audit trail | Daily digest | Investigate |
| Dormant accounts | Administrator | In-app | Low | Hygiene | Monthly digest | Review |

**Anti-spam rules.** Digest rather than send individually for anything informational. One
notification per event, never one per channel. Respect quiet hours except for the four marked
critical or security-related. A bulk operation produces one summary, never four hundred messages.

WhatsApp is not used in this module. Credentials and access changes over a third-party consumer
messaging channel is a risk with no matching benefit, and the channel is better spent on fee
reminders and results where guardians actually want it.

---

## 16. Reports and analytics

Delivered through P5. No dashboard of decorative counters.

| Report | Purpose | Calculation | Audience |
|---|---|---|---|
| Access register | The authoritative list of who holds what | Active assignments joined to person and scope | Principal, auditor |
| Expiring access | Prevent the June cliff | Assignments with `valid_to` inside a window, grouped by department | Administrator, heads |
| Sensitive authority | Review concentrated power | Assignments whose role carries a critical permission | Principal |
| Privilege change history | Detect creeping escalation | Assignment events over a period, by grantor | Auditor |
| Dormant accounts | Reduce the attack surface | Active accounts with no sign-in beyond a threshold | Administrator |
| Never activated | Find stalled onboarding | Accounts invited beyond the invitation window | Administrator, HR |
| Second factor coverage | Measure a control that matters | Accounts requiring a factor with one enrolled, over those requiring it | Administrator |
| Failed sign-in patterns | Detect attack and confusion alike | Failures grouped by identifier, address and hour | Administrator |
| Shared-account signals | Protect attributability | Accounts exceeding the concurrent-device threshold | Administrator |
| Impersonation register | Prove what support did | All grants with reads performed | Principal, auditor |
| Consent register | Data protection evidence | Active and withdrawn guardian consents | Registrar |

**KPIs worth watching:** share of staff with individual accounts rather than shared ones, median
hours from appointment to first sign-in, share of assignments expiring without renewal, second
factor coverage among sensitive roles, and median hours to resolve an access request. Each one
maps to a real operational failure, which is the test for whether a metric belongs on a
dashboard at all.

---

## 17. Audit and security

**Audited without exception:** every assignment granted, modified, revoked or expired, with
before and after. Every account state change. Every credential reset, by whom. Every sign-in
attempt, successful or not. Every session revocation. Every sensitive field reveal. Every
export, with row count and reason. Every impersonation grant and every record read inside one.
Every consent grant and withdrawal. Every person merge, with both prior states. Every delegated
act, in both names.

Each event carries actor, subject, scope, timestamp, address hash, device, session, reason where
one is required, and the before and after values for mutations.

**Security posture.**

- Deny by default. Permission is proven, never assumed.
- Resolution happens server-side on every request. The client's permission set shapes the
  interface and is never trusted.
- No direct permission grants outside roles, so authority is always reviewable in one place.
- No self-service role editing, including by administrators.
- Tokens are hashed at rest, single use and short-lived.
- Credentials are hashed with a modern memory-hard function, never logged, never exported, never
  visible to any role.
- Enumeration is prevented at sign-in and reset.
- Rate limiting per identifier, per address and per tenant.
- Impersonation is read-only at the policy layer, so it cannot be bypassed by calling an API the
  interface does not show.
- Retention: sessions ninety days, login attempts one year, audit events seven years or the
  statutory period where longer, person records per the institution's policy with deactivated
  accounts archived rather than deleted while any audit event references them.

---

## 18. Edge cases

### Ten realistic scenarios

1. **A professor is also a parent of a student in the college.** Two role assignments on one
   person. Their guardian view shows only their ward, and their faculty view must never reveal
   their own child's marks through a teaching screen unless they actually teach that section.
   The scope model handles this, but it must be tested explicitly because it is the case that
   makes a family angry.
2. **A staff member rejoins after three years.** One person, two employment periods, new
   assignments, the old ones remaining expired. Their historical approvals stay attributable.
3. **A head of department retires mid-term with eleven pending approvals.** Offboarding proceeds.
   The approvals are reassigned to the incoming head, flagged as inherited, and the audit trail
   records the transfer rather than the original approver disappearing.
4. **Two administrators edit the same person simultaneously.** Optimistic versioning per AD-12.
   The second save is refused, the conflict is shown field by field, and neither loses work.
5. **An invitation is sent to a mistyped email.** It reaches someone unintended who could
   activate an account. Mitigated by short expiry, by the invitation carrying no authority until
   activation, by the administrator seeing the never-activated report, and by reissue
   invalidating the prior token.
6. **A student turns eighteen during the year.** The automatic guardian link converts to a
   consent-required link. The student is asked. If they do not respond within a grace period the
   link remains but is marked pending, and withholding it silently would surprise a paying parent.
7. **The academic year rolls over with four hundred year-scoped assignments.** All expire. Without
   the expiring report and bulk extension, the college is locked out on the first Monday of term.
   This is why `expiring` is a state and not a computed filter.
8. **A teacher's phone is lost.** They sign in elsewhere, see their devices, end that session,
   and the push token is revoked so notifications stop reaching the lost handset.
9. **A person's legal name changes.** The record is updated and the prior name is retained,
   because certificates were issued under it and must remain verifiable.
10. **The college shares one office login despite policy.** Detected by the concurrent-device
    signal. The system does not block during admission season. It reports, and the administrator
    is given a one-click path to split the account into individual invitations.

### Five permission edge cases

1. **An administrator tries to grant themselves result-publication authority.** Refused. Nobody
   edits their own assignments. The attempt is audited, because an attempt is itself a signal.
2. **A head of department delegates to someone outside the department.** Allowed, since the
   delegate acts within the delegator's scope, not their own. The delegate gains nothing
   permanent and the audit names both.
3. **An approver is asked to approve a request they raised through a delegation.** Refused by
   BR-7 and escalated to the Principal, since self-approval through a delegated identity is the
   obvious way around the rule.
4. **A revoked user holds a valid session.** Revocation ends sessions immediately rather than
   waiting for expiry. A permission cache that has not yet invalidated is bounded at fifteen
   minutes and never applies to a revoked session, because session validity is checked before
   permissions.
5. **A campus-scoped administrator opens a deep link to a person on another campus.** Not
   found, not forbidden, because "forbidden" confirms the person exists on the other campus.

### Five data integrity edge cases

1. **Two person records for one human, both with marks.** Merge preserves both audit trails,
   keeps the merged id as a permanent alias, and stays reversible for seven days.
2. **An assignment scoped to a department that is later dissolved.** The assignment moves to an
   invalid-scope state and appears in a remediation list. It grants nothing while invalid, and it
   is not silently deleted.
3. **An import creates four hundred accounts with a duplicated column mapping.** The dry run
   catches it. If it somehow commits, the job is reversible as a unit, because the import records
   which rows it created.
4. **A person is deactivated while holding an active delegation.** The delegation ends
   immediately and the delegator is notified, since inherited authority must not outlive its
   source.
5. **The clock on a device is wrong by two days.** All validity evaluation uses server time.
   Client timestamps are recorded but never authoritative.

### Five workflow failures

1. **The notification channel is down when an invitation is sent.** The invitation exists, the
   delivery is retried, and the administrator sees delivery status rather than assuming success.
2. **Approval is required but every eligible approver has left.** The request escalates to the
   Principal rather than sitting unassigned. An unassignable request is visible on the queue as
   an exception, never invisible.
3. **A bulk assignment partially fails at row 220 of 400.** Completed rows stand, failures are
   listed with reasons and retryable as a set. The operation is not all-or-nothing, because
   forcing four hundred people to wait for one bad row helps nobody.
4. **A permission cache invalidation is lost.** Bounded staleness of fifteen minutes, and
   revocation paths bypass the cache entirely.
5. **Impersonation is approved but the support session never starts.** The grant expires
   unused, and the institution still sees it in the register, since a requested-and-unused grant
   is information the Principal is entitled to.

---

## 19. Cross-module dependencies

| Source | Event or change | Consumer | Expected behaviour | Failure handling |
|---|---|---|---|---|
| M13 HR | `employee.created` | M1 | Create the person, invite, apply the default role for the designation | Queued and retried. An uninvited employee appears on the never-activated report |
| M13 | `employee.exited` | M1 | Expire assignments at the exit date, end sessions, raise handover | Retried. A daily reconciliation catches any exit without a matching revocation |
| M4 Admissions | `student.admitted` | M1 | Create the account, apply the student role, link the guardian | Retried. A student without an account blocks nothing else and is reported |
| M5 | `student.status_changed` | M1 | Suspend or deactivate access per status | Retried |
| M2 | Scope tree changed | M1 | Invalidate affected caches, flag orphaned assignments | Bounded staleness covers a lost signal |
| M1 | `assignment.changed` | All | Refresh the effective permission set | Cache lifetime bounds the damage |
| M1 | `account.deactivated` | P2, M6, M7 | Stop notifications, release timetable assignments, reassign unmarked sessions | Each consumer retries independently |
| M1 | `delegation.activated` | P1 | Route approvals to the delegate | If it fails, approvals stay with the delegator, which is safe rather than open |
| M1 | Every authorization decision | P6 | Audit | Audit write failure fails the request. An unauditable sensitive action does not proceed |
| M3 | Academic year rollover | M1 | Expire year-scoped assignments, produce the pre-flight report | Rollover refuses to run if M1 cannot report, per AD-11 |

Coupling is deliberately loose in one direction only. M1 reads the organizational tree and
employment periods synchronously, because a permission check cannot be eventually consistent.
Everything else is events.

---

## 20. UX review

Reviewing the design above as an outside critic, then fixing what fails.

**What works.** The People list as a dense table with saved views matches how administrators
actually work. The plain-language summary in the assign drawer solves the real failure of
permission interfaces, which is that nobody can read a checkbox list and predict its effect.
Absent rather than disabled actions keep the interface honest.

**What failed, and the fix.**

1. **There was no answer to "why can't I see this".** Every access problem would have become a
   phone call to the office. **Fixed** by adding My access (S7) with a request path, available to
   every user, outside the admin module.
2. **Assignments were originally a top-level tab only.** Administrators think person-first, so a
   person-first flow must exist, while bulk review needs an assignment-first one. **Fixed** by
   keeping both: the Access tab on the person for the individual case, Access review for the
   bulk case. Two views of one dataset is correct here. Two sources of truth would not be.
3. **The role editor was a wall of checkboxes.** Unreviewable at a hundred permissions.
   **Fixed** with module grouping, presets, a live plain-language summary, and a count of
   affected people shown while editing.
4. **Bulk actions had no failure model.** A four hundred row operation that stops at row 220
   with a generic error is an incident. **Fixed** with preview, per-row results, partial
   success and retry of the failed subset.
5. **Confirmation dialogs were everywhere in the first pass.** That trains click-through and
   disarms the dialogs that matter. **Fixed** by using undo for the reversible and reserving
   typed confirmation for merge, deactivation and bulk revocation.
6. **Sign-in assumed an email.** Students do not know their college email. **Fixed** by
   accepting enrollment number, employee code or email in one field.
7. **Mobile bulk import was going to be a shrunken wizard.** **Fixed** by refusing it with an
   explanation. Not every screen deserves a phone layout.
8. **Sensitive fields were visible in the list.** Convenient and wrong, since it exports a
   directory of dates of birth in one screenshot. **Fixed** by masking in lists and auditing
   individual reveals.

**Is it fast for an expert?** The frequent actions are: find a person, assign a role, extend
expiring access, approve a request. Each is reachable in one keystroke from the command palette
and none requires more than two clicks from the list. That is the bar.

**Is it calm?** One table, one rail, one drawer. No statistic cards, no gradients, one accent
colour, status carried by small dots with labels. Density comes from row height and column
discipline, not from filling space.

---

## 21. Architecture review

Checked against the approved blueprint.

**Consistent.** Role by scope by validity implements AD-1 directly. Campus appears as a scope
type per AD-2. Optimistic versioning follows AD-12. Correction as workflow follows AD-13, in that
assignments are revoked and reissued rather than edited. Approvals run on P1 and audit on P6
rather than being reimplemented here.

**One genuine contradiction found.** Blueprint 2 listed committees under D1's entities, implying
a membership table. This specification instead models membership as a role assignment scoped to
the committee. That is a real change, not a clarification, and it is recorded below as AD-15
rather than made silently.

**One boundary tightened.** Blueprint 3 assigned the organizational tree to M2 but left committee
constitution ambiguous. Settled here: M2 owns a committee's existence and remit, M1 owns who sits
on it and what that lets them do.

**Scalability.** The hot path is permission resolution on every request. It resolves from
assignments plus scope containment, indexed on person and status, cached per person with a
generation counter. At a hundred thousand people and a few hundred assignments each, this is
comfortable. The risk is scope containment on a deep tree, bounded by keeping the tree shallow,
at most six levels, which every real institution satisfies.

**Maintainability concern, stated rather than hidden.** The permission catalogue is
platform-owned and versioned with releases, so adding a permission means shipping a migration
that updates system role templates without touching tenant-cloned roles. That upgrade path needs
a test from day one or it will rot within three releases.

---

## 22. Open decisions for this module

- **OD-M1-1. Does the institution want single sign-on** against Google Workspace or Microsoft
  365? Many colleges already have one. *Recommended default:* build local credentials first and
  design the account model so an external identity provider is an added factor rather than a
  replacement. Deferring this is cheap. Assuming there will never be one is not.
- **OD-M1-2. Is the second factor mandatory for all staff or only sensitive roles?** *Default:*
  sensitive roles only, configurable upward. Mandating it for every teacher on day one is the
  fastest route to a shared-account culture.
- **OD-M1-3. Who may create a person, HR only or also the office?** *Default:* HR owns staff,
  Admissions owns students, and the administrator can create in either with a reason recorded.
- **OD-M1-5. Is identity per tenant or per platform?** Today a Person carries a `tenant_id`, so
  a consultant administering three colleges holds three identities and three logins. That is the
  strictest possible isolation and the simplest permission model, at the cost of a worse
  experience for the small number of people who genuinely work across colleges. *Recommended
  default:* keep identity per tenant, and add a platform-level identity link later if real demand
  appears. Reversing this later means merging accounts, which W11 already supports.
- **OD-M1-4. Retention period for deactivated persons.** *Default:* seven years after the last
  audit-relevant event, configurable per tenant, since statutory requirements differ by state.

---

## 23. Architecture Decision Log updates

Appended to [../adr.md](../adr.md): AD-14 through AD-19.
