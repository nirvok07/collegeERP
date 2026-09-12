import 'package:flutter/material.dart';

import '../design/tokens.dart';

enum ChipTone { success, warning, error, info, neutral }

/// Status is never colour alone: every chip carries a label, and a dot for
/// readers who perceive shape faster than hue.
class StatusChip extends StatelessWidget {
  const StatusChip({super.key, required this.label, required this.tone});

  final String label;
  final ChipTone tone;

  static ChipTone toneForAccount(String? status) => switch (status) {
        'active' => ChipTone.success,
        'invited' => ChipTone.info,
        'locked' || 'suspended' => ChipTone.warning,
        _ => ChipTone.neutral,
      };

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final colour = switch (tone) {
      ChipTone.success => isDark ? AppColors.successDark : AppColors.success,
      ChipTone.warning => isDark ? AppColors.warningDark : AppColors.warning,
      ChipTone.error => isDark ? AppColors.errorDark : AppColors.error,
      ChipTone.info => isDark ? AppColors.infoDark : AppColors.info,
      ChipTone.neutral => Theme.of(context).colorScheme.onSurfaceVariant,
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm, vertical: 2),
      decoration: BoxDecoration(
        color: colour.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(AppRadius.pill),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(color: colour, shape: BoxShape.circle),
          ),
          const SizedBox(width: AppSpacing.xs),
          Text(
            label,
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: colour),
          ),
        ],
      ),
    );
  }
}
