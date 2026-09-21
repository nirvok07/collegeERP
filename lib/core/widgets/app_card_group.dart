import 'package:flutter/material.dart';

import '../design/tokens.dart';

/// ND-S2: a titled stack of cards. The gap rules live here so no screen
/// re-types them: [AppGeometry.gapIntra] between cards, [AppGeometry.gapTight]
/// under the title. Stack groups with [AppGeometry.gapGroup] between them.
class AppCardGroup extends StatelessWidget {
  const AppCardGroup({super.key, required this.children, this.title, this.count});

  final List<Widget> children;
  final String? title;

  /// How many cards, shown quietly beside the title.
  final int? count;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (title != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(AppSpacing.xs, 0, AppSpacing.xs, AppGeometry.gapTight),
            child: Semantics(
              header: true,
              child: Text.rich(
                TextSpan(
                  text: title!,
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: theme.colorScheme.onSurface,
                  ),
                  children: [
                    if (count != null)
                      TextSpan(
                        text: '   $count',
                        style: TextStyle(fontWeight: FontWeight.w500, color: theme.colorScheme.onSurfaceVariant),
                      ),
                  ],
                ),
              ),
            ),
          ),
        for (var i = 0; i < children.length; i++) ...[
          if (i > 0) const SizedBox(height: AppGeometry.gapIntra),
          children[i],
        ],
      ],
    );
  }
}
