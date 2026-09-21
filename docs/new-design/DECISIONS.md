# Decisions — New Design Container Language

Local register for this capability. Anything that changes an approved architecture is promoted
to `docs/11-decisions.md` as a numbered ADR.

## Taken

| ID | Decision | Why |
|---|---|---|
| ND-D1 | Take **geometry and rhythm only** from `assets/new_design.jpeg`; keep the approved Inter + indigo + semantic palette. | Colour and type are an approved contract (`docs/07-design-system.md`). Changing them is a separate, larger decision with contrast and branding consequences (BR-1 college branding already rides on the current palette). |
| ND-D2 | Separation by **tone + gap + 4% shadow**, no card borders. | Matches the reference and the existing principle "depth through hierarchy, not shadow". Borders at ERP density turn into visual noise. |
| ND-D3 | Two gap levels (**12 intra / 20 group**) rather than one uniform gap. | The 5:3 contrast is what makes a long stack parseable; a single gap flattens grouping and forces divider lines back in. |
| ND-D4 | `nd.*` tokens are added to the existing `tokens.dart`, not kept in `DESIGN_TOKENS_ADDITIONS.dart`. | Two token files = two sources of truth (CLAUDE.md §13). |
| ND-D5 | Adoption is **strangler per screen**, each screen's tests updated in the same commit. | A one-shot restyle of every screen is an uncontrolled operation and unreviewable. |
| ND-D6 | Web mirrors the token **names**, not a shared runtime. | Flutter and web have no shared styling runtime; name parity is achievable today and greppable. |
| ND-D7 | Sheet becomes a centred dialog on tablet and a right-side panel on desktop, same radius. | Full-width sheets on a 1440 viewport read as broken; keeping the radius keeps the identity. |
| ND-D9 | Page ground stays the current **neutral-50**; no warm tint is introduced. | Owner decision 2026-09-21 (ND-O1 closed). Keeps every existing contrast check valid and avoids a one-off golden re-baseline; the reference's warmth is not load-bearing — the rhythm is. |
| ND-D8 | Row height 56 (≥48 target) even though the reference is denser at some rows. | Touch-target rule is CRITICAL in the ui-ux-pro-max ruleset; density is bought back with gaps, not with small targets. |

## Open

| ID | Question | Why it matters | Blocks | Status |
|---|---|---|---|---|
| ND-O2 | Do college-branded builds (BR-1) get to tint the card surface, or only the accent? | Tinted surfaces can break the 4.5:1 body contrast per college. | branding slice | open — proposed: accent only |
| ND-O3 | Does the web dashboard rearrangement (owner feedback) belong to this capability or its own module slice? | Scope control; it is a layout/IA change, not a container change. | web adoption | open — proposed: separate slice, consumes this language |
| ND-O4 | Dark theme: re-enable now that a new surface system exists? | Currently light-only by AD-67. | nothing today | open — not in scope |

## Rejected
- Adopting the reference's green accent — conflicts with semantic success colour (green = present/paid).
- A single `AppCard` with 20 boolean flags — variants are separate components (`ARCHITECTURE.md` §4).
- Per-screen animation timings — the global motion system owns timing.
