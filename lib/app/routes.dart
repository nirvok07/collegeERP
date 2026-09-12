import 'package:flutter/material.dart';

import '../core/design/tokens.dart';
import '../features/attendance/presentation/attendance_screen.dart';

/// Route names. No raw path string appears in a widget.
abstract final class Routes {
  static const attendance = '/attendance';
}

/// One typed argument class per route that needs arguments, never a raw map.
///
/// The cast happens once, inside [AppRouter.onGenerateRoute], so a wrong or
/// missing argument yields the error page rather than crashing deep inside a
/// widget. It carries identifiers only: the screen reads its own data.
class AttendanceArgs {
  const AttendanceArgs({required this.sessionId});
  final String sessionId;
}

/// Flutter's own Navigator with a central `onGenerateRoute`, as the client
/// architecture requires. No routing package: this covers the need without one.
abstract final class AppRouter {
  static Route<dynamic> onGenerateRoute(RouteSettings settings) {
    switch (settings.name) {
      case Routes.attendance:
        final args = settings.arguments;
        if (args is! AttendanceArgs) return _unknown(settings);
        return _page(settings, AttendanceScreen(sessionId: args.sessionId));
      default:
        return _unknown(settings);
    }
  }

  /// One transition for every push in the app, so movement means the same thing
  /// everywhere rather than differing between Android and iOS defaults.
  static Route<dynamic> _page(RouteSettings settings, Widget child) {
    return PageRouteBuilder<dynamic>(
      settings: settings,
      transitionDuration: AppMotion.page,
      reverseTransitionDuration: AppMotion.exit,
      pageBuilder: (_, _, _) => child,
      transitionsBuilder: (context, animation, _, child) {
        if (AppMotion.reduced(context)) return child;
        return FadeTransition(
          opacity: animation,
          child: SlideTransition(
            position: Tween(
              begin: const Offset(0, 0.02),
              end: Offset.zero,
            ).chain(CurveTween(curve: AppMotion.easeOut)).animate(animation),
            child: child,
          ),
        );
      },
    );
  }

  static Route<dynamic> _unknown(RouteSettings settings) => MaterialPageRoute<dynamic>(
    settings: settings,
    builder: (context) => Scaffold(
      appBar: AppBar(title: const Text('Not found')),
      body: const Center(
        child: Padding(
          padding: EdgeInsets.all(AppSpacing.xl),
          child: Text('That screen could not be opened.', textAlign: TextAlign.center),
        ),
      ),
    ),
  );
}
