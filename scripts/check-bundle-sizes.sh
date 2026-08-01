#!/usr/bin/env bash
# scripts/check-bundle-sizes.sh
#
# CI gate for Surf phase C3 (sourcemap removal, task 4). Fails the build on:
#   1. sourcemap reintroduction — a tracked vite.config.{ts,js} with an
#      uncommented `sourcemap: true`.
#   2. tracked maps — any *.map file committed under a client's dist/.
#   3. bundle bloat — the committed chat/feed/forum/search dist/assets bundle
#      growing past a fixed gzipped-size budget.
#
# Dependency-free on purpose: reads `git ls-files` + greps tracked configs, no
# `npm install`. That lets it gate every client cheaply, not just the ones
# that can currently build in CI (reef-client has no package-lock.json yet;
# see ci.yml's `clients` job comment). chat/feed/forum/search commit their
# `dist/` directly and ship it via scripts/deploy-web-clients.sh — there is
# no CI build step to hang a post-build check off of, so the committed bytes
# ARE the check.
#
# Usage: bash scripts/check-bundle-sizes.sh   (run from repo root or anywhere;
# it cds to the repo root itself).

set -uo pipefail

cd "$(git rev-parse --show-toplevel)" || exit 1

fail() {
  echo ""
  echo "FAIL: $1"
  echo ""
  exit 1
}

pass() {
  echo "PASS: $1"
}

echo "=== check-bundle-sizes.sh ==="
echo ""

# ---------------------------------------------------------------------------
# Check 1: sourcemap reintroduction
#
# Any tracked vite.config.ts/js anywhere in the repo (every current instance
# lives under a client dir: chat-client/, feed-client/, chips-client/, ...)
# with an uncommented `sourcemap: true`. Strip `//` line comments first so a
# `// sourcemap: true` note doesn't false-positive.
# ---------------------------------------------------------------------------
echo "--- check 1: sourcemap: true in tracked vite configs ---"
offenders=()
while IFS= read -r f; do
  [ -z "$f" ] && continue
  if sed -E 's#//.*##' "$f" | grep -qE 'sourcemap[[:space:]]*:[[:space:]]*true'; then
    offenders+=("$f")
  fi
done < <(git ls-files | grep -E '(^|/)vite\.config\.(ts|js)$')

if [ "${#offenders[@]}" -gt 0 ]; then
  echo "  offending file(s):"
  for f in "${offenders[@]}"; do
    echo "    $f"
    grep -nE 'sourcemap' "$f" | sed 's/^/      /'
  done
  fail "check 1 (sourcemap reintroduction): ${#offenders[@]} tracked vite config(s) have an uncommented sourcemap: true"
fi
pass "check 1 (sourcemap reintroduction) — 0 offending vite configs"
echo ""

# ---------------------------------------------------------------------------
# Check 2: tracked client dist maps
#
# Zero .map files should be tracked under any client's dist/ output — Task 3
# stripped the 13 that were. Scoped to client-ish dirs (name ending in
# "-client", plus mobile-app/desktop-app/surf-app) so this does not fire on
# swimchain-js/swimchain-react/swimchain-frontend, whose dist/*.js.map and
# dist/*.d.ts.map are normal `tsc` library-build output, not a vite client
# bundle sourcemap leak.
# ---------------------------------------------------------------------------
echo "--- check 2: tracked *.map files under client dist/ ---"
maps=$(git ls-files | grep -E '^([a-zA-Z0-9_.-]+-client|mobile-app|desktop-app|surf-app)/(.*/)?dist/.*\.map$' || true)
if [ -n "$maps" ]; then
  echo "  offending file(s):"
  echo "$maps" | sed 's/^/    /'
  count=$(echo "$maps" | grep -c .)
  fail "check 2 (tracked client maps): $count tracked .map file(s) under a client dist/"
fi
pass "check 2 (tracked client maps) — 0 tracked maps"
echo ""

# ---------------------------------------------------------------------------
# Check 3: gzipped size budget
#
# chat/feed/forum/search commit dist/ straight to the tree (no CI build), so
# this is the only bloat gate they get. Budgets are ~25-30% above the
# gzipped size measured 2026-08-01 (wasm.yml:45-71 gzip pattern: `gzip -c … |
# wc -c`). chips-client gets a REAL post-build gate instead — see the
# `clients` job in ci.yml, which builds it fresh every run.
# ---------------------------------------------------------------------------
echo "--- check 3: gzipped size budget (chat/feed/forum/search) ---"
declare -A BUDGET=(
  [chat]=190000    # current 147762 gzipped (+28.6% headroom)
  [feed]=245000    # current 189958 gzipped (+29.0% headroom)
  [forum]=225000   # current 173769 gzipped (+29.5% headroom)
  [search]=100000  # current 76410 gzipped  (+30.9% headroom)
)

for client in chat feed forum search; do
  files=$(git ls-files | grep -E "^${client}-client/dist/assets/index-.*\.js\$" || true)
  if [ -z "$files" ]; then
    echo "  SKIP: no tracked ${client}-client/dist/assets/index-*.js (nothing committed to check)"
    continue
  fi
  budget=${BUDGET[$client]}
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    if [ ! -f "$f" ]; then
      fail "check 3 (size budget): $f is tracked but missing from the working tree"
    fi
    gz=$(gzip -c "$f" | wc -c)
    if [ "$gz" -ge "$budget" ]; then
      fail "check 3 (size budget): $f is ${gz}B gzipped >= ${budget}B budget for ${client}-client"
    fi
    echo "  $f: ${gz}B gzipped (budget ${budget}B)"
  done <<< "$files"
done
pass "check 3 (size budget) — all committed bundles under budget"
echo ""

echo "ALL CHECKS PASSED"
exit 0
