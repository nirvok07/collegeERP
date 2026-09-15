import 'package:flutter/material.dart';

import '../design/tokens.dart';

/// OD-CR-1: since a screen no longer refreshes itself in the background
/// (CR-1), it says when it last did, so staleness is visible rather than
/// silent.
String freshnessLabel(DateTime at, {DateTime Function()? now}) {
  final diff = (now ?? DateTime.now)().difference(at);
  if (diff.inSeconds < 60) return 'Updated just now';
  if (diff.inMinutes < 60) return 'Updated ${diff.inMinutes} m ago';
  if (diff.inHours < 24) return 'Updated ${diff.inHours} h ago';
  if (diff.inDays == 1) return 'Updated yesterday';
  if (diff.inDays < 7) return 'Updated ${diff.inDays} d ago';
  return 'Updated on ${at.day}/${at.month}/${at.year}';
}

/// A small "Updated 2 h ago" line. Draws nothing when [at] is null (a fresh
/// network answer with nothing saved yet, or no saved-reads store).
class SavedFreshness extends StatelessWidget {
  const SavedFreshness({super.key, required this.at});

  final DateTime? at;

  @override
  Widget build(BuildContext context) {
    final when = at;
    if (when == null) return const SizedBox.shrink();
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
      child: Text(
        freshnessLabel(when),
        style: Theme.of(context).textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
      ),
    );
  }
}
