import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/design/tokens.dart';
import '../../../core/di/locator.dart';
import '../../../core/error/failure.dart';
import '../../../core/error/result.dart';
import '../../../core/network/api_client.dart';
import '../../../core/saved_reads/saved_reads.dart';
import '../../../core/widgets/saved_freshness.dart';
import '../../../core/widgets/screen_state.dart';
import '../../academic/domain/academic.dart' show isoDate;
import '../data/calendar_api.dart';

const _months = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const _weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/// A holiday is drawn in this colour; an event in [_eventColour].
const _holidayColour = AppColors.warning;
const _eventColour = AppColors.info;

String _short(DateTime d) => '${d.day} ${_months[d.month - 1].substring(0, 3)}';
String _span(HolidayRun r) => r.length == 1 ? _short(r.first) : '${_short(r.first)} – ${_short(r.last)}';
String _weekday(DateTime d) => _weekdays[d.weekday - 1];
String _hhmm(TimeOfDay t) => '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';
TimeOfDay _time(String hhmm) {
  final p = hhmm.split(':').map(int.parse).toList();
  return TimeOfDay(hour: p[0], minute: p[1]);
}

/// One line of a list: a break or an event, in date order.
sealed class _Entry {
  const _Entry();
  DateTime get date;
}

class _HolidayEntry extends _Entry {
  const _HolidayEntry(this.run);
  final HolidayRun run;
  @override
  DateTime get date => run.first;
}

class _EventEntry extends _Entry {
  const _EventEntry(this.event);
  final CalendarEvent event;
  @override
  DateTime get date => event.date;
}

List<_Entry> _merge(List<HolidayRun> runs, List<CalendarEvent> events) =>
    [...runs.map(_HolidayEntry.new), ...events.map(_EventEntry.new)]..sort((a, b) => a.date.compareTo(b.date));

/* ------------------------------------------------------------------ state */

class CalendarState {
  const CalendarState({
    required this.month,
    this.status = LoadStatus.loading,
    this.calendar,
    this.failure,
    this.updatedAt,
  });

  final DateTime month;
  final LoadStatus status;
  final AcademicCalendar? calendar;
  final Failure? failure;

  /// CR-1b (OD-CR-1): when this calendar was last saved.
  final DateTime? updatedAt;

  CalendarState copyWith({
    DateTime? month,
    LoadStatus? status,
    AcademicCalendar? calendar,
    Failure? failure,
    DateTime? updatedAt,
  }) => CalendarState(
    month: month ?? this.month,
    status: status ?? this.status,
    calendar: calendar ?? this.calendar,
    failure: failure,
    updatedAt: updatedAt ?? this.updatedAt,
  );
}

class CalendarCubit extends Cubit<CalendarState> {
  CalendarCubit(this._repository, DateTime today) : super(CalendarState(month: DateTime(today.year, today.month)));

  final CalendarRepository _repository;

  /// CR-1 (AD-9 amended again): opens on what was saved; the network is asked
  /// only when nothing was saved, or on an explicit refresh.
  Future<void> load({bool refresh = false}) async {
    if (!refresh && await fromSaved(_read)) return;
    return _read();
  }

  Future<void> _read() async {
    final result = await _repository.read();
    if (isClosed) return;
    await result.when(
      ok: (c) async {
        final updatedAt = await _repository.readSavedAt();
        if (isClosed) return;
        emit(state.copyWith(status: LoadStatus.success, calendar: c, updatedAt: updatedAt));
      },
      err: (f) async => emit(
        state.copyWith(status: state.calendar == null ? LoadStatus.failure : LoadStatus.success, failure: f),
      ),
    );
  }

  void showMonth(int delta) => emit(state.copyWith(month: DateTime(state.month.year, state.month.month + delta)));

  /// Null when saved, then the month shown is the one saved into.
  Future<Failure?> _saved(Future<Result<void>> write, DateTime day) async {
    final failure = (await write).failureOrNull;
    if (failure == null) {
      emit(state.copyWith(month: DateTime(day.year, day.month)));
      await _read();
    }
    return failure;
  }

  Future<Failure?> addHoliday({required DateTime from, DateTime? to, required String label}) {
    if (label.trim().isEmpty) {
      return Future.value(const Failure(code: FailureCode.validationFailed, message: 'Give the holiday a name.'));
    }
    return _saved(_repository.addHoliday(from: isoDate(from), to: to == null ? null : isoDate(to), label: label), from);
  }

  Future<Failure?> saveEvent(EventDraft draft, {String? id}) {
    if (draft.title.trim().isEmpty) {
      return Future.value(const Failure(code: FailureCode.validationFailed, message: 'Give the event a name.'));
    }
    return _saved(_repository.saveEvent(draft, id: id), dayOf(draft.onDate));
  }

