import 'package:flutter/material.dart';

import '../session/college_brand.dart';

/// A college's logo, or its initials on the accent when there is none, the
/// image fails, or it is still loading. The fallback has the logo's exact
/// size, so nothing shifts when the image lands.
class CollegeLogo extends StatelessWidget {
  const CollegeLogo({super.key, required this.college, this.size = 56});

  final CollegeBrand college;
  final double size;

  static String initialsOf(String name) {
    final words = name
        .split(RegExp(r'\s+'))
        .where((w) => w.isNotEmpty && w[0].toUpperCase() != w[0].toLowerCase())
        .toList();
    if (words.isEmpty) return '?';
    final letters = words.length == 1 ? words.first.substring(0, 1) : words[0][0] + words[1][0];
    return letters.toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final radius = BorderRadius.circular(size * 0.28);
    final fallback = Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(color: scheme.primary, borderRadius: radius),
      child: Text(
        initialsOf(college.name),
        style: TextStyle(color: scheme.onPrimary, fontWeight: FontWeight.w700, fontSize: size * 0.36),
      ),
    );
    final url = college.logoUrl;

    return Semantics(
      label: '${college.name} logo',
      image: true,
      child: ExcludeSemantics(
        child: url == null
            ? fallback
            : ClipRRect(
                borderRadius: radius,
                child: SizedBox.square(
                  dimension: size,
                  child: Image.network(
                    url,
                    fit: BoxFit.contain,
                    errorBuilder: (_, _, _) => fallback,
                    loadingBuilder: (_, child, progress) => progress == null ? child : fallback,
                  ),
                ),
              ),
      ),
    );
  }
}
