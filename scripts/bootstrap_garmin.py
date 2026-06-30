# scripts/bootstrap_garmin.py
"""
Run locally once:
  GARMIN_TOKEN_KEY=... DATABASE_URL=... python scripts/bootstrap_garmin.py

Prompts for Garmin email/password (MFA if enabled), then writes encrypted
tokens to garmin_credentials for user_id=1. Creates the user row if absent.
"""
import os
import sys
import json
import getpass
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api", "py"))
import garth
import psycopg
from _crypto import encrypt

EMAIL_DEFAULT = "nunoscholly@gmail.com"

def main():
    email = input(f"Garmin email [{EMAIL_DEFAULT}]: ").strip() or EMAIL_DEFAULT
    password = getpass.getpass("Garmin password: ")
    try:
        garth.login(email, password)
    except garth.exc.GarthHTTPError as e:
        if "mfa" in str(e).lower():
            code = input("MFA code: ").strip()
            garth.login(email, password, prompt_mfa=lambda: code)
        else:
            raise

    tokens_dict = {
        "oauth1": garth.client.oauth1_token.__dict__,
        "oauth2": garth.client.oauth2_token.__dict__,
    }
    encrypted = encrypt(json.dumps(tokens_dict, default=str))

    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO users (clerk_id, email) VALUES (%s, %s) "
                "ON CONFLICT (clerk_id) DO NOTHING RETURNING id;",
                ("pending-clerk-link", email),
            )
            row = cur.fetchone()
            if row:
                user_id = row[0]
            else:
                cur.execute("SELECT id FROM users WHERE email = %s;", (email,))
                user_id = cur.fetchone()[0]

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

    print(f"OK: wrote tokens for user_id={user_id}")

if __name__ == "__main__":
    main()
