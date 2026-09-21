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
- Shadow: 4% black hairline
- No visible border (tone + gap separate cards)

## Row Card (Label + Value)

```dart
AppRowCard(
  label: 'Invoice',
  value: '₹500',
  trailing: Icon(Icons.arrow_forward_rounded, size: 18),
  onTap: () => navigateToInvoice(),
)
```

- Minimum height: 56dp
- Label on left (bodyLarge), value on right (bodyLarge, medium weight)
- Leading: optional 32–36dp widget (avatar, icon)
- Trailing: optional chevron, chip, or link
- Touch target: full height, no sub-regions

## Card Group (Spaced Rows)

Group multiple cards with automatic 12dp spacing:

```dart
AppCardGroup(
  children: [
    AppRowCard(label: 'Date', value: '21/09/2026'),
    AppRowCard(label: 'Amount', value: '₹400'),
    AppRowCard(label: 'Status', value: 'Paid'),
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

## With Header

```dart
AppCardGroup(
  header: Text(
    'Invoice Details',
    style: Theme.of(context).textTheme.titleMedium?.copyWith(
      fontWeight: FontWeight.w700,
    ),
  ),
  children: [
    AppRowCard(label: 'Total', value: '₹500'),
    AppRowCard(label: 'Paid', value: '₹300'),
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
              header: Text('Party', style: theme.textTheme.titleMedium),
              children: [
                AppRowCard(
                  label: 'Name',
                  value: 'ABC Industries',
                  trailing: Icon(Icons.edit_rounded, size: 18),
                ),
              ],
            ),
            const SizedBox(height: AppGeometry.gapGroup),

            // Line items
            AppCardGroup(
              header: Text('Items', style: theme.textTheme.titleMedium),
              children: [
                for (final item in invoice.items)
                  AppRowCard(
                    label: item.description,
                    value: '₹${item.amount}',
                  ),
              ],
            ),
            const SizedBox(height: AppGeometry.gapGroup),

            // Summary
            AppCardGroup(
              children: [
                AppRowCard(label: 'Subtotal', value: '₹${invoice.subtotal}'),
                AppRowCard(label: 'Tax', value: '₹${invoice.tax}'),
                AppRowCard(
                  label: 'Total',
                  value: '₹${invoice.total}',
                  // Emphasis line gets semantic colour
                  backgroundColor: Colors.red.withValues(alpha: 0.05),
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
