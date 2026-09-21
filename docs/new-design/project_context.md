# Project Context — New Design (Card Stack Shell)

## Where this sits
College ERP is one continuously evolving system. This folder does **not** start a new project.
It specifies one UI capability: a **container/card language** taken from `assets/new_design.jpeg`,
to be adopted across the Flutter clients (`lib/`) and mirrored on web (`clients/web`).

Authoritative system docs remain:
- `PROJECT_STATE.md` (TRACER), `ARCHITECTURE_INDEX.md`, `MODULE_REGISTRY.md`
- `docs/07-design-system.md` — the existing token contract. This spec **extends** it; it does not
  replace colour, type or spacing tokens already approved there.
- `docs/11-decisions.md` — ADR register.

## The reference
`assets/new_design.jpeg` — a mobile entry sheet (billing app). What we take from it:
- a **warm off-white page ground** with pure-white cards floating on it;
- **one row = one card**, cards separated by air instead of dividers;
- **grouped gaps**: tight gap inside a group, wider gap between groups;
- a **full-width bottom sheet** with a large top radius that owns the working area;
- a **single dominant primary action** (the green check FAB) plus quiet secondary actions;
- generous touch targets, no hairline-dense list rows.

What we deliberately do **not** take:
- its brand colours (green/warm beige). Our accent stays the approved ERP primary.
- its rounded/friendly font. `Inter` stays.
- its emoji-ish density. ERP screens are denser and must stay scannable.

## Why
Owner feedback (`feedbackchanges.md`, `requirements.md` inbox) says mobile and web are not
aligned and the web dashboard is not arranged "in an advanced manner". A shared container
language is the cheapest way to make every screen look like one product.

## Scope boundary
This is a **presentation-layer** capability. No entity, permission, workflow, migration or
API contract changes. If any screen needs a behaviour change to adopt the language, that is a
separate slice and goes to `decisions.md` as an open decision.
