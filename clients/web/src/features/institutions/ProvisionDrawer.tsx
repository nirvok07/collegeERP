import { useState, type FormEvent } from 'react';
import { Banner, Button, Drawer, Field } from '../../components/index.tsx';
import type { ApiClient, ApiFailure } from '../../lib/api.ts';
import { BrandingFields } from './BrandingFields.tsx';
import { brandingFormError } from './branding.ts';

export interface ProvisionedInstitution {
  institution: { id: string; code: string; name: string; status: string; seat_limit: number };
  administrator: { person_id: string; account_id: string };
  invitation: { token: string; expires_at: string; delivery: string };
}

const slugify = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);

/**
 * W0 in one form. The college and its first administrator are created together,
 * per AD-20, because a college with no administrator is not a usable state.
 *
 * A plain-language summary sits above the action: a list of fields does not tell
 * an operator what is about to happen, and a sentence does (M1 §11 S3).
 */
export function ProvisionDrawer({
  open, api, onClose, onProvisioned,
}: {
  open: boolean; api: ApiClient; onClose: () => void;
  onProvisioned: (result: ProvisionedInstitution) => void;
}) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [codeEdited, setCodeEdited] = useState(false);
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [brandColor, setBrandColor] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);

  const effectiveCode = codeEdited ? code : slugify(name);

  function reset() {
    setName(''); setCode(''); setCodeEdited(false);
    setAdminName(''); setAdminEmail(''); setLogoUrl(''); setBrandColor(''); setFailure(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFailure(null);

    const result = await api.post<ProvisionedInstitution>('/v1/institutions', {
      code: effectiveCode,
      name: name.trim(),
      logo_url: logoUrl.trim() || null,
      brand_color: brandColor.trim().toUpperCase() || null,
      admin: { full_name: adminName.trim(), email: adminEmail.trim().toLowerCase() },
    });
    setSubmitting(false);

    if (!result.ok) { setFailure(result.error); return; }
    onProvisioned(result.value);
    reset();
  }

  const ready = name.trim().length > 1 && effectiveCode.length > 2 && adminName.trim().length > 1 && adminEmail.includes('@')
    && brandingFormError({ name, logoUrl, brandColor }, false) === null;

  return (
    <Drawer
      open={open}
      title="Add a college"
      subtitle="The college and its first administrator are created together."
      onClose={() => { reset(); onClose(); }}
      footer={
        <>
          <Button variant="secondary" onClick={() => { reset(); onClose(); }} disabled={submitting}>Cancel</Button>
          <Button variant="primary" form="provision-form" type="submit" loading={submitting} disabled={!ready}>
            {submitting ? 'Creating' : 'Create college'}
          </Button>
        </>
      }
    >
      <form id="provision-form" onSubmit={submit} noValidate style={{ display: 'contents' }}>
        {failure && <Banner tone="error">{failure.message}</Banner>}

        <Field
          label="College name" value={name} required autoFocus
          placeholder="Sunrise College of Engineering"
          onChange={(e) => setName(e.currentTarget.value)}
          error={failure?.fieldErrors?.name}
        />
        <Field
          label="Short code" value={effectiveCode} required
          hint="Used in sign-in links. Lowercase letters, numbers and hyphens."
          onChange={(e) => { setCodeEdited(true); setCode(e.currentTarget.value.toLowerCase()); }}
          error={failure?.fieldErrors?.code}
        />
        <BrandingFields
          showName={false}
          form={{ name, logoUrl, brandColor }}
          onChange={(next) => { setLogoUrl(next.logoUrl); setBrandColor(next.brandColor); }}
          errors={failure?.fieldErrors}
        />

        <hr style={{ border: 'none', borderTop: '1px solid var(--outline)', margin: 'var(--space-sm) 0' }} />

        <Field
          label="Administrator name" value={adminName} required placeholder="Priya Sharma"
          onChange={(e) => setAdminName(e.currentTarget.value)}
          error={failure?.fieldErrors?.['admin.full_name']}
        />
        <Field
          label="Administrator email" type="email" value={adminEmail} required
          placeholder="priya@sunrise.edu"
          hint="They receive an invitation and choose their own password."
          onChange={(e) => setAdminEmail(e.currentTarget.value)}
          error={failure?.fieldErrors?.['admin.email']}
        />

        {ready && (
          <Banner tone="info">
            {adminName.trim()} will administer {name.trim()} with full authority over that college,
            and nothing outside it.
          </Banner>
        )}
      </form>
    </Drawer>
  );
}
