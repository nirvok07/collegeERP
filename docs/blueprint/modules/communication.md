# M20 — Communication (Notices and Circulars)

Blueprint module M20, domain D9, **phase 1** in the blueprint's own ordering — the earliest-phase
module still unbuilt. **Status: ❌ not built.** `PROJECT_STATE.md` records it as a live
student-facing gap: *"fees (D1) and circulars (no module) ❌"*.

## 1. Why this is the first D9 slice

It is the smallest module in the domain, it closes a gap students already feel, and **the notice
primitive is the audience-targeting engine** that M22 events, M21 cases and every other
announcement reuses. Building it first makes the rest cheaper.

## 2. What this module owns

Composing a notice, choosing who it reaches, approving it where required, publishing it, and
tracking that it was received and acknowledged.

It does **not** own delivery (P2 owns channels, preferences, quiet hours and retry — M20 decides
*who* and *what*, P2 decides *how*), nor conversation. A notice is an announcement, not a chat.
Two-way messaging is out of scope (§12).

## 3. Targeting is the hard part, not composing

Anyone can write a rich-text box. The module's value is that "all final-year Computer Science
students at the North campus who have not paid their exam fee" is **one audience expression**, not a
spreadsheet someone maintains by hand.

Audiences resolve from the organisational tree and live data at publish time:

```
audience := everyone
          | role(role, scope)
          | campus | department | program | section | term
          | cohort(year_of_study)
          | students_where(fee_outstanding | attendance_below(n) | hostel_resident
                           | transport_user | backlog)
          | employees_where(designation | kind | department)
          | individuals[]
          | union | intersection | difference of the above
```

`02-domains.md` names this as D9's automation: *targeted delivery from the organisational tree
rather than manual lists.* An audience is **resolved and frozen at publish** into
`notice_recipient` rows, so "who was this sent to" has an answer a year later, even after people
graduate or change section.

## 4. Permissions

```
notice.read        normal     Receive notices
notice.publish     normal     Publish within scope
notice.approve     sensitive  Approve institution-wide notices
notice.manage      sensitive  Categories, templates, retention
```

Scope governs reach: a faculty member publishes to their sections, a HoD to their department, the
Principal institution-wide. The scope of `notice.publish` **is** the limit of the audience a person
may express — a permission check at resolve time, not a UI restriction.

## 5. Entities

```
notice_category   tenant, name, default_urgency, requires_approval, requires_ack, retention
notice            tenant, category, title, body, attachments[] (P3), author, scope,
                  audience_expression, urgency, state, publish_at, expires_at,
                  requires_ack, version
notice_recipient  notice, person, resolved_at, delivered_at, read_at, acked_at   -- frozen audience
notice_revision   notice, reason, previous, by, at       -- INSERT only
notice_pin        notice, pinned_by, until
```

## 6. Lifecycle

```
notice:  draft → pending_approval → scheduled → published → { expired | retracted }
               ↘ rejected
```

**Retraction, not deletion.** `02-domains.md` names the edge case: *a notice sent to the wrong
audience requires visible retraction rather than deletion.* A retracted notice is struck through
with its reason, visible to everyone who received it. Deleting it means some people acted on
something the system denies ever existed.

## 7. Invariants

- The resolved audience may not exceed the publisher's permission scope (checked at resolve).
- `notice_recipient` rows are frozen at publish; later population changes do not rewrite them.
- `notice_revision` is INSERT only; a published notice's body is immutable — an edit publishes a
  revision, and recipients are told it changed.
- A notice requiring acknowledgement may not expire while unacknowledged recipients remain; it
  escalates instead.
- Attachments are P3 documents with the notice's own read permission.
- `publish_at` in the future is scheduled, not published; a scheduled notice is invisible to
  recipients until its time.
- Tenant RLS with FORCE.

## 8. Acknowledgement and escalation

For categories with `requires_ack` — examination instructions, fee deadlines, safety and
anti-ragging notices — the system tracks read and explicit acknowledgement separately. Read is
passive; acknowledgement is a deliberate action.

A P9 job chases unacknowledged recipients at intervals and escalates to their HoD or class advisor.
This is what makes a statutory notice defensible: the institution can show who was told, when, and
who confirmed.

## 9. Approvals (P1)

Institution-wide notices → Principal. Urgent category → an expedited single-step chain, because an
approval chain that takes a day is useless for "campus closed tomorrow". Retraction → the original
approver.

