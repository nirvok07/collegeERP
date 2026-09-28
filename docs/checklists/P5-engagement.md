# P5 — D9 Engagement, Cases and Outcomes

Docs: `communication.md`, `cases.md`, `events.md`, `placements.md`, `alumni.md`.

**M20 first.** It is blueprint phase 1, it closes a live student-facing gap
(`PROJECT_STATE.md`: *"circulars (no module) ❌"*), and its audience engine is reused by M21, M22,
M23 and M24. Building it first makes everything after it cheaper.

---

# M20 — Communication (Notices and Circulars)

**Layout:** `server/src/modules/communication/…`, `clients/web/src/features/notices/`,
`lib/features/notices/`.

## NOT-1 — Categories and the notice entity
- [ ] `MIG` `notice_category`: tenant, name, default_urgency, requires_approval, requires_ack, retention
- [ ] `MIG` `notice`: tenant, category, title, body, attachments, author, scope,
      audience_expression, urgency, state, publish_at, expires_at, requires_ack, version
- [ ] `MIG` `notice_revision`: INSERT only
- [ ] `MIG` `notice_pin`
- [ ] `MIG` RLS FORCE; GRANTs; invariants test
- [ ] `SVC` Constrained body format: headings, lists, emphasis, links, attachments.
      🔴 **Not arbitrary HTML** — it renders unpredictably on two clients and is an injection surface
- [ ] `API` `/v1/notices` CRUD, `/publish`, `/retract`
- [ ] `WEB` `APP` Compose, draft, publish

## NOT-2 — 🔴 Audience expression, resolution, freeze, preview

**The slice with the value in it.** Anyone can write a rich-text box; the module's worth is that
"all final-year CS students at North campus who have not paid their exam fee" is one expression.

- [ ] `MIG` `notice_recipient`: notice, person, resolved_at, delivered_at, read_at, acked_at
- [ ] `SVC` Expression grammar: `everyone | role(role, scope) | campus | department | program |
      section | term | cohort(year) | students_where(...) | employees_where(...) | individuals[]`
      with `union | intersection | difference`
- [ ] `SVC` `students_where`: fee_outstanding (M11), attendance_below(n) (M7), hostel_resident
      (M17), transport_user (M18), backlog (M10) — each read from its owner, never duplicated
- [ ] `SVC` 🔴 The resolved audience **may not exceed the publisher's permission scope**, checked at
      resolve time. `notice.publish` scope *is* the audience limit
- [ ] `SVC` 🔴 Audience **resolved and frozen at publish** into `notice_recipient` rows, so "who was
      this sent to" has an answer a year later, after people graduate or change section
- [ ] `WEB` `APP` 🔴 **Audience preview before publish**: resolved count and a sample. Sending to
      the wrong four hundred people is the failure this one screen prevents
- [ ] `TEST` A publisher cannot reach beyond their scope
- [ ] `TEST` A recipient joining after publication is not in the frozen set
- [ ] `TEST` A person matching twice appears once

## NOT-3 — Notice board
- [ ] `WEB` `APP` Feed grouped by category; pinned and urgent banner; unread state
- [ ] `WEB` `APP` Detail with attachments
- [ ] `APP` **Primary — this is how students read notices**

## NOT-4 — Delivery via P2
- [ ] `S` Raise `notice.published`; P2 delivers per category urgency and per-person preference
- [ ] `S` Urgent bypasses quiet hours; informational joins the digest
- [ ] `TEST` An urgent notice at 2am delivers; an informational one does not

## NOT-5 — Acknowledgement and escalation
- [ ] `SVC` Read (passive) and acknowledgement (deliberate) tracked **separately**
- [ ] `SVC` A notice requiring acknowledgement may not expire while unacknowledged recipients
      remain — it escalates instead
- [ ] `JOB` Chase unacknowledged at intervals; escalate to HoD or class advisor
- [ ] `WEB` `APP` Acknowledge; unacknowledged list for the author
- [ ] `TEST` Statutory notice: the institution can show who was told, when, and who confirmed

