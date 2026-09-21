# College ERP — Design System Enhancements

**Generated:** 2026-09-16 | **Based on:** ui-ux-pro-max analysis  
**Current State:** 1 light theme (Indigo), 1 dark theme (unwired), Inter 8-scale  
**This Document:** Recommended enhancements for data visualization, dark mode, and status indicators

---

## 1. Color Palette Enhancements

### 1.1 Data Visualization Palette (for Fees Module & Dashboards)

Add these semantic data colors to `lib/core/design/tokens.dart`:

```dart
abstract final class AppDataColors {
  // Sequential — for ordered data (low to high)
  static const sequentialLight1 = Color(0xFFEEF2FF);   // Very light
  static const sequentialLight2 = Color(0xFFDEE9FE);
  static const sequentialLight3 = Color(0xFFBFDBFE);
  static const sequentialLight4 = Color(0xFF93C5FD);
  static const sequentialLight5 = Color(0xFF60A5FA);   // Medium
  static const sequentialLight6 = Color(0xFF3B82F6);   // Full
  
  // For charts: use 3-scale (light → medium → full)
  static const chartSequential = [sequentialLight2, sequentialLight5, sequentialLight6];
  
  // Diverging — for comparing positive/negative (paid/overdue, present/absent)
  static const divergingNegative = Color(0xFFDC2626);  // Red: overdue, absent, failed
  static const divergingNeutral = Color(0xFFF3F4F6);   // Gray: neutral
  static const divergingPositive = Color(0xFF059669);  // Green: paid, present, success
  
  // Status overrides (semantic layering)
  static const paidGreen = Color(0xFF059669);
  static const pendingAmber = Color(0xFFD97706);
  static const overdueRed = Color(0xFFDC2626);
  static const absentRed = Color(0xFFDC2626);
  static const presentGreen = Color(0xFF059669);
  static const lateAmber = Color(0xFFD97706);
  static const excusedBlue = Color(0xFF0284C7);
}
```

**Why:** Fees module needs distinct data visualization. Attendance re-uses existing status colors (AD-70 attends to this already), but payment tracking needs sequential + diverging for financial data.

---

### 1.2 Alternative Primary Palettes (Blue-based for Enterprise)

Current Indigo (`#4F46E5`) is correct for the ERP brand. **No change needed.** If ever a college requires a different brand:

| Scenario | Primary | Use |
|----------|---------|-----|
| **Current (keep)** | Indigo 600 (`#4F46E5`) | College branding. Verified at 4.5:1 contrast. |
| **Dark Dashboard** (unwired) | Indigo 400 (`#818CF8`) | Already in `AppColors.primaryDark`. Ready to wire. |
| **High-Contrast Variant** | Blue 700 (`#1E40AF`) | If college brand contrast fails legibleAccent(). Secondary option. |
| **Financial/Data Mode** | Blue 600 (`#0F172A`) | Only if moving to dark-first dashboard (future, not now). |

**Action:** No changes to primary in `tokens.dart`. Your current Indigo works. When dark theme is unwired (AD-67), use `primaryDark` as-is.

---

## 2. Dark Mode Refinement

### 2.1 Current State
- `AppTheme.dark()` is built and uses `AppColors.primaryDark` + seeded scheme
- Only light theme is wired in `app.dart`
- Unwire checklist: 1 line in `app.dart` + one test pass

### 2.2 Recommended Dark Mode Enhancements

Add explicit dark mode surface tokens for ERP dashboards (higher contrast, reduce eye strain):

```dart
abstract final class AppColorsDark {
  // Darker neutrals for reduced eye strain on admin screens
  static const darkGround = Color(0xFF0A0A0A);       // Pitch black, not #000
  static const darkPanel = Color(0xFF1A1A1A);       // Soft background
  static const darkPanelStrong = Color(0xFF2D2D2D); // Higher elevation
  static const darkLine = Color(0xFF404040);        // Borders, more visible
  static const darkInk = Color(0xFFF8F8F8);         // Near-white text
  static const darkInkMuted = Color(0xFFAEAEAE);    // Secondary text
  
  // Status colors (same semantic meaning, adjusted for dark contrast)
  static const darkSuccess = Color(0xFF34D399);     // Emerald 400
  static const darkWarning = Color(0xFFFBBF24);     // Amber 400
  static const darkError = Color(0xFFF87171);       // Red 400
  static const darkInfo = Color(0xFF38BDF8);        // Sky 400
}
```

Add to `theme.dart` when unwiring dark mode:

