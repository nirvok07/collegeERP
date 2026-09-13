import { useEffect, useState, type FormEvent } from 'react';
import QRCode from 'qrcode';
import { Banner, Button, Field } from '../../components/index.tsx';
import type { ApiFailure } from '../../lib/api.ts';
import type { AuthSession } from '../../lib/auth.ts';
import { formatManualKey, isCompleteCode, isExpiredStep, normaliseCode } from './mfa.ts';

/**
 * Setting up the authenticator (AD-62). The secret comes from the server once,
 * lives only in this component's memory, and is gone when it unmounts.
 */
export function EnrolmentPanel({
  auth, challenge, onEnrolled, onRestart,
}: { auth: AuthSession; challenge: string; onEnrolled: () => void; onRestart: () => void }) {
  const [qr, setQr] = useState<string | null>(null);
  const [manualKey, setManualKey] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [busy, setBusy] = useState(false);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    let live = true;
    void auth.beginEnrolment(challenge).then(async (r) => {
      if (!live) return;
      if (!r.ok) { setFailure(r.failure); setExpired(isExpiredStep(r.failure.message)); return; }
      setManualKey(r.manualKey);
      setQr(await QRCode.toDataURL(r.uri, { margin: 1, width: 208 }));
    });
    return () => { live = false; };
  }, [auth, challenge]);

  async function confirm(e: FormEvent) {
    e.preventDefault();
    if (!isCompleteCode(code)) { setFailure({ code: 'VALIDATION_FAILED', message: 'Enter the six-digit code.' }); return; }
    setBusy(true);
    setFailure(null);
    const r = await auth.confirmEnrolment(challenge, code);
    setBusy(false);
    if (!r.ok) {
      setFailure(r.failure);
      setExpired(isExpiredStep(r.failure.message));
      setCode('');
      return;
    }
    onEnrolled();
  }

  if (expired) {
    return (
      <div className="enrol">
        <Banner tone="warning">{failure?.message ?? 'This setup has expired.'}</Banner>
        <Button variant="primary" block onClick={onRestart}>Start again</Button>
      </div>
    );
  }

  return (
    <form className="enrol" onSubmit={confirm} noValidate>
      <h2 className="enrol__title">Set up your authenticator</h2>
      <p className="enrol__sub">
        Platform accounts need a code from an authenticator app every time they sign in.
        Scan this with Google Authenticator, Microsoft Authenticator, 1Password or similar.
      </p>
      {failure && <Banner tone="error">{failure.message}</Banner>}
      <div className="enrol__qr">
        {qr ? <img src={qr} width={208} height={208} alt="QR code to add this account to your authenticator app" />
            : <span className="enrol__qr-placeholder">Preparing</span>}
      </div>
      {manualKey && (
        <details className="enrol__manual">
          <summary>Can’t scan it? Enter a key instead</summary>
          <code className="enrol__key">{formatManualKey(manualKey)}</code>
          <p className="enrol__hint">Choose a time-based key. This key is shown only during setup.</p>
        </details>
      )}
      <Field
        label="Code from the app"
        inputMode="numeric"
        autoComplete="one-time-code"
        value={code}
        maxLength={7}
        onChange={(e) => setCode(normaliseCode(e.currentTarget.value))}
      />
      <Button type="submit" variant="primary" block loading={busy} disabled={!manualKey}>Confirm</Button>
    </form>
  );
}
