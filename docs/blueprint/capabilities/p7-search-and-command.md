# P7 — Search and Command

Blueprint capability P7. **Status: ❌ not built.**

## 1. What this capability owns

Cross-domain search scoped by permission, and a command palette for keyboard-driven operation.

## 2. Why it matters more as the system grows

With M1–M7 and M11 built, a person navigates by menu. With M4, M10, M13–M24 built, they will not:
the answer to "where is Priya's fee status" cannot be six clicks through a tree. Search is the
navigation model of a large ERP, and retrofitting it after twenty modules is far harder than
declaring it now.

This is why P7 is documented before the modules that need it, even though it is built after them.

## 3. Scoped by permission, always

A search result a person may not open must not appear. Not greyed out — **absent**. A result list is
an information disclosure: "no matching student" and "a student you cannot see" must be
indistinguishable, which is AD-70's rule for unauthenticated lookups applied to authenticated search.

Each module registers a searchable projection declaring its permission and scope rule. P7 fans out,
applies the same scope resolution as the module's own read path (as P5 §3 does), and merges.

## 4. Scope of v1

| In | Out |
|---|---|
| People, students, employees | Full-text over document contents |
| Courses, sections, offerings | Fuzzy matching beyond trigram |
| Invoices, receipts, certificates by serial | Search over audit history |
| Library items, assets by tag | Cross-tenant anything, ever |
| Cases and notices by title | |

PostgreSQL trigram and full-text indexes, per module, scoped by tenant. No external search service:
it would mean replicating tenant-scoped data outside the RLS boundary that protects it, which is a
large security decision to take for a convenience feature.

## 5. The command palette

Keyboard-driven: `Cmd/Ctrl-K` opens it; typing searches entities and **actions**. "mark attendance"
jumps to today's register; "new invoice" opens the form. `docs/MASTER-CHECKLIST.md` §4 already
requires keyboard-driven operation for a dense administrative product.

Actions are registered with their permission, so the palette never offers what the person cannot do.

Web only, as a recorded parity exception (AD-84 §6.4): a command palette is a keyboard affordance
and a phone has no keyboard. Flutter gets search without the palette.

## 6. Build slices

| Slice | Scope | Surfaces |
|---|---|---|
| P7-1 | Projection registry, per-module indexes, trigram/FTS | S |
| P7-2 | Scoped fan-out and merge, keyset paging | S |
| P7-3 | Global search UI | W, F |
| P7-4 | Command palette with registered actions | W |
| P7-5 | Recent and frequent, per person | S, W, F |

## 7. Cross-module impact

Every module registers a projection. Depends on M1 (permission and scope), AD-61 (paging), AD-70
(non-disclosure). Consumed by every screen's navigation.
