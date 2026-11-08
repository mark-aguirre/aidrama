# Deploying AI Drama with Docker Compose

How to deploy the **backend** and **frontend** to the Docker host (192.168.100.50)
using Docker Compose. SeaweedFS (object storage) is **not** managed by Compose —
it keeps running as its own container and is only attached to the shared network.

## How it fits together

All three containers run on one user-defined bridge network, `aidrama-net`, and
reach each other by container name over Docker's DNS:

| From | To | Address | Used for |
|------|----|---------|----------|
| backend | storage | `http://seaweedfs:8333` | signed S3 HEAD / multipart |
| frontend | backend | `http://aidrama-backend:8080/api/v1` | SSR + the `/api/v1` proxy |

Browser-facing URLs are **not** on this network and must stay public origins
(the end user's browser can't resolve a Docker service name):

- `AIDRAMA_STORAGE_PUBLIC_BASE_URL`, `AIDRAMA_STORAGE_ENDPOINT` — public media host
- `NEXT_PUBLIC_API_BASE_URL` — left empty so the browser uses the same-origin `/api/v1` proxy

## The two compose files

- `docker-compose.yml` — the base: both app services, their ports, env, and the
  external `aidrama-net` network. It has `build:` blocks for building on a dev machine.
- `docker-compose.remote.yml` — an override used **on the server**. It pins the
  prebuilt image tags (`aidrama-backend:deploy`, `aidrama-frontend:deploy`) so
  Compose runs the loaded images instead of trying to build from source.

On the server you always apply both, base first:

```bash
docker compose -f docker-compose.yml -f docker-compose.remote.yml up -d
```

---

## Option 1 — Deploy from your Windows machine (recommended)

Build the images locally, ship them to the server, and start Compose there. Run
from **Git Bash or WSL** (the script is bash), from the repo root.

```bash
REMOTE_USER=koi REMOTE_HOST=192.168.100.50 ./deploy-compose-remote.sh
```

The script builds `aidrama-backend:deploy` and `aidrama-frontend:deploy`, saves
them to a tar, copies the tar + both compose files + `backend/.env` to
`~/aidrama-deploy` on the server, then over SSH: loads the images, ensures
`aidrama-net`, attaches the existing `seaweedfs` container, and runs the Compose
command above.

Optional environment overrides:

| Variable | Default | Purpose |
|----------|---------|---------|
| `REMOTE_USER` | `user` | SSH user |
| `REMOTE_HOST` | `your-server-ip` | server IP/hostname (required) |
| `DOCKER_NETWORK` | `aidrama-net` | shared bridge network |
| `STORAGE_CONTAINER` | `seaweedfs` | existing SeaweedFS container |
| `REMOTE_DIR` | `aidrama-deploy` | working dir on the server (under the SSH user's home) |
| `MEDIA_IMAGE_HOSTS` | `medaidrama.apps-nest.com` | public media host baked into the frontend |

Tip: run `ssh-copy-id koi@192.168.100.50` once so SSH stops prompting for a
password at every step.

---

## Option 2 — Run Compose directly on the server

Use this when the images are already loaded on the server (e.g. after Option 1
has shipped them once, or you loaded a tar manually). SSH to the host, then:

```bash
cd ~/aidrama-deploy
docker compose -f docker-compose.yml -f docker-compose.remote.yml up -d
```

This does **not** rebuild — it starts the already-loaded `:deploy` images.

### First-time prerequisites on the server

These are handled by the script, but if you run Compose by hand the first time:

```bash
# 1. The network must exist (Compose treats it as external, so it won't create it).
docker network create aidrama-net

# 2. Attach the existing SeaweedFS container to it.
docker network connect aidrama-net seaweedfs
```

`docker network create` is safe to re-run; it just errors "already exists".

---

## Verify after deploy

```bash
docker compose -f docker-compose.yml -f docker-compose.remote.yml ps
```

Both `aidrama-backend` and `aidrama-frontend` should be running.

```bash
# Backend can resolve storage by name on the network:
docker exec aidrama-backend sh -c "wget -qO- http://seaweedfs:8333 >/dev/null && echo OK || echo FAIL"

# Backend health:
curl http://192.168.100.50:8012/actuator/health      # expect {"status":"UP"}
```

Then the real test: open `http://192.168.100.50:3013`, log in, and **upload one
video end to end**. If `complete` succeeds (no `STORAGE_UNAVAILABLE`), the
network path is working — that step is the backend's signed S3 HEAD to
`http://seaweedfs:8333`.

---

## Common issues

**`network aidrama-net was found but has incorrect label ... (expected: aidrama-net)`**
Compose found a network it didn't create. This is expected — the network is
created outside Compose so SeaweedFS can join it. It's marked `external: true`
in `docker-compose.yml`, so Compose uses it as-is. If you still see this, make
sure you're on the current `docker-compose.yml` (with `external: true`).

**`Conflict. The container name "/aidrama-backend" is already in use`**
A leftover container from the older `deploy-to-docker.sh` flow (host networking)
still exists. Compose won't adopt a container it didn't create. Remove the old
ones once (SeaweedFS is untouched):

```bash
docker rm -f aidrama-backend aidrama-frontend
```

Then re-run the Compose `up` command. After this one-time cleanup, Compose
recreates its own containers automatically on every deploy.

**Don't mix deploy paths.** The old `backend/deploy-to-docker.sh` and
`frontend/deploy-to-docker.sh` name their containers the same and run them on
host networking. Stick to the Compose flow for these two services to avoid
recreating the conflict above.

---

## Managing the running stack

All from `~/aidrama-deploy` on the server (same two `-f` flags each time):

```bash
# Follow logs
docker compose -f docker-compose.yml -f docker-compose.remote.yml logs -f aidrama-backend

# Restart one service (runtime env changes only; no rebuild)
docker compose -f docker-compose.yml -f docker-compose.remote.yml restart aidrama-frontend

# Stop the app services (SeaweedFS is NOT managed here, so it keeps running)
docker compose -f docker-compose.yml -f docker-compose.remote.yml down
```

Note: `NEXT_PUBLIC_API_BASE_URL` and `MEDIA_IMAGE_HOSTS` are **baked into the
frontend image at build time**. Changing them requires a rebuild+reship (Option
1), not just a restart. Runtime values like `API_INTERNAL_BASE_URL` only need a
restart.
