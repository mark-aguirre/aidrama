#!/bin/bash
set -e

# Usage:
#   REMOTE_USER=koi REMOTE_HOST=192.168.100.50 ./deploy-to-docker.sh

# === Configuration ===
IMAGE_NAME="aidrama-frontend"
CONTAINER_NAME="aidrama-frontend"
TAR_FILE="aidrama-frontend.tar"
# HOST_PORT is the port the app listens on directly (host networking is used so
# SSR can reach the backend on the LAN; see Step 4). CONTAINER_PORT is unused
# under host networking and kept only for reference.
HOST_PORT=3013
CONTAINER_PORT=3000
REMOTE_USER="${REMOTE_USER:-user}"
REMOTE_HOST="${REMOTE_HOST:-your-server-ip}"
REMOTE_TMP="/tmp"

# Build-time app config, baked into the image during `docker build`.
# Source of truth is the .env file next to this script. NEXT_PUBLIC_API_BASE_URL
# is inlined into the browser bundle, so it must be an address the end user's
# browser can reach. MEDIA_IMAGE_HOSTS whitelists next/image remote hosts.
# A value already set in the environment still wins over the .env file.
ENV_FILE="$(dirname "$0")/.env"
if [ -f "$ENV_FILE" ]; then
  echo "==> Loading build config from $ENV_FILE"
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
else
  echo "⚠️  $ENV_FILE not found; relying on environment / defaults."
fi

# NEXT_PUBLIC_API_BASE_URL is intentionally empty now: the browser calls the
# same-origin /api/v1 proxy. The server reaches the backend via
# API_INTERNAL_BASE_URL (runtime, not baked), so that one is required.
if [ -z "$API_INTERNAL_BASE_URL" ]; then
  echo "⚠️  API_INTERNAL_BASE_URL is not set (checked environment and $ENV_FILE)."
  echo "    Set it to the absolute backend base, e.g. https://api.example.com/api/v1"
  exit 1
fi

# === Usage ===
usage() {
  echo "Usage: REMOTE_USER=ubuntu REMOTE_HOST=192.168.1.100 ./deploy-to-docker.sh"
  echo ""
  echo "Environment variables:"
  echo "  REMOTE_USER               - SSH username (default: user)"
  echo "  REMOTE_HOST               - Server IP or hostname (default: your-server-ip)"
  echo ""
  echo "Config (read from ./.env, overridable from the environment):"
  echo "  API_INTERNAL_BASE_URL     - Absolute backend base the server proxies to (runtime)"
  echo "  NEXT_PUBLIC_API_BASE_URL  - Optional: send the browser straight at an API host (baked)"
  echo "  MEDIA_IMAGE_HOSTS         - Comma-separated next/image media hosts"
  exit 1
}

if [ "$REMOTE_HOST" = "your-server-ip" ]; then
  echo "⚠️  REMOTE_HOST not set!"
  usage
fi

# === Step 1: Build Docker image ===
echo "==> Building Docker image: $IMAGE_NAME"
echo "    NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL:-<same-origin /api/v1>}"
echo "    API_INTERNAL_BASE_URL=$API_INTERNAL_BASE_URL"
echo "    MEDIA_IMAGE_HOSTS=$MEDIA_IMAGE_HOSTS"
# Allow the Next.js image optimizer to fetch from private/LAN IPs. Needed
# because media (SeaweedFS) is served from a 192.168.x.x host rather than a
# public CDN. Override from the environment to turn it off.
ALLOW_LOCAL_IP_IMAGES="${ALLOW_LOCAL_IP_IMAGES:-true}"

docker build \
  --build-arg NEXT_PUBLIC_API_BASE_URL="$NEXT_PUBLIC_API_BASE_URL" \
  --build-arg MEDIA_IMAGE_HOSTS="$MEDIA_IMAGE_HOSTS" \
  --build-arg ALLOW_LOCAL_IP_IMAGES="$ALLOW_LOCAL_IP_IMAGES" \
  -t "$IMAGE_NAME" .

# === Step 2: Save Docker image to tar ===
echo "==> Saving Docker image '$IMAGE_NAME' to $TAR_FILE..."
docker save -o "$TAR_FILE" "$IMAGE_NAME"
echo "    ✓ Saved ($TAR_FILE)"

# === Step 3: Copy tar to remote server via SCP ===
echo "==> Copying $TAR_FILE to $REMOTE_USER@$REMOTE_HOST:$REMOTE_TMP/..."
scp "$TAR_FILE" "$REMOTE_USER@$REMOTE_HOST:$REMOTE_TMP/$TAR_FILE"
echo "    ✓ Copied"

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
  # Host networking: the container shares the host's network stack so the
  # Next.js server (the /api/v1 proxy + SSR) can reach the backend at
  # API_INTERNAL_BASE_URL, including a LAN address. With --network
  # host there is no -p mapping; the app listens directly on the host, so PORT
  # is set to the desired host port instead.
  docker run -d --name "$CONTAINER_NAME" \
    --restart unless-stopped \
    --network host \
    -e PORT="$HOST_PORT" \
    -e HOSTNAME=0.0.0.0 \
    -e API_INTERNAL_BASE_URL="$API_INTERNAL_BASE_URL" \
    -e ALLOW_LOCAL_IP_IMAGES="$ALLOW_LOCAL_IP_IMAGES" \
    "$IMAGE_NAME"

  echo "    Cleaning up tar file..."
  rm -f "$REMOTE_TMP/$TAR_FILE"
EOF

# === Step 5: Clean up local tar ===
echo "==> Cleaning up local $TAR_FILE..."
rm -f "$TAR_FILE"

echo ""
echo "==> Done! App is running at http://$REMOTE_HOST:$HOST_PORT"
