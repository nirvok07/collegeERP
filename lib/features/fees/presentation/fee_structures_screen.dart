import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../app/routes.dart';
import '../../../core/design/tokens.dart';
import '../../../core/di/locator.dart';
import '../../../core/session/authority.dart';
import '../../../core/widgets/screen_state.dart';
import '../../../core/widgets/submit_dialog.dart';
import '../../../core/widgets/app_list_tile.dart';
import '../../academic/data/academic_api.dart';
import '../data/fees_api.dart';
import 'fee_structure_detail_screen.dart';
import 'fee_structures_cubit.dart';

/// FEE-1: fee structures, one per program and academic year. `fee.read` sees
/// them; `fee.manage` starts a new draft.
class FeeStructuresScreen extends StatelessWidget {
  const FeeStructuresScreen({super.key, this.authority, this.feesRepository, this.academicRepository});

  final Authority? authority;
  final FeesRepository? feesRepository;
  final AcademicRepository? academicRepository;

  @override
  Widget build(BuildContext context) {
    final manage = authority?.can('fee.manage') ?? false;
    return BlocProvider(
      create: (_) => FeeStructuresCubit(
        feesRepository ?? locator<FeesRepository>(),
        academicRepository ?? locator<AcademicRepository>(),
      )..load(),
      child: _FeeStructuresView(canManage: manage),
    );
  }
}

class _FeeStructuresView extends StatelessWidget {
  const _FeeStructuresView({required this.canManage});

  final bool canManage;

  Future<void> _create(BuildContext context, FeeStructuresState state) async {
    final cubit = context.read<FeeStructuresCubit>();
    if (state.programs.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Add a program in Academic setup first.')));
      return;
    }
    if (state.years.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Add an academic year in Academic setup first.')));
      return;
    }
    var programId = state.programs.first.id;
    var yearId = state.years.first.id;
    final saved = await showSubmitDialog(
      context,
      title: 'New fee structure',
      submitLabel: 'Create draft',
      fields: (refresh) => [
        DropdownButtonFormField<String>(
          initialValue: programId,
          isExpanded: true,
          decoration: const InputDecoration(labelText: 'Program'),
          items: [for (final p in state.programs) DropdownMenuItem(value: p.id, child: Text(p.name, overflow: TextOverflow.ellipsis))],
          onChanged: (id) => refresh(() => programId = id!),
        ),
        const SizedBox(height: AppSpacing.md),
        DropdownButtonFormField<String>(
          initialValue: yearId,
          isExpanded: true,
          decoration: const InputDecoration(labelText: 'Academic year'),
          items: [for (final y in state.years) DropdownMenuItem(value: y.id, child: Text(y.name))],
          onChanged: (id) => refresh(() => yearId = id!),
        ),
      ],
      submit: () async => cubit.create(programId: programId, academicYearId: yearId),
    );
    if (saved && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Draft created')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<FeeStructuresCubit, FeeStructuresState>(
      builder: (context, state) {
        final cubit = context.read<FeeStructuresCubit>();
        return Scaffold(
          appBar: AppBar(title: const Text('Fee structures')),
          floatingActionButton: canManage && state.status != LoadStatus.loading
              ? FloatingActionButton.extended(
                  onPressed: () => _create(context, state), icon: const Icon(Icons.add_rounded), label: const Text('New structure'),
                )
              : null,
          body: switch (state.status) {
            LoadStatus.loading => const SkeletonList(rows: 4),
            LoadStatus.failure => ErrorView(failure: state.failure!, onRetry: cubit.load),
            LoadStatus.empty => ListView(
                children: [
                  SizedBox(height: MediaQuery.sizeOf(context).height * 0.15),
                  EmptyView(
                    title: 'No fee structures yet',
                    body: canManage ? 'Create a draft for a program and academic year, add its instalments, then publish it.' : "Your Accountant hasn't published one yet.",
                    icon: Icons.request_quote_outlined,
                  ),
                ],
              ),
            _ => RefreshIndicator(
                onRefresh: () => cubit.load(refresh: true),
                child: ListView(
                  padding: const EdgeInsets.only(bottom: 88),
                  children: [
                    for (final s in state.structures)
                      AppListTile(
                        leading: Icon(
                          s.isPublished ? Icons.check_circle_outline : Icons.edit_note_rounded,
                          color: s.isPublished ? AppColors.success : AppColors.warning,
                        ),
                        title: Text('${s.programName} · ${s.academicYearName}'),
                        subtitle: Text(s.isPublished ? 'Published' : 'Draft'),
                        trailing: const Icon(Icons.chevron_right_rounded),
                        onTap: () => Navigator.of(context).pushNamed(
                          Routes.feeStructureDetail,
                          arguments: FeeStructureDetailArgs(structureId: s.id, canManage: canManage),
                        ).then((_) => cubit.load(refresh: true)),
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
