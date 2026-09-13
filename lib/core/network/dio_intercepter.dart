import 'dart:developer';

import 'package:dio/dio.dart';

import 'api_log_interceptor.dart';

// ANSI color codes for styling the output
const String reset = '\x1B[0m';
const String red = '\x1B[31m';
const String green = '\x1B[32m';
const String yellow = '\x1B[33m';
const String blue = '\x1B[34m';
const String magenta = '\x1B[35m';
const String cyan = '\x1B[36m';
const String white = '\x1B[37m';
const String black = '\x1B[30m';

class CustomLogInterceptor extends Interceptor {
  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    log('${green}REQUEST [${options.method}] $blue${options.baseUrl}$white${options.path}');
    if (options.headers['Authorization'] != null) {
      log('${white}Token: ***');
    }
    if (options.data is! FormData &&
        options.data != null &&
        options.data!.isNotEmpty) {
      log('${green}Sending Data: $magenta${redact(options.data, codeIsSecret: options.path.contains('/auth/platform/'))}');
    }
    if (options.queryParameters.isNotEmpty) {
      log('${magenta}Sending Query: ${options.queryParameters}');
    }
    super.onRequest(options, handler);
  }

  @override
  void onResponse(Response response, ResponseInterceptorHandler handler) {
    log('$white${response.requestOptions.path}',
        name: 'RESPONSE [${response.statusCode}]');
    if (response.requestOptions.path != 'DisplayOnlineExam' ||
        response.requestOptions.path != 'FeeBackStudent') {
      log(
        '$magenta${redact(response.data, codeIsSecret: response.requestOptions.path.contains('/auth/platform/'))}',
        name: 'Data',
      );
    }
    super.onResponse(response, handler);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    log('${red}ERROR [${err.response?.statusCode}] $blue${err.requestOptions.baseUrl}$white${err.requestOptions.path}');
    log('${red}Message: $yellow${err.message}');
    log('$red${err.response.toString()}', name: 'Error');
    log('${red}status: $yellow${err.response?.statusMessage}');
    if (err.error != null) {
      log('${red}Error: ${err.error.toString()}');
    }
    super.onError(err, handler);
  }
}
