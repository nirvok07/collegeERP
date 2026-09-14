import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../core/design/tokens.dart';
import '../../core/error/failure.dart';
import '../../core/widgets/screen_state.dart';
import '../admin_locator.dart';
import '../colleges/college_models.dart';
import '../colleges/colleges_api.dart';
import 'platform_api.dart';

class AuditState {
  const AuditState({
    this.status = LoadStatus.loading,
    this.events = const [],
    this.nextCursor,
    this.collegeId,
    this.colleges = const [],
    this.loadingMore = false,
    this.failure,
  });

  final LoadStatus status;
  final List<AuditEvent> events;
  final String? nextCursor;

  /// The college the list is narrowed to; null for every college.
  final String? collegeId;
  final List<CollegeSummary> colleges;
  final bool loadingMore;
  final Failure? failure;
}

/// The platform audit, newest first, a page at a time.
class AuditCubit extends Cubit<AuditState> {
  AuditCubit(this._repository, this._colleges) : super(const AuditState());

  final PlatformRepository _repository;
  final CollegesRepository? _colleges;

  Future<void> load() async {
    final collegeId = state.collegeId;
    final page = _repository.audit(collegeId: collegeId);
    final colleges = state.colleges.isEmpty && _colleges != null ? _colleges.list() : null;
    final p = await page;
    final c = colleges == null ? null : await colleges;
    if (isClosed || state.collegeId != collegeId) return;
    p.when(
      ok: (value) => emit(AuditState(
        status: LoadStatus.success,
        events: value.events,
        nextCursor: value.nextCursor,
        collegeId: collegeId,
        colleges: c?.valueOrNull ?? state.colleges,
      )),
      err: (f) => emit(AuditState(status: LoadStatus.failure, collegeId: collegeId, colleges: state.colleges, failure: f)),
    );
  }

  Future<void> forCollege(String? id) async {
    emit(AuditState(collegeId: id, colleges: state.colleges));
    await load();
  }

  Future<void> more() async {
    final cursor = state.nextCursor;
    if (cursor == null || state.loadingMore) return;
    emit(AuditState(
      status: state.status, events: state.events, nextCursor: cursor, collegeId: state.collegeId,
      colleges: state.colleges, loadingMore: true,
    ));
    final result = await _repository.audit(collegeId: state.collegeId, cursor: cursor);
    if (isClosed) return;
    result.when(
      ok: (page) => emit(AuditState(
        status: LoadStatus.success, events: [...state.events, ...page.events], nextCursor: page.nextCursor,
        collegeId: state.collegeId, colleges: state.colleges,
      )),
      err: (f) => emit(AuditState(
        status: LoadStatus.success, events: state.events, nextCursor: cursor, collegeId: state.collegeId,
        colleges: state.colleges, failure: f,
      )),
    );
  }
}

String _when(DateTime at) {
  final t = at.toLocal();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return '${t.day} ${months[t.month - 1]} ${t.year}, ${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';
}

/// SAM-3 (AD-72, AD-81): everything the platform has done, who did it and
/// why. Read with `platform.audit.read`; the server redacts secrets.
class PlatformAuditScreen extends StatelessWidget {
  const PlatformAuditScreen({super.key, this.repository, this.colleges});

  /// Tests supply their own; the app uses the registered ones.
  final PlatformRepository? repository;
  final CollegesRepository? colleges;

  void _details(BuildContext context, AuditEvent e) {
    const encoder = JsonEncoder.withIndent('  ');
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(AppSpacing.xl, 0, AppSpacing.xl, AppSpacing.xl),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(e.title, style: Theme.of(context).textTheme.titleLarge),
              Text('${_when(e.at)} · ${e.actorName ?? 'System'}${e.collegeName == null ? '' : ' · ${e.collegeName}'}'),
              if (e.reason != null) ...[const SizedBox(height: AppSpacing.md), Text('Reason: ${e.reason}')],
              if (e.before != null) ...[
                const SizedBox(height: AppSpacing.md),
                const Text('Before'),
                SelectableText(encoder.convert(e.before), style: const TextStyle(fontFamily: 'monospace', fontSize: 12)),
              ],
              if (e.after != null) ...[
                const SizedBox(height: AppSpacing.md),
                const Text('After'),
                SelectableText(encoder.convert(e.after), style: const TextStyle(fontFamily: 'monospace', fontSize: 12)),
              ],
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => AuditCubit(
        repository ?? adminLocator<PlatformRepository>(),
        colleges ?? (adminLocator.isRegistered<CollegesRepository>() ? adminLocator<CollegesRepository>() : null),
      )..load(),
      child: BlocBuilder<AuditCubit, AuditState>(
        builder: (context, state) {
          final cubit = context.read<AuditCubit>();
          final theme = Theme.of(context);
          return Scaffold(
            appBar: AppBar(title: const Text('Platform audit')),
            body: Column(
              children: [
                if (state.colleges.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.all(AppSpacing.base),
                    child: DropdownButtonFormField<String?>(
                      initialValue: state.collegeId,
                      isExpanded: true,
                      decoration: const InputDecoration(labelText: 'College'),
                      items: [
                        const DropdownMenuItem<String?>(value: null, child: Text('Every college and the platform')),
                        for (final c in state.colleges) DropdownMenuItem<String?>(value: c.id, child: Text(c.name)),
                      ],
                      onChanged: cubit.forCollege,
                    ),
                  ),
                Expanded(
                  child: switch (state.status) {
                    LoadStatus.loading => const SkeletonList(rows: 6),
                    LoadStatus.failure => ErrorView(failure: state.failure!, onRetry: cubit.load),
                    _ => RefreshIndicator(
                        onRefresh: cubit.load,
                        child: state.events.isEmpty
                            ? ListView(children: const [
                                EmptyView(title: 'Nothing recorded', body: 'Platform actions appear here.', icon: Icons.history_rounded),
                              ])
                            : ListView(
                                children: [
                                  for (final e in state.events)
                                    ListTile(
                                      title: Text(e.title),
                                      subtitle: Text([
                                        _when(e.at),
                                        e.actorName ?? 'System',
                                        if (e.collegeName != null) e.collegeName!,
                                      ].join(' · ')),
                                      onTap: () => _details(context, e),
                                    ),
                                  if (state.failure != null)
                                    Padding(
                                      padding: const EdgeInsets.all(AppSpacing.base),
                                      child: Text(state.failure!.message, style: TextStyle(color: theme.colorScheme.error)),
                                    ),
                                  if (state.nextCursor != null)
                                    Padding(
                                      padding: const EdgeInsets.all(AppSpacing.base),
                                      child: OutlinedButton(
                                        onPressed: state.loadingMore ? null : cubit.more,
                                        child: Text(state.loadingMore ? 'Loading…' : 'Load more'),
                                      ),
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
