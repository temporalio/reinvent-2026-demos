#!/bin/sh
set -eu
attempt=0
until temporal worker deployment set-current-version \
  --address "$TEMPORAL_ADDRESS" --namespace "$TEMPORAL_NAMESPACE" \
  --deployment-name "$LOCAL_DEPLOYMENT_NAME" --build-id "$LOCAL_BUILD_ID" --yes; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 60 ]; then
    echo 'No Roads local worker did not become available within 60 attempts.' >&2
    exit 1
  fi
  sleep 1
done
