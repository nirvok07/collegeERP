Now switch from ERP-level architecture mode into DEEP MODULE DESIGN mode.

We will design one module at a time.

For every module, behave simultaneously as:

* Principal Product Manager
* Business Analyst
* Enterprise Architect
* UX Architect
* Database Architect
* Security Architect
* QA Architect

Do NOT simply produce a feature list.

Design the module as a complete real-world operational system.

==================================================

1. MODULE PURPOSE
   ==================================================

Start with:

* module purpose
* business problem solved
* module owner
* primary users
* secondary users
* responsibilities
* boundaries

Clearly explain what belongs inside this module and what does NOT.

==================================================
2. USER JOURNEYS
================

For each important user role, describe the major journeys.

Example:

User opens module
→ sees relevant dashboard
→ searches/filter records
→ opens record
→ performs action
→ validation
→ approval if required
→ state change
→ notification
→ audit entry

Design different journeys for different roles.

Do not assume every role sees the same UI.

==================================================
3. WORKFLOWS
============

For EVERY major workflow provide:

Workflow name

Trigger
Actor
Preconditions
Inputs
Validation
Business rules
Decision points
State transition
Database changes
Notifications
Approvals
Next possible actions
Success state
Failure state
Rollback/correction process
Audit requirements

Always model both:

Happy path
Exception path

==================================================
4. STATE MACHINES
=================

Identify every important entity with a lifecycle.

For each:

State A
→ allowed action
→ actor
→ validation
→ State B

Clearly identify:

* terminal states
* reversible states
* irreversible states
* automatic transitions
* scheduled transitions
* correction mechanisms

==================================================
5. BUSINESS RULES
=================

Write explicit business rules.

Examples:

IF condition
THEN action

Include:

* validation rules
* eligibility rules
* approval rules
* calculation rules
* uniqueness rules
* date rules
* academic-year rules
* department rules
* role restrictions

Do not hide important logic inside vague descriptions.

==================================================
6. DATA MODEL
=============

Derive the data model from workflows.

For each entity define:

* purpose
* fields
* identifier
* relationships
* ownership
* lifecycle
* status
* audit fields
* timestamps
* historical requirements
* soft-delete requirements
* uniqueness constraints

Clearly distinguish:

Master Data
Transactional Data
Reference Data
Derived Data
Audit Data

Do NOT create a database table merely because a UI screen exists.

==================================================
7. SOURCE OF TRUTH
==================

For every important piece of data identify:

* authoritative owner
* who can modify it
* who can read it
* which modules consume it
* what happens when it changes

Avoid duplicate sources of truth.

==================================================
8. PERMISSIONS
==============

Create a detailed permission matrix.

For each role define:

View
Create
Edit
Submit
Approve
Reject
Cancel
Reverse
Delete
Export
Bulk Action

Also identify:

* department restrictions
* campus restrictions
* academic-year restrictions
* record-level restrictions
* sensitive fields

==================================================
9. UI INFORMATION ARCHITECTURE
==============================

Now design the actual UI.

Do NOT start with visual decoration.

Start with information architecture.

Define:

* module landing page
* dashboard
* navigation
* tabs
* pages
* detail views
* drawers
* modals
* forms
* tables
* filters
* search
* bulk actions
* contextual actions
* activity timeline
* approval interface

For each screen explain:

Purpose
Primary user
Primary action
Secondary actions
Information hierarchy
Important states

==================================================
10. MODERN ERP UX
=================

The interface must feel like a premium modern SaaS application.

Avoid:

* cluttered dashboards
* huge walls of cards
* excessive modals
* unnecessarily nested navigation
* giant forms
* confusing tables
* tiny action buttons
* excessive colors
* decorative animations
* old-fashioned enterprise UI patterns

Prefer:

* progressive disclosure
* contextual actions
* smart defaults
* keyboard-friendly workflows
* powerful search
* meaningful filters
* saved views
* bulk actions
* inline actions
* clear status visualization
* excellent empty states
* excellent loading states
* excellent error recovery
* responsive layouts

Think carefully about information density.

ERP users often work with large amounts of data, so the interface should be dense WITHOUT becoming visually chaotic.

==================================================
11. SCREEN-BY-SCREEN SPECIFICATION
==================================

For every important screen provide:

Screen name
Purpose
User role
Entry points
Layout
Sections
Components
Primary CTA
Secondary actions
Filters
Table columns
Sorting
Pagination
Search
Bulk actions
Validation
Loading state
Empty state
Error state
Success state
Permission behavior
Responsive behavior

