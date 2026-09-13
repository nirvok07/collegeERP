/**
 * AD-70: a college's name, logo and colour. The server is the authority and
 * says which field is wrong; this only stops an obviously incomplete form.
 */
export interface BrandingForm {
  name: string;
  logoUrl: string;
  brandColor: string;
}

export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function brandingFormError(form: BrandingForm, requireName = true): string | null {
  if (requireName && form.name.trim().length < 2) return 'Give the college a name.';
  const logo = form.logoUrl.trim();
  if (logo && !/^https:\/\/\S+$/.test(logo)) return 'The logo must be an https:// link to an image.';
  const color = form.brandColor.trim();
  if (color && !HEX_COLOR.test(color)) return 'Use a colour like #1E40AF.';
  return null;
}

/** Empty fields are sent as null, which clears them. */
export function brandingPayload(form: BrandingForm) {
  return {
    name: form.name.trim(),
    logo_url: form.logoUrl.trim() || null,
    brand_color: form.brandColor.trim().toUpperCase() || null,
  };
}

export const brandingFormOf = (record: { name: string; logo_url: string | null; brand_color: string | null }): BrandingForm => ({
  name: record.name,
  logoUrl: record.logo_url ?? '',
  brandColor: record.brand_color ?? '',
});
