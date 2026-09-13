# 7. Design System

Premium is not decoration. It is restraint, consistency, hierarchy and motion that explains
what just happened. Everything below is a token or a component. No screen invents a value.

## 7.1 Principles

1. **Content first.** An ERP is dense. Chrome shrinks so data can breathe.
2. **One accent.** Colour carries meaning: primary for action, semantic colours for state.
   Decorative colour is not used.
3. **Depth through hierarchy, not shadow.** Surfaces separate by tone and spacing. Shadows are
   reserved for genuinely floating elements.
4. **Every state is designed.** Loading, empty, error, offline and success are drawn, not
   left to a default spinner.
5. **Motion is feedback.** Under 300ms, easing out, and never between the user and their task.

## 7.2 Colour

Defined once in `core/design/tokens.dart`, consumed through `Theme`. Both themes are defined;
mobile currently ships light only (AD-67): a white page, cool-grey panels (`AppColors.panel`),
hairline borders (`AppColors.line`) and 18px panel radius. The dark column below still describes
`AppTheme.dark()` for when it is re-enabled.

| Role | Light | Dark | Use |
|---|---|---|---|
| Primary | Indigo 600 | Indigo 400 | Primary actions, active nav, selection |
| On primary | White | Near-black | Text on primary |
| Surface | White | Neutral 900 | Cards, sheets |
| Background | Neutral 50 | Neutral 950 | Page ground |
| Surface variant | Neutral 100 | Neutral 800 | Input fills, chips, table headers |
| Outline | Neutral 200 | Neutral 700 | Borders, dividers |
| Text primary | Neutral 900 | Neutral 50 | Headings, body |
| Text secondary | Neutral 600 | Neutral 400 | Labels, captions |
| Success | Emerald 600 | Emerald 400 | Present, paid, synced |
| Warning | Amber 600 | Amber 400 | Shortfall, pending sync, due soon |
| Error | Red 600 | Red 400 | Absent, failed, overdue |
| Info | Sky 600 | Sky 400 | Notices, neutral information |

Attendance status colours are fixed across the whole app: present is success, absent is error,
late is warning, excused is info. A student and a teacher never see the same status in two
different colours.

Contrast meets WCAG AA, 4.5:1 for body text and 3:1 for large text, in both themes. Status is
never communicated by colour alone; an icon or a label always accompanies it.

## 7.3 Typography

One family, `Inter`, bundled rather than fetched so the first frame is never unstyled.

| Token | Size / weight | Use |
|---|---|---|
| displayLarge | 32 / 700 | Dashboard hero figure |
| headlineMedium | 24 / 700 | Page titles |
| titleLarge | 20 / 600 | Section headers |
| titleMedium | 16 / 600 | Card titles, list primary |
| bodyLarge | 16 / 400 | Body |
| bodyMedium | 14 / 400 | List secondary, default |
| labelLarge | 14 / 600 | Buttons |
| labelMedium | 12 / 500 | Chips, captions, table headers |

Line height is 1.4 for body and 1.2 for headings. Numeric columns use tabular figures so marks
and percentages align down a column.

## 7.4 Spacing, radius, elevation

A 4pt scale: 4, 8, 12, 16, 20, 24, 32, 40, 48. Named `AppSpacing.xs` through `AppSpacing.xxl`.
No arbitrary padding anywhere.

- Screen horizontal padding: 16 on phones, 24 on tablets
- Vertical rhythm between sections: 24
- Radius: 8 for inputs and chips, 12 for cards, 16 for sheets and dialogs, full for avatars and
  pills
- Elevation: 0 for cards on a tinted background, level 1 for app bars on scroll, level 2 for
  sheets and menus, level 3 for dialogs. Shadows are soft, large-radius and low-opacity

## 7.5 Component inventory

Built once in `core/widgets`, used everywhere.

**Foundations** — `AppScaffold` with an offline banner slot, `AppAppBar`, `AppBottomNav`,
`AppCard`, `AppSectionHeader`, `AppDivider`.

**Actions** — `AppButton` in primary, secondary, tonal, destructive and text variants, each with
a built-in loading state that locks width so the layout does not jump. `AppIconButton`,
`AppFab`.

**Input** — `AppTextField` with label, helper, error and character counter, `AppDropdown`,
`AppSearchField` with debounce, `AppDatePicker`, `AppTimePicker`, `AppSegmentedControl`,
`AppSwitchTile`, `AppCheckbox`.

**Display** — `AppAvatar` with initials fallback, `AppBadge`, `AppStatusChip`, `AppListTile`,
`AppStatTile`, `AppProgressRing` for attendance percentage, `AppDataTable` with a horizontally
scrollable body and a pinned first column, `AppTimelineTile`.

