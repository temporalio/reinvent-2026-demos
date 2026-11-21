#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLATFORM_REV=69e7fa0f4faa3a08e25cb8462269ef215efe4544
PLATFORM_DIR="${FIELDKIT_PLATFORM_DIR:-$ROOT/tmp/fieldkit-platform}"
if [[ ! -d "$PLATFORM_DIR/.git" ]]; then
  echo "Clone temporal-sa/temporal-fieldkit-platform to $PLATFORM_DIR (read access required)." >&2
  exit 2
fi
actual="$(git -C "$PLATFORM_DIR" rev-parse HEAD)"
if [[ "$actual" != "$PLATFORM_REV" ]]; then
  echo "Expected Fieldkit $PLATFORM_REV; found $actual. Review the platform change before updating the pin." >&2
  exit 2
fi
cd "$PLATFORM_DIR/operator"
go run ./cmd/validate-projects "$ROOT/deploy/reinvent-2026.yaml"
