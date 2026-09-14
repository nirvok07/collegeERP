import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/design/tokens.dart';
import '../../../core/di/locator.dart';
import '../../../core/session/authority.dart';
import '../../../core/session/college_brand.dart';
import '../../../core/widgets/screen_state.dart';
import '../../../core/widgets/status_chip.dart';
import '../data/people_api.dart';
import '../domain/person.dart';
import 'people_cubit.dart';
import 'person_sheet.dart';
import 'reset_code_screen.dart';
import '../../access/presentation/access_screen.dart';

/// People, for touch.
///
/// Not the desktop table narrowed: a list of two-line rows with an avatar, a
/// bottom sheet for detail, and pull-to-refresh instead of a toolbar button.
class PeopleScreen extends StatelessWidget {
  const PeopleScreen({super.key, this.authority, this.college});

  /// AD-80: decides whether "Reset password" is offered; the server decides again.
  final Authority? authority;

  /// For the reset message.
  final CollegeBrand? college;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => PeopleCubit(locator<PeopleApi>())..load(),
      child: _PeopleView(authority: authority, college: college),
    );
  }
}

class _PeopleView extends StatefulWidget {
  const _PeopleView({this.authority, this.college});

  final Authority? authority;
  final CollegeBrand? college;

  @override
  State<_PeopleView> createState() => _PeopleViewState();
}

class _PeopleViewState extends State<_PeopleView> {
  bool _searching = false;
  final _searchController = TextEditingController();

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  static const _resettable = {'invited', 'active', 'locked'};

  /// Someone else's account that can come back with a code; never your own,
  /// which is Change password in your Profile.
  bool _canReset(Person person) {
    final authority = widget.authority;
    if (authority == null || !authority.can('account.manage')) return false;
    if (!_resettable.contains(person.accountStatus)) return false;
    final me = authority.loginIdentifier?.toLowerCase();
    return me == null || person.email?.toLowerCase() != me;
  }

  /// The access list reads the college's assignments, which is `audit.read`.
  bool get _canSeeAccess => widget.authority?.can('audit.read') ?? false;

  void _open(Person person) => showPersonSheet(
    context,
    person,
    onReset: _canReset(person) ? () => _reset(person) : null,
    onAccess: _canSeeAccess
        ? () => Navigator.of(context).push(MaterialPageRoute<void>(
              builder: (_) => AccessScreen(
                personId: person.id,
                personName: person.fullName,
                canAssign: widget.authority?.can('role.assign') ?? false,
              ),
            ))
        : null,
  );

  Future<void> _reset(Person person) async {
    final invitation = person.accountStatus == 'invited';
    final go = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(invitation ? 'Send ${person.fullName} a new invitation?' : 'Reset ${person.fullName}\'s password?'),
        content: Text(
          invitation
              ? 'The earlier invitation stops working. You get a new one to hand over.'
              : 'You get a one-time code to hand to them. Their current password keeps working until they use it; '
                  'then they are signed out on every device.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(invitation ? 'New invitation' : 'Get reset code'),
          ),
        ],
      ),
    );
    if (go != true || !mounted) return;
    final navigator = Navigator.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final result = await locator<PeopleApi>().issueReset(person.id);
    if (!mounted) return;
    result.when(
      ok: (code) => navigator.push(MaterialPageRoute<void>(
        builder: (_) => ResetCodeScreen(code: code, name: person.fullName, college: widget.college),
      )),
      err: (failure) => messenger.showSnackBar(SnackBar(content: Text(failure.message))),
    );
  }

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<PeopleCubit, PeopleState>(
      builder: (context, state) {
        final cubit = context.read<PeopleCubit>();
        return Scaffold(
          appBar: AppBar(
            title: _searching
                ? TextField(
                    controller: _searchController,
                    autofocus: true,
                    decoration: const InputDecoration(
                      hintText: 'Search people',
                      border: InputBorder.none,
                      filled: false,
                    ),
                    onChanged: (value) {
                      cubit.searchChanged(value);
                      cubit.load(refresh: true);
                    },
                  )
                : const Text('People'),
            actions: [
              IconButton(
                icon: Icon(_searching ? Icons.close_rounded : Icons.search_rounded),
                tooltip: _searching ? 'Close search' : 'Search',
                onPressed: () {
                  setState(() => _searching = !_searching);
                  if (!_searching) {
                    _searchController.clear();
                    cubit.searchChanged('');
                    cubit.load(refresh: true);
                  }
                },
              ),
            ],
            bottom: state.status == LoadStatus.refreshing
                ? const PreferredSize(
                    preferredSize: Size.fromHeight(2),
                    child: LinearProgressIndicator(minHeight: 2),
                  )
                : null,
          ),
          body: switch (state.status) {
            LoadStatus.loading => const SkeletonList(),
            LoadStatus.failure => ErrorView(
                failure: state.failure!,
                onRetry: () => cubit.load(),
              ),
            LoadStatus.empty => RefreshIndicator(
                onRefresh: () => cubit.load(refresh: true),
                child: ListView(
                  children: [
                    SizedBox(height: MediaQuery.sizeOf(context).height * 0.2),
                    EmptyView(
                      title: state.search.isEmpty ? 'Nobody here yet' : 'No matches',
                      body: state.search.isEmpty
                          ? 'People invited to your college will appear here.'
                          : 'Nothing matches "${state.search}".',
                      icon: Icons.people_outline_rounded,
                    ),
                  ],
                ),
              ),
            _ => _PeopleList(people: state.people, onRefresh: () => cubit.load(refresh: true), onOpen: _open),
          },
        );
      },
    );
  }
}

class _PeopleList extends StatelessWidget {
  const _PeopleList({required this.people, required this.onRefresh, required this.onOpen});

  final List<Person> people;
  final Future<void> Function() onRefresh;
  final void Function(Person) onOpen;

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView.separated(
        // builder, not a mapped column: only visible rows are built, which is
        // what keeps a college of thousands scrolling at sixty frames.
        itemCount: people.length,
        separatorBuilder: (_, _) => const Divider(height: 1, indent: 72),
        itemBuilder: (context, index) => _PersonRow(
          person: people[index],
          onOpen: onOpen,
          // Only the first rows stagger. Past the cap the effect stops
          // explaining arrival order and only costs frames.
          index: index,
        ),
      ),
    );
  }
}

class _PersonRow extends StatelessWidget {
  const _PersonRow({required this.person, required this.index, required this.onOpen});

  final Person person;
  final int index;
  final void Function(Person) onOpen;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final row = ListTile(
      leading: CircleAvatar(
        backgroundColor: scheme.primaryContainer,
        child: Text(
          person.initials,
          style: TextStyle(color: scheme.onPrimaryContainer, fontWeight: FontWeight.w600),
        ),
      ),
      title: Text(person.fullName, maxLines: 1, overflow: TextOverflow.ellipsis),
      subtitle: Text(
        person.email ?? person.personType,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
      trailing: StatusChip(
        label: person.accountStatus ?? 'no account',
        tone: StatusChip.toneForAccount(person.accountStatus),
      ),
      onTap: () => onOpen(person),
    );

    if (index >= AppMotion.staggerLimit || AppMotion.reduced(context)) return row;

    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: AppMotion.panel,
      curve: AppMotion.easeOut,
      builder: (context, value, child) => Opacity(
        opacity: value,
        child: Transform.translate(
          offset: Offset(0, (1 - value) * AppMotion.rise),
          child: child,
        ),
      ),
      child: row,
    );
  }
}
