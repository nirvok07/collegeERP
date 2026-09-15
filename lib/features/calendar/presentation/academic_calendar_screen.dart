import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/design/tokens.dart';
import '../../../core/di/locator.dart';
import '../../../core/error/failure.dart';
import '../../../core/network/api_client.dart';
import '../../../core/saved_reads/saved_reads.dart';
import '../../../core/widgets/screen_state.dart';
import '../../academic/domain/academic.dart' show isoDate;
import '../data/calendar_api.dart';

const _months = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const _weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

String _short(DateTime d) => '${d.day} ${_months[d.month - 1].substring(0, 3)}';
String _span(HolidayRun r) => r.length == 1 ? _short(r.first) : '${_short(r.first)} – ${_short(r.last)}';
String _weekday(DateTime d) => _weekdays[d.weekday - 1];

/* ------------------------------------------------------------------ state */

class CalendarState {
  const CalendarState({required this.month, this.status = LoadStatus.loading, this.calendar, this.failure});

  final DateTime month;
  final LoadStatus status;
  final AcademicCalendar? calendar;
  final Failure? failure;

  CalendarState copyWith({DateTime? month, LoadStatus? status, AcademicCalendar? calendar, Failure? failure}) =>
      CalendarState(
        month: month ?? this.month,
        status: status ?? this.status,
        calendar: calendar ?? this.calendar,
        failure: failure,
      );
}

class CalendarCubit extends Cubit<CalendarState> {
  CalendarCubit(this._repository, DateTime today) : super(CalendarState(month: DateTime(today.year, today.month)));

  final CalendarRepository _repository;

  /// AD-9 (amended): what was saved first, then the server's answer.
  Future<void> load() async {
    if (state.calendar == null) await fromSaved(_read);
    return _read();
  }

  Future<void> _read() async {
    final result = await _repository.read();
    if (isClosed) return;
    result.when(
      ok: (c) => emit(state.copyWith(status: LoadStatus.success, calendar: c)),
      err: (f) => emit(state.copyWith(status: state.calendar == null ? LoadStatus.failure : LoadStatus.success, failure: f)),
    );
  }

  void showMonth(int delta) => emit(state.copyWith(month: DateTime(state.month.year, state.month.month + delta)));

  /// Null when saved; the server's reason otherwise.
  Future<Failure?> add({required DateTime from, DateTime? to, required String label}) async {
    if (label.trim().isEmpty) return const Failure(code: FailureCode.validationFailed, message: 'Give the holiday a name.');
    final result = await _repository.addHoliday(from: isoDate(from), to: to == null ? null : isoDate(to), label: label);
    final failure = result.failureOrNull;
    if (failure == null) {
      emit(state.copyWith(month: DateTime(from.year, from.month)));
      await _read();
    }
    return failure;
  }

  /// Removes every day of a break.
  Future<Failure?> remove(HolidayRun run) async {
    for (final day in run.days) {
      final failure = (await _repository.removeHoliday(day.id)).failureOrNull;
      if (failure != null) {
        await _read();
        return failure;
      }
    }
    await _read();
    return null;
  }
}

/* ----------------------------------------------------------------- screen */

/// CAL-1: the college's academic calendar. Everyone sees the month with its
/// holidays and term, and the breaks to come; the College Admin adds and
/// removes holidays here.
class AcademicCalendarScreen extends StatelessWidget {
  const AcademicCalendarScreen({super.key, required this.canManage, this.repository, this.today});

  final bool canManage;

  /// Tests supply their own; the app uses the server.
  final CalendarRepository? repository;
  final DateTime? today;

  @override
  Widget build(BuildContext context) {
    final now = today ?? DateTime.now();
    return BlocProvider(
      create: (_) => CalendarCubit(repository ?? CalendarApi(locator<ApiClient>()), now)..load(),
      child: _CalendarView(canManage: canManage, today: DateTime(now.year, now.month, now.day)),
    );
  }
}

class _CalendarView extends StatelessWidget {
  const _CalendarView({required this.canManage, required this.today});

