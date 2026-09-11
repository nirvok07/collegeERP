# Blueprint 2 — Business Domains

Nine business domains and eight platform capabilities. The list in the brief was deliberately
not followed item for item, because several of its entries are not domains at all. The reasoning
for every merge and every rejection is in [Module Architecture](03-modules.md).

Each domain below states: purpose, owner, actors, responsibilities, inputs, outputs, workflows,
entities, dependencies, approvals, reports, notifications, automation and edge cases.

---

## D1 — Identity, Access and Institution Setup

**Purpose.** Know who everyone is, what they may do, and how the institution is shaped. Nothing
else can exist first.

**Business owner.** System Administrator, with the Principal owning the role policy.

**Actors.** Platform Owner, System Administrator, Principal, every user as a subject.

**Responsibilities.** Person and account identity, authentication, role and scope assignment,
delegation, committees, organizational structure, institution configuration, audit log.

**Inputs.** Institution onboarding data, staff and student identities from Admissions and HR,
policy decisions about who approves what.

**Outputs.** An authenticated session with a resolved permission set, the organizational tree
that every other domain scopes against, and an immutable audit trail.

**Major workflows.** Institution onboarding. User invitation and first login. Role assignment
with scope and validity. Delegation for an absence. Committee constitution. Role revocation on
exit. Audit review. Support impersonation with consent and expiry.

**Key entities.** Institution, Campus, Department, Committee, Person, UserAccount,
RoleDefinition, RoleAssignment (role × scope × validity), Delegation, Permission, AuditEvent,
ConfigurationSetting.

**Dependencies.** None. Everything depends on it, which is why it is built first and changed
carefully.

**Approvals.** Role assignments granting financial or result authority require Principal
approval. Support impersonation requires institution consent.

**Reports.** Active users by role and scope, dormant accounts, privilege change history,
failed login patterns, delegation register, impersonation register.

**Notifications.** Invitation, credential reset, role granted or revoked, delegation starting
and ending, suspicious sign-in.

**Automation.** Deactivate accounts on a staff exit date. Expire role assignments on their end
date. Expire delegations. Flag accounts dormant beyond a threshold. Nightly reconciliation that
every active account still has at least one valid assignment.

**Edge cases.** A person who is both staff and parent. A staff member rejoining after a break,
who must keep one identity and gain a second employment period. Two accounts for one human,
needing a merge that preserves both audit trails. The last administrator locking themselves
out. A role revoked while an approval raised under it is still pending.

---

## D2 — Academic Structure and Calendar

**Purpose.** The versioned rule set that defines what is taught, to whom, over what period.
This is the spine. Almost every other domain reads from it and none may write to it.

**Business owner.** Registrar, with Heads of Department owning their curricula.

**Actors.** Registrar, Principal, HOD, Timetable Coordinator, Exam Cell.

**Responsibilities.** Programs, curriculum versions by regulation year, courses and credits,
academic years and terms, sections and batches, the academic calendar, grading schemes,
attendance rules, promotion rules.

**Inputs.** University regulations, board decisions, admission intake.

**Outputs.** The authoritative catalogue, the calendar that drives every date in the system, and
the rule sets that Assessment and Teaching Operations evaluate against.

**Major workflows.** Create or clone a curriculum for a regulation year. Approve and freeze a
curriculum. Open an academic year. Define terms and the working calendar including holidays.
Create sections and allocate intake. Define a grading scheme. **Academic year rollover**, which
is the single most dangerous operation in the product.

**Key entities.** AcademicYear, Term, Program, Curriculum (regulation year), CourseCatalogue,
Course, CourseOffering (course × term × section), Section, Batch, GradingScheme, CalendarDay,
AttendanceRule, PromotionRule.

**Dependencies.** Identity for scope only.

**Approvals.** Curriculum freezing requires Principal or academic council approval. Any change
to a frozen curriculum requires a versioned amendment, never an edit.

**Reports.** Curriculum comparison across regulation years, credit distribution, course offering
coverage, calendar and working-day counts, section capacity against intake.

**Notifications.** Curriculum published, term opened or closed, calendar amended, rollover
completed with its summary.

