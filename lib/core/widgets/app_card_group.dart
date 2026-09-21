import 'package:flutter/material.dart';

import '../design/tokens.dart';

/// ND-S2: Container that applies the spacing rules to a list of child cards.
///
/// Applies `gapIntra` (12) between children, ensuring the gap never gets
/// hand-written or accidentally changed on a per-screen basis.
/// When multiple groups are stacked, manually add `gapGroup` (20) spacing between them.
class AppCardGroup extends StatelessWidget {
  const AppCardGroup({
    super.key,
    required this.children,
    this.header,
  });

  /// The cards to group.
  final List<Widget> children;

  /// Optional section label above the group.
  final Widget? header;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (header != null) ...[
          header!,
          const SizedBox(height: AppGeometry.gapIntra),
        ],
        ...children.separated(
          separator: const SizedBox(height: AppGeometry.gapIntra),
        ),
      ],
    );
  }
}

/// Extension to insert separators between list items.
extension<T> on List<T> {
  List<T> separated({required T separator}) {
    if (isEmpty) return [];
    return [
      for (int i = 0; i < length; i++) ...[
        this[i],
        if (i < length - 1) separator,
      ],
    ];
  }
}