  final bool canManage;
  final DateTime today;

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<CalendarCubit, CalendarState>(
      builder: (context, state) {
        final cubit = context.read<CalendarCubit>();
        final calendar = state.calendar;
        return Scaffold(
          appBar: AppBar(title: const Text('Academic calendar')),
          floatingActionButton: canManage && calendar != null
              ? FloatingActionButton.extended(
                  onPressed: () => _addHoliday(context, state.month),
                  icon: const Icon(Icons.add_rounded),
                  label: const Text('Add holiday'),
                )
              : null,
          body: switch (state.status) {
            LoadStatus.loading => const _CalendarSkeleton(),
            LoadStatus.failure => ErrorView(failure: state.failure!, onRetry: cubit.load),
            _ => RefreshIndicator(
                onRefresh: cubit.load,
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(AppSpacing.base, AppSpacing.sm, AppSpacing.base, 96),
                  children: [
                    if (state.failure != null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                        child: Text(state.failure!.message, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                      ),
                    _MonthCard(calendar: calendar!, month: state.month, today: today, onMonth: cubit.showMonth),
                    const SizedBox(height: AppSpacing.lg),
                    _Breaks(
                      title: 'In ${_months[state.month.month - 1]}',
                      runs: calendar.runsIn(state.month),
                      empty: 'No holidays this month.',
                      canManage: canManage,
                    ),
                    const SizedBox(height: AppSpacing.lg),
                    _Breaks(
                      title: 'Coming up',
                      runs: calendar.upcoming(today),
                      empty: canManage ? 'No holidays ahead. Add the ones your college has announced.' : 'No holidays announced yet.',
                      canManage: canManage,
                      showCountdown: today,
                    ),
                    const SizedBox(height: AppSpacing.lg),
                    _Terms(periods: calendar.periods, today: today),
                  ],
                ),
              ),
          },
        );
      },
    );
  }

  Future<void> _addHoliday(BuildContext context, DateTime month) async {
    final cubit = context.read<CalendarCubit>();
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => BlocProvider.value(
        value: cubit,
        child: _AddHolidaySheet(initial: month.year == today.year && month.month == today.month ? today : month),
      ),
    );
  }
}

/* ------------------------------------------------------------ month grid */

class _MonthCard extends StatelessWidget {
  const _MonthCard({required this.calendar, required this.month, required this.today, required this.onMonth});

  final AcademicCalendar calendar;
  final DateTime month;
  final DateTime today;
  final ValueChanged<int> onMonth;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final first = DateTime(month.year, month.month);
    final daysInMonth = DateTime(month.year, month.month + 1, 0).day;
    final leading = first.weekday - 1; // Monday first
    final cells = leading + daysInMonth;
    final term = calendar.termOn(DateTime(month.year, month.month, 15));

    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                IconButton(tooltip: 'Previous month', icon: const Icon(Icons.chevron_left_rounded), onPressed: () => onMonth(-1)),
                Expanded(
                  child: Column(
                    children: [
                      Text('${_months[month.month - 1]} ${month.year}',
                          style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                      if (term != null)
                        Text('${term.name}${term.yearName == null ? '' : ' · ${term.yearName}'}',
                            style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant)),
                    ],
                  ),
                ),
                IconButton(tooltip: 'Next month', icon: const Icon(Icons.chevron_right_rounded), onPressed: () => onMonth(1)),
              ],
            ),
            const SizedBox(height: AppSpacing.sm),
            Row(
              children: [
                for (final w in _weekdays)
                  Expanded(
                    child: Center(
                      child: Text(w.substring(0, 1),
                          style: theme.textTheme.labelSmall?.copyWith(color: scheme.onSurfaceVariant, fontWeight: FontWeight.w600)),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: AppSpacing.xs),
            GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: (cells / 7).ceil() * 7,
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 7, childAspectRatio: 1),
              itemBuilder: (context, i) {
                final dayNumber = i - leading + 1;
                if (dayNumber < 1 || dayNumber > daysInMonth) return const SizedBox.shrink();
                final day = DateTime(month.year, month.month, dayNumber);
                return _DayCell(
                  day: day,
                  holiday: calendar.holidayOn(day),
                  inTerm: calendar.termOn(day) != null,
                  isToday: sameDay(day, today),
                );
              },
            ),
            const SizedBox(height: AppSpacing.sm),
            Wrap(
              spacing: AppSpacing.base,
              runSpacing: AppSpacing.xs,
              children: const [
                _Legend(color: AppColors.warning, label: 'Holiday'),
                _Legend(color: AppColors.primary, label: 'Term'),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _DayCell extends StatelessWidget {
  const _DayCell({required this.day, required this.holiday, required this.inTerm, required this.isToday});

  final DateTime day;
  final CalendarHoliday? holiday;
  final bool inTerm;
  final bool isToday;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final isHoliday = holiday != null;
    final isSunday = day.weekday == DateTime.sunday;
    final background = isHoliday
        ? AppColors.warning.withValues(alpha: 0.18)
        : inTerm
            ? AppColors.primary.withValues(alpha: 0.06)
            : Colors.transparent;
    final cell = Container(
      margin: const EdgeInsets.all(2),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(AppRadius.input),
        border: isToday ? Border.all(color: scheme.primary, width: 1.5) : null,
      ),
      alignment: Alignment.center,
      child: Text(
        '${day.day}',
        style: theme.textTheme.bodyMedium?.copyWith(
          fontWeight: isHoliday || isToday ? FontWeight.w700 : FontWeight.w400,
          color: isHoliday ? AppColors.warning : (isSunday ? scheme.onSurfaceVariant : null),
        ),
      ),
    );
    return Semantics(
      label: '${day.day} ${_months[day.month - 1]}${isHoliday ? ', ${holiday!.label}' : ''}${isToday ? ', today' : ''}',
      excludeSemantics: true,
      child: isHoliday ? Tooltip(message: holiday!.label, triggerMode: TooltipTriggerMode.tap, child: cell) : cell,
    );
  }
}

class _Legend extends StatelessWidget {
  const _Legend({required this.color, required this.label});
  final Color color;
  final String label;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Container(
        width: 12,
        height: 12,
        decoration: BoxDecoration(color: color.withValues(alpha: 0.25), borderRadius: BorderRadius.circular(3)),
      ),
      const SizedBox(width: AppSpacing.xs),
      Text(label, style: Theme.of(context).textTheme.bodySmall),
    ],
  );
}

