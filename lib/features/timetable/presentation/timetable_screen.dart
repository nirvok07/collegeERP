import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/design/tokens.dart';
import '../../../core/di/locator.dart';
import '../../../core/session/authority.dart';
import '../../../core/widgets/screen_state.dart';
import '../../../core/widgets/status_chip.dart';
import '../../../core/widgets/submit_dialog.dart';
import '../../../core/widgets/app_list_tile.dart';
import '../../academic/domain/academic.dart' show isoDate, shortDate;
import '../../delivery/domain/class_session.dart';
import '../data/timetable_api.dart';
import '../domain/timetable.dart';
import 'timetable_cubits.dart';

/// ADM-8 (AD-81): the college's classes a week at a time, and its
/// non-teaching days. `session.manage` moves and cancels classes;
/// `term.manage` adds and removes non-teaching days.
class TimetableScreen extends StatelessWidget {
  const TimetableScreen({super.key, this.authority, this.repository, this.today});

  final Authority? authority;

  /// Tests supply their own; the app uses the server.
  final TimetableRepository? repository;
  final String? today;

  @override
  Widget build(BuildContext context) {
    final manage = authority?.can('session.manage') ?? false;
    final t = today ?? todayDate();
    return BlocProvider(
      create: (_) => TimetableCubit(repository ?? locator<TimetableRepository>(), today: t, manage: manage)..load(),
      child: _TimetableView(
        canManage: manage,
        canCalendar: authority?.can('term.manage') ?? false,
        today: t,
      ),
    );
  }
}

void _say(BuildContext context, String message) =>
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));

ChipTone _tone(ClassSession s, String today) => s.isCancelled
    ? ChipTone.error
    : s.isTaught
        ? ChipTone.success
        : s.isUnmarked(today)
            ? ChipTone.warning
            : ChipTone.neutral;

class _TimetableView extends StatelessWidget {
  const _TimetableView({required this.canManage, required this.canCalendar, required this.today});

  final bool canManage;
  final bool canCalendar;
  final String today;

  Future<void> _move(BuildContext context, TimetableState state, ClassSession s) async {
    final cubit = context.read<TimetableCubit>();
    final p = s.date.split('-').map(int.parse).toList();
    var date = DateTime(p[0], p[1], p[2]);
    TimeOfDay parse(String hhmm) => TimeOfDay(hour: int.parse(hhmm.substring(0, 2)), minute: int.parse(hhmm.substring(3, 5)));
    var start = parse(s.startsAt);
    var end = parse(s.endsAt);
    var roomId = s.roomId;
    final reason = TextEditingController();
    final done = await showSubmitDialog(
      context,
      title: 'Move ${s.courseCode} · ${s.sectionLabel}',
      submitLabel: 'Move class',
      controllers: [reason],
      fields: (refresh) => [
        ListTile(
          contentPadding: EdgeInsets.zero,
          leading: const Icon(Icons.event_rounded),
          title: const Text('Date'),
          trailing: Text(shortDate(date)),
          onTap: () async {
            final d = await showDatePicker(context: context, initialDate: date, firstDate: DateTime(2000), lastDate: DateTime(2100));
            if (d != null) refresh(() => date = d);
          },
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
          initialValue: state.rooms.any((r) => r.id == roomId) ? roomId : null,
          isExpanded: true,
          decoration: const InputDecoration(labelText: 'Room'),
          items: [
            const DropdownMenuItem<String?>(value: null, child: Text('No room')),
            for (final r in state.rooms) DropdownMenuItem<String?>(value: r.id, child: Text('${r.code} · ${r.name}')),
          ],
          onChanged: (v) => roomId = v,
        ),
        TextField(controller: reason, decoration: const InputDecoration(labelText: 'Reason (optional)')),
      ],
      submit: () async {
        final a = clock(start.hour, start.minute), b = clock(end.hour, end.minute);
        if (b.compareTo(a) <= 0) return invalidInput('A class must end after it starts.');
        return cubit.reschedule(s,
            date: isoDate(date), startsAt: a, endsAt: b, roomId: roomId, reason: reason.text.trim().isEmpty ? null : reason.text.trim());
      },
    );
    if (done && context.mounted) _say(context, 'Class moved');
  }

  Future<void> _cancel(BuildContext context, ClassSession s) async {
    final cubit = context.read<TimetableCubit>();
    final reason = TextEditingController();
    final done = await showSubmitDialog(
      context,
      title: 'Cancel ${s.courseCode} on ${dayLabel(s.date, today)}?',
      submitLabel: 'Cancel class',
      destructive: true,
      controllers: [reason],
      fields: (_) => [
        TextField(controller: reason, decoration: const InputDecoration(labelText: 'Reason', hintText: 'Teacher on leave')),
      ],
      submit: () async {
        if (reason.text.trim().isEmpty) return invalidInput('Give a reason. It answers why there was no class.');
        return cubit.cancel(s.id, reason.text);
      },
    );
    if (done && context.mounted) _say(context, 'Class cancelled');
  }

