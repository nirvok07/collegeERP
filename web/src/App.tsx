import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Banner, ToastHost } from './components/index.tsx';
import { ApiClient, type ApiFailure } from './lib/api.ts';
import { AuthSession, type Actor } from './lib/auth.ts';
import { SignInPage } from './features/auth/SignInPage.tsx';
import { InstitutionsPage } from './features/institutions/InstitutionsPage.tsx';
import { PeoplePage } from './features/people/PeoplePage.tsx';
import { OrganisationPage } from './features/organisation/OrganisationPage.tsx';
import { CurriculumPage } from './features/curriculum/CurriculumPage.tsx';
import { TeachingPage } from './features/teaching/TeachingPage.tsx';
import { AppShell, loadPermissions, type NavItem } from './features/shell/AppShell.tsx';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

type Phase = 'restoring' | 'signed-out' | 'signed-in';

export function App() {
  const auth = useMemo(() => new AuthSession(BASE_URL), []);
  const [phase, setPhase] = useState<Phase>('restoring');
  const [actor, setActor] = useState<Actor | null>(null);
  const [degraded, setDegraded] = useState<ApiFailure | null>(null);
  const [permissions, setPermissions] = useState<Set<string> | null>(null);
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
        setActor(null); setDegraded(null); setPermissions(null); setPhase('signed-out');
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

  // Authority is read from the server, never inferred from the actor kind, so
  // the interface reflects the same resolution the server enforces.
  useEffect(() => {
    if (phase !== 'signed-in' || !actor) return;
    if (actor.actorType === 'platform') { setPermissions(new Set(['platform.tenant.manage'])); return; }
    void loadPermissions(api).then(setPermissions);
  }, [phase, actor, api]);

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
        <AppShell
          actor={actor}
          scopeLabel={actor.actorType === 'platform' ? 'Platform' : 'College'}
          onSignOut={signOut}
          items={sectionsFor(actor.actorType, permissions, api)}
        />
      ) : (
        <SignInPage auth={auth} />
      )}
    </ToastHost>
  );
}

/**
 * Sections the signed-in actor can actually reach. Absent, never disabled.
 */
function sectionsFor(
  actorType: 'platform' | 'person',
  permissions: Set<string> | null,
  api: ApiClient,
): NavItem[] {
  if (actorType === 'platform') {
    return [{ key: 'institutions', label: 'Colleges', render: () => <InstitutionsPage api={api} /> }];
  }
  const items: NavItem[] = [];
  if (permissions?.has('person.read')) {
    items.push({
      key: 'people',
      label: 'People',
      render: () => <PeoplePage api={api} canManage={permissions.has('account.manage')} />,
    });
    items.push({
      key: 'organisation',
      label: 'Organisation',
      render: () => (
        <OrganisationPage api={api} canManage={permissions.has('department.manage')} />
      ),
    });
    items.push({
      key: 'curriculum',
      label: 'Curriculum',
      render: () => (
        <CurriculumPage api={api} canManage={permissions.has('department.manage')} />
      ),
    });
  }
  // Teaching has its own gate: a head of department reads sections and staffs
  // courses without necessarily being able to read the whole staff directory.
  if (permissions?.has('section.read')) {
    items.push({
      key: 'teaching',
      label: 'Teaching',
      render: () => (
        <TeachingPage
          api={api}
          can={{
            manageSections: permissions.has('section.manage'),
            manageOfferings: permissions.has('offering.manage'),
            assignInstructors: permissions.has('instructor.assign'),
          }}
        />
      ),
    });
  }
  if (items.length === 0) {
    items.push({ key: 'none', label: 'Home', render: () => <NoAccessYet /> });
  }
  return items;
}

/** AD-18. No access is a designed state, normal on a first day, not an error. */
function NoAccessYet() {
  return (
    <div className="state">
      <h2 className="state__title">No access yet</h2>
      <p className="state__body">
        Your account is active, but nobody has given you access to anything.
        Ask your college administrator to grant you a role.
      </p>
    </div>
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