/* ---------------------------------------------------------------- lists */

class _Breaks extends StatelessWidget {
  const _Breaks({required this.title, required this.runs, required this.empty, required this.canManage, this.showCountdown});

  final String title;
  final List<HolidayRun> runs;
  final String empty;
  final bool canManage;

  /// When set, each break says how far away it is.
  final DateTime? showCountdown;

  String? _until(HolidayRun r) {
    final today = showCountdown;
    if (today == null) return null;
    final days = r.first.difference(today).inDays;
    if (days <= 0) return r.last.isBefore(today) ? null : 'Now';
    return days == 1 ? 'Tomorrow' : 'In $days days';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(title, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
        const SizedBox(height: AppSpacing.sm),
        if (runs.isEmpty)
          Text(empty, style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant))
        else
          for (final r in runs)
            Card(
              margin: const EdgeInsets.only(bottom: AppSpacing.sm),
              child: ListTile(
                leading: Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: AppColors.warning.withValues(alpha: 0.14),
                    borderRadius: BorderRadius.circular(AppRadius.card),
                  ),
                  alignment: Alignment.center,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text('${r.first.day}',
                          style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800, color: AppColors.warning, height: 1)),
                      Text(_months[r.first.month - 1].substring(0, 3),
                          style: theme.textTheme.labelSmall?.copyWith(color: AppColors.warning)),
                    ],
                  ),
                ),
                title: Text(r.label, style: const TextStyle(fontWeight: FontWeight.w600)),
                subtitle: Text(
                  '${_weekday(r.first)}, ${_span(r)}${r.length > 1 ? ' · ${r.length} days' : ''}'
                  '${_until(r) == null ? '' : ' · ${_until(r)}'}',
                ),
                trailing: canManage
                    ? IconButton(
                        tooltip: 'Remove ${r.label}',
                        icon: const Icon(Icons.delete_outline_rounded),
                        onPressed: () => _confirmRemove(context, r),
                      )
                    : null,
              ),
            ),
      ],
    );
  }

  Future<void> _confirmRemove(BuildContext context, HolidayRun r) async {
    final cubit = context.read<CalendarCubit>();
    final messenger = ScaffoldMessenger.of(context);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Remove ${r.label}?'),
        content: Text(
          '${_span(r)} becomes a working day again. Classes already generated around it are not added back; '
          'generate the timetable again if they are needed.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Remove')),
        ],
      ),
    );
    if (confirmed != true) return;
    final failure = await cubit.remove(r);
    messenger.showSnackBar(SnackBar(content: Text(failure?.message ?? '${r.label} removed')));
  }
}

