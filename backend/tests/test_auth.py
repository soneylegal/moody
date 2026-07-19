"""Tests for authentication endpoints: register, login, refresh, me."""

import uuid

import pytest
from starlette.websockets import WebSocketDisconnect


def test_register_and_login(client):
    email = f"user_{uuid.uuid4().hex[:8]}@test.local"
    password = "securepass123"

    # Register
    resp = client.post("/auth/register", json={"email": email, "password": password})
    assert resp.status_code == 200

    # Login
    resp = client.post("/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data


def test_register_duplicate_email(client):
    email = f"dup_{uuid.uuid4().hex[:8]}@test.local"
    password = "securepass123"

    client.post("/auth/register", json={"email": email, "password": password})
    resp = client.post("/auth/register", json={"email": email, "password": password})
    assert resp.status_code in (400, 409, 422)


def test_login_wrong_password(client):
    email = f"wrong_{uuid.uuid4().hex[:8]}@test.local"
    client.post("/auth/register", json={"email": email, "password": "correct"})

    resp = client.post("/auth/login", json={"email": email, "password": "incorrect"})
    assert resp.status_code == 401


def test_me_endpoint(client, auth_headers):
    resp = client.get("/auth/me", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "email" in data


def test_me_without_token(client):
    resp = client.get("/auth/me")
    assert resp.status_code in (401, 403)


def test_refresh_token(client):
    email = f"refresh_{uuid.uuid4().hex[:8]}@test.local"
    password = "securepass123"

    client.post("/auth/register", json={"email": email, "password": password})
    login_resp = client.post("/auth/login", json={"email": email, "password": password})
    tokens = login_resp.json()

    if "refresh_token" in tokens and tokens["refresh_token"]:
        resp = client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
        assert resp.status_code == 200
        assert "access_token" in resp.json()


# ---------------------------------------------------------------------------
# WebSocket authentication tests
# ---------------------------------------------------------------------------

def test_ws_unauthenticated_rejected(client):
    """WebSocket without a valid token query param must be closed with code 4401."""
    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect("/ws/market/BTC") as ws:
            ws.receive_text()
    assert exc_info.value.code == 4401


def test_ws_invalid_token_rejected(client):
    """WebSocket with an expired/garbage token must be closed with code 4401."""
    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect("/ws/market/BTC?token=garbage") as ws:
            ws.receive_text()
    assert exc_info.value.code == 4401


def test_ws_empty_token_rejected(client):
    """WebSocket with an empty token param must be closed with code 4401."""
    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect("/ws/market/BTC?token=") as ws:
            ws.receive_text()
    assert exc_info.value.code == 4401


def test_ws_invalid_origin_rejected(client, auth_headers):
    """WebSocket with origin not in CORS allow-list must be closed with code 1008."""
    token = auth_headers["Authorization"].replace("Bearer ", "")
    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect(
            f"/ws/market/BTC?token={token}",
            headers={"Origin": "http://evil.com"},
        ) as ws:
            ws.receive_text()
    assert exc_info.value.code == 1008


def test_ws_connection_cap_per_ip(client, auth_headers):
    """More than MAX_PER_IP_PER_ASSET (5) connections from the same IP must be rejected."""
    import contextlib

    token = auth_headers["Authorization"].replace("Bearer ", "")
    path = f"/ws/market/BTC?token={token}"
    rejected = None
    with contextlib.ExitStack() as stack:
        try:
            for i in range(6):
                stack.enter_context(client.websocket_connect(path))
        except WebSocketDisconnect as e:
            rejected = e
    assert rejected is not None, "Expected the 6th connection to be rejected"
    assert rejected.code == 1013


# ---------------------------------------------------------------------------
# Rate limiting tests
# ---------------------------------------------------------------------------

def test_login_rate_limited(client):
    """After 5 failed login attempts per minute the 6th must be 429."""
    from app.limiter import limiter
    limiter.enabled = True
    try:
        email = f"ratelimit_{uuid.uuid4().hex[:8]}@test.local"
        client.post("/auth/register", json={"email": email, "password": "pass123"})

        for _ in range(5):
            resp = client.post("/auth/login", json={"email": email, "password": "wrong"})
            assert resp.status_code == 401

        resp = client.post("/auth/login", json={"email": email, "password": "wrong"})
        assert resp.status_code == 429
    finally:
        limiter.enabled = False