**Automation.** Generate course offerings from the curriculum when a term opens. Generate the
working calendar from weekly patterns and a holiday list. Pre-flight validation before rollover.

**Edge cases.** Mid-year regulation change from the university. A student on an old regulation
taking a course that only exists in the new one. Courses that span two terms. Sections merged or
split mid-term. A term extended after results are partly processed. Two campuses on different
calendars inside one institution.

---

## D3 — Admissions and Student Lifecycle

**Purpose.** Everything from first enquiry to alumnus, as one continuous record rather than two
disconnected systems.

**Business owner.** Admission Officer for the funnel, Registrar for the enrolled record.

**Actors.** Applicant, Counsellor, Admission Officer, Registrar, Principal, HOD, Accounts,
Student, Parent.

**Responsibilities.** Enquiry capture, application, document collection and verification, merit
and seat allocation, admission confirmation, enrolment, section and elective allocation,
status changes through the degree, transfers, exits, graduation, alumni handover.

**Inputs.** Enquiries, applications, entrance or qualifying marks, government allotments,
documents, admission fee payment.

**Outputs.** The enrolled student record that every other domain keys against, the enrolment set
per term, and the statutory student register.

**Major workflows.** Enquiry to application. Document verification. Merit list and seat
allocation, including government quota and management quota. Admission confirmation against a
fee payment. Enrolment and elective selection. Section allocation. Status change: active,
detained, on leave, suspended, dropped, transferred, graduated. Program or department transfer.
Re-admission. Exit with a no-dues clearance. Graduation and alumni conversion.

**Key entities.** Enquiry, Application, ApplicationDocument, MeritList, SeatAllocation,
AdmissionOffer, Student, Enrolment (student × course offering), StudentStatusHistory,
TransferRecord, NoDuesClearance, AlumniProfile, GuardianLink, ConsentRecord.

**Dependencies.** Academic Structure for programs, curricula and intake. Student Finance for
admission fee and no-dues. Identity for account creation. Documents for verification.

**Approvals.** Seat allocation outside merit order requires Principal approval with a recorded
reason. Department transfer requires both Heads of Department and the Principal. Admission
cancellation with a refund requires Accounts and Principal.

**Reports.** Admission funnel with conversion by source, seat matrix against fill rate, category
and quota compliance, document pendency, day-wise admission register, student strength by
program, term and category, dropout analysis, statutory returns.

**Notifications.** Application received, documents pending, shortlisted, offer issued with an
expiry, offer expiring, admission confirmed, enrolment open, status changed, clearance pending.

**Automation.** Expire unpaid offers and release the seat to the waitlist. Auto-generate the
enrolment number on confirmation. Auto-enrol into core courses from the curriculum, leaving only
electives to choose. Flag duplicate applicants by name, date of birth and phone. Nudge
incomplete applications. Convert final-year students to alumni after graduation.

**Edge cases.** An applicant applying twice. An applicant admitted then found to have forged a
document, requiring reversal after fees are paid and classes attended. Government allotment
arriving after the seat was filled. A student transferring department after a term of attendance
and marks, which must be carried or explicitly abandoned. A student returning after a gap year
onto a newer regulation. Cancellation after a partial refund. Death or long illness of a
student, which needs dignity rather than a "dropped" status.

---

## D4 — Teaching Operations

Timetable, attendance, coursework and feedback. These are one domain because they are one
object seen four ways: the scheduled session.

**Purpose.** Run the daily academic operation and record what actually happened.

**Business owner.** HOD, with the Timetable Coordinator operating it.

**Actors.** Timetable Coordinator, HOD, Faculty, Class Advisor, Student, Parent, Lab Assistant.

**Responsibilities.** Timetable construction and publication, room and resource allocation,
session occurrence, attendance capture and correction, substitution, coursework and submissions,
course feedback.

**Inputs.** Course offerings, staff workload and availability, rooms, the working calendar.

**Outputs.** The published timetable, the attendance record and its derived percentages, which
feed examination eligibility and detention, and coursework marks which feed internal assessment.

