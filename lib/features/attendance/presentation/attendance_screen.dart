import '../../../core/di/outbox_setup.dart';
import '../../../core/widgets/outbox_status.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/design/tokens.dart';
import '../../../core/di/locator.dart';
import '../../../core/widgets/screen_state.dart';
import '../domain/attendance_repository.dart';
import '../domain/attendance_sheet.dart';
import 'attendance_cubit.dart';

/// Taking attendance, standing up, in front of sixty people.
///
/// Everything here serves that: mark all present in one tap, then tap the
/// exceptions; the whole class saves in one request; and the screen says plainly
/// how many marks are unsaved so a teacher never walks away believing they sent
/// something they did not.
///
/// Deliberately not a table narrowed to a phone. There is no column layout, no
/// horizontal scrolling, and no per-row animation: a list of sixty rows that
/// animates is a list that drops frames while somebody is trying to use it.
class AttendanceScreen extends StatelessWidget {
  const AttendanceScreen({super.key, required this.sessionId});

  final String sessionId;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => AttendanceCubit(locator<AttendanceRepository>(), sessionId, offline: offlineWrites)..load(),
      child: const _AttendanceView(),
    );
  }
}

class _AttendanceView extends StatelessWidget {
  const _AttendanceView();

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<AttendanceCubit, AttendanceState>(
      builder: (context, state) {
        final cubit = context.read<AttendanceCubit>();
        final draft = state.draft;

        return PopScope(
          // Leaving with unsaved marks is the one mistake this screen must not
          // let somebody make silently.
          canPop: !(draft?.isDirty ?? false),
          onPopInvokedWithResult: (didPop, _) {
            if (!didPop) _confirmDiscard(context, cubit);
          },
          child: Scaffold(
            appBar: AppBar(
              title: Text(draft?.sheet.session.courseCode ?? 'Attendance'),
              bottom: state.status == LoadStatus.refreshing
                  ? const PreferredSize(
                      preferredSize: Size.fromHeight(2),
                      child: LinearProgressIndicator(minHeight: 2),
                    )
                  : null,
            ),
            body: switch (state.status) {
              LoadStatus.loading => const SkeletonList(rows: 8),
              LoadStatus.failure => ErrorView(failure: state.failure!, onRetry: () => cubit.load()),
              LoadStatus.empty => const EmptyView(
                title: 'Nobody enrolled',
                body:
                    'No student was enrolled in this course on the day of this class, '
                    'so there is nobody to mark.',
                icon: Icons.groups_outlined,
              ),
              _ => _Register(state: state, cubit: cubit),
            },
            bottomNavigationBar: draft == null || state.status == LoadStatus.loading
                ? null
                : _ActionBar(state: state, cubit: cubit),
          ),
        );
      },
    );
  }

  Future<void> _confirmDiscard(BuildContext context, AttendanceCubit cubit) async {
    final draft = cubit.state.draft;
    if (draft == null) return;
    final leave = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Leave without saving?'),
        content: Text(
          '${draft.pendingCount} ${draft.pendingCount == 1 ? 'mark' : 'marks'} '
          'have not been sent. They will be lost.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Keep marking'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Discard'),
          ),
        ],
      ),
    );
    if (leave == true && context.mounted) Navigator.of(context).pop();
  }
}

class _Register extends StatefulWidget {
  const _Register({required this.state, required this.cubit});

  final AttendanceState state;
  final AttendanceCubit cubit;

  @override
  State<_Register> createState() => _RegisterState();
}

class _RegisterState extends State<_Register> {
  final _searchController = TextEditingController();
  String _query = '';

  /// Below this, searching is slower than scrolling.
  static const searchThreshold = 25;

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final draft = widget.state.draft!;
    final sheet = draft.sheet;

    final query = _query.trim().toLowerCase();
    final students = query.isEmpty
        ? sheet.students
        : sheet.students
              .where(
                (s) =>
                    s.fullName.toLowerCase().contains(query) ||
                    s.enrolmentNumber.toLowerCase().contains(query),
              )
              .toList();

