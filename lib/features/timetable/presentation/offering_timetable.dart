import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/design/tokens.dart';
import '../../../core/widgets/screen_state.dart';
import '../../../core/widgets/submit_dialog.dart';
import '../../../core/widgets/app_list_tile.dart';
import '../data/timetable_api.dart';
import '../domain/timetable.dart';
import 'timetable_cubits.dart';

/// ADM-8 (AD-81): one course's weekly timetable inside its screen: its slots,
/// and generating the term's classes from them. Generation is previewed
/// first, because it is all or nothing and a clash is better found before.
class OfferingTimetable extends StatelessWidget {
  const OfferingTimetable({super.key, required this.offeringId, required this.repository, required this.canManage, this.changeable = true});

  final String offeringId;
  final TimetableRepository repository;
  final bool canManage;

  /// False once the course is completed or cancelled.
  final bool changeable;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => OfferingTimetableCubit(repository, offeringId, manage: canManage)..load(),
      child: _OfferingTimetableView(canManage: canManage && changeable),
    );
  }
}

class _OfferingTimetableView extends StatelessWidget {
  const _OfferingTimetableView({required this.canManage});

  final bool canManage;

  Future<void> _addSlot(BuildContext context, OfferingTimetableState state) async {
    final cubit = context.read<OfferingTimetableCubit>();
    var day = 1;
    var start = const TimeOfDay(hour: 9, minute: 0);
    var end = const TimeOfDay(hour: 10, minute: 0);
    String? roomId;
    final saved = await showSubmitDialog(
      context,
      title: 'Add a weekly slot',
      submitLabel: 'Add slot',
      fields: (refresh) => [
        DropdownButtonFormField<int>(
          initialValue: day,
          decoration: const InputDecoration(labelText: 'Day'),
          items: [for (var d = 1; d <= 7; d++) DropdownMenuItem(value: d, child: Text(dayName(d)))],
          onChanged: (v) => day = v ?? day,
        ),
        ListTile(
          contentPadding: EdgeInsets.zero,
          leading: const Icon(Icons.schedule_rounded),
          title: const Text('Starts'),
          trailing: Text(clock(start.hour, start.minute)),
          onTap: () async {
            final t = await showTimePicker(context: context, initialTime: start);
            if (t != null) refresh(() => start = t);
          },
        ),
        ListTile(
          contentPadding: EdgeInsets.zero,
          leading: const Icon(Icons.schedule_outlined),
          title: const Text('Ends'),
          trailing: Text(clock(end.hour, end.minute)),
          onTap: () async {
            final t = await showTimePicker(context: context, initialTime: end);
            if (t != null) refresh(() => end = t);
          },
        ),
        DropdownButtonFormField<String?>(
          initialValue: roomId,
          isExpanded: true,
          decoration: const InputDecoration(labelText: 'Room'),
          items: [
            const DropdownMenuItem<String?>(value: null, child: Text('No room yet')),
            for (final r in state.rooms) DropdownMenuItem<String?>(value: r.id, child: Text('${r.code} · ${r.name}')),
          ],
          onChanged: (v) => roomId = v,
        ),
      ],
      submit: () async {
        final s = clock(start.hour, start.minute), e = clock(end.hour, end.minute);
        if (e.compareTo(s) <= 0) return invalidInput('A class must end after it starts.');
        return cubit.addSlot(day, s, e, roomId);
      },
    );
    if (saved && context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Slot added')));
  }

  Future<void> _generate(BuildContext context) async {
    final cubit = context.read<OfferingTimetableCubit>();
    final messenger = ScaffoldMessenger.of(context);
    final preview = await cubit.preview();
    if (!context.mounted) return;
    final report = preview.valueOrNull;
    if (report == null) {
      messenger.showSnackBar(SnackBar(content: Text(preview.failureOrNull?.message ?? 'That did not work.')));
      return;
    }

    final summary = [
      '${report.occurrences} classes from ${report.from} to ${report.to}.',
      if (report.alreadyScheduled > 0) '${report.alreadyScheduled} already scheduled stay as they are.',
      if (report.skippedDays.isNotEmpty) 'Skipped: ${report.skippedDays.map((d) => '${d.date} (${d.label})').join(', ')}.',
    ].join('\n');

    if (report.clashes.isNotEmpty) {
      await showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('These classes clash'),
          content: SingleChildScrollView(
            child: Text('$summary\n\nNothing was created. Change the slot, room or teacher first:\n\n${report.clashes.join('\n')}'),
          ),
          actions: [FilledButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Close'))],
        ),
      );
      return;
    }
    if (report.occurrences == 0) {
      messenger.showSnackBar(const SnackBar(content: Text('Every class of this term is already scheduled.')));
      return;
    }
    var created = 0;
    final done = await showSubmitDialog(
      context,
      title: 'Create ${report.occurrences} classes?',
      submitLabel: 'Create classes',
      fields: (_) => [Text(summary)],
      submit: () async {
        final result = await cubit.generate();
        created = result.valueOrNull?.created ?? 0;
        return result.failureOrNull;
      },
    );
    if (done) messenger.showSnackBar(SnackBar(content: Text('$created classes created')));
  }

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<OfferingTimetableCubit, OfferingTimetableState>(
      builder: (context, state) {
        final cubit = context.read<OfferingTimetableCubit>();
        final theme = Theme.of(context);
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(child: Text('Weekly timetable', style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700))),
                if (canManage && state.status == LoadStatus.success)
                  TextButton.icon(onPressed: () => _addSlot(context, state), icon: const Icon(Icons.add_rounded), label: const Text('Add slot')),
              ],
            ),
            if (state.status == LoadStatus.loading) const LinearProgressIndicator(minHeight: 2),
            if (state.failure != null) Text(state.failure!.message, style: TextStyle(color: theme.colorScheme.error)),
            if (state.status == LoadStatus.success && state.slots.isEmpty)
              Text(
                canManage ? 'No slots yet. Add the days and times this course is taught each week.' : 'No slots yet.',
                style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
              ),
            for (final slot in state.slots)
              AppListTile(
                margin: const EdgeInsets.symmetric(vertical: 6),
                leading: const Icon(Icons.event_repeat_rounded),
                title: Text(slot.label),
                trailing: canManage
                    ? IconButton(
                        tooltip: 'Remove ${slot.label}',
                        icon: const Icon(Icons.remove_circle_outline_rounded),
                        onPressed: () async {
                          final failure = await cubit.removeSlot(slot.id);
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(failure?.message ?? 'Slot removed')));
                          }
                        },
                      )
                    : null,
              ),
            if (canManage && state.slots.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: AppSpacing.sm),
                child: OutlinedButton.icon(
                  onPressed: () => _generate(context),
                  icon: const Icon(Icons.auto_awesome_motion_rounded),
                  label: const Text('Generate the term\'s classes'),
                ),
              ),
          ],
        );
      },
    );
  }
}
