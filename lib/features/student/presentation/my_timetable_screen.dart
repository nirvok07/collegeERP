import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/design/tokens.dart';
import '../../../core/di/locator.dart';
import '../../../core/error/failure.dart';
import '../../../core/saved_reads/saved_reads.dart';
import '../../../core/widgets/app_list_tile.dart';
import '../../../core/widgets/saved_freshness.dart';
import '../../../core/widgets/screen_state.dart';
import '../../delivery/domain/class_session.dart';
import '../data/my_attendance.dart';

/// A student's own timetable: the classes of the section they belong to.
/// Read-only — marking, rescheduling and cancelling stay teacher/admin
/// surfaces; this screen only ever asks `/v1/me/timetable`.
class MyTimetableScreen extends StatelessWidget {
  const MyTimetableScreen({super.key, this.repository});

  /// Tests supply their own; the app uses the locator.
  final StudentSelfRepository? repository;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => _MyTimetableCubit(repository ?? locator<StudentSelfRepository>())..load(),
      child: Scaffold(
        appBar: AppBar(title: const Text('My timetable')),
        body: const _Body(),
      ),
    );
  }
}

class _Body extends StatelessWidget {
  const _Body();

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<_MyTimetableCubit, _MyTimetableState>(
      builder: (context, state) {
        final cubit = context.read<_MyTimetableCubit>();
        return switch (state.status) {
          LoadStatus.loading => const SkeletonList(rows: 5, leading: SkeletonLeading.time),
          LoadStatus.failure => ErrorView(failure: state.failure!, onRetry: () => cubit.load(refresh: true)),
          _ => RefreshIndicator(
              onRefresh: () => cubit.load(refresh: true),
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(AppSpacing.base),
                children: [
                  if (state.updatedAt != null) SavedFreshness(at: state.updatedAt),
                  if (state.sessions.isEmpty)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: AppSpacing.xl),
                      child: Center(child: Text('Nothing on the timetable yet.')),
                    )
                  else
                    for (final entry in _byDate(state.sessions).entries) ...[
                      Padding(
                        padding: const EdgeInsets.only(top: AppSpacing.md, bottom: AppSpacing.xs),
                        child: Text(
                          entry.key,
                          style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                        ),
                      ),
                      for (final s in entry.value) _SessionTile(session: s),
                    ],
                ],
              ),
            ),
        };
      },
    );
  }
}

/// Grouped by calendar date, each day's classes kept in their own start-time
/// order (already true of the server's response).
Map<String, List<ClassSession>> _byDate(List<ClassSession> sessions) {
  final byDate = <String, List<ClassSession>>{};
  for (final s in sessions) {
    (byDate[s.date] ??= []).add(s);
  }
  return byDate;
}

class _SessionTile extends StatelessWidget {
  const _SessionTile({required this.session});
  final ClassSession session;

  @override
  Widget build(BuildContext context) {
    final cancelled = session.isCancelled;
    return AppListTile(
      leading: Icon(
        cancelled ? Icons.event_busy_rounded : Icons.event_rounded,
        color: cancelled ? AppColors.inkMuted : AppColors.info,
      ),
      title: Text(
        '${session.courseCode} — ${session.courseTitle}',
        style: cancelled ? const TextStyle(decoration: TextDecoration.lineThrough) : null,
      ),
      subtitle: Text([
        '${session.startsAt} – ${session.endsAt}',
        if (session.roomName != null) session.roomName!,
        if (session.teacherName != null) session.teacherName!,
        if (cancelled) 'Cancelled${session.cancelledReason != null ? ': ${session.cancelledReason}' : ''}',
      ].join(' · ')),
    );
  }
}

class _MyTimetableState {
  const _MyTimetableState({this.status = LoadStatus.loading, this.sessions = const [], this.failure, this.updatedAt});

  final LoadStatus status;
  final List<ClassSession> sessions;
  final Failure? failure;
  final DateTime? updatedAt;
}

class _MyTimetableCubit extends Cubit<_MyTimetableState> {
  _MyTimetableCubit(this._repository) : super(const _MyTimetableState());
  final StudentSelfRepository _repository;

  Future<void> load({bool refresh = false}) async {
    if (!refresh && await fromSaved(_read)) return;
    return _read();
  }

  Future<void> _read() async {
    final result = await _repository.myTimetable();
    if (isClosed) return;
    await result.when(
      ok: (sessions) async {
        final updatedAt = await _repository.myTimetableSavedAt();
        if (isClosed) return;
        emit(_MyTimetableState(status: LoadStatus.success, sessions: sessions, updatedAt: updatedAt));
      },
      err: (f) async => emit(_MyTimetableState(
        status: state.sessions.isEmpty ? LoadStatus.failure : LoadStatus.success,
        sessions: state.sessions,
        failure: f,
        updatedAt: state.updatedAt,
      )),
    );
  }
}
