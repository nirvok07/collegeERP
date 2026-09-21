import 'package:flutter/material.dart';

import '../design/tokens.dart';

/// ND-S2: The single surface container for content grouping.
///
/// Radius 16, padding 16, 4% black shadow hairline. No border.
/// Separation comes from tone + gap, never from visible borders or heavy shadow.
class AppCard extends StatelessWidget {
  const AppCard({
    super.key,
    required this.child,
    this.onTap,
    this.padding = const EdgeInsets.all(AppGeometry.cardPadX),
    this.backgroundColor,
  });

  /// The content inside the card.
  final Widget child;

  /// Optional tap handler for the card.
  final VoidCallback? onTap;

  /// Card inner padding. Defaults to 16 (AppGeometry.cardPadX).
  final EdgeInsets padding;

  /// Card background colour. Defaults to Theme.surface (white in light mode).
  final Color? backgroundColor;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final color = backgroundColor ?? scheme.surface;

    return Material(
      color: color,
      borderRadius: BorderRadius.circular(AppGeometry.cardRadius),
      elevation: 0,
      shadowColor: Colors.black.withValues(alpha: 0.04),
      // The 4% shadow is a hairline, not a visible drop. It separates the card
      // from the background without competing with spacing.
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(AppGeometry.cardRadius),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.04),
              offset: const Offset(0, 1),
              blurRadius: 3,
              spreadRadius: 0,
            ),
          ],
        ),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(AppGeometry.cardRadius),
          child: Padding(
            padding: padding,
            child: child,
          ),
        ),
      ),
    );
  }
}
