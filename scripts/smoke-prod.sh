#!/usr/bin/env bash
set -euo pipefail

: "${BACKEND_URL:?Missing BACKEND_URL}"
: "${FRONTEND_URL:?Missing FRONTEND_URL}"

curl -fsS "$BACKEND_URL/api/hello" | grep -q WealthTrack
curl -fsS "$FRONTEND_URL" | grep -qi '<div id="root">'

if [[ -n "${SMOKE_USER_EMAIL:-}" && -n "${SMOKE_USER_PASSWORD:-}" ]]; then
  token="$(
    curl -fsS "$BACKEND_URL/api/auth/login" \
      -H 'content-type: application/json' \
      --data "{\"email\":\"$SMOKE_USER_EMAIL\",\"password\":\"$SMOKE_USER_PASSWORD\"}" |
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
fi

echo "Production smoke checks passed"
