FROM node:18 AS frontend-build
WORKDIR /app
COPY web/package*.json ./web/
RUN cd web && npm ci
COPY web/ ./web/
RUN cd web && npm run build

FROM python:3.12-slim AS backend
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
WORKDIR /app

COPY backend/pyproject.toml .
COPY backend/app ./app
RUN pip install --no-cache-dir --default-timeout=120 --retries 10 .

COPY --from=frontend-build /app/web/build ./app_web

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
