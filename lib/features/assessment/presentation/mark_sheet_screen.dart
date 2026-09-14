import '../../../core/di/outbox_setup.dart';
import '../../../core/widgets/outbox_status.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/design/tokens.dart';
import '../../../core/di/locator.dart';
import '../../../core/widgets/screen_state.dart';
import '../domain/assessment.dart';
import '../domain/assessment_repository.dart';
import 'assessment_cubits.dart';

/// Entering one assessment's results, on a phone.
///
/// The date comes first when there is none, because the class list is taken as
/// of that day. Then one row per student: a number field, and absent or exempt
/// one tap away, because absent is not zero. Save sends the whole sheet in one
/// request; submit closes it. No row animates: a list of sixty that animates is
/// a list that drops frames while somebody is typing into it.
class MarkSheetScreen extends StatelessWidget {
  const MarkSheetScreen({super.key, required this.componentId});

  final String componentId;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => MarkSheetCubit(locator<AssessmentRepository>(), componentId, offline: offlineWrites)..load(),
      child: const _MarkSheetView(),
    );
  }
}

class _MarkSheetView extends StatelessWidget {
  const _MarkSheetView();

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<MarkSheetCubit, MarkSheetState>(
      builder: (context, state) {
        final cubit = context.read<MarkSheetCubit>();
        final draft = state.draft;
        return PopScope(
          // Leaving with unsaved results is the one mistake this screen must
          // not let somebody make silently.
          canPop: !(draft?.isDirty ?? false),
          onPopInvokedWithResult: (didPop, _) {
            if (!didPop && draft != null) _confirmDiscard(context, draft.pendingCount);
          },
          child: Scaffold(
            appBar: AppBar(
              title: Text(draft?.sheet.component.name ?? 'Marks'),
              bottom: state.status == LoadStatus.refreshing
                  ? const PreferredSize(
                      preferredSize: Size.fromHeight(2),
                      child: LinearProgressIndicator(minHeight: 2),
                    )
                  : null,
            ),
            body: switch (state.status) {
              LoadStatus.loading => const SkeletonRegister(marks: 2, scoreField: true, bulkActions: false, summaryLine: false),
              LoadStatus.failure => ErrorView(failure: state.failure!, onRetry: () => cubit.load()),
              LoadStatus.empty => const EmptyView(
                title: 'Nobody enrolled',
                body: 'No student was enrolled in this course on the day it was held.',
                icon: Icons.groups_outlined,
              ),
              _ => _Sheet(state: state, cubit: cubit),
            },
            bottomNavigationBar:
                draft == null || draft.sheet.needsDate || state.status == LoadStatus.loading
                ? null
                : _ActionBar(state: state, cubit: cubit),
          ),
        );
      },
    );
  }

  Future<void> _confirmDiscard(BuildContext context, int pending) async {
    final leave = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Leave without saving?'),
        content: Text(
          '$pending ${pending == 1 ? 'result has' : 'results have'} not been sent. '
          'They will be lost.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Keep entering'),
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

/// A calendar date as the device sees it. The teacher's day is the right one:
/// "held today" means today where they are.
String _isoDate(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-'
    '${d.month.toString().padLeft(2, '0')}-'
    '${d.day.toString().padLeft(2, '0')}';

class _Sheet extends StatefulWidget {
  const _Sheet({required this.state, required this.cubit});

  final MarkSheetState state;
  final MarkSheetCubit cubit;

  @override
  State<_Sheet> createState() => _SheetState();
}

class _SheetState extends State<_Sheet> {
  final Map<String, TextEditingController> _controllers = {};

  @override
  void didUpdateWidget(covariant _Sheet oldWidget) {
    super.didUpdateWidget(oldWidget);
    final next = widget.state.draft;
    // A new draft means the sheet was re-read, so the server's values replace
    // what the fields hold. Typing mutates the same draft, so it never lands
    // here and nothing a teacher is typing is overwritten.
    if (next != null && !identical(next, oldWidget.state.draft)) {
      final present = next.sheet.students.map((s) => s.studentId).toSet();
      _controllers.forEach((id, controller) {
        if (!present.contains(id)) return;
        final text = next.textFor(id);
        if (controller.text != text) controller.text = text;
      });
    }
  }

  @override
  void dispose() {
    for (final controller in _controllers.values) {
      controller.dispose();
    }
    super.dispose();
  }

  TextEditingController _controllerFor(MarkDraft draft, String id) =>
      _controllers.putIfAbsent(id, () => TextEditingController(text: draft.textFor(id)));

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final draft = widget.state.draft!;
    final sheet = draft.sheet;
    final c = sheet.component;

    return Column(
      children: [
        Container(
          width: double.infinity,
          color: scheme.surfaceContainerHighest,
          padding: const EdgeInsets.all(AppSpacing.base),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '${c.courseCode} · ${c.courseTitle}',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(
                '${c.sectionLabel} · ${c.outOf}${c.heldOn == null ? '' : ' · held ${c.heldOn}'}',
                style: Theme.of(context).textTheme.bodySmall
                    ?.copyWith(color: scheme.onSurfaceVariant),
              ),
            ],
          ),
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
        OutboxStatusLine(
          items: widget.state.waiting,
          onSendNow: widget.cubit.sendNow,
          onRetry: widget.cubit.retry,
          onDiscard: (item) async {
            if (await confirmDiscard(context, item)) await widget.cubit.discard(item);
          },
        ),
        if (sheet.needsDate)
          Expanded(
            child: widget.state.dateQueued
                ? const _DateWaiting()
                : _DateCard(sheet: sheet, cubit: widget.cubit, busy: widget.state.busy),
          )
        else
          Expanded(
            child: ListView.separated(
              // A builder, so two hundred rows cost what twenty do.
              itemCount: sheet.students.length,
              separatorBuilder: (_, _) => const Divider(height: 1),
              itemBuilder: (context, index) {
                final student = sheet.students[index];
                return _StudentRow(
                  student: student,
                  draft: draft,
                  controller: _controllerFor(draft, student.studentId),
                  enabled: sheet.canMark && c.isOpen && !widget.state.busy,
                  onScore: (text) => widget.cubit.setScore(student.studentId, text),
                  onStatus: (status) => widget.cubit.setStatus(student.studentId, status),
                );
              },
            ),
          ),
      ],
    );
  }
}

