import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/design/tokens.dart';
import '../../../core/di/locator.dart';
import '../../../core/session/session_manager.dart';
import 'sign_in_cubit.dart';

/// Sign in, mobile-first. One scrollable column that survives the keyboard,
/// large touch targets, and the institution code remembered between launches.
class SignInScreen extends StatefulWidget {
  const SignInScreen({super.key, this.rememberedInstitution});

  final String? rememberedInstitution;

  @override
  State<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends State<SignInScreen> {
  late final _institution = TextEditingController(text: widget.rememberedInstitution ?? '');
  final _identifier = TextEditingController();
  final _password = TextEditingController();
  final _identifierFocus = FocusNode();
  final _passwordFocus = FocusNode();
  bool _obscure = true;

  @override
  void dispose() {
    _institution.dispose();
    _identifier.dispose();
    _password.dispose();
    _identifierFocus.dispose();
    _passwordFocus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    return BlocProvider(
      create: (_) => SignInCubit(locator<SessionManager>()),
      child: Scaffold(
        body: SafeArea(
          child: BlocBuilder<SignInCubit, SignInState>(
            builder: (context, state) {
              final fieldErrors = state.failure?.fieldErrors ?? const {};
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
                    Container(
                      width: 56,
                      height: 56,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: scheme.primary,
                        borderRadius: BorderRadius.circular(AppRadius.card),
                      ),
                      child: Text(
                        'C',
                        style: TextStyle(
                          fontSize: 26,
                          fontWeight: FontWeight.w700,
                          color: scheme.onPrimary,
                        ),
                      ),
                    ),
                    const SizedBox(height: AppSpacing.lg),
                    Text('College', style: Theme.of(context).textTheme.headlineMedium),
                    const SizedBox(height: AppSpacing.xs),
                    Text(
                      'Sign in to your college',
                      style: Theme.of(context).textTheme.bodyMedium
                          ?.copyWith(color: scheme.onSurfaceVariant),
                    ),
                    const SizedBox(height: AppSpacing.xl),

                    if (state.failure != null && fieldErrors.isEmpty)
                      Padding(
                        padding: const EdgeInsets.only(bottom: AppSpacing.base),
                        child: _Banner(message: state.failure!.message),
                      ),

                    TextField(
                      controller: _institution,
                      textInputAction: TextInputAction.next,
                      autocorrect: false,
                      decoration: InputDecoration(
                        labelText: 'College code',
                        hintText: 'sunrise-college',
                        errorText: fieldErrors['institution_code'],
                      ),
                      onSubmitted: (_) => _identifierFocus.requestFocus(),
                    ),
                    const SizedBox(height: AppSpacing.base),

                    TextField(
                      controller: _identifier,
                      focusNode: _identifierFocus,
                      textInputAction: TextInputAction.next,
                      keyboardType: TextInputType.emailAddress,
                      autocorrect: false,
                      decoration: InputDecoration(
                        labelText: 'Email or enrolment number',
                        errorText: fieldErrors['identifier'],
                      ),
                      onSubmitted: (_) => _passwordFocus.requestFocus(),
                    ),
                    const SizedBox(height: AppSpacing.base),

                    TextField(
                      controller: _password,
                      focusNode: _passwordFocus,
                      obscureText: _obscure,
                      textInputAction: TextInputAction.done,
                      decoration: InputDecoration(
                        labelText: 'Password',
                        errorText: fieldErrors['password'],
                        suffixIcon: IconButton(
                          onPressed: () => setState(() => _obscure = !_obscure),
                          icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                          tooltip: _obscure ? 'Show password' : 'Hide password',
                        ),
                      ),
                      onSubmitted: (_) => _submit(context),
                    ),
                    const SizedBox(height: AppSpacing.xl),

                    FilledButton(
                      onPressed: state.submitting ? null : () => _submit(context),
                      child: state.submitting
                          ? const SizedBox(
                              width: 20, height: 20,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Text('Sign in'),
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

  void _submit(BuildContext context) {
    FocusScope.of(context).unfocus();
    context.read<SignInCubit>().submit(
          institutionCode: _institution.text,
          identifier: _identifier.text,
          password: _password.text,
        );
  }
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
