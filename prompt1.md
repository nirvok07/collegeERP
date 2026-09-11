You are a Principal Enterprise Architect, Product Strategist, Senior Business Analyst, UX Architect, Database Architect, Security Architect, and QA Strategist with extensive experience designing production-grade ERP systems for colleges and universities.

I want to design a COMPLETE, MODERN, production-ready College ERP.

This is NOT a simple CRUD application.

Your job is to think like a team that has to deploy this ERP in a real college and support it for many years.

IMPORTANT:
Do not jump directly into coding.
Do not start by randomly listing features.
Do not assume that every common ERP feature is required.
Do not treat modules as separate pages/screens.

Think in terms of:
Business domains → actors → responsibilities → workflows → business rules → data → permissions → dependencies → UI/UX → automation → reporting.

==================================================
PRIMARY OBJECTIVE
=================

Design the complete blueprint of the College ERP.

The final system should be:

* modular
* scalable
* secure
* maintainable
* easy to operate
* highly usable
* visually polished
* fast
* responsive
* auditable
* extensible
* suitable for real college operations

The UI/UX must feel like a modern premium SaaS product, NOT like an old-fashioned government/college ERP.

Think:
clean information hierarchy
high information density without clutter
excellent dashboards
contextual actions
fast workflows
smart search
command-style navigation where useful
beautiful tables
excellent forms
clear status indicators
meaningful empty/loading/error states
smooth but restrained animations
responsive layouts
keyboard-friendly workflows
accessibility
consistent design system

Do NOT sacrifice usability for visual decoration.

==================================================
PHASE 1 — UNDERSTAND THE COLLEGE
================================

Before designing modules, model the college as a real organization.

Identify:

* organizational structure
* campuses
* departments
* programs
* courses
* academic years
* semesters
* sections
* batches
* students
* faculty
* staff
* management
* committees
* administrative departments
* external entities

Identify every important actor and role.

For each actor determine:

* responsibilities
* goals
* information they need
* actions they perform
* approvals they can make
* information they should NOT access
* workflows they participate in

Do not assume that "Admin" is one universal role.

==================================================
PHASE 2 — BUSINESS DOMAINS
==========================

Break the college into meaningful business domains.

Potential domains may include:

Admissions
Student Lifecycle
Academics
Attendance
Examinations
Results
Fees & Finance
Scholarships
Faculty
HR
Leave
Timetable
Library
Hostel
Transport
Inventory
Procurement
Assets
Communication
Documents
Certificates
Complaints/Grievances
Events
Alumni
Placement
Reports & Analytics
Administration
System Configuration
Audit & Compliance

But DO NOT blindly use this list.

Discover what should actually exist.

For every domain explain:

1. Purpose
2. Business owner
3. Actors
4. Core responsibilities
5. Inputs
6. Outputs
7. Major workflows
8. Important entities
9. Dependencies
10. Approval requirements
11. Reports
12. Notifications
13. Automation opportunities
14. Edge cases

==================================================
PHASE 3 — MODULE BOUNDARIES
===========================

Convert domains into a clean module architecture.

For every proposed module provide:

* module name
* purpose
* why it deserves to exist
* primary users
* secondary users
* sub-modules
* responsibilities
* major workflows
* important entities
* dependencies
* permissions
* approvals
* notifications
* reports
* audit requirements
* UI surfaces

IMPORTANT:

Do NOT create modules merely because they sound useful.

If two capabilities belong together, keep them together.

If one module is becoming too large, explain why it should be split.

Also explicitly identify:

* modules that should NOT be separate
* features that belong inside another module
* shared platform capabilities
* cross-cutting capabilities

Avoid unnecessary fragmentation.

==================================================
PHASE 4 — COMPLETE WORKFLOW MAP
===============================

For each major module identify the complete real-world lifecycle.

Do not only describe the happy path.

For each workflow define:

Trigger
→ Actor
→ Input
→ Validation
→ Business rules
→ Decision
→ State change
→ Database impact
→ Notification
→ Approval
→ Next step

Also model:

* rejection
* cancellation
* correction
* reversal
* resubmission
* expiry
* duplicate submission
* partial completion
* failed operation
* exceptional cases

==================================================
PHASE 5 — STATE MACHINES
========================

Identify important entities with lifecycles.

Examples:

Admission Application
Student
Fee Invoice
Payment
Leave Request
Attendance Record
Exam
Question Paper
Marks
Result
Complaint
Purchase Request
Purchase Order
Inventory Item
Hostel Allocation
Transport Allocation
Document
Certificate

For each important lifecycle define:

* states
* allowed transitions
* who can trigger each transition
* validation rules
* automatic transitions
* notifications
* irreversible transitions
* correction/reversal mechanism
* audit requirements

==================================================
PHASE 6 — CROSS-MODULE DEPENDENCIES
===================================

Create a dependency map.

For each module identify:

* data it consumes
* data it owns
* data it produces
* modules depending on it
* workflows crossing module boundaries
* shared entities
* possible circular dependencies
* events that should be emitted
* events that should be consumed

Pay special attention to:

Student
Academic Year
Program
Department
Course
Semester
Section
Faculty
Fee
Payment
Attendance
Exam
Result

Avoid multiple sources of truth.

Every important piece of data should have a clearly defined authoritative owner.

==================================================
PHASE 7 — RBAC & AUTHORIZATION
==============================

Design the authorization model.

Consider:

* role-based permissions
* record-level permissions
* department-level restrictions
* campus-level restrictions
* academic-year restrictions
* approval authority
* sensitive data
* exports
* bulk operations
* deletion
* impersonation
* audit logs

Explain where RBAC is sufficient and where more contextual authorization is required.

==================================================
PHASE 8 — UI/UX ARCHITECTURE
============================

Design the UX alongside the business architecture.

The ERP should feel modern, fast, premium, and extremely easy to operate.

Define:

* global navigation
* sidebar architecture
* top navigation
* command/search system
* dashboards
* module landing pages
* tables
* filters
* forms
* detail pages
* drawers
* modals
* bulk actions
* contextual actions
* notifications
* activity timelines
* approval interfaces
* empty states
* loading states
* error states
* confirmation patterns

DO NOT turn every action into a modal.

Use:

* pages for substantial workflows
* drawers for contextual editing
* modals for focused confirmation/actions
* inline editing when appropriate

Define how navigation changes based on role.

==================================================
PHASE 9 — DESIGN SYSTEM
=======================

Create a coherent design system for the ERP.

Define:

* visual hierarchy
* typography strategy
* spacing system
* component principles
* cards
* tables
* badges
* buttons
* forms
* inputs
* dropdowns
* tabs
* navigation
* alerts
* toast notifications
* dialogs
* charts
* status indicators

Animation should be:

* subtle
* purposeful
* fast
* consistent

Never use animation merely for decoration.

The interface should remain excellent even with animations disabled.

==================================================
PHASE 10 — REPORTING & ANALYTICS
================================

Identify reports required by:

* management
* principal
* HOD
* faculty
* accounts
* exam cell
* admissions
* HR
* students
* other relevant roles

For every major report identify:

* purpose
* filters
* data sources
* calculations
* permissions
* export requirements
* real-time vs scheduled nature

Also identify useful dashboards and KPIs.

==================================================
PHASE 11 — AUTOMATION
=====================

Identify:

A. rule-based automation
B. event-driven automation
C. scheduled automation
D. notification automation
E. AI-assisted functionality

For every automation:

Trigger
→ Logic
→ Action
→ Failure handling
→ Audit

Do not add AI just because it sounds modern.

Only recommend AI where it genuinely improves the workflow.

==================================================
PHASE 12 — EDGE CASES
=====================

Think like a QA architect.

For every major domain identify unusual real-world scenarios.

Examples:

* student changes program
* student changes section
* student transfers department
* admission cancellation
* fee refund
* partial payment
* failed payment
* duplicate payment
* attendance correction
* faculty replacement
* exam rescheduling
* marks correction after submission
* result modification after publication
* student migration
* backdated changes
* academic year rollover
* deleted/inactive records
* duplicate records
* concurrent editing

Do not assume everything goes perfectly.

==================================================
PHASE 13 — MVP & ROADMAP
========================

Divide the system into:

Phase 0 — Foundation
Phase 1 — MVP
Phase 2 — Core ERP
Phase 3 — Advanced ERP
Phase 4 — Intelligence & Automation

Prioritize using:

* business impact
* dependency
* frequency of use
* implementation complexity
* risk
* data centrality
* user value

Explain the reasoning.

==================================================
CRITICAL SELF-REVIEW
====================

Before finalizing the architecture, attack your own design.

Act as an independent Principal Architect reviewing another company's ERP.

Find:

* missing modules
* unnecessary modules
* incorrect boundaries
* duplicate responsibilities
* hidden dependencies
* security problems
* permission problems
* workflow gaps
* data integrity problems
* UX problems
* reporting gaps
* scalability problems
* audit gaps
* edge cases
* over-engineering
* under-engineering

Do NOT defend your previous decisions.

Fix the identified problems.

==================================================
OUTPUT FORMAT
=============

Do not dump everything into one enormous response.

Work progressively.

Start with:

1. Assumptions
2. Questions that genuinely affect architecture
3. Actor map
4. Business domain map
5. Proposed module architecture

Then stop and wait for my approval before moving into deep module specifications.

Maintain a clear "Architecture Decision Log" throughout the conversation.

Whenever a decision is made, record:

Decision
Reason
Alternatives considered
Impact

Whenever requirements are uncertain, record them under:

"Open Decisions"

Do not silently assume important requirements.

Remember:

You are designing a real enterprise ERP, not a collection of CRUD screens.
The UX must be considered a first-class part of the architecture.
