#!/bin/bash
# Build + VERIFY + deploy the hosted game clients (reef, chess) to the web hosts.
#
# This script exists because of the 2026-07-16 incident: a bare `npm run build`
# (no VITE_ env baked) shipped bundles that dialed http://127.0.0.1:19746 and had
# no space id — visitors got Chrome's local-network permission prompt and
# onboarding hung. Vite bakes import.meta.env at BUILD time; the values live in
# each client's .env.production, and this script refuses to deploy any bundle
# missing them.
#
# Usage: bash scripts/deploy-web-clients.sh [reef] [chess]   (default: both)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
SEED=167.71.241.252
GATEWAY=167.99.116.63
KEY="$HOME/.ssh/swimchain_seed_ed25519"

# client -> "web_root:required_marker1,required_marker2"
declare -A SPEC=(
  [reef]="reef:swimchain.io/rpc,sp1qqqsqr9dfcyugxztn5nrpjd7r82sh9cd62"
  [chess]="chess:swimchain.io/rpc,sp1qqqsqrsm2rq9fhtvwww9cts9n6wq536c23"
)

CLIENTS=("$@")
[ ${#CLIENTS[@]} -eq 0 ] && CLIENTS=(reef chess)

for client in "${CLIENTS[@]}"; do
  dir="$ROOT/${client}-client"
  spec="${SPEC[$client]:?unknown client $client}"
  webroot="${spec%%:*}"
  markers="${spec#*:}"

  [ -f "$dir/.env.production" ] || {
    echo "FATAL: $dir/.env.production missing — production values would not be baked"; exit 1; }

  echo "== building $client =="
  (cd "$dir" && npm run build >/dev/null)

  bundle=$(ls "$dir"/dist/assets/index-*.js | head -1)
  IFS=',' read -ra REQ <<<"$markers"
  for m in "${REQ[@]}"; do
    grep -q "$m" "$bundle" || {
      echo "FATAL: built $client bundle lacks required value '$m' — NOT deploying"; exit 1; }
  done
  echo "   bundle $(basename "$bundle") verified (${REQ[*]})"

  for host in "$SEED" "$GATEWAY"; do
    k=""; [ "$host" != "$SEED" ] && k="-i $KEY"
    tar czf - -C "$dir/dist" . | ssh $k "root@$host" \
      "rm -rf /var/www/$webroot.new && mkdir -p /var/www/$webroot.new && tar xzf - -C /var/www/$webroot.new && rm -rf /var/www/$webroot && mv /var/www/$webroot.new /var/www/$webroot"
    echo "   deployed to $host"
  done

  # Post-deploy: the LIVE asset must carry the same markers. Retry: the fetch
  # immediately after the atomic swap can race nginx's file cache (observed
  # transient empty/404 that passes seconds later).
  live=$(curl -s "https://swimchain.io/$webroot/" | grep -o 'index-[A-Za-z0-9_-]*\.js' | head -1)
  for m in "${REQ[@]}"; do
    ok=false
    for attempt in 1 2 3; do
      if curl -s "https://swimchain.io/$webroot/assets/$live" | grep -q "$m"; then
        ok=true; break
      fi
      sleep 2
    done
    $ok || { echo "FATAL: LIVE $client asset $live lacks '$m' after 3 tries — investigate immediately"; exit 1; }
  done
  echo "   live $live verified"
done
echo "ALL DEPLOYED + VERIFIED"
