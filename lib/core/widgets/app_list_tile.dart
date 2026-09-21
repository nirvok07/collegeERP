import 'package:flutter/material.dart';

import '../design/tokens.dart';
import 'app_card.dart';

/// ND-S6: a [ListTile] as one card in a list, the drop-in for a list screen's rows.
///
/// Same parameters and the same semantics as [ListTile], so a screen moves to
/// the new design by renaming the widget. The card margins give the rhythm:
/// [AppGeometry.pageMargin] at the sides and [AppGeometry.gapIntra] between
/// rows. Use it for rows directly on a screen; inside a dialog or a sheet a
/// plain [ListTile] is still right.
class AppListTile extends StatelessWidget {
  const AppListTile({
    super.key,
    this.leading,
    this.title,
    this.subtitle,
    this.trailing,
    this.onTap,
    this.onLongPress,
    this.enabled = true,
    this.selected = false,
    this.isThreeLine = false,
    this.dense,
    this.color,
    this.margin,
  });

  final Widget? leading;
  final Widget? title;
  final Widget? subtitle;
  final Widget? trailing;
  final GestureTapCallback? onTap;
  final GestureLongPressCallback? onLongPress;
  final bool enabled;
  final bool selected;
  final bool isThreeLine;
  final bool? dense;

  /// A tinted row (a warning, the current item); defaults to the surface.
  final Color? color;

  /// Defaults to the page margin at the sides; a list that already pads itself
  /// passes `EdgeInsets.symmetric(vertical: AppGeometry.gapIntra / 2)`.
  final EdgeInsetsGeometry? margin;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: margin ??
          const EdgeInsets.symmetric(horizontal: AppGeometry.pageMargin, vertical: AppGeometry.gapIntra / 2),
      child: AppCard(
        color: color,
        padding: EdgeInsets.zero,
        child: ListTile(
          leading: leading,
          title: title,
          subtitle: subtitle,
          trailing: trailing,
          onTap: onTap,
          onLongPress: onLongPress,
          enabled: enabled,
          selected: selected,
          isThreeLine: isThreeLine,
          dense: dense,
          minVerticalPadding: AppGeometry.gapIntra,
          contentPadding: const EdgeInsets.symmetric(horizontal: AppGeometry.cardPadX),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppGeometry.cardRadius)),
        ),
      ),
    );
  }
}
