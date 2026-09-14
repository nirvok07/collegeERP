/// ADM-5 (AD-81): a teaching room, as the phone needs it. Field names mirror the API.
class Room {
  const Room({
    required this.id,
    required this.campusId,
    required this.campusName,
    required this.code,
    required this.name,
    required this.kind,
    this.capacity,
    this.slotCount = 0,
  });

  final String id;
  final String campusId;
  final String campusName;
  final String code;
  final String name;
  final String kind;
  final int? capacity;

  /// Timetable slots that use it; the server refuses to archive a room in use.
  final int slotCount;

  static const kinds = ['classroom', 'lab', 'seminar', 'auditorium'];

  static String kindLabel(String kind) => switch (kind) {
        'lab' => 'Lab',
        'seminar' => 'Seminar room',
        'auditorium' => 'Auditorium',
        _ => 'Classroom',
      };

  String get summary => [
        kindLabel(kind),
        if (capacity != null) '$capacity seats',
        if (slotCount > 0) 'in $slotCount ${slotCount == 1 ? 'timetable slot' : 'timetable slots'}',
      ].join(' · ');

  static Room fromJson(dynamic json) {
    final m = json as Map;
    return Room(
      id: m['id'] as String,
      campusId: m['campus_id'] as String,
      campusName: m['campus_name'] as String? ?? '',
      code: m['code'] as String,
      name: m['name'] as String,
      kind: m['kind'] as String? ?? 'classroom',
      capacity: (m['capacity'] as num?)?.toInt(),
      slotCount: (m['slot_count'] as num?)?.toInt() ?? 0,
    );
  }
}