**Major workflows.** Build the timetable with clash detection. Approve and publish. Generate
session occurrences from the timetable across the calendar. Mark attendance, offline capable.
Submit attendance, which locks it. Correct attendance after submission through an approved
correction. Arrange a substitution. Cancel or reschedule a session. Record a duty leave
exemption. Issue a shortfall warning. Publish and collect coursework. Run anonymous course
feedback.

**Key entities.** TimetableVersion, TimetableSlot, SessionOccurrence, AttendanceRecord,
AttendanceCorrection, Substitution, RoomAllocation, WorkloadAllocation, CourseworkItem,
Submission, FeedbackForm, FeedbackResponse.

**Dependencies.** Academic Structure for offerings and calendar. HR for staff availability and
leave. Identity for scope. Assessment consumes attendance for eligibility.

**Approvals.** Timetable publication by the HOD. Every attendance correction after submission
by the HOD or Class Advisor, with a reason. Duty leave exemption by the activity owner.

**Reports.** Daily attendance summary, defaulter list against the configured threshold,
subject-wise and student-wise attendance, faculty engagement against workload, unmarked session
register, substitution log, feedback summary per faculty and course.

**Notifications.** Timetable published or changed, class cancelled, substitution assigned,
attendance not marked by a cutoff, shortfall warning to student and guardian, coursework
assigned and due, feedback window open.

**Automation.** Generate sessions from the timetable and suppress them on holidays. Remind a
teacher who has not marked by a cutoff, then escalate to the HOD. Compute shortfall nightly and
issue staged warnings. Auto-suggest substitutes from free, qualified staff. Close the feedback
window and release only aggregates.

**Edge cases.** A class held off-timetable or in a different room. A faculty member absent with
no substitute, leaving a session unmarked, which must not silently count against students.
Attendance marked for a student who transferred out that morning. A holiday declared after
attendance was taken. A correction requested after results are published. Double marking by a
substitute and the regular teacher. Field work, industrial visits and sport, which are absences
that must not count as absences. A teacher marking from a device whose clock is wrong.

---

## D5 — Assessment and Academic Records

**Purpose.** Measure, moderate, publish and preserve academic outcomes. This domain carries the
highest integrity requirement in the product, because its output determines degrees.

**Business owner.** Controller of Examinations.

**Actors.** Exam Cell Officer, Controller of Examinations, Faculty, HOD, Principal, Registrar,
Student, Parent, Affiliating University.

**Responsibilities.** Internal assessment, examination scheduling and conduct, eligibility,
mark entry, moderation, result computation against the grading scheme, publication, revaluation,
corrections after publication, transcripts and certificates.

**Inputs.** Course offerings and grading schemes, attendance-derived eligibility, coursework
marks, external results from the university where applicable, fee clearance where the
institution requires it.

**Outputs.** The academic record. Marks, grades, credits, term and cumulative averages,
pass or fail and promotion status, transcripts, degree eligibility.

**Major workflows.** Define an assessment plan per course from the grading scheme. Compute and
publish eligibility including detention. Schedule an exam, produce hall tickets and seating.
Enter marks, submit, and lock. Moderate. Compute results. Approve and publish, which is atomic.
Apply for revaluation and process it. Correct a published mark under committee approval, which
reissues rather than overwrites. Import external results. Generate a transcript. Determine
degree eligibility and produce the convocation list.

**Key entities.** AssessmentPlan, AssessmentComponent, Exam, ExamSchedule, HallTicket, Seating,
Eligibility, MarkEntry, MarkSubmission, Moderation, Result, ResultPublication, Revaluation,
MarkCorrection, Transcript, CertificateIssue, ExternalResultMirror.

**Dependencies.** Academic Structure for grading schemes and offerings. Teaching Operations for
attendance and coursework. Student Finance for clearance where required. Documents for
transcripts and certificates.

**Approvals.** Mark submission locked by the faculty member, verified by the HOD. Moderation by
the exam committee. Publication by the Controller. Any post-publication correction by the exam
committee and the Principal, always recorded.

**Reports.** Result analysis by course, section, department and program. Pass percentage trends.
Grade distribution. Toppers and failures. Backlog register. Revaluation outcomes. Mark change
audit. Statutory and accreditation returns.

