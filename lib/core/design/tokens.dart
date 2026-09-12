import 'package:flutter/material.dart';

/// The same design decisions as the web console, expressed natively.
///
/// Values are shared with `clients/web/src/design/tokens.css` so the two clients read as
/// one product: the same indigo, the same 4pt spacing scale, the same radii.
/// What is deliberately not shared is layout, because a phone is not a narrow
/// desktop.
abstract final class AppColors {
  static const primary = Color(0xFF4F46E5);
  static const primaryDark = Color(0xFF818CF8);
  static const onPrimary = Color(0xFFFFFFFF);
  static const onPrimaryDark = Color(0xFF1E1B4B);

  static const success = Color(0xFF059669);
  static const successDark = Color(0xFF34D399);
  static const warning = Color(0xFFD97706);
  static const warningDark = Color(0xFFFBBF24);
  static const error = Color(0xFFDC2626);
  static const errorDark = Color(0xFFF87171);
  static const info = Color(0xFF0284C7);
  static const infoDark = Color(0xFF38BDF8);
}

abstract final class AppSpacing {
  static const xs = 4.0;
  static const sm = 8.0;
  static const md = 12.0;
  static const base = 16.0;
  static const lg = 20.0;
  static const xl = 24.0;
  static const xxl = 32.0;
}

abstract final class AppRadius {
  static const input = 8.0;
  static const card = 12.0;
  static const sheet = 16.0;
  static const pill = 999.0;
}

/// Motion, matching the web bands. Curves are Flutter's equivalents of the same
/// cubic-beziers: entrances decelerate, exits accelerate away, pressed feedback
/// is near-instant.
abstract final class AppMotion {
  static const micro = Duration(milliseconds: 140);
  static const state = Duration(milliseconds: 180);
  static const panel = Duration(milliseconds: 260);
  static const page = Duration(milliseconds: 300);
  static const exit = Duration(milliseconds: 140);

  static const easeOut = Curves.easeOutCubic;
  static const easeIn = Curves.easeInCubic;
  static const easeInOut = Curves.easeInOutCubic;
  static const sharp = Curves.easeOut;

  /// Entering content rises a short distance so it reads as arriving from the
  /// flow of the screen rather than appearing from nowhere.
  static const rise = 8.0;

  /// Beyond this a staggered list stops explaining arrival order and only costs
  /// frames. Matches the cap enforced in the web client.
  static const staggerLimit = 8;
  static const staggerStep = Duration(milliseconds: 24);

  /// Honours the platform accessibility setting. Movement goes, meaning stays.
  static bool reduced(BuildContext context) =>
      MediaQuery.maybeOf(context)?.disableAnimations ?? false;

  static Duration scaled(BuildContext context, Duration duration) =>
      reduced(context) ? Duration.zero : duration;
}
