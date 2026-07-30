#!/bin/bash
# Deploy the static website (swimchain.io) to both web hosts, with the same
# git guard the client deploy has.
#
# THIS SCRIPT EXISTS BECAUSE THERE WASN'T ONE. On 2026-07-29 a download page was
# edited, scp'd to both hosts by hand, verified live — and never committed. The
# live site and the repo disagreed for hours, which is the state where somebody
# later "fixes" the page by reverting to the last committed version and quietly
# reships the previous release's APK link. A manual scp cannot be guarded; a
# script can.
#
# Usage: bash scripts/deploy-website.sh [file ...]        (default: all of website/)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
SEED=167.71.241.252
GATEWAY=167.99.116.63
KEY="$HOME/.ssh/swimchain_seed_ed25519"
# The docroot. NOT /var/www/swimchain — that holds the installer binaries nginx
# aliases explicitly, and uploading pages there is a silent no-op that looks
# like success (done, 2026-07-29: the page 200'd from the old copy for another
# ten minutes while it appeared deployed).
DOCROOT=/var/www/swimchain.io

cd "$ROOT"

# WHAT GOES ON THE WEB MUST BE REPRODUCIBLE FROM GIT. Fatal, not a warning.
# `|| true` for the same reason as deploy-web-clients.sh: `set -o pipefail` plus
# a pipeline that legitimately produces nothing is an instant silent exit. This
# one happened to survive (no `grep` in the pipe, and `head` exits 0 on empty
# input) but it is one edit away from the same trap.
dirty=$(git status --porcelain -- website/ | head -20 || true)
if [ -n "$dirty" ]; then
  echo "FATAL: website/ has uncommitted changes — deploying would put pages on the"
  echo "       web that do not exist in git:"
  echo "$dirty" | sed 's/^/         /'
  echo "       commit them first, or ALLOW_DIRTY=1 to override (and then commit)."
  [ "${ALLOW_DIRTY:-}" = "1" ] || exit 1
  echo "       ALLOW_DIRTY=1 set — proceeding. COMMIT THIS."
fi

FILES=("$@")
if [ ${#FILES[@]} -eq 0 ]; then
  mapfile -t FILES < <(cd website && find . -type f -name '*.html' -o -type f -name '*.css' -o -type f -name '*.js' | sed 's|^\./||')
  echo "== deploying all of website/ (${#FILES[@]} files, git $(git rev-parse --short HEAD)) =="
else
  # Accept either `website/x.html` or `x.html`.
  for i in "${!FILES[@]}"; do FILES[$i]="${FILES[$i]#website/}"; done
  echo "== deploying ${#FILES[@]} file(s) from website/ (git $(git rev-parse --short HEAD)) =="
fi

for f in "${FILES[@]}"; do
  [ -f "website/$f" ] || { echo "FATAL: website/$f does not exist"; exit 1; }
done

for host in "$SEED" "$GATEWAY"; do
  k=""; [ "$host" != "$SEED" ] && k="-i $KEY"
  for f in "${FILES[@]}"; do
    scp -q $k -o StrictHostKeyChecking=no "website/$f" "root@$host:$DOCROOT/$f"
  done
  echo "   uploaded ${#FILES[@]} file(s) to $host"
done

# VERIFY WHAT IS SERVED, not what was uploaded. Compares the live bytes against
# the local file — the check that would have caught the wrong-docroot mistake
# immediately instead of ten minutes later.
fails=0
for f in "${FILES[@]}"; do
  want=$(sha256sum "website/$f" | cut -d' ' -f1)
  # The site rewrites extensionless paths to .html; fetch the real file path.
  got=$(curl -sS -m 60 "https://swimchain.io/$f" | sha256sum | cut -d' ' -f1)
  if [ "$want" = "$got" ]; then
    echo "   live: $f matches"
  else
    echo "   MISMATCH: $f — served bytes differ from website/$f"
    fails=$((fails + 1))
  fi
done

if [ "$fails" -gt 0 ]; then
  echo "FATAL: $fails file(s) are not being served as deployed — investigate before"
  echo "       assuming this worked (check the docroot, and nginx caching)."
  exit 1
fi

echo "WEBSITE DEPLOYED + VERIFIED (git $(git rev-parse --short HEAD))"