  /// Removes every day of a break.
  Future<Failure?> removeHoliday(HolidayRun run) async {
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

  Future<Failure?> removeEvent(CalendarEvent event) async {
    final failure = (await _repository.removeEvent(event.id)).failureOrNull;
    await _read();
    return failure;
  }
}

/* ----------------------------------------------------------------- screen */

/// CAL-1, CAL-2: the college's academic calendar. Everyone sees the month with
/// its holidays and events, and what is coming; the College Admin adds, changes
/// and removes them here.
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
                  onPressed: () => _openSheet(context, state.month),
                  icon: const Icon(Icons.add_rounded),
                  label: const Text('Add'),
                )
              : null,
          body: switch (state.status) {
            LoadStatus.loading => const _CalendarSkeleton(),
            LoadStatus.failure => ErrorView(failure: state.failure!, onRetry: cubit.load),
            _ => RefreshIndicator(
                onRefresh: () => cubit.load(refresh: true),
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(AppSpacing.base, AppSpacing.sm, AppSpacing.base, 96),
                  children: [
                    if (state.updatedAt != null) SavedFreshness(at: state.updatedAt),
                    if (state.failure != null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                        child: Text(state.failure!.message, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                      ),
                    _MonthCard(calendar: calendar!, month: state.month, today: today, onMonth: cubit.showMonth),
                    const SizedBox(height: AppSpacing.lg),
                    _Entries(
                      title: 'In ${_months[state.month.month - 1]}',
                      entries: _merge(calendar.runsIn(state.month), calendar.eventsIn(state.month)),
                      empty: 'Nothing this month.',
                      canManage: canManage,
                    ),
                    const SizedBox(height: AppSpacing.lg),
                    _Entries(
                      title: 'Coming up',
                      entries: _merge(calendar.upcoming(today), calendar.upcomingEvents(today)).take(8).toList(),
                      empty: canManage
                          ? 'Nothing ahead. Add the holidays and events your college has announced.'
                          : 'Nothing announced yet.',
                      canManage: canManage,
                      countdownFrom: today,
                    ),
                  ],
                ),
              ),
          },
        );
      },
    );
  }

  Future<void> _openSheet(BuildContext context, DateTime month) async {
    final cubit = context.read<CalendarCubit>();
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => BlocProvider.value(
        value: cubit,
        child: _EntrySheet(initial: month.year == today.year && month.month == today.month ? today : month),
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
                  child: Text(
                    '${_months[month.month - 1]} ${month.year}',
                    textAlign: TextAlign.center,
                    style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
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
                  events: calendar.eventsOn(day),
                  isToday: sameDay(day, today),
                );
              },
            ),
            const SizedBox(height: AppSpacing.sm),
            Wrap(
              spacing: AppSpacing.base,
              runSpacing: AppSpacing.xs,
              children: const [
                _Legend(color: _holidayColour, label: 'Holiday'),
                _Legend(color: _eventColour, label: 'Event'),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _DayCell extends StatelessWidget {
  const _DayCell({required this.day, required this.holiday, required this.events, required this.isToday});

  final DateTime day;
  final CalendarHoliday? holiday;
  final List<CalendarEvent> events;
  final bool isToday;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final isHoliday = holiday != null;
    final names = [if (isHoliday) holiday!.label, for (final e in events) '${e.title} (${e.when})'];
    final cell = Container(
      margin: const EdgeInsets.all(2),
      decoration: BoxDecoration(
        color: isHoliday ? _holidayColour.withValues(alpha: 0.18) : Colors.transparent,
        borderRadius: BorderRadius.circular(AppRadius.input),
        border: isToday ? Border.all(color: scheme.primary, width: 1.5) : null,
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            '${day.day}',
            style: theme.textTheme.bodyMedium?.copyWith(
              fontWeight: isHoliday || isToday ? FontWeight.w700 : FontWeight.w400,
              color: isHoliday ? _holidayColour : (day.weekday == DateTime.sunday ? scheme.onSurfaceVariant : null),
            ),
          ),
          if (events.isNotEmpty)
            Container(
              width: 6,
              height: 6,
              margin: const EdgeInsets.only(top: 2),
              decoration: const BoxDecoration(color: _eventColour, shape: BoxShape.circle),
            ),
        ],
      ),
    );
    return Semantics(
      label: '${day.day} ${_months[day.month - 1]}${names.isEmpty ? '' : ', ${names.join(', ')}'}${isToday ? ', today' : ''}',
      excludeSemantics: true,
      child: names.isEmpty ? cell : Tooltip(message: names.join('\n'), triggerMode: TooltipTriggerMode.tap, child: cell),
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

class _Entries extends StatelessWidget {
  const _Entries({required this.title, required this.entries, required this.empty, required this.canManage, this.countdownFrom});

  final String title;
  final List<_Entry> entries;
  final String empty;
  final bool canManage;

  /// When set, each line says how far away it is.
  final DateTime? countdownFrom;

  String? _until(DateTime first, DateTime last) {
    final today = countdownFrom;
    if (today == null) return null;
    final days = first.difference(today).inDays;
    if (days <= 0) return last.isBefore(today) ? null : (days == 0 && sameDay(first, today) ? 'Today' : 'Now');
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
        if (entries.isEmpty)
          Text(empty, style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant))
        else
          for (final entry in entries)
            switch (entry) {
              _HolidayEntry(:final run) => _Line(
                  colour: _holidayColour,
                  date: run.first,
                  title: run.label,
                  detail: '${_weekday(run.first)}, ${_span(run)}${run.length > 1 ? ' · ${run.length} days' : ''} · Holiday',
                  until: _until(run.first, run.last),
                  removeLabel: canManage ? 'Remove ${run.label}' : null,
                  onRemove: () => _confirmRemoveHoliday(context, run),
                ),
              _EventEntry(:final event) => _Line(
                  colour: _eventColour,
                  date: event.date,
                  title: event.title,
                  detail: '${_weekday(event.date)}, ${_short(event.date)} · ${event.when}'
                      '${event.note == null ? '' : ' · ${event.note}'}',
                  until: _until(event.date, event.date),
                  removeLabel: canManage ? 'Remove ${event.title}' : null,
                  onRemove: () => _confirmRemoveEvent(context, event),
                  onTap: canManage ? () => _editEvent(context, event) : null,
                ),
            },
      ],
    );
  }

  Future<void> _editEvent(BuildContext context, CalendarEvent event) async {
    final cubit = context.read<CalendarCubit>();
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => BlocProvider.value(value: cubit, child: _EntrySheet(initial: event.date, event: event)),
    );
  }

  Future<bool> _confirm(BuildContext context, String title, String body) async =>
      await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text(title),
          content: Text(body),
          actions: [
            TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
            TextButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Remove')),
          ],
        ),
      ) ==
      true;

  Future<void> _confirmRemoveHoliday(BuildContext context, HolidayRun r) async {
    final cubit = context.read<CalendarCubit>();
    final messenger = ScaffoldMessenger.of(context);
    if (!await _confirm(context, 'Remove ${r.label}?',
        '${_span(r)} becomes a working day again. Classes already generated around it are not added back; '
        'generate the timetable again if they are needed.')) {
      return;
    }
    final failure = await cubit.removeHoliday(r);
    messenger.showSnackBar(SnackBar(content: Text(failure?.message ?? '${r.label} removed')));
  }

  Future<void> _confirmRemoveEvent(BuildContext context, CalendarEvent e) async {
    final cubit = context.read<CalendarCubit>();
    final messenger = ScaffoldMessenger.of(context);
    if (!await _confirm(context, 'Remove ${e.title}?', 'It is taken off everyone\'s calendar.')) return;
    final failure = await cubit.removeEvent(e);
    messenger.showSnackBar(SnackBar(content: Text(failure?.message ?? '${e.title} removed')));
  }
}

