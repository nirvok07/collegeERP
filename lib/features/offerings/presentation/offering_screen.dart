import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/design/tokens.dart';
import '../../../core/session/authority.dart';
import '../../../core/widgets/screen_state.dart';
import '../../../core/widgets/status_chip.dart';
import '../../../core/widgets/submit_dialog.dart';
import '../../../core/widgets/app_list_tile.dart';
import '../../timetable/data/timetable_api.dart';
import '../../timetable/presentation/offering_timetable.dart';
import '../data/offerings_api.dart';
import '../domain/offering.dart';
import 'offerings_cubits.dart';
import 'section_offerings.dart' show offeringTone;

/// One course taught to one section: whether it is running, who teaches it,
/// and who is on its roster. Each action is present only with its permission;
/// the server checks again and a refusal stays in the form.
class OfferingScreen extends StatelessWidget {
  const OfferingScreen({super.key, required this.offeringId, required this.repository, this.authority, this.timetable});

  final String offeringId;
  final OfferingsRepository repository;
  final Authority? authority;

  /// ADM-8: its weekly slots and classes, for whoever may see sessions.
  final TimetableRepository? timetable;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => OfferingCubit(repository, offeringId)..load(),
      child: _OfferingView(
        canManage: authority?.can('offering.manage') ?? false,
        canAssign: authority?.can('instructor.assign') ?? false,
        canEnrol: authority?.can('enrolment.manage') ?? false,
        timetable: (authority?.can('session.read') ?? false) ? timetable : null,
        canSchedule: authority?.can('session.manage') ?? false,
      ),
    );
  }
}

void _say(BuildContext context, String message) =>
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));

class _OfferingView extends StatelessWidget {
  const _OfferingView({
    required this.canManage,
    required this.canAssign,
    required this.canEnrol,
    this.timetable,
    this.canSchedule = false,
  });

  final bool canManage;
  final bool canAssign;
  final bool canEnrol;
  final TimetableRepository? timetable;
  final bool canSchedule;

  Future<void> _move(BuildContext context, Offering offering, String to) async {
    final cubit = context.read<OfferingCubit>();
    final reason = TextEditingController();
    final done = await showSubmitDialog(
      context,
      title: '${Offering.actionLabel(to)}: ${offering.courseCode}?',
      submitLabel: Offering.actionLabel(to),
      destructive: to == 'cancelled',
      controllers: [reason],
      fields: (_) => [
        Text(switch (to) {
          'active' => 'Classes can be held and attendance taken.',
          'completed' => 'Teaching is over. Its record stays as it is. This cannot be undone.',
          _ => 'It will not be taught. Its record stays. This cannot be undone.',
        }),
        if (to == 'cancelled') ...[
          const SizedBox(height: AppSpacing.base),
          TextField(controller: reason, decoration: const InputDecoration(labelText: 'Reason')),
        ],
      ],
      submit: () async {
        if (to == 'cancelled' && reason.text.trim().isEmpty) return invalidInput('Give a reason for cancelling.');
        return cubit.transition(to, reason: to == 'cancelled' ? reason.text : null);
      },
    );
    if (done && context.mounted) _say(context, '${offering.courseCode}: ${Offering.statusLabel(to).toLowerCase()}');
  }

  Future<void> _assign(BuildContext context, Offering offering) async {
    final cubit = context.read<OfferingCubit>();
    final result = await cubit.repository.staff();
    if (!context.mounted) return;
    final taken = offering.instructors.map((i) => i.personId).toSet();
    final staff = (result.valueOrNull ?? const <StaffOption>[]).where((s) => !taken.contains(s.personId)).toList()
      ..sort((a, b) => a.fullName.compareTo(b.fullName));
    if (staff.isEmpty) {
      return _say(context, result.failureOrNull?.message ?? 'No other staff yet. Appoint a teacher in Onboarding first.');
    }
    String? personId;
    var role = offering.hasLead ? 'co' : 'lead';
    final search = TextEditingController();
    final done = await showSubmitDialog(
      context,
      title: 'Assign a teacher to ${offering.courseCode}',
      submitLabel: 'Assign',
      controllers: [search],
      fields: (refresh) {
        final q = search.text.trim().toLowerCase();
        final shown = staff.where((s) => q.isEmpty || s.fullName.toLowerCase().contains(q)).take(30).toList();
        return [
          SegmentedButton<String>(
            segments: [
              if (!offering.hasLead) const ButtonSegment(value: 'lead', label: Text('Lead')),
              const ButtonSegment(value: 'co', label: Text('Co')),
              const ButtonSegment(value: 'assistant', label: Text('Assistant')),
            ],
            selected: {role},
            onSelectionChanged: (s) => refresh(() => role = s.first),
          ),
          const SizedBox(height: AppSpacing.sm),
          TextField(
            controller: search,
            decoration: const InputDecoration(prefixIcon: Icon(Icons.search_rounded), hintText: 'Search staff'),
            onChanged: (_) => refresh(() {}),
          ),
          RadioGroup<String>(
            groupValue: personId,
            onChanged: (v) => refresh(() => personId = v),
            child: Column(
              children: [
                for (final s in shown)
                  RadioListTile<String>(
                    contentPadding: EdgeInsets.zero,
                    value: s.personId,
                    title: Text(s.fullName),
                    subtitle: s.email == null ? null : Text(s.email!),
                  ),
              ],
            ),
          ),
        ];
      },
      submit: () async {
        if (personId == null) return invalidInput('Choose a teacher.');
        return cubit.assign(personId!, role);
      },
    );
    if (done && context.mounted) _say(context, 'Teacher assigned');
  }

