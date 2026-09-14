import '../../../core/error/result.dart';
import '../../../core/network/api_client.dart';
import '../domain/person.dart';

/// Reads the same endpoints the web console uses. There is one API contract and
/// one set of business rules; this client only shapes the response.
class PeopleApi {
  const PeopleApi(this._client);
  final ApiClient _client;

  Future<Result<List<Person>>> list({String? search}) {
    final query = (search == null || search.isEmpty)
        ? ''
        : '?q=${Uri.encodeQueryComponent(search)}';
    return _client.get('/v1/people$query', (data) =>
        (data as List).map((json) => Person.fromJson(json as Map)).toList());
  }

  /// OTP-6 (AD-82): where the person's sign-in code goes. Null clears a field;
  /// the server refuses leaving an account nowhere to send one.
  Future<Result<void>> changeContact(String personId, {required String? email, required String? phone}) =>
      _client.patch('/v1/people/${Uri.encodeComponent(personId)}/contact', {'email': email, 'phone': phone}, (_) {});
}
