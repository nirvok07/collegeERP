# Architecture — New Design Container Language

## 1. Position in the system
Presentation layer only. No module boundary, entity, permission, event or migration is touched.
Existing layering (`docs/02-ARCHITECTURE.md`) is unchanged:

```
UI widgets ── Cubit ── repository ── Dio / local store ── server module
   ▲
   └── this spec lives here, and only here
```

## 2. Source of truth
- **Tokens:** `lib/core/design/tokens.dart` is the single source. The `nd.*` values of
  `DESIGN.md` are added as a `AppGeometry`/`AppSpacing` extension there. `DESIGN_TOKENS_ADDITIONS.dart`
  (already staged at repo root) is the staging file and must be folded into `tokens.dart`, not kept
  as a parallel token set — two token files would be a second source of truth.
- **Components:** `lib/core/widgets/`. One implementation per container type; screens compose.
- **Web:** `clients/web/src/design/` mirrors the same token names so a value can be compared
  across platforms by name.

## 3. Components introduced
| Component | File | Responsibility |
|---|---|---|
| `AppCard` | `core/widgets/app_card.dart` | surface, radius, padding, shadow, optional tap + ink |
| `AppRowCard` | `core/widgets/app_row_card.dart` | leading/label/value/trailing row on `AppCard` |
| `AppEntityCard` | `core/widgets/app_entity_card.dart` | avatar + name + chip + action |
| `AppSummaryCard` | `core/widgets/app_summary_card.dart` | label→value lines with one emphasis line |
| `AppCardGroup` | `core/widgets/app_card_group.dart` | applies `gapIntra` inside, `gapGroup` between |
| `AppSheet` | `core/widgets/app_sheet.dart` | 24-radius sheet, close + context chip header, primary action slot |
| `AppTilePair` | `core/widgets/app_tile_pair.dart` | two equal summary tiles |

`AppCardGroup` exists so gap rules are never re-typed in a screen; that is the rule most likely
to drift otherwise.

## 4. Rules that must hold
1. A screen never writes a raw `BoxDecoration`, `BorderRadius`, `EdgeInsets.all(n)` or `SizedBox(height: n)`
   with a literal — it uses a token or `AppCardGroup`.
2. No component reads `Theme.of(context).colorScheme` for a value that has a semantic token.
3. Components are stateless and Cubit-agnostic; they take data and callbacks.
4. Nothing in `core/widgets` imports a feature module.
5. Adding a variant requires a line in `DESIGN.md` first. Undocumented variants are the failure
   mode this whole spec exists to prevent.

## 6. Adoption strategy
Strangler, not rewrite. New and reworked screens use the components. Existing screens migrate
per slice (`IMPLEMENTATION_PLAN.md`), each with its golden/widget test updated in the same commit.
Old ad-hoc card code is deleted as its last caller migrates — never left alongside.

## 7. Cross-module impact
- Navigation, permissions, offline outbox, audit: **none**.
- Web dashboard arrangement (owner feedback) consumes this language but is its own slice.
- Golden tests, if any, will re-baseline per migrated screen; that is expected churn.
