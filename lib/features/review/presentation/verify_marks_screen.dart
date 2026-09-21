import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/design/tokens.dart';
import '../../../core/di/locator.dart';
import '../../../core/error/failure.dart';
import '../../../core/widgets/screen_state.dart';
import '../../../core/widgets/submit_dialog.dart';
import '../../../core/widgets/app_list_tile.dart';
import '../../assessment/domain/assessment.dart';
import '../data/review_api.dart';

class QueueState {
  const QueueState({this.status = LoadStatus.loading, this.filter = 'submitted', this.sheets = const [], this.failure});

  final LoadStatus status;

  /// `submitted` (waiting) or `verified`.
  final String filter;
  final List<AssessmentComponent> sheets;
  final Failure? failure;
}

/// Mark sheets waiting for verification, or already verified, within the
/// reader's reach (the server filters sheet by sheet).
class QueueCubit extends Cubit<QueueState> {
  QueueCubit(this.repository) : super(const QueueState());

  final ReviewRepository repository;

  Future<void> load() async {
    final filter = state.filter;
    final result = await repository.queue(filter);
    if (isClosed || state.filter != filter) return;
    result.when(
      ok: (list) => emit(QueueState(status: LoadStatus.success, filter: filter, sheets: list)),
      err: (f) => emit(QueueState(status: LoadStatus.failure, filter: filter, failure: f)),
    );
  }

  Future<void> show(String filter) async {
    emit(QueueState(filter: filter));
    await load();
  }
}

class SheetReviewState {
  const SheetReviewState({this.status = LoadStatus.loading, this.sheet, this.failure});

  final LoadStatus status;
  final ReviewSheet? sheet;
  final Failure? failure;
}

class SheetReviewCubit extends Cubit<SheetReviewState> {
  SheetReviewCubit(this._repository, this.componentId) : super(const SheetReviewState());

  final ReviewRepository _repository;
  final String componentId;

  Future<void> load() async {
    final result = await _repository.sheet(componentId);
    if (isClosed) return;
    result.when(
      ok: (s) => emit(SheetReviewState(status: LoadStatus.success, sheet: s)),
      err: (f) => emit(SheetReviewState(status: state.sheet == null ? LoadStatus.failure : LoadStatus.success, sheet: state.sheet, failure: f)),
    );
  }

  Future<Failure?> _thenReload(Future<dynamic> write) async {
    final failure = (await write).failureOrNull as Failure?;
    if (!isClosed) await load();
    return failure;
  }

  /// Pinned to the version read: a sheet changed since cannot be verified blind.
  Future<Failure?> verify() => _thenReload(_repository.verify(componentId, state.sheet!.sheet.component.version));

  Future<Failure?> correct(String markId, MarkStatus to, double? score, String reason) =>
      _thenReload(_repository.correctMark(markId, status: to.wire, score: to == MarkStatus.scored ? score : null, reason: reason.trim()));
}

/// ADM-11 (AD-81): verifying and correcting internal marks on the phone.
/// `assessment.verify` sees the queue and verifies a submitted sheet;
/// `assessment.correct` corrects a closed sheet's mark with a reason.
class VerifyMarksScreen extends StatelessWidget {
  const VerifyMarksScreen({super.key, this.repository});

