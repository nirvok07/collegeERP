import { useCallback, useEffect, useState } from 'react';
import { Banner, Button, ErrorState, useToast } from '../../components/index.tsx';
import type { ApiClient, ApiFailure } from '../../lib/api.ts';
import { BrandingFields } from '../institutions/BrandingFields.tsx';
import {
  brandingFormError, brandingFormOf, brandingPayload, type BrandingForm,
} from '../institutions/branding.ts';

interface CollegeProfile {
  code: string;
  name: string;
  status: string;
  version: number;
  logo_url: string | null;
  brand_color: string | null;
}

/**
 * The College Admin's own college as the app shows it before anybody signs in
 * (AD-70): name, logo and colour. The server takes the college from the
 * session, never from this page.
 */
export function CollegePage({ api, canManage }: { api: ApiClient; canManage: boolean }) {
  const [profile, setProfile] = useState<CollegeProfile | null>(null);
  const [form, setForm] = useState<BrandingForm | null>(null);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const load = useCallback(async () => {
    setFailure(null);
    const result = await api.get<CollegeProfile>('/v1/college/profile');
    if (!result.ok) { setFailure(result.error); return; }
    setProfile(result.value);
    setForm(brandingFormOf(result.value));
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    if (!profile || !form) return;
    const problem = brandingFormError(form);
    if (problem) { setFailure({ code: 'VALIDATION_FAILED', message: problem }); return; }
    setSaving(true);
    const result = await api.post<CollegeProfile>('/v1/college/profile', {
      version: profile.version, ...brandingPayload(form),
    });
    setSaving(false);
    if (!result.ok) { setFailure(result.error); return; }
    setFailure(null);
    setProfile(result.value);
    setForm(brandingFormOf(result.value));
    toast('Saved. The app shows it the next time it opens.');
  }

  const dirty = !!profile && !!form && JSON.stringify(brandingFormOf(profile)) !== JSON.stringify(form);

  return (
    <>
      <div className="page__head">
        <div>
          <p className="page__eyebrow">College</p>
          <h1 className="page__title">College</h1>
          <p className="page__sub">
            {profile
              ? `Code ${profile.code}. How your college appears in the app, before anybody signs in.`
              : 'Loading'}
          </p>
        </div>
      </div>

      {!profile && failure ? (
        <ErrorState message={failure.message} onRetry={() => void load()} />
      ) : !form ? (
        <div className="skeleton" style={{ height: 240 }} />
      ) : (
        <form
          onSubmit={(e) => { e.preventDefault(); void save(); }}
          noValidate
          style={{ display: 'grid', gap: 'var(--space-sm)', maxWidth: 560 }}
        >
          {failure && <Banner tone="error">{failure.message}</Banner>}
          {!canManage && <Banner tone="info">Only a College Administrator can change these.</Banner>}
          <BrandingFields form={form} onChange={setForm} errors={failure?.fieldErrors} disabled={!canManage} />
          {canManage && (
            <div>
              <Button variant="primary" type="submit" loading={saving} disabled={!dirty}>Save</Button>
            </div>
          )}
        </form>
      )}
    </>
  );
}
