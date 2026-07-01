# api/py/connect.py
import os
import json
import traceback
from http.server import BaseHTTPRequestHandler

import garth
from _token_store import store_tokens


def authorized(auth_header: str) -> bool:
    secret = os.environ.get("CRON_SECRET", "")
    return bool(secret.strip()) and auth_header == f"Bearer {secret}"


def attempt_connect(email: str, password: str) -> dict:
    result = garth.login(email, password, return_on_mfa=True)
    if isinstance(result, tuple) and result[0] == "needs_mfa":
        return {"status": "mfa_required"}
    oauth1, oauth2 = result
    store_tokens(email, oauth1, oauth2)
    return {"status": "connected"}


class handler(BaseHTTPRequestHandler):
    def _send(self, code, body):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(body).encode())

    def do_POST(self):
        if not authorized(self.headers.get("Authorization", "")):
            self._send(401, {"status": "error", "message": "Access code incorrect"})
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length) or b"{}")
        except (ValueError, json.JSONDecodeError):
            self._send(400, {"status": "error", "message": "Invalid request body"})
            return

        email = (body.get("email") or "").strip()
        password = body.get("password") or ""
        if not email or not password:
            self._send(400, {"status": "error", "message": "Email and password required"})
            return

        try:
            result = attempt_connect(email, password)
            self._send(200, result)
        except garth.exc.GarthHTTPError:
            traceback.print_exc()  # server-side only (Vercel function logs)
            self._send(502, {"status": "error", "message": "Could not reach Garmin — try again"})
        except garth.exc.GarthException:
            self._send(401, {"status": "error", "message": "Garmin rejected those credentials"})
        except Exception:
            traceback.print_exc()  # server-side only
            self._send(502, {"status": "error", "message": "Could not reach Garmin — try again"})