class _Line extends StatelessWidget {
  const _Line({
    required this.colour,
    required this.date,
    required this.title,
    required this.detail,
    required this.until,
    required this.removeLabel,
    required this.onRemove,
    this.onTap,
  });

  final Color colour;
  final DateTime date;
  final String title;
  final String detail;
  final String? until;
  final String? removeLabel;
  final VoidCallback onRemove;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      margin: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: ListTile(
        onTap: onTap,
        leading: Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(color: colour.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(AppRadius.card)),
          alignment: Alignment.center,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('${date.day}',
                  style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800, color: colour, height: 1)),
              Text(_months[date.month - 1].substring(0, 3), style: theme.textTheme.labelSmall?.copyWith(color: colour)),
            ],
          ),
        ),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text('$detail${until == null ? '' : ' · $until'}'),
        trailing: removeLabel == null
            ? null
            : IconButton(tooltip: removeLabel, icon: const Icon(Icons.delete_outline_rounded), onPressed: onRemove),
      ),
    );
  }
}

/* ------------------------------------------------------------ add sheet */

enum _Kind { holiday, event }

/// Adds a holiday or an event, or (with [event]) changes that event.
class _EntrySheet extends StatefulWidget {
  const _EntrySheet({required this.initial, this.event});
  final DateTime initial;
  final CalendarEvent? event;

  @override
  State<_EntrySheet> createState() => _EntrySheetState();
}

