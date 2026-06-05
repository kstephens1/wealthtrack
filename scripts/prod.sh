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

cleanup() {
  if [[ -n "${tmp_gcloud_config:-}" ]]; then
    rm -rf "$tmp_gcloud_config"
  fi
}
trap cleanup EXIT

if [[ -n "${GCE_INSTANCE:-}" && -z "${CLOUDSDK_CONFIG:-}" && -d "$HOME/.config/gcloud" ]]; then
  tmp_gcloud_config="$(mktemp -d)"
  cp -R "$HOME/.config/gcloud/." "$tmp_gcloud_config/"
  export CLOUDSDK_CONFIG="$tmp_gcloud_config"
fi

./scripts/deploy-prod.sh
