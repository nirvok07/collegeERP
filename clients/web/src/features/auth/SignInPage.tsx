import { useState, type FormEvent } from 'react';
import { Banner, Button, Field } from '../../components/index.tsx';
import type { ApiFailure } from '../../lib/api.ts';
import type { AuthSession } from '../../lib/auth.ts';
import { EnrolmentPanel } from './EnrolmentPanel.tsx';
import { isCompleteCode, isExpiredStep, normaliseCode } from './mfa.ts';
import './sign-in.css';

type Step = 'password' | 'code' | 'enrol';

/**
 * S6 sign in, in two steps (SA-3b). The password never signs anyone in on its
 * own: it leads to a code from the authenticator, or to setting one up. Errors
 * stay inline; an expired step returns to the password.
 */
export function SignInPage({ auth }: { auth: AuthSession }) {
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
    <main className="signin">
      <div className="signin__card">
        <div className="signin__brand">
          <span className="signin__mark" aria-hidden="true">C</span>
          <div>
            <h1 className="signin__title">College</h1>
            <p className="signin__sub">Platform administration</p>
          </div>
        </div>

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
          This console administers the platform. Colleges sign in through their own address.
        </p>
      </div>
    </main>
  );
}
