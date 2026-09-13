import { Field } from '../../components/index.tsx';
import { HEX_COLOR, type BrandingForm } from './branding.ts';

/**
 * AD-70: a college's name, logo and colour, with a preview of how the app's
 * first screens show them. Shared by provisioning, the platform's college
 * page, and the College Admin's own College page, so all three say the same.
 */
export function BrandingFields({
  form, onChange, errors, showName = true, disabled = false,
}: {
  form: BrandingForm;
  onChange: (next: BrandingForm) => void;
  errors?: Record<string, string>;
  showName?: boolean;
  disabled?: boolean;
}) {
  const color = HEX_COLOR.test(form.brandColor.trim()) ? form.brandColor.trim() : null;
  const logo = /^https:\/\/\S+$/.test(form.logoUrl.trim()) ? form.logoUrl.trim() : null;

  return (
    <>
      {showName && (
        <Field
          label="College name" value={form.name} required disabled={disabled}
          onChange={(e) => onChange({ ...form, name: e.currentTarget.value })}
          error={errors?.name}
        />
      )}
      <Field
        label="Logo link" type="url" value={form.logoUrl} disabled={disabled}
        placeholder="https://sunrise.edu/logo.png"
        hint="An https:// link to a square image. The app shows it before anybody signs in."
        onChange={(e) => onChange({ ...form, logoUrl: e.currentTarget.value })}
        error={errors?.logo_url}
      />
      <Field
        label="Brand colour" value={form.brandColor} disabled={disabled}
        placeholder="#1E40AF"
        hint="The app's accent, used when white text on it stays readable."
        onChange={(e) => onChange({ ...form, brandColor: e.currentTarget.value })}
        error={errors?.brand_color}
      />
      {(logo || color) && (
        <div
          aria-hidden="true"
          style={{
            display: 'flex', alignItems: 'center', gap: 'var(--space-sm)',
            padding: 'var(--space-sm)', border: '1px solid var(--outline)', borderRadius: 12,
          }}
        >
          {logo
            ? <img src={logo} alt="" width={40} height={40} style={{ objectFit: 'contain', borderRadius: 10 }} />
            : <span style={{ width: 40, height: 40, borderRadius: 10, background: color ?? undefined }} />}
          <strong style={{ flex: 1 }}>{form.name.trim() || 'Your college'}</strong>
          {color && <span style={{ width: 20, height: 20, borderRadius: 999, background: color }} />}
        </div>
      )}
    </>
  );
}
