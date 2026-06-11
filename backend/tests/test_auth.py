"""Tests for authentication endpoints: register, login, refresh, me."""

import uuid


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