  /// Tests supply their own; the app uses the server.
  final ReviewRepository? repository;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => QueueCubit(repository ?? locator<ReviewRepository>())..load(),
      child: BlocBuilder<QueueCubit, QueueState>(
        builder: (context, state) {
          final cubit = context.read<QueueCubit>();
          final theme = Theme.of(context);
          return Scaffold(
            appBar: AppBar(title: const Text('Verify marks')),
            body: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.all(AppSpacing.base),
                  child: SegmentedButton<String>(
                    segments: const [
                      ButtonSegment(value: 'submitted', label: Text('Waiting')),
                      ButtonSegment(value: 'verified', label: Text('Verified')),
                    ],
                    selected: {state.filter},
                    onSelectionChanged: (s) => cubit.show(s.first),
                  ),
                ),
                Expanded(
                  child: switch (state.status) {
                    LoadStatus.loading => const SkeletonList(rows: 5, trailing: SkeletonTrailing.chip),
                    LoadStatus.failure => ErrorView(failure: state.failure!, onRetry: cubit.load),
                    _ => RefreshIndicator(
                        onRefresh: cubit.load,
                        child: state.sheets.isEmpty
                            ? ListView(children: [
                                EmptyView(
                                  title: state.filter == 'submitted' ? 'Nothing waiting' : 'Nothing verified yet',
                                  body: state.filter == 'submitted'
                                      ? 'Submitted mark sheets appear here for verification.'
                                      : 'Verified sheets appear here.',
                                  icon: Icons.fact_check_outlined,
                                ),
                              ])
                            : ListView(
                                children: [
                                  for (final c in state.sheets)
                                    AppListTile(
                                      title: Text('${c.courseCode} · ${c.sectionLabel} · ${c.name}'),
                                      subtitle: Text('${c.markCount} marks, ${c.outOf}${c.heldOn == null ? '' : ' · held ${c.heldOn}'}'),
                                      trailing: const Icon(Icons.chevron_right_rounded),
                                      onTap: () async {
                                        await Navigator.of(context).push(MaterialPageRoute<void>(
                                          builder: (_) => SheetReviewScreen(componentId: c.id, repository: cubit.repository),
                                        ));
                                        if (context.mounted) await cubit.load();
                                      },
                                    ),
                                  if (state.failure != null)
                                    Padding(
                                      padding: const EdgeInsets.all(AppSpacing.base),
                                      child: Text(state.failure!.message, style: TextStyle(color: theme.colorScheme.error)),
                                    ),
                                ],
                              ),
                      ),
                  },
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

/// One mark sheet for review.
class SheetReviewScreen extends StatelessWidget {
  const SheetReviewScreen({super.key, required this.componentId, required this.repository});

  final String componentId;
  final ReviewRepository repository;

  Future<void> _verify(BuildContext context, ReviewSheet s) async {
    final cubit = context.read<SheetReviewCubit>();
    final done = await showSubmitDialog(
      context,
      title: 'Verify ${s.sheet.component.name}?',
      submitLabel: 'Verify',
      fields: (_) => [
        Text('${s.sheet.students.length} results for ${s.sheet.component.courseCode} · ${s.sheet.component.sectionLabel}. '
            'After this, a result changes only by a correction with a reason.'),
      ],
      submit: cubit.verify,
    );
    if (done && context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Verified')));
  }

  Future<void> _correct(BuildContext context, ReviewSheet s, SheetStudent student) async {
    final cubit = context.read<SheetReviewCubit>();
    var to = student.status ?? MarkStatus.scored;
    final max = s.sheet.component.maxMarks;
    final score = TextEditingController(text: student.score == null ? '' : formatMarks(student.score!));
    final reason = TextEditingController();
    final done = await showSubmitDialog(
      context,
      title: 'Correct ${student.fullName}',
      submitLabel: 'Correct',
      controllers: [score, reason],
      fields: (refresh) => [
        Text('Recorded: ${student.status == MarkStatus.scored ? '${formatMarks(student.score ?? 0)} ${s.sheet.component.outOf}' : student.status?.label ?? 'nothing'}. '
            'The original stays on record beside the correction.'),
        const SizedBox(height: AppSpacing.sm),
        SegmentedButton<MarkStatus>(
          segments: [for (final m in MarkStatus.values) ButtonSegment(value: m, label: Text(m.label))],
          selected: {to},
          onSelectionChanged: (v) => refresh(() => to = v.first),
        ),
        if (to == MarkStatus.scored)
          TextField(
            controller: score,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: InputDecoration(labelText: 'Score', helperText: s.sheet.component.outOf),
          ),
        TextField(controller: reason, decoration: const InputDecoration(labelText: 'Reason', hintText: 'Totalling error on the answer script')),
      ],
      submit: () async {
        double? value;
        if (to == MarkStatus.scored) {
          value = double.tryParse(score.text.trim());
          if (value == null || value < 0) return invalidInput('Enter the score.');
          if (value > max) return invalidInput('The score is ${s.sheet.component.outOf}.');
        }
        if (reason.text.trim().isEmpty) return invalidInput('Give a reason for the correction.');
        return cubit.correct(s.markIds[student.studentId]!, to, value, reason.text);
      },
    );
    if (done && context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('${student.fullName}: corrected')));
  }

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => SheetReviewCubit(repository, componentId)..load(),
      child: BlocBuilder<SheetReviewCubit, SheetReviewState>(
        builder: (context, state) {
          final cubit = context.read<SheetReviewCubit>();
          final s = state.sheet;
          final theme = Theme.of(context);
          return Scaffold(
            appBar: AppBar(title: Text(s == null ? 'Mark sheet' : '${s.sheet.component.courseCode} · ${s.sheet.component.name}')),
            bottomNavigationBar: s != null && s.canVerify
                ? SafeArea(
                    child: Padding(
                      padding: const EdgeInsets.all(AppSpacing.base),
                      child: FilledButton.icon(
                        onPressed: () => _verify(context, s),
                        icon: const Icon(Icons.verified_rounded),
                        label: const Text('Verify'),
                      ),
                    ),
                  )
                : null,
            body: switch (state.status) {
              LoadStatus.loading => const SkeletonList(rows: 6, trailing: SkeletonTrailing.text),
              LoadStatus.failure => ErrorView(failure: state.failure!, onRetry: cubit.load),
              _ => RefreshIndicator(
                  onRefresh: cubit.load,
                  child: ListView(
                    padding: const EdgeInsets.only(bottom: AppSpacing.xxl),
                    children: [
                      Padding(
                        padding: const EdgeInsets.all(AppSpacing.base),
                        child: Text(
                          '${s!.sheet.component.stageLabel} · ${s.sheet.component.sectionLabel} · ${s.sheet.component.outOf}'
                          '${s.canCorrect ? ' · tap a result to correct it' : ''}'
                          '${s.corrections > 0 ? ' · ${s.corrections} corrected' : ''}',
                          style: theme.textTheme.bodyMedium,
                        ),
                      ),
                      if (state.failure != null)
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.base),
                          child: Text(state.failure!.message, style: TextStyle(color: theme.colorScheme.error)),
                        ),
                      for (final st in s.sheet.students)
                        AppListTile(
                          title: Text(st.fullName),
                          subtitle: Text(st.enrolmentNumber),
                          trailing: Text(
                            st.status == MarkStatus.scored ? formatMarks(st.score ?? 0) : (st.status?.label ?? 'No result'),
                            style: theme.textTheme.titleSmall,
                          ),
                          onTap: s.canCorrect && s.markIds.containsKey(st.studentId) ? () => _correct(context, s, st) : null,
                        ),
                    ],
                  ),
                ),
            },
          );
        },
      ),
    );
  }
}
