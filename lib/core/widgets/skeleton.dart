import 'package:flutter/material.dart';

import '../design/tokens.dart';

/// Skeletons carry the shape of the real screen, so nothing jumps when the
/// data lands (design system §7.6: "Skeleton matching the final layout").
///
/// A screen composes its skeleton from these pieces with the same paddings,
/// sizes and order as its real content. One animation under a [SkeletonScope]
/// drives every block, so a screen's placeholders shimmer together rather than
/// each on its own beat.
class SkeletonScope extends StatefulWidget {
  const SkeletonScope({super.key, required this.child});

  final Widget child;

  @override
  State<SkeletonScope> createState() => _SkeletonScopeState();
}

class _SkeletonScopeState extends State<SkeletonScope> with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1200),
  )..repeat();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => _SkeletonClock(
    animation: _controller,
    // One announcement for the whole placeholder, not one per block.
    child: Semantics(
      label: 'Loading',
      container: true,
      child: ExcludeSemantics(child: widget.child),
    ),
  );
}

class _SkeletonClock extends InheritedWidget {
  const _SkeletonClock({required this.animation, required super.child});

  final Animation<double> animation;

  static Animation<double>? of(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<_SkeletonClock>()?.animation;

  @override
  bool updateShouldNotify(_SkeletonClock oldWidget) => oldWidget.animation != animation;
}

/// Where a block sits, which decides its colour: grey on the page, darker on a
/// tinted band, a light veil on the navy dashboard header.
enum SkeletonTone { page, tint, navy }

/// One placeholder block.
class SkeletonBox extends StatelessWidget {
  const SkeletonBox({
    super.key,
    this.width,
    this.height = 12,
    this.radius = 4,
    this.tone = SkeletonTone.page,
  });

  final double? width;
  final double height;
  final double radius;
  final SkeletonTone tone;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final (base, highlight) = switch (tone) {
      SkeletonTone.page => (scheme.surfaceContainerHighest, scheme.surfaceContainerHighest.withValues(alpha: 0.4)),
      SkeletonTone.tint => (scheme.outlineVariant, scheme.outlineVariant.withValues(alpha: 0.4)),
      SkeletonTone.navy => (Colors.white.withValues(alpha: 0.14), Colors.white.withValues(alpha: 0.05)),
    };
    final animation = _SkeletonClock.of(context);

    Widget block(double t) => Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(radius),
        gradient: LinearGradient(
          begin: Alignment(-1 + t * 2, 0),
          end: Alignment(1 + t * 2, 0),
          colors: [base, highlight, base],
        ),
      ),
    );

    // A frozen placeholder reads as a hung screen, so the shimmer keeps moving
    // even under reduced motion; only its travel conveys "loading".
    if (animation == null) return block(0);
    return AnimatedBuilder(animation: animation, builder: (context, _) => block(animation.value));
  }
}

/// A line of text: a share of the available width, left-aligned.
class SkeletonLine extends StatelessWidget {
  const SkeletonLine({super.key, this.widthFactor = 0.6, this.height = 12, this.tone = SkeletonTone.page});

  final double widthFactor;
  final double height;
  final SkeletonTone tone;

  @override
  Widget build(BuildContext context) => FractionallySizedBox(
    alignment: Alignment.centerLeft,
    widthFactor: widthFactor,
    child: SkeletonBox(height: height, tone: tone),
  );
}

/// What a row starts with, as the real rows do.
enum SkeletonLeading { none, avatar, icon, time, logo }

/// What a row ends with, as the real rows do.
enum SkeletonTrailing { none, chip, text, icon }

/// The controls a list screen shows above its rows.
enum SkeletonFilter { search, dropdown, chips, segmented }

/// Title widths vary row to row, as real names do, but never randomly: the same
/// skeleton is drawn the same way every time.
const _titleWidths = [0.62, 0.46, 0.7, 0.54, 0.66, 0.5, 0.58];

/// One `ListTile`-shaped row: the same insets, the same 16 between leading and
/// text, a 14 title and an 11 subtitle.
class SkeletonTile extends StatelessWidget {
  const SkeletonTile({
    super.key,
    this.index = 0,
    this.leading = SkeletonLeading.none,
    this.trailing = SkeletonTrailing.none,
    this.subtitle = true,
    this.padding = const EdgeInsets.symmetric(horizontal: AppSpacing.base, vertical: AppSpacing.md),
  });

