import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../core/design/tokens.dart';
import '../../core/network/auth_api.dart';
import 'platform_auth_api.dart';
import 'platform_sign_in_cubit.dart';

/// The super admin app's only way in (AD-72): email and password, then a code
/// from the authenticator, or setting one up the first time.
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
  final _password = TextEditingController();
  final _code = TextEditingController();
  bool _obscure = true;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
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
                    'Platform administration',
                    style: theme.textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
                  ),
                  const SizedBox(height: AppSpacing.xl),
                  if (state.notice != null) _Banner(message: state.notice!, error: false),
                  if (state.failure != null) _Banner(message: state.failure!.message, error: true),
                  ...switch (state.step) {
                    PlatformSignInStep.password => _passwordStep(context, state, cubit),
                    PlatformSignInStep.code => _codeStep(context, state, cubit),
                    PlatformSignInStep.enrol => _enrolStep(context, state, cubit),
                  },
                ],
              ),
            );
          },
        ),
      ),
    );
  }

  List<Widget> _passwordStep(BuildContext context, PlatformSignInState state, PlatformSignInCubit cubit) {
    void submit() {
      FocusScope.of(context).unfocus();
      cubit.submitPassword(email: _email.text, password: _password.text);
    }

    return [
      TextField(
        controller: _email,
        keyboardType: TextInputType.emailAddress,
        autocorrect: false,
        textInputAction: TextInputAction.next,
        autofillHints: const [AutofillHints.username],
        decoration: const InputDecoration(labelText: 'Email'),
      ),
      const SizedBox(height: AppSpacing.base),
      TextField(
        controller: _password,
        obscureText: _obscure,
        textInputAction: TextInputAction.done,
        autofillHints: const [AutofillHints.password],
        decoration: InputDecoration(
          labelText: 'Password',
          suffixIcon: IconButton(
            onPressed: () => setState(() => _obscure = !_obscure),
            icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined),
            tooltip: _obscure ? 'Show password' : 'Hide password',
          ),
        ),
        onSubmitted: (_) => submit(),
      ),
      const SizedBox(height: AppSpacing.xl),
      FilledButton(onPressed: state.busy ? null : submit, child: _label(state.busy, 'Continue')),
    ];
  }

  List<Widget> _codeStep(BuildContext context, PlatformSignInState state, PlatformSignInCubit cubit) {
    void submit() {
      FocusScope.of(context).unfocus();
      cubit.submitCode(_code.text);
    }

    return [
      Text(
        'Enter the six-digit code from your authenticator app.',
        style: Theme.of(context).textTheme.bodyMedium,
      ),
      const SizedBox(height: AppSpacing.base),
      _CodeField(controller: _code, onSubmitted: submit),
      const SizedBox(height: AppSpacing.xl),
      FilledButton(onPressed: state.busy ? null : submit, child: _label(state.busy, 'Sign in')),
      TextButton(onPressed: state.busy ? null : () => cubit.restart(), child: const Text('Use a different account')),
    ];
  }

  List<Widget> _enrolStep(BuildContext context, PlatformSignInState state, PlatformSignInCubit cubit) {
    final theme = Theme.of(context);
    final enrolment = state.enrolment;
    if (enrolment == null) return const [Center(child: CircularProgressIndicator())];
    void submit() {
      FocusScope.of(context).unfocus();
      cubit.confirmEnrolment(_code.text);
    }

    return [
      Text('Set up your authenticator', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
      const SizedBox(height: AppSpacing.sm),
      Text(
        'In your authenticator app (Google Authenticator, Microsoft Authenticator or Authy), '
        'add an account by entering this key, as a time-based key.',
        style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
      ),
      const SizedBox(height: AppSpacing.base),
      Container(
        padding: const EdgeInsets.all(AppSpacing.base),
        decoration: BoxDecoration(
          color: theme.colorScheme.surfaceContainerLow,
          borderRadius: BorderRadius.circular(AppRadius.card),
        ),
        child: Row(
          children: [
            Expanded(
              child: SelectableText(
                formatManualKey(enrolment.manualKey),
                style: theme.textTheme.titleMedium?.copyWith(fontFamily: 'monospace', letterSpacing: 1.2),
              ),
            ),
            IconButton(
              tooltip: 'Copy key',
              icon: const Icon(Icons.copy_rounded),
              onPressed: () async {
                await Clipboard.setData(ClipboardData(text: enrolment.manualKey));
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Key copied')));
                }
              },
            ),
          ],
        ),
      ),
      const SizedBox(height: AppSpacing.base),
      Text('Then enter the six-digit code it shows.', style: theme.textTheme.bodyMedium),
      const SizedBox(height: AppSpacing.sm),
      _CodeField(controller: _code, onSubmitted: submit),
      const SizedBox(height: AppSpacing.xl),
      FilledButton(onPressed: state.busy ? null : submit, child: _label(state.busy, 'Confirm')),
      TextButton(onPressed: state.busy ? null : () => cubit.restart(), child: const Text('Start again')),
    ];
  }

  Widget _label(bool busy, String text) =>
      busy ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : Text(text);
}

/// Groups of four, the way authenticator apps print keys.
String formatManualKey(String key) {
  final clean = key.replaceAll(' ', '');
  final groups = <String>[];
  for (var i = 0; i < clean.length; i += 4) {
    groups.add(clean.substring(i, i + 4 > clean.length ? clean.length : i + 4));
  }
  return groups.join(' ');
}

class _CodeField extends StatelessWidget {
  const _CodeField({required this.controller, required this.onSubmitted});
  final TextEditingController controller;
  final VoidCallback onSubmitted;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      autofocus: true,
      keyboardType: TextInputType.number,
      autofillHints: const [AutofillHints.oneTimeCode],
      inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)],
      textInputAction: TextInputAction.done,
      style: Theme.of(context).textTheme.headlineSmall?.copyWith(letterSpacing: 8),
      decoration: const InputDecoration(labelText: 'Code', hintText: '123456'),
      onSubmitted: (_) => onSubmitted(),
    );
  }
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
