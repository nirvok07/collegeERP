# Usage Reference — New Design Components

Quick reference for using AppCard, AppCardGroup, and AppRowCard in screens.

## Import

```dart
import 'package:college_erp/core/design/tokens.dart';
import 'package:college_erp/core/widgets/app_card.dart';
import 'package:college_erp/core/widgets/app_card_group.dart';
import 'package:college_erp/core/widgets/app_row_card.dart';
```

## Basic Card

```dart
AppCard(
  onTap: () => print('Tapped'),
  child: Text('Content inside card'),
)
```

- Radius: 16 (AppGeometry.cardRadius)
- Padding: 16 horizontal, optional custom via `padding:` parameter
- Ground: put cards on `AppColors.panel` (neutral-50); on a white page they vanish
- Shadow: soft, 6%
- No visible border (tone + gap separate cards)

## Row Card (Label + Value)

```dart
AppRowCard(
  title: 'Invoice',
  subtitle: 'Due 30 Sep',
  value: '₹500',
  trailing: Icon(Icons.arrow_forward_rounded, size: 18),
  onTap: () => navigateToInvoice(),
)
```

- Minimum height: 56dp
- Title (+ optional subtitle) on left, value right-aligned; grows with a subtitle, never clipped
- Leading: optional 32–36dp widget (avatar, icon)
- Trailing: optional chevron, chip, or link
- Touch target: full height, no sub-regions

## List rows on a screen: AppListTile

A drop-in for `ListTile` (same params) that renders the row as one card, with
the page margin at the sides and 12dp between rows. Use it for rows directly on
a screen; keep a plain `ListTile` inside dialogs and sheets. A list that
already pads itself passes `margin: EdgeInsets.symmetric(vertical: 6)`.

A dense roster (attendance, marks: dozens of rows, a control on each) is the
one exception to "one row, one card": it is a single `AppCard(padding: zero)`
around a divided list, so a full class scans fast.

## Card Group (Spaced Rows)

Group multiple cards with automatic 12dp spacing:

```dart
AppCardGroup(
  children: [
    AppRowCard(title: 'Date', value: '21/09/2026'),
    AppRowCard(title: 'Amount', value: '₹400'),
    AppRowCard(title: 'Status', value: 'Paid'),
  ],
)
```

Add 20dp gap between groups manually:

```dart
Column(
  children: [
    AppCardGroup(children: [...]),
    const SizedBox(height: AppGeometry.gapGroup),
    AppCardGroup(children: [...]),
  ],
)
```

## With a title

```dart
AppCardGroup(
  title: 'Invoice details',
  children: [
    AppRowCard(title: 'Total', value: '₹500'),
    AppRowCard(title: 'Paid', value: '₹300'),
  ],
)
```

## Custom Card Content

For layouts beyond single rows:

```dart
AppCard(
  padding: const EdgeInsets.all(AppGeometry.cardPadX),
  child: Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text('Title', style: theme.textTheme.titleMedium),
      const SizedBox(height: AppGeometry.gapIntra),
      Text('Subtitle', style: theme.textTheme.bodySmall),
    ],
  ),
)
```

**Rules:**
- Use `AppGeometry.cardPadX` (16) and `AppGeometry.cardPadY` (14) for padding
- Use `AppGeometry.gapIntra` (12) between lines inside a card
- Use `AppGeometry.gapGroup` (20) between separate card groups

## Loading / Empty / Error States

Wrap the child in conditional content:

```dart
AppCard(
  child: isLoading
    ? ShimmerBox(height: 24)
    : isEmpty
      ? Text('No data', style: theme.textTheme.bodyMedium)
      : hasError
        ? _ErrorRow(message: error.message)
        : actualContent(),
)
```

## Token Reference

| Token | Value | Use |
|---|---|---|
| `AppGeometry.pageMargin` | 16 | Screen horizontal padding |
| `AppGeometry.gapTight` | 8 | Label ↔ value inside row |
| `AppGeometry.gapIntra` | 12 | Between cards in same group |
| `AppGeometry.gapGroup` | 20 | Between separate card groups |
| `AppGeometry.gapSection` | 24 | Between section and next group |
| `AppGeometry.cardRadius` | 16 | Card corner radius |
| `AppGeometry.cardPadX` | 16 | Horizontal padding inside card |
| `AppGeometry.cardPadY` | 14 | Vertical padding in single-row card |
| `AppGeometry.rowMinHeight` | 56 | Single-row card minimum height |
| `AppGeometry.controlSize` | 48 | Icon button, close, secondary actions |
| `AppGeometry.fabSize` | 64 | Primary action (FAB) |

## Do's and Don'ts

**DO:**
- Use `AppCardGroup` for all card grouping (gaps never hand-written)
- Use `AppGeometry.gapIntra` for spacing inside complex cards
- Use `AppGeometry.gapGroup` between separate groups
- Place exactly one primary action (filled, 64dp) per screen

**DON'T:**
- Write literal `SizedBox(height: 12)` instead of `AppGeometry.gapIntra`
- Use `_Panel`, `Container` with `BoxDecoration`, or custom cards
- Create multiple filled actions on one screen
- Nest `AppCard` inside `AppCard` (compose differently instead)

## Example: Invoice Screen

```dart
class InvoiceScreen extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(AppGeometry.pageMargin),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Party information
            AppCardGroup(
              title: 'Party',
              children: [
                AppRowCard(
                  title: 'Name',
                  value: 'ABC Industries',
                  trailing: Icon(Icons.edit_rounded, size: 18),
                ),
              ],
            ),
            const SizedBox(height: AppGeometry.gapGroup),

            // Line items
            AppCardGroup(
              title: 'Items',
              children: [
                for (final item in invoice.items)
                  AppRowCard(
                    title: item.description,
                    value: '₹${item.amount}',
                  ),
              ],
            ),
            const SizedBox(height: AppGeometry.gapGroup),

            // Summary
            AppCardGroup(
              children: [
                AppRowCard(title: 'Subtotal', value: '₹${invoice.subtotal}'),
                AppRowCard(title: 'Tax', value: '₹${invoice.tax}'),
                AppRowCard(
                  title: 'Total',
                  value: '₹${invoice.total}',
                  // Emphasis line gets semantic colour
                  color: Colors.red.withValues(alpha: 0.05),
                ),
              ],
            ),
            const SizedBox(height: AppGeometry.gapSection),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => printInvoice(),
        icon: Icon(Icons.print_rounded),
        label: Text('Print'),
      ),
    );
  }
}
```

## Forms and creation flows: AppSheet

```dart
final saved = await showAppSheet<bool>(context, builder: (_) => AppSheet(
  title: 'Add a department',
  chip: 'New',                       // optional, top right
  onClose: () => Navigator.of(context).pop(false),
  footer: FilledButton(onPressed: save, child: const Text('Add department')),
  child: Column(children: [...fields...]),
));
```

A phone gets a bottom sheet (24 top radius, close top-left, the body scrolls, one
filled action at the foot); 600dp and wider gets a centred 480dp dialog. Prefer
`showSubmitDialog` for a plain form: it already uses this shell and owns the
busy state and the server's refusal. Yes/no confirmations stay `AlertDialog`.
