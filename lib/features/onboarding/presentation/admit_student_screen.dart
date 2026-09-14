import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../app/routes.dart';
import '../../../core/design/tokens.dart';
import '../../../core/di/locator.dart';
import '../../../core/widgets/screen_state.dart';
import '../../delivery/domain/class_session.dart' show todayDate;
import '../data/onboarding_api.dart';
import '../domain/onboarding.dart';
import 'onboarding_cubits.dart';

/// Onboarding a student (ONB-1): the person and the student record together,
/// in a program. No login yet: that is the one-time activation code of ST-1.
class AdmitStudentScreen extends StatelessWidget {
  const AdmitStudentScreen({super.key, required this.args, this.repository});

  final OnboardingArgs args;
  final OnboardingRepository? repository;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => AdmitStudentCubit(repository ?? locator<OnboardingRepository>())..load(),
      child: const _StudentForm(),
    );
  }
}

class _StudentForm extends StatefulWidget {
  const _StudentForm();

  @override
  State<_StudentForm> createState() => _StudentFormState();
}

class _StudentFormState extends State<_StudentForm> {
  final _name = TextEditingController();
  final _number = TextEditingController();
  final _email = TextEditingController();
  final _phone = TextEditingController();
  String? _programId;
  String _admittedOn = todayDate();

  @override
  void dispose() {
    _name.dispose();
    _number.dispose();
    _email.dispose();
    _phone.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final parts = _admittedOn.split('-').map(int.parse).toList();
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime(parts[0], parts[1], parts[2]),
      firstDate: DateTime(2000),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (picked != null) setState(() => _admittedOn = todayDate(picked));
  }

  Future<void> _submit(BuildContext context) async {
    FocusScope.of(context).unfocus();
    final messenger = ScaffoldMessenger.of(context);
    final name = _name.text.trim();
    final ok = await context.read<AdmitStudentCubit>().submit(StudentInput(
      fullName: _name.text,
      enrolmentNumber: _number.text,
      programId: _programId,
      admittedOn: _admittedOn,
      email: _email.text,
      phone: _phone.text,
    ));
    if (!ok || !mounted) return;
    messenger.showSnackBar(SnackBar(content: Text('$name is admitted.')));
    // Ready for the next student in the same program and date.
    _name.clear();
    _number.clear();
    _email.clear();
    _phone.clear();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return BlocBuilder<AdmitStudentCubit, OnboardingFormState<ProgramOption>>(
      builder: (context, state) {
        final cubit = context.read<AdmitStudentCubit>();
        final fields = state.failure?.fieldErrors ?? const {};
        return Scaffold(
          appBar: AppBar(title: const Text('Onboard a student')),
          body: state.loading
              ? const SkeletonForm()
              : state.loadFailure != null
              ? ErrorView(failure: state.loadFailure!, onRetry: () => cubit.load())
              : state.options.isEmpty
              ? const EmptyView(
                  title: 'No programs yet',
                  body: 'A student is admitted into a program. Add one in the web console under Curriculum, then come back.',
                  icon: Icons.menu_book_outlined,
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
                      decoration: InputDecoration(labelText: 'Full name', hintText: 'Nisha Rao', errorText: fields['full_name']),
                    ),
                    const SizedBox(height: AppSpacing.md),
                    TextField(
                      controller: _number,
                      autocorrect: false,
                      textCapitalization: TextCapitalization.characters,
                      decoration: InputDecoration(
                        labelText: 'Enrolment number',
                        hintText: 'CSE2026-001',
                        helperText: 'Unique in the college. The student can sign in with it.',
                        errorText: fields['enrolment_number'] ?? fields['enrolmentNumber'],
                      ),
                    ),
                    const SizedBox(height: AppSpacing.md),
                    DropdownButtonFormField<String>(
                      initialValue: _programId ?? (state.options.length == 1 ? state.options.first.id : null),
                      isExpanded: true,
                      decoration: const InputDecoration(labelText: 'Program'),
                      items: [
                        for (final p in state.options)
                          DropdownMenuItem(value: p.id, child: Text(p.name, overflow: TextOverflow.ellipsis)),
                      ],
                      onChanged: (id) => setState(() => _programId = id),
                    ),
                    const SizedBox(height: AppSpacing.md),
                    InkWell(
                      onTap: _pickDate,
                      child: InputDecorator(
                        decoration: const InputDecoration(
                          labelText: 'Admitted on',
                          suffixIcon: Icon(Icons.calendar_month_rounded),
                        ),
                        child: Text(_admittedOn),
                      ),
                    ),
                    const SizedBox(height: AppSpacing.md),
                    TextField(
                      controller: _phone,
                      keyboardType: TextInputType.phone,
                      decoration: InputDecoration(
                        labelText: 'Mobile number',
                        hintText: '98765 43210',
                        helperText: 'Their sign-in code goes here or to the email. Give at least one.',
                        errorText: fields['phone'],
                      ),
                    ),
                    const SizedBox(height: AppSpacing.md),
                    TextField(
                      controller: _email,
                      keyboardType: TextInputType.emailAddress,
                      autocorrect: false,
                      decoration: InputDecoration(labelText: 'Email', errorText: fields['email']),
                    ),
                    const SizedBox(height: AppSpacing.xl),
                    FilledButton(
                      onPressed: state.submitting
                          ? null
                          : () {
                              // A single program is chosen for them.
                              if (_programId == null && state.options.length == 1) {
                                _programId = state.options.first.id;
                              }
                              _submit(context);
                            },
                      child: state.submitting
                          ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                          : const Text('Admit student'),
                    ),
                  ],
                ),
        );
      },
    );
  }
}
