import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/design/tokens.dart';
import '../../../core/di/locator.dart';
import '../../../core/error/failure.dart';
import '../../../core/widgets/screen_state.dart';
import '../../../core/widgets/status_chip.dart';
import '../../../core/widgets/submit_dialog.dart';
import '../../attendance/domain/attendance_sheet.dart';
import '../../delivery/domain/class_session.dart';
import '../data/review_api.dart';

class RegistersState {
  const RegistersState({this.status = LoadStatus.loading, required this.date, this.registers = const [], this.failure});

  final LoadStatus status;
  final String date;
  final List<RegisterSummary> registers;
  final Failure? failure;
}

/// A day's registers across the college, one day at a time.
class RegistersCubit extends Cubit<RegistersState> {
  RegistersCubit(this.repository, {required String today}) : super(RegistersState(date: today));

  final ReviewRepository repository;

  Future<void> load() async {
    final date = state.date;
    final result = await repository.registers(date);
    if (isClosed || state.date != date) return;
    result.when(
      ok: (list) => emit(RegistersState(
        status: LoadStatus.success,
        date: date,
        registers: [...list]..sort((a, b) => a.startsAt.compareTo(b.startsAt)),
      )),
      err: (f) => emit(RegistersState(status: LoadStatus.failure, date: date, failure: f)),
    );
  }

  Future<void> day(int delta) async {
    emit(RegistersState(date: shiftDate(state.date, delta)));
    await load();
  }
}

class RegisterReviewState {
  const RegisterReviewState({this.status = LoadStatus.loading, this.register, this.failure});

  final LoadStatus status;
  final ReviewRegister? register;
  final Failure? failure;
}

class RegisterReviewCubit extends Cubit<RegisterReviewState> {
  RegisterReviewCubit(this._repository, this.sessionId) : super(const RegisterReviewState());

  final ReviewRepository _repository;
  final String sessionId;

  Future<void> load() async {
    final result = await _repository.register(sessionId);
    if (isClosed) return;
    result.when(
      ok: (r) => emit(RegisterReviewState(status: LoadStatus.success, register: r)),
      err: (f) => emit(RegisterReviewState(
        status: state.register == null ? LoadStatus.failure : LoadStatus.success,
        register: state.register,
        failure: f,
      )),
    );
  }

  Future<Failure?> correct(String recordId, AttendanceMark to, String reason) async {
    final failure = (await _repository.correctAttendance(recordId, to.wire, reason.trim())).failureOrNull;
    if (failure == null && !isClosed) await load();
    return failure;
  }
}

/// ADM-11 (AD-81): the college's registers a day at a time: which classes
/// have one, which are submitted, and how many were present. A submitted
/// register opens for correction, with a reason, by `attendance.correct`.
class RegistersScreen extends StatelessWidget {
  const RegistersScreen({super.key, this.repository, this.today});

  /// Tests supply their own; the app uses the server.
  final ReviewRepository? repository;
  final String? today;

  @override
  Widget build(BuildContext context) {
    final t = today ?? todayDate();
    return BlocProvider(
      create: (_) => RegistersCubit(repository ?? locator<ReviewRepository>(), today: t)..load(),
      child: _RegistersView(today: t),
    );
  }
}

class _RegistersView extends StatelessWidget {
  const _RegistersView({required this.today});

