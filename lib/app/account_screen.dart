import 'package:flutter/material.dart';

import '../core/design/tokens.dart';
import '../core/di/locator.dart';
import '../core/error/result.dart';
import '../core/saved_reads/saved_reads.dart';
import '../core/session/authority.dart';
import '../core/session/college_brand.dart';
import '../core/session/session_manager.dart';
import '../core/session/session_store.dart';
import '../core/widgets/college_logo.dart';
import '../core/widgets/saved_freshness.dart';
import '../core/widgets/screen_state.dart';
import 'sign_out.dart';

/// The person's own details, and only here (UX-2): the dashboard no longer
/// shows a name or an email.
///
/// Unlike the rest of the app's saved-first screens (AD-9 amended), this one
/// does not refresh itself in the background: once shown, it opens on what
/// was saved until the user pulls to refresh. The saved copy is cleared like
/// every other one, at sign-in and sign-out (`SavedReads.clear`).
class AccountScreen extends StatefulWidget {
  const AccountScreen({super.key});

  @override
  State<AccountScreen> createState() => _AccountScreenState();
}

class _AccountScreenState extends State<AccountScreen> {
  late Future<(Result<Authority>, CollegeBrand?, DateTime?)> _load = _read(refresh: false);

  Future<(Result<Authority>, CollegeBrand?, DateTime?)> _read({required bool refresh}) async {
    if (!refresh) {
      Result<Authority>? saved;
      final hit = await fromSaved(() async {
        saved = await locator<AuthorityApi>().mine();
      });
      if (hit && saved != null) {
        final college = await locator<SessionStore>().readCollege();
        final updatedAt = await locator<AuthorityApi>().mineSavedAt();
        return (saved!, college, updatedAt);
      }
    }
    final results = await Future.wait<Object?>([
      locator<AuthorityApi>().mine(),
      locator<SessionStore>().readCollege(),
    ]);
    final result = results[0] as Result<Authority>;
    final updatedAt = result.valueOrNull == null ? null : await locator<AuthorityApi>().mineSavedAt();
    return (result, results[1] as CollegeBrand?, updatedAt);
  }

  Future<void> _refresh() async {
    final next = _read(refresh: true);
    setState(() {
      _load = next;
    });
    await next;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: FutureBuilder<(Result<Authority>, CollegeBrand?, DateTime?)>(
        future: _load,
        builder: (context, snapshot) {
          final data = snapshot.data;
          if (data == null) return const SkeletonList(rows: 3, detailHeader: true, leading: SkeletonLeading.icon, subtitle: false);
          final (result, college, updatedAt) = data;
          final authority = result.valueOrNull;
          if (authority == null) {
            return ErrorView(
              failure: result.failureOrNull!,
              onRetry: () => setState(() => _load = _read(refresh: false)),
            );
          }
          return RefreshIndicator(
            onRefresh: _refresh,
            child: _Profile(authority: authority, college: college, updatedAt: updatedAt),
          );
        },
      ),
    );
  }
}

class _Profile extends StatelessWidget {
  const _Profile({required this.authority, required this.college, this.updatedAt});

  final Authority authority;
  final CollegeBrand? college;
  final DateTime? updatedAt;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final name = authority.fullName ?? locator<SessionManager>().actor?.fullName ?? 'Signed in';

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(AppSpacing.base),
      children: [
        if (updatedAt != null) SavedFreshness(at: updatedAt),
        Container(
          padding: const EdgeInsets.all(AppSpacing.base),
          decoration: BoxDecoration(
            color: AppColors.navy,
            borderRadius: BorderRadius.circular(AppRadius.panel),
          ),
          child: Row(
            children: [
              InitialsAvatar(name: name, size: 56),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(name, style: theme.textTheme.titleLarge?.copyWith(color: Colors.white, fontWeight: FontWeight.w700)),
                    if (authority.loginIdentifier != null)
                      Text(
                        authority.loginIdentifier!,
                        style: theme.textTheme.bodyMedium?.copyWith(color: Colors.white70),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        if (college != null)
          _Section(
            title: 'College',
            child: Row(
              children: [
                CollegeLogo(college: college!, size: 36),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(college!.name, style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
                      Text('Code ${college!.code}', style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant)),
                    ],
                  ),
                ),
              ],
            ),
          ),
        _Section(
          title: 'Your roles',
          child: authority.roles.isEmpty
              ? Text('No role yet. Ask your College Administrator.', style: theme.textTheme.bodyMedium)
              : Column(
                  children: [
                    for (final role in authority.roles)
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        dense: true,
                        leading: Icon(Icons.verified_user_outlined, color: scheme.primary),
                        title: Text(role.label),
                        subtitle: Text(role.scopeLabel),
                      ),
                  ],
                ),
        ),
        const SizedBox(height: AppSpacing.sm),
        ListTile(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadius.card),
            side: BorderSide(color: scheme.outlineVariant),
          ),
          leading: Icon(Icons.logout_rounded, color: scheme.error),
          title: Text('Sign out', style: TextStyle(color: scheme.error)),
          onTap: () => signOutFromDevice(context),
        ),
      ],
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.child});
  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: AppSpacing.md),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.base),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: AppSpacing.sm),
            child,
          ],
        ),
      ),
    );
  }
}

/// Up to two initials on the primary colour, the person's mark in the app.
class InitialsAvatar extends StatelessWidget {
  const InitialsAvatar({super.key, required this.name, this.size = 48});

  final String name;
  final double size;

  static String initialsOf(String name) {
    final words = name.trim().split(RegExp(r'\s+')).where((w) => w.isNotEmpty).toList();
    if (words.isEmpty) return '?';
    final first = words.first.characters.first;
    final last = words.length > 1 ? words.last.characters.first : '';
    return (first + last).toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return ExcludeSemantics(
      child: Container(
        width: size,
        height: size,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: scheme.primary,
          borderRadius: BorderRadius.circular(size * 0.3),
        ),
        child: Text(
          initialsOf(name),
          style: TextStyle(
            color: scheme.onPrimary,
            fontWeight: FontWeight.w700,
            fontSize: size * 0.36,
          ),
        ),
      ),
    );
  }
}
