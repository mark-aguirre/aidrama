#!/bin/bash
set -euo pipefail

# AI Drama: build + deploy the backend and frontend with docker compose.
#
# Run this ON the Docker host (e.g. 192.168.100.50), from the repo root (the
# folder containing docker-compose.yml). Compose builds the two app images on
# this host and runs them on the shared bridge network `aidrama-net`.
#
# SeaweedFS is NOT managed by compose. It keeps running as its own container;
# this script only connects it to aidrama-net so the backend can reach it at
# http://seaweedfs:8333.
#
# Usage:
#   ./deploy-compose.sh
#
# Overridable via environment:
#   DOCKER_NETWORK     shared bridge network name   (default: aidrama-net)
#   STORAGE_CONTAINER  existing SeaweedFS container  (default: seaweedfs)
#   BACKEND_HEALTH     backend health URL to probe   (default: http://localhost:8012/actuator/health)
#   SKIP_BUILD=1       start without rebuilding images

DOCKER_NETWORK="${DOCKER_NETWORK:-aidrama-net}"
STORAGE_CONTAINER="${STORAGE_CONTAINER:-seaweedfs}"
BACKEND_HEALTH="${BACKEND_HEALTH:-http://localhost:8012/actuator/health}"
SKIP_BUILD="${SKIP_BUILD:-0}"

# Resolve the directory this script lives in, so it works regardless of CWD.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# --- compose command (plugin `docker compose` or legacy `docker-compose`) ---
if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE="docker-compose"
else
  echo "ERROR: neither 'docker compose' nor 'docker-compose' is available." >&2
  exit 1
fi

# --- preflight checks ---
if [ ! -f docker-compose.yml ]; then
  echo "ERROR: docker-compose.yml not found in $SCRIPT_DIR." >&2
  exit 1
fi
for envf in backend/.env frontend/.env; do
  if [ ! -f "$envf" ]; then
    echo "ERROR: $envf not found. The services read their config from it." >&2
    exit 1
  fi
done

echo "==> Validating compose file..."
$COMPOSE config --quiet

# --- Step 1: shared network ---
echo "==> Ensuring network '$DOCKER_NETWORK' exists..."
docker network create "$DOCKER_NETWORK" >/dev/null 2>&1 && echo "    created" || echo "    already exists"

# --- Step 2: attach the existing SeaweedFS container ---
if docker ps --format '{{.Names}}' | grep -qx "$STORAGE_CONTAINER"; then
  if docker inspect "$STORAGE_CONTAINER" \
      --format '{{json .NetworkSettings.Networks}}' | grep -q "\"$DOCKER_NETWORK\""; then
    echo "==> '$STORAGE_CONTAINER' already on '$DOCKER_NETWORK'."
  else
    echo "==> Connecting '$STORAGE_CONTAINER' to '$DOCKER_NETWORK'..."
    docker network connect "$DOCKER_NETWORK" "$STORAGE_CONTAINER"
  fi
else
  echo "WARNING: container '$STORAGE_CONTAINER' is not running. The backend's" >&2
  echo "         storage calls to http://$STORAGE_CONTAINER:8333 will fail until" >&2
  echo "         it is started and attached to '$DOCKER_NETWORK'." >&2
fi

# --- Step 3: build + start the app services ---
if [ "$SKIP_BUILD" = "1" ]; then
  echo "==> Starting services (SKIP_BUILD=1, no rebuild)..."
  $COMPOSE up -d
else
  echo "==> Building and starting services..."
  $COMPOSE up -d --build
fi

# --- Step 4: verify ---
echo "==> Services:"
$COMPOSE ps

echo "==> Checking backend can resolve '$STORAGE_CONTAINER' on the network..."
if docker exec aidrama-backend sh -c "wget -q -T 5 -O /dev/null http://$STORAGE_CONTAINER:8333 2>/dev/null"; then
  echo "    OK: backend reached http://$STORAGE_CONTAINER:8333"
else
  echo "    WARNING: backend could not reach http://$STORAGE_CONTAINER:8333." >&2
  echo "             Confirm '$STORAGE_CONTAINER' is running and on '$DOCKER_NETWORK'." >&2
fi

echo "==> Probing backend health ($BACKEND_HEALTH)..."
for i in $(seq 1 15); do
  if curl -fsS "$BACKEND_HEALTH" >/dev/null 2>&1; then
    echo "    OK: backend is UP"
    break
  fi
  if [ "$i" = "15" ]; then
    echo "    WARNING: backend health not UP after ~30s. Check: $COMPOSE logs aidrama-backend" >&2
  fi
  sleep 2
done

echo ""
echo "==> Done."
echo "    Frontend: http://$(hostname -I 2>/dev/null | awk '{print $1}'):3013"
echo "    Backend:  $BACKEND_HEALTH"
echo "    Next: upload one video end to end and confirm 'complete' succeeds"
echo "          (the backend's signed S3 HEAD now goes to http://$STORAGE_CONTAINER:8333)."
