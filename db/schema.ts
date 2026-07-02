// db/schema.ts
import {
  pgTable, serial, text, timestamp, integer, real, jsonb, date, boolean, primaryKey,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  clerkId: text("clerk_id").notNull().unique(),
  email: text("email").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const garminCredentials = pgTable("garmin_credentials", {
  userId: integer("user_id").references(() => users.id).primaryKey(),
  encryptedTokens: text("encrypted_tokens").notNull(), // pgcrypto-encrypted garth token JSON
  lastRefreshedAt: timestamp("last_refreshed_at", { withTimezone: true }).notNull(),
});

export const activities = pgTable("activities", {
  id: text("id").primaryKey(), // garmin activity id
  userId: integer("user_id").references(() => users.id).notNull(),
  startTs: timestamp("start_ts", { withTimezone: true }).notNull(),
  type: text("type").notNull(),
  durationSec: integer("duration_sec").notNull(),
  distanceM: real("distance_m"),
  avgHr: integer("avg_hr"),
  maxHr: integer("max_hr"),
  calories: integer("calories"),
  trainingEffectAerobic: real("training_effect_aerobic"),
  trainingEffectAnaerobic: real("training_effect_anaerobic"),
  trainingLoad: real("training_load"),
  vo2MaxAtTime: real("vo2_max_at_time"),
  rawSummary: jsonb("raw_summary").notNull(),
});

export const activitySamples = pgTable("activity_samples", {
  activityId: text("activity_id").references(() => activities.id).primaryKey(),
  samples: jsonb("samples").notNull(), // { ts: number[], hr: number[], pace: number[], ... }
});

export const dailyWellness = pgTable("daily_wellness", {
  date: date("date").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  rhr: integer("rhr"),
  maxHr: integer("max_hr"),
  bodyBatteryMin: integer("body_battery_min"),
  bodyBatteryMax: integer("body_battery_max"),
  bodyBatteryWake: integer("body_battery_wake"),
  bodyBatterySleep: integer("body_battery_sleep"),
  bodyBatteryCurve: jsonb("body_battery_curve"),
  stressAvg: integer("stress_avg"),
  stressCurve: jsonb("stress_curve"),
  steps: integer("steps"),
  caloriesTotal: integer("calories_total"),
  caloriesActive: integer("calories_active"),
  intensityMinutesMod: integer("intensity_minutes_mod"),
  intensityMinutesVig: integer("intensity_minutes_vig"),
  floors: integer("floors"),
  spo2Avg: integer("spo2_avg"),
});

export const sleepSessions = pgTable("sleep_sessions", {
  date: date("date").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  startTs: timestamp("start_ts", { withTimezone: true }).notNull(),
  endTs: timestamp("end_ts", { withTimezone: true }).notNull(),
  durationTotalSec: integer("duration_total_sec").notNull(),
  durationDeepSec: integer("duration_deep_sec"),
  durationLightSec: integer("duration_light_sec"),
  durationRemSec: integer("duration_rem_sec"),
  durationAwakeSec: integer("duration_awake_sec"),
  awakeningsCount: integer("awakenings_count"),
  avgHr: integer("avg_hr"),
  avgRespRate: real("avg_resp_rate"),
  avgSpo2: integer("avg_spo2"),
  garminSleepScore: integer("garmin_sleep_score"),
  rawSummary: jsonb("raw_summary").notNull(),
});

export const trainingStatus = pgTable("training_status", {
  date: date("date").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  status: text("status"), // "productive", "maintaining", "strained", etc.
  acuteLoad: real("acute_load"),
  chronicLoad: real("chronic_load"),
  vo2Max: real("vo2_max"),
  recoveryTimeHours: integer("recovery_time_hours"),
  racePredictor: jsonb("race_predictor"),
  weeklyTrainingLoad: real("weekly_training_load"),
  loadTunnelMin: real("load_tunnel_min"),
  loadTunnelMax: real("load_tunnel_max"),
});

export const ingestRuns = pgTable("ingest_runs", {
  id: serial("id").primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  ok: boolean("ok"),
  errors: jsonb("errors"),
  mode: text("mode"), // "daily" | "manual"
});

// Reserved for v2 (created so migrations don't churn later)
export const dailyScores = pgTable("daily_scores", {
  date: date("date").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  recoveryPct: integer("recovery_pct"),
  strainScore: real("strain_score"),
  sleepScore: integer("sleep_score"),
  components: jsonb("components"),
});

export const journalEntries = pgTable("journal_entries", {
  date: date("date").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  payload: jsonb("payload"),
  notes: text("notes"),
});
