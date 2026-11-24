#!/bin/sh
set -eu
for item in Step:Keyword AgenticSdlcGitHubRefs:KeywordList OncallPhase:Keyword; do
  name=${item%:*}
  type=${item#*:}
  if output=$(temporal operator search-attribute create --address temporal:7233 --namespace default --name "$name" --type "$type" 2>&1); then
    echo "Created $name"
  else
    case "$output" in
      *already*exist*|*AlreadyExists*) echo "Exists: $name" ;;
      *) echo "$output" >&2; exit 1 ;;
    esac
  fi
done
