#!/bin/bash
# Simple server for viewing ChainSocial client mockups

PORT=${1:-8080}

echo ""
echo "  🔗 ChainSocial Client Mockups"
echo "  ══════════════════════════════════════════"
echo ""
echo "  Starting server on http://localhost:$PORT"
echo ""
echo "  Available mockups:"
echo "    • Forum Client:  http://localhost:$PORT/forum-client/"
echo "    • Reddit Client: http://localhost:$PORT/reddit-client/"
echo ""
echo "  Press Ctrl+C to stop"
echo ""

cd "$(dirname "$0")"
python3 -m http.server $PORT 2>/dev/null || python -m http.server $PORT