If a screen can be simplified, simplify it.

==================================================
12. UX MICRO-INTERACTIONS
=========================

Define purposeful micro-interactions.

Examples:

* save feedback
* optimistic updates where safe
* toast notifications
* progress indicators
* confirmation before destructive actions
* undo where appropriate
* inline validation
* autosave where appropriate
* keyboard shortcuts
* skeleton loading
* transitions between related states

Animations must improve comprehension and perceived responsiveness.

Do not over-animate.

==================================================
13. MOBILE / RESPONSIVE UX
==========================

Determine how the module behaves on:

Desktop
Tablet
Mobile

Do NOT simply shrink the desktop UI.

Identify which:

* columns disappear
* information becomes stacked
* actions move into menus
* tables become cards/list views
* filters become sheets
* navigation changes

==================================================
14. ACCESSIBILITY
=================

Consider:

* keyboard navigation
* focus management
* readable contrast
* screen readers
* semantic structure
* accessible forms
* accessible tables
* reduced-motion support

==================================================
15. NOTIFICATIONS
=================

Identify all notifications generated by this module.

For each:

Trigger
Recipient
Channel
Priority
Message purpose
Timing
Action available

Consider:

In-app
Email
SMS
Push
WhatsApp only where appropriate and legally/operationally justified

Avoid notification spam.

==================================================
16. REPORTS & ANALYTICS
=======================

Define:

* module dashboards
* KPIs
* operational reports
* management reports
* exports
* filters
* drill-downs

Every metric must have a clearly defined calculation/source.

==================================================
17. AUDIT & SECURITY
====================

Identify:

* sensitive operations
* audit events
* who changed what
* before/after values where necessary
* IP/device/session considerations where appropriate
* approval history
* suspicious behavior
* retention requirements

Never allow important business changes to become untraceable.

==================================================
18. EDGE CASES
==============

Try to break the module.

Generate at least:

* 10 realistic edge cases
* 5 permission-related edge cases
* 5 data-integrity edge cases
* 5 workflow-failure scenarios

For each provide the correct system behavior.

==================================================
19. CROSS-MODULE EFFECTS
========================

Whenever this module changes something important, identify:

What other modules are affected?

For each dependency:

Source
Event/Change
Consumer
Expected behavior
Failure handling

Avoid tightly coupling modules unnecessarily.

==================================================
20. UI QUALITY REVIEW
=====================

Act as a world-class UX reviewer.

Critically review the proposed interface.

Ask:

* Can a new user understand it?
* Can an experienced user operate it quickly?
* Are the most frequent actions fastest?
* Is information hierarchy clear?
* Is there unnecessary navigation?
* Are there too many clicks?
* Are forms too long?
* Are tables usable at scale?
* Are errors recoverable?
* Is the interface visually calm?
* Is the information density appropriate?
* Does it feel like a modern product?

Then improve the design.

==================================================
21. ARCHITECTURE QUALITY REVIEW
===============================

Finally review:

* business logic
* module boundaries
* data model
* permissions
* workflows
* state transitions
* dependencies
* auditability
* scalability
* maintainability

Find contradictions with previously approved architecture.

Do not silently change architectural decisions.

If a change is necessary:

Add it to the Architecture Decision Log.

==================================================
FINAL OUTPUT
============

For each module produce the specification in this order:

1. Module Overview
2. Actors
3. Responsibilities
4. User Journeys
5. Workflows
6. State Machines
7. Business Rules
8. Data Model
9. Source of Truth
10. Permissions
11. UI Information Architecture
12. Screen Specifications
13. UX Interactions
14. Responsive Behavior
15. Accessibility
16. Notifications
17. Reports & Analytics
18. Audit & Security
19. Edge Cases
20. Cross-Module Dependencies
21. UX Review
22. Architecture Review
23. Open Decisions
24. Architecture Decision Log Updates

IMPORTANT:

Do not design all modules simultaneously.

Take ONE module at a time.

At the beginning of each module, identify which previously designed modules and decisions are relevant.

Keep context compact by referencing existing decisions instead of repeating the entire ERP specification.

Never invent requirements silently.

If something materially affects architecture, ask me.

Otherwise make a reasonable assumption, record it, and continue.

The goal is not maximum documentation.

The goal is a precise blueprint that another expert engineering team can implement without repeatedly guessing what the product should do.
