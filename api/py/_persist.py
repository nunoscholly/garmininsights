# api/py/_persist.py
import os
import json
from datetime import datetime, timezone
import psycopg
from psycopg.types.json import Jsonb

def _jb(x):
    return Jsonb(x) if x is not None else None

def _ms_to_dt(ms):
    """Garmin timestamps are epoch millis; DB columns are timestamptz."""
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc) if ms else None

def _db():
    return psycopg.connect(os.environ["DATABASE_URL"])

# ---------- shapers (pure functions, easy to test) ----------

def shape_daily_wellness(user_id: int, date: str, payload: dict) -> dict:
    return {
        "user_id": user_id,
        "date": date,
        "rhr": payload.get("restingHeartRate"),
        "max_hr": payload.get("maxHeartRate"),
        "body_battery_min": payload.get("bodyBatteryLowestValue"),
        "body_battery_max": payload.get("bodyBatteryHighestValue"),
        "body_battery_wake": payload.get("bodyBatteryAtWakeTime"),
        "body_battery_sleep": payload.get("bodyBatteryDuringSleep"),
        "body_battery_curve": _jb(payload.get("bodyBatteryValuesArray")),
        "stress_avg": payload.get("averageStressLevel"),
        "stress_curve": _jb(payload.get("stressValuesArray")),
        "steps": payload.get("totalSteps"),
        "calories_total": payload.get("totalKilocalories"),
        "calories_active": payload.get("activeKilocalories"),
        "intensity_minutes_mod": payload.get("moderateIntensityMinutes"),
        "intensity_minutes_vig": payload.get("vigorousIntensityMinutes"),
        "floors": payload.get("floorsAscended"),
        "spo2_avg": payload.get("averageSpo2"),
    }

def shape_sleep(user_id: int, date: str, payload: dict) -> dict:
    s = payload.get("dailySleepDTO", payload)
    return {
        "user_id": user_id,
        "date": date,
        "start_ts": _ms_to_dt(s.get("sleepStartTimestampGMT")),
        "end_ts": _ms_to_dt(s.get("sleepEndTimestampGMT")),
        "duration_total_sec": s.get("sleepTimeSeconds") or 0,
        "duration_deep_sec": s.get("deepSleepSeconds"),
        "duration_light_sec": s.get("lightSleepSeconds"),
        "duration_rem_sec": s.get("remSleepSeconds"),
        "duration_awake_sec": s.get("awakeSleepSeconds"),
        "awakenings_count": s.get("awakeCount"),
        "avg_hr": s.get("averageSleepHR"),
        "avg_resp_rate": s.get("averageRespirationValue"),
        "avg_spo2": s.get("averageSpO2Value"),
        "garmin_sleep_score": (s.get("sleepScores") or {}).get("overall", {}).get("value"),
        "raw_summary": _jb(payload),
    }

def shape_training_status(user_id: int, date: str, payload: dict) -> dict:
    # Payload: /metrics-service/metrics/trainingstatus/aggregated/{date}.
    # Per-device data lives under mostRecentTrainingStatus.latestTrainingStatusData,
    # keyed by device id — take the first device (single-watch assumption).
    devices = (payload.get("mostRecentTrainingStatus") or {}).get("latestTrainingStatusData") or {}
    dev = next(iter(devices.values()), {}) if isinstance(devices, dict) else {}
    phrase = dev.get("trainingStatusFeedbackPhrase")  # e.g. "RECOVERY_BALANCED"
    vo2 = (payload.get("mostRecentVO2Max") or {}).get("generic") or {}
    return {
        "user_id": user_id,
        "date": date,
        # "RECOVERY_BALANCED" → "recovery": first token, lowered, to match StatusPill keys
        "status": phrase.split("_")[0].lower() if phrase else None,
        "acute_load": dev.get("weeklyTrainingLoad"),
        "chronic_load": None,  # not present in the aggregated payload
        "vo2_max": vo2.get("vo2MaxValue"),
        "recovery_time_hours": None,  # not present in the aggregated payload
        "race_predictor": None,  # not present in the aggregated payload
    }

def shape_activity(user_id: int, payload: dict) -> dict:
    a = payload
    return {
        "id": str(a["activityId"]),
        "user_id": user_id,
        "start_ts": a.get("startTimeGMT"),
        "type": (a.get("activityType") or {}).get("typeKey", "other"),
        "duration_sec": int(a.get("duration") or 0),
        "distance_m": a.get("distance"),
        "avg_hr": a.get("averageHR"),
        "max_hr": a.get("maxHR"),
        "calories": a.get("calories"),
        "training_effect_aerobic": a.get("aerobicTrainingEffect"),
        "training_effect_anaerobic": a.get("anaerobicTrainingEffect"),
        "training_load": a.get("activityTrainingLoad"),
        "vo2_max_at_time": a.get("vO2MaxValue"),
        "raw_summary": _jb(a),
    }

# ---------- upserters ----------

def persist_daily_wellness(user_id, date, payload):
    row = shape_daily_wellness(user_id, date, payload)
    _upsert("daily_wellness", row, conflict_col="date")

def persist_sleep(user_id, date, payload):
    row = shape_sleep(user_id, date, payload)
    _upsert("sleep_sessions", row, conflict_col="date")

def persist_training_status(user_id, date, payload):
    row = shape_training_status(user_id, date, payload)
    _upsert("training_status", row, conflict_col="date")

def persist_activity(user_id, payload) -> str:
    row = shape_activity(user_id, payload)
    _upsert("activities", row, conflict_col="id")
    return row["id"]

def persist_activity_samples(activity_id: str, samples_payload: dict) -> None:
    _upsert("activity_samples",
            {"activity_id": activity_id, "samples": _jb(samples_payload)},
            conflict_col="activity_id")

def _upsert(table: str, row: dict, conflict_col: str):
    cols = list(row.keys())
    placeholders = ", ".join(["%s"] * len(cols))
    updates = ", ".join(f"{c} = EXCLUDED.{c}" for c in cols if c != conflict_col)
    sql = (
        f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({placeholders}) "
        f"ON CONFLICT ({conflict_col}) DO UPDATE SET {updates};"
    )
    with _db() as conn, conn.cursor() as cur:
        cur.execute(sql, [row[c] for c in cols])
        conn.commit()
