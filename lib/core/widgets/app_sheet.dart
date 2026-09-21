import 'package:flutter/material.dart';

import '../design/tokens.dart';

/// Below this width a sheet rises from the bottom; above it, it is a centred
/// dialog at the same radius (ND-D7).
const _sheetBreakpoint = 600.0;

/// ND-S4: opens [builder]'s content as a bottom sheet on a phone and a centred
/// dialog on a tablet. The content is normally an [AppSheet].
Future<T?> showAppSheet<T>(
  BuildContext context, {
  required WidgetBuilder builder,
  bool dismissible = true,
}) {
  if (MediaQuery.sizeOf(context).width >= _sheetBreakpoint) {
    return showDialog<T>(
      context: context,
      barrierDismissible: dismissible,
      builder: (context) => Dialog(
        insetPadding: const EdgeInsets.all(AppSpacing.xl),
        child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 480), child: builder(context)),
      ),
    );
  }
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: false,
    isDismissible: dismissible,
    enableDrag: dismissible,
    builder: builder,
  );
}

/// ND-S4: the shell every form and creation flow sits in: a close control at
/// the top left, an optional context chip at the top right, a title, a body that
/// scrolls, and one primary action at the foot.
class AppSheet extends StatelessWidget {
  const AppSheet({
    super.key,
    required this.title,
    required this.child,
    this.chip,
    this.footer,
    this.onClose,
  });

  final String title;
  final Widget child;

  /// What this is about, in a word ("Sale", "Draft"); never the only carrier of meaning.
  final String? chip;

  /// The one primary action, normally a full-width [FilledButton].
  final Widget? footer;

  /// Defaults to closing the route; a sheet that must not be dismissed mid-save passes null-safe handling.
  final VoidCallback? onClose;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final inset = MediaQuery.viewInsetsOf(context).bottom;
    return Padding(
      padding: EdgeInsets.only(bottom: inset),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(AppSpacing.sm, AppSpacing.sm, AppGeometry.pageMargin, 0),
            child: Row(
              children: [
                SizedBox.square(
                  dimension: AppGeometry.controlSize,
                  child: IconButton.filledTonal(
                    tooltip: 'Close',
                    icon: const Icon(Icons.close_rounded),
                    onPressed: onClose ?? () => Navigator.of(context).maybePop(),
                  ),
                ),
                const Spacer(),
                if (chip != null)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.xs + 2),
                    decoration: BoxDecoration(
                      color: theme.colorScheme.surfaceContainerHigh,
                      borderRadius: BorderRadius.circular(AppRadius.pill),
                    ),
                    child: Text(
                      chip!.toUpperCase(),
                      style: theme.textTheme.labelSmall?.copyWith(
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.6,
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(AppGeometry.pageMargin, AppSpacing.sm, AppGeometry.pageMargin, AppGeometry.gapIntra),
            child: Semantics(
              header: true,
              child: Text(title, style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
            ),
          ),
          Flexible(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: AppGeometry.pageMargin),
              child: child,
            ),
          ),
          if (footer != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppGeometry.pageMargin, AppGeometry.gapIntra, AppGeometry.pageMargin, AppGeometry.pageMargin),
              child: footer,
            ),
        ],
      ),
    );
  }
}
