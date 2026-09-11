-- 001_init.sql — platform, institution and identity foundation.
-- Implements M1 (identity and access) and the minimum of M2 (institution) required by AD-20.
-- Isolation is enforced twice per AD-22: in the data access layer, and again here by RLS.

-- No extensions are required. Case-insensitive identifiers are handled by
-- normalising to lowercase at the application boundary and enforcing it with a
-- CHECK, which keeps the schema portable and needs no elevated privilege.

-- ---------------------------------------------------------------------------
-- Platform actors. Deliberately NOT rows in persons.
-- M1 section 2 states the Platform Owner must not access institution data.
-- A separate table makes that boundary structural rather than a nullable column.
-- ---------------------------------------------------------------------------
CREATE TABLE platform_accounts (
  id              uuid PRIMARY KEY,
  email           text NOT NULL UNIQUE CHECK (email = lower(email)),
  full_name       text NOT NULL,
  credential_hash text NOT NULL,
  status          text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','suspended','deactivated')),
  failed_attempts int NOT NULL DEFAULT 0,
  locked_until    timestamptz,
  last_login_at   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  version         int NOT NULL DEFAULT 1
);

-- ---------------------------------------------------------------------------
-- M2 — Institution. The tenant itself, so it carries no tenant_id.
-- AD-21: no administrator pointer here. "Who administers this college" is
-- answered by querying role_assignments, like every other authority question.
-- ---------------------------------------------------------------------------
CREATE TABLE institutions (
  id          uuid PRIMARY KEY,
  code        text NOT NULL UNIQUE,
  name        text NOT NULL,
  status      text NOT NULL DEFAULT 'trial'
                CHECK (status IN ('trial','active','suspended','closed')),
  plan        text NOT NULL DEFAULT 'standard',
  seat_limit  int  NOT NULL DEFAULT 500 CHECK (seat_limit > 0),
  timezone    text NOT NULL DEFAULT 'Asia/Kolkata',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  version     int NOT NULL DEFAULT 1
);

-- Organisational tree. AD-2: campus is a first-class scope from day one,
-- defaulting to one implicit campus for tenants that have only one.
CREATE TABLE campuses (
  id         uuid PRIMARY KEY,
  tenant_id  uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  name       text NOT NULL,
  code       text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version    int NOT NULL DEFAULT 1,
  UNIQUE (tenant_id, code)
);

CREATE TABLE departments (
  id         uuid PRIMARY KEY,
  tenant_id  uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  campus_id  uuid NOT NULL REFERENCES campuses(id) ON DELETE RESTRICT,
  name       text NOT NULL,
  code       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version    int NOT NULL DEFAULT 1,
  UNIQUE (tenant_id, code)
);

