import 'package:flutter/material.dart';

import '../core/design/tokens.dart';
import '../features/academic/presentation/academic_screen.dart';
import '../features/assessment/presentation/course_assessments_screen.dart';
import '../features/assessment/presentation/mark_sheet_screen.dart';
import '../features/attendance/presentation/attendance_screen.dart';
import '../features/delivery/presentation/my_schedule_screen.dart';
import '../features/organisation/presentation/organisation_screen.dart';
import '../features/people/presentation/people_screen.dart';
import '../features/teaching/presentation/my_teaching_screen.dart';
import 'account_screen.dart';
import '../core/session/authority.dart';
import '../core/session/college_brand.dart';
import '../features/auth/presentation/accept_invitation_screen.dart';
import '../features/account/change_password_screen.dart';
import '../features/onboarding/domain/onboarding.dart';
import '../features/onboarding/presentation/admit_student_screen.dart';
import '../features/onboarding/presentation/appoint_teacher_screen.dart';
import '../features/onboarding/presentation/onboarding_screen.dart';
import '../features/onboarding/presentation/teacher_invited_screen.dart';

/// Route names. No raw path string appears in a widget.
abstract final class Routes {
  static const attendance = '/attendance';
  static const courseAssessments = '/assessments';
  static const markSheet = '/assessments/sheet';

  // The dashboard's destinations, which the bottom navigation used to hold.
  // Only offered when the person has authority; the server enforces it anyway.
  static const schedule = '/schedule';
  static const teaching = '/teaching';
  static const people = '/people';
  static const organisation = '/organisation';
  static const academic = '/academic';
  static const account = '/account';
  static const acceptInvitation = '/accept-invitation';
  static const changePassword = '/account/password';

  // ONB-1: the College Admin's onboarding (AD-76).
  static const onboarding = '/onboarding';
  static const appointTeacher = '/onboarding/teacher';
  static const admitStudent = '/onboarding/student';
  static const teacherInvited = '/onboarding/teacher/invited';
}

/// What the dashboard knows when it opens onboarding: what this person may do,
/// and the college, for the invitation message.
class OnboardingArgs {
  const OnboardingArgs({required this.canAppoint, required this.canAdmit, this.college});
  final bool canAppoint;
  final bool canAdmit;
  final CollegeBrand? college;
}

class TeacherInvitedArgs {
  const TeacherInvitedArgs({required this.teacher, required this.name, this.college});
  final AppointedTeacher teacher;
  final String name;
  final CollegeBrand? college;
}

/// ADM-2 and AD-80: what the dashboard knows when it opens People or
/// Organisation, so they offer only the actions this person may take.
class ManageArgs {
  const ManageArgs({required this.authority, this.college});
  final Authority authority;
  final CollegeBrand? college;
}

/// ACC-1: the college chosen on the first screen, whose invitation this is.
class AcceptInvitationArgs {
  const AcceptInvitationArgs({required this.college});
  final CollegeBrand college;
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
/// Identifiers only; the screens read their own data.
class CourseAssessmentsArgs {
  const CourseAssessmentsArgs({required this.offeringId, required this.courseTitle});
  final String offeringId;
  final String courseTitle;
}

class MarkSheetArgs {
  const MarkSheetArgs({required this.componentId});
  final String componentId;
}

abstract final class AppRouter {
  static Route<dynamic> onGenerateRoute(RouteSettings settings) {
    switch (settings.name) {
      case Routes.attendance:
        final args = settings.arguments;
        if (args is! AttendanceArgs) return _unknown(settings);
        return _page(settings, AttendanceScreen(sessionId: args.sessionId));
      case Routes.courseAssessments:
        final args = settings.arguments;
        if (args is! CourseAssessmentsArgs) return _unknown(settings);
        return _page(
          settings,
          CourseAssessmentsScreen(offeringId: args.offeringId, courseTitle: args.courseTitle),
        );
      case Routes.markSheet:
        final args = settings.arguments;
        if (args is! MarkSheetArgs) return _unknown(settings);
        return _page(settings, MarkSheetScreen(componentId: args.componentId));
      case Routes.schedule:
        return _page(settings, const MyScheduleScreen());
      case Routes.teaching:
        return _page(settings, const MyTeachingScreen());
      case Routes.people:
        final args = settings.arguments;
        return _page(
          settings,
          args is ManageArgs ? PeopleScreen(authority: args.authority, college: args.college) : const PeopleScreen(),
        );
      case Routes.organisation:
        final args = settings.arguments;
        return _page(settings, OrganisationScreen(authority: args is ManageArgs ? args.authority : null));
      case Routes.academic:
        final args = settings.arguments;
        return _page(settings, AcademicScreen(authority: args is ManageArgs ? args.authority : null));
      case Routes.account:
        return _page(settings, const AccountScreen());
      case Routes.changePassword:
        return _page(settings, const ChangePasswordScreen());
      case Routes.acceptInvitation:
        final args = settings.arguments;
        if (args is! AcceptInvitationArgs) return _unknown(settings);
        return _page(settings, AcceptInvitationScreen(college: args.college));
      case Routes.onboarding:
        final args = settings.arguments;
        if (args is! OnboardingArgs) return _unknown(settings);
        return _page(settings, OnboardingScreen(args: args));
      case Routes.appointTeacher:
        final args = settings.arguments;
        if (args is! OnboardingArgs) return _unknown(settings);
        return _page(settings, AppointTeacherScreen(args: args));
      case Routes.admitStudent:
        final args = settings.arguments;
        if (args is! OnboardingArgs) return _unknown(settings);
        return _page(settings, AdmitStudentScreen(args: args));
      case Routes.teacherInvited:
        final args = settings.arguments;
        if (args is! TeacherInvitedArgs) return _unknown(settings);
        return _page(settings, TeacherInvitedScreen(args: args));
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
