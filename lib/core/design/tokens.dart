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

  /// The light ground and its layers (AD-67): a white page, cool-grey panels
  /// and hairline borders, so sections separate by tone rather than shadow.
  static const ground = Color(0xFFFFFFFF);
  static const panel = Color(0xFFF6F7FB);
  static const panelStrong = Color(0xFFECEFF5);
  static const line = Color(0xFFE5E8EF);
  static const ink = Color(0xFF0F172A);
  static const inkMuted = Color(0xFF64748B);

  static const errorSoft = Color(0xFFFDEEEE);

  /// UX-2: the dashboard's header, after the prototype's attendance screen:
  /// a deep navy panel with a slightly raised inner card.
  static const navy = Color(0xFF1E2A3B);
  static const navyRaised = Color(0xFF2B3A4F);
}

/// Sequential and diverging palettes for charts and other data visualisations.
abstract final class AppDataColors {
  static const sequentialLight2 = Color(0xFFDEE9FE);
  static const sequentialLight5 = Color(0xFF60A5FA);
  static const sequentialLight6 = Color(0xFF3B82F6);
  static const chartSequential = <Color>[sequentialLight2, sequentialLight5, sequentialLight6];

  static const divergingPositive = Color(0xFF059669);
  static const divergingNeutral = Color(0xFFF3F4F6);
  static const divergingNegative = Color(0xFFDC2626);
  static const heatmapCold = Color(0xFF0284C7);
  static const heatmapWarm = Color(0xFFDC2626);
}

/// Semantic light-theme colours for fee status badges and reports.
abstract final class AppFeeColors {
  static const invoiceDue = Color(0xFFD97706);
  static const invoicePaid = Color(0xFF059669);
  static const invoiceOverdue = Color(0xFFDC2626);
  static const paymentPending = Color(0xFF0284C7);
  static const paymentSuccessful = Color(0xFF059669);
  static const paymentFailed = Color(0xFFDC2626);
  static const requestPending = Color(0xFFD97706);
  static const requestApproved = Color(0xFF059669);
  static const requestRejected = Color(0xFFDC2626);
  static const requestWithdrawn = Color(0xFF64748B);
  static const lateFeeApplicable = Color(0xFFD97706);
  static const lateFeePaid = Color(0xFF059669);
  static const fineIssued = Color(0xFFDC2626);
  static const fineWaived = Color(0xFF059669);
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

  /// Dashboard panels, one step rounder than a list card.
  static const panel = 18.0;
  static const pill = 999.0;
}

/// ND: New design container and ratio language.
/// Derived from `assets/new_design.jpeg` (2026-09-21). See `docs/new-design/DESIGN.md`.
/// Geometry and rhythm taken; colour and type from the approved contract in `docs/07-design-system.md`.
abstract final class AppGeometry {
  /// Page margins: card edge sits this far from screen edges.
  static const pageMargin = AppSpacing.base; // 16

  /// Tight gap: label ↔ value inside a row, chip ↔ text.
  static const gapTight = AppSpacing.sm; // 8

  /// Intra-group gap: between cards in the same logical group.
  static const gapIntra = AppSpacing.md; // 12

  /// Group gap: between separate card groups. Ratio to gapIntra is 5:3.
  static const gapGroup = AppSpacing.lg; // 20

  /// Section gap: between a card stack and the next section/heading.
  static const gapSection = AppSpacing.xl; // 24

  /// Card corner radius.
  static const cardRadius = 16.0;

  /// Bottom-sheet top corner radius. Ratio to cardRadius is 3:2.
  static const sheetRadius = 24.0;

  /// Horizontal padding inside a card.
  static const cardPadX = 16.0;

  /// Vertical padding inside a single-row card.
  static const cardPadY = 14.0;

  /// Minimum height of a single-row card (includes padding + 48dp touch target).
  static const rowMinHeight = 56.0;

  /// Icon buttons, close button, secondary circular actions.
  static const controlSize = 48.0;

  /// The one primary action per screen.
  static const fabSize = 64.0;

  /// Avatar size inside a row card.
  static const avatarSm = 32.0;
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
