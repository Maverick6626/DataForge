# ─────────────────────────────────────────────────────────────────
# DataForge — Dockerfile
# Multi-stage build using uv for fast, reproducible installs.
#
# Build:
#   docker build -t dataforge .
#
# Run:
#   docker run -p 8000:8000 dataforge
#
# Then open:  http://localhost:8000
# ─────────────────────────────────────────────────────────────────

# ── Stage 1: dependency installer ────────────────────────────────
FROM python:3.11-slim AS builder

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /build

# Copy only what's needed to resolve dependencies first
# (lets Docker cache this layer when source changes but deps don't)
COPY backend/requirements.txt ./requirements.txt
COPY backend/requirements-boosters.txt ./requirements-boosters.txt

# Create a virtual environment and install all deps into it
RUN uv venv /opt/venv --python 3.11

ENV VIRTUAL_ENV=/opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Core packages
RUN uv pip install -r requirements.txt

# Boosting libraries — non-fatal, each installed independently
RUN uv pip install xgboost>=2.0.0  || echo "xgboost skipped"
RUN uv pip install lightgbm>=4.0.0 || echo "lightgbm skipped"
RUN uv pip install catboost>=1.2.0 || echo "catboost skipped"


# ── Stage 2: runtime image ────────────────────────────────────────
FROM python:3.11-slim AS runtime

LABEL maintainer="DataForge"
LABEL description="DataForge AutoML Platform"

# Copy the pre-built venv from builder — no pip/uv needed at runtime
COPY --from=builder /opt/venv /opt/venv

ENV VIRTUAL_ENV=/opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Non-root user for security
RUN useradd -m -u 1000 dataforge
USER dataforge

WORKDIR /app

# Copy backend source
COPY --chown=dataforge:dataforge backend/ ./backend/

# Copy frontend — served as static files by FastAPI
COPY --chown=dataforge:dataforge frontend/ ./frontend/

WORKDIR /app/backend

# Expose API port
EXPOSE 8000

# Healthcheck — polls /health every 30s
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

# Start the API server
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