**Notifications.** Eligibility published, hall ticket available, mark entry window opening and
closing, submission overdue, result published, revaluation outcome, correction issued.

**Automation.** Compute eligibility from attendance rules. Compute grades, credits and averages
from the scheme, never by hand. Detect outliers in entered marks before submission, such as a
whole section scoring identically. Auto-lock the entry window at its deadline. Generate
transcripts from the record rather than from a stored document.

**Edge cases.** A mark correction after a transcript has been issued, requiring reissue and
revocation of the old one. A student whose eligibility is restored on appeal after the exam has
passed. Grace marks under a university rule. A grading scheme changed mid-term. Malpractice
nullifying a paper. A result published with a computation bug, requiring a controlled
unpublish that must be provably rare. A university result arriving that contradicts the
internal record. Absence with a medical certificate. A dead student's record.

---

## D6 — Student Finance

**Purpose.** What each student owes, what they paid, what remains, and why. A ledger, not a
collection of payment records.

**Business owner.** Accounts Officer.

**Actors.** Accounts Officer, Cashier, Scholarship Officer, Student, Parent, Principal,
Management, Auditor.

**Responsibilities.** Fee structures, invoicing, collection across channels, receipts,
concessions, scholarships, refunds, dues and clearance, reconciliation, financial reporting.

**Inputs.** Fee policy, admissions, category and quota, scholarship sanctions, payments from
counter, bank or gateway, hostel and transport charges.

**Outputs.** The student ledger, receipts, the receivables position, the no-dues clearance that
Admissions and Assessment depend on, and the collection reports management runs the college on.

**Major workflows.** Define a fee structure per program, year and category. Generate invoices
for a term. Apply a concession or scholarship. Collect at a counter, by bank transfer, or
online. Issue a receipt. Handle a bounced or failed payment. Process a refund on cancellation.
Instalment plans and late fees. Daily till closure and reconciliation. No-dues clearance.

**Key entities.** FeeHead, FeeStructure, FeeAssignment, Invoice, InvoiceLine, Concession,
Scholarship, ScholarshipDisbursement, Payment, PaymentAllocation, Receipt, Refund, Adjustment,
LedgerEntry, Till, ReconciliationBatch, DuesClearance.

**Dependencies.** Admissions for who owes. Academic Structure for program and term. Campus
Services for hostel and transport charges. Identity for scope and till ownership.

**Approvals.** Fee structure by Management. Concession above a threshold by the Principal.
Every refund by Accounts and the Principal. Any ledger adjustment by the Accounts Officer with
a reason, and adjustments are never silent.

**Reports.** Daily collection by till and mode. Outstanding by program, term, section and
student. Ageing. Concession and scholarship register. Refund register. Reconciliation
exceptions. Projected against actual collection. Auditor's ledger extract.

**Notifications.** Invoice issued, due date approaching, overdue, payment received with the
receipt, payment failed, refund processed, scholarship credited, clearance granted.

**Automation.** Generate invoices when a term opens. Apply late fees by rule. Staged reminders
to student and guardian. Auto-allocate a payment across the oldest dues. Auto-reconcile gateway
settlements and raise only the exceptions. Block clearance automatically while dues stand.

**Edge cases.** Payment made twice for one invoice. Payment succeeding at the bank but failing
to return to the app. Partial payment against several heads. A refund after a scholarship was
credited. A fee structure revised after invoices went out. A student cancelling mid-term with
part of the term consumed. Scholarship sanctioned but never disbursed by the government, leaving
the student liable. A cashier's till not matching the cash at closing. A payment against a
student who has since transferred out.

---

## D7 — People and HR

**Purpose.** The employee record, the work they are assigned, and their entitlements.

**Business owner.** HR Officer, with the Principal owning appointments.

**Actors.** HR Officer, Payroll Officer, Principal, HOD, Faculty, Staff, Management, Auditor.

**Responsibilities.** Employee records and service history, recruitment, workload allocation,
leave, staff attendance, payroll inputs, appraisal, exit.

**Inputs.** Appointment decisions, qualifications, timetable workload, leave applications,
biometric or manual attendance, statutory rates.

