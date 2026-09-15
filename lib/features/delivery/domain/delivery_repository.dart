import '../../../core/error/result.dart';
import 'class_session.dart';

/// What the teacher's schedule needs, stated in the domain.
///
/// The cubit depends on this rather than on the HTTP client, so the screen is
/// testable without a server and the transport can change without touching
/// presentation.
abstract interface class DeliveryRepository {
  /// The signed-in person's own classes in a date window. There is deliberately
  /// no parameter naming a person or a section: the server derives the set from
  /// the token.
  Future<Result<List<ClassSession>>> mySessions({required String from, required String to});

  /// CR-1b: when [mySessions] for this window was last saved.
  Future<DateTime?> mySessionsSavedAt({required String from, required String to});

  /// Records that a class was taught. The server checks both the permission and
  /// that this person's teaching actually reaches the class (AD-40). The key
  /// makes a resend safe rather than "already recorded" (AD-58).
  Future<Result<void>> markTaught(String sessionId, {required String idempotencyKey});
}
