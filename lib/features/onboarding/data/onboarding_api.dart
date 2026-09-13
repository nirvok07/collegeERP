import '../../../core/error/result.dart';
import '../../../core/network/api_client.dart';
import '../domain/onboarding.dart';

/// What onboarding needs, as a port so the screens are testable without a server.
abstract interface class OnboardingRepository {
  Future<Result<List<DepartmentOption>>> departments();
  Future<Result<List<ProgramOption>>> programs();

  /// Invites a staff person with a department role, in one transaction.
  Future<Result<AppointedTeacher>> appointTeacher(TeacherInput input);

  /// Creates the person and the student record together.
  Future<Result<void>> admitStudent(StudentInput input);
}

/// The same endpoints the web console uses: one contract, one set of rules.
class OnboardingApi implements OnboardingRepository {
  const OnboardingApi(this._client);
  final ApiClient _client;

  @override
  Future<Result<List<DepartmentOption>>> departments() =>
      _client.get('/v1/departments', (data) => (data as List).map(DepartmentOption.fromJson).toList());

  @override
  Future<Result<List<ProgramOption>>> programs() =>
      _client.get('/v1/programs', (data) => (data as List).map(ProgramOption.fromJson).toList());

  @override
  Future<Result<AppointedTeacher>> appointTeacher(TeacherInput input) =>
      _client.post('/v1/people', input.toJson(), AppointedTeacher.fromJson);

  @override
  Future<Result<void>> admitStudent(StudentInput input) =>
      _client.post('/v1/students', input.toJson(), (_) {});
}
