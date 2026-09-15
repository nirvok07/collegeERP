import 'package:geolocator/geolocator.dart';

/// AD-83: where the phone is, once, in the foreground. Used to set a campus's
/// attendance area (SA-A1) and to punch in and out (SA-A2). Nothing here is
/// stored on the phone.
class LocationFix {
  const LocationFix({required this.latitude, required this.longitude, required this.accuracyM, required this.isMocked});

  final double latitude;
  final double longitude;

  /// Radius of uncertainty, metres.
  final double accuracyM;

  /// Android reports a position from a mock-location app; the server refuses it.
  final bool isMocked;
}

/// Why no position could be had, in words a person can act on.
class LocationUnavailable implements Exception {
  const LocationUnavailable(this.message);
  final String message;

  @override
  String toString() => message;
}

typedef Locate = Future<LocationFix> Function();

/// Asks for permission when needed. Throws [LocationUnavailable].
Future<LocationFix> currentLocation() async {
  if (!await Geolocator.isLocationServiceEnabled()) {
    throw const LocationUnavailable('Turn on location on this phone, then try again.');
  }
  var permission = await Geolocator.checkPermission();
  if (permission == LocationPermission.denied) permission = await Geolocator.requestPermission();
  if (permission == LocationPermission.denied) {
    throw const LocationUnavailable('Allow location for this app to continue.');
  }
  if (permission == LocationPermission.deniedForever) {
    throw const LocationUnavailable('Location is blocked for this app. Allow it in the phone\'s Settings.');
  }
  try {
    final p = await Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(accuracy: LocationAccuracy.best, timeLimit: Duration(seconds: 20)),
    );
    return LocationFix(latitude: p.latitude, longitude: p.longitude, accuracyM: p.accuracy, isMocked: p.isMocked);
  } catch (_) {
    throw const LocationUnavailable('Could not find where you are. Step into the open and try again.');
  }
}
