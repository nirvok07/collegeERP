# Flow — How the Container Language is Applied

## 1. Screen composition flow
```
Screen
 └ AppScaffold (offline banner slot, existing)
    └ page ground: background token, padding = pageMargin
       └ AppCardGroup(               gapIntra between children
            header: optional section label
            children: [AppRowCard, AppEntityCard, ...])
       └ gapGroup
       └ AppCardGroup(...)
       └ AppSummaryCard
       └ primary action (FAB / bottom bar), never inside a card
```

## 2. Entry/edit flow (the reference sheet)
```
list screen ──tap "+"──▶ AppSheet opens (240ms, slide+fade)
   header: [× close 48dp]              [context chip e.g. SALE]
   body  : AppCardGroup
             · row card   → Date         21/09/2026  ›
             · entity card→ Person       [New] Change
           gapGroup
             · detail card→ line item + secondary lines
           gapGroup
             · summary card→ Total / Received / Balance due
   footer: [secondary 48dp] [secondary 48dp]        [primary 64dp ✓]
   ──confirm──▶ validate → Cubit → repository → outbox/API
   ──close/back──▶ dirty? confirm discard : pop
```
Every sub-picker (date, person, item) opens as its own sheet on top, same radius, and returns a
value to the parent sheet. The parent sheet is never rebuilt from scratch.

## 3. State flow inside a card
| State | Rendering |
|---|---|
| loading | card keeps its height, content replaced by a shimmer block of the same shape |
| empty | card shows the label plus a quiet "Not set" and the trailing affordance stays tappable |
| error | card keeps its shape; message in error colour **below** the row, inside the same card |
| offline / queued | trailing pending chip; the row stays interactive |
| success | 160ms cross-fade of the value; no toast for an inline change |

Errors live next to the field, never only at the top of the sheet.

## 4. Decision flow for a developer
```
Need to show a group of fields?        → AppCardGroup of AppRowCards
One person/entity with an action?      → AppEntityCard
Figures that add up?                   → AppSummaryCard
Two headline figures?                  → AppTilePair
Creating or editing something?         → AppSheet
None of the above fits?                → STOP. Add the variant to DESIGN.md, then build it.
```

## 5. Web parity flow
The web shell keeps its sidebar; the content column applies the same groups and gaps at the
desktop base (§7 of `DESIGN.md`). A sheet becomes a right-side panel. Token names match the
Flutter names one-to-one so a mismatch is visible by grep, not by eye.
