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

RUN pip install --no-cache-dir pip==25.1.1 \
    && pip uninstall --yes setuptools wheel

# Install required packages
COPY diplomacy/version.py diplomacy/version.py
COPY pyproject.toml .
COPY requirements-lock.txt .
RUN pip install --no-cache-dir -e . -c requirements-lock.txt

# Copy remaining files
COPY diplomacy/ diplomacy/
COPY README.md .

# Re-install so `pip` stores all metadata properly
RUN pip install --no-cache-dir --no-deps -e .

COPY --from=app-builder /app/build /app/diplomacy/web/build

# Web UI
EXPOSE 80
# Agent API
EXPOSE 8433
# DAIDE server
EXPOSE 8434-8600

CMD ["sh", "-c", "python -m http.server 80 --directory diplomacy/web/build/ & python -m diplomacy.server.run"]

LABEL org.opencontainers.image.source=https://github.com/ALLAN-DIP/diplomacy
