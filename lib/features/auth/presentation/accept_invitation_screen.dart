import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/design/tokens.dart';
import '../../../core/di/locator.dart';
import '../../../core/network/auth_api.dart';
import '../../../core/session/college_brand.dart';
import '../../../core/widgets/college_logo.dart';
import 'accept_invitation_cubit.dart';

/// Setting up an invited account on the phone (ACC-1). The college is the one
/// chosen on the first screen; the invitation code comes from the message the
/// person was sent. Then they sign in as usual.
class AcceptInvitationScreen extends StatelessWidget {
  const AcceptInvitationScreen({super.key, required this.college, this.accept});

  final CollegeBrand college;

  /// Tests supply their own; the app calls the server.
  final AcceptInvitation? accept;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => AcceptInvitationCubit(accept ?? locator<AuthApi>().acceptInvitation, college.code),
      child: _AcceptView(college: college),
    );
  }
}

class _AcceptView extends StatefulWidget {
  const _AcceptView({required this.college});
  final CollegeBrand college;

  @override
  State<_AcceptView> createState() => _AcceptViewState();
}

class _AcceptViewState extends State<_AcceptView> {
  final _token = TextEditingController();
  final _password = TextEditingController();
  final _again = TextEditingController();
  bool _obscure = true;

  @override
  void dispose() {
    _token.dispose();
    _password.dispose();
    _again.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return BlocBuilder<AcceptInvitationCubit, AcceptInvitationState>(
      builder: (context, state) {
        final cubit = context.read<AcceptInvitationCubit>();
        return Scaffold(
          appBar: AppBar(title: const Text('Set up your account')),
          body: SafeArea(
            child: ListView(
              padding: EdgeInsets.fromLTRB(
                AppSpacing.xl,
                AppSpacing.base,
                AppSpacing.xl,
                MediaQuery.viewInsetsOf(context).bottom + AppSpacing.xl,
              ),
              children: [
                Row(
                  children: [
                    CollegeLogo(college: widget.college, size: 40),
                    const SizedBox(width: AppSpacing.md),
                    Expanded(
                      child: Text(widget.college.name, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                    ),
                  ],
                ),
                const SizedBox(height: AppSpacing.xl),
                if (state.done) ...[
                  Icon(Icons.check_circle_rounded, size: 48, color: AppColors.success),
                  const SizedBox(height: AppSpacing.md),
                  Text('Your password is set.', textAlign: TextAlign.center, style: theme.textTheme.titleLarge),
                  const SizedBox(height: AppSpacing.sm),
                  Text(
                    'Sign in with your email and this password.',
                    textAlign: TextAlign.center,
                    style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                  ),
                  const SizedBox(height: AppSpacing.xl),
                  FilledButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Go to sign in')),
                ] else ...[
                  if (state.failure != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: AppSpacing.base),
                      child: Text(state.failure!.message, style: TextStyle(color: theme.colorScheme.error)),
                    ),
                  TextField(
                    controller: _token,
                    autocorrect: false,
                    enableSuggestions: false,
                    decoration: const InputDecoration(
                      labelText: 'Invitation code',
                      helperText: 'From the message you were sent.',
                    ),
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
                  TextField(
                    controller: _again,
                    obscureText: _obscure,
                    decoration: const InputDecoration(labelText: 'Repeat the password'),
                  ),
                  const SizedBox(height: AppSpacing.xl),
                  FilledButton(
                    onPressed: state.busy
                        ? null
                        : () {
                            FocusScope.of(context).unfocus();
                            cubit.submit(token: _token.text, password: _password.text, again: _again.text);
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
