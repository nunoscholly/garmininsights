# tests/py/test_persist.py
import json
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

def test_training_status_shape():
    row = _persist.shape_training_status(
        user_id=1, date="2026-06-29",
        payload=load("training_status_2026-06-29.json"),
    )
    assert row["status"] in {"productive", "maintaining", "strained", "peaking", "detraining", "unproductive", "overreaching", "recovery", None}

def test_activity_shape():
    row = _persist.shape_activity(
        user_id=1,
        payload=load("activity_summary.json"),
    )
    assert row["id"]
    assert row["type"]
    assert row["duration_sec"] > 0
    assert row["avg_hr"] is None or 30 < row["avg_hr"] < 220