## NOT-6 — Approvals
- [ ] `SVC` Institution-wide → Principal via P1
- [ ] `SVC` 🔴 Urgent category uses an **expedited single-step chain** — an approval that takes a
      day is useless for "campus closed tomorrow"

## NOT-7 — Attachments
- [ ] `S` `W` `F` P3 documents inheriting the notice's read permission
- [ ] `TEST` Publication blocked while an attachment is infected or unscanned

## NOT-8 — Scheduling and expiry
- [ ] `JOB` Scheduled publication at `publish_at`; expiry at `expires_at`
- [ ] `SVC` A scheduled notice is invisible to recipients until its time
- [ ] `TEST` Author's permission revoked before `publish_at` → publication refused, author notified

## NOT-9 — Revision and retraction
- [ ] `SVC` 🔴 **Retraction, not deletion.** A retracted notice is struck through with its reason,
      visible to everyone who received it. Deleting means some people acted on something the system
      denies existed
- [ ] `SVC` A published body is immutable; an edit publishes a revision and tells recipients
- [ ] `TEST` `notice_revision` UPDATE/DELETE refused

## NOT-10 — Reports (P5)
- [ ] `S` 🔴 **Reach and acknowledgement rate per notice** — the primary report, and the one that
      shows whether communication works
- [ ] `S` Unacknowledged by notice, department, person; by category and author; delivery failures;
      retraction register
- [ ] `DOC` Flutter compose is simplified (category, title, body, scope picker) — **parity
      exception recorded**, not an omission

---

# M21 — Cases (Grievance, Discipline, Helpdesk)

🔴 **The most sensitive module in the system.** Confidentiality is the architecture, not a feature.

## CAS-1 — Types, committees, SLAs, appeal routes
- [ ] `MIG` `case_type`: tenant, key, name, category(grievance|discipline|helpdesk),
      allows_anonymous, requires_hearing, appeal_route, sla_hours, committee_role,
      confidentiality, version
- [ ] `SVC` 🔴 **One primitive, three policies** — what differs is configuration, not three codebases
- [ ] `SVC` Committees are scoped role assignments (AD-15)
- [ ] `WEB` `APP` Type configuration

## CAS-2 — The case primitive
- [ ] `MIG` `case`: tenant, type, case_no, raised_by | sealed_identity, subject_person, subject_ref,
      title, description, priority, state, assigned_to, opened_at, due_at, version
- [ ] `MIG` `case_event`: INSERT only, with `visibility(parties|handlers|committee)`
- [ ] `MIG` Gapless `case_no` per tenant per type per year — it is the reference a complainant is
      given, and a hole is a question nobody wants to answer
- [ ] `SVC` 🔴 **Acknowledgement is its own state and is time-bound.** A complainant who hears
      nothing assumes nothing happened. `sla_hours` starts at `raised`
- [ ] `WEB` `APP` Raise, timeline, my cases
- [ ] `APP` **Primary — a student raising a grievance uses a phone, privately.** A mechanism that
      requires walking into an office and asking for a form is one people do not use

## CAS-3 — 🔴 Confidentiality in the read path

**Build this before any real case exists.** The window in which grievances are readable by the
wrong people cannot be undone.

- [ ] `SVC` Visible to: raiser, subject (with exceptions), assigned handlers, committee. **Nobody else**
- [ ] `SVC` 🔴 **Not to a College Admin by virtue of being an admin.** This is the one place where
      "the admin sees everything" is wrong, and the permission model must say so
- [ ] `SVC` 🔴 RLS alone is insufficient — every row is same-tenant. Per-case visibility is enforced
      in the read path
- [ ] `SVC` Every case read is a **sensitive read and is audited** (P6). The audit is why a
      grievance system is trusted enough to be used
- [ ] `SVC` A closed case narrows further: parties and committee only
- [ ] `SVC` Evidence inherits case visibility; one-time signed URLs (P3)
- [ ] `TEST` 🔴 A College Admin with every permission cannot read a case they are not party to
- [ ] `TEST` Every read produces an audit row
- [ ] `TEST` An evidence URL cannot be reused

