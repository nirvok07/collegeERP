import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../core/design/tokens.dart';
import '../../core/error/failure.dart';
import '../../core/error/result.dart';
import '../../core/widgets/screen_state.dart';
import '../../core/widgets/status_chip.dart';
import '../../core/widgets/submit_dialog.dart';
import '../admin_locator.dart';
import '../platform_authority.dart';
import 'platform_api.dart';

class AccountsState {
  const AccountsState({this.status = LoadStatus.loading, this.accounts = const [], this.failure});

  final LoadStatus status;
  final List<PlatformAccount> accounts;
  final Failure? failure;
}

class AccountsCubit extends Cubit<AccountsState> {
  AccountsCubit(this.repository) : super(const AccountsState());

  final PlatformRepository repository;

  Future<void> load() async {
    final result = await repository.accounts();
    if (isClosed) return;
    result.when(
      ok: (list) => emit(AccountsState(
        status: LoadStatus.success,
        accounts: [...list]..sort((a, b) => a.fullName.compareTo(b.fullName)),
      )),
      err: (f) => emit(AccountsState(status: LoadStatus.failure, accounts: state.accounts, failure: f)),
    );
  }
}

ChipTone _tone(String status) => switch (status) {
      'active' => ChipTone.success,
      'invited' => ChipTone.info,
      'suspended' => ChipTone.warning,
      _ => ChipTone.neutral,
    };

/// Shows a platform invitation once, to copy and hand over. Nothing is emailed.
Future<void> showPlatformInvite(BuildContext context, PlatformInvite invite) => showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Invitation for ${invite.account.fullName}'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SelectableText(invite.message),
            const SizedBox(height: AppSpacing.md),
            Text('Shown only once. It is not an authenticator key.', style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () async {
              await Clipboard.setData(ClipboardData(text: invite.message));
              if (context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Message copied')));
              }
            },
            child: const Text('Copy message'),
          ),
          FilledButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Done')),
        ],
      ),
    );

/// SAM-3 (AD-72, AD-81): the people who run the platform. Owners invite them
/// and manage them; nobody changes their own account, and the platform always
/// keeps an active Owner (the server refuses otherwise, and says so).
class PlatformAccountsScreen extends StatelessWidget {
  const PlatformAccountsScreen({super.key, required this.authority, this.repository});

  final PlatformAuthority authority;

  /// Tests supply their own; the app uses the registered one.
  final PlatformRepository? repository;

  Future<void> _invite(BuildContext context) async {
    final cubit = context.read<AccountsCubit>();
    final email = TextEditingController();
    final name = TextEditingController();
    var role = 'support';
    PlatformInvite? issued;
    final done = await showSubmitDialog(
      context,
      title: 'Invite to the platform',
      submitLabel: 'Invite',
      controllers: [email, name],
      fields: (refresh) => [
        TextField(controller: name, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Full name')),
        const SizedBox(height: AppSpacing.base),
        TextField(controller: email, keyboardType: TextInputType.emailAddress, autocorrect: false, decoration: const InputDecoration(labelText: 'Email')),
        const SizedBox(height: AppSpacing.base),
        SegmentedButton<String>(
          segments: const [
            ButtonSegment(value: 'support', label: Text('Support')),
            ButtonSegment(value: 'owner', label: Text('Owner')),
          ],
          selected: {role},
          onSelectionChanged: (s) => refresh(() => role = s.first),
        ),
        const SizedBox(height: AppSpacing.sm),
        Text(
          role == 'owner' ? 'An Owner can manage every college and every platform account.' : 'Support can see colleges and the audit, and change nothing.',
          style: Theme.of(context).textTheme.bodySmall,
        ),
      ],
      submit: () async {
        if (name.text.trim().length < 2) return invalidInput('Enter their full name.');
        if (!RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(email.text.trim())) return invalidInput('Enter a valid email address.');
        final result = await cubit.repository.invite(email: email.text.trim().toLowerCase(), fullName: name.text.trim(), role: role);
        issued = result.valueOrNull;
        return result.failureOrNull;
      },
    );
    if (!done || issued == null || !context.mounted) return;
    await showPlatformInvite(context, issued!);
    if (context.mounted) await cubit.load();
  }

  @override
  Widget build(BuildContext context) {
    final canManage = authority.can('platform.accounts.manage');
    return BlocProvider(
      create: (_) => AccountsCubit(repository ?? adminLocator<PlatformRepository>())..load(),
      child: BlocBuilder<AccountsCubit, AccountsState>(
        builder: (context, state) {
          final cubit = context.read<AccountsCubit>();
          return Scaffold(
            appBar: AppBar(title: const Text('Platform accounts')),
            floatingActionButton: canManage
                ? FloatingActionButton.extended(
                    onPressed: () => _invite(context),
                    icon: const Icon(Icons.person_add_alt_1_rounded),
                    label: const Text('Invite'),
                  )
                : null,
            body: switch (state.status) {
              LoadStatus.loading => const SkeletonList(rows: 4),
              LoadStatus.failure => ErrorView(failure: state.failure!, onRetry: cubit.load),
              _ => RefreshIndicator(
                  onRefresh: cubit.load,
                  child: ListView(
                    padding: const EdgeInsets.only(bottom: 88),
                    children: [
                      for (final a in state.accounts)
                        ListTile(
                          title: Text(a.isYou ? '${a.fullName} (you)' : a.fullName),
                          subtitle: Text('${a.email} · ${PlatformAccount.roleLabel(a.role)}${a.mfaEnrolled ? '' : ' · authenticator not set up'}'),
                          trailing: StatusChip(label: PlatformAccount.statusLabel(a.status), tone: _tone(a.status)),
                          onTap: () async {
                            await Navigator.of(context).push(MaterialPageRoute<void>(
                              builder: (_) => PlatformAccountScreen(id: a.id, authority: authority, repository: cubit.repository),
                            ));
                            if (context.mounted) await cubit.load();
                          },
                        ),
                    ],
                  ),
                ),
            },
          );
        },
      ),
    );
  }
}

class AccountState {
  const AccountState({this.status = LoadStatus.loading, this.account, this.failure});