    return Column(
      children: [
        _Header(draft: draft),

        OutboxStatusLine(
          items: widget.state.waiting,
          onSendNow: widget.cubit.sendNow,
          onRetry: widget.cubit.retry,
          onDiscard: (item) async {
            if (await confirmDiscard(context, item)) await widget.cubit.discard(item);
          },
        ),

        if (widget.state.failure != null)
          Container(
            width: double.infinity,
            color: scheme.errorContainer,
            padding: const EdgeInsets.all(AppSpacing.md),
            child: Text(
              widget.state.failure!.message,
              style: TextStyle(color: scheme.onErrorContainer, fontSize: 13),
            ),
          ),

        if (sheet.students.length >= searchThreshold)
          Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.base,
              vertical: AppSpacing.sm,
            ),
            child: TextField(
              controller: _searchController,
              decoration: const InputDecoration(
                hintText: 'Find a student',
                prefixIcon: Icon(Icons.search_rounded),
                isDense: true,
              ),
              onChanged: (value) => setState(() => _query = value),
            ),
          ),

        if (sheet.canMark)
          Padding(
            padding: const EdgeInsets.fromLTRB(AppSpacing.base, 0, AppSpacing.base, AppSpacing.sm),
            child: Row(
              children: [
                // The common case in a full classroom, and the reason this
                // screen is faster than paper.
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: widget.state.busy
                        ? null
                        : () => widget.cubit.markAll(AttendanceMark.present),
                    icon: const Icon(Icons.done_all_rounded, size: 18),
                    label: const Text('All present'),
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                OutlinedButton(
                  onPressed: widget.state.busy
                      ? null
                      : () => widget.cubit.markAll(AttendanceMark.absent),
                  child: const Text('All absent'),
                ),
              ],
            ),
          ),

        Expanded(
          child: students.isEmpty
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(AppSpacing.xl),
                    child: Text(
                      'Nobody matches "$_query".',
                      style: TextStyle(color: scheme.onSurfaceVariant),
                    ),
                  ),
                )
              : ListView.separated(
                  // A builder, so a roster of two hundred costs the same as one
                  // of twenty.
                  itemCount: students.length,
                  separatorBuilder: (_, _) => const Divider(height: 1),
                  itemBuilder: (context, index) {
                    final student = students[index];
                    return _StudentRow(
                      student: student,
                      mark: draft.markFor(student.studentId),
                      enabled: sheet.canMark && !widget.state.busy,
                      onMark: (mark) => widget.cubit.mark(student.studentId, mark),
                    );
                  },
                ),
        ),
      ],
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.draft});

  final SheetDraft draft;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final session = draft.sheet.session;
    final counts = draft.counts;

    return Container(
      width: double.infinity,
      color: scheme.surfaceContainerHighest,
      padding: const EdgeInsets.all(AppSpacing.base),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(session.courseTitle, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: AppSpacing.xs),
          Text(
            '${session.sectionLabel} · ${session.date} · ${session.startsAt}'
            '${session.roomCode == null ? '' : ' · ${session.roomCode}'}',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            draft.sheet.isSubmitted
                ? 'Submitted${draft.sheet.submittedBy == null ? '' : ' by ${draft.sheet.submittedBy}'}'
                : '${counts[AttendanceMark.present]} present · '
                      '${counts[AttendanceMark.absent]} absent · '
                      '${draft.unmarkedCount} not marked',
            style: Theme.of(context).textTheme.bodyMedium,
          ),
        ],
      ),
    );
  }
}

/// One student, one tap.
///
/// Four states in a row of segments rather than a menu, because a teacher
/// marking a lab of sixty cannot afford a second tap to reach "late". The letter
/// is what fits; the full word is the accessibility label.
class _StudentRow extends StatelessWidget {
  const _StudentRow({
    required this.student,
    required this.mark,
    required this.enabled,
    required this.onMark,
  });

  final RosterStudent student;
  final AttendanceMark? mark;
  final bool enabled;
  final ValueChanged<AttendanceMark> onMark;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.base, vertical: AppSpacing.sm),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  student.fullName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodyLarge,
                ),
                Text(
                  student.enrolmentNumber,
                  style: Theme.of(context).textTheme.bodySmall
                      ?.copyWith(color: scheme.onSurfaceVariant),
                ),
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          for (final option in AttendanceMark.values)
            _MarkButton(
              option: option,
              selected: mark == option,
              enabled: enabled,
              studentName: student.fullName,
              onTap: () => onMark(option),
            ),
        ],
      ),
    );
  }
}

