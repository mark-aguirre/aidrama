#!/bin/bash
set -e

# Usage:
#   REMOTE_USER=koi REMOTE_HOST=192.168.100.50 ./deploy-to-docker.sh
#
# Builds the backend image locally, copies it to a remote Docker host over SSH,
# and runs it there. Unlike the frontend, the backend reads all config from the
# environment, so the container is started with an --env-file. By default that
# file is backend/.env (gitignored); override with ENV_FILE=/path/to/file.

# === Configuration ===
IMAGE_NAME="aidrama-backend"
CONTAINER_NAME="aidrama-backend"
TAR_FILE="aidrama-backend.tar"
HOST_PORT=8012
CONTAINER_PORT=8080
REMOTE_USER="${REMOTE_USER:-user}"
REMOTE_HOST="${REMOTE_HOST:-your-server-ip}"
REMOTE_TMP="/tmp"
ENV_FILE="${ENV_FILE:-.env}"
REMOTE_ENV_FILE="$REMOTE_TMP/aidrama-backend.env"

# === Usage ===
usage() {
  echo "Usage: REMOTE_USER=ubuntu REMOTE_HOST=192.168.1.100 ./deploy-to-docker.sh"
  echo ""
  echo "Environment variables:"
  echo "  REMOTE_USER  - SSH username (default: user)"
  echo "  REMOTE_HOST  - Server IP or hostname (default: your-server-ip)"
  echo "  ENV_FILE     - Local env file passed to the container (default: .env)"
  exit 1
}

if [ "$REMOTE_HOST" = "your-server-ip" ]; then
  echo "⚠️  REMOTE_HOST not set!"
  usage
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "⚠️  Env file '$ENV_FILE' not found!"
  echo "    The backend needs runtime config (DB password, JWT secret, storage)."
  echo "    Copy .env.example to .env and fill it in, or set ENV_FILE."
  exit 1
fi

# === Step 1: Build Docker image ===
echo "==> Building Docker image: $IMAGE_NAME"
docker build -t "$IMAGE_NAME" .

# === Step 2: Save Docker image to tar ===
echo "==> Saving Docker image '$IMAGE_NAME' to $TAR_FILE..."
docker save -o "$TAR_FILE" "$IMAGE_NAME"
echo "    ✓ Saved ($TAR_FILE)"

# === Step 3: Copy tar and env file to remote server via SCP ===
echo "==> Copying $TAR_FILE to $REMOTE_USER@$REMOTE_HOST:$REMOTE_TMP/..."
scp "$TAR_FILE" "$REMOTE_USER@$REMOTE_HOST:$REMOTE_TMP/$TAR_FILE"
echo "    ✓ Copied image"
echo "==> Copying env file '$ENV_FILE' to $REMOTE_USER@$REMOTE_HOST:$REMOTE_ENV_FILE..."
scp "$ENV_FILE" "$REMOTE_USER@$REMOTE_HOST:$REMOTE_ENV_FILE"
echo "    ✓ Copied env file"

# === Step 4: Load image and run container on remote server ===
echo "==> Loading image and starting container on remote server..."
ssh "$REMOTE_USER@$REMOTE_HOST" bash -s <<EOF
  set -e

  echo "    Loading Docker image..."
  docker load -i "$REMOTE_TMP/$TAR_FILE"

  echo "    Stopping existing container (if any)..."
  docker stop "$CONTAINER_NAME" 2>/dev/null || true
  docker rm "$CONTAINER_NAME" 2>/dev/null || true

  echo "    Starting container: $CONTAINER_NAME on port $HOST_PORT"
  # The storage origin is published on this host's LAN address. Host networking
  # lets the backend's signed S3 HEAD requests reach it directly, avoiding the
  # Docker bridge route that caused upload completion to return STORAGE_UNAVAILABLE.
  # With --network host there is no -p mapping, so Spring Boot listens on the
  # published host port itself.
  docker run -d --name "$CONTAINER_NAME" \
    --restart unless-stopped \
    --network host \
    --env-file "$REMOTE_ENV_FILE" \
    -e PORT="$HOST_PORT" \
    "$IMAGE_NAME"

  echo "    Cleaning up transferred files..."
  rm -f "$REMOTE_TMP/$TAR_FILE"
  rm -f "$REMOTE_ENV_FILE"
EOF

# === Step 5: Clean up local tar ===
echo "==> Cleaning up local $TAR_FILE..."
rm -f "$TAR_FILE"

echo ""
echo "==> Done! API is running at http://$REMOTE_HOST:$HOST_PORT"
echo "    Health: http://$REMOTE_HOST:$HOST_PORT/actuator/health"
