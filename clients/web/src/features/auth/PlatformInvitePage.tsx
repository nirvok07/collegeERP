import { useState, type FormEvent } from 'react';
import { Banner, Button, Field } from '../../components/index.tsx';
import type { ApiFailure } from '../../lib/api.ts';
import type { AuthSession } from '../../lib/auth.ts';
import { EnrolmentPanel } from './EnrolmentPanel.tsx';
import './sign-in.css';

/**
 * A platform invitation (SA-3b): set a password, then the authenticator. The
 * account can sign in only after both.
 */
export function PlatformInvitePage({
  auth, token, onDone,
}: { auth: AuthSession; token: string | null; onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [challenge, setChallenge] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (password !== again) { setFailure({ code: 'VALIDATION_FAILED', message: 'The passwords do not match.' }); return; }
    setBusy(true); setFailure(null);
    const result = await auth.acceptPlatformInvite(token, password);
    setBusy(false);
    if (!result.ok) { setFailure(result.failure); return; }
    setChallenge(result.challenge);
  }

  return (
    <main className="signin">
      <div className="signin__card">
        <div className="signin__brand">
          <span className="signin__mark" aria-hidden="true">C</span>
          <div>
            <h1 className="signin__title">College</h1>
            <p className="signin__sub">Platform account setup</p>
          </div>
        </div>
        {!token && <Banner tone="error">This invitation link is incomplete. Ask an Owner for a new one.</Banner>}
        {failure && <Banner tone="error">{failure.message}</Banner>}

        {token && !challenge && !done && (
          <form onSubmit={submit} noValidate className="signin__form">
            <Field
              label="New password" type="password" autoComplete="new-password" value={password}
              hint="At least ten characters, with a letter and a number."
              error={failure?.fieldErrors?.password}
              onChange={(e) => setPassword(e.currentTarget.value)}
            />
            <Field
              label="Repeat the password" type="password" autoComplete="new-password" value={again}
              onChange={(e) => setAgain(e.currentTarget.value)}
            />
            <Button type="submit" variant="primary" block loading={busy}>Continue</Button>
          </form>
        )}

        {challenge && !done && (
          <EnrolmentPanel auth={auth} challenge={challenge} onEnrolled={() => setDone(true)} onRestart={onDone} />
        )}

        {done && (
          <>
            <Banner tone="info">Your account is ready. Sign in with your password and a code from the app.</Banner>
            <Button variant="primary" block onClick={onDone}>Go to sign in</Button>
          </>
        )}
      </div>
    </main>
  );
}
