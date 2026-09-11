import { useCallback, useMemo, useState } from 'react';
import { ToastHost } from './components/index.tsx';
import { ApiClient } from './lib/api.ts';
import { clearSession, readSession, writeSession, type StoredSession } from './lib/session.ts';
import { SignInPage } from './features/auth/SignInPage.tsx';
import { InstitutionsPage } from './features/institutions/InstitutionsPage.tsx';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export function App() {
  const [session, setSession] = useState<StoredSession | null>(() => readSession());

  const signOut = useCallback(() => {
    clearSession();
    setSession(null);
  }, []);

  // One client for the app's lifetime. It reads the token through a getter
  // rather than capturing it, so a sign-in does not need a new instance.
  const api = useMemo(
    () => new ApiClient({
      baseUrl: BASE_URL,
      getToken: () => readSession()?.accessToken ?? null,
      onUnauthenticated: signOut,
    }),
    [signOut],
  );

  return (
    <ToastHost>
      {session ? (
        <InstitutionsPage api={api} actorName={session.actor.fullName} onSignOut={signOut} />
      ) : (
        <SignInPage
          api={api}
          onSignedIn={(s) => { writeSession(s); setSession(s); }}
        />
      )}
    </ToastHost>
  );
}