  final LoadStatus status;
  final PlatformAccount? account;
  final Failure? failure;
}

class AccountCubit extends Cubit<AccountState> {
  AccountCubit(this.repository, this.id) : super(const AccountState());

  final PlatformRepository repository;
  final String id;

  Future<void> load() async {
    final result = await repository.account(id);
    if (isClosed) return;
    result.when(
      ok: (a) => emit(AccountState(status: LoadStatus.success, account: a)),
      err: (f) => emit(AccountState(status: state.account == null ? LoadStatus.failure : LoadStatus.success, account: state.account, failure: f)),
    );
  }

  /// Every change returns the account as it now is; the screen shows that.
  Future<Failure?> apply(Future<Result<PlatformAccount>> write) async {
    final result = await write;
    if (isClosed) return null;
    return result.when(
      ok: (a) {
        emit(AccountState(status: LoadStatus.success, account: a));
        return null;
      },
      err: (f) => f,
    );
  }
}

/// One platform account and what may be done to it now.
class PlatformAccountScreen extends StatelessWidget {
  const PlatformAccountScreen({super.key, required this.id, required this.authority, required this.repository});

  final String id;
  final PlatformAuthority authority;
  final PlatformRepository repository;

  static String _actionLabel(String action) => switch (action) {
        'disable' => 'Disable',
        'enable' => 'Enable',
        'change_role' => 'Change role',
        'reset_mfa' => 'Reset authenticator',
        'reissue_invitation' => 'New invitation',
        _ => action,
      };

