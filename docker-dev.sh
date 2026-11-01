#!/usr/bin/env bash
#
# docker-dev.sh — run this game's dev server (or build/tests) inside Docker (Node 20).
#
# No image rebuild is needed when you change code: the repo is bind-mounted
# into the container, so edits are live. Only dependencies need syncing when
# package.json / package-lock.json change, which this script handles.
#
# Usage:
#   ./docker-dev.sh           # sync deps if needed, (re)start dev server on :5173
#   ./docker-dev.sh build     # production build check (outputs to dist/)
#   ./docker-dev.sh test      # run unit tests (vitest)
#   ./docker-dev.sh stop      # stop AND REMOVE the dev server container (frees the port)
#   ./docker-dev.sh logs      # follow the dev server logs
#
set -euo pipefail

IMAGE="node:20"
CONTAINER="arcade-plane-dev"
PORT="5173"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

need_pull() {
  ! docker image inspect "$IMAGE" >/dev/null 2>&1
}

sync_deps() {
  # Re-install when node_modules is missing or older than the lockfile.
  if [ ! -d "$ROOT/node_modules" ] || [ "$ROOT/package-lock.json" -nt "$ROOT/node_modules" ]; then
    echo "==> Syncing dependencies (npm ci)…"
    docker run --rm -v "$ROOT:/app" -w /app "$IMAGE" npm ci
  else
    echo "==> Dependencies up to date, skipping npm ci."
  fi
}

wait_ready() {
  echo "==> Waiting for http://localhost:$PORT/ …"
  for _ in $(seq 1 30); do
    if curl -s -o /dev/null "http://localhost:$PORT/"; then
      echo "==> Dev server is up: http://localhost:$PORT/"
      return 0
    fi
    sleep 1
  done
  echo "Server did not respond in 30s. Check logs: ./docker-dev.sh logs" >&2
  return 1
}

cmd_start() {
  if need_pull; then
    echo "==> Pulling $IMAGE…"
    docker pull "$IMAGE"
  fi
  sync_deps
  echo "==> (Re)starting dev server…"
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  docker run -d --name "$CONTAINER" \
    -v "$ROOT:/app" -w /app \
    -p "$PORT:5173" \
    "$IMAGE" npm run dev -- --host 0.0.0.0 >/dev/null
  wait_ready
}

cmd_build() {
  if need_pull; then docker pull "$IMAGE"; fi
  sync_deps
  docker run --rm -v "$ROOT:/app" -w /app "$IMAGE" npm run build
}

cmd_test() {
  if need_pull; then docker pull "$IMAGE"; fi
  sync_deps
  docker run --rm -v "$ROOT:/app" -w /app "$IMAGE" npm test
}

cmd_stop() {
  # rm -f both stops AND removes the container, freeing the port and name.
  if docker rm -f "$CONTAINER" >/dev/null 2>&1; then
    echo "Stopped and removed $CONTAINER."
  else
    echo "No $CONTAINER container running."
  fi
}

case "${1:-}" in
  build) cmd_build ;;
  test) cmd_test ;;
  stop) cmd_stop ;;
  logs) docker logs -f "$CONTAINER" ;;
  "" | start) cmd_start ;;
  *) echo "Usage: $0 [start|build|test|stop|logs]" >&2; exit 1 ;;
esac