**Feedback** — `AppSkeleton` shimmer shapes matching the real layout, `AppEmptyState` with an
illustration plus one clear action, `AppErrorState` with a message and a retry, `AppOfflineChip`,
`AppSnackbar` in neutral, success and error, `AppConfirmSheet` for destructive actions,
`AppBottomSheet`.

## 7.6 Screen state contract

Every data screen implements five states. This is checked in review.

| State | Treatment |
|---|---|
| Loading, nothing cached | Skeleton matching the final layout. Never a centred spinner |
| Refreshing, data present | 2px indeterminate bar under the app bar. Content stays interactive |
| Success | Content, plus a freshness line when data is over an hour old |
| Empty | Illustration, one sentence explaining why it is empty, one action |
| Error | Cause in plain language, a retry button, and cached data below it when any exists |

Offline is a modifier on all five, not a sixth state: a persistent slim banner reading
"Offline. Showing saved data" plus a pending-changes count when the outbox is non-empty.

## 7.7 Motion

Motion is part of the product, not decoration. It exists to explain hierarchy,
state change, navigation, feedback and spatial relationship. Every animated value in
the product comes from one file, `clients/web/src/design/motion.css`, and no screen invents
its own duration, curve or keyframe.

### Duration bands

Chosen by interaction complexity, not applied uniformly. A larger surface gets a
longer duration because it travels further, and reads as the same speed.

| Token | Value | Used for |
|---|---|---|
| `--dur-micro` | 140ms | Press, hover, chip, checkbox |
| `--dur-state` | 180ms | Colour, badge, inline validation |
| `--dur-panel` | 260ms | Drawer, popover, collapse |
| `--dur-page` | 300ms | Section change, sheet |
| `--dur-exit` | 140ms | Every exit |

Exits are deliberately shorter than entrances. Waiting for something to leave is
dead time; waiting for something to arrive is anticipation.

### Easing

`--ease-out` for entrances, which decelerate into place. `--ease-in` for exits,
which accelerate away. `--ease-in-out` for movement between two on-screen states.
`--ease-sharp` for pressed feedback, nearly linear because the eye reads it as
instant. Linear is used only for indeterminate progress.

### Presets

`.m-rise` content arriving in place. `.m-fade` a cross-fade when nothing moved.
`.m-pop` popovers, scaling from 0.97 so it does not read as bouncy. `.m-drawer`
and `.m-bottom-sheet` panels entering from the edge they will return to.
`.m-stagger` capped list entry. `.m-changed` a one-pass highlight on a row whose
value just changed. `.m-press` pressed feedback.

### Motion hierarchy

Feedback outranks everything. A press must never be delayed or queued behind a
larger transition, which is why pressed states use the shortest band and the
sharpest curve. Section transitions animate one wrapper element rather than each
row of their content, so a page change costs one compositor layer regardless of
how much is inside it.

### Performance

Keyframes animate only `transform`, `opacity` and colour, which is enforced by a
test that parses the stylesheet and fails on any property that can trigger
layout. Table rows change background on hover and never transform, so pointer
movement over a long table repaints nothing geometric. Row actions reserve their
space and fade, rather than appearing and reflowing the row.

Stagger is capped at eight rows in CSS, and dropped entirely above twenty-four
in `motion.ts`, because past that it stops explaining arrival order and only
costs frames.

### Reduced motion

Durations collapse to 1ms and travel distances to zero. Positional entrances
become a fade, so arrival is still signalled without movement. Indeterminate
progress keeps looping, because a frozen spinner reads as a hung interface. The
interface must never become harder to understand because motion was removed.

### On GSAP

Not used, and not needed here. Every motion in this product is a transform or an
opacity change on a single element, which CSS runs on the compositor with no
library. GSAP earns its place for coordinated timelines and complex sequenced
storytelling; adding it for a drawer slide would cost bundle size and a second
animation vocabulary for no gain. Revisit only if a genuinely orchestrated
sequence appears, and record the reason at that point.

## 7.8 Responsiveness and accessibility

Breakpoints: compact under 600, medium 600 to 1024, expanded above. On medium and expanded the
bottom navigation becomes a navigation rail and list screens gain a detail pane.

- Every layout survives text scaling to 200 percent. No fixed-height box wraps scalable text.
- Minimum touch target 48 by 48.
- Every icon-only control carries a semantic label.
- Focus order follows visual order, and every interactive element is reachable by keyboard on
  tablets with keyboards.
- Content respects safe areas and resizes correctly when the keyboard appears; form screens
  scroll the focused field into view.
