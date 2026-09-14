import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/design/tokens.dart';
import '../../../core/di/locator.dart';
import '../../../core/session/authority.dart';
import '../../../core/session/college_brand.dart';
import '../../../core/session/session_manager.dart';
import '../../../core/widgets/screen_state.dart';
import '../../../core/widgets/status_chip.dart';
import '../../../core/widgets/submit_dialog.dart';
import '../data/people_api.dart';
import '../domain/person.dart';
import 'people_cubit.dart';
import 'person_sheet.dart';
import '../../access/presentation/access_screen.dart';

/// People, for touch.
///
/// Not the desktop table narrowed: a list of two-line rows with an avatar, a
/// bottom sheet for detail, and pull-to-refresh instead of a toolbar button.
class PeopleScreen extends StatelessWidget {
  const PeopleScreen({super.key, this.authority, this.college});

  /// Decides which actions are offered; the server decides again.
  final Authority? authority;

  /// The college these people belong to.
  final CollegeBrand? college;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => PeopleCubit(locator<PeopleApi>(), selfId: locator<SessionManager>().actor?.id)..load(),
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

  /// The access list reads the college's assignments, which is `audit.read`.
  bool get _canSeeAccess => widget.authority?.can('audit.read') ?? false;

  /// OTP-6: where a person's sign-in code goes is account management.
  bool get _canEditContact => widget.authority?.can('account.manage') ?? false;

  Future<void> _editContact(Person person) async {
    final cubit = context.read<PeopleCubit>();
    final messenger = ScaffoldMessenger.of(context);
    final email = TextEditingController(text: person.email ?? '');
    final phone = TextEditingController(text: person.phone ?? '');
    String? orNull(TextEditingController c) => c.text.trim().isEmpty ? null : c.text.trim();
    final saved = await showSubmitDialog(
      context,
      title: '${person.fullName}: email or mobile',
      submitLabel: 'Save',
      controllers: [email, phone],
      fields: (_) => [
        Text(
          'Their sign-in code goes here. The old one stops working at once.',
          style: Theme.of(context).textTheme.bodySmall,
        ),
        const SizedBox(height: AppSpacing.base),
        TextField(
          controller: email,
          keyboardType: TextInputType.emailAddress,
          autocorrect: false,
          decoration: const InputDecoration(labelText: 'Email'),
        ),
        const SizedBox(height: AppSpacing.base),
        TextField(
          controller: phone,
          keyboardType: TextInputType.phone,
          decoration: const InputDecoration(labelText: 'Mobile number'),
        ),
      ],
      submit: () async => (await locator<PeopleApi>().changeContact(
        person.id,
        email: orNull(email),
        phone: orNull(phone),
      )).failureOrNull,
    );
    if (!saved || !mounted) return;
    messenger.showSnackBar(SnackBar(content: Text('${person.fullName}\'s contact is updated')));
    await cubit.load(refresh: true);
  }

  void _open(Person person) => showPersonSheet(
    context,
    person,
    onEditContact: _canEditContact ? () => _editContact(person) : null,
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
            LoadStatus.loading => const SkeletonList(rows: 8, leading: SkeletonLeading.avatar, trailing: SkeletonTrailing.chip, dividers: true, dividerIndent: 72),
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
