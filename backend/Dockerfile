# ----------------------------------------------------------------------------
# Stage 1: Frontend build (React SPA via Create React App)
# ----------------------------------------------------------------------------
# node:18-alpine (~150MB) instead of node:18 (~1GB): CRA needs no native
# toolchain. Split COPY of package*.json before source keeps the npm install
# layer cached across source-only changes.
FROM node:18-alpine AS frontend-build
WORKDIR /app
ENV NODE_ENV=production

COPY web/package*.json ./web/
RUN cd web && npm ci

COPY web/ ./web/
RUN cd web && npm run build

# ----------------------------------------------------------------------------
# Stage 2: Backend (FastAPI + Celery + static frontend served by StaticFiles)
# ----------------------------------------------------------------------------
# python:3.12-slim kept (Alpine would force source build of pandas/numpy/ccxt,
# which publish only manylinux wheels). uv replaces pip for 10-100x faster
# installs. Deps are installed BEFORE app/ is copied so that layer cache stays
# valid across source-only changes (the legacy `pip install .` invalidated
# the whole deps layer on every app/ change).
FROM python:3.12-slim AS backend
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy
WORKDIR /app

RUN pip install --no-cache-dir uv

# Install project dependencies from pyproject.toml WITHOUT building the
# local package (avoids requiring app/ here). `uv export` resolves the
# dependency tree from pyproject.toml into a transient requirements.txt.
COPY backend/pyproject.toml ./
RUN uv export --no-dev --no-hashes -o requirements.txt && \
    uv pip install --system -r requirements.txt

# Now copy the application code and install only the local package (--no-deps
# so the heavy deps above are not re-resolved/reinstalled).
COPY backend/app ./app
RUN uv pip install --system --no-deps .

# Bring in the compiled frontend as StaticFiles target.
COPY --from=frontend-build /app/web/build ./app_web

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health', timeout=3)"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