## 10. Notifications (P2) and scheduled work (P9)

M20 raises `notice.published`; P2 delivers per category urgency and per-person preference (P2 §4).
An urgent notice bypasses quiet hours; an informational one joins the digest. This is precisely the
separation that keeps the app usable once D8 also starts notifying.

Jobs: scheduled publication, expiry, acknowledgement chase and escalation, digest assembly,
delivery-failure reporting.

## 11. Reports (P5)

**Reach and acknowledgement rate per notice** — the primary report, and the one that shows whether
communication is working. Unacknowledged recipients by notice, department and person. Notices by
category and author. Delivery failures by channel. Retraction register.

## 12. Deliberately out of scope

**Two-way messaging and chat.** `03-modules.md` §3.2 rejected a messaging module, and that rejection
holds: chat needs moderation, retention policy, safeguarding rules for minors, and a support
burden that dwarfs the module. A notice may invite a reply through an existing channel — a case
(M21), an email address — but the ERP does not become a messenger.

**Rich WYSIWYG authoring.** A constrained format — headings, lists, emphasis, links, attachments —
renders predictably on both clients. Arbitrary HTML does not, and it is an injection surface.

## 13. Clients (AD-84 parity)

| Surface | Web | Flutter |
|---|---|---|
| Notice board / feed | ✅ | ✅ **primary — this is how students read notices** |
| Notice detail with attachments | ✅ | ✅ |
| Acknowledge | ✅ | ✅ **primary** |
| Compose with audience builder | ✅ **primary** | ✅ simplified |
| Audience preview ("this reaches 412 people") | ✅ **primary** | ✅ |
| Approval | ✅ | ✅ (P1 inbox) |
| Reach and acknowledgement tracking | ✅ primary | ✅ via P5 |
| Pinned and urgent banner | ✅ | ✅ |

**Audience preview before publish is non-negotiable.** A publisher must see the resolved count and a
sample before sending, on both surfaces. Sending to the wrong four hundred people is the failure
this one screen prevents, and it is why §6's retraction exists as the backstop.

The compose surface on Flutter is simplified — category, title, body, a scope picker rather than the
full expression builder — and that reduction is a recorded parity exception under AD-84 §6.4 rather
than an omission.

## 14. Edge cases

- Recipient joins after publication → not a recipient; the audience was frozen (§3). A late joiner
  sees the notice on the board if it is still active, but is not counted as unacknowledged.
- Recipient leaves before acknowledging → recorded as such; not chased forever.
- Person matches the audience twice (two roles) → one notice, one recipient row (P2 §11 dedupes delivery).
- Notice scheduled, then the author's permission is revoked → publication refused at publish time,
  author and approver told.
- Attachment infected (P3 §4) → publication blocked until replaced.
- Urgent notice at 2am → bypasses quiet hours by design; misuse of the urgent category is a
  reportable pattern (§11), which is the right control rather than a technical block.
- Institution-wide notice while a tenant is suspended (AD-60) → nothing delivers; suspension is total.
- Notice referencing a fee deadline that moves → publish a revision (§7); recipients are told it changed.

## 15. Build slices

| Slice | Scope | Surfaces | Depends on |
|---|---|---|---|
| NOT-1 | Categories, notice entity, draft and publish | S, W, F | — |
| NOT-2 | **Audience expression, resolution, freeze, preview** | S, W, F | M1, M2, M5 |
| NOT-3 | Notice board and detail | W, F | — |
| NOT-4 | Delivery via P2 by urgency | S | P2 |
| NOT-5 | Acknowledgement, chase, escalation | S, W, F | P9 |
| NOT-6 | Approval chains | S, W, F | P1 |
| NOT-7 | Attachments | S, W, F | P3 |
| NOT-8 | Scheduled publication and expiry | S | P9 |
| NOT-9 | Revision and retraction | S, W, F | — |
| NOT-10 | Reach and acknowledgement reports | S, W, F | P5 |

NOT-2 is the slice with the value in it. NOT-1 and NOT-3 alone would already close the student-facing
gap, which makes this module unusually cheap to start and worth starting early.

## 16. Cross-module impact

Reads M1 (authority and scope), M2 (org tree), M5 (students, cohorts), M13 (employees), M11
(fee-outstanding audiences), M7 (attendance-below audiences). Delivers through P2. Its audience
engine is reused by M22 (event invitations), M21 (case notifications to a group) and M4 (applicant
communication). Depends on P1, P2, P3, P5, P9.
