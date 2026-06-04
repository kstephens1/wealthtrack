#!/usr/bin/env bash
set -euo pipefail

required=(
  FIREBASE_PROJECT_ID
  BACKEND_URL
  FRONTEND_URL
  VM_SERVICE_NAME
  SEED_USER_EMAIL
  SEED_USER_PASSWORD
  JWT_SECRET
)

for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required environment variable: $name" >&2
    exit 1
  fi
done

VM_APP_DIR="${VM_APP_DIR:-/opt/wealthtrack}"
VM_RUNTIME_USER="${VM_RUNTIME_USER:-wealthtrack}"
VM_DB_PATH="${VM_DB_PATH:-/var/lib/wealthtrack/wealthtrack.db}"
PORT="${PORT:-4001}"
if [[ -n "${GCE_INSTANCE:-}" ]]; then
  : "${GCP_PROJECT_ID:?Missing GCP_PROJECT_ID}"
  : "${GCP_ZONE:?Missing GCP_ZONE}"
  remote() {
    gcloud compute ssh "$GCE_INSTANCE" --zone "$GCP_ZONE" --project "$GCP_PROJECT_ID" --quiet --command "$1"
  }
  copy_to_remote() {
    gcloud compute scp "$1" "$GCE_INSTANCE:$2" --zone "$GCP_ZONE" --project "$GCP_PROJECT_ID" --quiet
  }
  cleanup_ssh_key() { :; }
else
  for name in VM_SSH_KEY VM_SSH_USER VM_HOST; do
    if [[ -z "${!name:-}" ]]; then
      echo "Missing required environment variable: $name" >&2
      exit 1
    fi
  done
  if [[ -f "$VM_SSH_KEY" ]]; then
    ssh_key_path="$VM_SSH_KEY"
  else
    ssh_key_path="$(mktemp)"
    printf '%s\n' "$VM_SSH_KEY" > "$ssh_key_path"
    chmod 600 "$ssh_key_path"
  fi
  SSH_OPTS=(-i "$ssh_key_path" -o StrictHostKeyChecking=accept-new)
  SSH_TARGET="${VM_SSH_USER}@${VM_HOST}"
  remote() {
    ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "$1"
  }
  copy_to_remote() {
    scp "${SSH_OPTS[@]}" "$1" "$SSH_TARGET:$2"
  }
  cleanup_ssh_key() {
    [[ "${ssh_key_path:-}" != "${VM_SSH_KEY:-}" ]] && rm -f "$ssh_key_path"
  }
fi

npm install
npm run test --workspace server
npm run test --workspace client -- --watchAll=false
npm run build --workspace server

tmp_pkg="$(mktemp -d)"
trap 'rm -rf "$tmp_pkg"; cleanup_ssh_key' EXIT
mkdir -p "$tmp_pkg/server" "$tmp_pkg/deploy/systemd"
mkdir -p "$tmp_pkg/deploy"
cp -R server/dist server/package.json server/package-lock.json "$tmp_pkg/server/" 2>/dev/null || cp -R server/dist server/package.json "$tmp_pkg/server/"
cp deploy/systemd/wealthtrack.service "$tmp_pkg/deploy/systemd/wealthtrack.service"
cp deploy/configure-nginx.sh "$tmp_pkg/deploy/configure-nginx.sh"
tar -C "$tmp_pkg" -czf "$tmp_pkg/wealthtrack-server.tgz" server deploy

remote "sudo useradd --system --home $VM_APP_DIR --shell /usr/sbin/nologin $VM_RUNTIME_USER 2>/dev/null || true && sudo mkdir -p $VM_APP_DIR /etc/wealthtrack $(dirname "$VM_DB_PATH") && sudo chown -R $VM_RUNTIME_USER:$VM_RUNTIME_USER $VM_APP_DIR $(dirname "$VM_DB_PATH")"
copy_to_remote "$tmp_pkg/wealthtrack-server.tgz" "/tmp/wealthtrack-server.tgz"
remote "sudo tar -xzf /tmp/wealthtrack-server.tgz -C $VM_APP_DIR --strip-components=0 && cd $VM_APP_DIR/server && sudo npm install --omit=dev && sudo chown -R $VM_RUNTIME_USER:$VM_RUNTIME_USER $VM_APP_DIR"
remote "sudo tee /etc/wealthtrack/backend.env >/dev/null" <<ENV
NODE_ENV=production
PORT=$PORT
DB_PATH=$VM_DB_PATH
FRONTEND_URL=$FRONTEND_URL
SEED_USER_EMAIL=$SEED_USER_EMAIL
SEED_USER_PASSWORD=$SEED_USER_PASSWORD
JWT_SECRET=$JWT_SECRET
ENV
remote "sudo cp $VM_APP_DIR/deploy/systemd/wealthtrack.service /etc/systemd/system/${VM_SERVICE_NAME}.service && sudo systemctl daemon-reload && sudo systemctl enable ${VM_SERVICE_NAME}.service && sudo systemctl restart ${VM_SERVICE_NAME}.service"
if [[ "${CONFIGURE_NGINX:-0}" == "1" ]]; then
  backend_host="${BACKEND_URL#http://}"
  backend_host="${backend_host#https://}"
  backend_host="${backend_host%%/*}"
  backend_host="${backend_host%%:*}"
  remote "cd $VM_APP_DIR && sudo BACKEND_HOSTNAME='$backend_host' PORT='$PORT' bash deploy/configure-nginx.sh"
fi

curl -fsS "$BACKEND_URL/api/hello" | grep -q WealthTrack
REACT_APP_API_BASE_URL="$BACKEND_URL" npm run build --workspace client
npx firebase deploy --only hosting --project "$FIREBASE_PROJECT_ID"
./scripts/smoke-prod.sh