  Future<void> _endAssignment(BuildContext context, Instructor instructor) async {
    final cubit = context.read<OfferingCubit>();
    final reason = TextEditingController();
    final done = await showSubmitDialog(
      context,
      title: 'End ${instructor.fullName}\'s assignment?',
      submitLabel: 'End',
      destructive: true,
      controllers: [reason],
      fields: (_) => [
        const Text('What they taught stays on record. Assign someone else to carry on.'),
        const SizedBox(height: AppSpacing.base),
        TextField(controller: reason, decoration: const InputDecoration(labelText: 'Reason', hintText: 'On leave from October')),
      ],
      submit: () async {
        if (reason.text.trim().isEmpty) return invalidInput('Give a reason. It explains the handover later.');
        return cubit.endAssignment(instructor.assignmentId, reason.text);
      },
    );
    if (done && context.mounted) _say(context, 'Assignment ended');
  }

  Future<void> _enrolSection(BuildContext context, Offering offering) async {
    final cubit = context.read<OfferingCubit>();
    final result = await cubit.enrolSection();
    if (!context.mounted) return;
    _say(
      context,
      result.failure?.message ??
          (result.count == null ? 'Section ${offering.sectionLabel} enrolled' : '${result.count} students enrolled'),
    );
  }

  Future<void> _enrolSome(BuildContext context, Offering offering, List<RosterStudent> roster) async {
    final cubit = context.read<OfferingCubit>();
    final result = await cubit.repository.sectionMembers(offering.sectionId);
    if (!context.mounted) return;
    final onRoster = roster.map((r) => r.studentId).toSet();
    final candidates = (result.valueOrNull ?? const []).where((m) => !onRoster.contains(m.id)).toList();
    if (candidates.isEmpty) {
      return _say(context, result.failureOrNull?.message ?? 'Everyone in section ${offering.sectionLabel} is already on this course.');
    }
    final chosen = <String>{};
    final done = await showSubmitDialog(
      context,
      title: 'Enrol students',
      submitLabel: 'Enrol',
      fields: (refresh) => [
        Text('From section ${offering.sectionLabel}, not yet on this course.'),
        for (final m in candidates)
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            value: chosen.contains(m.id),
            title: Text(m.fullName),
            subtitle: Text(m.enrolmentNumber),
            onChanged: (v) => refresh(() => v == true ? chosen.add(m.id) : chosen.remove(m.id)),
          ),
      ],
      submit: () async {
        if (chosen.isEmpty) return invalidInput('Choose at least one student.');
        return cubit.enrol(chosen.toList());
      },
    );
    if (done && context.mounted) _say(context, '${chosen.length} enrolled');
  }

  Future<void> _drop(BuildContext context, RosterStudent student) async {
    final cubit = context.read<OfferingCubit>();
    final reason = TextEditingController();
    final done = await showSubmitDialog(
      context,
      title: 'Drop ${student.fullName} from this course?',
      submitLabel: 'Drop',
      destructive: true,
      controllers: [reason],
      fields: (_) => [
        const Text('Their attendance and marks so far stay on record.'),
        const SizedBox(height: AppSpacing.base),
        TextField(controller: reason, decoration: const InputDecoration(labelText: 'Reason')),
      ],
      submit: () async {
        if (reason.text.trim().isEmpty) return invalidInput('Give a reason.');
        return cubit.drop(student.studentId, reason.text);
      },
    );
    if (done && context.mounted) _say(context, '${student.fullName} dropped');
  }

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<OfferingCubit, OfferingState>(
      builder: (context, state) {
        final cubit = context.read<OfferingCubit>();
        final o = state.offering;
        final theme = Theme.of(context);
        return Scaffold(
          appBar: AppBar(title: Text(o?.courseCode ?? 'Course')),
          body: switch (state.status) {
            LoadStatus.loading => const SkeletonList(rows: 4, detailHeader: true),
            LoadStatus.failure => ErrorView(failure: state.failure!, onRetry: cubit.load),
            _ => RefreshIndicator(
                onRefresh: cubit.load,
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(AppSpacing.base, AppSpacing.base, AppSpacing.base, AppSpacing.xxl),
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(o!.title, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                        ),
                        StatusChip(label: Offering.statusLabel(o.status), tone: offeringTone(o.status)),
                      ],
                    ),
                    Text(
                      '${Offering.componentLabel(o.component)} · ${o.programName} · term ${o.termNumber} · '
                      'section ${o.sectionLabel} · ${o.termName}',
                      style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                    ),
                    if (state.failure != null)
                      Padding(
                        padding: const EdgeInsets.only(top: AppSpacing.sm),
                        child: Text(state.failure!.message, style: TextStyle(color: theme.colorScheme.error)),
                      ),
                    if (canManage && o.allowedTransitions.isNotEmpty) ...[
                      const SizedBox(height: AppSpacing.md),
                      Wrap(
                        spacing: AppSpacing.sm,
                        runSpacing: AppSpacing.sm,
                        children: [
                          for (final to in o.allowedTransitions)
                            to == 'cancelled'
                                ? OutlinedButton(
                                    style: OutlinedButton.styleFrom(foregroundColor: theme.colorScheme.error),
                                    onPressed: () => _move(context, o, to),
                                    child: Text(Offering.actionLabel(to)),
                                  )
                                : FilledButton.tonal(
                                    onPressed: to == 'active' && !o.canActivate ? null : () => _move(context, o, to),
                                    child: Text(Offering.actionLabel(to)),
                                  ),
                        ],
                      ),
                      if (o.activationBlocker != null)
                        Padding(
                          padding: const EdgeInsets.only(top: AppSpacing.xs),
                          child: Text(o.activationBlocker!, style: theme.textTheme.bodySmall),
                        ),
                    ],
                    const SizedBox(height: AppGeometry.gapGroup),
                    Row(
                      children: [
                        Expanded(child: Text('Teachers', style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700))),
                        if (canAssign && o.changeable)
                          TextButton.icon(
                            onPressed: () => _assign(context, o),
                            icon: const Icon(Icons.person_add_alt_1_rounded),
                            label: const Text('Assign'),
                          ),
                      ],
                    ),
                    if (o.instructors.isEmpty)
                      Text('No teacher yet', style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                    for (final i in o.instructors)
                      AppListTile(
                        margin: const EdgeInsets.symmetric(vertical: 6),
                        title: Text(i.fullName),
                        subtitle: Text(Instructor.roleLabel(i.role)),
                        trailing: canAssign && o.changeable
                            ? IconButton(
                                tooltip: 'End ${i.fullName}\'s assignment',
                                icon: const Icon(Icons.person_remove_alt_1_outlined),
                                onPressed: () => _endAssignment(context, i),
                              )
                            : null,
                      ),
                    if (timetable != null) ...[
                      const SizedBox(height: AppGeometry.gapGroup),
                      OfferingTimetable(
                        offeringId: o.id,
                        repository: timetable!,
                        canManage: canSchedule,
                        changeable: o.changeable,
                      ),
                    ],
                    const SizedBox(height: AppGeometry.gapGroup),
                    Text(
                      'Students (${state.roster.length})',
                      style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                    ),
                    if (canEnrol && o.changeable)
                      Wrap(
                        spacing: AppSpacing.sm,
                        children: [
                          TextButton.icon(
                            onPressed: () => _enrolSection(context, o),
                            icon: const Icon(Icons.group_add_rounded),
                            label: Text('Enrol section ${o.sectionLabel}'),
                          ),
                          TextButton.icon(
                            onPressed: () => _enrolSome(context, o, state.roster),
                            icon: const Icon(Icons.person_add_rounded),
                            label: const Text('Choose students'),
                          ),
                        ],
                      ),
                    if (state.roster.isEmpty)
                      Text('Nobody enrolled yet', style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                    for (final r in state.roster)
                      AppListTile(
                        margin: const EdgeInsets.symmetric(vertical: 6),
                        title: Text(r.fullName),
                        subtitle: Text(r.enrolmentNumber),
                        trailing: canEnrol && o.changeable
                            ? IconButton(
                                tooltip: 'Drop ${r.fullName}',
                                icon: const Icon(Icons.remove_circle_outline_rounded),
                                onPressed: () => _drop(context, r),
                              )
                            : null,
                      ),
                  ],
                ),
              ),
          },
        );
      },
    );
  }
}
