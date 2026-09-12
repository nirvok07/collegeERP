/**
 * Composition root. The only place where infrastructure adapters meet
 * application ports. Nothing else constructs a repository or an adapter.
 */
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
  PgCredentialRepository,
  PgInvitationRepository,
  PgLoginAttemptRepository,
  PgOrgTreeReader,
  PgPersonRepository,
  PgPlatformAccountRepository,
  PgRefreshTokenRepository,
  PgRoleAssignmentRepository,
  PgRoleDefinitionRepository,
} from './modules/identity/infrastructure/repositories.ts';
import {
  PgCampusRepository,
  PgDepartmentRepository,
  PgInstitutionRepository,
} from './modules/institution/infrastructure/repositories.ts';
import { AuthorityService } from './modules/identity/application/resolve-authority.ts';
import type { Deps as IdentityProvisioningDeps } from './modules/identity/application/provision-initial-admin.ts';
import type { AuthenticateDeps } from './modules/identity/application/authenticate.ts';
import type { AcceptInvitationDeps } from './modules/identity/application/accept-invitation.ts';
import type { RefreshSessionDeps } from './modules/identity/application/refresh-session.ts';
import type { ManagePeopleDeps } from './modules/identity/application/manage-people.ts';
import type { ProvisionInstitutionDeps } from './modules/institution/application/provision-institution.ts';
import type { ManageOrgDeps } from './modules/institution/application/manage-org-units.ts';
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
  managePeople: ManagePeopleDeps;
  roleDefinitions: PgRoleDefinitionRepository;
  roleAssignments: PgRoleAssignmentRepository;
  provisionInstitution: ProvisionInstitutionDeps;
  manageOrg: ManageOrgDeps;
  institutions: PgInstitutionRepository;
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
  const orgTree = new PgOrgTreeReader();
  const institutions = new PgInstitutionRepository();
  const campuses = new PgCampusRepository();
  const departments = new PgDepartmentRepository();

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
    authority: new AuthorityService({ uow, assignments, orgTree, clock }),
    identityProvisioning,
    authenticate: {
      uow, platformAccounts, accounts, credentials, refreshTokens, loginAttempts,
      audit, hasher, tokens, clock, ids, refreshTtlDays: config.REFRESH_TOKEN_TTL_DAYS,
    },
    acceptInvitation: { uow, invitations, accounts, credentials, audit, hasher, tokens, clock, ids },
    refreshSession: {
      uow, refreshTokens, accounts, platformAccounts, audit, tokens, clock, ids,
      refreshTtlDays: config.REFRESH_TOKEN_TTL_DAYS,
    },
    managePeople: {
      uow, persons, accounts, assignments, roles, invitations, audit, ids, clock, tokens,
      invitationTtlHours: config.INVITATION_TTL_HOURS,
    },
    roleDefinitions: roles,
    roleAssignments: assignments,
    provisionInstitution: {
      uow, institutions, campuses, identity: identityProvisioning, audit, ids, clock,
    },
    manageOrg: { uow, campuses, departments, audit, ids, clock },
    close: async () => {
      if (!pool) await dbPool.end();
    },
  };
}
