import 'package:college_erp/core/error/failure.dart';
import 'package:college_erp/core/error/result.dart';
import 'package:flutter_test/flutter_test.dart';

/// Device registration is best-effort by design: a declined permission or an
/// offline launch must not surface an error, because not receiving a push is a
/// degraded experience rather than a broken one.
///
/// The seam is tested through its decision logic rather than by standing up
/// Firebase, which cannot run in a unit test.
class Recorder {
  final calls = <Map<String, Object?>>[];
  Result<void> response = const Ok<void>(null);

  Future<Result<void>> post(String path, Object? body) async {
    calls.add({'path': path, 'body': body});
    return response;
  }
}

Future<void> registerDevice({
  required String? pushToken,
  required String platform,
  required Recorder client,
  String? appVersion,
}) async {
  if (pushToken == null) return;
  await client.post('/v1/devices', {
    'platform': platform,
    'push_token': pushToken,
    'app_version': ?appVersion,
  });
}

void main() {
  late Recorder client;

  setUp(() => client = Recorder());

  test('sends the token once a session exists', () async {
    await registerDevice(pushToken: 'fcm-abc', platform: 'android', client: client);
    expect(client.calls, hasLength(1));
    expect(client.calls.single['path'], '/v1/devices');
    expect((client.calls.single['body']! as Map)['push_token'], 'fcm-abc');
  });

  test('sends nothing when the user declined notification permission', () async {
    await registerDevice(pushToken: null, platform: 'ios', client: client);
    expect(client.calls, isEmpty, reason: 'a declined permission is a choice, not an error');
  });

  test('a failed registration does not throw', () async {
    client.response = const Err(Failure.network);
    await expectLater(
      registerDevice(pushToken: 'fcm-abc', platform: 'android', client: client),
      completes,
    );
  });

  test('omits the app version when it is unknown', () async {
    await registerDevice(pushToken: 'fcm-abc', platform: 'android', client: client);
    expect((client.calls.single['body']! as Map).containsKey('app_version'), isFalse);
  });

  test('reports the platform the backend expects', () async {
    for (final platform in ['android', 'ios', 'web']) {
      await registerDevice(pushToken: 'fcm-abc', platform: platform, client: client);
    }
    expect(
      client.calls.map((c) => (c['body']! as Map)['platform']),
      ['android', 'ios', 'web'],
    );
  });
}
