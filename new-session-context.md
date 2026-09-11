# NEW SESSION CONTEXT PROTOCOL

You are entering an existing software architecture / engineering project
in a new conversation/session.

Your objective is to continue the project with the MINIMUM necessary
context while preserving architectural correctness.

The project may contain many documents, modules, decisions, contracts,
and implementation artifacts.

DO NOT load or reproduce the entire project context unnecessarily.

==================================================
PRIMARY PRINCIPLE
=================

Context should be:

MINIMAL
RELEVANT
TRACEABLE
CURRENT

Do not consume context by repeatedly summarizing the entire ERP.

Retrieve only the information required for the current task.

==================================================
SOURCE OF TRUTH
===============

Prefer project artifacts over conversation memory.

Use this hierarchy:

1. Approved architecture documents
2. Architecture Decision Log
3. Architecture Checkpoint
4. Module Registry
5. Approved Module Contracts
6. Open Decisions
7. Current module specifications
8. Implementation artifacts
9. Conversation context

If two sources conflict:

DO NOT silently choose one.

Report the conflict and identify which source is currently approved.

==================================================
SESSION START PROTOCOL
======================

At the beginning of a new session:

DO NOT immediately load the entire project.

First establish:

1. What project is this?
2. What is the current architecture state?
3. What was the last committed checkpoint?
4. What phase is currently active?
5. What module/task is currently active?
6. What decisions are awaiting approval?
7. What is the next intended action?

Then create a compact:

SESSION CONTEXT SNAPSHOT

Project:
Current Phase:
Current Module/Task:
Last Checkpoint:
Active Decisions:
Blocked Items:
Next Action:

Keep this snapshot concise.

==================================================
CONTEXT BUDGET RULE
===================

Use a progressive context-loading strategy.

LEVEL 1 — INDEX

Read only enough to identify:

* current phase
* current task
* relevant modules
* relevant decisions
* relevant contracts
* relevant files

LEVEL 2 — TARGETED CONTEXT

Load only the artifacts directly relevant to the current task.

For example:

If designing Attendance:

Load:

* Attendance-related existing module contracts
* relevant Module Registry entries
* relevant architecture decisions
* relevant entities/source-of-truth decisions
* relevant workflows/dependencies

Do NOT load unrelated modules in full.

LEVEL 3 — DEEP CONTEXT

Only when required, inspect the complete relevant document,
section, workflow, or module specification.

LEVEL 4 — CROSS-MODULE IMPACT

If a design decision affects another module:

Load that module's relevant contract/specification.

Do NOT automatically load the entire ERP.

==================================================
NO REPETITION RULE
==================

Never repeatedly reproduce:

* complete ERP architecture
* complete module list
* complete role list
* complete design system
* complete architecture decisions
* complete module specifications

Reference the existing artifact instead.

Example:

BAD:

"Here is the entire ERP architecture again..."

GOOD:

"Attendance depends on Academic Structure and Timetable.
I will verify their ownership and contracts before proceeding."

==================================================
RELEVANCE FILTER
================

Before loading any project artifact, ask internally:

"Does this artifact contain information that can change the
current decision?"

If NO:

Do not load it.

If YES:

Load only the relevant portion when possible.

==================================================
MODULE REGISTRY FIRST
=====================

For module-related work, use the Module Registry as the first
cross-module navigation layer.

Determine:

* relevant modules
* ownership
* dependencies
* source of truth
* events
* contracts
* status

Then selectively inspect only the affected modules.

==================================================
ARCHITECTURE DECISION LOG
=========================

Before making an architecture-impacting decision:

Check relevant existing Architecture Decision Records.

Never create a decision that contradicts an approved decision
without explicitly identifying the conflict.

If a conflict exists:

⚠️ ARCHITECTURE CONFLICT

Show:

Existing Decision:
New Requirement:
Conflict:
Affected Areas:
Recommended Resolution:
Approval Required:

Do not silently override the existing decision.

==================================================
OPEN DECISIONS
==============

Before proceeding with a task, check whether it depends on an
unresolved Open Decision.

If yes:

Determine whether the task can safely continue with an explicit
temporary assumption.

If it cannot:

Mark the task:

🔴 BLOCKED

Do not invent a permanent architectural decision.

==================================================
APPROVED MODULE PROTECTION
==========================

Treat APPROVED modules and their Module Contracts as architectural
checkpoints.

Do not casually modify:

* ownership
* source of truth
* state ownership
* workflow ownership
* permissions
* dependencies
* events
* public capabilities
* invariants

If a change is necessary:

mark:

ARCHITECTURE CHANGE REQUIRED

and perform impact analysis.

==================================================
CONTEXT COMPACTION
==================

When the conversation becomes large:

Do NOT create a giant summary containing everything.

Instead create a compact checkpoint containing only:

* current objective
* relevant decisions
* active constraints
* current work
* unresolved questions
* affected artifacts
* next action

Older information remains in the project artifacts.

The checkpoint is a navigation aid, NOT a replacement for the
source documents.

==================================================
SESSION MEMORY
==============

At the end of significant work, update the appropriate persistent
project artifacts.

Prefer persistent project state over relying on conversation memory.

The next session should be able to recover from project artifacts
without requiring the previous conversation.

==================================================
NEW SESSION SAFETY CHECK
========================

Before starting substantive work, verify:

[ ] Current checkpoint identified
[ ] Current task identified
[ ] Relevant modules identified
[ ] Relevant architecture decisions identified
[ ] Relevant contracts identified
[ ] Open decisions checked
[ ] No unresolved architecture conflict affecting the task
[ ] Required context loaded
[ ] Unnecessary context excluded

Then proceed.

==================================================
FINAL PRINCIPLE
===============

DO NOT MAXIMIZE CONTEXT.

MAXIMIZE RELEVANT CONTEXT.

The goal is not for the AI to remember the entire ERP inside the
conversation.

The goal is for the AI to know:

WHERE THE TRUTH LIVES,
WHAT MATTERS RIGHT NOW,
WHAT HAS ALREADY BEEN DECIDED,
WHAT IS ALLOWED TO CHANGE,
AND WHAT THE NEXT ACTION IS.
