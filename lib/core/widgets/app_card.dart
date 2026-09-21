import 'package:flutter/material.dart';

import '../design/tokens.dart';

/// ND-S2: the one surface a screen groups content on.
///
/// White on the neutral page ground, radius 16, no border. It separates from
/// the ground by tone and a soft shadow; gaps between cards do the rest.
class AppCard extends StatelessWidget {
  const AppCard({
    super.key,
    required this.child,
    this.onTap,
    this.padding = const EdgeInsets.symmetric(horizontal: AppGeometry.cardPadX, vertical: AppGeometry.cardPadY),
    this.color,
    this.semanticLabel,
  });

  final Widget child;

  /// A card with a tap handler is a button: ripple, focus and semantics.
  final VoidCallback? onTap;
  final EdgeInsetsGeometry padding;

  /// Defaults to the theme's surface; a tinted card passes its own.
  final Color? color;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.circular(AppGeometry.cardRadius);
    final card = DecoratedBox(
      decoration: BoxDecoration(
        color: color ?? Theme.of(context).colorScheme.surface,
        borderRadius: radius,
        boxShadow: const [BoxShadow(color: Color(0x0F0F172A), offset: Offset(0, 2), blurRadius: 10)],
      ),
      child: Material(
        type: MaterialType.transparency,
        borderRadius: radius,
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          borderRadius: radius,
          child: Padding(padding: padding, child: child),
        ),
      ),
    );
    if (semanticLabel == null) return card;
    return Semantics(label: semanticLabel, button: onTap != null, container: true, child: card);
  }
}
