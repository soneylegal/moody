"""Shared pytest fixtures for the Swing Trade Bot test suite."""

import os
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker

# --- Environment setup (must happen BEFORE importing app modules) ---
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-only-for-ci-testing-minimum-length")
os.environ.setdefault("FIELD_ENCRYPTION_KEY", "dGVzdC1lbmNyeXB0aW9uLWtleS1mb3ItY2ktdGVzdA==")
os.environ.setdefault("DATABASE_URL", "sqlite:///")  # overridden below

from app.db import Base, get_db  # noqa: E402
from app import models  # noqa: E402
from app.main import app  # noqa: E402



from sqlalchemy.pool import StaticPool

# Use an in-memory SQLite database with StaticPool to keep the connection alive
# and preserve the schema/data across requests.
SQLALCHEMY_TEST_URL = "sqlite://"

engine = create_engine(
    SQLALCHEMY_TEST_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)

TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(autouse=True)
def setup_database():
    """Create all tables before each test, drop after."""
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def db_session():
    """Provide a transactional database session for tests."""
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def client(db_session):
    """Provide a FastAPI TestClient with database overridden to test session."""

    def _override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture()
def auth_headers(client):
    """Register a test user and return Authorization headers with JWT."""
    email = f"test_{uuid.uuid4().hex[:8]}@test.local"
    password = "testpass123"

    resp = client.post("/auth/register", json={"email": email, "password": password})
    assert resp.status_code == 200, f"Register failed: {resp.text}"

    resp = client.post("/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, f"Login failed: {resp.text}"

    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
