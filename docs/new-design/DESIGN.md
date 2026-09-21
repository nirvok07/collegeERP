# Design Spec — Container & Ratio Language
Source: `assets/new_design.jpeg`. Measured on the reference frame and normalised to dp on a
411dp-wide phone. Values are rounded onto the existing 4pt scale of `docs/07-design-system.md`.

## 1. Geometry (the part the owner asked for)

| Token | Value | Measured basis |
|---|---|---|
| `nd.pageMargin` | **16** | card edge sits 16dp from both screen edges; full-bleed never used for cards |
| `nd.gapTight` | **8** | label↔value inside a row, chip↔text |
| `nd.gapIntra` | **12** | between cards belonging to the same group (Date ↔ Party) |
| `nd.gapGroup` | **20** | between groups (Party ↔ Line item ↔ Totals) |
| `nd.gapSection` | **24** | between a card stack and the next section/heading |
| `nd.cardRadius` | **16** | card corner |
| `nd.sheetRadius` | **24** | bottom-sheet top corners only |
| `nd.cardPadX` | **16** | card horizontal padding |
| `nd.cardPadY` | **14** | card vertical padding for a single-row card |
| `nd.rowMinHeight` | **56** | single-row card height (≥48 touch target + padding) |
| `nd.controlSize` | **48** | icon buttons, close button, secondary circular actions |
| `nd.fabSize` | **64** | the one primary action |
| `nd.avatarSm` | **32** | party/person avatar inside a row |

### Ratios (so the language survives a screen-size change)
- Card inner width : screen width = **1 − 2·16/W** (≈0.92 on a 411dp phone).
- Group gap : intra gap = **5 : 3** (20 : 12). This contrast is what makes the stack readable —
  keep the ratio even if the base changes.
- Card radius : card padding = **1 : 1** (16 : 16).
- Sheet radius : card radius = **3 : 2** (24 : 16) — the sheet must read as the outer surface.
- Row height : page margin = **7 : 2** (56 : 16).
- Sheet working area starts at ~**20% of viewport height**; the sheet owns the rest.

## 2. Surfaces
| Layer | Colour role | Elevation |
|---|---|---|
| Page ground | `background` (existing neutral 50, cool — ND-D9) | 0 |
| Card | `surface` (white) | 0, with a soft `y=1, blur=3, 4% black` hairline shadow |
| Sheet | `surface` + 24 top radius | level 2 |
| Dimmed content behind a sheet | scrim 24% | — |

No card gets a visible border. Tone + gap + the 4% shadow is the whole separation system
(`docs/07-design-system.md` §7.1 principle 3 holds).

## 3. Card anatomy
```
┌─ AppCard ──────────────────────────────────────────┐
│ [leading 32]  Label                value  [trail]  │  ← 56 min height
└────────────────────────────────────────────────────┘
```
- **Row card** — one line. Label left in `bodyLarge`/`titleMedium`, value right in the same size
  with medium weight, trailing chevron/link/chip after `nd.gapTight`.
- **Entity card** — avatar + name, with a status chip and a text action on the right.
- **Detail card** — title row plus secondary lines (`bodyMedium`, `textSecondary`), right-aligned
  figures in tabular numerals.
- **Summary card** — 2–4 label→amount lines; the emphasised line uses a semantic colour *and*
  a label, never colour alone.
- **Tile pair** — two equal cards in a row, gap `nd.gapIntra`, used for at-a-glance figures.

## 4. Actions
- Exactly one filled primary action per screen; on a sheet it is the 64dp circular confirm,
  bottom-right, `nd.pageMargin` from both edges.
- Secondary actions are 48dp tonal circles or text links; they never compete in colour.
- A destructive action is never the visually dominant control.

## 5. Typography and colour
Unchanged from `docs/07-design-system.md`. `Inter`, indigo primary, semantic success/warning/
error/info. The reference's green/beige is **not** adopted; only its geometry and rhythm are.

## 6. Motion
- Sheet in: 240ms `easeOutCubic`, slide + fade.
- Card stack: 60ms staggered fade+8dp rise, capped at 6 items, total ≤300ms.
- Value change: 160ms cross-fade. No overshoot on data rows.
- All of it behind the global motion system; `prefers-reduced-motion` / `MediaQuery.disableAnimations`
  renders the end state immediately.

## 7. Responsive
| Breakpoint | Behaviour |
|---|---|
| ≤600 (phone) | single column, margins 16, sheet full width |
| 600–1024 (tablet) | margins 24, cards max-width 640 centred, sheet becomes a centred dialog at 24 radius |
| ≥1024 (web) | cards sit in the content column (max 1120), gaps scale to 16/24, row height 52, sheet becomes a right-side panel 480 wide |

Ratios from §1 are preserved at every breakpoint; only the base unit moves.

## 8. Accessibility (ui-ux-pro-max, CRITICAL tiers)
- Touch targets ≥48dp, ≥8dp apart.
- Visible focus ring 2dp on web and on keyboard-driven Flutter.
- Chips and status never rely on colour alone.
- Text reflows at 1.3× scale; cards are content-height, never fixed-height.
