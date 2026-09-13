import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../app/routes.dart';
import '../../../core/design/tokens.dart';
import '../../../core/di/locator.dart';
import '../../../core/session/college_brand.dart';
import '../../../core/session/session_manager.dart';
import '../../../core/widgets/college_logo.dart';
import 'sign_in_cubit.dart';

/// Sign in to the college chosen on the first screen (AD-70). Mobile-first: one
/// scrollable column that survives the keyboard, large touch targets, and the
/// college's own name and logo at the top.
class SignInScreen extends StatefulWidget {
  const SignInScreen({super.key, required this.college, required this.onChangeCollege});

  final CollegeBrand college;
  final VoidCallback onChangeCollege;

  @override
  State<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends State<SignInScreen> {
  final _identifier = TextEditingController();
  final _password = TextEditingController();
  final _passwordFocus = FocusNode();
  bool _obscure = true;

  @override
  void dispose() {
    _identifier.dispose();
    _password.dispose();
    _passwordFocus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    return BlocProvider(
      create: (_) => SignInCubit(locator<SessionManager>()),
      child: Scaffold(
        body: SafeArea(
          child: BlocBuilder<SignInCubit, SignInState>(
            builder: (context, state) {
              final fieldErrors = state.failure?.fieldErrors ?? const {};
              // A problem with the college itself has no field on this screen,
              // so it is shown in the banner rather than lost.
              final bannerMessage = state.failure != null &&
                      !fieldErrors.containsKey('identifier') &&
                      !fieldErrors.containsKey('password')
                  ? state.failure!.message
                  : null;
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
                      'Sign in to continue',
                      style: theme.textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
                    ),
                    const SizedBox(height: AppSpacing.xl),

                    if (bannerMessage != null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: AppSpacing.base),
                        child: _Banner(message: bannerMessage),
                      ),

                    TextField(
                      controller: _identifier,
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
                    const SizedBox(height: AppSpacing.md),
                    OutlinedButton.icon(
                      onPressed: state.submitting
                          ? null
                          : () => Navigator.of(context).pushNamed(
                                Routes.acceptInvitation,
                                arguments: AcceptInvitationArgs(college: widget.college),
                              ),
                      icon: const Icon(Icons.mark_email_read_outlined),
                      label: const Text('I have an invitation'),
                    ),
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

  void _submit(BuildContext context) {
    FocusScope.of(context).unfocus();
    context.read<SignInCubit>().submit(
          institutionCode: widget.college.code,
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
