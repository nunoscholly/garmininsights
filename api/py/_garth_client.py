# api/py/_garth_client.py
import os
import json
from datetime import datetime, timezone
import psycopg
import garth
from _crypto import encrypt, decrypt

def _db():
    return psycopg.connect(os.environ["DATABASE_URL"])

def load_client(user_id: int) -> garth.Client:
    with _db() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT encrypted_tokens FROM garmin_credentials WHERE user_id = %s;",
            (user_id,),
        )
        row = cur.fetchone()
        if not row:
            raise RuntimeError(f"No garmin_credentials for user_id={user_id}")
        tokens = json.loads(decrypt(row[0]))

    client = garth.Client()
    client.configure(
        oauth1_token=garth.auth_tokens.OAuth1Token(**tokens["oauth1"]),
        oauth2_token=garth.auth_tokens.OAuth2Token(**tokens["oauth2"]),
    )
    if client.oauth2_token.expired:
        client.refresh_oauth2()
        persist_tokens(user_id, client)
    return client

def persist_tokens(user_id: int, client: garth.Client) -> None:
    tokens = {
        "oauth1": client.oauth1_token.__dict__,
        "oauth2": client.oauth2_token.__dict__,
    }
    encrypted = encrypt(json.dumps(tokens, default=str))
    with _db() as conn, conn.cursor() as cur:
        cur.execute(
            """
            UPDATE garmin_credentials
            SET encrypted_tokens = %s, last_refreshed_at = %s
            WHERE user_id = %s;
            """,
            (encrypted, datetime.now(timezone.utc), user_id),
        )
        conn.commit()
