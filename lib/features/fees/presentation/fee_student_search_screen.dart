import 'dart:async';

import 'package:flutter/material.dart';

import '../../../app/routes.dart';
import '../../../core/design/tokens.dart';
import '../../../core/di/locator.dart';
import '../data/fees_api.dart';
import '../domain/fees.dart';
import 'student_fee_screen.dart';
import '../../../core/widgets/app_list_tile.dart';

/// A Cashier or Accountant's own way to find a student, having no
/// `student.read` (server-scoped to `fee.read`).
class FeeStudentSearchScreen extends StatefulWidget {
  const FeeStudentSearchScreen({super.key, this.canCollect = false, this.canManage = false, this.repository});

  final bool canCollect;
  final bool canManage;
  final FeesRepository? repository;

  @override
  State<FeeStudentSearchScreen> createState() => _FeeStudentSearchScreenState();
}

class _FeeStudentSearchScreenState extends State<FeeStudentSearchScreen> {
  late final FeesRepository _repository = widget.repository ?? locator<FeesRepository>();
  final _query = TextEditingController();
  Timer? _debounce;
  List<FeeStudentSummary> _results = const [];
  bool _searching = false;
  String? _error;

  @override
  void dispose() {
    _debounce?.cancel();
    _query.dispose();
    super.dispose();
  }

  void _onChanged(String value) {
    _debounce?.cancel();
    if (value.trim().length < 2) {
      setState(() {
        _results = const [];
        _error = null;
      });
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 300), () => _search(value.trim()));
  }

  Future<void> _search(String query) async {
    setState(() => _searching = true);
    final result = await _repository.searchStudents(query);
    if (!mounted) return;
    setState(() {
      _searching = false;
      _results = result.valueOrNull ?? const [];
      _error = result.failureOrNull?.message;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: TextField(
          controller: _query,
          autofocus: true,
          onChanged: _onChanged,
          style: const TextStyle(color: Colors.white, fontSize: 18),
          cursorColor: Colors.white,
          decoration: const InputDecoration(
            hintText: 'Name or enrolment number',
            hintStyle: TextStyle(color: Colors.white70),
            border: InputBorder.none,
          ),
        ),
      ),
      body: _error != null
          ? Center(child: Text(_error!))
          : _searching
              ? const Center(child: CircularProgressIndicator())
              : _results.isEmpty
                  ? Padding(
                      padding: const EdgeInsets.all(AppSpacing.xl),
                      child: Text(
                        _query.text.trim().length < 2 ? 'Type at least two characters.' : 'No student matches "${_query.text.trim()}".',
                        textAlign: TextAlign.center,
                      ),
                    )
                  : ListView(
                      children: [
                        for (final s in _results)
                          AppListTile(
                            leading: const Icon(Icons.person_outline_rounded),
                            title: Text(s.fullName),
                            subtitle: Text('${s.enrolmentNumber} · ${s.programName}'),
                            onTap: () => Navigator.of(context).pushNamed(
                              Routes.studentFees,
                              arguments: StudentFeeArgs(
                                studentId: s.id, studentName: s.fullName, enrolmentNumber: s.enrolmentNumber,
                                canCollect: widget.canCollect, canManage: widget.canManage,
                              ),
                            ),
                          ),
                      ],
                    ),
    );
  }
}
