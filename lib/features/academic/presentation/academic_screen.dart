import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/design/tokens.dart';
import '../../../core/di/locator.dart';
import '../../../core/error/failure.dart';
import '../../../core/session/authority.dart';
import '../../../core/widgets/screen_state.dart';
import '../../../core/widgets/status_chip.dart';
import '../../organisation/domain/org_unit.dart';
import '../../organisation/presentation/organisation_cubit.dart' show suggestCode;
import '../../organisation/presentation/organisation_screen.dart' show showArchiveForm;
import '../data/academic_api.dart';
import '../domain/academic.dart';
import 'academic_cubit.dart';

/// ADM-3 (AD-81): programs and the academic calendar on the phone. Two tabs,
/// because they are set up at different times of year by the same person.
/// Each action is present only with its permission; the server checks again.
class AcademicScreen extends StatelessWidget {
  const AcademicScreen({super.key, this.authority, this.repository, this.today});

  final Authority? authority;

  /// Tests supply their own; the app uses the server.
  final AcademicRepository? repository;
  final DateTime? today;

  @override
  Widget build(BuildContext context) {
    final calendar = authority?.can('section.read') ?? false;
    return BlocProvider(
      create: (_) => AcademicCubit(repository ?? locator<AcademicRepository>(), calendar: calendar)..load(),
      child: _AcademicView(
        canPrograms: authority?.can('department.manage') ?? false,
        calendar: calendar,
        canCalendar: authority?.can('term.manage') ?? false,
        today: today ?? DateTime.now(),
      ),
    );
  }
}

class _AcademicView extends StatelessWidget {
  const _AcademicView({required this.canPrograms, required this.calendar, required this.canCalendar, required this.today});

  final bool canPrograms;
  final bool calendar;
  final bool canCalendar;
  final DateTime today;

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<AcademicCubit, AcademicState>(
      builder: (context, state) {
        final cubit = context.read<AcademicCubit>();
        final body = switch (state.status) {
          LoadStatus.loading => const SkeletonList(rows: 5),
          LoadStatus.failure => ErrorView(failure: state.failure!, onRetry: () => cubit.load()),
          _ => null,
        };
        if (!calendar) {
          return Scaffold(
            appBar: AppBar(title: const Text('Programs')),
            body: body ?? _ProgramsTab(state: state, canManage: canPrograms),
          );
        }
        return DefaultTabController(
          length: 2,
          child: Scaffold(
            appBar: AppBar(
              title: const Text('Academic setup'),
              bottom: const TabBar(tabs: [Tab(text: 'Programs'), Tab(text: 'Calendar')]),
            ),
            body: body ??
                TabBarView(
                  children: [
                    _ProgramsTab(state: state, canManage: canPrograms),
                    _CalendarTab(state: state, canManage: canCalendar, today: today),
                  ],
                ),
          ),
        );
      },
    );
  }
}

void _say(BuildContext context, String message) =>
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));

/* ------------------------------------------------------------------ programs */

class _ProgramsTab extends StatelessWidget {
  const _ProgramsTab({required this.state, required this.canManage});

  final AcademicState state;
  final bool canManage;