  Future<void> _addHoliday(BuildContext context) async {
    final cubit = context.read<TimetableCubit>();
    final p = today.split('-').map(int.parse).toList();
    var date = DateTime(p[0], p[1], p[2]);
    final label = TextEditingController();
    final done = await showSubmitDialog(
      context,
      title: 'Add a non-teaching day',
      submitLabel: 'Add day',
      controllers: [label],
      fields: (refresh) => [
        ListTile(
          contentPadding: EdgeInsets.zero,
          leading: const Icon(Icons.event_busy_rounded),
          title: const Text('Date'),
          trailing: Text(shortDate(date)),
          onTap: () async {
            final d = await showDatePicker(context: context, initialDate: date, firstDate: DateTime(2000), lastDate: DateTime(2100));
            if (d != null) refresh(() => date = d);
          },
        ),
        TextField(controller: label, decoration: const InputDecoration(labelText: 'Name', hintText: 'Diwali')),
      ],
      submit: () async {
        if (label.text.trim().isEmpty) return invalidInput('Name the day, such as Diwali.');
        return cubit.addHoliday(isoDate(date), label.text);
      },
    );
    if (done && context.mounted) _say(context, 'Non-teaching day added. New classes skip it.');
  }

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<TimetableCubit, TimetableState>(
      builder: (context, state) {
        final cubit = context.read<TimetableCubit>();
        final theme = Theme.of(context);
        return DefaultTabController(
          length: 2,
          child: Scaffold(
            appBar: AppBar(
              title: const Text('Timetable'),
              bottom: const TabBar(tabs: [Tab(text: 'Classes'), Tab(text: 'Holidays')]),
            ),
            body: switch (state.status) {
              LoadStatus.loading => const SkeletonList(rows: 6, leading: SkeletonLeading.time, trailing: SkeletonTrailing.chip, groupEvery: 3),
              LoadStatus.failure => ErrorView(failure: state.failure!, onRetry: cubit.load),
              _ => TabBarView(
                  children: [
                    RefreshIndicator(
                      onRefresh: cubit.load,
                      child: ListView(
                        padding: const EdgeInsets.only(bottom: AppSpacing.xxl),
                        children: [
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm),
                            child: Row(
                              children: [
                                IconButton(tooltip: 'Previous week', onPressed: () => cubit.week(-1), icon: const Icon(Icons.chevron_left_rounded)),
                                Expanded(
                                  child: Text(
                                    '${dayLabel(state.weekFrom, today)} – ${dayLabel(state.weekTo, today)}',
                                    textAlign: TextAlign.center,
                                    style: theme.textTheme.titleSmall,
                                  ),
                                ),
                                IconButton(tooltip: 'Next week', onPressed: () => cubit.week(1), icon: const Icon(Icons.chevron_right_rounded)),
                              ],
                            ),
                          ),
                          if (state.failure != null)
                            Padding(
                              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.base),
                              child: Text(state.failure!.message, style: TextStyle(color: theme.colorScheme.error)),
                            ),
                          if (state.sessions.isEmpty)
                            const EmptyView(
                              title: 'No classes this week',
                              body: 'Classes come from each course\'s weekly timetable. Open a course in Sections to set it up.',
                              icon: Icons.event_note_outlined,
                            ),
                          for (final day in state.byDay.entries) ...[
                            Padding(
                              padding: const EdgeInsets.fromLTRB(AppSpacing.base, AppSpacing.base, AppSpacing.base, AppSpacing.xs),
                              child: Text(
                                '${dayLabel(day.key, today)} · ${day.value.length} ${day.value.length == 1 ? 'class' : 'classes'}',
                                style: theme.textTheme.labelLarge?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                              ),
                            ),
                            for (final s in day.value)
                              AppListTile(
                                title: Text('${s.timeLabel} · ${s.courseCode} · ${s.sectionLabel}'),
                                subtitle: Text([s.whereLabel, s.teacherName ?? 'No teacher'].join(' · ')),
                                trailing: canManage && s.allowedActions.contains('cancel')
                                    ? PopupMenuButton<String>(
                                        tooltip: 'More for ${s.courseCode} at ${s.startsAt}',
                                        onSelected: (choice) => choice == 'move' ? _move(context, state, s) : _cancel(context, s),
                                        itemBuilder: (_) => const [
                                          PopupMenuItem(value: 'move', child: Text('Move')),
                                          PopupMenuItem(value: 'cancel', child: Text('Cancel')),
                                        ],
                                      )
                                    : StatusChip(label: s.stateLabel(today), tone: _tone(s, today)),
                              ),
                          ],
                        ],
                      ),
                    ),
                    Scaffold(
                      floatingActionButton: canCalendar
                          ? FloatingActionButton.extended(
                              onPressed: () => _addHoliday(context),
                              icon: const Icon(Icons.add_rounded),
                              label: const Text('Add day'),
                            )
                          : null,
                      body: state.holidays.isEmpty
                          ? EmptyView(
                              title: 'No non-teaching days',
                              body: canCalendar
                                  ? 'Add holidays so generated classes skip them.'
                                  : 'Your college administrator adds holidays.',
                              icon: Icons.beach_access_outlined,
                            )
                          : ListView(
                              padding: const EdgeInsets.only(bottom: 88),
                              children: [
                                for (final h in state.holidays)
                                  AppListTile(
                                    leading: const Icon(Icons.event_busy_rounded),
                                    title: Text(h.label),
                                    subtitle: Text(dayLabel(h.onDate, today)),
                                    trailing: canCalendar
                                        ? IconButton(
                                            tooltip: 'Remove ${h.label}',
                                            icon: const Icon(Icons.delete_outline_rounded),
                                            onPressed: () async {
                                              final failure = await cubit.removeHoliday(h.id);
                                              if (context.mounted) _say(context, failure?.message ?? '${h.label} removed');
                                            },
                                          )
                                        : null,
                                  ),
                              ],
                            ),
                    ),
                  ],
                ),
            },
          ),
        );
      },
    );
  }
}
