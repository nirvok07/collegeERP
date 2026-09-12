import 'package:flutter/material.dart';

import '../../../core/design/tokens.dart';
import '../../../core/di/locator.dart';
import '../../../core/session/session_manager.dart';
import '../../../core/widgets/status_chip.dart';
import '../../delivery/domain/class_session.dart';
import '../../delivery/domain/delivery_repository.dart';
import '../domain/teaching_offering.dart';

/// The teaching context for one course: which class, which program, which term,
/// what this teacher's role is, and who shares the course.
///
/// A bottom sheet rather than a screen, so the list stays behind it and a
/// teacher checking which room they are due in does not lose their place.
Future<void> showOfferingSheet(BuildContext context, TeachingOffering offering) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (context) => _OfferingSheet(offering: offering),
  );
}

class _OfferingSheet extends StatelessWidget {
  const _OfferingSheet({required this.offering});

  final TeachingOffering offering;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final colleagues = offering.colleagues(locator<SessionManager>().actor?.id);

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
                  child: Text(offering.courseTitle, style: Theme.of(context).textTheme.titleLarge),
                ),
                const SizedBox(width: AppSpacing.md),
                StatusChip(
                  label: offering.stateLabel,
                  tone: switch (offering.status) {
                    'active' => ChipTone.success,
                    'cancelled' => ChipTone.warning,
                    _ => ChipTone.neutral,
                  },
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              '${offering.courseCode} · ${offering.componentLabel}',
              style: Theme.of(context).textTheme.bodyMedium
                  ?.copyWith(color: scheme.onSurfaceVariant),
            ),
            const SizedBox(height: AppSpacing.lg),

            _Fact(label: 'Class', value: '${offering.programName} · ${offering.sectionLabel}'),
            _Fact(
              label: 'Term',
              value:
                  'Term ${offering.termNumber} · ${offering.termName}'
                  '${offering.academicYearName.isEmpty ? '' : ' · ${offering.academicYearName}'}',
            ),
            if (offering.departmentName.isNotEmpty)
              _Fact(label: 'Department', value: offering.departmentName),
            _Fact(label: 'Your role', value: offering.myRoleLabel),

            if (colleagues.isNotEmpty) ...[
              const SizedBox(height: AppSpacing.base),
              Text('Also teaching', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: AppSpacing.sm),
              for (final colleague in colleagues)
                Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.xs),
                  child: Text(
                    '${colleague.fullName} · ${colleague.roleLabel}',
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                ),
            ],

            if (!offering.isOver) _NextClasses(offeringId: offering.id),

            // Why a class that has not started is shown at all: the assignment
            // is real, so the teacher can see it coming. Saying what is missing
            // is better than an empty screen on the first day of term.
            if (!offering.isTeachingNow && !offering.isOver) ...[
              const SizedBox(height: AppSpacing.base),
              Text(
                offering.sectionStatus == 'active'
                    ? 'This course has not started yet. Your department starts it when teaching begins.'
                    : 'This class has not started teaching yet.',
                style: Theme.of(context).textTheme.bodySmall
                    ?.copyWith(color: scheme.onSurfaceVariant),
              ),
            ],
          ],
        ),
      ),
    );
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
            width: 110,
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

/// The next few occurrences of this course, read from the teacher's own feed.
///
/// Reaches the delivery feature through its domain port, never through its
/// cubit or its HTTP client, which is what keeps the two features independent.
/// Read-only on purpose: recording a class as taught lives in one place, the
/// schedule, so there is one write path to reason about.
class _NextClasses extends StatelessWidget {
  const _NextClasses({required this.offeringId});

  final String offeringId;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final today = todayDate();

    return FutureBuilder(
      future: locator<DeliveryRepository>().mySessions(from: today, to: shiftDate(today, 14)),
      builder: (context, snapshot) {
        // No spinner and no error: this is supporting detail on a sheet that is
        // already useful without it.
        final result = snapshot.data;
        if (result == null) return const SizedBox.shrink();
        final mine = (result.valueOrNull ?? const <ClassSession>[])
            .where((s) => s.offeringId == offeringId && !s.isCancelled)
            .take(3)
            .toList();
        if (mine.isEmpty) return const SizedBox.shrink();

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: AppSpacing.base),
            Text('Next classes', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: AppSpacing.sm),
            for (final session in mine)
              Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.xs),
                child: Text(
                  '${dayLabel(session.date, today)} · ${session.timeLabel} · '
                  '${session.whereLabel}',
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
              ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              'Record a class as taught from your schedule.',
              style: Theme.of(context).textTheme.bodySmall
                  ?.copyWith(color: scheme.onSurfaceVariant),
            ),
          ],
        );
      },
    );
  }
}
