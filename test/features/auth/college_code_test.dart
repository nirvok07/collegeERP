import 'package:college_erp/core/design/theme.dart';
import 'package:college_erp/core/error/failure.dart';
import 'package:college_erp/core/error/result.dart';
import 'package:college_erp/core/session/college_brand.dart';
import 'package:college_erp/core/widgets/college_logo.dart';
import 'package:college_erp/features/auth/presentation/college_code_cubit.dart';
import 'package:college_erp/features/auth/presentation/college_code_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// AD-70: the college code comes first, and what it returns dresses the app.
/// These pin the lookup's handling, what is remembered, and that a brand
/// colour is used only when it stays legible.
const sunrise = CollegeBrand(
  code: 'sunrise',
  name: 'Sunrise College of Engineering',
  logoUrl: 'https://sunrise.edu/logo.png',
  brandColor: '#1E3A8A',
);

const notFound = Failure(code: FailureCode.notFound, message: 'No college uses that code. Check it with your college.');

void main() {
  test('a college survives being remembered and read back', () {
    final back = CollegeBrand.fromJson(sunrise.toJson());
    expect(back.code, 'sunrise');
    expect(back.name, sunrise.name);
    expect(back.logoUrl, sunrise.logoUrl);
    expect(back.brandColor, '#1E3A8A');
    expect(CollegeBrand.fromJson({'code': 'x-y', 'name': 'X', 'logo_url': null, 'brand_color': null}).logoUrl, isNull);
  });

  test('a brand colour becomes the accent only when white text on it stays legible', () {
    expect(legibleAccent('#1E3A8A'), isNotNull, reason: 'deep blue carries white text');
    expect(legibleAccent('#FACC15'), isNull, reason: 'yellow does not');
    expect(legibleAccent('#FFFFFF'), isNull);
    expect(legibleAccent('blue'), isNull);
    expect(legibleAccent(null), isNull);
  });

  test('initials stand in for a missing logo', () {
    expect(CollegeLogo.initialsOf('Sunrise College of Engineering'), 'SC');
    expect(CollegeLogo.initialsOf('Blossoms'), 'B');
    expect(CollegeLogo.initialsOf('  '), '?');
  });

  group('CollegeCodeCubit', () {
    test('an empty code is refused without asking the server', () async {
      var asked = 0;
      final cubit = CollegeCodeCubit((_) async {
        asked++;
        return const Ok(sunrise);
      });
      expect(await cubit.find('   '), isNull);
      expect(asked, 0);
      expect(cubit.state.failure?.message, 'Enter your college code.');
      await cubit.close();
    });

    test('asks with the code trimmed and lower-cased, and returns the college', () async {
      String? askedFor;
      final cubit = CollegeCodeCubit((code) async {
        askedFor = code;
        return const Ok(sunrise);
      });
      expect((await cubit.find('  SunRise '))?.name, sunrise.name);
      expect(askedFor, 'sunrise');
      expect(cubit.state.failure, isNull);
      await cubit.close();
    });

    test("an unknown code says so in the server's words", () async {
      final cubit = CollegeCodeCubit((_) async => const Err(notFound));
      expect(await cubit.find('nowhere'), isNull);
      expect(cubit.state.failure?.message, notFound.message);
      expect(cubit.state.checking, isFalse);
      await cubit.close();
    });
  });

  testWidgets('the first screen hands the found college on', (tester) async {
    CollegeBrand? found;
    await tester.pumpWidget(MaterialApp(
      home: CollegeCodeScreen(
        lookup: (code) async => code == 'sunrise' ? const Ok(sunrise) : const Err(notFound),
        onFound: (college) => found = college,
      ),
    ));

    await tester.enterText(find.byType(TextField), 'nowhere');
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();
    expect(find.text(notFound.message), findsOneWidget);
    expect(found, isNull);

    await tester.enterText(find.byType(TextField), 'sunrise');
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();
    expect(found?.name, sunrise.name);
  });

  testWidgets('without a logo the college shows its initials', (tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: Scaffold(body: CollegeLogo(college: CollegeBrand(code: 'b', name: 'Blossoms School'))),
    ));
    expect(find.text('BS'), findsOneWidget);
    expect(find.bySemanticsLabel('Blossoms School logo'), findsOneWidget);
  });
}