  Future<void> _add(BuildContext context) async {
    final cubit = context.read<AcademicCubit>();
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      useSafeArea: true,
      builder: (_) => _ProgramSheet(departments: state.departments, submit: cubit.createProgram),
    );
    if (saved == true && context.mounted) _say(context, 'Program added');
  }

  Future<void> _archive(BuildContext context, Program program) async {
    final cubit = context.read<AcademicCubit>();
    final done = await showArchiveForm(
      context,
      title: 'Archive ${program.name}?',
      body: 'No new students or sections can use it. Its records stay.',
      submit: (reason) => cubit.archiveProgram(program.id, reason),
    );
    if (done && context.mounted) _say(context, '${program.name} archived');
  }

  @override
  Widget build(BuildContext context) {
    final cubit = context.read<AcademicCubit>();
    final theme = Theme.of(context);
    final byDepartment = <String, List<Program>>{};
    for (final p in state.programs) {
      byDepartment.putIfAbsent(p.departmentName, () => []).add(p);
    }
    final noDepartments = state.departments.isEmpty;

    return Scaffold(
      floatingActionButton: canManage && !noDepartments
          ? FloatingActionButton.extended(
              onPressed: () => _add(context),
              icon: const Icon(Icons.add_rounded),
              label: const Text('Add program'),
            )
          : null,
      body: RefreshIndicator(
        onRefresh: () => cubit.load(refresh: true),
        child: state.programs.isEmpty
            ? ListView(
                children: [
                  SizedBox(height: MediaQuery.sizeOf(context).height * 0.15),
                  EmptyView(
                    title: 'No programs yet',
                    body: noDepartments
                        ? 'Add a department in Organisation first; every program belongs to one.'
                        : canManage
                            ? 'Add the programs your college offers, such as B.Tech Computer Science.'
                            : 'Your college administrator adds programs.',
                    icon: Icons.school_outlined,
                  ),
                ],
              )
            : ListView(
                padding: const EdgeInsets.only(bottom: 88),
                children: [
                  for (final entry in byDepartment.entries) ...[
                    Padding(
                      padding: const EdgeInsets.fromLTRB(AppSpacing.base, AppSpacing.base, AppSpacing.base, AppSpacing.xs),
                      child: Text(
                        entry.key,
                        style: theme.textTheme.labelLarge?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                      ),
                    ),
                    for (final program in entry.value)
                      ListTile(
                        title: Text(program.name),
                        subtitle: Text(
                          [program.code, if (program.award != null) program.award!, program.durationLabel].join(' · '),
                        ),
                        trailing: canManage
                            ? PopupMenuButton<String>(
                                tooltip: 'More for ${program.name}',
                                onSelected: (_) => _archive(context, program),
                                itemBuilder: (_) => const [PopupMenuItem(value: 'archive', child: Text('Archive'))],
                              )
                            : null,
                      ),
                  ],
                ],
              ),
      ),
    );
  }
}

/// Adding a program is a bottom sheet on the phone: the list stays in place
/// behind it, the form rises above the keyboard, and the actions sit where the
/// thumb is.
class _ProgramSheet extends StatefulWidget {
  const _ProgramSheet({required this.departments, required this.submit});

  final List<Department> departments;
  final Future<Failure?> Function(ProgramInput) submit;

  @override
  State<_ProgramSheet> createState() => _ProgramSheetState();
}

class _ProgramSheetState extends State<_ProgramSheet> {
  late String _departmentId = widget.departments.first.id;
  final _name = TextEditingController();
  final _code = TextEditingController();
  final _award = TextEditingController();
  final _years = TextEditingController(text: '4');
  String _termType = 'semester';
  bool _codeEdited = false;
  bool _busy = false;
  Failure? _failure;

  @override
  void dispose() {
    _name.dispose();
    _code.dispose();
    _award.dispose();
    _years.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final years = num.tryParse(_years.text.trim());
    String? local;
    if (_name.text.trim().length < 2) local = 'Enter the program name.';
    if (_code.text.trim().isEmpty) local ??= 'Enter a short code.';
    if (years == null || years <= 0 || years > 10) local ??= 'Duration is between 1 and 10 years.';
    if (local != null) {
      return setState(() => _failure = Failure(code: FailureCode.validationFailed, message: local!));
    }
    setState(() {
      _busy = true;
      _failure = null;
    });
    final failure = await widget.submit(ProgramInput(
      departmentId: _departmentId,
      name: _name.text,
      code: _code.text,
      award: _award.text,
      durationYears: years!,
      termType: _termType,
    ));
    if (!mounted) return;
    if (failure == null) return Navigator.of(context).pop(true);
    setState(() {
      _busy = false;
      _failure = failure;
    });
  }

