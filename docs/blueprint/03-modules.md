# Blueprint 3 — Module Architecture

Domains describe the business. Modules are what gets built, owned, released and versioned. The
mapping is deliberately not one to one.

## 3.1 Module map

| # | Module | Domain | Phase | Primary users | Secondary users |
|---|---|---|---|---|---|
| M1 | Identity and Access | D1 | 0 | System Administrator | Everyone |
| M2 | Institution Setup | D1 | 0 | System Administrator, Principal | All modules read it |
| M3 | Academic Structure | D2 | 1 | Registrar, HOD | Every academic module |
| M4 | Admissions | D3 | 2 | Admission Officer, Counsellor | Applicant, Accounts |
| M5 | Student Records | D3 | 1 | Registrar, Class Advisor | Everyone |
| M6 | Timetable | D4 | 1 | Timetable Coordinator, HOD | Faculty, Student |
| M7 | Attendance | D4 | 1 | Faculty, Class Advisor | Student, Parent, Exam Cell |
| M8 | Coursework and Feedback | D4 | 3 | Faculty | Student, HOD |
| M9 | Internal Assessment | D5 | 2 | Faculty, Exam Cell | Student, HOD |
| M10 | Examinations and Results | D5 | 2 | Exam Cell, Controller | Student, Registrar |
| M11 | Student Finance | D6 | 2 | Accounts Officer, Cashier | Student, Parent, Management |
| M12 | Scholarships | D6 | 3 | Scholarship Officer | Accounts, Student |
| M13 | HR and Staff | D7 | 3 | HR Officer | HOD, Principal |
| M14 | Leave and Workload | D7 | 2 | Faculty, HOD | Timetable, Payroll |
| M15 | Payroll | D7 | 4 | Payroll Officer | Accounts |
| M16 | Library | D8 | 3 | Librarian | Student, Faculty |
| M17 | Hostel | D8 | 3 | Warden | Student, Parent, Accounts |
| M18 | Transport | D8 | 3 | Transport Manager | Student, Accounts |
| M19 | Materials and Assets | D8 | 4 | Store Keeper, Purchase Officer | Accounts, HOD |
| M20 | Communication | D9 | 1 | Principal, HOD, Faculty | Everyone |
| M21 | Cases | D9 | 3 | Grievance committee, IT desk | Everyone |
| M22 | Events and Activities | D9 | 4 | Coordinators | Student |
| M23 | Placements | D9 | 4 | Placement Officer | Student, Recruiter |
| M24 | Alumni | D9 | 4 | Registrar, Placement | Alumnus |

Plus the eight platform capabilities P1 to P8, which are not modules and have no independent
user-facing surface except the approval inbox, the notification centre, the report library, the
audit browser and the command palette.

## 3.2 Boundary decisions

### Split, with reasons

**Timetable (M6) is separate from Attendance (M7).** They share the session entity but differ in
everything else: different users, different frequency, different release, different offline
requirement. The timetable is built rarely by one coordinator on a desktop. Attendance is
captured daily by every teacher on a phone, often without a network. Bundling them would force
the highest-traffic, highest-risk offline surface in the product to ship with a complex planning
tool.

**Internal Assessment (M9) is separate from Examinations and Results (M10).** Different
authority. Internal assessment belongs to the teaching faculty within a course. Examinations and
results belong to the Controller of Examinations and, where the college is affiliated, partly to
the university. Merging them would put continuous faculty-owned marking behind the exam cell's
approval gates, which is both wrong and unusable.

**Student Finance (M11) is separate from Payroll (M15) and Materials (M19).** Receivables and
payables are different compliance regimes, different actors and different release phases. The
common mistake is one "Finance" module that becomes the largest and least maintainable thing in
the system.

**Leave and Workload (M14) ships before HR (M13).** Leave is needed the moment a timetable
exists, because approved teaching leave must trigger substitution. Full HR records, appraisal and
service books are not needed for a year. Splitting by urgency rather than by subject is what
lets Phase 2 be useful.

### Merged, against the brief's list

| The brief listed separately | Where it actually belongs | Why |
|---|---|---|
| Student Lifecycle | Inside Admissions (M4) and Student Records (M5) | Lifecycle is not a thing to build. It is the state machine of the student entity, which M5 owns |
| Results | Inside Examinations (M10) | Marks and results are one object at two stages. Two owners of one number is a data integrity failure waiting to happen |
| Scholarships | Its own module (M12) but strictly a credit against the ledger owned by M11 | It has genuinely different actors and government workflows, so it warrants a module, but it must never hold its own money record |
| Certificates | Platform capability P4 | Bonafide, transfer, conduct, transcript and experience letters share one engine. Building certificates per module gives five numbering schemes and no issue register |
| Documents | Platform capability P3 | Admissions, HR, cases and assessment all need the same upload, verification and retention behaviour |
| Complaints and Grievances | Cases (M21), one generic case primitive | Grievance, discipline, anti-ragging and IT helpdesk are one workflow with different categories, SLAs and committees |
| Reports and Analytics | Platform capability P5 | A reports module becomes a dumping ground disconnected from the data it reports on. Each module ships its own reports onto a shared platform |
| Administration | Split across M1, M2 and P8 | "Administration" is not a domain. It is identity, structure and configuration |
| Audit and Compliance | Platform capability P6 | Audit that a module can opt out of is not audit |
| Inventory, Procurement, Assets | One module, M19 | They are three stages of one material's life. Separating them forces three-way reconciliation |
| Alumni | M24, and only in Phase 4 | It is the tail of the student record, not a separate identity system |

