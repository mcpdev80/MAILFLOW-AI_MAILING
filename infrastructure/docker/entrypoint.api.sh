#!/usr/bin/env sh
# API container entrypoint: apply migrations and start the server.
set -e

echo "[entrypoint] Applying migrations (alembic upgrade head)..."
cd /app/apps/api
uv run alembic upgrade head

echo "[entrypoint] Starting API (uvicorn)..."
exec uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
