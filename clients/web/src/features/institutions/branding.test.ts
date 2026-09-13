import { describe, expect, it } from 'vitest';
import { brandingFormError, brandingFormOf, brandingPayload } from './branding.ts';

describe('college branding form (AD-70)', () => {
  const form = { name: 'Sunrise College', logoUrl: '', brandColor: '' };

  it('accepts a name alone; logo and colour are optional', () => {
    expect(brandingFormError(form)).toBeNull();
  });

  it('names the first obvious problem', () => {
    expect(brandingFormError({ ...form, name: ' ' })).toMatch(/name/);
    expect(brandingFormError({ ...form, name: ' ' }, false)).toBeNull();
    expect(brandingFormError({ ...form, logoUrl: 'http://sunrise.edu/logo.png' })).toMatch(/https/);
    expect(brandingFormError({ ...form, brandColor: 'blue' })).toMatch(/#1E40AF/);
  });

  it('sends empty fields as null and upper-cases the colour', () => {
    expect(brandingPayload({ name: ' Sunrise ', logoUrl: ' ', brandColor: '#1e40af' })).toEqual({
      name: 'Sunrise', logo_url: null, brand_color: '#1E40AF',
    });
  });

  it('fills the form from a record, blanks for nulls', () => {
    expect(brandingFormOf({ name: 'S', logo_url: null, brand_color: '#123456' })).toEqual({
      name: 'S', logoUrl: '', brandColor: '#123456',
    });
  });
});
