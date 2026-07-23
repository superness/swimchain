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
# Markers each built bundle MUST contain (RPC endpoint, space id, and the
# pinned game-onboarding sponsor pubkey). The sponsor marker guards against
# ever shipping the old genesis default again (offline sponsor => onboarding
# hangs; the 2026-07-18 "reef spun forever" bug).
GAME_SPONSOR=0530df507ad26a2ee6d0c61ef1e37e4e08abae087c1755467d98e3435ecd2984
declare -A SPEC=(
  [reef]="reef:swimchain.io/rpc,sp1qqzurjh6eeafcdf5qgpqg8mkfwlq3e6cfu,$GAME_SPONSOR"
  [chess]="chess:swimchain.io/rpc,sp1qqzc0w94g6hqlvaqxy735mjss84qrwk88e,$GAME_SPONSOR"
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

  # Post-deploy: verify ON EACH HOST that the served index references a bundle
  # whose file carries the markers. Checking the deployed files over ssh is
  # authoritative; the old HTTPS probe raced nginx and flaked ~50% despite
  # retries while a manual curl seconds later always passed.
  for host in "$SEED" "$GATEWAY"; do
    k=""; [ "$host" != "$SEED" ] && k="-i $KEY"
    live=$(ssh $k "root@$host" "grep -o 'index-[A-Za-z0-9_-]*\\.js' /var/www/$webroot/index.html | head -1")
    for m in "${REQ[@]}"; do
      ssh $k "root@$host" "grep -q '$m' /var/www/$webroot/assets/$live" || {
        echo "FATAL: $host serves $client asset $live WITHOUT '$m' — investigate immediately"; exit 1; }
    done
    echo "   $host verified ($live)"
  done
  # Bonus end-to-end probe (non-fatal: nginx timing can lag a beat).
  curl -s "https://swimchain.io/$webroot/" | grep -o 'index-[A-Za-z0-9_-]*\.js' | head -1 |
    xargs -I{} echo "   https serves: {}"
done
echo "ALL DEPLOYED + VERIFIED"
