import 'package:college_erp/core/widgets/saved_freshness.dart';
import 'package:flutter_test/flutter_test.dart';

/// OD-CR-1: "Updated 2 h ago" — so a screen that only refreshes on request
/// still says how stale it might be.
void main() {
  final now = DateTime(2026, 9, 15, 12, 0, 0);
  DateTime clock() => now;

  test('reads in increasing units the further back it was saved', () {
    expect(freshnessLabel(now.subtract(const Duration(seconds: 30)), now: clock), 'Updated just now');
    expect(freshnessLabel(now.subtract(const Duration(minutes: 5)), now: clock), 'Updated 5 m ago');
    expect(freshnessLabel(now.subtract(const Duration(hours: 3)), now: clock), 'Updated 3 h ago');
    expect(freshnessLabel(now.subtract(const Duration(days: 1)), now: clock), 'Updated yesterday');
    expect(freshnessLabel(now.subtract(const Duration(days: 4)), now: clock), 'Updated 4 d ago');
    expect(freshnessLabel(now.subtract(const Duration(days: 10)), now: clock), 'Updated on 5/9/2026');
  });
}
