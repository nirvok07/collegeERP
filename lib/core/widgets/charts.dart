import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../design/tokens.dart';

/// Charts drawn natively, without a charting package: the app needs a ring and
/// a bar row, and both are a few lines of painting. Every chart states its
/// numbers to a screen reader, because a chart is never colour alone.

class RingSegment {
  const RingSegment({required this.value, required this.color});

  final num value;
  final Color color;
}

/// Proportional segments around a ring, with content in its centre.
class RingChart extends StatelessWidget {
  const RingChart({
    super.key,
    required this.segments,
    required this.semanticLabel,
    this.size = 112,
    this.thickness = 12,
    this.center,
  });

  final List<RingSegment> segments;
  final String semanticLabel;
  final double size;
  final double thickness;
  final Widget? center;

  @override
  Widget build(BuildContext context) {
    final track = Theme.of(context).colorScheme.surfaceContainerHigh;
    return Semantics(
      label: semanticLabel,
      child: ExcludeSemantics(
        child: SizedBox.square(
          dimension: size,
          child: TweenAnimationBuilder<double>(
            // The sweep explains that the ring is a share of a whole; under
            // reduced motion the ring is simply drawn complete.
            tween: Tween(begin: AppMotion.reduced(context) ? 1 : 0, end: 1),
            duration: AppMotion.scaled(context, AppMotion.page * 2),
            curve: AppMotion.easeOut,
            builder: (context, progress, child) => CustomPaint(
              painter: _RingPainter(
                segments: segments,
                track: track,
                thickness: thickness,
                progress: progress,
              ),
              child: child,
            ),
            child: Center(child: center),
          ),
        ),
      ),
    );
  }
}

class _RingPainter extends CustomPainter {
  _RingPainter({
    required this.segments,
    required this.track,
    required this.thickness,
    required this.progress,
  });

  final List<RingSegment> segments;
  final Color track;
  final double thickness;
  final double progress;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Rect.fromLTWH(
      thickness / 2,
      thickness / 2,
      size.width - thickness,
      size.height - thickness,
    );
    final stroke = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = thickness;
    canvas.drawArc(rect, 0, math.pi * 2, false, stroke..color = track);

    final total = segments.fold<num>(0, (sum, s) => sum + s.value);
    if (total <= 0) return;
    final drawn = segments.where((s) => s.value > 0).toList();
    // Round ends only when one segment stands alone; between segments they
    // would overlap and misstate the shares.
    stroke.strokeCap = drawn.length == 1 ? StrokeCap.round : StrokeCap.butt;

    var start = -math.pi / 2;
    for (final segment in drawn) {
      final sweep = math.pi * 2 * progress * (segment.value / total);
      canvas.drawArc(rect, start, sweep, false, stroke..color = segment.color);
      start += sweep;
    }
  }

  @override
  bool shouldRepaint(_RingPainter old) =>
      old.progress != progress ||
      old.track != track ||
      old.thickness != thickness ||
      old.segments != segments;
}

class BarDatum {
  const BarDatum({required this.label, required this.value, this.highlight = false});

  final String label;
  final int value;
  final bool highlight;
}

/// A row of vertical bars sharing one scale, with a label under each.
class BarChart extends StatelessWidget {
  const BarChart({super.key, required this.bars, required this.semanticLabel, this.height = 132});

  final List<BarDatum> bars;
  final String semanticLabel;
  final double height;

  static const _labelSpace = 40.0;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final peak = bars.fold<int>(0, (m, b) => math.max(m, b.value));
    final plot = height - _labelSpace;

    return Semantics(
      label: semanticLabel,
      child: ExcludeSemantics(
        child: SizedBox(
          height: height,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              for (final bar in bars)
                Expanded(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      Text(
                        bar.value == 0 ? '' : '${bar.value}',
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: bar.highlight ? scheme.primary : scheme.onSurfaceVariant,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: AppSpacing.xs),
                      TweenAnimationBuilder<double>(
                        tween: Tween(begin: AppMotion.reduced(context) ? 1 : 0, end: 1),
                        duration: AppMotion.scaled(context, AppMotion.page * 2),
                        curve: AppMotion.easeOut,
                        builder: (context, grow, _) => Container(
                          width: 18,
                          // An empty day keeps a stub, so the scale reads as days
                          // with nothing rather than days missing from the chart.
                          height: bar.value == 0 || peak == 0
                              ? 4
                              : math.max(4, (plot - 20) * grow * bar.value / peak),
                          decoration: BoxDecoration(
                            color: bar.value == 0
                                ? scheme.surfaceContainerHigh
                                : bar.highlight
                                ? scheme.primary
                                : scheme.primary.withValues(alpha: 0.28),
                            borderRadius: BorderRadius.circular(6),
                          ),
                        ),
                      ),
                      const SizedBox(height: AppSpacing.sm),
                      Text(
                        bar.label,
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: bar.highlight ? scheme.onSurface : scheme.onSurfaceVariant,
                          fontWeight: bar.highlight ? FontWeight.w700 : FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
