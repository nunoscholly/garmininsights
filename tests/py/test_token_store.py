# tests/py/test_token_store.py
import json
import os
from types import SimpleNamespace
import pytest
import _token_store
import _crypto


def _fake_tokens():
    oauth1 = SimpleNamespace(
        oauth_token="t1", oauth_token_secret="s1", mfa_token=None,
        mfa_expiration_timestamp=None, domain="garmin.com",
    )
    oauth2 = SimpleNamespace(
        scope="scope", jti="jti", token_type="Bearer", access_token="a1",
        refresh_token="r1", expires_in=3600, expires_at=999,
        refresh_token_expires_in=7200, refresh_token_expires_at=1999,
    )
    return oauth1, oauth2


def test_build_encrypted_tokens_roundtrips_to_expected_shape(monkeypatch):
    monkeypatch.setenv("GARMIN_TOKEN_KEY", "00" * 32)
    oauth1, oauth2 = _fake_tokens()

    blob = _token_store.build_encrypted_tokens(oauth1, oauth2)
    decoded = json.loads(_crypto.decrypt(blob))

    assert decoded["oauth1"]["oauth_token"] == "t1"
    assert decoded["oauth1"]["oauth_token_secret"] == "s1"
    assert decoded["oauth2"]["access_token"] == "a1"
    assert decoded["oauth2"]["refresh_token"] == "r1"
    # keys must match what _garth_client rebuilds with (OAuth1Token/OAuth2Token fields)
    assert set(decoded.keys()) == {"oauth1", "oauth2"}
