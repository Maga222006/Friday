FROM python:3.12-slim-bookworm AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Create non-root user for runtime
RUN addgroup --system app && adduser --system --ingroup app app

# -----------------------------
# Builder stage
# -----------------------------
FROM base AS builder

COPY --from=ghcr.io/astral-sh/uv:0.10.0 /uv /bin/uv

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies first (cached layer)
COPY pyproject.toml ./
COPY uv.loc[k] ./
RUN uv sync --no-dev --no-install-project --compile-bytecode

# Copy source and install project (pyproject declares README.md, so the build needs it)
COPY README.md ./
COPY src/ ./src/
RUN uv sync --no-dev --compile-bytecode

# -----------------------------
# Runtime stage
# -----------------------------
FROM base AS final

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/.venv /app/.venv
COPY aegra.json .
COPY src/ ./src/

# the agent's /workspace/ backend writes here (graph.py: root_dir="./workspace")
RUN mkdir -p /app/workspace && chown app:app /app/workspace

ENV PATH="/app/.venv/bin:$PATH"

# 2026 = Aegra, 8100 = bot's FastAPI. One image runs Aegra, the Telegram bot
# and the voice worker; docker-compose.yml picks the command per service.
EXPOSE 2026 8100

USER app

CMD ["aegra", "serve"]
