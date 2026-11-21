#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
network=reinvent-2026-preview
if [[ "${1:-}" == "stop" ]]; then
  for name in ri26-preview-gateway ri26-preview-launchpad; do
    owner="$(docker inspect --format '{{index .Config.Labels "reinvent.owner"}}' "$name" 2>/dev/null || true)"
    if [[ "$owner" == "reinvent-2026-demos" ]]; then docker rm -f "$name"; fi
  done
  exit 0
fi
mkdir -p tmp
docker build -t reinvent-2026-launchpad apps/launchpad > tmp/launchpad-build.log 2>&1
docker build -t reinvent-2026-gateway apps/gateway > tmp/gateway-build.log 2>&1
docker network inspect "$network" >/dev/null 2>&1 || docker network create "$network"
docker run -d --name ri26-preview-launchpad --label reinvent.owner=reinvent-2026-demos --network "$network" --network-alias launchpad reinvent-2026-launchpad
docker run -d --name ri26-preview-gateway --label reinvent.owner=reinvent-2026-demos --network "$network" -p 127.0.0.1:15100:8080 reinvent-2026-gateway
echo 'Launchpad preview: http://127.0.0.1:15100 (demo backends require their containers; no cloud resources are started)'