## CAS-4 — Triage and assignment
- [ ] `SVC` Categorise, assign, prioritise; `case.triage` permission
- [ ] `WEB` `APP` Triage queue; `WEB` primary

## CAS-5 — Evidence
- [ ] `MIG` `case_evidence`: case, document_id (P3), added_by, description, at
- [ ] `WEB` `APP` Upload with **camera capture**; withdrawn evidence supersedes, never deletes

## CAS-6 — 🔴 Anonymous raise and sealed identity
- [ ] `MIG` `sealed_identity` on `case`, AES-256-GCM per AD-63
- [ ] `SVC` 🔴 **Anonymity is real until investigation requires identity.** Store the raiser sealed,
      not absent. Storing nothing makes follow-up impossible; storing it plainly makes anonymity a lie
- [ ] `SVC` Unsealing requires `case.identity.unseal` (`critical`), **MFA, a reason, and an audit
      row written before the identity is returned**
- [ ] `SVC` Unsealing is a committee decision via P1, not a side effect of opening the case
- [ ] `WEB` `APP` Raise anonymously
- [ ] `TEST` An unseal without MFA or reason is refused; the audit row precedes the disclosure

## CAS-7 — Grievance policy
- [ ] `SVC` 🔴 **A grievance about the person who would normally handle it routes elsewhere.**
      P1 §6 implements this once: a resolved subject or raiser is skipped and escalated
- [ ] `SVC` Closure by the committee, **never by the person complained about**
- [ ] `TEST` A grievance against a HoD does not land in that HoD's inbox

## CAS-8 — Discipline
- [ ] `MIG` `hearing`: case, scheduled_at, venue, attendees, minutes, outcome, conducted_by
- [ ] `MIG` `resolution`, `sanction`: INSERT only
- [ ] `SVC` A case requiring a hearing cannot resolve without a `hearing` row **with minutes**
- [ ] `SVC` Notice period before a hearing, from P8
- [ ] `WEB` `APP` Schedule, record minutes, decide

## CAS-9 — 🔴 Sanction application across modules (AD-28)
- [ ] `SVC` M21 emits `sanction.ordered`; the owning module applies it **in its own transaction**
      and confirms. M21 never writes another module's tables
- [ ] `S` Targets: M11 fine, M17 hostel expulsion, M10 result withheld / exam debarment,
      M5 suspension, M13 employment suspension, M4 rustication
- [ ] `SVC` 🔴 A sanction ordered but not confirmed is a **visible, alerted inconsistency** —
      never silent
- [ ] `TEST` A sanction against an already-exited student surfaces rather than failing quietly

## CAS-10 — Appeals
- [ ] `MIG` `appeal`: resolution, raised_by, grounds, state, decided_by, outcome, at
- [ ] `SVC` 🔴 Decided by a **different person at a higher level** than the original
- [ ] `SVC` Appeal window computed as calendar dates (AD-49) from `decided_at`
- [ ] `TEST` Out-of-time appeal rejected with the dates shown; same-person decision refused

## CAS-11 — Helpdesk
- [ ] `SVC` Lightweight policy: no hearing, no appeal, low confidentiality
- [ ] `WEB` `APP` Queue and resolution

