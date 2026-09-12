import '../../../core/error/result.dart';
import 'attendance_sheet.dart';

/// What the attendance screen needs, stated in the domain.
///
/// The cubit depends on this rather than on the HTTP client, so the classroom
/// flow is testable without a server.
abstract interface class AttendanceRepository {
  Future<Result<AttendanceSheet>> readSheet(String sessionId);

  /// One request for the whole batch, pinned to the version the teacher was
  /// looking at. The key makes a resend of the same batch safe (AD-58).
  Future<Result<int>> saveMarks({
    required String sessionId,
    required int version,
    required List<Map<String, Object?>> marks,
    required String idempotencyKey,
  });

  Future<Result<void>> submit({
    required String sessionId,
    required int version,
    required String idempotencyKey,
  });
}