**Outputs.** The staff directory that Teaching Operations schedules against, leave balances,
payroll inputs, accreditation staffing returns.

**Major workflows.** Recruit and appoint. Onboard, which creates identity and role assignments.
Allocate workload. Apply for and approve leave. Record staff attendance. Run a payroll cycle.
Appraisal. Promotion. Exit with clearance and access revocation.

**Key entities.** Employee, EmploymentPeriod, Designation, Qualification, ServiceRecord,
WorkloadAllocation, LeaveType, LeaveBalance, LeaveRequest, StaffAttendance, SalaryStructure,
PayrollRun, Payslip, AppraisalCycle, ExitClearance.

**Dependencies.** Identity for accounts and role assignment. Academic Structure for department
and workload. Teaching Operations, which consumes availability and produces load.

**Approvals.** Leave by the HOD, escalating to the Principal beyond a duration. Appointment by
Management. Payroll release by the Principal and Accounts.

**Reports.** Staff strength by department and designation, student to staff ratio for
accreditation, workload distribution, leave balances and patterns, payroll register, statutory
deduction returns, attrition.

**Notifications.** Leave applied, approved or rejected, balance low, substitution arising from
approved leave, payslip available, document or qualification expiring.

**Automation.** Credit leave on a schedule and lapse it by policy. Trigger a substitution
request when teaching leave is approved. Revoke all access on the exit date. Warn when workload
exceeds the policy ceiling.

**Edge cases.** Leave approved after the absence has already been marked. A faculty member
leaving mid-term with marks entered but unsubmitted. Dual roles across departments splitting
workload. Leave without pay affecting payroll retrospectively. Rejoining after resignation. A
leave application spanning a year boundary or a rollover.

---

## D8 — Campus Services

Library, hostel, transport and materials. Grouped as one domain because they are four
expressions of the same primitive: a finite resource allocated to a person for a period, with
issue, return, condition and charge.

**Purpose.** Run the non-academic services students and staff depend on daily.

**Business owner.** Librarian, Hostel Warden, Transport Manager and Store Keeper respectively.

**Actors.** Those owners plus Student, Parent, Faculty, Accounts, Purchase Officer, Vendor.

**Responsibilities.** Library catalogue and circulation. Hostel rooms, allocation, mess and
discipline. Transport routes, stops and passes. Stores, indents, purchase and assets.

**Inputs.** Student and staff records, procurement, allocation requests, fee payments.

**Outputs.** Allocations, circulation history, charges pushed to the student ledger, stock and
asset position, no-dues input at exit.

**Major workflows.** Catalogue and issue or return with fines. Apply for, allocate and vacate a
hostel room. Apply for a transport pass tied to a route and stop. Raise an indent, approve,
purchase, receive, issue and write off. Clearance from every service at exit.

**Key entities.** LibraryItem, Holding, Membership, Circulation, Fine, Hostel, Room, Bed,
HostelAllocation, MessRegister, GatePass, Route, Stop, Vehicle, TransportAllocation, Item,
Stock, Indent, PurchaseRequest, PurchaseOrder, GoodsReceipt, Issue, Asset, Depreciation.

**Dependencies.** Identity and Student Lifecycle for who. Student Finance, to which all charges
flow. Institutional finance for procurement.

**Approvals.** Hostel allocation by the Warden. Purchase above a threshold by the purchase
committee and the Principal. Write-off by Management. Fine waiver by the service owner.

**Reports.** Circulation and overdue. Occupancy and vacancy. Route utilisation and pass
compliance. Stock position and reorder level. Asset register and depreciation. Service dues.

**Notifications.** Due and overdue reminders, allocation confirmed, vacating reminder, pass
expiring, indent approved, stock below reorder level, clearance pending.

**Automation.** Accrue fines by rule. Push every service charge to the student ledger rather
than tracking money in four places. Reorder alerts. Auto-release an allocation on exit or
transfer.

**Edge cases.** A book lost rather than returned, becoming a charge. A student vacating a hostel
mid-term with a part refund. Transport used without a valid pass. A room reallocated while the
occupant is on leave. Stock discrepancy at audit. An asset transferred between departments. A
student cleared for exit while a library item is still out.

