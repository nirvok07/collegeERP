import type { ReactNode, SVGProps } from 'react';

/**
 * The module icon set for the sidebar. Inline stroke SVGs (20px), drawn to the
 * same convention as the theme sun/moon in AppShell: `viewBox 24`, `currentColor`
 * stroke, no fill. Icons are purely decorative — every nav item carries a text
 * label, so these are `aria-hidden` and a sighted-only aid.
 */

export type NavIconProps = SVGProps<SVGSVGElement> & { size?: number };

function I({ size = 20, children, ...rest }: NavIconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** Dashboard — a house with a door and a window. */
function DashboardIcon(props: NavIconProps) {
  return (
    <I {...props}>
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M5.5 10.5V20h13v-9.5" />
      <path d="M10 20v-5h4v5" />
    </I>
  );
}

/** People — staff directory / contacts. */
function PeopleIcon(props: NavIconProps) {
  return (
    <I {...props}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19c.5-3 2.6-4.5 5.5-4.5s5 1.5 5.5 4.5" />
      <path d="M15.5 5.2a3 3 0 0 1 0 5.6" />
      <path d="M17 14.7c2.2.5 3.3 2 3.6 4.3" />
    </I>
  );
}

/** Organisation — a campus building. */
function OrganisationIcon(props: NavIconProps) {
  return (
    <I {...props}>
      <path d="M4 21V6l8-3 8 3v15" />
      <path d="M3 21h18" />
      <path d="M9 21v-4h6v4" />
      <path d="M8.5 9H9m6 0h.5M8.5 12.5H9m6 0h.5" />
    </I>
  );
}

/** Curriculum — an open book. */
function CurriculumIcon(props: NavIconProps) {
  return (
    <I {...props}>
      <path d="M12 6.5C10 5 7 5 4.5 5.5V18C7 17.5 10 17.5 12 19c2-1.5 5-1.5 7.5-1V5.5C17 5 14 5 12 6.5Z" />
      <path d="M12 6.5V19" />
      <path d="M8 9.5h3M13 9.5h3M8 12.5h3" />
    </I>
  );
}

/** College — a graduation cap. */
function CollegeIcon(props: NavIconProps) {
  return (
    <I {...props}>
      <path d="M12 4 2.5 8l9.5 4 6-2.6" />
      <path d="M7 10.2V16c0 1 2.2 2 5 2s5-1 5-2v-5.8" />
      <path d="M17.5 10.4V16" />
    </I>
  );
}

/** Teaching — a chalkboard / presentation. */
function TeachingIcon(props: NavIconProps) {
  return (
    <I {...props}>
      <rect x="3.5" y="4.5" width="17" height="12" rx="1.5" />
      <path d="M8 20.5h8" />
      <path d="M12 16.5v4" />
      <path d="M7 9h4M7 12h6" />
    </I>
  );
}

/** Students — a person with a book. */
function StudentsIcon(props: NavIconProps) {
  return (
    <I {...props}>
      <circle cx="9.5" cy="7" r="3" />
      <path d="M4.5 19c.5-3 2.5-4.5 5-4.5s4.5 1.5 5 4.5" />
      <path d="M15 4.2c1.7.6 1.7 4 0 5" />
      <path d="m17.5 18.5 4-6 4 6M19.5 15.5H23" />
    </I>
  );
}

/** Timetable — a calendar. */
function TimetableIcon(props: NavIconProps) {
  return (
    <I {...props}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="1.5" />
      <path d="M3.5 9.5h17M8 3v3.5M16 3v3.5" />
      <path d="M7 13h2M11 13h2M15 13h2M7 16.5h2M11 16.5h2" />
    </I>
  );
}

/** Attendance — a checked clipboard. */
function AttendanceIcon(props: NavIconProps) {
  return (
    <I {...props}>
      <rect x="5.5" y="4" width="13" height="17" rx="1.5" />
      <path d="M9 4.5V3h6v1.5" />
      <path d="m8.5 12.5 2 2 3.5-3.5" />
    </I>
  );
}

/** Assessment — a clipboard with a list. */
function AssessmentIcon(props: NavIconProps) {
  return (
    <I {...props}>
      <rect x="5.5" y="4" width="13" height="17" rx="1.5" />
      <path d="M9 4.5V3h6v1.5" />
      <path d="M8.5 11h7M8.5 14.5h7M8.5 18h3.5" />
    </I>
  );
}

/** Institutions (platform) — columns of a building. */
function InstitutionsIcon(props: NavIconProps) {
  return (
    <I {...props}>
      <path d="M3 10.5 12 4l9 6.5" />
      <path d="M5 9.5V20h14V9.5" />
      <path d="M6 16h3M15 16h3M6 12.5h3M15 12.5h3" />
    </I>
  );
}

/** Audit (platform) — a magnifier over a shield. */
function AuditIcon(props: NavIconProps) {
  return (
    <I {...props}>
      <path d="M12 3.5 6 6v4c0 4 2.4 7.4 6 9 3.6-1.6 6-5 6-9V6l-6-2.5Z" />
      <path d="m15 13-3 3-1.5-1.5" />
    </I>
  );
}

/** Accounts (platform) — a person with a role badge. */
function AccountsIcon(props: NavIconProps) {
  return (
    <I {...props}>
      <circle cx="10" cy="8" r="3.2" />
      <path d="M4 19.5c.5-3 2.6-4.5 5.5-4.5s5 1.5 5.5 4.5" />
      <path d="M16 12.5h5M18.5 10v5" />
    </I>
  );
}

/** Profile — a person in a circle. */
function ProfileIcon(props: NavIconProps) {
  return (
    <I {...props}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="10" r="3" />
      <path d="M6.5 18.5c1-2.8 3-4 5.5-4s4.5 1.2 5.5 4" />
    </I>
  );
}

/**
 * Registry keyed by nav-item `key`, so App.tsx attaches an icon to each section
 * without the shell knowing anything about a particular module. Values are
 * static elements (not components) reused where a section appears more than once.
 */
export const MODULE_ICONS: Record<string, ReactNode> = {
  home: <DashboardIcon />,
  profile: <ProfileIcon />,
  people: <PeopleIcon />,
  organisation: <OrganisationIcon />,
  curriculum: <CurriculumIcon />,
  college: <CollegeIcon />,
  teaching: <TeachingIcon />,
  students: <StudentsIcon />,
  timetable: <TimetableIcon />,
  attendance: <AttendanceIcon />,
  assessment: <AssessmentIcon />,
  institutions: <InstitutionsIcon />,
  audit: <AuditIcon />,
  accounts: <AccountsIcon />,
};