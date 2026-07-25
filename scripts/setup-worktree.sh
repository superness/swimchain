#!/usr/bin/env bash
#
# Bootstrap a freshly-created git worktree so the JS clients can actually build.
#
# WHY THIS EXISTS
# ---------------
# `git worktree add` copies tracked files only. Everything gitignored starts
# empty — including every `node_modules/` and the per-checkout `.claude/`.
#
# That matters more than it looks, because eleven client packages depend on the
# shared libraries through npm `file:` links:
#
#     analytics-client  archiver-client  bridge-client  chat-client
#     chess-client      feed-client      reef-client    search-client
#     wiki-client       trench-client/ui  swimchain-react
#
# A `file:` dependency is a SYMLINK, not a copy. npm installs the *dependent's*
# declared packages into the dependent's `node_modules`, but the linked package
# resolves its own imports from ITS OWN directory. So if `swimchain-react/` has
# no `node_modules`, every client that imports it fails to resolve
# `@noble/curves`, `@noble/hashes`, `@noble/ciphers` — the Ed25519 signing path.
#
# The failure is late and confusing: `tsc -b` passes (types resolve through the
# symlink just fine) and only the bundler errors, at which point the message
# points at a transitive package nobody in the worktree declared.
#
# Run this once after creating a worktree.
#
# Usage:
#   scripts/setup-worktree.sh                  # shared libs + .claude
#   scripts/setup-worktree.sh reef-client      # ...plus that client
#   scripts/setup-worktree.sh --all-clients    # ...plus every client that links them
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Dependency order matters: @swimchain/react links @swimchain/core, so core must
# have its own deps present before react is installed against it.
SHARED_LIBS=(swimchain-js swimchain-react swimchain-frontend)

# Every package that links a shared lib via `file:`.
LINKED_CLIENTS=(
  analytics-client archiver-client bridge-client chat-client chess-client
  feed-client reef-client search-client wiki-client trench-client/ui
)

info() { printf '\033[36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[33mwarn:\033[0m %s\n' "$*" >&2; }

install_in() {
  local dir="$1"
  if [ ! -f "$dir/package.json" ]; then
    warn "$dir has no package.json — skipping"
    return 0
  fi
  if [ -d "$dir/node_modules" ]; then
    info "$dir already has node_modules — skipping"
    return 0
  fi
  info "npm install in $dir"
  ( cd "$dir" && npm install --no-fund --no-audit )
}

# ---- 1. Shared libraries (the part that is easy to forget and breaks builds) --
for lib in "${SHARED_LIBS[@]}"; do
  install_in "$lib"
done

# ---- 2. Optional clients ----------------------------------------------------
case "${1:-}" in
  '')            ;;
  --all-clients) for c in "${LINKED_CLIENTS[@]}"; do install_in "$c"; done ;;
  *)             install_in "$1" ;;
esac

PRIMARY="$(git worktree list --porcelain 2>/dev/null | awk '/^worktree /{print $2; exit}')"

# ---- 3. The WASM bindings ---------------------------------------------------
# These NEVER travel to a worktree, and it is not obvious why:
#   * swimchain-wasm/pkg/ is ignored by .gitignore:69
#   * swimchain-js/pkg/ is ignored by its OWN generated swimchain-js/pkg/.gitignore,
#     which contains a single `*` (wasm-pack writes this). It is invisible in the
#     root .gitignore, so the directory looks tracked and is not.
#
# `@swimchain/core`'s loader does a dynamic import of '../pkg/swimchain_wasm.js'
# from swimchain-js/dist/ — i.e. it needs **swimchain-js/pkg/**, not
# swimchain-wasm/pkg/. Without it every client build dies with "Could not
# resolve ../pkg/swimchain_wasm.js" AFTER a clean typecheck, because tsc never
# follows the dynamic import. npm install alone does not fix this.
#
# Prefer copying the primary checkout's artifact (exact, no toolchain needed);
# otherwise build. Target MUST be `web` — the generated file ends in
# `export default __wbg_init`, which is the web target's shape.
provision_pkg() {
  local dest="$1"
  [ -f "$dest/swimchain_wasm.js" ] && { info "$dest already present — skipping"; return 0; }
  if [ -n "${PRIMARY:-}" ] && [ "$PRIMARY" != "$REPO_ROOT" ] && [ -f "$PRIMARY/$dest/swimchain_wasm.js" ]; then
    info "copying $dest from the primary checkout"
    mkdir -p "$dest"
    cp -r "$PRIMARY/$dest/." "$dest/"
    return 0
  fi
  return 1
}

if ! provision_pkg swimchain-js/pkg; then
  if command -v wasm-pack >/dev/null 2>&1; then
    info "building WASM with wasm-pack (--target web) into swimchain-js/pkg"
    ( cd swimchain-wasm && wasm-pack build --target web --out-dir ../swimchain-js/pkg )
  else
    warn "swimchain-js/pkg is missing and wasm-pack is not installed."
    warn "Every client build will fail to resolve ../pkg/swimchain_wasm.js."
    warn "Fix with:  cd swimchain-wasm && wasm-pack build --target web --out-dir ../swimchain-js/pkg"
  fi
fi

# The primary checkout keeps a copy here too; mirror it so the two agree.
provision_pkg swimchain-wasm/pkg || true

# ---- 4. Per-checkout .claude ------------------------------------------------
# .claude/ is gitignored (.gitignore:34), so hooks and settings do not travel
# with a worktree. Test for the FILES, not the directory: tooling may create
# .claude/skills on its own, which would make a directory-existence check skip
# the copy and silently leave hooks uninstalled.
if [ -n "${PRIMARY:-}" ] && [ "$PRIMARY" != "$REPO_ROOT" ]; then
  for item in hooks settings.json settings.local.json; do
    if [ ! -e ".claude/$item" ] && [ -e "$PRIMARY/.claude/$item" ]; then
      info "copying .claude/$item from the primary checkout"
      mkdir -p .claude
      cp -r "$PRIMARY/.claude/$item" .claude/
    fi
  done
fi

info "done"
echo
echo "Verify with a real build, not just a typecheck — tsc alone will not catch"
echo "a missing transitive dependency:"
echo
echo "    cd reef-client && npm install && npm run build"
