import 'package:flutter/material.dart';

import '../design/tokens.dart';
import 'app_card.dart';

/// ND-S2: A row inside an [AppCard] or as a standalone card.
///
/// Anatomy: [leading 32?] · label (left) · value (right) · [trailing]
///
/// Minimum height 56dp (48dp touch target + padding). Label and value are
/// `bodyLarge`/`titleMedium`, with value right-aligned and trailing control last.
class AppRowCard extends StatelessWidget {
  const AppRowCard({
    super.key,
    required this.label,
    this.value,
    this.leading,
    this.trailing,
    this.onTap,
    this.backgroundColor,
  });

  /// Label text, left-aligned.
  final String label;

  /// Value text, right-aligned. Optional (e.g. empty state shows "Not set").
  final String? value;

  /// Optional leading widget (e.g. avatar, icon). Typically 32–36dp.
  final Widget? leading;

  /// Optional trailing widget (e.g. chevron, chip, link). After value.
  final Widget? trailing;

  /// Tap callback.
  final VoidCallback? onTap;

  /// Card background colour override.
  final Color? backgroundColor;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final hasValue = value != null && value!.isNotEmpty;

    return AppCard(
      onTap: onTap,
      padding: EdgeInsets.symmetric(
        horizontal: AppGeometry.cardPadX,
        vertical: AppGeometry.cardPadY,
      ),
      backgroundColor: backgroundColor,
      child: SizedBox(
        height: AppGeometry.rowMinHeight - AppGeometry.cardPadY * 2,
        child: Row(
          children: [
            if (leading != null) ...[
              leading!,
              const SizedBox(width: AppGeometry.gapTight),
            ],
            Expanded(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodyLarge?.copyWith(
                      fontWeight: FontWeight.w400,
                    ),
                  ),
                  if (hasValue)
                    Text(
                      value!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: scheme.onSurfaceVariant,
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(width: AppGeometry.gapTight),
            if (hasValue)
              Text(
                value!,
                style: theme.textTheme.bodyLarge?.copyWith(
                  fontWeight: FontWeight.w500,
                ),
              ),
            if (trailing != null) ...[
              const SizedBox(width: AppGeometry.gapTight),
              trailing!,
            ],
          ],
        ),
      ),
    );
  }
}
