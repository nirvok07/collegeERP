import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/design/tokens.dart';
import '../../../core/di/locator.dart';
import '../../../core/session/authority.dart';
import '../../../core/widgets/screen_state.dart';
import '../../../core/widgets/submit_dialog.dart';
import '../../../core/widgets/app_list_tile.dart';
import '../data/rooms_api.dart';
import '../domain/room.dart';
import 'rooms_cubit.dart';

/// ADM-5 (AD-81): the college's teaching rooms, by campus. Anyone who can see
/// the timetable sees them; `room.manage` adds, edits and archives them. The
/// server refuses to archive a room the timetable still uses.
class RoomsScreen extends StatelessWidget {
  const RoomsScreen({super.key, this.authority, this.repository});

  final Authority? authority;

  /// Tests supply their own; the app uses the server.
  final RoomsRepository? repository;

  @override
  Widget build(BuildContext context) {
    final manage = authority?.can('room.manage') ?? false;
    return BlocProvider(
      create: (_) => RoomsCubit(repository ?? locator<RoomsRepository>(), manage: manage)..load(),
      child: _RoomsView(canManage: manage),
    );
  }
}

void _say(BuildContext context, String message) =>
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));

class _RoomsView extends StatelessWidget {
  const _RoomsView({required this.canManage});

  final bool canManage;

  /// One form for a new room and for editing one; the code and campus are
  /// fixed once a room exists, because the timetable names it by them.
  Future<void> _edit(BuildContext context, RoomsState state, Room? room) async {
    final cubit = context.read<RoomsCubit>();
    if (room == null && state.campuses.isEmpty) {
      _say(context, 'Add a campus in Organisation first.');
      return;
    }
    var campusId = room?.campusId ?? state.campuses.first.id;
    var kind = room?.kind ?? 'classroom';
    final code = TextEditingController(text: room?.code);
    final name = TextEditingController(text: room?.name);
    final capacity = TextEditingController(text: room?.capacity?.toString() ?? '');
    final saved = await showSubmitDialog(
      context,
      title: room == null ? 'Add a room' : 'Edit ${room.code}',
      submitLabel: room == null ? 'Add room' : 'Save',
      controllers: [code, name, capacity],
      fields: (refresh) => [
        if (room == null) ...[
          if (state.campuses.length > 1) ...[
            DropdownButtonFormField<String>(
              initialValue: campusId,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Campus'),
              items: [for (final c in state.campuses) DropdownMenuItem(value: c.id, child: Text(c.name))],
              onChanged: (v) => campusId = v ?? campusId,
            ),
            const SizedBox(height: AppSpacing.base),
          ],
          TextField(
            controller: code,
            autofocus: true,
            textCapitalization: TextCapitalization.characters,
            autocorrect: false,
            decoration: const InputDecoration(labelText: 'Room code', helperText: 'Such as LH-204. It cannot change later.'),
          ),
          const SizedBox(height: AppSpacing.base),
        ],
        TextField(controller: name, decoration: const InputDecoration(labelText: 'Name', hintText: 'Lecture Hall 204')),
        const SizedBox(height: AppSpacing.base),
        DropdownButtonFormField<String>(
          initialValue: kind,
          decoration: const InputDecoration(labelText: 'Type'),
          items: [for (final k in Room.kinds) DropdownMenuItem(value: k, child: Text(Room.kindLabel(k)))],
          onChanged: (v) => refresh(() => kind = v ?? kind),
        ),
        const SizedBox(height: AppSpacing.base),
        TextField(
          controller: capacity,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(labelText: 'Seats (optional)'),
        ),
      ],
      submit: () async {
        final seats = capacity.text.trim().isEmpty ? null : int.tryParse(capacity.text.trim());
        if (room == null && code.text.trim().isEmpty) return invalidInput('Enter a room code.');
        if (name.text.trim().isEmpty) return invalidInput('Enter a name.');
        if (capacity.text.trim().isNotEmpty && (seats == null || seats < 1 || seats > 2000)) {
          return invalidInput('Seats are a number from 1 to 2000, or empty.');
        }
        return room == null
            ? cubit.create(campusId: campusId, code: code.text, name: name.text, kind: kind, capacity: seats)
            : cubit.update(room.id, name: name.text, kind: kind, capacity: seats);
      },
    );
    if (saved && context.mounted) _say(context, room == null ? 'Room added' : 'Room saved');
  }