class _EntrySheetState extends State<_EntrySheet> {
  late _Kind _kind = widget.event == null ? _Kind.holiday : _Kind.event;
  late final _name = TextEditingController(text: widget.event?.title ?? '');
  late final _note = TextEditingController(text: widget.event?.note ?? '');
  late DateTime _from = widget.event?.date ?? widget.initial;
  DateTime? _to;
  late bool _allDay = widget.event?.allDay ?? true;
  late TimeOfDay _starts = widget.event?.startsAt == null ? const TimeOfDay(hour: 11, minute: 0) : _time(widget.event!.startsAt!);
  late TimeOfDay _ends = widget.event?.endsAt == null ? const TimeOfDay(hour: 14, minute: 0) : _time(widget.event!.endsAt!);
  bool _saving = false;
  String? _error;

  bool get _editing => widget.event != null;

  @override
  void dispose() {
    _name.dispose();
    _note.dispose();
    super.dispose();
  }

  Future<DateTime?> _pickDate(DateTime initial, {DateTime? first}) => showDatePicker(
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
    final cubit = context.read<CalendarCubit>();
    final failure = _kind == _Kind.holiday
        ? await cubit.addHoliday(from: _from, to: _to, label: _name.text)
        : await cubit.saveEvent(
            EventDraft(
              title: _name.text,
              onDate: isoDate(_from),
              startsAt: _allDay ? null : _hhmm(_starts),
              endsAt: _allDay ? null : _hhmm(_ends),
              note: _note.text,
            ),
            id: widget.event?.id,
          );
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
    final holiday = _kind == _Kind.holiday;
    return Padding(
      padding: EdgeInsets.fromLTRB(
        AppSpacing.base, 0, AppSpacing.base, MediaQuery.viewInsetsOf(context).bottom + AppSpacing.xl),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(_editing ? 'Change the event' : 'Add to the calendar',
                style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: AppSpacing.md),
            if (!_editing) ...[
              SegmentedButton<_Kind>(
                segments: const [
                  ButtonSegment(value: _Kind.holiday, label: Text('Holiday'), icon: Icon(Icons.beach_access_rounded)),
                  ButtonSegment(value: _Kind.event, label: Text('Event'), icon: Icon(Icons.celebration_rounded)),
                ],
                selected: {_kind},
                onSelectionChanged: (s) => setState(() => _kind = s.first),
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(
                holiday ? 'No classes on these days.' : 'Announced to everyone; classes go on as usual.',
                style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
              ),
              const SizedBox(height: AppSpacing.md),
            ],
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                child: Text(_error!, style: TextStyle(color: theme.colorScheme.error)),
              ),
            TextField(
              controller: _name,
              autofocus: !_editing,
              textCapitalization: TextCapitalization.sentences,
              decoration: InputDecoration(labelText: 'Name', hintText: holiday ? 'Diwali break' : 'Farewell party'),
            ),
            const SizedBox(height: AppSpacing.md),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () async {
                      final picked = await _pickDate(_from);
                      if (picked == null) return;
                      setState(() {
                        _from = picked;
                        if (_to != null && _to!.isBefore(picked)) _to = picked;
                      });
                    },
                    icon: const Icon(Icons.event_rounded),
                    label: Text('${holiday ? 'From ' : ''}${_short(_from)} ${_from.year}'),
                  ),
                ),
                if (holiday) ...[
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () async {
                        final picked = await _pickDate(_to ?? _from, first: _from);
                        if (picked != null) setState(() => _to = picked);
                      },
                      icon: const Icon(Icons.event_available_rounded),
                      label: Text(_to == null ? 'Till (one day)' : 'Till ${_short(_to!)} ${_to!.year}'),
                    ),
                  ),
                ],
              ],
            ),
            if (holiday && _to != null)
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(onPressed: () => setState(() => _to = null), child: const Text('Just one day')),
              ),
            if (!holiday) ...[
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('All day'),
                value: _allDay,
                onChanged: (v) => setState(() => _allDay = v),
              ),
              if (!_allDay)
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () async {
                          final t = await showTimePicker(context: context, initialTime: _starts);
                          if (t != null) setState(() => _starts = t);
                        },
                        child: Text('From ${twelveHour(_hhmm(_starts))}'),
                      ),
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () async {
                          final t = await showTimePicker(context: context, initialTime: _ends);
                          if (t != null) setState(() => _ends = t);
                        },
                        child: Text('To ${twelveHour(_hhmm(_ends))}'),
                      ),
                    ),
                  ],
                ),
              const SizedBox(height: AppSpacing.md),
              TextField(
                controller: _note,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(labelText: 'Note, optional', hintText: 'Main auditorium'),
              ),
            ],
            const SizedBox(height: AppSpacing.base),
            FilledButton(
              onPressed: _saving ? null : _save,
              child: _saving
                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                  : Text(_editing ? 'Save changes' : (holiday ? 'Add holiday' : 'Add event')),
            ),
          ],
        ),
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
