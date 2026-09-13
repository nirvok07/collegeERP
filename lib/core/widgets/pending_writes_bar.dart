import 'package:flutter/material.dart';

import '../design/tokens.dart';
import '../di/locator.dart';
import '../outbox/offline_writes.dart';
import '../outbox/outbox.dart';
import 'outbox_status.dart';

/// Everything waiting on this phone, in one compact line on the teacher's
/// schedule. A queued write for a sheet that is not open is still visible.
class PendingWritesBar extends StatefulWidget {
  const PendingWritesBar({super.key});

  @override
  State<PendingWritesBar> createState() => _PendingWritesBarState();
}

class _PendingWritesBarState extends State<PendingWritesBar> {
  static bool _clearedNoticeDismissed = false;

  OfflineWrites? get _writes =>
      locator.isRegistered<OfflineWrites>() ? locator<OfflineWrites>() : null;

  @override
  Widget build(BuildContext context) {
    final writes = _writes;
    if (writes == null) return const SizedBox.shrink();
    final scheme = Theme.of(context).colorScheme;

    return StreamBuilder<List<OutboxItem>>(
      stream: writes.watchAll(),
      builder: (context, snapshot) {
        final items = snapshot.data ?? const [];
        final children = <Widget>[];

        if (writes.clearedOnOpen && !_clearedNoticeDismissed) {
          children.add(
            _Card(
              color: scheme.errorContainer,
              foreground: scheme.onErrorContainer,
              icon: Icons.error_outline_rounded,
              text: 'Changes saved on this phone earlier could not be read and were cleared. '
                  'Check your recent registers and results.',
              action: TextButton(
                onPressed: () => setState(() => _clearedNoticeDismissed = true),
                child: const Text('OK'),
              ),
            ),
          );
        }

        if (items.isNotEmpty) {
          final attention = items.where((i) => i.state.needsAttention).length;
          children.add(
            _Card(
              color: attention > 0 ? scheme.errorContainer : scheme.secondaryContainer,
              foreground: attention > 0 ? scheme.onErrorContainer : scheme.onSecondaryContainer,
              icon: attention > 0 ? Icons.error_outline_rounded : Icons.phone_android_rounded,
              text: attention > 0
                  ? '$attention ${attention == 1 ? 'change needs' : 'changes need'} your attention'
                  : '${items.length} ${items.length == 1 ? 'change' : 'changes'} saved on this phone, '
                        'waiting to send',
              action: TextButton(
                onPressed: () => _showList(context, writes),
                child: const Text('View'),
              ),
            ),
          );
        }

        if (children.isEmpty) return const SizedBox.shrink();
        return Column(children: children);
      },
    );
  }

  void _showList(BuildContext context, OfflineWrites writes) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (context) => StreamBuilder<List<OutboxItem>>(
        stream: writes.watchAll(),
        builder: (context, snapshot) {
          final items = snapshot.data ?? const [];
          if (items.isEmpty) {
            return const Padding(
              padding: EdgeInsets.all(AppSpacing.xl),
              child: Text('Everything has been sent.'),
            );
          }
          final scheme = Theme.of(context).colorScheme;
          return SafeArea(
            child: ListView(
              shrinkWrap: true,
              children: [
                for (final item in items)
                  ListTile(
                    title: Text(item.label),
                    subtitle: Text(
                      item.state.needsAttention && item.errorMessage != null
                          ? '${outboxStateLabel(item)}: ${item.errorMessage}'
                          : outboxStateLabel(item),
                      style: TextStyle(
                        color: item.state.needsAttention ? scheme.error : scheme.onSurfaceVariant,
                      ),
                    ),
                    trailing: item.state.needsAttention
                        ? Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              if (item.state == OutboxState.failed)
                                IconButton(
                                  tooltip: 'Try again',
                                  icon: const Icon(Icons.refresh_rounded),
                                  onPressed: () => writes.retry(item.id),
                                ),
                              IconButton(
                                tooltip: 'Discard',
                                icon: Icon(Icons.delete_outline_rounded, color: scheme.error),
                                onPressed: () async {
                                  if (await confirmDiscard(context, item)) {
                                    await writes.discard(item.id);
                                  }
                                },
                              ),
                            ],
                          )
                        : null,
                  ),
                Padding(
                  padding: const EdgeInsets.all(AppSpacing.base),
                  child: OutlinedButton(onPressed: writes.sendNow, child: const Text('Send now')),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({
    required this.color,
    required this.foreground,
    required this.icon,
    required this.text,
    required this.action,
  });

  final Color color;
  final Color foreground;
  final IconData icon;
  final String text;
  final Widget action;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(AppSpacing.base, AppSpacing.base, AppSpacing.base, 0),
      padding: const EdgeInsets.fromLTRB(AppSpacing.md, AppSpacing.xs, AppSpacing.xs, AppSpacing.xs),
      decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(AppRadius.input)),
      child: Row(
        children: [
          Icon(icon, size: 18, color: foreground),
          const SizedBox(width: AppSpacing.sm),
          Expanded(child: Text(text, style: TextStyle(color: foreground, fontSize: 13))),
          action,
        ],
      ),
    );
  }
}
