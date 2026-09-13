import 'package:flutter/material.dart';

import '../design/tokens.dart';
import '../outbox/outbox.dart';

/// One line at the top of a sheet saying what is waiting on this phone.
///
/// Three honest states and nothing more: saved here and waiting, sending, or
/// needing a person. Nothing about it pretends a queued write has arrived.
class OutboxStatusLine extends StatelessWidget {
  const OutboxStatusLine({
    super.key,
    required this.items,
    required this.onSendNow,
    required this.onRetry,
    required this.onDiscard,
  });

  final List<OutboxItem> items;
  final VoidCallback onSendNow;
  final void Function(OutboxItem) onRetry;
  final void Function(OutboxItem) onDiscard;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) return const SizedBox.shrink();
    final scheme = Theme.of(context).colorScheme;
    final attention = items.where((i) => i.state.needsAttention).firstOrNull;

    if (attention != null) {
      final conflict = attention.state == OutboxState.conflict;
      return Container(
        width: double.infinity,
        color: scheme.errorContainer,
        padding: const EdgeInsets.fromLTRB(AppSpacing.md, AppSpacing.md, AppSpacing.sm, AppSpacing.xs),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              conflict ? 'Not applied: somebody else changed this' : 'Could not be sent',
              style: TextStyle(
                color: scheme.onErrorContainer,
                fontWeight: FontWeight.w600,
                fontSize: 13,
              ),
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              attention.errorMessage ?? 'The server did not accept this change.',
              style: TextStyle(color: scheme.onErrorContainer, fontSize: 13),
            ),
            if (conflict)
              Text(
                'Your change is still on this phone. Discard it, then check and enter it again.',
                style: TextStyle(color: scheme.onErrorContainer, fontSize: 12),
              ),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                if (!conflict)
                  TextButton(onPressed: () => onRetry(attention), child: const Text('Try again')),
                TextButton(
                  onPressed: () => onDiscard(attention),
                  child: Text('Discard', style: TextStyle(color: scheme.error)),
                ),
              ],
            ),
          ],
        ),
      );
    }

    final sending = items.any((i) => i.state == OutboxState.sending);
    final count = items.length;
    return Container(
      width: double.infinity,
      color: scheme.secondaryContainer,
      padding: const EdgeInsets.fromLTRB(AppSpacing.md, AppSpacing.xs, AppSpacing.xs, AppSpacing.xs),
      child: Row(
        children: [
          Icon(
            sending ? Icons.cloud_upload_rounded : Icons.phone_android_rounded,
            size: 18,
            color: scheme.onSecondaryContainer,
          ),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(
              sending
                  ? 'Sending…'
                  : '${count == 1 ? 'Saved' : '$count changes saved'} on this phone. '
                        'Sent automatically when you are online.',
              style: TextStyle(color: scheme.onSecondaryContainer, fontSize: 12),
            ),
          ),
          if (!sending) TextButton(onPressed: onSendNow, child: const Text('Send now')),
        ],
      ),
    );
  }
}

/// A queued write is the only copy of that work, so discarding asks first.
Future<bool> confirmDiscard(BuildContext context, OutboxItem item) async {
  final scheme = Theme.of(context).colorScheme;
  final confirmed = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('Discard this change?'),
      content: Text(
        '${item.label} has not reached the server. Discarding removes it, and anything '
        'saved after it on the same sheet, from this phone.',
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Keep')),
        TextButton(
          onPressed: () => Navigator.of(context).pop(true),
          child: Text('Discard', style: TextStyle(color: scheme.error)),
        ),
      ],
    ),
  );
  return confirmed == true;
}

String outboxStateLabel(OutboxItem item) => switch (item.state) {
  OutboxState.pending => 'Waiting to send',
  OutboxState.sending => 'Sending',
  OutboxState.synced => 'Sent',
  OutboxState.failed => 'Could not be sent',
  OutboxState.conflict => 'Not applied',
};
