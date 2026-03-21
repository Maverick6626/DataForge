# Stage 1: install dependencies
FROM python:3.11-slim AS builder

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /build

# Copy requirements first so Docker caches this layer separately from source code
COPY backend/requirements.txt ./requirements.txt
COPY backend/requirements-boosters.txt ./requirements-boosters.txt

# Create venv and install packages
RUN uv venv /opt/venv --python 3.11

ENV VIRTUAL_ENV=/opt/venv
ENV PATH="/opt/venv/bin:$PATH"

RUN uv pip install -r requirements.txt

# Boosting libraries are optional - build continues even if one fails
RUN uv pip install "xgboost>=2.0.0"  || echo "xgboost skipped"
RUN uv pip install "lightgbm>=4.0.0" || echo "lightgbm skipped"
RUN uv pip install "catboost>=1.2.0" || echo "catboost skipped"


# Stage 2: lean runtime image with no build tools
FROM python:3.11-slim AS runtime

LABEL maintainer="DataForge"
LABEL description="DataForge AutoML Platform"

# Copy only the pre-built venv from stage 1
COPY --from=builder /opt/venv /opt/venv

ENV VIRTUAL_ENV=/opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Run as non-root user
RUN useradd -m -u 1000 dataforge
USER dataforge

WORKDIR /app

COPY --chown=dataforge:dataforge backend/  ./backend/
COPY --chown=dataforge:dataforge frontend/ ./frontend/

WORKDIR /app/backend

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
