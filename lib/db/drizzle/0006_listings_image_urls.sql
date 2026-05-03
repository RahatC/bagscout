-- Add image_urls (multi-image gallery). Existing single image_url is kept
-- as the primary image; image_urls is an array of all available images
-- for the listing (in display order, primary first).
ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "image_urls" text[] NOT NULL DEFAULT ARRAY[]::text[];

-- Backfill: existing rows get a one-element array containing their image_url
-- so the API immediately returns a non-empty gallery.
UPDATE "listings"
SET "image_urls" = ARRAY[image_url]
WHERE image_url IS NOT NULL AND image_url <> '' AND (image_urls IS NULL OR cardinality(image_urls) = 0);
