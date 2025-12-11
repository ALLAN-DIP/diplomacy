# syntax=docker/dockerfile:1
# check=error=true

FROM node:22.17.0-alpine3.22 AS app-builder

WORKDIR /app

COPY diplomacy/web/package.json .
COPY diplomacy/web/package-lock.json .

RUN npm install --force

COPY diplomacy/web/ /app
COPY diplomacy/maps/ /maps

RUN npm run build

FROM python:3.11.13-alpine3.22 AS server

RUN apk --no-cache upgrade

WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Compile bytecode to improve startup time
ENV UV_COMPILE_BYTECODE=1

# Copy the dependency management files
COPY pyproject.toml uv.lock ./

# Install dependencies into a virtual environment
# We use --frozen to ensure we install exactly what is in uv.lock
RUN uv sync --frozen --no-install-project --no-dev

# Copy the project source
COPY diplomacy/ diplomacy/
COPY README.md .
COPY diplomacy/version.py diplomacy/version.py

# Install the project itself
RUN uv sync --frozen --no-dev


COPY --from=app-builder /app/build /app/diplomacy/web/build

# Web UI
EXPOSE 80
# Agent API
EXPOSE 8433
# DAIDE server
EXPOSE 8434-8600

# Place .venv/bin at the front of the PATH
ENV PATH="/app/.venv/bin:$PATH"

CMD ["sh", "-c", "python -m http.server 80 --directory diplomacy/web/build/ & python -m diplomacy.server.run"]

LABEL org.opencontainers.image.source=https://github.com/ALLAN-DIP/diplomacy
