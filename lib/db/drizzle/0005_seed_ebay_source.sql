-- Seed the eBay source row and flip the gray-area HTML scrapers
-- (therealreal, yoogiscloset) into mock mode by default. Live ingestion of
-- those sources requires a partner / affiliate program; admins can flip them
-- back via the admin UI when that lands.
INSERT INTO "sources" (
  "name", "slug", "base_url", "source_type",
  "ingestion_mode", "compliance_status", "active", "status"
) VALUES (
  'eBay', 'ebay', 'https://www.ebay.com', 'resale_marketplace',
  'live', 'approved', true, 'unknown'
) ON CONFLICT ("slug") DO NOTHING;

-- Shopify storefront JSON is an officially documented public Shopify endpoint;
-- safe to run live for FASHIONPHILE and Rebag.
UPDATE "sources" SET "ingestion_mode" = 'live'
  WHERE "slug" IN ('fashionphile', 'rebag');

-- HTML / sitemap scrapers stay mock until a partner program is wired in.
UPDATE "sources" SET "ingestion_mode" = 'mock'
  WHERE "slug" IN ('therealreal', 'yoogiscloset');
