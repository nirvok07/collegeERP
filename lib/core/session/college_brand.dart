/// A college as the app shows it before anybody signs in (AD-70).
///
/// Looked up by code from `GET /v1/public/colleges/:code`, remembered on the
/// device, and refreshed at launch so a new logo appears without a new
/// install. Nothing here is a secret.
class CollegeBrand {
  const CollegeBrand({required this.code, required this.name, this.logoUrl, this.brandColor});

  final String code;
  final String name;

  /// An https image URL, or null for the initials fallback.
  final String? logoUrl;

  /// '#RRGGBB' as the college set it. Whether it is used is the theme's call.
  final String? brandColor;

  static CollegeBrand fromJson(dynamic json) {
    final map = json as Map;
    return CollegeBrand(
      code: map['code'] as String,
      name: map['name'] as String,
      logoUrl: map['logo_url'] as String?,
      brandColor: map['brand_color'] as String?,
    );
  }

  Map<String, Object?> toJson() => {
    'code': code,
    'name': name,
    'logo_url': logoUrl,
    'brand_color': brandColor,
  };
}
