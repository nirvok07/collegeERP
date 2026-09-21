import 'package:flutter/material.dart';

import '../design/tokens.dart';
import 'app_card.dart';

/// ND-S2: one row, one card: `[leading] title / subtitle ........ value [trailing]`.
///
/// At least 56dp high, so the whole card is a comfortable tap target. A row
/// with a [subtitle] grows to fit it; text is never clipped by a fixed height.
class AppRowCard extends StatelessWidget {
  const AppRowCard({
    super.key,
    required this.title,
    this.subtitle,
    this.value,
    this.leading,
    this.trailing,
    this.onTap,
    this.color,
  });

  final String title;
  final String? subtitle;

  /// Right-aligned, after the title block.
  final String? value;
  final Widget? leading;

  /// A chevron, chip or link; last in the row.
  final Widget? trailing;
  final VoidCallback? onTap;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.colorScheme.onSurfaceVariant;
    return AppCard(
      onTap: onTap,
      color: color,
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: AppGeometry.rowMinHeight - AppGeometry.cardPadY * 2),
        child: Row(
          children: [
            if (leading != null) ...[leading!, const SizedBox(width: AppGeometry.gapIntra)],
            Expanded(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w600),
                  ),
                  if (subtitle != null)
                    Text(
                      subtitle!,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodySmall?.copyWith(color: muted),
                    ),
                ],
              ),
            ),
            if (value != null) ...[
              const SizedBox(width: AppGeometry.gapTight),
              Text(value!, style: theme.textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w600)),
            ],
            if (trailing != null) ...[const SizedBox(width: AppGeometry.gapTight), trailing!],
          ],
        ),
      ),
    );
  }
}

/// The 36dp tinted icon square a row or tile leads with.
class AppIconBadge extends StatelessWidget {
  const AppIconBadge({super.key, required this.icon, required this.color, this.size = 40});

  final IconData icon;
  final Color color;
  final double size;

  @override
  Widget build(BuildContext context) => ExcludeSemantics(
        child: Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(AppRadius.card),
          ),
          child: Icon(icon, color: color, size: size * 0.5),
        ),
      );
}
