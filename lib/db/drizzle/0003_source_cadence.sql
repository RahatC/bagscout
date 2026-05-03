ALTER TABLE "sources" ADD COLUMN IF NOT EXISTS "cadence_minutes" integer NOT NULL DEFAULT 60;
