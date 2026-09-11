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

Defined once in `core/design/app_colors.dart`, consumed through `Theme`. Both light and dark
themes ship in release one, because a student checks a timetable at night.

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

| Interaction | Duration | Curve |
|---|---|---|
| Press feedback, ripple and scale to 0.98 | 100ms | easeOut |
| Chip, checkbox, switch state change | 150ms | easeOutCubic |
| Expand and collapse | 250ms | easeInOutCubic |
| Page transition | 250ms | easeOutCubic, slide with fade |
| Bottom sheet | 300ms | easeOutCubic |
| List item stagger on first load | 200ms, 30ms apart, first 8 items only | easeOut |
| Skeleton shimmer | 1200ms loop | linear |

Rules: nothing exceeds 300ms except a sheet. Nothing animates on every rebuild. A list staggers
on first load only, never on refresh. All motion respects the platform reduce-motion setting and
collapses to a cross-fade when it is on.

Purposeful moments worth animating: attendance status toggling per student, marks saving with a
check that settles, a pending row becoming synced, a section expanding, and the offline banner
sliding in.

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
