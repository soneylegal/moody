"""Middleware for injecting faults (errors, latency) in development and testing.

Allows testing resilience features like circuit breakers, retries, and timeouts.
"""

from __future__ import annotations

import asyncio
import random
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.config import (
    FAULT_INJECTION_ENABLED,
    FAULT_INJECTION_MODE,
    FAULT_INJECTION_ERROR_RATE,
)


class FaultInjectionMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if not FAULT_INJECTION_ENABLED:
            return await call_next(request)

        # Skip fault injection for health check to keep diagnostics clean
        if request.url.path == "/health":
            return await call_next(request)

        # Determine if we should inject a fault based on error rate
        if random.random() < FAULT_INJECTION_ERROR_RATE:
            mode = FAULT_INJECTION_MODE.lower()

            if mode == "random":
                mode = random.choice(["latency", "error_rate", "db_timeout", "exchange_down"])

            if mode == "latency":
                # Inject a random delay between 1 and 5 seconds
                delay = random.uniform(1.0, 5.0)
                await asyncio.sleep(delay)

            elif mode == "error_rate":
                return JSONResponse(
                    status_code=500,
                    content={"detail": "Chaos: Fault Injection triggered HTTP 500"},
                )

            elif mode == "db_timeout":
                return JSONResponse(
                    status_code=504,
                    content={"detail": "Chaos: Database connection timeout simulated"},
                )

            elif mode == "exchange_down":
                return JSONResponse(
                    status_code=502,
                    content={"detail": "Chaos: External Exchange API is unreachable"},
                )

        return await call_next(request)
