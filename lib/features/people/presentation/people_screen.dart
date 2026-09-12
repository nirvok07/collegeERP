import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/design/tokens.dart';
import '../../../core/di/locator.dart';
import '../../../core/widgets/screen_state.dart';
import '../../../core/widgets/status_chip.dart';
import '../data/people_api.dart';
import '../domain/person.dart';
import 'people_cubit.dart';
import 'person_sheet.dart';

/// People, for touch.
///
/// Not the desktop table narrowed: a list of two-line rows with an avatar, a
/// bottom sheet for detail, and pull-to-refresh instead of a toolbar button.
class PeopleScreen extends StatelessWidget {
  const PeopleScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => PeopleCubit(locator<PeopleApi>())..load(),
      child: const _PeopleView(),
    );
  }
}

class _PeopleView extends StatefulWidget {
  const _PeopleView();

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
            _ => _PeopleList(people: state.people, onRefresh: () => cubit.load(refresh: true)),
          },
        );
      },
    );
  }
}

class _PeopleList extends StatelessWidget {
  const _PeopleList({required this.people, required this.onRefresh});

  final List<Person> people;
  final Future<void> Function() onRefresh;

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
          // Only the first rows stagger. Past the cap the effect stops
          // explaining arrival order and only costs frames.
          index: index,
        ),
      ),
    );
  }
}

class _PersonRow extends StatelessWidget {
  const _PersonRow({required this.person, required this.index});

  final Person person;
  final int index;

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
      onTap: () => showPersonSheet(context, person),
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
