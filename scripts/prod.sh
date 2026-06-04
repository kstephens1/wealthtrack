#!/usr/bin/env bash
set -euo pipefail

env_file="${1:-.env}"
if [[ ! -f "$env_file" ]]; then
  echo "Missing $env_file. Copy .env.example to .env and fill in production values." >&2
  exit 1
fi

set -a
source "$env_file"
set +a

./scripts/deploy-prod.sh
