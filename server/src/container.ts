import { PgCollegeOverviewReader } from './modules/institution/infrastructure/overview.ts';
/**
 * Composition root. The only place where infrastructure adapters meet
 * application ports. Nothing else constructs a repository or an adapter.
 */
import { sealerFor } from './config/config.ts';
import { OtplibTotp } from './infrastructure/crypto/totp.ts';
import type { PlatformMfaDeps } from './modules/identity/application/platform-mfa.ts';
import type { OtpDeps } from './modules/identity/application/otp-sign-in.ts';
import { NoMessageSender, SmtpEmailSender } from './infrastructure/messaging/otp-senders.ts';
import type {
  ManagePlatformAccountsDeps, PlatformAuthorityReader,
} from './modules/identity/application/manage-platform-accounts.ts';
import { TenantAccessGate } from './infrastructure/http/tenant-access.ts';
import type { LifecycleDeps } from './modules/institution/application/manage-lifecycle.ts';
import type { PasswordResetDeps } from './modules/identity/application/password-reset.ts';
import type { StudentAccessDeps } from './modules/identity/application/student-access.ts';
import { PgStudentSelfReader } from './modules/enrolment/infrastructure/student-self.ts';
import type { ChangePasswordDeps } from './modules/identity/application/change-password.ts';
import type { PlatformAuditDeps } from './modules/institution/application/platform-audit.ts';
import type { Config } from './config/config.ts';
import { createPool, type Pool } from './infrastructure/db/pool.ts';
import { PgUnitOfWork } from './infrastructure/db/unit-of-work.ts';
import { PgAuditWriter } from './infrastructure/db/audit-writer.ts';
import {
  JwtTokenIssuer,
  ScryptPasswordHasher,
  SystemClock,
  UuidGenerator,
} from './infrastructure/crypto/adapters.ts';
import {
  CloudinaryMediaStorage,
  InMemoryMediaStorage,
} from './infrastructure/media/cloudinary-storage.ts';
import {
  PgAccountRepository,
  PgDeviceRepository,
  PgCredentialRepository,
  PgInvitationRepository,
  PgLoginAttemptRepository,
  PgOrgTreeReader,
  PgPersonRepository,
  PgPlatformAccountRepository,
  PgRefreshTokenRepository,
  PgRoleAssignmentRepository,
  PgRoleDefinitionRepository,
  PgPlatformAdminRepository,
  PgPlatformMfaRepository,
  PgOtpRepository,
  PgSignInIdentityReader,
} from './modules/identity/infrastructure/repositories.ts';
import {
  PgCampusRepository,
  PgDepartmentRepository,
  PgInstitutionRepository,
  PgPlatformAuditReader,
} from './modules/institution/infrastructure/repositories.ts';
import { AuthorityService } from './modules/identity/application/resolve-authority.ts';
import type { Deps as IdentityProvisioningDeps } from './modules/identity/application/provision-initial-admin.ts';
import type { AuthenticateDeps } from './modules/identity/application/authenticate.ts';
import type { AcceptInvitationDeps } from './modules/identity/application/accept-invitation.ts';
import type { RefreshSessionDeps } from './modules/identity/application/refresh-session.ts';
import type { ManagePeopleDeps } from './modules/identity/application/manage-people.ts';
import type { ManageDevicesDeps } from './modules/identity/application/manage-devices.ts';
import type { ProvisionInstitutionDeps } from './modules/institution/application/provision-institution.ts';
import type { ManageOrgDeps } from './modules/institution/application/manage-org-units.ts';
import type { CurriculumDeps } from './modules/curriculum/application/manage-curriculum.ts';
import type { TeachingDeps } from './modules/teaching/application/manage-sections.ts';
import {
  PgAcademicYearRepository, PgInstructorAssignmentRepository, PgOfferingRepository,
  PgSectionRepository, PgTermRepository,
} from './modules/teaching/infrastructure/repositories.ts';
import type { OfferingDeps } from './modules/teaching/application/manage-offerings.ts';
import {
  PgCalendarEventRepository, PgNonTeachingDayRepository, PgRoomRepository, PgSessionRepository, PgSlotRepository,
  PgTeachingReachReader,
} from './modules/delivery/infrastructure/repositories.ts';
import type { RoomDeps } from './modules/delivery/application/manage-rooms.ts';
import type { TimetableDeps } from './modules/delivery/application/manage-timetable.ts';
import type { SessionDeps } from './modules/delivery/application/manage-sessions.ts';
import {
  PgEnrolmentRepository, PgMembershipRepository, PgStudentRepository,
} from './modules/enrolment/infrastructure/repositories.ts';
import type { EnrolmentDeps } from './modules/enrolment/application/manage-students.ts';
import {
  PgMarkRepository, PgSheetRepository,
} from './modules/attendance/infrastructure/repositories.ts';
import type { AttendanceDeps } from './modules/attendance/application/manage-attendance.ts';
import {
  PgAssessmentMarkRepository, PgComponentRepository,
} from './modules/assessment/infrastructure/repositories.ts';
import type { AssessmentDeps } from './modules/assessment/application/manage-assessment.ts';
import {
  PgCourseRepository, PgCurriculumRepository, PgProgramRepository,
} from './modules/curriculum/infrastructure/repositories.ts';
import {
  PgFeeHeadRepository, PgFeeRequestRepository, PgFeeStructureRepository, PgInvoiceRepository,
  PgPaymentRepository,
} from './modules/fees/infrastructure/repositories.ts';
import type { FeesDeps } from './modules/fees/application/manage-fees.ts';
import { PgSyllabusRepository } from './modules/syllabus/infrastructure/repositories.ts';
import type { SyllabusDeps } from './modules/syllabus/application/ports.ts';
import type { MediaStorage } from './shared/application/ports.ts';

