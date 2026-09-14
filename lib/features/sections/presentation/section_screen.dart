import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/design/tokens.dart';
import '../../../core/session/authority.dart';
import '../../../core/widgets/screen_state.dart';
import '../../../core/widgets/status_chip.dart';
import '../../../core/widgets/submit_dialog.dart';
import '../../offerings/data/offerings_api.dart';
import '../../offerings/presentation/section_offerings.dart';
import '../data/sections_api.dart';
import '../domain/section.dart';
import 'sections_cubits.dart';
import 'sections_screen.dart' show sectionTone;

/// One section: where it is in its lifecycle, how many it seats, and who is
/// in it. Each action is present only with its permission; the server checks
/// again and its refusal stays in the form that caused it.
class SectionScreen extends StatelessWidget {
  const SectionScreen({super.key, required this.sectionId, required this.repository, this.authority, this.offerings});

  final String sectionId;
  final SectionsRepository repository;
  final Authority? authority;

  /// ADM-7: the section's courses, for whoever may see offerings.
  final OfferingsRepository? offerings;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => SectionCubit(repository, sectionId, members: authority?.can('student.read') ?? false)..load(),
      child: _SectionView(
        canManage: authority?.can('section.manage') ?? false,
        canSeeMembers: authority?.can('student.read') ?? false,
        canPlace: authority?.can('enrolment.manage') ?? false,
        offerings: (authority?.can('offering.read') ?? false) ? offerings : null,
        authority: authority,
      ),
    );
  }
}

void _say(BuildContext context, String message) =>
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));

class _SectionView extends StatelessWidget {
  const _SectionView({
    required this.canManage,
    required this.canSeeMembers,
    required this.canPlace,
    this.offerings,
    this.authority,
  });

  final bool canManage;
  final bool canSeeMembers;
  final bool canPlace;
  final OfferingsRepository? offerings;
  final Authority? authority;

