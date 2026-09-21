# Requirements — New Design Container Language

IDs are `ND-n`. Priority: P0 must, P1 should, P2 later.

## Functional / visual

| ID | P | Requirement |
|---|---|---|
| ND-1 | P0 | A single `AppCard` container is the only way a screen groups content. No screen builds its own card decoration. |
| ND-2 | P0 | Page ground is the existing neutral-50 (ND-D9); cards are pure surface. Separation comes from tone + gap, not from borders or heavy shadow. |
| ND-3 | P0 | Spacing follows the measured rhythm in `DESIGN.md`: 16 page margin, 12 intra-group gap, 20 inter-group gap. No arbitrary values. |
| ND-4 | P0 | Card radius 16; sheet top radius 24; pill/avatar full. Inputs and chips stay 8 per `docs/07-design-system.md`. |
| ND-5 | P0 | Every tappable row is at least 48dp high with ≥8dp between adjacent targets. |
| ND-6 | P0 | A row card is `leading? · label · value · trailing?` with the value right-aligned and the trailing affordance (chevron / link / chip) last. |
| ND-7 | P0 | One primary action per screen, rendered as the single filled control. Everything else is quiet (tonal or text). |
| ND-8 | P1 | Forms and creation flows use a full-width bottom sheet with the 24 top radius, a close control top-left and a context chip top-right. |
| ND-9 | P1 | Totals/summary cards use the same container but a multi-row label→amount layout, with the emphasis row in semantic colour (due = error, settled = success). |
| ND-10 | P1 | Web mirrors the same tokens and card anatomy at desktop density (see `DESIGN.md` §Responsive). |
| ND-11 | P2 | Status chips ("New", "New item") use the tonal chip style, never colour alone — text always present. |

## Non-functional

| ID | P | Requirement |
|---|---|---|
| ND-12 | P0 | Contrast: body ≥4.5:1, large text ≥3:1, in the shipped light theme. |
| ND-13 | P0 | Motion ≤300ms, ease-out, and honours reduced-motion. No per-screen animation systems. |
| ND-14 | P0 | Zero regression in existing widget tests; tokens only added, never mutated in place. |
| ND-15 | P1 | Dynamic type: cards grow, text never clipped or truncated at 1.3× scale. |
| ND-16 | P1 | Loading / empty / error / offline states are drawn inside the same container, not as bare spinners. |

## Out of scope
Colour palette change, font change, dark theme re-enable, navigation restructure, any server or
data-model change.
