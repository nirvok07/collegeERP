import 'package:college_erp/core/widgets/skeleton.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// UX-3: skeletons follow the real layouts. These pin down that every preset
/// lays out on the narrowest phone, speaks once, and keeps real tap-target sizes.
Widget _host(Widget child) => MaterialApp(home: Scaffold(body: child));

void main() {
  final presets = <String, Widget>{
    'a plain list': const SkeletonList(),
    'an avatar list with chips and dividers': const SkeletonList(
      leading: SkeletonLeading.avatar,
      trailing: SkeletonTrailing.chip,
      dividers: true,
      dividerIndent: 72,
    ),
    'filters, a count, groups and tabs': const SkeletonList(
      filters: [SkeletonFilter.search, SkeletonFilter.chips, SkeletonFilter.dropdown, SkeletonFilter.segmented],
      countLabel: true,
      groupEvery: 3,
      tabs: 2,
    ),
    'a detail screen': const SkeletonList(detailHeader: true, leading: SkeletonLeading.icon),
    'day cards': const SkeletonGroups(leading: SkeletonLeading.time),
    'an attendance register': const SkeletonRegister(),
    'a mark sheet': const SkeletonRegister(marks: 2, scoreField: true, bulkActions: false, summaryLine: false),
    'a form': const SkeletonForm(switchRow: true),
  };

  for (final entry in presets.entries) {
    testWidgets('${entry.key} lays out on a 320-wide phone without overflow', (tester) async {
      tester.view.physicalSize = const Size(320, 640);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);

      await tester.pumpWidget(_host(entry.value));
      await tester.pump(const Duration(milliseconds: 300));

      expect(tester.takeException(), isNull);
      expect(find.byType(SkeletonBox), findsWidgets);
    });
  }

  testWidgets('the placeholder is announced once, as loading', (tester) async {
    final semantics = tester.ensureSemantics();
    await tester.pumpWidget(_host(const SkeletonList(rows: 3)));

    expect(find.bySemanticsLabel('Loading'), findsOneWidget);
    semantics.dispose();
  });

  testWidgets('a register row keeps its four 40-point mark targets', (tester) async {
    await tester.pumpWidget(_host(const SkeletonRegister(rows: 1)));

    final targets = tester
        .widgetList<SkeletonBox>(find.byType(SkeletonBox))
        .where((b) => b.width == 40 && b.height == 40);
    expect(targets.length, 4);
  });

  testWidgets('rows have no avatar unless the real rows do', (tester) async {
    await tester.pumpWidget(_host(const SkeletonList(rows: 2)));

    final avatars = tester
        .widgetList<SkeletonBox>(find.byType(SkeletonBox))
        .where((b) => b.width == 40 && b.radius == 999);
    expect(avatars, isEmpty);
  });
}
