import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/design/tokens.dart';
import '../../../core/di/locator.dart';
import '../../../core/network/auth_api.dart';
import '../../../core/session/college_brand.dart';
import '../../../core/session/session_manager.dart';
import '../../../core/widgets/college_logo.dart';
import 'sign_in_cubit.dart';

/// Sign in to the college chosen on the first screen (AD-70), by a one-time
/// code to the person's email or mobile (AD-82). Two steps in one scrollable
/// column that survives the keyboard, the college's own name and logo on top.
class SignInScreen extends StatefulWidget {
  const SignInScreen({super.key, required this.college, required this.onChangeCollege, this.session});

  final CollegeBrand college;
  final VoidCallback onChangeCollege;

  /// Tests supply their own; the app uses the one in the locator.
  final SessionManager? session;

  @override
  State<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends State<SignInScreen> {
  final _identifier = TextEditingController();
  final _code = TextEditingController();

  @override
  void dispose() {
    _identifier.dispose();
    _code.dispose();
    super.dispose();
  }

  /// Where the code went, in words that say nothing about whether the
  /// identifier exists.
  String _where(SignInState state) => switch (state.challenge?.destination) {
        CodeDestination.mobile => 'by WhatsApp or SMS to ${state.identifier}',
        CodeDestination.record => 'to the mobile or email your college has on record',
        _ => 'to ${state.identifier}',
      };

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    return BlocProvider(
      create: (_) => SignInCubit(widget.session ?? locator<SessionManager>(), widget.college.code),
      child: Scaffold(
        body: SafeArea(
          child: BlocConsumer<SignInCubit, SignInState>(
            listenWhen: (a, b) => a.step != b.step || a.notice != b.notice,
            listener: (context, state) {
              if (state.step == SignInStep.code) _code.clear();
            },
            builder: (context, state) {
              final cubit = context.read<SignInCubit>();
              final codeStep = state.step == SignInStep.code;
              return SingleChildScrollView(
                // The keyboard must never hide the field being typed into.
                padding: EdgeInsets.only(
                  left: AppSpacing.xl,
                  right: AppSpacing.xl,
                  top: AppSpacing.xxl,
                  bottom: MediaQuery.viewInsetsOf(context).bottom + AppSpacing.xl,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Align(alignment: Alignment.centerLeft, child: CollegeLogo(college: widget.college, size: 64)),
                    const SizedBox(height: AppSpacing.lg),
                    Text(
                      widget.college.name,
                      style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: AppSpacing.xs),
                    Text(
                      codeStep ? 'Enter the 6-digit code sent ${_where(state)}' : 'Sign in with a code sent to your email or mobile',
                      style: theme.textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
                    ),
                    const SizedBox(height: AppSpacing.xl),

                    if (state.failure != null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: AppSpacing.base),
                        child: _Banner(message: state.failure!.message),
                      ),
                    if (state.notice != null && state.failure == null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: AppSpacing.base),
                        child: Text(state.notice!, style: theme.textTheme.bodySmall?.copyWith(color: scheme.primary)),
                      ),

                    if (!codeStep) ...[
                      TextField(
                        controller: _identifier,
                        autofocus: true,
                        textInputAction: TextInputAction.done,
                        keyboardType: TextInputType.emailAddress,
                        autocorrect: false,
                        autofillHints: const [AutofillHints.email, AutofillHints.telephoneNumber],
                        decoration: const InputDecoration(
                          labelText: 'Email or mobile number',
                          helperText: 'Students can also use their enrolment number.',
                        ),
                        onSubmitted: (_) => cubit.requestCode(_identifier.text),
                      ),
                      const SizedBox(height: AppSpacing.xl),
                      FilledButton(
                        onPressed: state.submitting ? null : () => cubit.requestCode(_identifier.text),
                        child: state.submitting ? const _Spinner() : const Text('Send code'),
                      ),
                    ] else ...[
                      TextField(
                        controller: _code,
                        autofocus: true,
                        textAlign: TextAlign.center,
                        keyboardType: TextInputType.number,
                        autofillHints: const [AutofillHints.oneTimeCode],
                        inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)],
                        style: theme.textTheme.headlineSmall?.copyWith(letterSpacing: 8, fontWeight: FontWeight.w600),
                        decoration: const InputDecoration(labelText: 'Code', counterText: ''),
                        onSubmitted: (_) => cubit.submitCode(_code.text),
                      ),
                      const SizedBox(height: AppSpacing.xl),
                      FilledButton(
                        onPressed: state.submitting ? null : () => cubit.submitCode(_code.text),
                        child: state.submitting ? const _Spinner() : const Text('Sign in'),
                      ),
                      const SizedBox(height: AppSpacing.sm),
                      Row(
                        children: [
                          TextButton(
                            onPressed: state.submitting ? null : cubit.changeIdentifier,
                            child: const Text('Change'),
                          ),
                          const Spacer(),
                          TextButton(
                            onPressed: state.submitting ? null : () => cubit.requestCode(state.identifier, again: true),
                            child: const Text('Send a new code'),
                          ),
                        ],
                      ),
                    ],
                    const SizedBox(height: AppSpacing.base),
                    TextButton.icon(
                      onPressed: state.submitting ? null : widget.onChangeCollege,
                      icon: const Icon(Icons.swap_horiz_rounded),
                      label: const Text('Not your college? Change it'),
                    ),
                  ],
                ),
              );
            },
          ),
        ),
      ),
    );
  }
}

class _Spinner extends StatelessWidget {
  const _Spinner();

  @override
  Widget build(BuildContext context) =>
      const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2));
}

class _Banner extends StatelessWidget {
  const _Banner({required this.message});
  final String message;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: scheme.errorContainer,
        borderRadius: BorderRadius.circular(AppRadius.input),
      ),
      child: Row(
        children: [
          Icon(Icons.error_outline_rounded, size: 20, color: scheme.onErrorContainer),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(
              message,
              style: TextStyle(color: scheme.onErrorContainer),
            ),
          ),
        ],
      ),
    );
  }
}
