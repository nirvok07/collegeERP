import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Banner, ToastHost } from './components/index.tsx';
import { ApiClient, type ApiFailure } from './lib/api.ts';
import { AuthSession, type Actor } from './lib/auth.ts';
import { SignInPage } from './features/auth/SignInPage.tsx';
import { InstitutionsPage } from './features/institutions/InstitutionsPage.tsx';
import { AuditPage } from './features/platform-audit/AuditPage.tsx';
import { PlatformInvitePage } from './features/auth/PlatformInvitePage.tsx';
import { invitationTokenFrom } from './features/auth/mfa.ts';
import { AccountsPage } from './features/platform-accounts/AccountsPage.tsx';
import { PeoplePage } from './features/people/PeoplePage.tsx';
import { OrganisationPage } from './features/organisation/OrganisationPage.tsx';
import { CollegePage } from './features/college/CollegePage.tsx';
import { CurriculumPage } from './features/curriculum/CurriculumPage.tsx';
import { TeachingPage } from './features/teaching/TeachingPage.tsx';
import { DeliveryPage } from './features/delivery/DeliveryPage.tsx';
import { StudentsPage } from './features/students/StudentsPage.tsx';
import { AttendancePage } from './features/attendance/AttendancePage.tsx';
import { AssessmentPage } from './features/assessment/AssessmentPage.tsx';
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
  // SA-3b: a platform invitation link opens its own setup page.
  const [invite, setInvite] = useState(() => window.location.pathname === '/platform/enrol');

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
      ) : invite ? (
        <PlatformInvitePage
          auth={auth}
          token={invitationTokenFrom(window.location.search)}
          onDone={() => { window.history.replaceState(null, '', '/'); setInvite(false); }}
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
    // SA-3a: sections follow the platform role's permissions, read from the server.
    const platform: NavItem[] = [];
    if (permissions?.has('platform.colleges.read')) {
      platform.push({
        key: 'institutions', label: 'Colleges',
        render: () => <InstitutionsPage api={api} canManage={permissions.has('platform.colleges.manage')} />,
      });
    }
    if (permissions?.has('platform.audit.read')) {
      platform.push({ key: 'audit', label: 'Audit', render: () => <AuditPage api={api} /> });
    }
    if (permissions?.has('platform.accounts.read')) {
      platform.push({
        key: 'accounts', label: 'Accounts',
        render: () => (
          <AccountsPage
            api={api}
            canManage={permissions.has('platform.accounts.manage')}
            canAssignRoles={permissions.has('platform.roles.manage')}
          />
        ),
      });
    }
    return platform;
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
  // AD-70: how the college appears in the app. Read by whoever may read the
  // college's record; changed only with institution.manage.
  if (permissions?.has('institution.read')) {
    items.push({
      key: 'college',
      label: 'College',
      render: () => <CollegePage api={api} canManage={permissions.has('institution.manage')} />,
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
            manageSessions: permissions.has('session.manage'),
            planAssessment: permissions.has('assessment.plan'),
          }}
        />
      ),
    });
  }
  if (permissions?.has('student.read')) {
    items.push({
      key: 'students',
      label: 'Students',
      render: () => (
        <StudentsPage
          api={api}
          can={{
            manageStudents: permissions.has('student.manage'),
            manageEnrolment: permissions.has('enrolment.manage'),
          }}
        />
      ),
    });
  }
  // Delivery is its own section: the question "what is happening today" is a
  // different job from "who teaches what", and the same person rarely does both
  // at the same moment.
  if (permissions?.has('session.read')) {
    items.push({
      key: 'timetable',
      label: 'Timetable',
      render: () => (
        <DeliveryPage
          api={api}
          can={{
            manageSessions: permissions.has('session.manage'),
            manageRooms: permissions.has('room.manage'),
            manageCalendar: permissions.has('term.manage'),
          }}
        />
      ),
    });
  }
  if (permissions?.has('attendance.read')) {
    items.push({
      key: 'attendance',
      label: 'Attendance',
      // No permissions prop: what this reader may do with a register is stated
      // per register by the server, which resolves it against the cohort.
      render: () => <AttendancePage api={api} />,
    });
  }
  // The verification queue. Only somebody who may verify has anything to do here;
  // the server narrows it further to the cohorts they reach.
  if (permissions?.has('assessment.verify')) {
    items.push({
      key: 'assessment',
      label: 'Assessment',
      render: () => <AssessmentPage api={api} />,
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
