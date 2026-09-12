import 'package:flutter/material.dart';

import '../design/tokens.dart';
import '../error/failure.dart';

/// The five screen states, as on web, drawn for touch.
///
/// A screen that cannot express all five is incomplete, which is why these live
/// in core rather than being rebuilt per feature.
enum LoadStatus { loading, refreshing, success, empty, failure }

class ErrorView extends StatelessWidget {
  const ErrorView({super.key, required this.failure, required this.onRetry});

  final Failure failure;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.xl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.cloud_off_rounded, size: 40, color: scheme.outline),
            const SizedBox(height: AppSpacing.base),
            Text('That did not load', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: AppSpacing.sm),
            Text(
              failure.message,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
            ),
            const SizedBox(height: AppSpacing.lg),
            OutlinedButton(onPressed: onRetry, child: const Text('Try again')),
          ],
        ),
      ),
    );
  }
}

class EmptyView extends StatelessWidget {
  const EmptyView({
    super.key,
    required this.title,
    required this.body,
    this.icon = Icons.inbox_rounded,
  });

  final String title;
  final String body;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.xl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 40, color: scheme.outline),
            const SizedBox(height: AppSpacing.base),
            Text(title, style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: AppSpacing.sm),
            Text(
              body,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
            ),
          ],
        ),
      ),
    );
  }
}

/// Skeletons carry the shape of the real row, so nothing shifts when data lands.
class SkeletonList extends StatefulWidget {
  const SkeletonList({super.key, this.rows = 6});
  final int rows;

  @override
  State<SkeletonList> createState() => _SkeletonListState();
}

class _SkeletonListState extends State<SkeletonList> with SingleTickerProviderStateMixin {
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
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return ListView.builder(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
      itemCount: widget.rows,
      itemBuilder: (context, index) => Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.base,
          vertical: AppSpacing.md,
        ),
        child: Row(
          children: [
            _Shimmer(controller: _controller, width: 40, height: 40, radius: AppRadius.pill),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _Shimmer(controller: _controller, width: 160, height: 14, radius: 4),
                  const SizedBox(height: AppSpacing.sm),
                  _Shimmer(controller: _controller, width: 100, height: 12, radius: 4),
                ],
              ),
            ),
          ],
        ),
      ),
    ).withBackground(scheme.surface);
  }
}

class _Shimmer extends StatelessWidget {
  const _Shimmer({
    required this.controller,
    required this.width,
    required this.height,
    required this.radius,
  });

  final AnimationController controller;
  final double width;
  final double height;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final base = Theme.of(context).colorScheme.surfaceContainerHighest;
    // A frozen placeholder reads as a hung screen, so the shimmer keeps moving
    // even under reduced motion; only its travel is what conveys "loading".
    return AnimatedBuilder(
      animation: controller,
      builder: (context, _) => Container(
        width: width,
        height: height,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(radius),
          gradient: LinearGradient(
            begin: Alignment(-1 + controller.value * 2, 0),
            end: Alignment(1 + controller.value * 2, 0),
            colors: [base, base.withValues(alpha: 0.4), base],
          ),
        ),
      ),
    );
  }
}

extension on Widget {
  Widget withBackground(Color color) => ColoredBox(color: color, child: this);
}
