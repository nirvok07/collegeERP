-- 035_fee_fines_and_waivers.sql
--
-- M11 Student Finance, FEE-5: fines and late fees, and waiving either
-- through the same request/approval shape FEE-3 built for concessions
-- (module doc §5). Reuses `invoices` as the one table for anything a
-- student owes: an instalment (already built), a fine (charged directly,
-- no approval needed), or a late fee (charged once an instalment is
-- overdue). Reuses `fee_requests`, whose 'waiver' kind was already in the
-- CHECK constraint from migration 033, unused until now.
--
-- v1 boundary: there is no background scheduler in this codebase (grep
-- confirms it), so a late fee is not applied automatically at midnight —
-- the Accountant (or, later, a real scheduler calling the same endpoint)
-- triggers it per instalment. Automatic triggering is a real gap, recorded
-- here rather than solved by inventing job infrastructure this slice does
-- not need for correctness.

ALTER TABLE invoices
  ADD COLUMN kind text NOT NULL DEFAULT 'instalment' CHECK (kind IN ('instalment', 'fine', 'late_fee')),
  ADD COLUMN reason text,
  ALTER COLUMN fee_structure_id DROP NOT NULL,
  ALTER COLUMN instalment_id DROP NOT NULL;

ALTER TABLE invoices ADD CONSTRAINT invoices_kind_shape CHECK (
  (kind = 'instalment' AND fee_structure_id IS NOT NULL AND instalment_id IS NOT NULL)
  OR (kind = 'late_fee' AND fee_structure_id IS NOT NULL AND instalment_id IS NOT NULL AND reason IS NOT NULL)
  OR (kind = 'fine' AND fee_structure_id IS NULL AND instalment_id IS NULL AND reason IS NOT NULL)
);

-- migration 032's uniqueness (one invoice per student per instalment) was
-- unaware of `kind`, so it would have refused a late fee sharing the same
-- instalment_id as its instalment invoice. Replaced with one index per kind:
-- at most one instalment invoice, and separately at most one late fee,
-- per student per instalment.
DROP INDEX invoices_student_instalment_uq;
CREATE UNIQUE INDEX invoices_student_instalment_uq
  ON invoices (student_id, instalment_id) WHERE kind = 'instalment';
CREATE UNIQUE INDEX invoices_late_fee_once_uq
  ON invoices (student_id, instalment_id) WHERE kind = 'late_fee';
