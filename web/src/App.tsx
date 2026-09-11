import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Banner, ToastHost } from './components/index.tsx';
import { ApiClient, type ApiFailure } from './lib/api.ts';
import { AuthSession, type Actor } from './lib/auth.ts';
import { SignInPage } from './features/auth/SignInPage.tsx';
import { InstitutionsPage } from './features/institutions/InstitutionsPage.tsx';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

type Phase = 'restoring' | 'signed-out' | 'signed-in';

export function App() {
  const auth = useMemo(() => new AuthSession(BASE_URL), []);
  const [phase, setPhase] = useState<Phase>('restoring');
  const [actor, setActor] = useState<Actor | null>(null);
  const [degraded, setDegraded] = useState<ApiFailure | null>(null);
  const restored = useRef(false);

  const api = useMemo(
    () => new ApiClient({
      baseUrl: BASE_URL,
      getToken: () => auth.accessToken(),
      renew: () => auth.renew(),
    }),
    [auth],
  );

  useEffect(() => auth.subscribe((event) => {
    switch (event.type) {
      case 'signed-in':
        setActor(event.actor); setDegraded(null); setPhase('signed-in');
        break;
      case 'signed-out':
        setActor(null); setDegraded(null); setPhase('signed-out');
        break;
      case 'degraded':
        // The session is intact and renewal is retrying. Say so, and keep the
        // user where they are rather than throwing them to a sign-in screen.
        setDegraded(event.failure);
        break;
      case 'recovered':
        setDegraded(null);
        break;
    }
  }), [auth]);

  // Restore on startup. The refresh cookie travels automatically, so a browser
  // reload lands the user back where they were.
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    void auth.restore().then((ok) => {
      if (ok) { setActor(auth.currentActor()); setPhase('signed-in'); }
      else if (!auth.currentActor()) setPhase('signed-out');
    });
  }, [auth]);

  // Coming back to a tab after hours: renew immediately rather than letting the
  // first action fail.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && auth.currentActor() && !auth.accessToken()) {
        void auth.renew();
      }
    };
    const onOnline = () => { if (auth.currentActor()) void auth.renew(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [auth]);

  const signOut = useCallback(() => { void auth.signOut(); }, [auth]);

  if (phase === 'restoring') return <RestoringScreen />;

  return (
    <ToastHost>
      {degraded && (
        <div style={{ padding: 'var(--space-sm) var(--space-base)' }}>
          <Banner tone="warning">{degraded.message} You are still signed in.</Banner>
        </div>
      )}
      {phase === 'signed-in' && actor ? (
        <InstitutionsPage api={api} actorName={actor.fullName} onSignOut={signOut} />
      ) : (
        <SignInPage auth={auth} />
      )}
    </ToastHost>
  );
}

/**
 * Shown only while the refresh request is in flight on a cold start. It is a
 * quiet placeholder rather than a spinner, because most of the time it is
 * visible for a few hundred milliseconds and a spinner would flash.
 */
function RestoringScreen() {
  return (
    <div style={{
      minHeight: '100%', display: 'grid', placeItems: 'center',
      background: 'var(--background)', color: 'var(--text-tertiary)',
    }}>
      <span className="visually-hidden">Restoring your session</span>
      <div className="skeleton" style={{ width: 180, height: 10, borderRadius: 999 }} />
    </div>
  );
}