  Future<void> _archive(BuildContext context, Room room) async {
    final cubit = context.read<RoomsCubit>();
    final done = await showSubmitDialog(
      context,
      title: 'Archive ${room.code}?',
      submitLabel: 'Archive',
      destructive: true,
      fields: (_) => [
        Text(room.slotCount > 0
            ? '${room.code} is in the timetable. Move those classes to another room first.'
            : 'It stops being offered for new classes. Past classes held there keep it.'),
      ],
      submit: () async => cubit.archive(room.id),
    );
    if (done && context.mounted) _say(context, '${room.code} archived');
  }

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<RoomsCubit, RoomsState>(
      builder: (context, state) {
        final cubit = context.read<RoomsCubit>();
        final theme = Theme.of(context);
        return Scaffold(
          appBar: AppBar(title: const Text('Rooms')),
          floatingActionButton: canManage && state.status == LoadStatus.success
              ? FloatingActionButton.extended(
                  onPressed: () => _edit(context, state, null),
                  icon: const Icon(Icons.add_rounded),
                  label: const Text('Add room'),
                )
              : null,
          body: switch (state.status) {
            LoadStatus.loading => const SkeletonList(rows: 5, leading: SkeletonLeading.avatar, groupEvery: 5),
            LoadStatus.failure => ErrorView(failure: state.failure!, onRetry: cubit.load),
            _ => RefreshIndicator(
                onRefresh: () => cubit.load(refresh: true),
                child: state.rooms.isEmpty
                    ? ListView(
                        children: [
                          SizedBox(height: MediaQuery.sizeOf(context).height * 0.15),
                          EmptyView(
                            title: 'No rooms yet',
                            body: canManage
                                ? 'Add the classrooms and labs where teaching happens. The timetable places classes in them.'
                                : 'Your college administrator adds rooms.',
                            icon: Icons.meeting_room_outlined,
                          ),
                        ],
                      )
                    : ListView(
                        padding: const EdgeInsets.only(bottom: 88),
                        children: [
                          if (state.failure != null)
                            Padding(
                              padding: const EdgeInsets.all(AppSpacing.base),
                              child: Text(state.failure!.message, style: TextStyle(color: theme.colorScheme.error)),
                            ),
                          for (final entry in state.byCampus.entries) ...[
                            Padding(
                              padding: const EdgeInsets.fromLTRB(AppSpacing.base, AppSpacing.base, AppSpacing.base, AppSpacing.xs),
                              child: Text(
                                entry.key,
                                style: theme.textTheme.labelLarge?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                              ),
                            ),
                            for (final room in entry.value)
                              AppListTile(
                                leading: CircleAvatar(
                                  backgroundColor: theme.colorScheme.secondaryContainer,
                                  child: Icon(
                                    room.kind == 'lab' ? Icons.science_rounded : Icons.meeting_room_rounded,
                                    size: 20,
                                    color: theme.colorScheme.onSecondaryContainer,
                                  ),
                                ),
                                title: Text('${room.code} · ${room.name}'),
                                subtitle: Text(room.summary),
                                trailing: canManage
                                    ? PopupMenuButton<String>(
                                        tooltip: 'More for ${room.code}',
                                        onSelected: (choice) =>
                                            choice == 'edit' ? _edit(context, state, room) : _archive(context, room),
                                        itemBuilder: (_) => const [
                                          PopupMenuItem(value: 'edit', child: Text('Edit')),
                                          PopupMenuItem(value: 'archive', child: Text('Archive')),
                                        ],
                                      )
                                    : null,
                              ),
                          ],
                        ],
                      ),
              ),
          },
        );
      },
    );
  }
}
