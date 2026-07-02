# tests/py/test_persist.py
import json
from datetime import datetime, timezone
from pathlib import Path
import pytest
import _persist

FIX = Path(__file__).parent / "fixtures"

def load(name): return json.loads((FIX / name).read_text())

def test_daily_wellness_shape():
    row = _persist.shape_daily_wellness(
        user_id=1, date="2026-06-29",
        payload=load("daily_wellness_2026-06-29.json"),
    )
    assert row["date"] == "2026-06-29"
    assert isinstance(row["rhr"], int)
    assert isinstance(row["steps"], int)
    assert row["body_battery_curve"] is not None

def test_sleep_shape():
    row = _persist.shape_sleep(
        user_id=1, date="2026-06-29",
        payload=load("sleep_2026-06-29.json"),
    )
    assert row["duration_total_sec"] > 0
    assert row["garmin_sleep_score"] is None or 0 <= row["garmin_sleep_score"] <= 100
    # Garmin sends epoch millis; the DB column is timestamptz — the shaper must convert.
    assert isinstance(row["start_ts"], datetime)
    assert isinstance(row["end_ts"], datetime)
    assert row["start_ts"].tzinfo is not None
    assert row["end_ts"] > row["start_ts"]

def test_training_status_shape():
    # Fixture mirrors the real /metrics-service/metrics/trainingstatus/aggregated/{date}
    # response (recorded 2026-07-01, values anonymized-ish).
    row = _persist.shape_training_status(
        user_id=1, date="2026-06-29",
        payload=load("training_status_2026-06-29.json"),
    )
    # RECOVERY_BALANCED → "recovery" (first token, lowered) so StatusPill colors match
    assert row["status"] == "recovery"
    assert row["vo2_max"] == 59.0
    assert row["acute_load"] == 512
    # Garmin load tunnel (optimal 7-day load range) — spec 2026-07-02
    assert row["weekly_training_load"] == 512
    assert row["load_tunnel_min"] == 446
    assert row["load_tunnel_max"] == 988

def test_training_status_shape_empty_payload():
    # Devices can be missing (e.g. no recent sync) — shaper must not crash.
    row = _persist.shape_training_status(user_id=1, date="2026-06-29", payload={})
    assert row["status"] is None
    assert row["vo2_max"] is None
    assert row["weekly_training_load"] is None
    assert row["load_tunnel_min"] is None
    assert row["load_tunnel_max"] is None

def test_activity_shape():
    row = _persist.shape_activity(
        user_id=1,
        payload=load("activity_summary.json"),
    )
    assert row["id"]
    assert row["type"]
    assert row["duration_sec"] > 0
    assert row["avg_hr"] is None or 30 < row["avg_hr"] < 220
