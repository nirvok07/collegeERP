import { useState, type FormEvent } from 'react';
import { Banner, Button, Field } from '../../components/index.tsx';
import type { ApiFailure } from '../../lib/api.ts';
import type { AuthSession } from '../../lib/auth.ts';
import { acceptFormError, collegeInviteFrom } from './collegeInvite.ts';
import './sign-in.css';

/**
 * WEB-1: a college invitation. The person sets their own password here, from
 * the link or from the college code and invitation code they were sent; then
 * they sign in. Nobody else, the platform included, ever knows the password.
 */
export function CollegeInvitePage({ auth, onDone }: { auth: AuthSession; onDone: () => void }) {
  const initial = collegeInviteFrom(window.location.search);
  const [college, setCollege] = useState(initial.college);
  const [token, setToken] = useState(initial.token);
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = acceptFormError({ college, token, password, again });
    if (problem) { setFailure({ code: 'VALIDATION_FAILED', message: problem }); return; }
    setBusy(true); setFailure(null);
    const result = await auth.acceptCollegeInvite(college.trim().toLowerCase(), token.trim(), password);
    setBusy(false);
    if (!result.ok) { setFailure(result.failure); return; }
    setDone(true);
  }

  return (
    <main className="signin">
      <div className="signin__card">
        <div className="signin__brand">
          <span className="signin__mark" aria-hidden="true">C</span>
          <div>
            <h1 className="signin__title">College</h1>
            <p className="signin__sub">Set up your account</p>
          </div>
        </div>
        {failure && <Banner tone="error">{failure.message}</Banner>}

        {done ? (
          <>
            <Banner tone="info">
              Your password is set. Sign in with your college code, your email and this password.
            </Banner>
            <Button variant="primary" block onClick={onDone}>Go to sign in</Button>
          </>
        ) : (
          <form onSubmit={submit} noValidate className="signin__form">
            <Field
              label="College code" value={college} autoComplete="organization" required
              onChange={(e) => setCollege(e.currentTarget.value)}
            />
            <Field
              label="Invitation code" value={token} autoComplete="off" required
              hint="From the message your college or the platform sent you."
              onChange={(e) => setToken(e.currentTarget.value)}
            />
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
            <Button type="submit" variant="primary" block loading={busy}>Set password</Button>
            <Button variant="text" block onClick={onDone}>Back to sign in</Button>
          </form>
        )}
      </div>
    </main>
  );
}
