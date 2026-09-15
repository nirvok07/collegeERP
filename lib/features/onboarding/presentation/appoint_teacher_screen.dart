import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../app/routes.dart';
import '../../../core/design/tokens.dart';
import '../../../core/di/locator.dart';
import '../../../core/widgets/screen_state.dart';
import '../data/onboarding_api.dart';
import '../domain/onboarding.dart';
import 'onboarding_cubits.dart';

/// Appointing a teacher (ONB-1): name, email, the department they teach in.
/// They sign in with a code sent to that email or mobile (AD-82).
class AppointTeacherScreen extends StatelessWidget {
  const AppointTeacherScreen({super.key, required this.args, this.repository});

  final OnboardingArgs args;
  final OnboardingRepository? repository;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => AppointTeacherCubit(repository ?? locator<OnboardingRepository>())..load(),
      child: _TeacherForm(args: args),
    );
  }
}

class _TeacherForm extends StatefulWidget {
  const _TeacherForm({required this.args});
  final OnboardingArgs args;

  @override
  State<_TeacherForm> createState() => _TeacherFormState();
}

class _TeacherFormState extends State<_TeacherForm> {
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _phone = TextEditingController();
  String? _departmentId;
  bool _asHead = false;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _phone.dispose();
    super.dispose();
  }

  Future<void> _submit(BuildContext context) async {
    FocusScope.of(context).unfocus();
    final navigator = Navigator.of(context);
    final teacher = await context.read<AppointTeacherCubit>().submit(TeacherInput(
      fullName: _name.text,
      email: _email.text,
      phone: _phone.text,
      departmentId: _departmentId,
      asHead: _asHead,
    ));
    if (teacher == null || !mounted) return;
    await navigator.pushReplacementNamed(
      Routes.teacherInvited,
      arguments: TeacherInvitedArgs(teacher: teacher, name: _name.text.trim(), college: widget.args.college),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return BlocBuilder<AppointTeacherCubit, OnboardingFormState<DepartmentOption>>(
      builder: (context, state) {
        final cubit = context.read<AppointTeacherCubit>();
        final fields = state.failure?.fieldErrors ?? const {};
        return Scaffold(
          appBar: AppBar(title: const Text('Appoint a teacher')),
          body: state.loading
              ? const SkeletonForm(switchRow: true)
              : state.loadFailure != null
              ? ErrorView(failure: state.loadFailure!, onRetry: () => cubit.load())
              : state.options.isEmpty
              ? const EmptyView(
                  title: 'No departments yet',
                  body: 'A teacher belongs to a department. Add one in the web console under Organisation, then come back.',
                  icon: Icons.account_tree_outlined,
                )
              : ListView(
                  padding: EdgeInsets.fromLTRB(
                    AppSpacing.base,
                    AppSpacing.base,
                    AppSpacing.base,
                    MediaQuery.viewInsetsOf(context).bottom + AppSpacing.xl,
                  ),
                  children: [
                    if (state.failure != null && fields.isEmpty)
                      Padding(
                        padding: const EdgeInsets.only(bottom: AppSpacing.base),
                        child: Text(state.failure!.message, style: TextStyle(color: theme.colorScheme.error)),
                      ),
                    TextField(
                      controller: _name,
                      autofocus: true,
                      textCapitalization: TextCapitalization.words,
                      decoration: InputDecoration(labelText: 'Full name', hintText: 'Ravi Kumar', errorText: fields['full_name']),
                    ),
                    const SizedBox(height: AppSpacing.md),
                    TextField(
                      controller: _email,
                      keyboardType: TextInputType.emailAddress,
                      autocorrect: false,
                      decoration: InputDecoration(
                        labelText: 'Email',
                        hintText: 'ravi@college.edu',
                        helperText: 'They sign in with a code sent to this email.',
                        errorText: fields['email'],
                      ),
                    ),
                    const SizedBox(height: AppSpacing.md),
                    TextField(
                      controller: _phone,
                      keyboardType: TextInputType.phone,
                      decoration: const InputDecoration(
                        labelText: 'Mobile number, optional',
                        helperText: 'They can also sign in with a code sent here.',
                      ),
                    ),
                    const SizedBox(height: AppSpacing.md),
                    DropdownButtonFormField<String>(
                      initialValue: _departmentId,
                      isExpanded: true,
                      decoration: const InputDecoration(labelText: 'Department'),
                      items: [
                        for (final d in state.options)
                          DropdownMenuItem(
                            value: d.id,
                            child: Text(
                              d.campusName.isEmpty ? d.name : '${d.name} · ${d.campusName}',
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                      ],
                      onChanged: (id) => setState(() => _departmentId = id),
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      value: _asHead,
                      onChanged: (v) => setState(() => _asHead = v),
                      title: const Text('Head of the department'),
                      subtitle: const Text('Also plans assessments and verifies marks for it.'),
                    ),
                    const SizedBox(height: AppSpacing.base),
                    FilledButton(
                      onPressed: state.submitting ? null : () => _submit(context),
                      child: state.submitting
                          ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                          : const Text('Appoint'),
                    ),
                  ],
                ),
        );
      },
    );
  }
}
