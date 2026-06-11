"""OpenTelemetry initialization for the Swing Trade Bot backend.

Provides distributed tracing and metrics when OTEL_ENABLED=true.
In development, traces are printed to the console. In production,
traces are exported to any OTLP-compatible backend (Jaeger, Grafana
Cloud, etc.) via OTEL_EXPORTER_OTLP_ENDPOINT.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from fastapi import FastAPI

from app.config import OTEL_ENABLED, OTEL_EXPORTER_ENDPOINT, OTEL_SERVICE_NAME

logger = logging.getLogger(__name__)


def init_telemetry(app: FastAPI) -> None:
    """Instrument the FastAPI application with OpenTelemetry.

    This is a no-op when OTEL_ENABLED is False.
    """
    if not OTEL_ENABLED:
        logger.info("OpenTelemetry disabled (OTEL_ENABLED != true)")
        return

    try:
        from opentelemetry import trace
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor

        resource = Resource.create(
            {
                "service.name": OTEL_SERVICE_NAME,
                "service.version": "0.1.0",
            }
        )

        provider = TracerProvider(resource=resource)

        if OTEL_EXPORTER_ENDPOINT:
            from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

            exporter = OTLPSpanExporter(endpoint=OTEL_EXPORTER_ENDPOINT)
            provider.add_span_processor(BatchSpanProcessor(exporter))
            logger.info("OpenTelemetry: exporting traces to %s", OTEL_EXPORTER_ENDPOINT)
        else:
            from opentelemetry.sdk.trace.export import ConsoleSpanExporter

            provider.add_span_processor(BatchSpanProcessor(ConsoleSpanExporter()))
            logger.info("OpenTelemetry: exporting traces to console (dev mode)")

        trace.set_tracer_provider(provider)

        # Auto-instrument FastAPI
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

        FastAPIInstrumentor.instrument_app(app)

        # Auto-instrument SQLAlchemy
        try:
            from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor

            from app.db import engine

            SQLAlchemyInstrumentor().instrument(engine=engine)
        except Exception as exc:
            logger.warning("OpenTelemetry: SQLAlchemy instrumentation skipped: %s", exc)

        logger.info("OpenTelemetry initialized successfully")

    except ImportError as exc:
        logger.warning(
            "OpenTelemetry packages not installed, skipping instrumentation: %s", exc
        )
    except Exception as exc:
        logger.error("OpenTelemetry initialization failed: %s", exc)


class DummySpan:
    def __enter__(self) -> DummySpan:
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        pass

    def set_attribute(self, key: str, value: any) -> DummySpan:
        return self

    def set_status(self, status, message=None) -> DummySpan:
        return self

    def record_exception(self, exception) -> None:
        pass


class DummyTracer:
    def start_as_current_span(self, name: str, *args, **kwargs) -> DummySpan:
        return DummySpan()


def get_tracer(name: str = __name__):
    """Return a tracer instance for manual span creation.

    Falls back to a DummyTracer if OTEL_ENABLED is False or if dependencies are missing.
    """
    if not OTEL_ENABLED:
        return DummyTracer()
    try:
        from opentelemetry import trace
        return trace.get_tracer(name)
    except ImportError:
        return DummyTracer()
