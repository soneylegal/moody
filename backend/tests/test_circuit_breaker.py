"""Tests for the Circuit Breaker pattern implementation."""

import time

import pytest

from app.circuit_breaker import CircuitBreaker, CircuitBreakerOpenException


def _always_fail():
    raise ConnectionError("simulated external failure")


def _always_succeed():
    return "ok"


def test_circuit_breaker_starts_closed():
    cb = CircuitBreaker("test", failure_threshold=3, recovery_timeout_seconds=1.0)
    assert cb.state == "CLOSED"


def test_circuit_breaker_opens_after_threshold():
    cb = CircuitBreaker("test", failure_threshold=3, recovery_timeout_seconds=60.0)

    for _ in range(3):
        with pytest.raises(ConnectionError):
            cb.call(_always_fail)

    assert cb.state == "OPEN"


def test_circuit_breaker_rejects_calls_when_open():
    cb = CircuitBreaker("test", failure_threshold=2, recovery_timeout_seconds=60.0)

    # Trip the breaker
    for _ in range(2):
        with pytest.raises(ConnectionError):
            cb.call(_always_fail)

    assert cb.state == "OPEN"

    with pytest.raises(CircuitBreakerOpenException):
        cb.call(_always_succeed)


def test_circuit_breaker_transitions_to_half_open_after_timeout():
    cb = CircuitBreaker("test", failure_threshold=2, recovery_timeout_seconds=0.1)

    for _ in range(2):
        with pytest.raises(ConnectionError):
            cb.call(_always_fail)

    assert cb.state == "OPEN"

    time.sleep(0.15)

    # The next call attempt should transition to HALF-OPEN and succeed
    result = cb.call(_always_succeed)
    assert result == "ok"
    assert cb.state == "HALF-OPEN"


def test_circuit_breaker_closes_after_consecutive_successes_in_half_open():
    cb = CircuitBreaker("test", failure_threshold=2, recovery_timeout_seconds=0.1)

    for _ in range(2):
        with pytest.raises(ConnectionError):
            cb.call(_always_fail)

    assert cb.state == "OPEN"
    time.sleep(0.15)

    # First success transitions to HALF-OPEN
    cb.call(_always_succeed)
    assert cb.state == "HALF-OPEN"

    # Second success closes the circuit
    cb.call(_always_succeed)
    assert cb.state == "CLOSED"
    assert cb.failure_count == 0


def test_circuit_breaker_reopens_on_failure_in_half_open():
    cb = CircuitBreaker("test", failure_threshold=2, recovery_timeout_seconds=0.1)

    for _ in range(2):
        with pytest.raises(ConnectionError):
            cb.call(_always_fail)

    assert cb.state == "OPEN"
    time.sleep(0.15)

    # Transition to HALF-OPEN with a success
    cb.call(_always_succeed)
    assert cb.state == "HALF-OPEN"

    # Failure in HALF-OPEN goes back to OPEN
    with pytest.raises(ConnectionError):
        cb.call(_always_fail)

    assert cb.state == "OPEN"


def test_circuit_breaker_resets_failure_count_on_success():
    cb = CircuitBreaker("test", failure_threshold=3, recovery_timeout_seconds=60.0)

    # 2 failures (not enough to trip)
    for _ in range(2):
        with pytest.raises(ConnectionError):
            cb.call(_always_fail)

    assert cb.failure_count == 2

    # Success resets failure count
    cb.call(_always_succeed)
    assert cb.failure_count == 0
    assert cb.state == "CLOSED"


def test_circuit_breaker_as_decorator():
    cb = CircuitBreaker("test_dec", failure_threshold=2, recovery_timeout_seconds=60.0)

    @cb
    def fragile_operation():
        raise RuntimeError("boom")

    for _ in range(2):
        with pytest.raises(RuntimeError):
            fragile_operation()

    assert cb.state == "OPEN"

    with pytest.raises(CircuitBreakerOpenException):
        fragile_operation()