  final String today;

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<RegistersCubit, RegistersState>(
      builder: (context, state) {
        final cubit = context.read<RegistersCubit>();
        final theme = Theme.of(context);
        final open = state.registers.where((r) => !r.isSubmitted && r.sessionStatus != 'cancelled').length;
        return Scaffold(
          appBar: AppBar(title: const Text('Registers')),
          body: Column(
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm),
                child: Row(
                  children: [
                    IconButton(tooltip: 'Previous day', onPressed: () => cubit.day(-1), icon: const Icon(Icons.chevron_left_rounded)),
                    Expanded(child: Text(dayLabel(state.date, today), textAlign: TextAlign.center, style: theme.textTheme.titleSmall)),
                    IconButton(tooltip: 'Next day', onPressed: () => cubit.day(1), icon: const Icon(Icons.chevron_right_rounded)),
                  ],
                ),
              ),
              Expanded(
                child: switch (state.status) {
                  LoadStatus.loading => const SkeletonList(rows: 5, trailing: SkeletonTrailing.chip),
                  LoadStatus.failure => ErrorView(failure: state.failure!, onRetry: cubit.load),
                  _ => RefreshIndicator(
                      onRefresh: cubit.load,
                      child: ListView(
                        padding: const EdgeInsets.only(bottom: AppSpacing.xxl),
                        children: [
                          if (state.registers.isNotEmpty)
                            Padding(
                              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.base),
                              child: Text(
                                open == 0 ? 'Every register is submitted.' : '$open not submitted yet.',
                                style: theme.textTheme.labelLarge?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                              ),
                            ),
                          if (state.registers.isEmpty)
                            const EmptyView(title: 'No classes this day', body: 'Choose another day.', icon: Icons.event_available_outlined),
                          for (final r in state.registers)
                            ListTile(
                              title: Text('${r.startsAt} · ${r.courseCode} · ${r.sectionLabel}'),
                              subtitle: Text([
                                r.teacherName ?? 'No teacher',
                                if (r.marked > 0) '${r.present} present, ${r.absent} absent',
                              ].join(' · ')),
                              trailing: StatusChip(
                                label: r.sessionStatus == 'cancelled' ? 'Cancelled' : (r.isSubmitted ? 'Submitted' : 'Open'),
                                tone: r.sessionStatus == 'cancelled'
                                    ? ChipTone.neutral
                                    : (r.isSubmitted ? ChipTone.success : ChipTone.warning),
                              ),
                              onTap: r.sessionStatus == 'cancelled'
                                  ? null
                                  : () async {
                                      await Navigator.of(context).push(MaterialPageRoute<void>(
                                        builder: (_) => RegisterReviewScreen(sessionId: r.sessionId, repository: cubit.repository),
                                      ));
                                      if (context.mounted) await cubit.load();
                                    },
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
    );
  }
}

/// One register for review. Before it is submitted, the teacher marks it on
/// their own screen; once submitted, only a correction with a reason changes it.
class RegisterReviewScreen extends StatelessWidget {
  const RegisterReviewScreen({super.key, required this.sessionId, required this.repository});

  final String sessionId;
  final ReviewRepository repository;

  Future<void> _correct(BuildContext context, RosterStudent student) async {
    final cubit = context.read<RegisterReviewCubit>();
    final options = AttendanceMark.values.where((m) => m != student.mark).toList();
    var to = options.first;
    final reason = TextEditingController();
    final done = await showSubmitDialog(
      context,
      title: 'Correct ${student.fullName}',
      submitLabel: 'Correct',
      controllers: [reason],
      fields: (refresh) => [
        Text('Recorded as ${student.mark?.label ?? 'nothing'}. The original stays on record beside the correction.'),
        RadioGroup<AttendanceMark>(
          groupValue: to,
          onChanged: (v) => refresh(() => to = v ?? to),
          child: Column(
            children: [for (final m in options) RadioListTile<AttendanceMark>(contentPadding: EdgeInsets.zero, value: m, title: Text(m.label))],
          ),
        ),
        TextField(controller: reason, decoration: const InputDecoration(labelText: 'Reason', hintText: 'Medical certificate')),
      ],
      submit: () async {
        if (reason.text.trim().isEmpty) return invalidInput('Give a reason for the correction.');
        return cubit.correct(student.recordId!, to, reason.text);
      },
    );
    if (done && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('${student.fullName}: now ${to.label.toLowerCase()}')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => RegisterReviewCubit(repository, sessionId)..load(),
      child: BlocBuilder<RegisterReviewCubit, RegisterReviewState>(
        builder: (context, state) {
          final cubit = context.read<RegisterReviewCubit>();
          final r = state.register;
          final theme = Theme.of(context);
          return Scaffold(
            appBar: AppBar(title: Text(r == null ? 'Register' : '${r.sheet.session.courseCode} · ${r.sheet.session.sectionLabel}')),
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
                          r!.sheet.isSubmitted
                              ? 'Submitted${r.sheet.submittedBy == null ? '' : ' by ${r.sheet.submittedBy}'}.'
                                  '${r.canCorrect ? ' Tap a student to correct their mark.' : ''}'
                                  '${r.corrections > 0 ? ' ${r.corrections} corrected so far.' : ''}'
                              : 'Not submitted yet. The teacher marks it; it can be corrected once submitted.',
                          style: theme.textTheme.bodyMedium,
                        ),
                      ),
                      if (state.failure != null)
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.base),
                          child: Text(state.failure!.message, style: TextStyle(color: theme.colorScheme.error)),
                        ),
                      for (final s in r.sheet.students)
                        ListTile(
                          title: Text(s.fullName),
                          subtitle: Text(s.enrolmentNumber),
                          trailing: Text(s.mark?.label ?? 'Not marked', style: theme.textTheme.labelLarge),
                          onTap: r.canCorrect && s.recordId != null ? () => _correct(context, s) : null,
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
