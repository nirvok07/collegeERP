import { PgCollegeOverviewReader } from './modules/institution/infrastructure/overview.ts';
/**
 * Composition root. The only place where infrastructure adapters meet
 * application ports. Nothing else constructs a repository or an adapter.
 */
import { sealerFor } from './config/config.ts';
import { OtplibTotp } from './infrastructure/crypto/totp.ts';
import type { PlatformMfaDeps } from './modules/identity/application/platform-mfa.ts';
import type {
  ManagePlatformAccountsDeps, PlatformAuthorityReader,
} from './modules/identity/application/manage-platform-accounts.ts';
import { TenantAccessGate } from './infrastructure/http/tenant-access.ts';
import type { LifecycleDeps } from './modules/institution/application/manage-lifecycle.ts';
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
  PgNonTeachingDayRepository, PgRoomRepository, PgSessionRepository, PgSlotRepository,
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
  institutions: PgInstitutionRepository;
  collegeOverview: PgCollegeOverviewReader;
  tenantAccess: TenantAccessGate;
  platformAuthority: PlatformAuthorityReader;
  managePlatformAccounts: ManagePlatformAccountsDeps;
  platformMfa: PlatformMfaDeps;
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
    lifecycle: {
      uow, institutions, audit, ids, clock,
      identity: {
        accounts, invitations, audit, ids, clock, tokens,
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
    acceptInvitation: { uow, invitations, accounts, credentials, audit, hasher, tokens, clock, ids },
    changePassword: { uow, credentials, refreshTokens, hasher, audit, ids, clock },
    refreshSession: {
      uow, refreshTokens, accounts, platformAccounts, audit, tokens, clock, ids,
      refreshTtlDays: config.REFRESH_TOKEN_TTL_DAYS, tenantAccess,
    },
    managePeople: {
      uow, persons, accounts, assignments, roles, invitations, audit, ids, clock, tokens,
      invitationTtlHours: config.INVITATION_TTL_HOURS,
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
    rooms: { uow, audit, ids, clock, rooms: roomRepository, days: nonTeachingDays },
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
    close: async () => {
      if (!pool) await dbPool.end();
    },
  };
}