```dart
static ThemeData dark({Color? accent}) => _build(Brightness.dark, accent: accent);

// In _build(), when isDark:
final scheme = isDark
    ? ColorScheme.fromSeed(
        seedColor: accent ?? AppColors.primaryDark,
        brightness: Brightness.dark,
        surface: AppColorsDark.darkGround,
        onSurface: AppColorsDark.darkInk,
        surfaceContainer: AppColorsDark.darkPanel,
        outline: AppColorsDark.darkLine,
        // ... other dark overrides
      )
    : seeded.copyWith(...);
```

**Why:** Pure black (#000) fatigues eyes on dashboards. Slight lift to #0A0A0A reduces flicker and improves contrast with text.

---

## 3. Typography Enhancements

### 3.1 Current State
- Inter 8-scale (correct for modern enterprise)
- Shared with web, one family, bundled
- No display font (not needed for ERP)

### 3.2 Optional Enhancement: Add Data Monospace

For fees module tables, receipts, and financial reports, add monospace for numeric alignment:

```dart
abstract final class AppFonts {
  // Existing
  static const inter = 'Inter';
  
  // New (optional): for tabular data, student IDs, receipt numbers
  static const mono = 'JetBrains Mono'; // or Fira Code
}
```

Add to `pubspec.yaml`:

```yaml
fonts:
  - family: Inter
    fonts:
      - asset: assets/fonts/Inter-Regular.ttf
      - asset: assets/fonts/Inter-SemiBold.ttf
        weight: 600
      # ... existing variants
  - family: JetBrains Mono
    fonts:
      - asset: assets/fonts/JetBrainsMonoNerdFont-Regular.ttf
```

Then in `FeeStructureDetailScreen` and fee tables:

```dart
Text(
  receiptNumber,
  style: TextStyle(
    fontFamily: AppFonts.mono,
    fontFeatures: [FontFeature.tabularFigures()], // Align columns
    fontSize: 14,
  ),
)
```

**Why:** Tabular figures prevent column misalignment in payment tables. Fees module benefits the most.

**Scope:** Optional for FEE-6 and FEE-8 (reports). Not required for v1.

---

## 4. Status Indicators & Badge Colors

### 4.1 Current Attendance Status (Correct, No Change)

Your existing `AppColors` already define attendance correctly (AD-70 + design system §7.2):

| Status | Color | Use |
|--------|-------|-----|
| Present | Success (Emerald 600) | `#059669` |
| Absent | Error (Red 600) | `#DC2626` |
| Late | Warning (Amber 600) | `#D97706` |
| Excused | Info (Sky 600) | `#0284C7` |

**These are locked and consistent across all screens. No change.**

### 4.2 NEW: Fee Payment Status Colors

Add to `tokens.dart` for fees dashboard:

```dart
abstract final class AppFeeColors {
  static const invoiceDue = Color(0xFFD97706);      // Amber: waiting to pay
  static const invoicePaid = Color(0xFF059669);     // Green: settled
  static const invoiceOverdue = Color(0xFFDC2626); // Red: past due date
  static const paymentPending = Color(0xFF0284C7); // Blue: processing
  static const requestApproved = Color(0xFF059669); // Green: concession OK
  static const requestRejected = Color(0xFFDC2626); // Red: denied
  static const requestPending = Color(0xFFD97706);  // Amber: awaiting decision
}
```

**Usage in FeeStudentScreen & FeeRequestsScreen:**

```dart
Color feeStatusColor(InvoiceStatus status) {
  switch (status) {
    case InvoiceStatus.due:
      return AppFeeColors.invoiceDue;
    case InvoiceStatus.paid:
      return AppFeeColors.invoicePaid;
    case InvoiceStatus.overdue:
      return AppFeeColors.invoiceOverdue;
  }
}

// In UI (status badge):
AppStatusChip(
  label: 'Overdue',
  color: feeStatusColor(invoice.status),
  icon: Icons.schedule, // Icon + color, never color alone
)
```

---

## 5. Chart Type Recommendations

### 5.1 Attendance Dashboard (MyAttendanceScreen)

**Current:** Likely a simple percentage ring or bar.  
**Recommended enhancements:**

| Use Case | Chart Type | Why | Library |
|----------|-----------|-----|---------|
| % Present by course | **Horizontal Bar** | Compares multiple courses side-by-side | Syncfusion or native Canvas |
| Trend over term | **Line Chart** | Shows if attendance is rising/falling | Syncfusion or `charts` package |
| Status breakdown | **Donut Chart** | Shows Present/Absent/Late/Excused as proportions (max 4) | Syncfusion (max 5 slices recommended) |

**Accessibility:** Always pair charts with:
- Legend showing all colors + patterns
- Tooltip on tap showing exact values
- Fallback data table for screen readers

### 5.2 Fees Dashboard (FeeStudentScreen & Reports)

| Use Case | Chart Type | Why | Library |
|----------|-----------|-----|---------|
| Outstanding by instalment | **Stacked Bar** | Shows how much is due per payment period | Syncfusion |
| Collection trend (daily) | **Line Chart** | Accountant tracks total paid over time (FEE-8) | Syncfusion |
| Fee structure breakdown | **Horizontal Bar** (stacked) | Shows heads (tuition, hostel, etc.) within each instalment | Syncfusion |
| Concessions granted | **Pie Chart** (≤5 types) | Part-to-whole, e.g., academic / financial / merit concessions | Syncfusion |

**Accessible Defaults:**
- Use distinct line styles (solid/dashed) + colors, never color alone
- Provide data table export (CSV for Accountant role)
- Keyboard zoom: `+/-` buttons to zoom range

---

## 6. Implementation Roadmap

### Phase 1 (Now)
- [ ] Add `AppDataColors` and `AppFeeColors` to `tokens.dart`
- [ ] Document in this file (done)
- [ ] No code changes yet (wait for feature request)

### Phase 2 (When FEE-6 Fees Starts)
- [ ] Use `AppFeeColors` in fee screens
- [ ] Add monospace font + `FontFeature.tabularFigures()` to receipt/payment tables
- [ ] Integrate charts library (Syncfusion or `charts` package)

### Phase 3 (AD-67 Dark Mode Unwire)
- [ ] Add dark surface tokens (§2.2)
- [ ] Wire dark theme in `app.dart`
- [ ] Test contrast independently (light ≠ inverted dark)

### Phase 4 (FEE-8 Reports)
- [ ] Add CSV export for Accountant
- [ ] Implement collection trend charts

---

## 7. Quick Reference: Token Usage

### Use these in your code:

**For attendance:**
```dart
AppColors.success  // Present
AppColors.error    // Absent
AppColors.warning  // Late
AppColors.info     // Excused
```

**For fees (when ready):**
```dart
AppFeeColors.invoiceDue       // Awaiting payment
AppFeeColors.invoiceOverdue   // Past due
AppFeeColors.invoicePaid      // Settled
```

**For data viz (sequential):**
```dart
AppDataColors.chartSequential // [light, medium, full]
```

**For data viz (diverging):**
```dart
AppDataColors.divergingPositive  // Good: paid, present
AppDataColors.divergingNeutral   // Neutral
AppDataColors.divergingNegative  // Bad: overdue, absent
```

---

## 8. Files to Update

| File | When | What |
|------|------|------|
| `lib/core/design/tokens.dart` | Now | Add `AppDataColors`, `AppFeeColors`, `AppColorsDark` (§1, §2, §4) |
| `lib/core/design/theme.dart` | Phase 3 | Wire dark theme, use `AppColorsDark` |
| `pubspec.yaml` | Phase 2 | Add JetBrains Mono font (optional) |
| `lib/features/fees/` | Phase 2 | Use `AppFeeColors` in screens |
| `lib/features/student/` | Phase 2 | Use charts + `AppDataColors` if attendance gets enhancement |
| `docs/DESIGN_ENHANCEMENTS.md` | After each phase | Update status |

---

## 9. Verification Checklist (Pre-Delivery)

### Colors
- [ ] All semantic colors meet 4.5:1 contrast (WCAG AA) in both light mode
- [ ] Dark mode tested independently (not inverted)
- [ ] Status colors paired with icons/text, never color alone
- [ ] Fees module status badges use `AppFeeColors` consistently

### Typography
- [ ] Receipt/payment tables use monospace + tabular figures (if added)
- [ ] All headings, body, labels use `AppSpacing` for line-height
- [ ] No hardcoded font sizes (use tokens only)

### Charts
- [ ] Legends visible, colors + patterns (not color alone)
- [ ] Data table fallback for screen readers
- [ ] Tooltips show exact values on tap (mobile)
- [ ] Reduced motion respected (no unnecessary animations)

### Dark Mode (when unwired)
- [ ] Text contrast ≥4.5:1 on dark surfaces
- [ ] Cards/panels visually separated (not lost in darkness)
- [ ] Status colors re-verified for dark (Amber looks different on black)
- [ ] Tested on actual device in dark environment

---

## 10. Questions for Owner

Before implementing phases 2–4, confirm:

1. **Fees Charts:** Does the Accountant prefer Syncfusion (polished, paid) or open-source `charts` package (lighter)?
2. **Monospace Font:** Include JetBrains Mono for financial tables, or keep Inter-only?
3. **Dark Mode Timing:** Wire AD-67 now, or wait until Xcode is available for iOS validation?
4. **Chart Interactivity:** Zoom/drill-down needed for FEE-8 reports, or simple view-only charts?

---

**Next Steps:**
1. Review this document with the team
2. Add tokens to `tokens.dart` (Phase 1)
3. Open Phase 2 slice when FEE-6 (student fees) starts
4. Update this doc as decisions are made