class _Terms extends StatelessWidget {
  const _Terms({required this.periods, required this.today});
  final List<CalendarPeriod> periods;
  final DateTime today;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final terms = periods.where((p) => p.isTerm).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Terms', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
        const SizedBox(height: AppSpacing.sm),
        if (terms.isEmpty)
          Text('No terms set up yet.', style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant))
        else
          for (final t in terms)
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.sm),
              child: Row(
                children: [
                  Icon(
                    t.covers(today) ? Icons.play_circle_rounded : Icons.circle_outlined,
                    size: 18,
                    color: t.covers(today) ? AppColors.primary : theme.colorScheme.onSurfaceVariant,
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: Text('${t.name}${t.yearName == null ? '' : ' · ${t.yearName}'}',
                        style: theme.textTheme.bodyMedium?.copyWith(fontWeight: t.covers(today) ? FontWeight.w700 : null)),
                  ),
                  Text('${_short(t.startsOn)} – ${_short(t.endsOn)} ${t.endsOn.year}', style: theme.textTheme.bodySmall),
                ],
              ),
            ),
      ],
    );
  }
}

/* ------------------------------------------------------------- add sheet */

class _AddHolidaySheet extends StatefulWidget {
  const _AddHolidaySheet({required this.initial});
  final DateTime initial;

  @override
  State<_AddHolidaySheet> createState() => _AddHolidaySheetState();
}

class _AddHolidaySheetState extends State<_AddHolidaySheet> {
  final _label = TextEditingController();
  late DateTime _from = widget.initial;
  DateTime? _to;
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _label.dispose();
    super.dispose();
  }

  Future<DateTime?> _pick(DateTime initial, {DateTime? first}) => showDatePicker(
    context: context,
    initialDate: initial,
    firstDate: first ?? DateTime(initial.year - 1),
    lastDate: DateTime(initial.year + 2, 12, 31),
  );

  Future<void> _save() async {
    setState(() {
      _saving = true;
      _error = null;
    });
    final failure = await context.read<CalendarCubit>().add(from: _from, to: _to, label: _label.text);
    if (!mounted) return;
    if (failure == null) {
      Navigator.of(context).pop();
      return;
    }
    setState(() {
      _saving = false;
      _error = failure.message;
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: EdgeInsets.fromLTRB(
        AppSpacing.base, 0, AppSpacing.base, MediaQuery.viewInsetsOf(context).bottom + AppSpacing.xl),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Add a holiday', style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: AppSpacing.md),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.sm),
              child: Text(_error!, style: TextStyle(color: theme.colorScheme.error)),
            ),
          TextField(
            controller: _label,
            autofocus: true,
            textCapitalization: TextCapitalization.sentences,
            decoration: const InputDecoration(labelText: 'Name', hintText: 'Diwali break'),
          ),
          const SizedBox(height: AppSpacing.md),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () async {
                    final picked = await _pick(_from);
                    if (picked == null) return;
                    setState(() {
                      _from = picked;
                      if (_to != null && _to!.isBefore(picked)) _to = picked;
                    });
                  },
                  icon: const Icon(Icons.event_rounded),
                  label: Text('From ${_short(_from)} ${_from.year}'),
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () async {
                    final picked = await _pick(_to ?? _from, first: _from);
                    if (picked != null) setState(() => _to = picked);
                  },
                  icon: const Icon(Icons.event_available_rounded),
                  label: Text(_to == null ? 'Till (one day)' : 'Till ${_short(_to!)} ${_to!.year}'),
                ),
              ),
            ],
          ),
          if (_to != null)
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(onPressed: () => setState(() => _to = null), child: const Text('Just one day')),
            ),
          const SizedBox(height: AppSpacing.base),
          FilledButton(
            onPressed: _saving ? null : _save,
            child: _saving
                ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                : const Text('Add holiday'),
          ),
        ],
      ),
    );
  }
}

/* -------------------------------------------------------------- skeleton */

class _CalendarSkeleton extends StatelessWidget {
  const _CalendarSkeleton();

  @override
  Widget build(BuildContext context) => SkeletonScope(
    child: ListView(
      physics: const NeverScrollableScrollPhysics(),
      padding: const EdgeInsets.all(AppSpacing.base),
      children: [
        const SkeletonBox(height: 340, radius: AppRadius.card),
        const SizedBox(height: AppSpacing.lg),
        const SkeletonBox(width: 120, height: 16),
        const SizedBox(height: AppSpacing.sm),
        for (var i = 0; i < 3; i++)
          const Padding(
            padding: EdgeInsets.only(bottom: AppSpacing.sm),
            child: SkeletonBox(height: 64, radius: AppRadius.card),
          ),
      ],
    ),
  );
}
