#!/usr/bin/env bash
set -euo pipefail

: "${BACKEND_URL:?Missing BACKEND_URL}"
: "${FRONTEND_URL:?Missing FRONTEND_URL}"

frontend_origin="$(FRONTEND_URL="$FRONTEND_URL" node -e "const url = new URL(process.env.FRONTEND_URL); process.stdout.write(url.origin)")"

curl -fsS "$BACKEND_URL/api/hello" | grep -q WealthTrack
curl -fsS "$FRONTEND_URL" | grep -qi '<div id="root">'
curl -fsS -I "$BACKEND_URL/api/hello" -H "Origin: $frontend_origin" | grep -Fi "access-control-allow-origin: $frontend_origin" >/dev/null

smoke_user_email="${SMOKE_USER_EMAIL:-${SEED_USER_EMAIL:-}}"
smoke_user_password="${SMOKE_USER_PASSWORD:-${SEED_USER_PASSWORD:-}}"

if [[ -n "$smoke_user_email" && -n "$smoke_user_password" ]]; then
  login_payload="$(
    SMOKE_USER_EMAIL="$smoke_user_email" SMOKE_USER_PASSWORD="$smoke_user_password" \
      node -e "process.stdout.write(JSON.stringify({ email: process.env.SMOKE_USER_EMAIL, password: process.env.SMOKE_USER_PASSWORD }))"
  )"
  token="$(
    curl -fsS "$BACKEND_URL/api/auth/login" \
      -H 'content-type: application/json' \
      --data "$login_payload" |
      node -e "const fs=require('fs'); process.stdout.write(JSON.parse(fs.readFileSync(0,'utf8')).token)"
  )"
  curl -fsS "$BACKEND_URL/api/dashboard" -H "authorization: Bearer $token" >/dev/null
  account_id="$(
    curl -fsS "$BACKEND_URL/api/accounts" \
      -H "authorization: Bearer $token" \
      -H 'content-type: application/json' \
      --data '{"name":"Smoke disposable","kind":"asset","category":"Smoke","currency":"GBP","initialValue":1,"valueDate":"2026-06-01","tags":[]}' |
      node -e "const fs=require('fs'); process.stdout.write(String(JSON.parse(fs.readFileSync(0,'utf8')).account.id))"
  )"
  curl -fsS "$BACKEND_URL/api/accounts/$account_id" -X PATCH -H "authorization: Bearer $token" -H 'content-type: application/json' --data '{"name":"Smoke disposable updated","kind":"asset","category":"Smoke","currency":"GBP","updateFrequency":"monthly","tags":[]}' >/dev/null
  curl -fsS "$BACKEND_URL/api/accounts/$account_id/archive" -X POST -H "authorization: Bearer $token" >/dev/null
  node scripts/prod-browser-smoke.mjs
fi

echo "Production smoke checks passed"