export interface Container {
  config: Config;
  pool: Pool;
  authority: AuthorityService;
  media: MediaStorage;
  identityProvisioning: IdentityProvisioningDeps;
  authenticate: AuthenticateDeps;
  acceptInvitation: AcceptInvitationDeps;
  refreshSession: RefreshSessionDeps;
  changePassword: ChangePasswordDeps;
  passwordReset: PasswordResetDeps & { uow: PgUnitOfWork };
  studentAccess: StudentAccessDeps;
  studentSelf: PgStudentSelfReader;
  managePeople: ManagePeopleDeps;
  manageDevices: ManageDevicesDeps;
  roleDefinitions: PgRoleDefinitionRepository;
  roleAssignments: PgRoleAssignmentRepository;
  provisionInstitution: ProvisionInstitutionDeps;
  manageOrg: ManageOrgDeps;
  curriculum: CurriculumDeps;
  teaching: TeachingDeps;
  offerings: OfferingDeps;
  rooms: RoomDeps;
  timetable: TimetableDeps;
  sessions: SessionDeps;
  enrolment: EnrolmentDeps;
  attendance: AttendanceDeps;
  assessment: AssessmentDeps;
  fees: FeesDeps;
  syllabus: SyllabusDeps;
  institutions: PgInstitutionRepository;
  collegeOverview: PgCollegeOverviewReader;
  tenantAccess: TenantAccessGate;
  platformAuthority: PlatformAuthorityReader;
  managePlatformAccounts: ManagePlatformAccountsDeps;
  platformMfa: PlatformMfaDeps;
  /** AD-82: sign-in by a one-time code, for colleges and the platform. */
  otpSignIn: OtpDeps;
  lifecycle: LifecycleDeps;
  platformAudit: PlatformAuditDeps;
  uow: PgUnitOfWork;
  close(): Promise<void>;
}

