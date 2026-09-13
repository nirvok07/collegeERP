import 'package:college_erp/core/network/api_log_interceptor.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

/// API logs exist to debug requests, never to leak a credential. What matters:
/// every secret is masked wherever it sits, headers are never printed, and
/// ordinary values stay readable.
void main() {
  test('secrets are masked at any depth; ordinary values stay', () {
    final out = redact({
      'email': 'o@n.com',
      'password': 'mnisbuakt07',
      'data': {
        'access_token': 'a',
        'refresh_token': 'r',
        'invitation': {'token': 't', 'expires_at': '2026-09-20'},
        'items': [
          {'push_token': 'p', 'name': 'x'},
        ],
      },
      'code': 'sunrise',
    }) as Map;

    expect(out['email'], 'o@n.com');
    expect(out['password'], '***');
    final data = out['data'] as Map;
    expect(data['access_token'], '***');
    expect(data['refresh_token'], '***');
    expect((data['invitation'] as Map)['token'], '***');
    expect((data['invitation'] as Map)['expires_at'], '2026-09-20');
    expect(((data['items'] as List).single as Map)['push_token'], '***');
    expect(out['code'], 'sunrise', reason: 'a college code is not a secret');
  });

  test('on platform sign-in, the authenticator code is masked too', () {
    final lines = <String>[];
    ApiLogInterceptor(printer: lines.add).onRequest(
      RequestOptions(
        baseUrl: 'http://localhost:3000',
        path: '/v1/auth/platform/second-factor',
        method: 'POST',
        data: {'challenge_token': 'ch-secret', 'code': '123456'},
        headers: {'authorization': 'Bearer abc.def'},
      ),
      RequestInterceptorHandler(),
    );

    final line = lines.single;
    expect(line, startsWith('→ POST /v1/auth/platform/second-factor'));
    expect(line, isNot(contains('123456')));
    expect(line, isNot(contains('ch-secret')));
    expect(line, isNot(contains('Bearer')), reason: 'headers are never printed');
  });

  test('a response line carries status, method and path', () {
    final lines = <String>[];
    final options = RequestOptions(baseUrl: 'http://localhost:3000', path: '/v1/me/sessions', method: 'GET');
    final interceptor = ApiLogInterceptor(printer: lines.add)..onRequest(options, RequestInterceptorHandler());
    interceptor.onResponse(
      Response<dynamic>(requestOptions: options, statusCode: 200, data: {'data': []}),
      ResponseInterceptorHandler(),
    );
    expect(lines.last, startsWith('← 200 GET /v1/me/sessions'));
    expect(lines.last, contains('ms'));
  });
}
