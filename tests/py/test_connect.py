# tests/py/test_connect.py
from types import SimpleNamespace
import pytest
import garth
import connect


def _fake_tokens():
    return SimpleNamespace(oauth_token="t1"), SimpleNamespace(access_token="a1")


def test_authorized_matches_bearer(monkeypatch):
    monkeypatch.setenv("CRON_SECRET", "secret123secret123secret123secret1")
    assert connect.authorized("Bearer secret123secret123secret123secret1") is True
    assert connect.authorized("Bearer wrong") is False
    assert connect.authorized("") is False


def test_authorized_false_when_secret_empty(monkeypatch):
    monkeypatch.setenv("CRON_SECRET", "")
    assert connect.authorized("Bearer ") is False


def test_attempt_connect_stores_tokens_on_success(monkeypatch):
    o1, o2 = _fake_tokens()
    monkeypatch.setattr(connect.garth, "login", lambda e, p, return_on_mfa: (o1, o2))
    called = {}
    monkeypatch.setattr(
        connect, "store_tokens",
        lambda email, a, b: called.update(email=email, a=a, b=b) or 1,
    )

    result = connect.attempt_connect("me@example.com", "pw")

    assert result == {"status": "connected"}
    assert called["email"] == "me@example.com"
    assert called["a"] is o1 and called["b"] is o2


def test_attempt_connect_returns_mfa_required_and_stores_nothing(monkeypatch):
    monkeypatch.setattr(
        connect.garth, "login",
        lambda e, p, return_on_mfa: ("needs_mfa", {"client": object()}),
    )
    stored = {"called": False}
    monkeypatch.setattr(
        connect, "store_tokens",
        lambda *a, **k: stored.update(called=True),
    )

    result = connect.attempt_connect("me@example.com", "pw")

    assert result == {"status": "mfa_required"}
    assert stored["called"] is False


def test_attempt_connect_propagates_garth_auth_error(monkeypatch):
    def boom(e, p, return_on_mfa):
        raise garth.exc.GarthException("bad creds")
    monkeypatch.setattr(connect.garth, "login", boom)
    with pytest.raises(garth.exc.GarthException):
        connect.attempt_connect("me@example.com", "pw")