/// The date, asked for before anything else, because who was expected to sit it
/// depends on it and it is fixed once the first result is entered.
class _DateCard extends StatelessWidget {
  const _DateCard({required this.sheet, required this.cubit, required this.busy});

  final AssessmentSheet sheet;
  final MarkSheetCubit cubit;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.all(AppSpacing.xl),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.event_outlined, size: 40, color: scheme.outline),
          const SizedBox(height: AppSpacing.base),
          Text('When was it held?', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: AppSpacing.sm),
          Text(
            sheet.canMark
                ? 'The class list is taken as of that day, and the date is fixed once the '
                      'first result is entered.'
                : 'This has not been held yet, so there is no class list.',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
          ),
          if (sheet.canMark) ...[
            const SizedBox(height: AppSpacing.lg),
            FilledButton.icon(
              onPressed: busy
                  ? null
                  : () async {
                      final now = DateTime.now();
                      final picked = await showDatePicker(
                        context: context,
                        initialDate: now,
                        firstDate: DateTime(now.year - 2),
                        // Not in the future: an assessment is recorded once held.
                        lastDate: now,
                      );
                      if (picked == null) return;
                      final message = await cubit.recordHeldOn(_isoDate(picked));
                      if (message != null && context.mounted) {
                        ScaffoldMessenger.of(context)
                            .showSnackBar(SnackBar(content: Text(message)));
                      }
                    },
              icon: const Icon(Icons.calendar_today_outlined, size: 18),
              label: const Text('Choose the date'),
            ),
          ],
        ],
      ),
    );
  }
}

class _StudentRow extends StatelessWidget {
  const _StudentRow({
    required this.student,
    required this.draft,
    required this.controller,
    required this.enabled,
    required this.onScore,
    required this.onStatus,
  });

