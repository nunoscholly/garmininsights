CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE "activities" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"start_ts" timestamp with time zone NOT NULL,
	"type" text NOT NULL,
	"duration_sec" integer NOT NULL,
	"distance_m" real,
	"avg_hr" integer,
	"max_hr" integer,
	"calories" integer,
	"training_effect_aerobic" real,
	"training_effect_anaerobic" real,
	"training_load" real,
	"vo2_max_at_time" real,
	"raw_summary" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_samples" (
	"activity_id" text PRIMARY KEY NOT NULL,
	"samples" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_scores" (
	"date" date PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"recovery_pct" integer,
	"strain_score" real,
	"sleep_score" integer,
	"components" jsonb
);
--> statement-breakpoint
CREATE TABLE "daily_wellness" (
	"date" date PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"rhr" integer,
	"max_hr" integer,
	"body_battery_min" integer,
	"body_battery_max" integer,
	"body_battery_wake" integer,
	"body_battery_sleep" integer,
	"body_battery_curve" jsonb,
	"stress_avg" integer,
	"stress_curve" jsonb,
	"steps" integer,
	"calories_total" integer,
	"calories_active" integer,
	"intensity_minutes_mod" integer,
	"intensity_minutes_vig" integer,
	"floors" integer,
	"spo2_avg" integer
);
--> statement-breakpoint
CREATE TABLE "garmin_credentials" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"encrypted_tokens" text NOT NULL,
	"last_refreshed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingest_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"ok" boolean,
	"errors" jsonb,
	"mode" text
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"date" date PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"payload" jsonb,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "sleep_sessions" (
	"date" date PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"start_ts" timestamp with time zone NOT NULL,
	"end_ts" timestamp with time zone NOT NULL,
	"duration_total_sec" integer NOT NULL,
	"duration_deep_sec" integer,
	"duration_light_sec" integer,
	"duration_rem_sec" integer,
	"duration_awake_sec" integer,
	"awakenings_count" integer,
	"avg_hr" integer,
	"avg_resp_rate" real,
	"avg_spo2" integer,
	"garmin_sleep_score" integer,
	"raw_summary" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_status" (
	"date" date PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"status" text,
	"acute_load" real,
	"chronic_load" real,
	"vo2_max" real,
	"recovery_time_hours" integer,
	"race_predictor" jsonb
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"clerk_id" text NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_clerk_id_unique" UNIQUE("clerk_id")
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_samples" ADD CONSTRAINT "activity_samples_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_scores" ADD CONSTRAINT "daily_scores_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_wellness" ADD CONSTRAINT "daily_wellness_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "garmin_credentials" ADD CONSTRAINT "garmin_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sleep_sessions" ADD CONSTRAINT "sleep_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_status" ADD CONSTRAINT "training_status_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;