---

## D9 — Engagement, Cases and Outcomes

Notices, events, grievances, discipline and placements. Grouped because each is a conversation
with a person rather than a record of an academic fact, and three of them are the same case
primitive.

**Purpose.** Communicate, resolve and follow outcomes.

**Business owner.** Principal for communication and discipline, Placement Officer for outcomes.

**Actors.** All internal actors, Student, Parent, Alumnus, Recruiter, grievance and anti-ragging
committees.

**Responsibilities.** Announcements, targeted notices, events and participation, grievances and
complaints, disciplinary cases, IT and facility helpdesk, placement drives and offers, alumni
relations.

**Inputs.** Authored notices, submitted complaints, event plans, recruiter requirements,
eligibility from Assessment and Teaching Operations.

**Outputs.** Delivered and acknowledged communications, resolved cases with an audit trail,
participation records, placement outcomes that feed accreditation reporting.

**Major workflows.** Compose, target, approve, publish and track a notice. Plan an event,
register participants, record attendance and award activity credit. Raise a grievance, including
anonymously, then triage, investigate, resolve, appeal and close. Raise a disciplinary case,
issue a hearing, decide, sanction and appeal. Run a placement drive from recruiter to offer to
acceptance.

**Key entities.** Notice, NoticeAudience, NoticeReceipt, Event, Registration, Participation,
Case (grievance, discipline, helpdesk), CaseEvent, CaseResolution, Appeal, Recruiter, Drive,
DriveEligibility, Application, Offer, AlumniEngagement.

**Dependencies.** Identity for targeting and scope. Student Lifecycle and Assessment for
eligibility. Notifications as the delivery capability.

**Approvals.** Institution-wide notices by the Principal. Disciplinary sanctions by the
committee. Grievance closure by the committee, never by the person complained about.

**Reports.** Notice reach and acknowledgement. Event participation. Case ageing by category,
resolution time, repeat complaints. Anti-ragging statutory returns. Placement percentage,
package distribution and recruiter history.

**Notifications.** Notice published, case acknowledged with a reference, status changed,
hearing scheduled, resolution issued, drive announced, shortlisted, offer received.

**Automation.** Targeted delivery from the organizational tree rather than manual lists.
Acknowledgement tracking and escalation for urgent notices. Case escalation on breach of a
resolution deadline. Placement eligibility computed from academic rules. Event reminders.

**Edge cases.** An anonymous grievance where investigation requires identity. A grievance about
the person who would normally handle it, requiring an alternative route. A notice sent to the
wrong audience, requiring visible retraction rather than deletion. A disciplinary case
overlapping a police matter. An offer withdrawn by a recruiter after acceptance. A student with
two offers.

---

## Platform capabilities (cross-cutting, not modules)

These are used by every domain. Building each one inside its consuming module is how ERP systems
end up with five notification systems and no audit trail.

| ID | Capability | What it provides |
|---|---|---|
| P1 | **Workflow and approvals** | Configurable chains, delegation, escalation, parallel and sequential steps, a unified approval inbox. Every domain's approvals run on this one engine |
| P2 | **Notifications** | One event bus to push, email, SMS and in-app, with per-user preferences, quiet hours, templates, delivery tracking and retry |
| P3 | **Documents and files** | Upload, virus scan, versioning, verification status, retention, signed access URLs. Used by admissions, HR, assessment and cases |
| P4 | **Certificates and letters** | Templated generation from live data, numbering, digital signature, an issue register, revocation and reissue. Bonafide, transfer, conduct, transcripts and experience letters are all one capability |
| P5 | **Reporting and analytics** | A shared query, filter, schedule and export layer. Every module contributes reports to it. There is deliberately no "Reports module" |
| P6 | **Audit and compliance** | Immutable event log of every read of sensitive data and every write, actor, scope, before and after, reason. Tamper-evident. Not optional per module |
| P7 | **Search and command** | Cross-domain search scoped by permission, plus a command palette for keyboard-driven operation |
| P8 | **Configuration and integration** | Per-tenant settings, feature flags, import pipelines with dry-run, and outbound integrations to university portals, payment gateways, accounting and biometric devices |
