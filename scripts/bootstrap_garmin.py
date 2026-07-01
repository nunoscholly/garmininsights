# scripts/bootstrap_garmin.py
"""
Run locally once (or when a web connect hits an MFA challenge):
  GARMIN_TOKEN_KEY=... DATABASE_URL=... python scripts/bootstrap_garmin.py

Prompts for Garmin email/password (MFA if enabled), then writes encrypted
tokens to garmin_credentials for user_id=1. Creates the user row if absent.
"""
import os
import sys
import getpass

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api", "py"))
import garth
from _token_store import store_tokens

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

    user_id = store_tokens(email, garth.client.oauth1_token, garth.client.oauth2_token)
    print(f"OK: wrote tokens for user_id={user_id}")


if __name__ == "__main__":
    main()
