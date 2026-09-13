/**
 * A college's branding (AD-70): its name, logo and colour, which the app shows
 * before anybody signs in. The database checks the same shapes (migration 024);
 * these rules exist to say which field is wrong, in words.
 */
export interface Branding {
  name: string;
  logoUrl: string | null;
  brandColor: string | null;
}

export const MAX_LOGO_URL = 500;

const isHttpsUrl = (value: string) => {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
};

/** Trims, empties to null, upper-cases the colour, and names every bad field. */
export function normaliseBranding(input: {
  name: string;
  logoUrl?: string | null;
  brandColor?: string | null;
}): { ok: true; value: Branding } | { ok: false; fieldErrors: Record<string, string> } {
  const name = input.name.trim().replace(/\s+/g, ' ');
  const logoUrl = input.logoUrl?.trim() || null;
  const brandColor = input.brandColor?.trim().toUpperCase() || null;
  const fieldErrors: Record<string, string> = {};

  if (name.length < 2 || name.length > 200) fieldErrors.name = 'Use 2 to 200 characters.';
  if (logoUrl !== null && (logoUrl.length > MAX_LOGO_URL || /\s/.test(logoUrl) || !isHttpsUrl(logoUrl))) {
    fieldErrors.logo_url = 'Use an https:// link to an image, up to 500 characters.';
  }
  if (brandColor !== null && !/^#[0-9A-F]{6}$/.test(brandColor)) {
    fieldErrors.brand_color = 'Use a colour like #1E40AF.';
  }
  return Object.keys(fieldErrors).length > 0
    ? { ok: false, fieldErrors }
    : { ok: true, value: { name, logoUrl, brandColor } };
}
