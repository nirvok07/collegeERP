import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../config/app_config.dart';

/// Adds API logs to a client's own Dio, in debug, non-production builds only.
///
/// Every client builds its Dio through this, so logging is one decision in one
/// place. A Dio passed in by a test is left alone.
Dio withApiLogs(Dio dio) {
  if (kDebugMode && !AppConfig.current.isProduction) dio.interceptors.add(ApiLogInterceptor());
  return dio;
}

/// Request and response logs for development: method, path, status, time and a
/// redacted, truncated body. Headers are never printed, because they carry the
/// bearer token; secrets inside bodies are replaced before printing.
class ApiLogInterceptor extends Interceptor {
  ApiLogInterceptor({void Function(String line)? printer}) : _print = printer ?? debugPrint;

  final void Function(String line) _print;

  static const _maxBody = 2000;
  static const _startedKey = 'api_log_started';

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    options.extra[_startedKey] = DateTime.now();
    _print('→ ${options.method} ${_target(options)}${_body(options.data, options.path)}');
    handler.next(options);
  }

  @override
  void onResponse(Response<dynamic> response, ResponseInterceptorHandler handler) {
    final options = response.requestOptions;
    _print('← ${response.statusCode} ${options.method} ${_target(options)} ${_elapsed(options)}'
        '${_body(response.data, options.path)}');
    handler.next(response);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    final options = err.requestOptions;
    final status = err.response?.statusCode;
    _print('✖ ${options.method} ${_target(options)} ${_elapsed(options)} ${err.type.name}'
        '${status == null ? '' : ' $status'}');
    handler.next(err);
  }

  static String _target(RequestOptions options) {
    final uri = options.uri;
    return uri.hasQuery ? '${uri.path}?${uri.query}' : uri.path;
  }

  static String _elapsed(RequestOptions options) {
    final started = options.extra[_startedKey];
    return started is DateTime ? '${DateTime.now().difference(started).inMilliseconds}ms' : '';
  }

  static String _body(Object? data, String path) {
    if (data == null) return '';
    final text = data is Map || data is List ? jsonEncode(redact(data, codeIsSecret: _isPlatformAuth(path))) : '$data';
    if (text.isEmpty) return '';
    return '\n  ${text.length > _maxBody ? '${text.substring(0, _maxBody)}… (${text.length} chars)' : text}';
  }

  /// On the platform sign-in endpoints `code` is an authenticator code;
  /// everywhere else it is a college or error code, which is worth seeing.
  static bool _isPlatformAuth(String path) => path.contains('/auth/platform/');
}

const _secretKeys = {
  'password',
  'refresh_token',
  'access_token',
  'token',
  'challenge_token',
  'manual_key',
  'otpauth_uri',
  'push_token',
};

/// Replaces secret values anywhere in a JSON-like value. Exported for tests.
Object? redact(Object? value, {bool codeIsSecret = false}) {
  if (value is Map) {
    return {
      for (final entry in value.entries)
        '${entry.key}': _isSecret('${entry.key}', codeIsSecret) ? '***' : redact(entry.value, codeIsSecret: codeIsSecret),
    };
  }
  if (value is List) return value.map((v) => redact(v, codeIsSecret: codeIsSecret)).toList();
  return value;
}

bool _isSecret(String key, bool codeIsSecret) {
  final k = key.toLowerCase();
  return _secretKeys.contains(k) || (codeIsSecret && k == 'code');
}
