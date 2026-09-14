import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/design/tokens.dart';
import '../../../core/di/locator.dart';
import '../../../core/error/failure.dart';
import '../../../core/error/result.dart';
import '../../../core/network/auth_api.dart';
import '../../../core/session/college_brand.dart';
import '../../../core/widgets/college_logo.dart';

typedef ActivateStudent = Future<Result<void>> Function({
  required String institutionCode,
  required String enrolmentNumber,
  required String code,
  required String password,
});

class StudentActivationState {
  const StudentActivationState({this.busy = false, this.failure, this.done = false});

  final bool busy;
  final Failure? failure;
  final bool done;
}

/// ST-1 (AD-69): a student's first sign-up, with the code their college gave
/// them. The server checks the code against the enrolment number; the phone
/// only catches an obviously incomplete form.
class StudentActivationCubit extends Cubit<StudentActivationState> {
  StudentActivationCubit(this._activate, this._institutionCode) : super(const StudentActivationState());

  final ActivateStudent _activate;
  final String _institutionCode;

  static Failure _invalid(String m) => Failure(code: FailureCode.validationFailed, message: m);

  /// Twelve letters and digits, however they were typed.
  static bool looksLikeCode(String code) => code.toUpperCase().replaceAll(RegExp('[^A-Z0-9]'), '').length == 12;

  Future<void> submit({required String enrolment, required String code, required String password, required String again}) async {
    if (enrolment.trim().isEmpty) return emit(StudentActivationState(failure: _invalid('Enter your enrolment number.')));
    if (!looksLikeCode(code)) {
      return emit(StudentActivationState(failure: _invalid('Enter the 12-character code from your college, such as ABCD-EFGH-JKLM.')));
    }
    if (password.length < 10 || !RegExp('[a-zA-Z]').hasMatch(password) || !RegExp('[0-9]').hasMatch(password)) {
      return emit(StudentActivationState(failure: _invalid('Use at least ten characters, with a letter and a number.')));
    }
    if (password != again) return emit(StudentActivationState(failure: _invalid('The passwords do not match.')));

    emit(const StudentActivationState(busy: true));
    final result = await _activate(
      institutionCode: _institutionCode,
      enrolmentNumber: enrolment.trim(),
      code: code.trim(),
      password: password,
    );
    if (isClosed) return;
    result.when(
      ok: (_) => emit(const StudentActivationState(done: true)),
      err: (f) => emit(StudentActivationState(failure: f)),
    );
  }
}

class StudentActivationScreen extends StatelessWidget {
  const StudentActivationScreen({super.key, required this.college, this.activate});

  final CollegeBrand college;

  /// Tests supply their own; the app calls the server.
  final ActivateStudent? activate;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => StudentActivationCubit(activate ?? locator<AuthApi>().activateStudent, college.code),
      child: _StudentActivationView(college: college),
    );
  }
}

class _StudentActivationView extends StatefulWidget {
  const _StudentActivationView({required this.college});
  final CollegeBrand college;

  @override
  State<_StudentActivationView> createState() => _StudentActivationViewState();
}

class _StudentActivationViewState extends State<_StudentActivationView> {
  final _enrolment = TextEditingController();
  final _code = TextEditingController();
  final _password = TextEditingController();
  final _again = TextEditingController();
  bool _obscure = true;

  @override
  void dispose() {
    _enrolment.dispose();
    _code.dispose();
    _password.dispose();
    _again.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return BlocBuilder<StudentActivationCubit, StudentActivationState>(
      builder: (context, state) {
        final cubit = context.read<StudentActivationCubit>();
        return Scaffold(
          appBar: AppBar(title: const Text('Activate your account')),
          body: SafeArea(
            child: ListView(
              padding: EdgeInsets.fromLTRB(
                AppSpacing.xl, AppSpacing.base, AppSpacing.xl, MediaQuery.viewInsetsOf(context).bottom + AppSpacing.xl,
              ),
              children: [
                Row(
                  children: [
                    CollegeLogo(college: widget.college, size: 40),
                    const SizedBox(width: AppSpacing.md),
                    Expanded(child: Text(widget.college.name, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700))),
                  ],
                ),
                const SizedBox(height: AppSpacing.xl),
                if (state.done) ...[
                  Icon(Icons.check_circle_rounded, size: 48, color: AppColors.success),
                  const SizedBox(height: AppSpacing.md),
                  Text('Your password is set.', textAlign: TextAlign.center, style: theme.textTheme.titleLarge),
                  const SizedBox(height: AppSpacing.sm),
                  Text(
                    'Sign in with your enrolment number and this password.',
                    textAlign: TextAlign.center,
                    style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                  ),
                  const SizedBox(height: AppSpacing.xl),
                  FilledButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Go to sign in')),
                ] else ...[
                  Text(
                    'Use the code your college gave you. It works once.',
                    style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                  ),
                  const SizedBox(height: AppSpacing.base),
                  if (state.failure != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: AppSpacing.base),
                      child: Text(state.failure!.message, style: TextStyle(color: theme.colorScheme.error)),
                    ),
                  TextField(
                    controller: _enrolment,
                    textCapitalization: TextCapitalization.characters,
                    autocorrect: false,
                    decoration: const InputDecoration(labelText: 'Enrolment number'),
                  ),
                  const SizedBox(height: AppSpacing.base),
                  TextField(
                    controller: _code,
                    textCapitalization: TextCapitalization.characters,
                    autocorrect: false,
                    enableSuggestions: false,
                    decoration: const InputDecoration(labelText: 'Activation code', helperText: 'Such as ABCD-EFGH-JKLM'),
                  ),
                  const SizedBox(height: AppSpacing.base),
                  TextField(
                    controller: _password,
                    obscureText: _obscure,
                    autofillHints: const [AutofillHints.newPassword],
                    decoration: InputDecoration(
                      labelText: 'New password',
                      helperText: 'At least ten characters, with a letter and a number.',
                      suffixIcon: IconButton(
                        onPressed: () => setState(() => _obscure = !_obscure),
                        icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                        tooltip: _obscure ? 'Show password' : 'Hide password',
                      ),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.base),
                  TextField(controller: _again, obscureText: _obscure, decoration: const InputDecoration(labelText: 'Repeat the password')),
                  const SizedBox(height: AppSpacing.xl),
                  FilledButton(
                    onPressed: state.busy
                        ? null
                        : () {
                            FocusScope.of(context).unfocus();
                            cubit.submit(enrolment: _enrolment.text, code: _code.text, password: _password.text, again: _again.text);
                          },
                    child: state.busy
                        ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                        : const Text('Set password'),
                  ),
                ],
              ],
            ),
          ),
        );
      },
    );
  }
}
