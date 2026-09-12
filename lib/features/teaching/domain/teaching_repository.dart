import '../../../core/error/result.dart';
import 'teaching_offering.dart';

/// What the teaching surface needs, stated in the domain.
///
/// The cubit depends on this rather than on the HTTP client, so the screen can
/// be tested without a server and the transport can change without touching
/// presentation.
abstract interface class TeachingRepository {
  /// The signed-in person's own teaching. There is deliberately no parameter
  /// naming a person or a section: the server derives the set from the token.
  Future<Result<List<TeachingOffering>>> myTeaching();
}
