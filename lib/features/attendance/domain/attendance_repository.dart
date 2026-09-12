import '../../../core/error/result.dart';
import 'attendance_sheet.dart';

/// What the attendance screen needs, stated in the domain.
///
/// The cubit depends on this rather than on the HTTP client, so the classroom
/// flow is testable without a server.
abstract interface class AttendanceRepository {
  Future<Result<AttendanceSheet>> readSheet(String sessionId);

  /// One request for the whole batch. Sixty students is never sixty requests,
  /// and the version pins the write to the register the teacher was looking at.
  Future<Result<int>> saveMarks({
    required String sessionId,
    required int version,
    required List<Map<String, Object?>> marks,
  });

  Future<Result<void>> submit({required String sessionId, required int version});
}
