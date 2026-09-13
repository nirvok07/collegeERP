import '../../../core/error/result.dart';
import 'assessment.dart';

/// What the teacher's assessment screens need, stated in the domain, so the
/// cubits are testable without a server.
abstract interface class AssessmentRepository {
  /// The signed-in teacher's own components. No parameter names a person or a
  /// course: the server derives the set from the token.
  Future<Result<List<AssessmentComponent>>> myComponents();

  Future<Result<AssessmentSheet>> readSheet(String componentId);

  /// Every write below carries a key that makes a resend safe (AD-58).
  /// Returns the sheet's new version.
  Future<Result<int>> recordHeldOn({
    required String componentId,
    required int version,
    required String heldOn,
    required String idempotencyKey,
  });

  /// One request for the whole sheet, pinned to the version the teacher read.
  /// Returns the sheet's new version.
  Future<Result<int>> saveMarks({
    required String componentId,
    required int version,
    required List<Map<String, Object?>> marks,
    required String idempotencyKey,
  });

  Future<Result<void>> submit({
    required String componentId,
    required int version,
    required String idempotencyKey,
  });
}