  final int index;
  final SkeletonLeading leading;
  final SkeletonTrailing trailing;
  final bool subtitle;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    final title = _titleWidths[index % _titleWidths.length];
    return Padding(
      padding: padding,
      child: Row(
        children: [
          if (leading != SkeletonLeading.none) ...[
            switch (leading) {
              SkeletonLeading.avatar => const SkeletonBox(width: 40, height: 40, radius: AppRadius.pill),
              SkeletonLeading.icon => const SkeletonBox(width: 24, height: 24, radius: 6),
              SkeletonLeading.time => const SkeletonBox(width: 44, height: 14),
              SkeletonLeading.logo => const SkeletonBox(width: 40, height: 40, radius: AppRadius.input),
              SkeletonLeading.none => const SizedBox.shrink(),
            },
            const SizedBox(width: AppSpacing.base),
          ],
          Expanded(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SkeletonLine(widthFactor: title, height: 14),
                if (subtitle) ...[
                  const SizedBox(height: 6),
                  SkeletonLine(widthFactor: title * 0.75, height: 11),
                ],
              ],
            ),
          ),
          if (trailing != SkeletonTrailing.none) ...[
            const SizedBox(width: AppSpacing.md),
            switch (trailing) {
              SkeletonTrailing.chip => const SkeletonBox(width: 64, height: 24, radius: AppRadius.pill),
              SkeletonTrailing.text => const SkeletonBox(width: 48, height: 12),
              SkeletonTrailing.icon => const SkeletonBox(width: 24, height: 24, radius: 6),
              SkeletonTrailing.none => const SizedBox.shrink(),
            },
          ],
        ],
      ),
    );
  }
}

/// A detail screen's top: the title with its status, one line of facts, and
/// the divider the real screens draw under it.
class SkeletonDetailHeader extends StatelessWidget {
  const SkeletonDetailHeader({super.key, this.status = true});

  final bool status;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(AppSpacing.base, AppSpacing.base, AppSpacing.base, 0),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Expanded(child: SkeletonLine(widthFactor: 0.6, height: 18)),
            if (status) const SkeletonBox(width: 64, height: 24, radius: AppRadius.pill),
          ],
        ),
        const SizedBox(height: AppSpacing.sm),
        const SkeletonLine(widthFactor: 0.45, height: 11),
        const Divider(height: AppSpacing.xl),
      ],
    ),
  );
}

/// A list screen: optional tab strip, filters above, then rows.
class SkeletonList extends StatelessWidget {
  const SkeletonList({
    super.key,
    this.rows = 6,
    this.leading = SkeletonLeading.none,
    this.trailing = SkeletonTrailing.none,
    this.subtitle = true,
    this.dividers = false,
    this.dividerIndent = 0,
    this.filters = const [],
    this.tabs = 0,
    this.detailHeader = false,
    this.groupEvery = 0,
    this.countLabel = false,
  });

  final int rows;
  final SkeletonLeading leading;
  final SkeletonTrailing trailing;
  final bool subtitle;
  final bool dividers;
  final double dividerIndent;
  final List<SkeletonFilter> filters;

  /// Tabs the real screen shows once loaded, drawn here so the bar does not
  /// appear from nowhere.
  final int tabs;
  final bool detailHeader;

  /// A group label (a department, a campus) before every this-many rows.
  final int groupEvery;

