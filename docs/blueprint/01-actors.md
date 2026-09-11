# Blueprint 1 — The College as an Organization

## 1.1 Organizational model

```
Platform (many institutions)
└── Institution (tenant)
    ├── Campus                      ← scope dimension, see OD-2
    │   ├── Faculty / School        ← optional tier, some institutions have it
    │   │   └── Department          ← owns staff, programs and courses
    │   │       └── Program         ← B.Tech CSE, B.Com, MBA
    │   │           └── Curriculum (regulation year)  ← the versioned rule set
    │   │               └── Course / Subject
    │   ├── Administrative offices  ← Accounts, Admissions, Exam Cell, HR, Stores, Library
    │   └── Committees              ← IQAC, Anti-Ragging, Grievance, Purchase, Exam
    └── Academic Year
        └── Term (semester or year)
            └── Section / Batch     ← the actual teaching group
                └── Enrolment       ← student × course × term
```

Three structural points that drive everything downstream.

**Curriculum is versioned, and the version is the regulation year.** A student admitted in 2024
follows the 2024 regulation for their whole degree even when the 2026 regulation changes credits
and courses. Modelling curriculum as a mutable property of a program is the most common fatal
mistake in college systems, because it silently rewrites the graduation requirements of students
already part-way through.

**Enrolment, not section membership, is the unit of academic record.** A student belongs to a
section for timetabling convenience, but their academic record is a set of enrolments in
specific courses in specific terms. Electives, repeats, backlogs and credit transfer all break a
pure section model.

**Committees hold authority that no job title carries.** The exam committee approves a mark
correction, the grievance committee closes a complaint, the purchase committee approves above a
threshold. Authority therefore attaches to a committee membership, not only to a designation.

## 1.2 Actor map

"Admin" is not a role. It is roughly a dozen distinct jobs with different data, different
authority and different risk. The table below is the actor inventory. Authority is expressed in
section 1.3 as role plus scope, not as a title.

### Platform actors

| Actor | Responsibilities | Needs | Must not access |
|---|---|---|---|
| Platform Owner | Onboard and suspend institutions, plans and seats, platform health | Tenant list, usage, sync and error health, billing | Any institution's academic or personal data, except through audited support access |
| Platform Support | Diagnose a tenant issue | Time-boxed, audited, read-only access to one tenant | Write access of any kind, exports |
| Platform Engineer | Operate the service | Logs and metrics with personal data redacted | Production personal data in the clear |

### Governance and leadership

| Actor | Responsibilities | Needs | Must not access |
|---|---|---|---|
| Management or Trust | Strategy, finance, expansion | Institution-wide KPIs, fee collection, admissions funnel, staffing cost | Individual marks and disciplinary detail, unless escalated |
| Principal | Runs the institution | Everything within the campus, approvals above HOD level, exception reports | Platform administration |
| Vice Principal or Dean | Delegated academic authority | Academic operations across departments | Finance detail unless delegated |
| Registrar | Records, statutory returns, convocation | Student records, certificates, university correspondence | Payroll, procurement |
| IQAC Coordinator | Accreditation evidence and quality metrics | Cross-domain aggregates, feedback results, evidence documents | Individual finance records |

### Academic actors

| Actor | Responsibilities | Needs | Must not access |
|---|---|---|---|
| Head of Department | Staffing, workload, timetable approval, department results | Everything within the department scope | Other departments, payroll amounts |
| Faculty | Teach, mark attendance, assess, mentor | Own assignments only, own students' records | Any class or student not assigned to them |
| Class Advisor or Mentor | Pastoral responsibility for one section | Full academic and attendance picture for that section, guardian contacts | Other sections |
| Timetable Coordinator | Build and publish the timetable | Rooms, staff availability, course load across the department or campus | Marks, fees |
| Exam Cell Officer | Exam scheduling, hall tickets, seating, result processing | Exam and result data across the campus | Fees, HR |
| Controller of Examinations | Owns result correctness, approves publication and corrections | Everything in assessment, the audit trail of every change | Unrelated domains |
| Lab Assistant or Technician | Lab sessions, equipment | Lab schedules, lab attendance, consumables | Marks, personal records |

### Student services