export function buildContainer(config: Config, pool?: Pool): Container {
  const dbPool = pool ?? createPool(config.DATABASE_URL);
  const uow = new PgUnitOfWork(dbPool);

  const clock = new SystemClock();
  const ids = new UuidGenerator();
  const hasher = new ScryptPasswordHasher();
  const tokens = new JwtTokenIssuer(config.JWT_SECRET, config.ACCESS_TOKEN_TTL_SECONDS);
  const audit = new PgAuditWriter(ids, uow);

  const persons = new PgPersonRepository();
  const accounts = new PgAccountRepository();
  const credentials = new PgCredentialRepository();
  const platformAccounts = new PgPlatformAccountRepository();
  const roles = new PgRoleDefinitionRepository();
  const assignments = new PgRoleAssignmentRepository();
  const invitations = new PgInvitationRepository();
  const refreshTokens = new PgRefreshTokenRepository();
  const loginAttempts = new PgLoginAttemptRepository();
  const devices = new PgDeviceRepository();
  const orgTree = new PgOrgTreeReader();
  const institutions = new PgInstitutionRepository();
  const campuses = new PgCampusRepository();
  const departments = new PgDepartmentRepository();
  const sectionRepository = new PgSectionRepository();
  const offeringRepository = new PgOfferingRepository();
  const termRepository = new PgTermRepository();
  const roomRepository = new PgRoomRepository();
  const nonTeachingDays = new PgNonTeachingDayRepository();
  const calendarEvents = new PgCalendarEventRepository();
  const slotRepository = new PgSlotRepository();
  const sessionRepository = new PgSessionRepository();
  const studentRepository = new PgStudentRepository();
  const membershipRepository = new PgMembershipRepository();
  const enrolmentRepository = new PgEnrolmentRepository();
  const reachReader = new PgTeachingReachReader();

  // Cloudinary only when configured; otherwise an in-memory adapter, so the
  // application never branches on which one it received.
  const media: MediaStorage =
    process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET
      ? new CloudinaryMediaStorage({
          cloudName: process.env.CLOUDINARY_CLOUD_NAME,
          apiKey: process.env.CLOUDINARY_API_KEY,
          apiSecret: process.env.CLOUDINARY_API_SECRET,
        })
      : new InMemoryMediaStorage();

  const tenantAccess = new TenantAccessGate(uow, institutions);
  const platformAdmin = new PgPlatformAdminRepository();
  const platformMfa = new PgPlatformMfaRepository();
  const otpChallenges = new PgOtpRepository();
  const sealer = sealerFor(config);
  const totp = new OtplibTotp();

  const identityProvisioning: IdentityProvisioningDeps = {
    persons, accounts, assignments, roles, invitations, audit, ids, clock, tokens,
    invitationTtlHours: config.INVITATION_TTL_HOURS,
  };

  return {
    config,
    pool: dbPool,
    media,
    uow,
    institutions,
    collegeOverview: new PgCollegeOverviewReader(),
    tenantAccess,
    platformAuthority: {
      forAccount: (id) => uow.run(null, (tx) => platformAdmin.authorityOf(tx, id)),
    },
    managePlatformAccounts: {
      uow, platformAdmin, mfa: platformMfa, tokens, audit, ids, clock,
      invitationTtlHours: config.INVITATION_TTL_HOURS,
    },
    platformMfa: {
      uow, mfa: platformMfa, platformAccounts, platformAdmin, refreshTokens, loginAttempts,
      hasher, tokens, sealer, totp, audit, ids, clock, refreshTtlDays: config.REFRESH_TOKEN_TTL_DAYS,
    },
    otpSignIn: {
      uow, otp: otpChallenges, identities: new PgSignInIdentityReader(), accounts, platformAccounts,
      refreshTokens, loginAttempts, audit, tokens, ids, clock, tenantAccess,
      refreshTtlDays: config.REFRESH_TOKEN_TTL_DAYS,
      fixedCode: config.OTP_FIXED_CODE,
      // OTP-7: email codes are real once SMTP is configured; WhatsApp and SMS
      // have no provider yet and use the fixed code (AD-82's go-live blocker).
      sender: config.SMTP_HOST && config.SMTP_FROM
        ? new SmtpEmailSender(
            {
              host: config.SMTP_HOST, port: config.SMTP_PORT, secure: config.SMTP_SECURE === 'true',
              user: config.SMTP_USER || undefined, pass: config.SMTP_PASS || undefined, from: config.SMTP_FROM,
            },
            // Never the code or the address: the provider's own error only.
            (message) => console.warn(`Sign-in code email not sent: ${message}`),
          )
        : new NoMessageSender(),
    },
    lifecycle: {
      uow, institutions, audit, ids, clock,
      identity: {
        accounts, invitations, assignments, audit, ids, clock, tokens,
        invitationTtlHours: config.INVITATION_TTL_HOURS,
      },
      onStatusChanged: (id) => tenantAccess.invalidate(id),
    },
    platformAudit: { uow, platformAudit: new PgPlatformAuditReader() },
    authority: new AuthorityService({ uow, assignments, orgTree, clock }),
    identityProvisioning,
    authenticate: {
      uow, platformAccounts, accounts, credentials, refreshTokens, loginAttempts,
      audit, hasher, tokens, clock, ids, refreshTtlDays: config.REFRESH_TOKEN_TTL_DAYS,
      platformMfa,
    },
    acceptInvitation: { uow, invitations, accounts, credentials, refreshTokens, audit, hasher, tokens, clock, ids },
    studentAccess: { uow, students: studentRepository, accounts, invitations, audit, ids, clock, tokens },
    studentSelf: new PgStudentSelfReader(),
    passwordReset: {
      uow, accounts, invitations, assignments, audit, ids, clock, tokens,
      invitationTtlHours: config.INVITATION_TTL_HOURS,
    },
    changePassword: { uow, credentials, refreshTokens, hasher, audit, ids, clock },
    refreshSession: {
      uow, refreshTokens, accounts, platformAccounts, audit, tokens, clock, ids,
      refreshTtlDays: config.REFRESH_TOKEN_TTL_DAYS, tenantAccess,
    },
    managePeople: {
      uow, persons, accounts, assignments, roles, invitations, audit, ids, clock, tokens,
      invitationTtlHours: config.INVITATION_TTL_HOURS,
      otp: otpChallenges,
    },
    manageDevices: { uow, devices, audit, ids, clock, tokens },
    roleDefinitions: roles,
    roleAssignments: assignments,
    provisionInstitution: {
      uow, institutions, campuses, identity: identityProvisioning, audit, ids, clock,
    },
    manageOrg: { uow, campuses, departments, audit, ids, clock },
    curriculum: {
      uow, audit, ids, clock,
      programs: new PgProgramRepository(),
      courses: new PgCourseRepository(),
      curriculum: new PgCurriculumRepository(),
    },
    teaching: {
      uow, audit, ids, clock,
      years: new PgAcademicYearRepository(),
      terms: termRepository,
      sections: sectionRepository,
      offerings: offeringRepository,
    },
    offerings: {
      uow, audit, ids, clock,
      offerings: offeringRepository,
      instructors: new PgInstructorAssignmentRepository(),
      sections: sectionRepository,
    },
    // M4 reads M3 through its ports rather than keeping its own copy of who
    // teaches what: there is one statement of that, and it lives in M3.
    rooms: { uow, audit, ids, clock, rooms: roomRepository, days: nonTeachingDays, events: calendarEvents },
    timetable: {
      uow, audit, ids, clock,
      slots: slotRepository,
      sessions: sessionRepository,
      days: nonTeachingDays,
      offerings: offeringRepository,
      terms: termRepository,
    },
    sessions: {
      uow, audit, ids, clock,
      sessions: sessionRepository,
      offerings: offeringRepository,
      reach: reachReader,
    },
    // M5 reads M1's person port and M3's section and offering ports. It owns the
    // student record and the two bindings, and duplicates none of them.
    enrolment: {
      uow, audit, ids, clock,
      students: studentRepository,
      memberships: membershipRepository,
      enrolments: enrolmentRepository,
      persons,
      sections: sectionRepository,
      offerings: offeringRepository,
    },
    // M6 consumes M4's session and M5's roster through their ports, and reuses
    // the same reach reader session completion uses, so there is one statement
    // of which teaching a person can act on.
    attendance: {
      uow, audit, ids, clock,
      sheets: new PgSheetRepository(),
      marks: new PgMarkRepository(),
      sessions: sessionRepository,
      enrolments: enrolmentRepository,
      reach: reachReader,
    },
    // M7 consumes M3's offering, M5's roster and the one reach reader, so which
    // teaching a person can act on is stated in exactly one place.
    assessment: {
      uow, audit, ids, clock,
      components: new PgComponentRepository(),
      marks: new PgAssessmentMarkRepository(),
      offerings: offeringRepository,
      enrolments: enrolmentRepository,
      reach: reachReader,
    },
    fees: {
      uow, audit, ids, clock,
      feeHeads: new PgFeeHeadRepository(),
      structures: new PgFeeStructureRepository(),
      invoices: new PgInvoiceRepository(),
      requests: new PgFeeRequestRepository(),
      payments: new PgPaymentRepository(),
    },
    // M12 reads its own table and routes the binary through the shared media
    // port, exactly as college branding does.
    syllabus: {
      uow, media, ids, clock,
      syllabus: new PgSyllabusRepository(),
    },
    close: async () => {
      if (!pool) await dbPool.end();
    },
  };
}