  /// A "12 students" line above the rows.
  final bool countLabel;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return SkeletonScope(
      child: ColoredBox(
        color: scheme.surface,
        child: Column(
          children: [
            if (tabs > 0) _TabStrip(tabs: tabs),
            Expanded(
              child: ListView(
                physics: const NeverScrollableScrollPhysics(),
                padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                children: [
                  if (detailHeader) const SkeletonDetailHeader(),
                  for (final filter in filters) _Filter(filter),
                  if (countLabel)
                    const Padding(
                      padding: EdgeInsets.fromLTRB(AppSpacing.base, AppSpacing.md, AppSpacing.base, AppSpacing.xs),
                      child: SkeletonLine(widthFactor: 0.3),
                    ),
                  for (var i = 0; i < rows; i++) ...[
                    if (groupEvery > 0 && i % groupEvery == 0)
                      const Padding(
                        padding: EdgeInsets.fromLTRB(AppSpacing.base, AppSpacing.base, AppSpacing.base, AppSpacing.xs),
                        child: SkeletonLine(widthFactor: 0.32, height: 12),
                      ),
                    SkeletonTile(index: i, leading: leading, trailing: trailing, subtitle: subtitle),
                    if (dividers && i < rows - 1) Divider(height: 1, indent: dividerIndent),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TabStrip extends StatelessWidget {
  const _TabStrip({required this.tabs});

  final int tabs;

  @override
  Widget build(BuildContext context) => Container(
    height: kTextTabBarHeight,
    decoration: BoxDecoration(
      border: Border(bottom: BorderSide(color: Theme.of(context).colorScheme.outlineVariant)),
    ),
    child: Row(
      children: [
        for (var i = 0; i < tabs; i++)
          const Expanded(child: Center(child: SkeletonBox(width: 72, height: 14))),
      ],
    ),
  );
}

class _Filter extends StatelessWidget {
  const _Filter(this.kind);

  final SkeletonFilter kind;

  @override
  Widget build(BuildContext context) => switch (kind) {
    SkeletonFilter.search => const Padding(
      padding: EdgeInsets.fromLTRB(AppSpacing.base, AppSpacing.base, AppSpacing.base, 0),
      child: SkeletonBox(height: 48, radius: AppRadius.input),
    ),
    SkeletonFilter.dropdown => const Padding(
      padding: EdgeInsets.symmetric(horizontal: AppSpacing.base, vertical: AppSpacing.sm),
      child: SkeletonBox(height: 56, radius: AppRadius.input),
    ),
    SkeletonFilter.chips => const Padding(
      padding: EdgeInsets.symmetric(horizontal: AppSpacing.base, vertical: AppSpacing.sm),
      child: Wrap(
        spacing: AppSpacing.xs,
        runSpacing: AppSpacing.xs,
        children: [
          SkeletonBox(width: 72, height: 32, radius: AppRadius.input),
          SkeletonBox(width: 84, height: 32, radius: AppRadius.input),
          SkeletonBox(width: 64, height: 32, radius: AppRadius.input),
          SkeletonBox(width: 48, height: 32, radius: AppRadius.input),
        ],
      ),
    ),
    SkeletonFilter.segmented => const Padding(
      padding: EdgeInsets.symmetric(horizontal: AppSpacing.base, vertical: AppSpacing.sm),
      child: SkeletonBox(height: 40, radius: AppRadius.pill),
    ),
  };
}

/// Cards with a tinted heading and rows under it: a teacher's days, a
/// teacher's cohorts.
class SkeletonGroups extends StatelessWidget {
  const SkeletonGroups({
    super.key,
    this.groups = 3,
    this.rowsPerGroup = 2,
    this.leading = SkeletonLeading.none,
    this.trailing = SkeletonTrailing.chip,
  });

  final int groups;
  final int rowsPerGroup;
  final SkeletonLeading leading;
  final SkeletonTrailing trailing;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return SkeletonScope(
      child: ColoredBox(
        color: scheme.surface,
        child: ListView(
          physics: const NeverScrollableScrollPhysics(),
          padding: const EdgeInsets.only(bottom: AppSpacing.xxl),
          children: [
            for (var g = 0; g < groups; g++)
              Card(
                margin: const EdgeInsets.symmetric(horizontal: AppSpacing.base, vertical: AppSpacing.sm),
                clipBehavior: Clip.antiAlias,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Container(
                      color: scheme.surfaceContainerHighest,
                      padding: const EdgeInsets.all(AppSpacing.base),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          SkeletonLine(widthFactor: _titleWidths[g % _titleWidths.length] * 0.6, height: 16, tone: SkeletonTone.tint),
                          const SizedBox(height: AppSpacing.sm),
                          const SkeletonLine(widthFactor: 0.35, height: 11, tone: SkeletonTone.tint),
                        ],
                      ),
                    ),
                    for (var r = 0; r < rowsPerGroup; r++)
                      SkeletonTile(index: g * rowsPerGroup + r, leading: leading, trailing: trailing),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// A register or mark sheet: the tinted summary band, the bulk actions, and a
/// row per student with its tap targets at their real size.
class SkeletonRegister extends StatelessWidget {
  const SkeletonRegister({
    super.key,
    this.rows = 8,
    this.marks = 4,
    this.scoreField = false,
    this.bulkActions = true,
    this.summaryLine = true,
  });

  final int rows;

  /// Round 40-pt mark buttons at the end of each row.
  final int marks;

  /// A 76-wide score field before the buttons, as on a mark sheet.
  final bool scoreField;
  final bool bulkActions;
  final bool summaryLine;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return SkeletonScope(
      child: ColoredBox(
        color: scheme.surface,
        child: Column(
          children: [
            Container(
              width: double.infinity,
              color: scheme.surfaceContainerHighest,
              padding: const EdgeInsets.all(AppSpacing.base),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const SkeletonLine(widthFactor: 0.6, height: 16, tone: SkeletonTone.tint),
                  const SizedBox(height: AppSpacing.sm),
                  const SkeletonLine(widthFactor: 0.5, height: 11, tone: SkeletonTone.tint),
                  if (summaryLine) ...[
                    const SizedBox(height: AppSpacing.md),
                    const SkeletonLine(widthFactor: 0.45, height: 13, tone: SkeletonTone.tint),
                  ],
                ],
              ),
            ),
            if (bulkActions)
              const Padding(
                padding: EdgeInsets.fromLTRB(AppSpacing.base, AppSpacing.sm, AppSpacing.base, AppSpacing.sm),
                child: Row(
                  children: [
                    Expanded(child: SkeletonBox(height: 40, radius: AppRadius.pill)),
                    SizedBox(width: AppSpacing.sm),
                    SkeletonBox(width: 104, height: 40, radius: AppRadius.pill),
                  ],
                ),
              ),
            Expanded(
              child: ListView.separated(
                physics: const NeverScrollableScrollPhysics(),
                itemCount: rows,
                separatorBuilder: (_, _) => const Divider(height: 1),
                itemBuilder: (context, i) => Padding(
                  padding: const EdgeInsets.symmetric(horizontal: AppSpacing.base, vertical: AppSpacing.sm),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            SkeletonLine(widthFactor: _titleWidths[i % _titleWidths.length], height: 14),
                            const SizedBox(height: 6),
                            const SkeletonLine(widthFactor: 0.4, height: 11),
                          ],
                        ),
                      ),
                      const SizedBox(width: AppSpacing.sm),
                      if (scoreField) const SkeletonBox(width: 76, height: 40, radius: AppRadius.input),
                      for (var m = 0; m < marks; m++)
                        const Padding(
                          padding: EdgeInsets.only(left: AppSpacing.xs),
                          child: SkeletonBox(width: 40, height: 40, radius: AppRadius.pill),
                        ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// A form waiting on its choices (departments, programs): the fields at their
/// real height, then the button.
class SkeletonForm extends StatelessWidget {
  const SkeletonForm({super.key, this.fields = 4, this.switchRow = false, this.intro = true});

  final int fields;
  final bool switchRow;
  final bool intro;

  @override
  Widget build(BuildContext context) => SkeletonScope(
    child: ColoredBox(
      color: Theme.of(context).colorScheme.surface,
      child: ListView(
        physics: const NeverScrollableScrollPhysics(),
        padding: const EdgeInsets.all(AppSpacing.base),
        children: [
          if (intro) ...[
            const SkeletonLine(widthFactor: 0.8, height: 12),
            const SizedBox(height: AppSpacing.xs),
            const SkeletonLine(widthFactor: 0.55, height: 12),
            const SizedBox(height: AppSpacing.lg),
          ],
          for (var i = 0; i < fields; i++) ...[
            const SkeletonBox(height: 56, radius: AppRadius.input),
            const SizedBox(height: AppSpacing.base),
          ],
          if (switchRow) ...[
            const Row(
              children: [
                Expanded(child: SkeletonLine(widthFactor: 0.6, height: 14)),
                SkeletonBox(width: 52, height: 32, radius: AppRadius.pill),
              ],
            ),
            const SizedBox(height: AppSpacing.base),
          ],
          const SizedBox(height: AppSpacing.sm),
          const SkeletonBox(height: 48, radius: AppRadius.pill),
        ],
      ),
    ),
  );
}