  final SheetStudent student;
  final MarkDraft draft;
  final TextEditingController controller;
  final bool enabled;
  final ValueChanged<String> onScore;
  final ValueChanged<MarkStatus> onStatus;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final status = draft.statusFor(student.studentId);
    final error = draft.errorFor(student.studentId);

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.base, vertical: AppSpacing.sm),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(student.fullName, maxLines: 1, overflow: TextOverflow.ellipsis),
                    Text(
                      student.enrolmentNumber,
                      style: Theme.of(context).textTheme.bodySmall
                          ?.copyWith(color: scheme.onSurfaceVariant),
                    ),
                  ],
                ),
              ),
              SizedBox(
                width: 76,
                child: TextField(
                  controller: controller,
                  enabled: enabled,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  textAlign: TextAlign.right,
                  decoration: InputDecoration(
                    isDense: true,
                    hintText: status == MarkStatus.absent || status == MarkStatus.exempt
                        ? status!.label
                        : '—',
                  ),
                  onChanged: onScore,
                ),
              ),
              for (final option in const [MarkStatus.absent, MarkStatus.exempt])
                _StatusButton(
                  option: option,
                  selected: status == option,
                  enabled: enabled,
                  studentName: student.fullName,
                  onTap: () {
                    // Absent is not zero, so whatever was typed goes.
                    controller.text = '';
                    onStatus(option);
                  },
                ),
            ],
          ),
          if (error != null)
            Padding(
              padding: const EdgeInsets.only(top: AppSpacing.xs),
              child: Text(error, style: TextStyle(color: scheme.error, fontSize: 12)),
            ),
        ],
      ),
    );
  }
}

class _StatusButton extends StatelessWidget {
  const _StatusButton({
    required this.option,
    required this.selected,
    required this.enabled,
    required this.studentName,
    required this.onTap,
  });

  final MarkStatus option;
  final bool selected;
  final bool enabled;
  final String studentName;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final colour = option == MarkStatus.absent ? scheme.error : scheme.secondary;
    return Semantics(
      button: true,
      selected: selected,
      label: '${option.label}, $studentName',
      child: Padding(
        padding: const EdgeInsets.only(left: AppSpacing.xs),
        child: InkWell(
          onTap: enabled ? onTap : null,
          borderRadius: BorderRadius.circular(AppRadius.pill),
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
              option == MarkStatus.absent ? 'A' : 'E',
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

class _ActionBar extends StatelessWidget {
  const _ActionBar({required this.state, required this.cubit});

  final MarkSheetState state;
  final MarkSheetCubit cubit;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final draft = state.draft!;
    final component = draft.sheet.component;

    if (!component.isOpen) {
      return SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.base),
          child: Text(
            'This sheet is ${component.stageLabel.toLowerCase()}. A correction has to be made by '
            'your head of department.',
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
            'Submission saved on this phone. It is sent automatically, and the sheet stays '
            'closed here until then.',
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
                  '${draft.pendingCount} unsaved ${draft.pendingCount == 1 ? 'result' : 'results'}. '
                  'Nothing is sent until you save.',
                  style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 12),
                ),
              ),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: draft.canSave && !state.busy ? () => _save(context) : null,
                    child: Text(state.busy ? 'Saving' : 'Save'),
                  ),
                ),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: FilledButton(
                    onPressed: blocked == null && !state.busy ? () => _submit(context) : null,
                    child: const Text('Submit'),
                  ),
                ),
              ],
            ),
            if (blocked != null)
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
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message ?? (cubit.state.lastQueued ? _queuedMessage : 'Results saved'))));
  }

  Future<void> _submit(BuildContext context) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Submit this sheet?'),
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
    if (!context.mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message ?? (cubit.state.lastQueued ? _queuedMessage : 'Sheet submitted'))));
  }
}

const _queuedMessage = 'Saved on this phone. It will be sent when you are online.';

/// The date is on the phone, and the class list depends on the server knowing
/// it, so there is honestly nothing to enter yet.
class _DateWaiting extends StatelessWidget {
  const _DateWaiting();

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.xl),
        child: Text(
          'The date is saved on this phone. The class list appears once it reaches the server.',
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
        ),
      ),
    );
  }
}
