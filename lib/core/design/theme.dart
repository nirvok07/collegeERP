import 'package:flutter/cupertino.dart' show CupertinoPageTransitionsBuilder;
import 'package:flutter/material.dart';

import 'tokens.dart';

/// The app ships the light theme only for now (AD-67). [dark] is kept building
/// so that turning it back on is one line in `app.dart`, not a redesign.
abstract final class AppTheme {
  /// [accent] is a college's colour (AD-70), already checked by [legibleAccent].
  static ThemeData light({Color? accent}) => _build(Brightness.light, accent: accent);
  static ThemeData dark() => _build(Brightness.dark);

  static ThemeData _build(Brightness brightness, {Color? accent}) {
    final isDark = brightness == Brightness.dark;
    final seeded = ColorScheme.fromSeed(
      seedColor: accent ?? AppColors.primary,
      brightness: brightness,
      primary: isDark ? AppColors.primaryDark : (accent ?? AppColors.primary),
      onPrimary: isDark ? AppColors.onPrimaryDark : AppColors.onPrimary,
      error: isDark ? AppColors.errorDark : AppColors.error,
    );
    // Light is a white page with neutral cool-grey layers, not the seed's
    // lavender tints: colour is kept for meaning (design system 7.1).
    final scheme = isDark
        ? seeded
        : seeded.copyWith(
            surface: AppColors.ground,
            onSurface: AppColors.ink,
            onSurfaceVariant: AppColors.inkMuted,
            outlineVariant: AppColors.line,
            surfaceContainerLowest: AppColors.ground,
            surfaceContainerLow: AppColors.panel,
            surfaceContainer: AppColors.panel,
            surfaceContainerHigh: AppColors.panelStrong,
            surfaceContainerHighest: AppColors.panelStrong,
          );

    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      // ND-D9: the light page is neutral-50 and cards are white on it; dark keeps its own surface.
      scaffoldBackgroundColor: isDark ? scheme.surface : AppColors.panel,
      cardTheme: CardThemeData(
        color: scheme.surface,
        elevation: isDark ? 0 : 1,
        shadowColor: const Color(0x330F172A),
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppGeometry.cardRadius),
          side: isDark ? BorderSide(color: scheme.outlineVariant) : BorderSide.none,
        ),
      ),
      // Motion is defined once here rather than per route, so every push in the
      // app moves identically on both platforms.
      pageTransitionsTheme: const PageTransitionsTheme(builders: {
        TargetPlatform.android: _RiseTransitionBuilder(),
        TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
      }),
      appBarTheme: AppBarTheme(
        centerTitle: false,
        scrolledUnderElevation: 0.5,
        backgroundColor: isDark ? scheme.surface : AppColors.panel,
        surfaceTintColor: Colors.transparent,
        titleTextStyle: TextStyle(
          fontSize: 20,
          fontWeight: FontWeight.w600,
          color: scheme.onSurface,
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        // On the neutral page a field is white with its border, as a card is.
        fillColor: isDark ? scheme.surfaceContainerHighest.withValues(alpha: 0.4) : scheme.surface,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadius.input),
          borderSide: BorderSide(color: scheme.outlineVariant),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadius.input),
          borderSide: BorderSide(color: scheme.outlineVariant),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadius.input),
          borderSide: BorderSide(color: scheme.primary, width: 2),
        ),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.base,
          vertical: AppSpacing.base,
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          // 48 minimum, so every control clears the touch target guidance.
          minimumSize: const Size.fromHeight(52),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadius.input),
          ),
          textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
        ),
      ),
      listTileTheme: const ListTileThemeData(
        contentPadding: EdgeInsets.symmetric(horizontal: AppSpacing.base, vertical: AppSpacing.xs),
        minVerticalPadding: AppSpacing.md,
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: scheme.surface,
        showDragHandle: true,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(AppGeometry.sheetRadius)),
        ),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: scheme.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppGeometry.sheetRadius)),
      ),
      dividerTheme: DividerThemeData(color: scheme.outlineVariant, space: 1, thickness: 1),
    );
  }
}

/// A college's colour as the app's accent, only when white text on it keeps
/// 4.5:1 contrast (WCAG AA for body text, which buttons carry); otherwise null,
/// and the product's own indigo stays. A brand never costs legibility.
Color? legibleAccent(String? hex) {
  if (hex == null || !RegExp(r'^#[0-9a-fA-F]{6}$').hasMatch(hex)) return null;
  final color = Color(0xFF000000 | int.parse(hex.substring(1), radix: 16));
  final contrastWithWhite = 1.05 / (color.computeLuminance() + 0.05);
  return contrastWithWhite >= 4.5 ? color : null;
}

/// Entering pages rise and fade, the native counterpart of the web `.m-rise`
/// preset rather than a literal copy of its CSS.
class _RiseTransitionBuilder extends PageTransitionsBuilder {
  const _RiseTransitionBuilder();

  @override
  Widget buildTransitions<T>(
    PageRoute<T> route,
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child,
  ) {
    if (AppMotion.reduced(context)) {
      return FadeTransition(opacity: animation, child: child);
    }
    final curved = CurvedAnimation(parent: animation, curve: AppMotion.easeOut);
    return FadeTransition(
      opacity: curved,
      child: SlideTransition(
        position: Tween(begin: const Offset(0, 0.02), end: Offset.zero).animate(curved),
        child: child,
      ),
    );
  }
}
