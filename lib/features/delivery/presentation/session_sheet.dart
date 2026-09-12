import 'package:flutter/material.dart';

import '../../../core/design/tokens.dart';
import '../../../core/widgets/status_chip.dart';
import '../domain/class_session.dart';

/// One class: when, where, which cohort, and whether it has been recorded.
///
/// A bottom sheet rather than a screen, so the day stays behind it and a teacher
/// checking which room they are due in does not lose their place.
Future<void> showSessionSheet(
  BuildContext context, {
  required ClassSession session,
  required String today,
  required Future<String?> Function(ClassSession) onMarkTaught,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (context) => _SessionSheet(session: session, today: today, onMarkTaught: onMarkTaught),
  );
}

class _SessionSheet extends StatefulWidget {
  const _SessionSheet({required this.session, required this.today, required this.onMarkTaught});

  final ClassSession session;
  final String today;

  /// Returns an error message, or null when the class was recorded.
  final Future<String?> Function(ClassSession) onMarkTaught;

  @override
  State<_SessionSheet> createState() => _SessionSheetState();
}

class _SessionSheetState extends State<_SessionSheet> {
  bool _busy = false;
  String? _error;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final session = widget.session;

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(AppSpacing.xl, 0, AppSpacing.xl, AppSpacing.xl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(session.courseTitle, style: Theme.of(context).textTheme.titleLarge),
                ),
                const SizedBox(width: AppSpacing.md),
                StatusChip(
                  label: session.stateLabel(widget.today),
                  tone: switch (session.stateLabel(widget.today)) {
                    'Taught' => ChipTone.success,
                    'Cancelled' => ChipTone.warning,
                    'Not marked' => ChipTone.warning,
                    _ => ChipTone.info,
                  },
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              '${session.courseCode} · ${session.componentLabel}',
              style: Theme.of(context).textTheme.bodyMedium
                  ?.copyWith(color: scheme.onSurfaceVariant),
            ),
            const SizedBox(height: AppSpacing.lg),

            _Fact(
              label: 'When',
              value: '${dayLabel(session.date, widget.today)}, ${session.timeLabel}',
            ),
            _Fact(
              label: 'Where',
              value: session.roomCode == null
                  ? 'No room set'
                  : '${session.roomCode}${session.roomName == null ? '' : ' · ${session.roomName}'}',
            ),
            _Fact(label: 'Class', value: '${session.programName} · ${session.sectionLabel}'),
            _Fact(label: 'Term', value: session.termName),
            if (!session.iAmTeaching && session.teacherName != null)
              _Fact(label: 'Taught by', value: session.teacherName!),
            if (session.iAmStandingIn) _Fact(label: 'Your role', value: 'Standing in'),

            if (session.movedFromDate != null)
              Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.md),
                child: Text(
                  'Moved from ${dayLabel(session.movedFromDate!, widget.today)}.',
                  style: Theme.of(context).textTheme.bodySmall
                      ?.copyWith(color: scheme.onSurfaceVariant),
                ),
              ),

            if (session.isCancelled && session.cancelledReason != null)
              Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.md),
                child: Text(
                  'Cancelled: ${session.cancelledReason}',
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
              ),

            if (session.isTaught)
              Text(
                'Recorded as taught. The record stays as it is.',
                style: Theme.of(context).textTheme.bodySmall
                    ?.copyWith(color: scheme.onSurfaceVariant),
              ),

            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(top: AppSpacing.sm),
                child: Text(
                  _error!,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: scheme.error),
                ),
              ),

            // The one write a teacher makes here. Attendance is a later module,
            // and nothing on this sheet pretends otherwise.
            if (session.canMarkTaught && session.iAmTeaching)
              Padding(
                padding: const EdgeInsets.only(top: AppSpacing.base),
                child: SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: _busy ? null : _mark,
                    child: Text(_busy ? 'Recording' : 'I taught this class'),
                  ),
                ),
              ),

            if (session.canMarkTaught && !session.iAmTeaching)
              Padding(
                padding: const EdgeInsets.only(top: AppSpacing.base),
                child: Text(
                  '${session.teacherName ?? 'The lead instructor'} records this class as taught.',
                  style: Theme.of(context).textTheme.bodySmall
                      ?.copyWith(color: scheme.onSurfaceVariant),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Future<void> _mark() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final message = await widget.onMarkTaught(widget.session);
    if (!mounted) return;
    if (message != null) {
      setState(() {
        _busy = false;
        _error = message;
      });
      return;
    }
    Navigator.of(context).pop();
  }
}

class _Fact extends StatelessWidget {
  const _Fact({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 96,
            child: Text(
              label,
              style: Theme.of(context).textTheme.bodyMedium
                  ?.copyWith(color: scheme.onSurfaceVariant),
            ),
          ),
          Expanded(child: Text(value, style: Theme.of(context).textTheme.bodyMedium)),
        ],
      ),
    );
  }
}
