"""Circuit Breaker pattern implementation to handle transient and external failures."""

from __future__ import annotations

import time
import logging
from typing import Callable, Any

logger = logging.getLogger(__name__)


class CircuitBreakerOpenException(Exception):
    """Raised when the circuit breaker is OPEN and rejects calls."""
    pass


class CircuitBreaker:
    def __init__(
        self,
        name: str,
        failure_threshold: int = 3,
        recovery_timeout_seconds: float = 5.0,
    ):
        self.name = name
        self.failure_threshold = failure_threshold
        self.recovery_timeout_seconds = recovery_timeout_seconds

        self.state = "CLOSED"  # CLOSED, OPEN, HALF-OPEN
        self.failure_count = 0
        self.success_count = 0
        self.last_state_change = time.time()

    def __call__(self, func: Callable[..., Any]) -> Callable[..., Any]:
        """Can be used as a decorator or a wrapper."""
        def wrapper(*args, **kwargs):
            return self.call(func, *args, **kwargs)
        return wrapper

    def call(self, func: Callable[..., Any], *args, **kwargs) -> Any:
        self._check_state()

        if self.state == "OPEN":
            logger.warning("Circuit Breaker '%s' is OPEN. Rejecting call.", self.name)
            raise CircuitBreakerOpenException(f"Circuit Breaker '{self.name}' is OPEN.")

        try:
            result = func(*args, **kwargs)
            self._on_success()
            return result
        except Exception as exc:
            self._on_failure(exc)
            raise

    def _check_state(self):
        if self.state == "OPEN":
            now = time.time()
            if now - self.last_state_change >= self.recovery_timeout_seconds:
                logger.info("Circuit Breaker '%s' recovery timeout expired. Transitioning to HALF-OPEN.", self.name)
                self.state = "HALF-OPEN"
                self.last_state_change = now

    def _on_success(self):
        if self.state == "HALF-OPEN":
            self.success_count += 1
            # Require 2 consecutive successes in HALF-OPEN to fully close the circuit
            if self.success_count >= 2:
                logger.info("Circuit Breaker '%s' recovered. Transitioning to CLOSED.", self.name)
                self.state = "CLOSED"
                self.failure_count = 0
                self.success_count = 0
                self.last_state_change = time.time()
        elif self.state == "CLOSED":
            # Reset failure count on success when closed
            self.failure_count = 0

    def _on_failure(self, exc: Exception):
        now = time.time()
        if self.state == "CLOSED":
            self.failure_count += 1
            logger.warning(
                "Circuit Breaker '%s' failure recorded (%d/%d): %s",
                self.name, self.failure_count, self.failure_threshold, exc
            )
            if self.failure_count >= self.failure_threshold:
                logger.error("Circuit Breaker '%s' threshold reached. Transitioning to OPEN.", self.name)
                self.state = "OPEN"
                self.last_state_change = now
        elif self.state == "HALF-OPEN":
            logger.error("Circuit Breaker '%s' failed in HALF-OPEN. Transitioning back to OPEN.", self.name)
            self.state = "OPEN"
            self.success_count = 0
            self.last_state_change = now
