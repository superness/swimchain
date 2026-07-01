#!/bin/bash
# Run multiple client dev servers for testing
# Usage: ./scripts/run-clients.sh [client1] [client2] ...
# Example: ./scripts/run-clients.sh forum feed search
# If no args, shows available clients

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Client ports
declare -A PORTS=(
  ["forum"]=5173
  ["chat"]=5175
  ["feed"]=5179
  ["search"]=5180
)

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

show_help() {
  echo -e "${BLUE}Swimchain Client Runner${NC}"
  echo ""
  echo "Usage: $0 [client1] [client2] ..."
  echo ""
  echo "Available clients:"
  for client in "${!PORTS[@]}"; do
    echo -e "  ${GREEN}$client${NC} - http://localhost:${PORTS[$client]}"
  done
  echo ""
  echo "Examples:"
  echo "  $0 forum              # Run just forum-client"
  echo "  $0 forum feed search  # Run multiple clients"
  echo "  $0 all                # Run all clients"
}

install_deps() {
  local client=$1
  local client_dir="$ROOT_DIR/${client}-client"

  if [ ! -d "$client_dir/node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies for ${client}-client...${NC}"
    (cd "$client_dir" && npm install)
  fi
}

run_client() {
  local client=$1
  local port=${PORTS[$client]}
  local client_dir="$ROOT_DIR/${client}-client"

  if [ ! -d "$client_dir" ]; then
    echo -e "${YELLOW}Warning: ${client}-client not found at $client_dir${NC}"
    return 1
  fi

  install_deps "$client"

  echo -e "${GREEN}Starting ${client}-client on http://localhost:${port}${NC}"
  (cd "$client_dir" && npm run dev) &
}

# Show help if no args
if [ $# -eq 0 ]; then
  show_help
  exit 0
fi

# Handle "all" argument
if [ "$1" = "all" ]; then
  set -- forum chat feed search
fi

# Trap to kill all background jobs on exit
trap 'echo "Stopping all clients..."; kill $(jobs -p) 2>/dev/null' EXIT

# Start each requested client
for client in "$@"; do
  if [ -z "${PORTS[$client]}" ]; then
    echo -e "${YELLOW}Unknown client: $client${NC}"
    continue
  fi
  run_client "$client"
  sleep 1  # Stagger starts
done

echo ""
echo -e "${BLUE}All requested clients started. Press Ctrl+C to stop all.${NC}"
echo ""
echo "URLs:"
for client in "$@"; do
  if [ -n "${PORTS[$client]}" ]; then
    echo -e "  ${client}-client: ${GREEN}http://localhost:${PORTS[$client]}${NC}"
  fi
done
echo ""

# Wait for all background jobs
wait
