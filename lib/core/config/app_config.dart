/// Build-time configuration.
///
/// Supplied with `--dart-define`, never committed, and never read from a file
/// that could be shipped. The default points at a local backend so a developer
/// can run the app without arguments; a release build must pass a real value.
class AppConfig {
  const AppConfig({
    required this.apiBaseUrl,
    required this.environment,
  });

  final String apiBaseUrl;
  final String environment;

  bool get isProduction => environment == 'production';

  static const AppConfig current = AppConfig(
    apiBaseUrl: String.fromEnvironment(
      'API_BASE_URL',
      // Android emulators reach the host machine through 10.0.2.2, which is the
      // single most common first-run stumble for a Flutter developer.
      defaultValue: 'http://localhost:3000',
    ),
    environment: String.fromEnvironment('ENVIRONMENT', defaultValue: 'development'),
  );
}
