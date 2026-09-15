-- 029_campus_fence.sql
--
-- SA-A1 (AD-83): a campus's attendance fence. Staff punch in and out only
-- inside it. The centre is the campus's own location, never a person's; the
-- radius is in metres. A campus without a fence cannot be punched at.
--
-- All three or none: half a fence is not a fence.

ALTER TABLE campuses ADD COLUMN fence_latitude  double precision;
ALTER TABLE campuses ADD COLUMN fence_longitude double precision;
ALTER TABLE campuses ADD COLUMN fence_radius_m  int;

ALTER TABLE campuses ADD CONSTRAINT campuses_fence_complete CHECK (
  (fence_latitude IS NULL AND fence_longitude IS NULL AND fence_radius_m IS NULL)
  OR (fence_latitude BETWEEN -90 AND 90
      AND fence_longitude BETWEEN -180 AND 180
      AND fence_radius_m BETWEEN 25 AND 2000)
);
