# Checklist — New Design Container Language

Status model per CLAUDE.md §3: ✅ DONE · 🟡 IN PROGRESS · ⚠️ PARTIAL · ❌ NOT BUILT ·
🚫 BLOCKED · 🔍 NEEDS VALIDATION · ⏸️ POSTPONED

## Slices
| Slice | State | Evidence |
|---|---|---|
| ND-S1 Tokens | ❌ | `DESIGN_TOKENS_ADDITIONS.dart` still a separate staged file |
| ND-S2 Core containers | ❌ | — |
| ND-S3 Composite containers | ❌ | — |
| ND-S4 `AppSheet` | ❌ | — |
| ND-S5 Pilot screen | ❌ | — |
| ND-S6 Mobile rollout | ❌ | — |
| ND-S7 Web parity | ❌ | — |
| Docs (this folder) | ✅ | 2026-09-21 |

## Per-component definition of done
For each of `AppCard`, `AppCardGroup`, `AppRowCard`, `AppEntityCard`, `AppSummaryCard`,
`AppTilePair`, `AppSheet`:
- [ ] Uses tokens only; no literal spacing, radius or colour
- [ ] Stateless, no Cubit import, no feature-module import
- [ ] Tap target ≥48dp, ≥8dp from its neighbour
- [ ] Loading / empty / error state drawn inside the container
- [ ] Widget test for geometry + each state
- [ ] Documented in `DESIGN.md` before it exists in code

## Per-screen migration checklist
- [ ] All grouping goes through `AppCardGroup` (gaps never hand-written)
- [ ] Exactly one filled primary action
- [ ] Old ad-hoc card code deleted, not left beside the new one
- [ ] Existing tests pass; goldens re-baselined intentionally
- [ ] Text survives 1.3× scale without clipping
- [ ] Offline/queued state visible where the screen writes data

## Accessibility gate (ui-ux-pro-max CRITICAL)
- [ ] Body contrast ≥4.5:1, large ≥3:1
- [ ] Visible focus indicator on every interactive element
- [ ] No status conveyed by colour alone
- [ ] Reduced motion honoured
- [ ] Icon-only controls carry a semantic label

## Release gate
- [ ] `flutter analyze` clean, `flutter test` green
- [ ] Web build + tests green
- [ ] Both APK flavours build
- [ ] 🔍 On-device visual check (phone) — cannot be claimed without the device
- [ ] 🚫 iOS check — Xcode not installed
- [ ] `PROJECT_STATE.md` TRACER updated, commit recorded
