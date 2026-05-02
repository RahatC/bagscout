CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text,
	"full_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"preferred_currency" text DEFAULT 'USD' NOT NULL,
	"location_country" text,
	"alert_frequency" text DEFAULT 'realtime' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"channel" text NOT NULL,
	"alert_type" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"quiet_hours" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"normalized_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brands_name_unique" UNIQUE("name"),
	CONSTRAINT "brands_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "bag_models" (
	"id" serial PRIMARY KEY NOT NULL,
	"brand_id" integer NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bag_styles" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"normalized_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bag_styles_name_unique" UNIQUE("name"),
	CONSTRAINT "bag_styles_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "colors" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"normalized_name" text NOT NULL,
	"family" text DEFAULT 'other' NOT NULL,
	"hex" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "colors_name_unique" UNIQUE("name"),
	CONSTRAINT "colors_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "conditions" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"normalized_name" text NOT NULL,
	"rank" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conditions_name_unique" UNIQUE("name"),
	CONSTRAINT "conditions_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "sizes" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"normalized_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sizes_name_unique" UNIQUE("name"),
	CONSTRAINT "sizes_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "bag_preferences" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"nickname" text NOT NULL,
	"exact_model_enabled" boolean DEFAULT false NOT NULL,
	"model_query" text,
	"condition_min_id" integer,
	"allow_close_color_match" boolean DEFAULT true NOT NULL,
	"min_price" numeric(10, 2),
	"max_price" numeric(10, 2),
	"only_exact_criteria" boolean DEFAULT false NOT NULL,
	"allow_close_matches" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"alert_frequency" text DEFAULT 'realtime' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bag_preference_brands" (
	"preference_id" integer NOT NULL,
	"brand_id" integer NOT NULL,
	CONSTRAINT "bag_preference_brands_preference_id_brand_id_pk" PRIMARY KEY("preference_id","brand_id")
);
--> statement-breakpoint
CREATE TABLE "bag_preference_colors" (
	"preference_id" integer NOT NULL,
	"color_id" integer NOT NULL,
	CONSTRAINT "bag_preference_colors_preference_id_color_id_pk" PRIMARY KEY("preference_id","color_id")
);
--> statement-breakpoint
CREATE TABLE "bag_preference_sizes" (
	"preference_id" integer NOT NULL,
	"size_id" integer NOT NULL,
	CONSTRAINT "bag_preference_sizes_preference_id_size_id_pk" PRIMARY KEY("preference_id","size_id")
);
--> statement-breakpoint
CREATE TABLE "bag_preference_styles" (
	"preference_id" integer NOT NULL,
	"style_id" integer NOT NULL,
	CONSTRAINT "bag_preference_styles_preference_id_style_id_pk" PRIMARY KEY("preference_id","style_id")
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"base_url" text NOT NULL,
	"source_type" text DEFAULT 'resale_marketplace' NOT NULL,
	"ingestion_mode" text DEFAULT 'mock' NOT NULL,
	"compliance_status" text DEFAULT 'approved' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_ingest_at" timestamp with time zone,
	"listing_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'unknown' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sources_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "listings" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_id" integer NOT NULL,
	"source_listing_id" text NOT NULL,
	"source_url" text NOT NULL,
	"title" text NOT NULL,
	"brand" text NOT NULL,
	"model" text,
	"style" text,
	"condition" text,
	"color" text,
	"size" text,
	"normalized_brand" text NOT NULL,
	"normalized_model" text,
	"normalized_style" text,
	"normalized_condition" text,
	"normalized_color" text,
	"price" numeric(10, 2) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"original_price" numeric(10, 2),
	"discount_percent" numeric(5, 2),
	"image_url" text,
	"description" text,
	"availability_status" text DEFAULT 'available' NOT NULL,
	"deal_score" numeric(4, 1),
	"market_low" numeric(10, 2),
	"market_median" numeric(10, 2),
	"market_high" numeric(10, 2),
	"market_sample_size" integer,
	"scarcity_tier" text,
	"price_verdict" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"listing_id" integer NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"availability_status" text NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_id" integer NOT NULL,
	"job_type" text DEFAULT 'manual' NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"records_seen" integer DEFAULT 0 NOT NULL,
	"records_created" integer DEFAULT 0 NOT NULL,
	"records_updated" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "match_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"preference_id" integer NOT NULL,
	"listing_id" integer NOT NULL,
	"match_score" numeric(4, 3) NOT NULL,
	"match_type" text DEFAULT 'close' NOT NULL,
	"match_explanation" text DEFAULT '' NOT NULL,
	"alert_eligible" boolean DEFAULT false NOT NULL,
	"match_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"disqualifiers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"preference_id" integer NOT NULL,
	"listing_id" integer NOT NULL,
	"match_result_id" integer,
	"alert_type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"message" text,
	"why_now" text,
	"price_at_alert" numeric(10, 2),
	"condition_rank_at_alert" integer,
	"availability_at_alert" text,
	"sent_at" timestamp with time zone,
	"digest_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_listings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"listing_id" integer NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bag_models" ADD CONSTRAINT "bag_models_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bag_preferences" ADD CONSTRAINT "bag_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bag_preferences" ADD CONSTRAINT "bag_preferences_condition_min_id_conditions_id_fk" FOREIGN KEY ("condition_min_id") REFERENCES "public"."conditions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bag_preference_brands" ADD CONSTRAINT "bag_preference_brands_preference_id_bag_preferences_id_fk" FOREIGN KEY ("preference_id") REFERENCES "public"."bag_preferences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bag_preference_brands" ADD CONSTRAINT "bag_preference_brands_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bag_preference_colors" ADD CONSTRAINT "bag_preference_colors_preference_id_bag_preferences_id_fk" FOREIGN KEY ("preference_id") REFERENCES "public"."bag_preferences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bag_preference_colors" ADD CONSTRAINT "bag_preference_colors_color_id_colors_id_fk" FOREIGN KEY ("color_id") REFERENCES "public"."colors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bag_preference_sizes" ADD CONSTRAINT "bag_preference_sizes_preference_id_bag_preferences_id_fk" FOREIGN KEY ("preference_id") REFERENCES "public"."bag_preferences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bag_preference_sizes" ADD CONSTRAINT "bag_preference_sizes_size_id_sizes_id_fk" FOREIGN KEY ("size_id") REFERENCES "public"."sizes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bag_preference_styles" ADD CONSTRAINT "bag_preference_styles_preference_id_bag_preferences_id_fk" FOREIGN KEY ("preference_id") REFERENCES "public"."bag_preferences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bag_preference_styles" ADD CONSTRAINT "bag_preference_styles_style_id_bag_styles_id_fk" FOREIGN KEY ("style_id") REFERENCES "public"."bag_styles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_snapshots" ADD CONSTRAINT "listing_snapshots_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_logs" ADD CONSTRAINT "ingestion_logs_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_results" ADD CONSTRAINT "match_results_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_results" ADD CONSTRAINT "match_results_preference_id_bag_preferences_id_fk" FOREIGN KEY ("preference_id") REFERENCES "public"."bag_preferences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_results" ADD CONSTRAINT "match_results_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_preference_id_bag_preferences_id_fk" FOREIGN KEY ("preference_id") REFERENCES "public"."bag_preferences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_match_result_id_match_results_id_fk" FOREIGN KEY ("match_result_id") REFERENCES "public"."match_results"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_listings" ADD CONSTRAINT "saved_listings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_listings" ADD CONSTRAINT "saved_listings_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bag_models_brand_name_idx" ON "bag_models" USING btree ("brand_id","normalized_name");--> statement-breakpoint
CREATE UNIQUE INDEX "listings_source_external_idx" ON "listings" USING btree ("source_id","source_listing_id");--> statement-breakpoint
CREATE UNIQUE INDEX "match_results_pref_listing_idx" ON "match_results" USING btree ("preference_id","listing_id");--> statement-breakpoint
CREATE INDEX "alerts_user_listing_type_idx" ON "alerts" USING btree ("user_id","listing_id","alert_type","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "saved_listings_user_listing_idx" ON "saved_listings" USING btree ("user_id","listing_id");