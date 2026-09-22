import { useState, type FormEvent } from 'react';
import { Banner, Button, Field } from '../../components/index.tsx';
import type { ApiFailure } from '../../lib/api.ts';
import type { AuthSession } from '../../lib/auth.ts';
import { EnrolmentPanel } from './EnrolmentPanel.tsx';
import { isCompleteCode, isExpiredStep, normaliseCode } from './mfa.ts';
import './sign-in.css';

type Mode = 'college' | 'platform';
type Step = 'password' | 'code' | 'enrol';

/**
 * Sign in. College accounts are the default (WEB-1): college code, email and
 * password. Platform administration stays behind a link until the Super Admin
 * app covers it and it retires from the web (AD-72); there, the password never
 * signs anyone in on its own (SA-3b).
 */
export function SignInPage({ auth, onAcceptInvite }: { auth: AuthSession; onAcceptInvite?: () => void }) {
  const [mode, setMode] = useState<Mode>(() =>
    new URLSearchParams(window.location.search).get('platform') === '1' ? 'platform' : 'college');

  return (
    <main className="signin">
      <div className="signin__frame">
        <aside className="signin__hero">
          <span className="signin__hero-mark" aria-hidden="true">C</span>
          <div className="signin__hero-text">
            <h2 className="signin__hero-title">College</h2>
            <p className="signin__hero-tag">
              Your whole college in one console — people, teaching, attendance and results.
            </p>
          </div>
        </aside>
        <div className="signin__content">
          <div className="signin__card">
            <div className="signin__brand">
              <span className="signin__mark" aria-hidden="true">C</span>
              <div>
                <h1 className="signin__title">College</h1>
                <p className="signin__sub">{mode === 'college' ? 'Sign in to your college' : 'Platform administration'}</p>
              </div>
            </div>
            {mode === 'college'
              ? <CollegeSignIn auth={auth} onAcceptInvite={onAcceptInvite} onPlatform={() => setMode('platform')} />
              : <PlatformSignIn auth={auth} onCollege={() => setMode('college')} />}
          </div>
        </div>
      </div>
    </main>
  );
}

type CollegeStep = 'identifier' | 'code';

/**
 * AD-82: sign in by a one-time code, mirroring the phone exactly — college
 * code and who, then the six-digit code sent to them. There is no password.
 */
function CollegeSignIn({
  auth, onAcceptInvite, onPlatform,
}: { auth: AuthSession; onAcceptInvite?: () => void; onPlatform: () => void }) {
  const [step, setStep] = useState<CollegeStep>('identifier');
  const [college, setCollege] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [challenge, setChallenge] = useState('');
  const [destination, setDestination] = useState('');
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function requestCode(again = false) {
    if (!college.trim() || !identifier.trim()) {
      setFailure({ code: 'VALIDATION_FAILED', message: 'Enter your college code and email or mobile number.' });
      return;
    }
    setSubmitting(true); setFailure(null);
    const result = await auth.requestCollegeCode(college.trim().toLowerCase(), identifier.trim());
    setSubmitting(false);
    if (!result.ok) { setFailure(result.failure); return; }
    setChallenge(result.challenge);
    setDestination(result.destination);
    setStep('code');
    setNotice(again ? 'A new code is on its way. The earlier one no longer works.' : null);
  }

  async function submitCode(e: FormEvent) {
    e.preventDefault();
    if (!isCompleteCode(code)) { setFailure({ code: 'VALIDATION_FAILED', message: 'Enter the six-digit code.' }); return; }
    setSubmitting(true); setFailure(null);
    const result = await auth.verifyCollegeCode(college.trim().toLowerCase(), challenge, code);
    setSubmitting(false);
    // On success the session manager switches the screen.
    if (!result.ok) { setFailure(result.failure); setCode(''); }
  }

  function changeIdentifier() {
    setStep('identifier'); setChallenge(''); setCode(''); setFailure(null); setNotice(null);
  }

  return (
    <>
      {notice && <Banner tone="info">{notice}</Banner>}
      {failure && <Banner tone="error">{failure.message}</Banner>}

      {step === 'identifier' && (
        <form onSubmit={(e) => { e.preventDefault(); void requestCode(); }} noValidate className="signin__form">
          <Field
            label="College code" name="college" value={college} autoComplete="organization" autoFocus required
            placeholder="sunrise-college" onChange={(e) => setCollege(e.currentTarget.value)}
          />
          <Field
            label="Email or mobile" name="identifier" value={identifier} autoComplete="username" required
            onChange={(e) => setIdentifier(e.currentTarget.value)}
          />
          <Button type="submit" variant="primary" block loading={submitting}>
            {submitting ? 'Sending' : 'Send code'}
          </Button>
          {onAcceptInvite && (
            <Button variant="text" block onClick={onAcceptInvite}>I have an invitation</Button>
          )}
        </form>
      )}

      {step === 'code' && (
        <form onSubmit={submitCode} noValidate className="signin__form">
          <p className="signin__sub">
            {destination ? `A six-digit code was sent to ${destination}.` : 'Enter the six-digit code that was sent to you.'}
          </p>
          <Field
            label="Code" inputMode="numeric" autoComplete="one-time-code" autoFocus
            value={code} maxLength={7} onChange={(e) => setCode(normaliseCode(e.currentTarget.value))}
          />
          <Button type="submit" variant="primary" block loading={submitting}>
            {submitting ? 'Signing in' : 'Sign in'}
          </Button>
          <Button variant="text" block onClick={() => void requestCode(true)}>Send a new code</Button>
          <Button variant="text" block onClick={changeIdentifier}>Use a different account</Button>
        </form>
      )}

      <p className="signin__foot">
        <Button variant="text" onClick={onPlatform}>Platform administration</Button>
      </p>
    </>
  );
}

