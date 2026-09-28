-- 039_staff_attendance_fence.sql
-- AD-83: coordinates are checked and discarded; only the verification result
-- and reported accuracy are retained for audit and operational diagnostics.

ALTER TABLE staff_attendance
  ADD COLUMN fence_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN accuracy_m int,
  ADD COLUMN source text NOT NULL DEFAULT 'app',
  ADD CONSTRAINT staff_attendance_source_check CHECK (source IN ('app', 'web', 'biometric')),
  ADD CONSTRAINT staff_attendance_accuracy_check CHECK (accuracy_m IS NULL OR accuracy_m >= 0),
  ADD CONSTRAINT staff_attendance_fence_verified_requires_app
  CHECK (source = 'app' OR fence_verified = false);
