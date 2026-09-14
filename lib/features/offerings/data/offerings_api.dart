import '../../../core/error/result.dart';
import '../../../core/network/api_client.dart';
import '../../curriculum/domain/curriculum.dart';
import '../../sections/domain/section.dart';
import '../domain/offering.dart';

/// ADM-7 (AD-81): the endpoints the web console uses for course offerings,
/// their teachers and their rosters. One contract, one set of rules.
abstract interface class OfferingsRepository {
  Future<Result<List<Offering>>> forSection(String sectionId);
  Future<Result<Offering>> offering(String id);
  Future<Result<List<Course>>> courses();
  Future<Result<void>> create({required String sectionId, required String courseId, required String component});
  Future<Result<void>> transition(String id, String to, {String? reason});
  Future<Result<List<StaffOption>>> staff();
  Future<Result<void>> assign(String offeringId, String personId, String role);
  Future<Result<void>> endAssignment(String assignmentId, String reason);
  Future<Result<List<RosterStudent>>> roster(String offeringId);

  /// The section's current members, the students a course of it can take.
  Future<Result<List<Member>>> sectionMembers(String sectionId);

  /// How many were enrolled, when the server says.
  Future<Result<int?>> enrolSection(String offeringId);
  Future<Result<void>> enrol(String offeringId, String studentId);
  Future<Result<void>> drop(String offeringId, String studentId, String reason);
}

class OfferingsApi implements OfferingsRepository {
  const OfferingsApi(this._client);
  final ApiClient _client;

  static void _ignore(dynamic _) {}
  static String _enc(String s) => Uri.encodeComponent(s);

  @override
  Future<Result<List<Offering>>> forSection(String sectionId) => _client.get(
    '/v1/offerings?section_id=${_enc(sectionId)}',
    (data) => (data as List).map(Offering.fromJson).toList(),
  );

  @override
  Future<Result<Offering>> offering(String id) => _client.get('/v1/offerings/${_enc(id)}', Offering.fromJson);

  @override
  Future<Result<List<Course>>> courses() =>
      _client.get('/v1/courses', (data) => (data as List).map(Course.fromJson).toList());

  @override
  Future<Result<void>> create({required String sectionId, required String courseId, required String component}) =>
      _client.post('/v1/offerings', {'section_id': sectionId, 'course_id': courseId, 'component': component}, _ignore);

  @override
  Future<Result<void>> transition(String id, String to, {String? reason}) =>
      _client.post('/v1/offerings/${_enc(id)}/status', {'status': to, 'reason': ?reason}, _ignore);

  @override
  Future<Result<List<StaffOption>>> staff() =>
      _client.get('/v1/people?type=staff', (data) => (data as List).map(StaffOption.fromJson).toList());

  @override
  Future<Result<void>> assign(String offeringId, String personId, String role) =>
      _client.post('/v1/offerings/${_enc(offeringId)}/instructors', {'person_id': personId, 'role': role}, _ignore);

  @override
  Future<Result<void>> endAssignment(String assignmentId, String reason) =>
      _client.post('/v1/instructor-assignments/${_enc(assignmentId)}/end', {'reason': reason}, _ignore);

  @override
  Future<Result<List<RosterStudent>>> roster(String offeringId) => _client.get(
    '/v1/offerings/${_enc(offeringId)}/roster',
    (data) => (((data as Map)['students'] as List?) ?? const []).map(RosterStudent.fromJson).toList(),
  );

  @override
  Future<Result<List<Member>>> sectionMembers(String sectionId) => _client.get(
    '/v1/students?section_id=${_enc(sectionId)}',
    (data) => (data as List).map(Member.fromJson).toList(),
  );

  @override
  Future<Result<int?>> enrolSection(String offeringId) => _client.post(
    '/v1/offerings/${_enc(offeringId)}/enrolments/cohort',
    const <String, Object?>{},
    (data) => data is Map ? (data['enrolled'] as num?)?.toInt() : null,
  );

  @override
  Future<Result<void>> enrol(String offeringId, String studentId) =>
      _client.post('/v1/offerings/${_enc(offeringId)}/enrolments', {'student_id': studentId}, _ignore);

  @override
  Future<Result<void>> drop(String offeringId, String studentId, String reason) => _client.post(
    '/v1/offerings/${_enc(offeringId)}/enrolments/${_enc(studentId)}/end',
    {'reason': reason},
    _ignore,
  );
}
