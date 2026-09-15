import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../core/design/tokens.dart';
import '../../core/network/auth_api.dart';
import '../../core/widgets/otp_code_field.dart';
import 'platform_auth_api.dart';
import 'platform_sign_in_cubit.dart';

/// The super admin app's only way in (AD-72): the account's email, then the
/// code sent to it (AD-82). No password and no authenticator.
class PlatformSignInScreen extends StatelessWidget {
  const PlatformSignInScreen({super.key, required this.api, required this.adopt});

  final PlatformAuthApi api;
  final Future<void> Function(AuthSession session) adopt;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => PlatformSignInCubit(api, adopt),
      child: const _SignInView(),
    );
  }
}

class _SignInView extends StatefulWidget {
  const _SignInView();

  @override
  State<_SignInView> createState() => _SignInViewState();
}

class _SignInViewState extends State<_SignInView> {
  final _email = TextEditingController();
  final _code = TextEditingController();

  @override
  void dispose() {
    _email.dispose();
    _code.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    return Scaffold(
      body: SafeArea(
        child: BlocConsumer<PlatformSignInCubit, PlatformSignInState>(
          // A new step starts with an empty code field.
          listenWhen: (a, b) => a.step != b.step,
          listener: (_, _) => _code.clear(),
          builder: (context, state) {
            final cubit = context.read<PlatformSignInCubit>();
            final codeStep = state.step == PlatformSignInStep.code;
            return SingleChildScrollView(
              padding: EdgeInsets.only(
                left: AppSpacing.xl,
                right: AppSpacing.xl,
                top: AppSpacing.xxl,
                bottom: MediaQuery.viewInsetsOf(context).bottom + AppSpacing.xl,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Align(
                    alignment: Alignment.centerLeft,
                    child: Container(
                      width: 56,
                      height: 56,
                      decoration: BoxDecoration(color: scheme.primary, borderRadius: BorderRadius.circular(AppRadius.sheet)),
                      child: Icon(Icons.admin_panel_settings_rounded, color: scheme.onPrimary, size: 28),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  Text('Super Admin', style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700)),
                  Text(
                    codeStep ? 'Enter the 6-digit code sent to ${state.email}' : 'Platform administration',
                    style: theme.textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
                  ),
                  const SizedBox(height: AppSpacing.xl),
                  if (state.notice != null && state.failure == null) _Banner(message: state.notice!, error: false),
                  if (state.failure != null) _Banner(message: state.failure!.message, error: true),
                  if (!codeStep) ...[
                    TextField(
                      controller: _email,
                      autofocus: true,
                      keyboardType: TextInputType.emailAddress,
                      autocorrect: false,
                      textInputAction: TextInputAction.done,
                      autofillHints: const [AutofillHints.email],
                      decoration: const InputDecoration(labelText: 'Email'),
                      onSubmitted: (_) => cubit.requestCode(_email.text),
                    ),
                    const SizedBox(height: AppSpacing.xl),
                    FilledButton(
                      onPressed: state.busy ? null : () => cubit.requestCode(_email.text),
                      child: _label(state.busy, 'Send code'),
                    ),
                  ] else ...[
                    _CodeField(controller: _code, onSubmitted: () => cubit.submitCode(_code.text)),
                    const SizedBox(height: AppSpacing.xl),
                    FilledButton(
                      onPressed: state.busy ? null : () => cubit.submitCode(_code.text),
                      child: _label(state.busy, 'Sign in'),
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    Row(
                      children: [
                        TextButton(onPressed: state.busy ? null : cubit.changeEmail, child: const Text('Change')),
                        const Spacer(),
                        TextButton(
                          onPressed: state.busy ? null : () => cubit.requestCode(state.email, again: true),
                          child: const Text('Send a new code'),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            );
          },
        ),
      ),
    );
  }

  Widget _label(bool busy, String text) =>
      busy ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : Text(text);
}

class _CodeField extends StatelessWidget {
  const _CodeField({required this.controller, required this.onSubmitted});
  final TextEditingController controller;
  final VoidCallback onSubmitted;

  /// The last digit signs in; the button stays for a pasted code.
  @override
  Widget build(BuildContext context) => OtpCodeField(controller: controller, onCompleted: (_) => onSubmitted());
}

class _Banner extends StatelessWidget {
  const _Banner({required this.message, required this.error});
  final String message;
  final bool error;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final bg = error ? scheme.errorContainer : scheme.secondaryContainer;
    final fg = error ? scheme.onErrorContainer : scheme.onSecondaryContainer;
    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.base),
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(AppRadius.input)),
      child: Row(
        children: [
          Icon(error ? Icons.error_outline_rounded : Icons.check_circle_outline_rounded, size: 20, color: fg),
          const SizedBox(width: AppSpacing.sm),
          Expanded(child: Text(message, style: TextStyle(color: fg))),
        ],
      ),
    );
  }
}
