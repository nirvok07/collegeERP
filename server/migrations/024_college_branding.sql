-- 024: a college's branding (AD-70).
--
-- What the app shows before anybody signs in: the college's name, logo and
-- colour, looked up by its code. The logo is an https URL for now; uploads
-- arrive with the storage port (Cloudinary) without changing what this column
-- means. A colour is one #RRGGBB value; the app decides whether it is legible
-- enough to use as its accent. Both are optional.

ALTER TABLE institutions
  ADD COLUMN logo_url text
    CONSTRAINT institutions_logo_url_https
    CHECK (logo_url IS NULL OR (logo_url ~ '^https://[^[:space:]]+$' AND length(logo_url) <= 500)),
  ADD COLUMN brand_color text
    CONSTRAINT institutions_brand_color_hex
    CHECK (brand_color IS NULL OR brand_color ~ '^#[0-9A-F]{6}$');
