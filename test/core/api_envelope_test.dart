import 'package:college_erp/core/error/failure.dart';
import 'package:college_erp/core/network/api_client.dart';
import 'package:flutter_test/flutter_test.dart';

/// The envelope is the contract between every client and the backend. Both the
/// web and mobile clients parse the same shape, so both pin it down.
void main() {
  String parseString(dynamic data) => data as String;

  group('response envelope', () {
    test('unwraps data on success', () {
      final result = parseEnvelope(200, {'data': 'value'}, parseString);
      expect(result.isOk, isTrue);
      expect(result.valueOrNull, 'value');
    });

    test('uses the server message verbatim rather than inventing copy', () {
      final result = parseEnvelope(409, {
        'error': {'code': 'CONFLICT', 'message': 'That institution code is already taken.'}
      }, parseString);
      expect(result.failureOrNull?.message, 'That institution code is already taken.');
      expect(result.failureOrNull?.code, FailureCode.conflict);
    });

    test('carries field errors through so forms can attach them', () {
      final result = parseEnvelope(422, {
        'error': {
          'code': 'VALIDATION_FAILED',
          'message': 'Check the highlighted fields.',
          'field_errors': {'code': 'Invalid'},
        }
      }, parseString);
      expect(result.failureOrNull?.fieldErrors, {'code': 'Invalid'});
    });

    test('treats an error body with a 200 status as a failure', () {
      final result = parseEnvelope(200, {
        'error': {'code': 'FORBIDDEN', 'message': 'No.'}
      }, parseString);
      expect(result.isOk, isFalse);
      expect(result.failureOrNull?.code, FailureCode.forbidden);
    });

    test('marks a 5xx transient, so the session survives it', () {
      final result = parseEnvelope(503, 'not json at all', parseString);
      expect(result.failureOrNull?.isTransient, isTrue);
    });

    test('a 4xx is not transient and must not be retried blindly', () {
      final result = parseEnvelope(403, {
        'error': {'code': 'FORBIDDEN', 'message': 'No.'}
      }, parseString);
      expect(result.failureOrNull?.isTransient, isFalse);
    });

    test('falls back to safe copy when the body is not the expected shape', () {
      final result = parseEnvelope(200, {'unexpected': true}, parseString);
      expect(result.failureOrNull?.message, contains('Something went wrong'));
    });

    test('a parse failure does not escape as an exception', () {
      final result = parseEnvelope(200, {'data': 42}, parseString);
      expect(result.isOk, isFalse);
    });

    test('never surfaces a raw status code as user-facing text', () {
      final result = parseEnvelope(500, {}, parseString);
      expect(result.failureOrNull!.message, isNot(matches(RegExp(r'\d{3}'))));
    });
  });
}
