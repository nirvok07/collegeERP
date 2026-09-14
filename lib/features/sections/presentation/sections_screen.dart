import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/design/tokens.dart';
import '../../../core/di/locator.dart';
import '../../../core/session/authority.dart';
import '../../../core/widgets/screen_state.dart';
import '../../../core/widgets/status_chip.dart';
import '../../../core/widgets/submit_dialog.dart';
import '../../offerings/data/offerings_api.dart';
import '../data/sections_api.dart';
import '../domain/section.dart';
import 'section_screen.dart';
import 'sections_cubits.dart';

/// ADM-6 (AD-81): the college's cohort sections, one term at a time. Anyone
/// who can see sections sees them; `section.manage` adds them and moves them
/// through their lifecycle; `enrolment.manage` places students in them.
class SectionsScreen extends StatelessWidget {
  const SectionsScreen({super.key, this.authority, this.repository, this.today});

  final Authority? authority;

  /// Tests supply their own; the app uses the server.
  final SectionsRepository? repository;
  final DateTime? today;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => SectionsCubit(repository ?? locator<SectionsRepository>(), today: today ?? DateTime.now())..load(),
      child: _SectionsView(authority: authority),
    );
  }
}

ChipTone sectionTone(String status) => switch (status) {
      'active' => ChipTone.success,
      'open' => ChipTone.info,
      'planned' => ChipTone.neutral,
      'cancelled' => ChipTone.error,
      _ => ChipTone.neutral,
    };

class _SectionsView extends StatelessWidget {
  const _SectionsView({required this.authority});

  final Authority? authority;

  bool get _canManage => authority?.can('section.manage') ?? false;

  Future<void> _add(BuildContext context, SectionsState state) async {
    final cubit = context.read<SectionsCubit>();
    if (state.programs.isEmpty || state.terms.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('A section needs a program and a term. Add them in Academic setup first.'),
      ));
      return;
    }
    var programId = state.programs.first.id;
    var termId = state.termId ?? state.terms.first.id;
    final termNumber = TextEditingController(text: '1');
    final label = TextEditingController();
    final capacity = TextEditingController();
    void suggest() {
      final n = int.tryParse(termNumber.text.trim());
      label.text = nextSectionLabel(state.sections
          .where((s) => s.programId == programId && s.termId == termId && s.termNumber == n)
          .map((s) => s.label));
    }

    suggest();
    final saved = await showSubmitDialog(
      context,
      title: 'Add a section',
      submitLabel: 'Add section',
      controllers: [termNumber, label, capacity],
      fields: (refresh) => [
        DropdownButtonFormField<String>(
          initialValue: programId,
          isExpanded: true,
          decoration: const InputDecoration(labelText: 'Program'),
          items: [
            for (final p in state.programs) DropdownMenuItem(value: p.id, child: Text(p.name, overflow: TextOverflow.ellipsis)),
          ],
          onChanged: (v) => refresh(() {
            programId = v ?? programId;
            suggest();
          }),
        ),
        const SizedBox(height: AppSpacing.base),
        DropdownButtonFormField<String>(
          initialValue: termId,
          isExpanded: true,
          decoration: const InputDecoration(labelText: 'Academic term'),
          items: [
            for (final t in state.terms) DropdownMenuItem(value: t.id, child: Text(t.name, overflow: TextOverflow.ellipsis)),
          ],
          onChanged: (v) => refresh(() {
            termId = v ?? termId;
            suggest();
          }),
        ),
        const SizedBox(height: AppSpacing.base),
        TextField(
          controller: termNumber,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(labelText: 'Term of the program', helperText: 'Such as 3 for the third semester'),
          onChanged: (_) => suggest(),
        ),
        const SizedBox(height: AppSpacing.base),
        TextField(
          controller: label,
          textCapitalization: TextCapitalization.characters,
          decoration: const InputDecoration(labelText: 'Label', helperText: 'Such as A'),
        ),
        const SizedBox(height: AppSpacing.base),
        TextField(controller: capacity, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Capacity (optional)')),
      ],
      submit: () async {
        final n = int.tryParse(termNumber.text.trim());
        final seats = capacity.text.trim().isEmpty ? null : int.tryParse(capacity.text.trim());
        if (n == null || n < 1 || n > 20) return invalidInput('The term of the program is a number from 1.');
        if (label.text.trim().isEmpty || label.text.trim().length > 12) return invalidInput('Give the section a short label, such as A.');
        if (capacity.text.trim().isNotEmpty && (seats == null || seats < 1 || seats > 1000)) {
          return invalidInput('Capacity is a number from 1 to 1000, or empty.');
        }
        return cubit.create(programId: programId, termId: termId, termNumber: n, label: label.text, capacity: seats);
      },
    );
    if (saved && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Section added')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<SectionsCubit, SectionsState>(
      builder: (context, state) {
        final cubit = context.read<SectionsCubit>();
        final theme = Theme.of(context);
        final shown = state.shown;
        return Scaffold(
          appBar: AppBar(title: const Text('Sections')),
          floatingActionButton: _canManage && state.status == LoadStatus.success
              ? FloatingActionButton.extended(
                  onPressed: () => _add(context, state),
                  icon: const Icon(Icons.add_rounded),
                  label: const Text('Add section'),
                )
              : null,
          body: switch (state.status) {
            LoadStatus.loading => const SkeletonList(rows: 5),
            LoadStatus.failure => ErrorView(failure: state.failure!, onRetry: cubit.load),
            _ => RefreshIndicator(
                onRefresh: cubit.load,
                child: ListView(
                  padding: const EdgeInsets.only(bottom: 88),
                  children: [
                    if (state.terms.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.all(AppSpacing.base),
                        child: DropdownButtonFormField<String?>(
                          initialValue: state.termId,
                          isExpanded: true,
                          decoration: const InputDecoration(labelText: 'Term'),
                          items: [
                            const DropdownMenuItem<String?>(value: null, child: Text('All terms')),
                            for (final t in state.terms) DropdownMenuItem<String?>(value: t.id, child: Text(t.name)),
                          ],
                          onChanged: cubit.showTerm,
                        ),
                      ),
                    if (shown.isEmpty)
                      EmptyView(
                        title: 'No sections here',
                        body: _canManage
                            ? 'Add the sections that students of each program are placed in, such as A and B.'
                            : 'Your college administrator adds sections.',
                        icon: Icons.groups_outlined,
                      ),
                    for (final s in shown)
                      ListTile(
                        title: Text(s.title),
                        subtitle: Text([
                          s.termName,
                          if (s.capacity != null) '${s.capacity} seats',
                        ].join(' · ')),
                        trailing: StatusChip(label: Section.statusLabel(s.status), tone: sectionTone(s.status)),
                        onTap: () async {
                          await Navigator.of(context).push(MaterialPageRoute<void>(
                            builder: (_) => SectionScreen(
                              sectionId: s.id,
                              repository: cubit.repository,
                              authority: authority,
                              offerings: locator.isRegistered<OfferingsRepository>() ? locator<OfferingsRepository>() : null,
                            ),
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
        );
      },
    );
  }
}
