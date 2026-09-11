import { useState, type FormEvent } from 'react';
import { Banner, Button, Field } from '../../components/index.tsx';
import type { ApiFailure } from '../../lib/api.ts';
import type { AuthSession } from '../../lib/auth.ts';
import './sign-in.css';

/**
 * S6 sign in. One identifier, one credential, nothing else above the fold.
 * Errors are inline and never a full-page state.
 */
export function SignInPage({ auth }: { auth: AuthSession }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFailure(null);

    // The session manager owns the tokens; this screen only reports failure.
    const result = await auth.signIn(email, password);
    setSubmitting(false);
    if (!result.ok) setFailure(result.failure);
  }

  return (
    <main className="signin">
      <form className="signin__card" onSubmit={submit} noValidate>
        <div className="signin__brand">
          <span className="signin__mark" aria-hidden="true">C</span>
          <div>
            <h1 className="signin__title">College</h1>
            <p className="signin__sub">Platform administration</p>
          </div>
        </div>

        {failure && <Banner tone="error">{failure.message}</Banner>}

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
          {submitting ? 'Signing in' : 'Sign in'}
        </Button>

        <p className="signin__foot">
          This console administers the platform. Colleges sign in through their own address.
        </p>
      </form>
    </main>
  );
}
