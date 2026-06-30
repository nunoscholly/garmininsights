# api/py/ingest.py
import os, json, traceback
from datetime import date as Date, datetime, timezone, timedelta
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

import psycopg
from _garth_client import load_client
from _persist import (
    persist_daily_wellness, persist_sleep, persist_training_status,
    persist_activity, persist_activity_samples,
)

USER_ID = 1

def _record_run(mode: str, ok: bool, errors):
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn, conn.cursor() as cur:
        cur.execute(
            "INSERT INTO ingest_runs (started_at, finished_at, ok, errors, mode) "
            "VALUES (%s, %s, %s, %s, %s);",
            (datetime.now(timezone.utc), datetime.now(timezone.utc), ok, json.dumps(errors), mode),
        )
        conn.commit()

def _ingest(mode: str):
    errors = []
    client = load_client(USER_ID)
    today = Date.today()
    targets = [today, today - timedelta(days=1)]  # always re-pull yesterday for late sleep data

    for d in targets:
        ds = d.isoformat()
        for name, path, persist in [
            ("wellness",
             f"/usersummary-service/usersummary/daily/{USER_ID}?calendarDate={ds}",
             persist_daily_wellness),
            ("sleep",
             f"/wellness-service/wellness/dailySleepData/me?date={ds}",
             persist_sleep),
            ("training_status",
             f"/metrics-service/metrics/maxmet/latest/{USER_ID}",
             persist_training_status),
        ]:
            try:
                payload = client.connectapi(path)
                persist(USER_ID, ds, payload)
            except Exception as e:
                errors.append({"date": ds, "endpoint": name, "error": str(e), "trace": traceback.format_exc()})

    try:
        activities = client.connectapi(
            "/activitylist-service/activities/search/activities?start=0&limit=20"
        )
        for a in activities:
            aid = persist_activity(USER_ID, a)
            # samples (HR/pace/etc.)
            try:
                samples = client.connectapi(
                    f"/activity-service/activity/{aid}/details?maxChartSize=2000&maxPolylineSize=4000"
                )
                persist_activity_samples(aid, samples)
            except Exception as e:
                errors.append({"activity_id": aid, "endpoint": "samples", "error": str(e)})
    except Exception as e:
        errors.append({"endpoint": "activities_list", "error": str(e)})

    _record_run(mode, ok=not errors, errors=errors or None)
    return {"ok": not errors, "errors": errors}

class handler(BaseHTTPRequestHandler):
    def _send(self, code, body):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(body).encode())

    def do_GET(self):  # used by cron (GET against /api/ingest/sync proxies here)
        mode = parse_qs(urlparse(self.path).query).get("mode", ["daily"])[0]
        self._send(200, _ingest(mode))

    def do_POST(self):  # used by UI sync button
        self._send(200, _ingest("manual"))