### Rejected outright for now

- A separate "Notifications module" with its own UI. Notification is a capability, and its only
  surfaces are a preference screen and a notification centre.
- A "Parent portal" module. Parent is an actor with a scoped view of existing modules, not a
  parallel system. Building it as a module duplicates every screen.
- A "Mobile app" module. The client is a delivery surface, not a module.
- A learning management system. Content delivery, video and quizzing is a different product.
  M8 covers coursework handover only, and integration is the right answer if a college wants an
  LMS.

## 3.3 Data ownership

One authoritative owner per fact. Everything else holds a reference or a read-only mirror.

| Data | Authoritative owner | Consumers |
|---|---|---|
| Person identity, accounts, permissions | M1 | All |
| Organizational tree, campuses, departments, committees | M2 | All |
| Programs, curricula, courses, terms, calendar, grading schemes | M3 | M4 to M10, M14 |
| Applicant and application | M4 | M5, M11 |
| Student record, status, enrolment | M5 | All academic and finance modules |
| Timetable and session occurrences | M6 | M7, M14 |
| Attendance and its corrections | M7 | M9, M10, M20 |
| Internal assessment marks | M9 | M10 |
| Examination marks, results, transcripts | M10 | M5, M23, P4 |
| Fee ledger and every monetary balance | M11 | M4, M5, M16 to M19 |
| Employee record and workload | M13, M14 | M6, M15 |
| Physical resources and allocations | M16 to M19 | M11 for charges |
| Every approval decision | P1 | All |
| Every audit event | P6 | Nobody writes it directly |

Two rules that follow, and they are the difference between an ERP and a pile of screens.

1. **No module holds a monetary balance except M11.** Library fines, hostel dues and transport
   charges are posted to the student ledger as entries. They are never tracked in the service
   module, because reconciling four ledgers is impossible in practice.
2. **No module stores a derived academic number.** Attendance percentage, credits earned and
   cumulative averages are computed from their source records. A stored aggregate is a bug with
   a delay fuse.

## 3.4 Integration between modules

Modules communicate by domain events, not by reaching into each other's data. This is what keeps
the dependency graph acyclic despite the apparent tangle.

| Event | Emitted by | Consumed by | Effect |
|---|---|---|---|
| `student.admitted` | M4 | M5, M11, M1 | Create the record, generate invoices, create the account |
| `student.status_changed` | M5 | M7, M11, M16-M18 | Stop attendance expectation, freeze dues, release allocations |
| `term.opened` | M3 | M6, M9, M11 | Generate offerings, assessment plans and invoices |
| `timetable.published` | M6 | M7, M20 | Generate sessions, notify |
| `attendance.submitted` | M7 | M10 | Recompute eligibility |
| `leave.approved` | M14 | M6 | Raise a substitution requirement |
| `marks.published` | M10 | M5, M20, M23 | Update the record, notify, refresh placement eligibility |
| `payment.received` | M11 | M4, M5 | Confirm admission, release clearance |
| `charge.raised` | M16-M19 | M11 | Post to the ledger |
| `employee.exited` | M13 | M1, M6 | Revoke access, reassign load |

Circular risks and their resolution:

- M7 needs the timetable, M6 needs leave, M14 needs the timetable for workload. Resolved by
  making M6 the owner of the schedule and having M14 read it while emitting events back, rather
  than writing into it.
- M11 needs admission, M4 needs payment confirmation. Resolved by events in both directions with
  no synchronous call, so an offer expiring and a payment arriving cannot deadlock.

## 3.5 Critical self-review of this architecture

Attacking the design above before it is approved.

**The academic year rollover is under-specified and it is the highest risk operation in the
product.** It touches every module, and a botched rollover at a live college in June is
unrecoverable without a restore. It deserves its own specification, a dry-run mode, a
reversibility window and a rehearsal on a copy. Raised as a Phase 1 deliverable rather than an
afterthought.

**Curriculum versioning was nearly missed.** An earlier draft of this map had a program owning
its courses directly. That model breaks every student on an older regulation. It is now explicit
in M3 and is a schema-level commitment, not a feature.

**The four-role model in the existing documentation is not salvageable.** It cannot express a
professor who heads a department and sits on the exam committee. Replacing it after screens
exist would mean rewriting every permission check, so it must change now.

**Offline was over-committed.** Full offline support for admissions, procurement and payroll
would cost more than those modules and serve no one. Narrowed to field roles on mobile.

**Attendance correction was a workflow gap.** The first pass treated submitted attendance as
final. Real colleges correct it constantly, and an ERP that forces a database edit to fix a
typo trains staff to bypass the audit trail. Correction is now a first-class approved workflow.

**Parent access was missing a consent model.** A guardian link is personal data access to
another person's record, and for an adult student it needs consent that can be withdrawn. Added
to M1 as a consent record rather than assumed from a phone number.

**Reporting risks being an afterthought.** Every module lists reports, but management buys the
product on visibility. P5 needs real investment in Phase 2, not Phase 4, or the pilot college
will conclude the system does not tell them anything.

**Cases may be over-engineered for Phase 3.** One generic case engine serving grievance,
discipline and helpdesk is elegant, but a college's first need is usually a simple complaint box.
Flagged to start narrow, with the generic model as the internal shape rather than the initial
surface.

**Concurrent editing is unaddressed across the board.** Two clerks editing one student, two
teachers marking one session, a mark edited while results compute. Optimistic versioning on
every mutable record and explicit conflict surfacing is now a platform requirement, not a
per-module concern.
