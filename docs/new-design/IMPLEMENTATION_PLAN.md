# Implementation Plan — New Design Container Language

Vertical slices. Exactly one is "next" at a time; the tracker in `PROJECT_STATE.md` holds the
live status. No slice is DONE without tests.

## ND-S1 — Tokens (foundation)
**Status:** geometry and light-mode data/fee palettes are folded into `lib/core/design/tokens.dart`;
the duplicate root reference file is retired. The `nd.*` geometry set is the `AppGeometry` section
from `DESIGN.md` §1 and names remain mirrored in `clients/web/src/design/`.
**Not in slice:** any screen change, any colour change.
**Validation:** `flutter analyze` clean; a token test asserting the 5:3 gap ratio and the 48dp
minimum; web build passes.
**Done when:** no second token file remains. Dark-theme additions stay deferred under AD-67/ND-O4.

## ND-S2 — Core containers
**Build:** `AppCard`, `AppCardGroup`, `AppRowCard`.
**Not in slice:** sheet, summary, entity cards.
**Validation:** widget tests for padding/radius/min-height, a tap-target test at 48dp, and a
golden for one card and one group.

## ND-S3 — Composite containers
**Build:** `AppEntityCard`, `AppSummaryCard`, `AppTilePair`, including loading/empty/error states
from `FLOW.md` §3.
**Validation:** widget test per state; contrast assertion on the emphasis line.

## ND-S4 — `AppSheet`
**Build:** sheet shell (24 radius, close + context chip header, primary/secondary action row),
nested-sheet return values, dirty-close confirmation.
**Validation:** widget tests for open/close/dirty-discard; reduced-motion test renders end state.

## ND-S5 — First screen adoption (pilot)
**Build:** migrate one dense existing screen (proposed: attendance mark / register entry) fully
to the language; delete the ad-hoc card code it used.
**Validation:** existing tests green, goldens re-baselined, APK builds.
**Device:** 🔍 NEEDS VALIDATION on the phone — this is the slice where the rhythm is judged.

## ND-S6 — Mobile rollout
**Build:** remaining mobile screens, a few per commit, each with its tests.
**Validation:** per commit; a lint/grep check that no feature file contains a literal radius or
a raw card decoration.

## ND-S7 — Web parity
**Build:** apply the tokens and card anatomy to the web content column at desktop density.
**Not in slice:** dashboard information-architecture rework (ND-O3).
**Validation:** web tests, visual check at 1024 and 1440.

## Sequencing
S1 → S2 → S3 → S4 → S5 → (S6 ∥ S7). S5 gates S6/S7: if the rhythm is wrong on a real device,
fixing it after a full rollout is expensive.

## Risks
- Golden churn across S5–S6 — accepted, contained per commit.
- ND-O1 is closed (ND-D9, neutral-50), so no ground-colour golden re-baseline is expected.