  @override
  Widget build(BuildContext context) {
    final errors = _failure?.fieldErrors ?? const <String, String>{};
    return Padding(
      // Lifts the whole sheet above the keyboard.
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(AppSpacing.xl, 0, AppSpacing.xl, AppSpacing.xl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Add a program', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: AppSpacing.base),
            if (_failure != null && errors.isEmpty)
              Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.md),
                child: Text(_failure!.message, style: TextStyle(color: Theme.of(context).colorScheme.error)),
              ),
            DropdownButtonFormField<String>(
              initialValue: _departmentId,
              isExpanded: true,
              decoration: InputDecoration(labelText: 'Department', errorText: errors['department_id']),
              items: [
                for (final d in widget.departments) DropdownMenuItem(value: d.id, child: Text(d.name, overflow: TextOverflow.ellipsis)),
              ],
              onChanged: (v) => setState(() => _departmentId = v ?? _departmentId),
            ),
            const SizedBox(height: AppSpacing.base),
            TextField(
              controller: _name,
              autofocus: true,
              textCapitalization: TextCapitalization.words,
              decoration: InputDecoration(labelText: 'Name', hintText: 'B.Tech Computer Science', errorText: errors['name']),
              onChanged: (v) {
                if (!_codeEdited) _code.text = suggestCode(v);
              },
            ),
            const SizedBox(height: AppSpacing.base),
            TextField(
              controller: _code,
              autocorrect: false,
              decoration: InputDecoration(labelText: 'Short code', errorText: errors['code']),
              onChanged: (_) => _codeEdited = true,
            ),
            const SizedBox(height: AppSpacing.base),
            TextField(
              controller: _award,
              decoration: InputDecoration(labelText: 'Award (optional)', hintText: 'B.Tech', errorText: errors['award']),
            ),
            const SizedBox(height: AppSpacing.base),
            TextField(
              controller: _years,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: InputDecoration(labelText: 'Duration in years', errorText: errors['duration_years']),
            ),
            const SizedBox(height: AppSpacing.base),
            SegmentedButton<String>(
              segments: const [
                ButtonSegment(value: 'semester', label: Text('Semesters')),
                ButtonSegment(value: 'annual', label: Text('Annual')),
              ],
              selected: {_termType},
              onSelectionChanged: (s) => setState(() => _termType = s.first),
            ),
            const SizedBox(height: AppSpacing.xl),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: _busy ? null : () => Navigator.of(context).pop(false),
                    child: const Text('Cancel'),
                  ),
                ),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: FilledButton(
                    onPressed: _busy ? null : _save,
                    child: _busy
                        ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                        : const Text('Add program'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/* ------------------------------------------------------------------ calendar */

class _CalendarTab extends StatelessWidget {
  const _CalendarTab({required this.state, required this.canManage, required this.today});

  final AcademicState state;
  final bool canManage;
  final DateTime today;

  Future<void> _addYear(BuildContext context) async {
    final cubit = context.read<AcademicCubit>();
    final s = suggestYear(today, state.years);
    final saved = await showDialog<bool>(
      context: context,
      builder: (_) => _PeriodDialog(
        title: 'Add an academic year',
        submitLabel: 'Add year',
        name: s.name,
        startsOn: s.startsOn,
        endsOn: s.endsOn,
        offerCurrent: true,
        submit: (name, from, to, current) => cubit.createYear(name, from, to, current),
      ),
    );
    if (saved == true && context.mounted) _say(context, 'Academic year added');
  }

  Future<void> _addTerm(BuildContext context, AcademicYear year) async {
    final cubit = context.read<AcademicCubit>();
    final s = suggestTerm(year, state.termsOf(year.id));
    final saved = await showDialog<bool>(
      context: context,
      builder: (_) => _PeriodDialog(
        title: 'Add a term to ${year.name}',
        submitLabel: 'Add term',
        name: s.name,
        startsOn: s.startsOn,
        endsOn: s.endsOn,
        offerCurrent: false,
        submit: (name, from, to, _) => cubit.createTerm(year.id, s.sequence, name, from, to),
      ),
    );
    if (saved == true && context.mounted) _say(context, 'Term added');
  }

  @override
  Widget build(BuildContext context) {
    final cubit = context.read<AcademicCubit>();
    final theme = Theme.of(context);
    return Scaffold(
      floatingActionButton: canManage
          ? FloatingActionButton.extended(
              onPressed: () => _addYear(context),
              icon: const Icon(Icons.add_rounded),
              label: const Text('Add academic year'),
            )
          : null,
      body: RefreshIndicator(
        onRefresh: () => cubit.load(refresh: true),
        child: state.years.isEmpty
            ? ListView(
                children: [
                  SizedBox(height: MediaQuery.sizeOf(context).height * 0.15),
                  EmptyView(
                    title: 'No academic years yet',
                    body: canManage
                        ? 'Add this academic year, then its terms. Sections and the timetable need them.'
                        : 'Your college administrator sets up the calendar.',
                    icon: Icons.calendar_month_outlined,
                  ),
                ],
              )
            : ListView(
                padding: const EdgeInsets.fromLTRB(AppSpacing.base, AppSpacing.base, AppSpacing.base, 88),
                children: [
                  for (final year in state.years)
                    Card(
                      margin: const EdgeInsets.only(bottom: AppSpacing.md),
                      child: Padding(
                        padding: const EdgeInsets.all(AppSpacing.md),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: Text(year.name, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                                ),
                                if (year.isCurrent) const StatusChip(label: 'Current', tone: ChipTone.success),
                              ],
                            ),
                            Text(
                              '${shortDate(year.startsOn)} – ${shortDate(year.endsOn)}',
                              style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                            ),
                            const Divider(height: AppSpacing.lg),
                            if (state.termsOf(year.id).isEmpty)
                              Text('No terms yet', style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                            for (final term in state.termsOf(year.id))
                              Padding(
                                padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
                                child: Row(
                                  children: [
                                    Expanded(child: Text(term.name)),
                                    Text(
                                      '${shortDate(term.startsOn)} – ${shortDate(term.endsOn)}',
                                      style: theme.textTheme.bodySmall,
                                    ),
                                  ],
                                ),
                              ),
                            if (canManage)
                              Align(
                                alignment: Alignment.centerLeft,
                                child: TextButton.icon(
                                  onPressed: () => _addTerm(context, year),
                                  icon: const Icon(Icons.add_rounded),
                                  label: const Text('Add term'),
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                ],
              ),
      ),
    );
  }
}

/// A named period with a start and end date, filled with sensible defaults.
class _PeriodDialog extends StatefulWidget {
  const _PeriodDialog({
    required this.title,
    required this.submitLabel,
    required this.name,
    required this.startsOn,
    required this.endsOn,
    required this.offerCurrent,
    required this.submit,
  });

  final String title;
  final String submitLabel;
  final String name;
  final DateTime startsOn;
  final DateTime endsOn;
  final bool offerCurrent;
  final Future<Failure?> Function(String name, DateTime from, DateTime to, bool current) submit;

  @override
  State<_PeriodDialog> createState() => _PeriodDialogState();
}

class _PeriodDialogState extends State<_PeriodDialog> {
  late final _name = TextEditingController(text: widget.name);
  late DateTime _from = widget.startsOn;
  late DateTime _to = widget.endsOn;
  bool _current = true;
  bool _busy = false;
  Failure? _failure;

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _pick(bool start) async {
    final picked = await showDatePicker(
      context: context,
      initialDate: start ? _from : _to,
      firstDate: DateTime(2000),
      lastDate: DateTime(2100),
    );
    if (picked != null) setState(() => start ? _from = picked : _to = picked);
  }

  Future<void> _save() async {
    String? local;
    if (_name.text.trim().isEmpty) local = 'Enter a name.';
    if (!_to.isAfter(_from)) local ??= 'The end date must be after the start date.';
    if (local != null) {
      return setState(() => _failure = Failure(code: FailureCode.validationFailed, message: local!));
    }
    setState(() {
      _busy = true;
      _failure = null;
    });
    final failure = await widget.submit(_name.text, _from, _to, widget.offerCurrent && _current);
    if (!mounted) return;
    if (failure == null) return Navigator.of(context).pop(true);
    setState(() {
      _busy = false;
      _failure = failure;
    });
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.title),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (_failure != null)
              Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.md),
                child: Text(
                  {_failure!.message, ..._failure!.fieldErrors.values}.join('\n'),
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
              ),
            TextField(controller: _name, decoration: const InputDecoration(labelText: 'Name')),
            const SizedBox(height: AppSpacing.base),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.event_rounded),
              title: const Text('Starts'),
              subtitle: Text(shortDate(_from)),
              onTap: () => _pick(true),
            ),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.event_available_rounded),
              title: const Text('Ends'),
              subtitle: Text(shortDate(_to)),
              onTap: () => _pick(false),
            ),
            if (widget.offerCurrent)
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Make this the current year'),
                value: _current,
                onChanged: (v) => setState(() => _current = v),
              ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: _busy ? null : () => Navigator.of(context).pop(false), child: const Text('Cancel')),
        FilledButton(
          onPressed: _busy ? null : _save,
          child: _busy
              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
              : Text(widget.submitLabel),
        ),
      ],
    );
  }
}
