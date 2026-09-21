import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/design/tokens.dart';
import '../../../core/di/locator.dart';
import '../../../core/session/authority.dart';
import '../../../core/widgets/screen_state.dart';
import '../../../core/widgets/submit_dialog.dart';
import '../../../core/widgets/app_list_tile.dart';
import '../data/fees_api.dart';
import '../domain/fees.dart';
import 'fee_heads_cubit.dart';

/// FEE-1: fee heads (Tuition, Exam, Lab, ...). `fee.read` sees them,
/// `fee.manage` (the Accountant, or the College Admin) adds and archives.
class FeeHeadsScreen extends StatelessWidget {
  const FeeHeadsScreen({super.key, this.authority, this.repository});

  final Authority? authority;
  final FeesRepository? repository;

  @override
  Widget build(BuildContext context) {
    final manage = authority?.can('fee.manage') ?? false;
    return BlocProvider(
      create: (_) => FeeHeadsCubit(repository ?? locator<FeesRepository>())..load(),
      child: _FeeHeadsView(canManage: manage),
    );
  }
}

void _say(BuildContext context, String message) =>
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));

class _FeeHeadsView extends StatelessWidget {
  const _FeeHeadsView({required this.canManage});

  final bool canManage;

  Future<void> _add(BuildContext context) async {
    final cubit = context.read<FeeHeadsCubit>();
    final name = TextEditingController();
    final code = TextEditingController();
    final saved = await showSubmitDialog(
      context,
      title: 'Add a fee head',
      submitLabel: 'Add',
      controllers: [name, code],
      fields: (_) => [
        TextField(controller: name, autofocus: true, decoration: const InputDecoration(labelText: 'Name'), textCapitalization: TextCapitalization.words),
        const SizedBox(height: AppSpacing.md),
        TextField(controller: code, decoration: const InputDecoration(labelText: 'Code', hintText: 'TUITION'), textCapitalization: TextCapitalization.characters),
      ],
      submit: () async {
        if (name.text.trim().length < 2) return invalidInput('Enter the fee head\'s name.');
        if (code.text.trim().isEmpty) return invalidInput('Enter a code.');
        return cubit.create(name: name.text, code: code.text);
      },
    );
    if (saved && context.mounted) _say(context, 'Fee head added');
  }

  Future<void> _archive(BuildContext context, FeeHead head) async {
    final cubit = context.read<FeeHeadsCubit>();
    final done = await showSubmitDialog(
      context,
      title: 'Archive ${head.name}?',
      submitLabel: 'Archive',
      destructive: true,
      fields: (_) => const [Text('It stops being offered in new fee structures. Existing ones keep it.')],
      submit: () async => cubit.archive(head.id),
    );
    if (done && context.mounted) _say(context, '${head.name} archived');
  }

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<FeeHeadsCubit, FeeHeadsState>(
      builder: (context, state) {
        final cubit = context.read<FeeHeadsCubit>();
        return Scaffold(
          appBar: AppBar(title: const Text('Fee heads')),
          floatingActionButton: canManage && state.status != LoadStatus.loading
              ? FloatingActionButton.extended(
                  onPressed: () => _add(context), icon: const Icon(Icons.add_rounded), label: const Text('Add fee head'),
                )
              : null,
          body: switch (state.status) {
            LoadStatus.loading => const SkeletonList(rows: 5, subtitle: false),
            LoadStatus.failure => ErrorView(failure: state.failure!, onRetry: cubit.load),
            LoadStatus.empty => ListView(
                children: [
                  SizedBox(height: MediaQuery.sizeOf(context).height * 0.15),
                  EmptyView(
                    title: 'No fee heads yet',
                    body: canManage ? 'Add what fees are for — Tuition, Exam, Lab — before building a fee structure.' : 'Your Accountant adds fee heads.',
                    icon: Icons.receipt_long_outlined,
                  ),
                ],
              ),
            _ => RefreshIndicator(
                onRefresh: cubit.load,
                child: ListView(
                  padding: const EdgeInsets.only(bottom: 88),
                  children: [
                    for (final head in state.heads)
                      AppListTile(
                        leading: const Icon(Icons.receipt_long_outlined),
                        title: Text(head.name),
                        subtitle: Text(head.code),
                        trailing: canManage
                            ? IconButton(
                                icon: const Icon(Icons.archive_outlined),
                                tooltip: 'Archive',
                                onPressed: () => _archive(context, head),
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