  Future<void> _act(BuildContext context, PlatformAccount a, String action) async {
    final cubit = context.read<AccountCubit>();
    final messenger = ScaffoldMessenger.of(context);
    if (action == 'reissue_invitation') {
      final result = await repository.reissue(a.id);
      if (!context.mounted) return;
      final invite = result.valueOrNull;
      if (invite == null) {
        messenger.showSnackBar(SnackBar(content: Text(result.failureOrNull?.message ?? 'That did not work.')));
        return;
      }
      await showPlatformInvite(context, invite);
      await cubit.load();
      return;
    }
    var role = a.role == 'owner' ? 'support' : 'owner';
    final reason = TextEditingController();
    final done = await showSubmitDialog(
      context,
      title: '${_actionLabel(action)}: ${a.fullName}?',
      submitLabel: _actionLabel(action),
      destructive: action == 'disable' || action == 'reset_mfa',
      controllers: [reason],
      fields: (refresh) => [
        Text(switch (action) {
          'disable' => '${a.fullName} is signed out everywhere and cannot sign in until enabled again.',
          'enable' => '${a.fullName} can sign in again with their password and authenticator.',
          'reset_mfa' => 'Their authenticator stops working. They set up a new one at their next sign-in.',
          _ => 'Their authority changes from their next action.',
        }),
        if (action == 'change_role') ...[
          const SizedBox(height: AppSpacing.sm),
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'owner', label: Text('Owner')),
              ButtonSegment(value: 'support', label: Text('Support')),
            ],
            selected: {role},
            onSelectionChanged: (s) => refresh(() => role = s.first),
          ),
        ],
        const SizedBox(height: AppSpacing.base),
        TextField(controller: reason, decoration: const InputDecoration(labelText: 'Reason', helperText: 'Recorded in the platform audit')),
      ],
      submit: () async {
        if (reason.text.trim().isEmpty) return invalidInput('Say why, in a few words.');
        final r = reason.text.trim();
        return cubit.apply(switch (action) {
          'disable' || 'enable' => repository.setStatus(a.id, action, r),
          'reset_mfa' => repository.resetAuthenticator(a.id, r),
          _ => repository.changeRole(a.id, role: role, expectedRole: a.role, reason: r),
        });
      },
    );
    if (done) messenger.showSnackBar(SnackBar(content: Text('${_actionLabel(action)}: done')));
  }

  bool _may(String action) =>
      action == 'change_role' ? authority.can('platform.roles.manage') : authority.can('platform.accounts.manage');

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => AccountCubit(repository, id)..load(),
      child: BlocBuilder<AccountCubit, AccountState>(
        builder: (context, state) {
          final cubit = context.read<AccountCubit>();
          final a = state.account;
          final theme = Theme.of(context);
          Widget fact(String label, String value) => ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(label, style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                subtitle: Text(value, style: theme.textTheme.bodyLarge),
              );
          return Scaffold(
            appBar: AppBar(title: Text(a?.fullName ?? 'Account')),
            body: switch (state.status) {
              LoadStatus.loading => const SkeletonList(rows: 4),
              LoadStatus.failure => ErrorView(failure: state.failure!, onRetry: cubit.load),
              _ => ListView(
                  padding: const EdgeInsets.all(AppSpacing.base),
                  children: [
                    Row(
                      children: [
                        Expanded(child: Text(a!.fullName, style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700))),
                        StatusChip(label: PlatformAccount.statusLabel(a.status), tone: _tone(a.status)),
                      ],
                    ),
                    if (state.failure != null)
                      Padding(
                        padding: const EdgeInsets.only(top: AppSpacing.sm),
                        child: Text(state.failure!.message, style: TextStyle(color: theme.colorScheme.error)),
                      ),
                    fact('Email', a.email),
                    fact('Role', PlatformAccount.roleLabel(a.role)),
                    fact('Authenticator', a.mfaEnrolled ? 'Set up' : 'Not set up yet'),
                    fact('Last sign-in', a.lastLoginAt == null ? 'Never' : '${a.lastLoginAt!.toLocal()}'.substring(0, 16)),
                    if (a.isYou)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
                        child: Text('This is you. Another Owner changes your account.', style: theme.textTheme.bodySmall),
                      ),
                    if (!a.isYou && a.actions.where(_may).isNotEmpty) ...[
                      const SizedBox(height: AppSpacing.sm),
                      Wrap(
                        spacing: AppSpacing.sm,
                        runSpacing: AppSpacing.sm,
                        children: [
                          for (final action in a.actions.where(_may))
                            action == 'disable' || action == 'reset_mfa'
                                ? OutlinedButton(
                                    style: OutlinedButton.styleFrom(foregroundColor: theme.colorScheme.error),
                                    onPressed: () => _act(context, a, action),
                                    child: Text(_actionLabel(action)),
                                  )
                                : FilledButton.tonal(onPressed: () => _act(context, a, action), child: Text(_actionLabel(action))),
                        ],
                      ),
                    ],
                    if (a.roleHistory.isNotEmpty) ...[
                      const Divider(height: AppSpacing.xl),
                      Text('Role history', style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                      for (final h in a.roleHistory)
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          title: Text(PlatformAccount.roleLabel(h.role)),
                          subtitle: Text([
                            'from ${'${h.grantedAt.toLocal()}'.substring(0, 10)}',
                            if (h.endedAt != null) 'to ${'${h.endedAt!.toLocal()}'.substring(0, 10)}',
                            if (h.reason != null) h.reason!,
                          ].join(' · ')),
                        ),
                    ],
                  ],
                ),
            },
          );
        },
      ),
    );
  }
}
