#!/bin/bash
set -euo pipefail

# AI Drama: build the backend + frontend images locally (on your Windows machine
# via Git Bash / WSL), ship them to the Docker host, and run them there with
# docker compose. This is Approach A: build-on-dev, ship images, compose uses
# the prebuilt images (no build toolchain or source needed on the server).
#
# SeaweedFS is NOT managed by compose. It keeps running as its own container;
# this script only attaches it to the shared network `aidrama-net` so the
# backend reaches it at http://seaweedfs:8333.
#
# Usage:
#   REMOTE_USER=koi REMOTE_HOST=192.168.100.50 ./deploy-compose-remote.sh
#
# Environment:
#   REMOTE_USER        SSH user                       (default: user)
#   REMOTE_HOST        server IP/hostname             (default: your-server-ip)
#   DOCKER_NETWORK     shared bridge network          (default: aidrama-net)
#   STORAGE_CONTAINER  existing SeaweedFS container   (default: seaweedfs)
#   REMOTE_DIR         working dir on the server       (default: ~/aidrama-deploy)

IMAGE_TAG="deploy"                       # must match docker-compose.remote.yml
BACKEND_IMAGE="aidrama-backend:$IMAGE_TAG"
FRONTEND_IMAGE="aidrama-frontend:$IMAGE_TAG"
TAR_FILE="aidrama-images.tar"

REMOTE_USER="${REMOTE_USER:-user}"
REMOTE_HOST="${REMOTE_HOST:-your-server-ip}"
DOCKER_NETWORK="${DOCKER_NETWORK:-aidrama-net}"
STORAGE_CONTAINER="${STORAGE_CONTAINER:-seaweedfs}"
REMOTE_DIR="${REMOTE_DIR:-aidrama-deploy}"   # relative to the SSH user's home

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

usage() {
  echo "Usage: REMOTE_USER=koi REMOTE_HOST=192.168.100.50 ./deploy-compose-remote.sh" >&2
  exit 1
}
if [ "$REMOTE_HOST" = "your-server-ip" ]; then
  echo "ERROR: REMOTE_HOST not set." >&2
  usage
fi

REMOTE="$REMOTE_USER@$REMOTE_HOST"

# --- preflight ---
for f in docker-compose.yml docker-compose.remote.yml backend/.env frontend/.env; do
  [ -f "$f" ] || { echo "ERROR: missing $f" >&2; exit 1; }
done

# backend/.env must point the backend at the storage service name on the network.
if ! grep -q '^AIDRAMA_STORAGE_INTERNAL_ENDPOINT=http://'"$STORAGE_CONTAINER"':8333' backend/.env; then
  echo "WARNING: backend/.env does not set AIDRAMA_STORAGE_INTERNAL_ENDPOINT to" >&2
  echo "         http://$STORAGE_CONTAINER:8333 — the backend may not reach storage." >&2
fi

# --- Step 1: build images locally with the tags the remote override expects ---
echo "==> Building $BACKEND_IMAGE ..."
docker build -t "$BACKEND_IMAGE" ./backend

echo "==> Building $FRONTEND_IMAGE ..."
# Frontend build args are baked in (browser bundle + next/image allowlist).
docker build \
  --build-arg NEXT_PUBLIC_API_BASE_URL="" \
  --build-arg MEDIA_IMAGE_HOSTS="${MEDIA_IMAGE_HOSTS:-medaidrama.apps-nest.com}" \
  --build-arg ALLOW_LOCAL_IP_IMAGES="true" \
  -t "$FRONTEND_IMAGE" ./frontend

# --- Step 2: save both images to one tar ---
echo "==> Saving images to $TAR_FILE ..."
docker save -o "$TAR_FILE" "$BACKEND_IMAGE" "$FRONTEND_IMAGE"

# --- Step 3: copy tar, compose files and backend env to the server ---
echo "==> Preparing remote dir ~/$REMOTE_DIR on $REMOTE ..."
ssh "$REMOTE" "mkdir -p ~/$REMOTE_DIR/backend"

echo "==> Copying artifacts to $REMOTE:~/$REMOTE_DIR ..."
scp "$TAR_FILE" "$REMOTE:~/$REMOTE_DIR/$TAR_FILE"
scp docker-compose.yml "$REMOTE:~/$REMOTE_DIR/docker-compose.yml"
scp docker-compose.remote.yml "$REMOTE:~/$REMOTE_DIR/docker-compose.remote.yml"
# The backend reads its runtime config from this file (env_file in compose).
scp backend/.env "$REMOTE:~/$REMOTE_DIR/backend/.env"

# --- Step 4: load + run on the server ---
echo "==> Loading images and starting services on $REMOTE ..."
ssh "$REMOTE" bash -s <<EOF
  set -euo pipefail
  cd ~/$REMOTE_DIR

  echo "    Loading images..."
  docker load -i "$TAR_FILE"

  echo "    Ensuring network '$DOCKER_NETWORK'..."
  docker network create "$DOCKER_NETWORK" >/dev/null 2>&1 && echo "      created" || echo "      exists"

  if docker ps --format '{{.Names}}' | grep -qx "$STORAGE_CONTAINER"; then
    if docker inspect "$STORAGE_CONTAINER" --format '{{json .NetworkSettings.Networks}}' | grep -q '"$DOCKER_NETWORK"'; then
      echo "    '$STORAGE_CONTAINER' already on '$DOCKER_NETWORK'."
    else
      echo "    Connecting '$STORAGE_CONTAINER' to '$DOCKER_NETWORK'..."
      docker network connect "$DOCKER_NETWORK" "$STORAGE_CONTAINER"
    fi
  else
    echo "    WARNING: '$STORAGE_CONTAINER' not running; backend storage calls will fail." >&2
  fi

  echo "    Starting compose (prebuilt images, no build)..."
  docker compose -f docker-compose.yml -f docker-compose.remote.yml up -d

  echo "    Services:"
  docker compose -f docker-compose.yml -f docker-compose.remote.yml ps

  echo "    Backend -> storage reachability:"
  if docker exec aidrama-backend sh -c "wget -q -T 5 -O /dev/null http://$STORAGE_CONTAINER:8333 2>/dev/null"; then
    echo "      OK: reached http://$STORAGE_CONTAINER:8333"
  else
    echo "      WARNING: backend could not reach http://$STORAGE_CONTAINER:8333." >&2
  fi

  echo "    Backend health:"
  for i in \$(seq 1 15); do
    if curl -fsS http://localhost:8012/actuator/health >/dev/null 2>&1; then
      echo "      OK: backend UP"; break
    fi
    [ "\$i" = "15" ] && echo "      WARNING: not UP after ~30s (docker compose logs aidrama-backend)" >&2
    sleep 2
  done

  echo "    Cleaning up transferred tar..."
  rm -f "$TAR_FILE"
EOF

# --- Step 5: local cleanup ---
echo "==> Removing local $TAR_FILE ..."
rm -f "$TAR_FILE"

echo ""
echo "==> Done."
echo "    Frontend: http://$REMOTE_HOST:3013"
echo "    Backend:  http://$REMOTE_HOST:8012/actuator/health"
echo "    Next: upload one video end to end and confirm 'complete' succeeds"
echo "          (backend signed S3 HEAD now goes to http://$STORAGE_CONTAINER:8333)."
