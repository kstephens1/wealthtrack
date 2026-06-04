#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-4001}"
SERVER_NAME="${BACKEND_HOSTNAME:-35.211.52.83.nip.io}"

if ! command -v nginx >/dev/null 2>&1; then
  echo "nginx is not installed on the VM" >&2
  exit 1
fi

cert="/etc/letsencrypt/live/${SERVER_NAME}/fullchain.pem"
key="/etc/letsencrypt/live/${SERVER_NAME}/privkey.pem"
if [[ ! -f "$cert" || ! -f "$key" ]]; then
  echo "Missing TLS certificate for ${SERVER_NAME}; expected $cert and $key" >&2
  exit 1
fi

timestamp="$(date +%Y%m%d-%H%M%S)"
if [[ -f /etc/nginx/sites-available/default ]]; then
  sudo cp /etc/nginx/sites-available/default "/etc/nginx/sites-available/default.bak.${timestamp}"
fi
if [[ -f /etc/nginx/sites-enabled/default ]]; then
  sudo rm -f /etc/nginx/sites-enabled/default
fi
sudo rm -f /etc/nginx/conf.d/wealthtrack-api.conf

sudo tee /etc/nginx/sites-available/wealthtrack >/dev/null <<CONF
server {
  listen 80;
  server_name ${SERVER_NAME};
  return 301 https://\\$host\\$request_uri;
}

server {
  listen 443 ssl;
  server_name ${SERVER_NAME};

  ssl_certificate ${cert};
  ssl_certificate_key ${key};

  location /api/ {
    proxy_pass http://127.0.0.1:${PORT};
    proxy_http_version 1.1;
    proxy_set_header Host \\$host;
    proxy_set_header X-Real-IP \\$remote_addr;
    proxy_set_header X-Forwarded-For \\$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \\$scheme;
  }
}
CONF

sudo ln -sf /etc/nginx/sites-available/wealthtrack /etc/nginx/sites-enabled/wealthtrack

if ! sudo nginx -t; then
  sudo rm -f /etc/nginx/sites-enabled/wealthtrack
  echo "nginx configuration failed validation; removed WealthTrack proxy config" >&2
  exit 1
fi

sudo systemctl reload nginx