| Actor | Responsibilities | Needs | Must not access |
|---|---|---|---|
| Admission Officer | Enquiry to admission | Applicant pipeline, documents, merit lists, seat matrix | Enrolled student marks and fees beyond admission dues |
| Counsellor | Enquiries, conversion | Enquiry pipeline, follow-ups | Enrolled student records |
| Librarian | Catalogue, issue and return, fines | Members, holdings, circulation | Academic and fee records |
| Hostel Warden | Rooms, allocation, discipline, mess | Residents, allocations, leave and gate movements | Marks, fees |
| Transport Manager | Routes, stops, vehicles, passes | Passengers, routes, transport fees due | Academic records |
| Placement Officer | Recruiters, drives, offers | Eligible students with academic summary, offers | Fee records, disciplinary detail unless relevant to eligibility |
| Sports and Cultural Coordinator | Events, teams, activity credit | Participation, event calendar, attendance exemptions | Academic and fee records |

### Business operations

| Actor | Responsibilities | Needs | Must not access |
|---|---|---|---|
| Accounts Officer or Bursar | Fee policy, receivables, refunds, reconciliation | Full student finance, ledgers, bank reconciliation | Marks, HR records beyond payroll input |
| Cashier | Collect payments, issue receipts | Today's collection, one student at a time, own till | Fee policy changes, refunds, other tills |
| Scholarship Officer | Government and institutional schemes | Eligibility, applications, disbursement against the fee ledger | Unrelated finance |
| HR Officer | Recruitment, records, leave, service book | Employee records within scope | Student data, marks |
| Payroll Officer | Salary, statutory deductions | Attendance and leave of staff, salary structures | Student data |
| Store or Inventory Keeper | Stock, issue, indent | Items, stock, requisitions | Finance approvals |
| Purchase Officer | Vendors, quotations, purchase orders | Requisitions, vendors, budgets | Student data |
| System Administrator | Users, roles, configuration for the institution | User and role administration, configuration, audit log | Reading academic or finance content; administration is not data access |

### External and end users

| Actor | Responsibilities | Needs | Must not access |
|---|---|---|---|
| Applicant | Apply, pay the application fee, track status | Own application only | Everything else |
| Student | Learn, attend, pay, graduate | Own record in full, own class information | Any other student's data, unpublished results |
| Parent or Guardian | Oversight, payment | The linked student's attendance, results, fees, notices | Anything not about their ward, and only with an active consent link |
| Alumnus | Stay connected, request documents | Own historical record, document requests | Current operational data |
| Vendor | Supply and invoice | Own orders and invoices | Everything else |
| Affiliating University | Receives returns, supplies results | A controlled integration surface, not a login | Direct data access |
| External Auditor | Verify | Time-boxed, read-only, fully logged access to a defined scope | Write access, and any scope not agreed |

## 1.3 The authority model

A title is not a permission. Authority in this system is the product of three things.

```
authority = role (a bundle of permissions)
          × scope (campus, department, program, section, academic year)
          × validity window (from, to)
```

Consequences that shape the whole design.

- **One person holds several assignments at once.** A professor may simultaneously be Faculty
  for four courses, Head of a department, a member of the exam committee, and a parent of a
  student in the same college. Each is a separate assignment with its own scope. A single
  `role` column on a user cannot express this and must not be used.
- **Assignments are time-bounded.** An outgoing Head of Department loses departmental authority
  on a date, but their historical actions must remain attributable and their past approvals must
  remain valid. Deleting the assignment would corrupt the audit trail, so assignments expire
  rather than disappear.
- **Scope is inherited, not repeated.** Department scope implies its programs, which imply their
  sections. Policies evaluate up the tree once, rather than storing a flattened list that goes
  stale the moment a section is added.
- **Committee membership is a role assignment** whose scope is the committee's remit. This is
  how an ordinary faculty member gains the authority to approve a mark correction without
  becoming an administrator.
- **Delegation is explicit and temporary.** A Head of Department going on leave delegates
  approval authority for a date range. The delegation is recorded, visible, and shows in the
  audit trail as an act performed by the delegate on behalf of the delegator.

This replaces the four-role model in the earlier documentation, which cannot express a single
real college.