function PlatformSignIn({ auth, onCollege }: { auth: AuthSession; onCollege: () => void }) {
  const [step, setStep] = useState<Step>('password');
  const [challenge, setChallenge] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function restart(message: string | null) {
    setStep('password'); setChallenge(''); setCode(''); setPassword('');
    setNotice(message);
  }

  async function submitPassword(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true); setFailure(null); setNotice(null);
    const result = await auth.signIn(email, password);
    setSubmitting(false);
    if (!result.ok) { setFailure(result.failure); return; }
    setChallenge(result.challenge);
    setStep(result.step === 'second_factor' ? 'code' : 'enrol');
  }

  async function submitCode(e: FormEvent) {
    e.preventDefault();
    if (!isCompleteCode(code)) { setFailure({ code: 'VALIDATION_FAILED', message: 'Enter the six-digit code.' }); return; }
    setSubmitting(true); setFailure(null);
    const result = await auth.verifySecondFactor(challenge, code);
    setSubmitting(false);
    if (result.ok) return; // The session manager switches the screen.
    if (isExpiredStep(result.failure.message) || result.failure.code === 'ACCOUNT_LOCKED') {
      setFailure(result.failure);
      restart(null);
      return;
    }
    setFailure(result.failure);
    setCode('');
  }

  return (
    <>
      {notice && <Banner tone="info">{notice}</Banner>}
      {failure && step !== 'enrol' && <Banner tone="error">{failure.message}</Banner>}

      {step === 'password' && (
        <form onSubmit={submitPassword} noValidate className="signin__form">
          <Field
            label="Email" type="email" name="email" value={email} autoComplete="username"
            autoFocus required onChange={(e) => setEmail(e.currentTarget.value)}
            error={failure?.fieldErrors?.email}
          />
          <Field
            label="Password" type="password" name="password" value={password}
            autoComplete="current-password" required
            onChange={(e) => setPassword(e.currentTarget.value)}
            error={failure?.fieldErrors?.password}
          />
          <Button type="submit" variant="primary" block loading={submitting}>
            {submitting ? 'Checking' : 'Continue'}
          </Button>
        </form>
      )}

      {step === 'code' && (
        <form onSubmit={submitCode} noValidate className="signin__form">
          <p className="signin__sub">Enter the six-digit code from your authenticator app.</p>
          <Field
            label="Code" inputMode="numeric" autoComplete="one-time-code" autoFocus
            value={code} maxLength={7} onChange={(e) => setCode(normaliseCode(e.currentTarget.value))}
          />
          <Button type="submit" variant="primary" block loading={submitting}>
            {submitting ? 'Signing in' : 'Sign in'}
          </Button>
          <Button variant="text" block onClick={() => restart(null)}>Use a different account</Button>
        </form>
      )}

      {step === 'enrol' && (
        <EnrolmentPanel
          auth={auth}
          challenge={challenge}
          onEnrolled={() => restart('Your authenticator is set up. Sign in with your password and a code.')}
          onRestart={() => restart(null)}
        />
      )}

      <p className="signin__foot">
        <Button variant="text" onClick={onCollege}>College sign-in</Button>
      </p>
    </>
  );
}