-- ---------------------------------------------------------------------------
-- M1 — Identity. AD-14: Person and UserAccount are separate entities.
-- ---------------------------------------------------------------------------
CREATE TABLE persons (
  id             uuid PRIMARY KEY,
  tenant_id      uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  full_name      text NOT NULL,
  primary_email  text CHECK (primary_email IS NULL OR primary_email = lower(primary_email)),
  primary_phone  text,
  person_type    text NOT NULL
                   CHECK (person_type IN ('staff','student','guardian','applicant','external')),
  status         text NOT NULL DEFAULT 'provisional'
                   CHECK (status IN ('provisional','verified','merged','archived')),
  merged_into_id uuid REFERENCES persons(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  version        int NOT NULL DEFAULT 1,
  deleted_at     timestamptz
);
CREATE INDEX persons_tenant_idx ON persons (tenant_id) WHERE deleted_at IS NULL;

CREATE TABLE user_accounts (
  id               uuid PRIMARY KEY,
  tenant_id        uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  person_id        uuid NOT NULL REFERENCES persons(id) ON DELETE RESTRICT,
  login_identifier text NOT NULL CHECK (login_identifier = lower(login_identifier)),
  status           text NOT NULL DEFAULT 'invited'
                     CHECK (status IN ('invited','active','locked','suspended','deactivated','archived')),
  mfa_required     boolean NOT NULL DEFAULT false,
  failed_attempts  int NOT NULL DEFAULT 0,
  locked_until     timestamptz,
  activated_at     timestamptz,
  deactivated_at   timestamptz,
  last_login_at    timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  version          int NOT NULL DEFAULT 1
);
-- BR-3: login identifier unique per tenant, not globally, so one person may
-- legitimately exist at two colleges.
CREATE UNIQUE INDEX user_accounts_identifier_uq
  ON user_accounts (tenant_id, login_identifier)
  WHERE status <> 'deactivated' AND status <> 'archived';
-- BR-15: at most one live account per person, enforced by the database.
CREATE UNIQUE INDEX user_accounts_one_live_per_person_uq
  ON user_accounts (person_id)
  WHERE status IN ('invited','active','locked','suspended');

CREATE TABLE credentials (
  account_id uuid PRIMARY KEY REFERENCES user_accounts(id) ON DELETE CASCADE,
  tenant_id  uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  hash       text NOT NULL,
  algorithm  text NOT NULL DEFAULT 'scrypt',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE invitation_tokens (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  account_id  uuid NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
  id          uuid PRIMARY KEY,
  tenant_id   uuid REFERENCES institutions(id) ON DELETE RESTRICT,
  account_id  uuid REFERENCES user_accounts(id) ON DELETE CASCADE,
  platform_account_id uuid REFERENCES platform_accounts(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK ((account_id IS NOT NULL) <> (platform_account_id IS NOT NULL))
);

-- ---------------------------------------------------------------------------
-- Authorisation. AD-1: authority is role x scope x validity.
-- There is deliberately no role column anywhere, and no user_permission table:
-- a direct grant outside a role would be unreviewable.
-- ---------------------------------------------------------------------------
CREATE TABLE permissions (
  key          text PRIMARY KEY,
  module       text NOT NULL,
  label        text NOT NULL,
  sensitivity  text NOT NULL DEFAULT 'normal'
                 CHECK (sensitivity IN ('normal','sensitive','critical')),
  requires_mfa boolean NOT NULL DEFAULT false,
  delegable    boolean NOT NULL DEFAULT true
);

CREATE TABLE role_definitions (
  id                  uuid PRIMARY KEY,
  tenant_id           uuid REFERENCES institutions(id) ON DELETE CASCADE,  -- NULL = platform template
  key                 text NOT NULL,
  name                text NOT NULL,
  permission_keys     text[] NOT NULL DEFAULT '{}',
  allowed_scope_types text[] NOT NULL DEFAULT '{}',
  requires_approval   boolean NOT NULL DEFAULT false,
  is_system           boolean NOT NULL DEFAULT false,
  status              text NOT NULL DEFAULT 'active' CHECK (status IN ('active','retired')),
  version             int NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX role_definitions_platform_key_uq
  ON role_definitions (key) WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX role_definitions_tenant_key_uq
  ON role_definitions (tenant_id, key) WHERE tenant_id IS NOT NULL;

CREATE TABLE role_assignments (
  id                  uuid PRIMARY KEY,
  tenant_id           uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  person_id           uuid NOT NULL REFERENCES persons(id) ON DELETE RESTRICT,
  role_id             uuid NOT NULL REFERENCES role_definitions(id) ON DELETE RESTRICT,
  scope_type          text NOT NULL
                        CHECK (scope_type IN ('institution','campus','department','program','section','committee','self')),
  scope_ref_id        uuid,
  valid_from          timestamptz NOT NULL DEFAULT now(),
  valid_to            timestamptz,
  status              text NOT NULL DEFAULT 'active'
                        CHECK (status IN ('draft','pending','active','expiring','expired','revoked','rejected')),
  source              text NOT NULL DEFAULT 'manual'
                        CHECK (source IN ('bootstrap','manual','import','automatic','request')),
  granted_by_person   uuid REFERENCES persons(id),
  granted_by_platform uuid REFERENCES platform_accounts(id),
  granted_at          timestamptz NOT NULL DEFAULT now(),
  reason              text,
  revoked_at          timestamptz,
  revoked_by          uuid REFERENCES persons(id),
  revocation_reason   text,
  version             int NOT NULL DEFAULT 1,
  -- institution scope needs no ref; every other scope type must name its target
  CHECK (scope_type = 'institution' OR scope_ref_id IS NOT NULL),
  CHECK (valid_to IS NULL OR valid_to > valid_from)
);
CREATE UNIQUE INDEX role_assignments_active_uq
  ON role_assignments (person_id, role_id, scope_type, COALESCE(scope_ref_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status = 'active';
-- The hottest query in the system: resolve a person's live authority.
CREATE INDEX role_assignments_person_active_idx
  ON role_assignments (person_id) WHERE status = 'active';

-- ---------------------------------------------------------------------------
-- P6 — Audit. Append-only: no UPDATE or DELETE path exists in the application,
-- and the grants below withhold both from the application role.
-- ---------------------------------------------------------------------------
CREATE TABLE audit_events (
  id             uuid PRIMARY KEY,
  tenant_id      uuid REFERENCES institutions(id) ON DELETE RESTRICT,
  correlation_id uuid NOT NULL,
  actor_type     text NOT NULL CHECK (actor_type IN ('platform','person','system')),
  actor_id       uuid,
  action         text NOT NULL,
  subject_type   text NOT NULL,
  subject_id     uuid,
  scope_type     text,
  scope_ref_id   uuid,
  before_state   jsonb,
  after_state    jsonb,
  reason         text,
  ip_hash        text,
  at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_tenant_at_idx ON audit_events (tenant_id, at DESC);
CREATE INDEX audit_events_subject_idx ON audit_events (subject_type, subject_id);

CREATE TABLE login_attempts (
  id              uuid PRIMARY KEY,
  tenant_id       uuid REFERENCES institutions(id) ON DELETE RESTRICT,
  identifier_hash text NOT NULL,
  account_id      uuid,
  outcome         text NOT NULL CHECK (outcome IN ('success','failure')),
  failure_reason  text,
  ip_hash         text,
  at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX login_attempts_identifier_idx ON login_attempts (identifier_hash, at DESC);

-- ---------------------------------------------------------------------------
-- Row level security. AD-22: the second of two independent isolation layers.
-- FORCE is required so the table owner is subject to the policy too.
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'campuses','departments','persons','user_accounts','credentials',
    'invitation_tokens','role_assignments','audit_events','login_attempts'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING (tenant_id IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '')::uuid)
    $f$, t);
  END LOOP;
END $$;

-- refresh_tokens carries platform rows (tenant_id NULL) alongside tenant rows.
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON refresh_tokens
  USING (tenant_id IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '')::uuid);

-- role_definitions holds platform templates (tenant_id NULL) readable by all tenants.
ALTER TABLE role_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_definitions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_or_template ON role_definitions
  USING (tenant_id IS NULL
         OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