## CAS-12 — SLA and escalation
- [ ] `JOB` Acknowledgement chase; 🔴 **escalation on deadline breach** (D9's named automation);
      hearing reminders; appeal window expiry; sanction-confirmation chase

## CAS-13 — 🔴 Anti-ragging (statutory)
- [ ] `SVC` A `case_type` with a dedicated committee, short SLA, mandatory acknowledgement
- [ ] `S` **Annual statutory return** shaped to the regulator's format
- [ ] `DOC` Named explicitly because it is a legal requirement that must not be discovered late

## CAS-14 — Reports (P5)
- [ ] `S` Ageing by category, type, handler; resolution time against SLA
- [ ] `S` 🔴 **Repeat complaints** — by subject *and* by raiser; both are signals
- [ ] `S` Escalation and breach rate; appeal rate and **overturn rate** (a high rate names a
      decision process that is wrong); sanction register; helpdesk volume by category
- [ ] `SVC` 🔴 All case reports are `sensitive` and scope-limited; an aggregate must never be
      drillable into a case the runner may not read

## Case edge cases
- [ ] `TEST` Case about a person who then leaves → proceeds; the record is the institution's
- [ ] `TEST` Raiser withdraws but the type requires proceeding (safety, ragging) → stays open
- [ ] `TEST` Two cases, one incident → linked, decided together, both numbered
- [ ] `TEST` Committee member related to a party → declared conflict, recused, recorded
- [ ] `TEST` Disciplinary case overlapping a police matter → marked external, can be stayed;
      the ERP records, it does not adjudicate
- [ ] `TEST` Minor involved → guardian notification mandatory (needs ADM-A14)

---

# M22 — Events and Activities

CAL-2 already ships `calendar_events`. M22 **extends** it; `calendar_events` stays the one source
of truth for what is on the calendar.

## EVT-1 — Managed events and promotion
- [ ] `MIG` `managed_event` with `calendar_event_id`; `calendar_event.managed_event_id` nullable
- [ ] `SVC` 🔴 **Not every event needs a module.** An event is *promoted* when it needs
      registration, capacity, fees, attendance or credit. The simple path stays simple
- [ ] `WEB` `APP` Propose, configure, promote

## EVT-2 — Sessions and rooms
- [ ] `MIG` `event_session`: managed_event, title, from_at, to_at, room (M6), speaker
- [ ] `SVC` 🔴 **Room booking goes through M6**, which owns rooms (AD-46) and already prevents
      double-booking in the database. An event writing its own room row defeats that
- [ ] `TEST` A clashing room request is refused at proposal, not discovered on the day

## EVT-3 — Registration, capacity, waitlist
- [ ] `MIG` `registration`, `team`
- [ ] `MIG` Trigger: confirmed registrations may not exceed capacity — the same pattern as M17 beds
      and M18 seats
- [ ] `JOB` Waitlist promotion on cancellation; day-before reminders
- [ ] `WEB` `APP` Register; `APP` **primary, one tap**

## EVT-4 — Fees
- [ ] `S` Participation fee via M11 (AD-6); refund on cancellation

## EVT-5 — Participation marking
- [ ] `MIG` `participation`: event or session, person, present, role, marked_by, at
- [ ] `SVC` Only for a confirmed registration, or a declared walk-in
- [ ] `APP` 🔴 **Primary — at the door, on a phone.** Reuses the teachers' attendance-marking
      interaction and its offline-safe submit (AD-58, AD-59). It should feel identical, because it
      is the same act
- [ ] `TEST` Offline marking replays without duplication

## EVT-6 — Teams and results
- [ ] `MIG` `team`, `event_result`: position, award, certificate_ref (P4)

## EVT-7 — 🔴 Activity credit
- [ ] `MIG` `activity_credit`: person, managed_event, credit_kind, points, awarded_by, term
- [ ] `SVC` Awarded once per person per event
- [ ] `SVC` 🔴 Recorded here and **read** by M10 for graduation requirements — never stored as a
      derived total on the student (AD-7)
- [ ] `DOC` Without this, participation lives in a coordinator's spreadsheet and the accreditation
      return is assembled by hand every year
- [ ] `TEST` A credit total is computed from rows, not stored

## EVT-8…EVT-11
- [ ] `S` `W` `F` Certificates via P4
- [ ] `S` `W` `F` Announcement through **M20's audience engine**
- [ ] `S` `W` Resources and budget (M19)
- [ ] `S` Reports: participation by event/department/student, activity credit position,
      registration vs attendance (no-show rate), budget vs actual, **students participating in
      nothing** — a pastoral signal

---

# M23 — Placements

🔴 **Naming:** schema uses `placement_application` and `placement_offer`, never the bare words —
M4 owns `admission_application` and `admission_offer`.

## PLA-1 — Recruiters
- [ ] `MIG` `recruiter`: tenant, name, industry, contact, tier, mou_ref (P3), rating, blacklisted
- [ ] `SVC` A blacklisted recruiter cannot open a drive
- [ ] `WEB` `APP` Register, MoU upload, rating

## PLA-2 — Student profile
- [ ] `MIG` `student_profile`: student, resume_ref (P3), skills, certifications, projects,
      preferences, willing_to_relocate
- [ ] `WEB` `APP` Profile and resume upload

## PLA-3 — Drives and rounds
- [ ] `MIG` `drive`, `drive_round`
- [ ] `SVC` 🔴 A drive **cannot be announced without an eligibility rule** — an unqualified drive is
      how a student with six backlogs ends up in an interview
- [ ] `SVC` Announced through M20 **to the eligible set only** — telling ineligible students about a
      drive they cannot apply to is noise
- [ ] `WEB` Drive creation and eligibility builder — **web primary**

## PLA-4 — 🔴 Eligibility engine with shown derivation
- [ ] `SVC` Rule: program, year, aggregate percentage (M10, computed not stored), active backlogs,
      backlog history, attendance (M7), no active sanction (M21), offers held < policy
- [ ] `SVC` 🔴 Shown to each student **with its derivation** — which criterion they fail and by how
      much. "You are not eligible" with no reason produces a queue outside the placement office
- [ ] `SVC` Recomputed at application **and** at shortlisting; results and backlogs change
- [ ] `JOB` Recompute after M10 publishes
- [ ] `TEST` A student who becomes ineligible mid-process is surfaced to the officer, **not
      auto-removed from an interview they are sitting in**

## PLA-5 — 🔴 Placement policy
- [ ] `MIG` `placement_policy`: tenant, academic_year, offers_allowed, dream_offer_threshold, opt_out
- [ ] `SVC` 🔴 Most institutions cap offers per student with a dream-offer exception. Without it,
      strong students take multiple offers, recruiters find accepted candidates do not join, and the
      college loses the relationship. Encoding it is cheap; discovering it in year two is not
- [ ] `MIG` Trigger: offers held may not exceed the cap except under the dream rule
- [ ] `SVC` Accepting withdraws other **pending** applications per policy, **with notification**

## PLA-6 — Applications, shortlisting, rounds
- [ ] `MIG` `placement_application`, `round_result` (INSERT only)
- [ ] `SVC` One application per student per drive; ineligible refused with the criterion named
- [ ] `WEB` `APP` Apply, shortlist, mark round results

## PLA-7 — Offers
- [ ] `MIG` `placement_offer`: drive, student, role, ctc_paise, joining_date, letter_ref, state
- [ ] `SVC` CTC in integer paise (M11 §3) so aggregate statistics are exact
- [ ] `JOB` Response deadline chase and expiry
- [ ] `S` 🔴 Shortlist and round-schedule notifications are `action required` and **bypass
      digesting** — a student missing an interview because the message arrived in a digest is a
      placement lost
- [ ] `S` Offers and CTC are **sensitive reads, audited** — what a classmate was offered is not
      general information

## PLA-8 — Placement records
- [ ] `MIG` `placement_record`: kind(placed|higher_studies|entrepreneurship|opted_out|not_placed)
      — INSERT only
- [ ] `SVC` Higher studies and entrepreneurship are outcomes, **counted honestly in the denominator**

## PLA-9 — 🔴 Statistics with stated denominators
- [ ] `S` Placement percentage showing **all three denominators**: registered, eligible, whole
      cohort. An institution quoting 95% must be able to say 95% of what — that ambiguity is where
      placement statistics lose credibility
- [ ] `S` Package distribution: median, mean, highest, quartiles
- [ ] `S` Recruiter history and repeat rate; drive conversion funnel; offers declined and why;
      department comparison; multi-offer students

## PLA-10 — Accreditation returns
- [ ] `S` NAAC and NBA placement returns
- [ ] `DOC` 🔴 Recruiter self-service accounts are **out of scope for v1** — external identities and
      student-data exposure need their own ADR, the same reasoning that defers ADM-A14

---

# M24 — Alumni

## ALU-1 — Entity and role
- [ ] `MIG` `alumnus`: tenant, student (M5), graduated_on, program, batch, state, version
- [ ] `SVC` 🔴 **The same Person and the same Student, with a lifecycle event.** Creating a separate
      alumni person breaks the transcript link, so a graduate requesting a duplicate marksheet in
      2031 becomes a manual search — and duplicates contact data, with the duplicate going stale
- [ ] `SVC` Student role assignment ends (AD-1 validity); `alumnus` role begins, self-service only
- [ ] `TEST` A returning graduate joining a PG programme holds **both roles concurrently** —
      AD-1 represents this with no special case

## ALU-2 — Graduation transition
- [ ] `JOB` Annual: for students whose programme is complete and results published (M10) —
      lifecycle event, `alumnus` row, role swap, contact carried forward as `consent_state=pending`,
      exit clearance and certificate path triggered
- [ ] `DOC` A job rather than a manual action because it happens to a whole cohort on one date, and
      by hand it does not happen at all in a busy year

## ALU-3 — 🔴 Consent, enforced at the send path

**Before any outreach feature.** Alumni data outlives the institutional relationship: a student was
required to give the college their data; an alumnus is not.

- [ ] `MIG` `alumni_contact`: kind, value, preferred, consent_state, consent_at
- [ ] `SVC` 🔴 Outreach to a contact with `consent_state != 'confirmed'` is **refused at the send
      path**, not merely hidden in the UI
- [ ] `SVC` Opt-in after graduation, never inherited; per-category unsubscribe that works
- [ ] `SVC` Erasure: engagement data erased, **academic record retained** under statutory basis (P3 §8)
- [ ] `JOB` Consent-confirmation follow-up **once, then stop** — a request repeated monthly is what
      makes people mark an institution as spam
- [ ] `S` Alumni contact details are a sensitive read, audited
- [ ] `TEST` A send to an unconfirmed contact is refused at the service layer

## ALU-4…ALU-11
- [ ] `MIG` `alumni_profile`, `career_event` (INSERT only), `engagement`, `donation`,
      `alumni_chapter`, `survey`, `survey_response`
- [ ] `WEB` `APP` Self-service profile and career updates — `APP` **primary**
- [ ] `WEB` `APP` Directory with consent filtering
- [ ] `S` Verification from M23 placement records; unverified data kept but **labelled
      self-reported** — discarding it leaves the register emptier and no more honest
- [ ] `WEB` `APP` Engagement: mentoring, guest lectures, recruiting
- [ ] `S` `W` `F` Campaigns and surveys via M20's audience engine
- [ ] `S` `W` `F` Donations: integer paise, receipted, posting to **institutional accounts, never
      the student fee ledger**, which is closed
- [ ] `S` Reports: 🔴 **outcomes at 1, 3 and 5 years** — a far more meaningful accreditation number
      than the placement percentage, because it reflects careers rather than first jobs
- [ ] `S` Geographic and industry distribution; engagement rate by batch; donation summary;
      **contactability rate** — a low rate warns the register is decaying
- [ ] `TEST` Deceased → all outreach stops immediately, record retained
- [ ] `TEST` Repeated bounces → marked unreachable, outreach stops

---

## 🚧 P5 EXIT GATE

- [ ] A notice reaches a precisely targeted audience, with a preview before publish and
      acknowledgement tracked afterwards
- [ ] 🔴 A grievance can be raised anonymously and is **unreadable to a College Admin who is not a
      party** — proven by test
- [ ] Unsealing an identity requires MFA and a reason, and audits before disclosing
- [ ] A sanction ordered in M21 is applied by its owning module, or surfaces as an inconsistency
- [ ] Placement statistics state their denominator
- [ ] Alumni outreach cannot reach an unconfirmed contact