  Future<void> _move(BuildContext context, Section section, String to) async {
    final cubit = context.read<SectionCubit>();
    final reason = TextEditingController();
    final done = await showSubmitDialog(
      context,
      title: '${Section.actionLabel(to)}: ${section.label}?',
      submitLabel: Section.actionLabel(to),
      destructive: to == 'cancelled',
      controllers: [reason],
      fields: (_) => [
        Text(switch (to) {
          'open' => 'Students can be placed in it.',
          'active' => 'Teaching has started. It can be completed or cancelled after this, not planned again.',
          'completed' => 'The term is over for this section. This cannot be undone.',
          'cancelled' => 'It will not run. Move its students and end its courses first. This cannot be undone.',
          _ => 'It goes back to planning.',
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
    if (done && context.mounted) _say(context, 'Section ${Section.statusLabel(to).toLowerCase()}');
  }

  Future<void> _capacity(BuildContext context, Section section) async {
    final cubit = context.read<SectionCubit>();
    final seats = TextEditingController(text: section.capacity?.toString() ?? '');
    final done = await showSubmitDialog(
      context,
      title: 'Capacity of ${section.label}',
      submitLabel: 'Save',
      controllers: [seats],
      fields: (_) => [
        TextField(
          controller: seats,
          autofocus: true,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(labelText: 'Seats', helperText: 'Empty for no limit'),
        ),
      ],
      submit: () async {
        final n = seats.text.trim().isEmpty ? null : int.tryParse(seats.text.trim());
        if (seats.text.trim().isNotEmpty && (n == null || n < 1 || n > 1000)) {
          return invalidInput('Capacity is a number from 1 to 1000, or empty.');
        }
        return cubit.setCapacity(n);
      },
    );
    if (done && context.mounted) _say(context, 'Capacity saved');
  }

  Future<void> _addStudents(BuildContext context) async {
    final cubit = context.read<SectionCubit>();
    final result = await cubit.unplaced();
    if (!context.mounted) return;
    final candidates = result.valueOrNull;
    if (candidates == null) return _say(context, result.failureOrNull?.message ?? 'That did not work.');
    if (candidates.isEmpty) {
      return _say(context, 'Every enrolled student of this program is already in a section.');
    }
    final chosen = <String>{};
    final search = TextEditingController();
    final done = await showSubmitDialog(
      context,
      title: 'Add students',
      submitLabel: 'Add',
      controllers: [search],
      fields: (refresh) {
        final q = search.text.trim().toLowerCase();
        final shown = candidates
            .where((m) => q.isEmpty || m.fullName.toLowerCase().contains(q) || m.enrolmentNumber.toLowerCase().contains(q))
            .toList();
        return [
          Text('Students of this program in no section yet. ${chosen.length} chosen.'),
          const SizedBox(height: AppSpacing.sm),
          TextField(
            controller: search,
            decoration: const InputDecoration(prefixIcon: Icon(Icons.search_rounded), hintText: 'Name or enrolment number'),
            onChanged: (_) => refresh(() {}),
          ),
          if (shown.length > 1)
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton(
                onPressed: () => refresh(() => chosen.addAll(shown.map((m) => m.id))),
                child: Text('Choose all ${shown.length}'),
              ),
            ),
          for (final m in shown)
            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              value: chosen.contains(m.id),
              title: Text(m.fullName),
              subtitle: Text(m.enrolmentNumber),
              onChanged: (v) => refresh(() => v == true ? chosen.add(m.id) : chosen.remove(m.id)),
            ),
        ];
      },
      submit: () async {
        if (chosen.isEmpty) return invalidInput('Choose at least one student.');
        return cubit.place(chosen.toList());
      },
    );
    if (done && context.mounted) _say(context, '${chosen.length} ${chosen.length == 1 ? 'student' : 'students'} added');
  }

  Future<void> _remove(BuildContext context, Member member) async {
    final cubit = context.read<SectionCubit>();
    final reason = TextEditingController();
    final done = await showSubmitDialog(
      context,
      title: 'Take ${member.fullName} out of this section?',
      submitLabel: 'Take out',
      destructive: true,
      controllers: [reason],
      fields: (_) => [
        const Text('Their time in this section stays on record. They can then be placed in another.'),
        const SizedBox(height: AppSpacing.base),
        TextField(controller: reason, decoration: const InputDecoration(labelText: 'Reason', hintText: 'Moved to section B')),
      ],
      submit: () async {
        if (reason.text.trim().isEmpty) return invalidInput('Give a reason.');
        return cubit.remove(member.id, reason.text);
      },
    );
    if (done && context.mounted) _say(context, '${member.fullName} taken out');
  }

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<SectionCubit, SectionState>(
      builder: (context, state) {
        final cubit = context.read<SectionCubit>();
        final section = state.section;
        final theme = Theme.of(context);
        final placing = canPlace && section != null && (section.status == 'open' || section.status == 'active');
        return Scaffold(
          appBar: AppBar(title: Text(section == null ? 'Section' : 'Section ${section.label}')),
          floatingActionButton: placing
              ? FloatingActionButton.extended(
                  onPressed: () => _addStudents(context),
                  icon: const Icon(Icons.person_add_alt_1_rounded),
                  label: const Text('Add students'),
                )
              : null,
          body: switch (state.status) {
            LoadStatus.loading => const SkeletonList(rows: 5),
            LoadStatus.failure => ErrorView(failure: state.failure!, onRetry: cubit.load),
            _ => RefreshIndicator(
                onRefresh: cubit.load,
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(AppSpacing.base, AppSpacing.base, AppSpacing.base, 88),
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(section!.title, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                        ),
                        StatusChip(label: Section.statusLabel(section.status), tone: sectionTone(section.status)),
                      ],
                    ),
                    Text(
                      [section.yearName, section.termName, section.departmentName].where((s) => s.isNotEmpty).join(' · '),
                      style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                    ),
                    if (section.cancelledReason != null)
                      Padding(
                        padding: const EdgeInsets.only(top: AppSpacing.sm),
                        child: Text('Cancelled: ${section.cancelledReason}', style: theme.textTheme.bodySmall),
                      ),
                    if (state.failure != null)
                      Padding(
                        padding: const EdgeInsets.only(top: AppSpacing.sm),
                        child: Text(state.failure!.message, style: TextStyle(color: theme.colorScheme.error)),
                      ),
                    const Divider(height: AppSpacing.xl),
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: const Icon(Icons.event_seat_rounded),
                      title: const Text('Capacity'),
                      subtitle: Text(section.capacity == null ? 'No limit' : '${section.capacity} seats'),
                      trailing: canManage && section.capacityEditable
                          ? TextButton(onPressed: () => _capacity(context, section), child: const Text('Change'))
                          : null,
                    ),
                    if (canManage && section.allowedTransitions.isNotEmpty) ...[
                      const SizedBox(height: AppSpacing.sm),
                      Wrap(
                        spacing: AppSpacing.sm,
                        runSpacing: AppSpacing.sm,
                        children: [
                          for (final to in section.allowedTransitions)
                            to == 'cancelled'
                                ? OutlinedButton(
                                    style: OutlinedButton.styleFrom(foregroundColor: theme.colorScheme.error),
                                    onPressed: () => _move(context, section, to),
                                    child: Text(Section.actionLabel(to)),
                                  )
                                : FilledButton.tonal(onPressed: () => _move(context, section, to), child: Text(Section.actionLabel(to))),
                        ],
                      ),
                    ],
                    if (offerings != null) ...[
                      const Divider(height: AppSpacing.xl),
                      SectionOfferings(section: section, repository: offerings!, authority: authority),
                    ],
                    if (canSeeMembers) ...[
                      const Divider(height: AppSpacing.xl),
                      Text(
                        '${state.members.length} ${state.members.length == 1 ? 'student' : 'students'}'
                        '${section.capacity == null ? '' : ' of ${section.capacity}'}',
                        style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                      ),
                      if (state.members.isEmpty)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
                          child: Text(
                            section.status == 'planned' && canManage
                                ? 'Open the section to place students in it.'
                                : 'No students yet.',
                            style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                          ),
                        ),
                      for (final m in state.members)
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          title: Text(m.fullName),
                          subtitle: Text(m.enrolmentNumber),
                          trailing: canPlace
                              ? IconButton(
                                  tooltip: 'Take ${m.fullName} out',
                                  icon: const Icon(Icons.remove_circle_outline_rounded),
                                  onPressed: () => _remove(context, m),
                                )
                              : null,
                        ),
                    ],
                  ],
                ),
              ),
          },
        );
      },
    );
  }
}
