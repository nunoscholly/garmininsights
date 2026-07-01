"""Shared encrypted-token write path for bootstrap and the /connect endpoint."""
# api/py/_token_store.py
import os
import json
from datetime import datetime, timezone
import psycopg
from _crypto import encrypt


def build_encrypted_tokens(oauth1, oauth2) -> str:
    payload = {"oauth1": oauth1.__dict__, "oauth2": oauth2.__dict__}
    return encrypt(json.dumps(payload, default=str))


def store_tokens(email: str, oauth1, oauth2) -> int:
    encrypted = build_encrypted_tokens(oauth1, oauth2)
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn, conn.cursor() as cur:
        cur.execute(
            "INSERT INTO users (clerk_id, email) VALUES (%s, %s) "
            "ON CONFLICT (clerk_id) DO NOTHING RETURNING id;",
            ("pending-clerk-link", email),
        )
        row = cur.fetchone()
        if row:
            user_id = row[0]
        else:
            cur.execute("SELECT id FROM users WHERE clerk_id = %s;", ("pending-clerk-link",))
            row = cur.fetchone()
            if row is None:
                raise RuntimeError("users row missing after upsert")
            user_id = row[0]

        cur.execute(
            """
            INSERT INTO garmin_credentials (user_id, encrypted_tokens, last_refreshed_at)
            VALUES (%s, %s, %s)
            ON CONFLICT (user_id) DO UPDATE SET
              encrypted_tokens = EXCLUDED.encrypted_tokens,
              last_refreshed_at = EXCLUDED.last_refreshed_at;
            """,
            (user_id, encrypted, datetime.now(timezone.utc)),
        )
        conn.commit()
    return user_id