class _MarkButton extends StatelessWidget {
  const _MarkButton({
    required this.option,
    required this.selected,
    required this.enabled,
    required this.studentName,
    required this.onTap,
  });

  final AttendanceMark option;
  final bool selected;
  final bool enabled;
  final String studentName;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final colour = switch (option) {
      AttendanceMark.present => scheme.primary,
      AttendanceMark.absent => scheme.error,
      AttendanceMark.late => scheme.tertiary,
      AttendanceMark.excused => scheme.secondary,
    };

    return Semantics(
      button: true,
      selected: selected,
      label: '${option.label}, $studentName',
      child: Padding(
        padding: const EdgeInsets.only(left: AppSpacing.xs),
        child: InkWell(
          onTap: enabled ? onTap : null,
          borderRadius: BorderRadius.circular(AppRadius.pill),
          // 40x40 is the smallest comfortable touch target, and four of them
          // plus a name still fit the narrowest phone.
          child: AnimatedContainer(
            duration: AppMotion.scaled(context, AppMotion.micro),
            curve: AppMotion.sharp,
            width: 40,
            height: 40,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: selected ? colour : Colors.transparent,
              border: Border.all(color: selected ? colour : scheme.outlineVariant),
              borderRadius: BorderRadius.circular(AppRadius.pill),
            ),
            child: Text(
              option.letter,
              style: TextStyle(
                fontWeight: FontWeight.w600,
                color: selected ? scheme.onPrimary : scheme.onSurfaceVariant,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Save and submit, with the state of the register said out loud.
const _queuedMessage = 'Saved on this phone. It will be sent when you are online.';

class _ActionBar extends StatelessWidget {
  const _ActionBar({required this.state, required this.cubit});

  final AttendanceState state;
  final AttendanceCubit cubit;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final draft = state.draft!;

    if (draft.sheet.isSubmitted) {
      return SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.base),
          child: Text(
            'This register is submitted. A correction has to be made by your head of department.',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
          ),
        ),
      );
    }

    if (state.submissionQueued) {
      return SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.base),
          child: Text(
            'Submission saved on this phone. It is sent automatically, and the register '
            'stays closed here until then.',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
          ),
        ),
      );
    }

    final blocked = draft.submitBlockedReason;

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.base),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (draft.isDirty)
              Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                child: Text(
                  '${draft.pendingCount} unsaved '
                  '${draft.pendingCount == 1 ? 'mark' : 'marks'}. '
                  'Nothing is sent until you save.',
                  style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 12),
                ),
              ),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: draft.isDirty && !state.busy ? () => _save(context) : null,
                    child: Text(state.saving ? 'Saving' : 'Save'),
                  ),
                ),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: FilledButton(
                    onPressed: blocked == null && !state.busy ? () => _submit(context) : null,
                    child: Text(state.submitting ? 'Submitting' : 'Submit'),
                  ),
                ),
              ],
            ),
            if (blocked != null && !draft.sheet.isSubmitted)
              Padding(
                padding: const EdgeInsets.only(top: AppSpacing.sm),
                child: Text(
                  blocked,
                  textAlign: TextAlign.center,
                  style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 12),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Future<void> _save(BuildContext context) async {
    final message = await cubit.save();
    if (!context.mounted || message != null) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(cubit.state.lastQueued ? _queuedMessage : 'Attendance saved')),
    );
  }

  Future<void> _submit(BuildContext context) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Submit this register?'),
        content: const Text(
          'After this it cannot be edited. A change needs a correction from your head of '
          'department, which is recorded.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Not yet'),
          ),
          TextButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Submit')),
        ],
      ),
    );
    if (confirmed != true) return;

    final message = await cubit.submit();
    if (!context.mounted || message != null) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(cubit.state.lastQueued ? _queuedMessage : 'Register submitted')),
    );
  }
}
