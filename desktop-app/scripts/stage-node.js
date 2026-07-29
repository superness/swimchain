/**
 * Stage the node binary into `src-tauri/binaries/` so the bundle can carry it.
 *
 * THE DESKTOP APP CANNOT RUN WITHOUT THIS. `main.rs` resolves the node at
 * `resource_dir()/binaries/sw.exe` and spawns it; with no binary there, an
 * installed app has no node at all.
 *
 * `binaries/` is gitignored (.gitignore:94) because a 23 MB executable does not
 * belong in git. That is exactly what broke it: with the directory empty in a
 * clean checkout, a `resources` entry of `binaries/*` matches nothing and Tauri
 * fails the build — so #46 removed the entry rather than the cause, and every
 * installer since has bundled no node. The resource entry is back; this script
 * is what makes it resolve.
 *
 * Run before `tauri build` (see package.json `tauri:build`).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const isWindows = process.platform === 'win32';
const BIN = isWindows ? 'sw.exe' : 'sw';

const src = path.join(ROOT, 'target', 'release', BIN);
const destDir = path.join(__dirname, '..', 'src-tauri', 'binaries');
const dest = path.join(destDir, BIN);

if (!fs.existsSync(src)) {
  console.error(
    `\n[stage-node] REFUSING TO BUILD: no node binary at ${src}.` +
    `\n  The desktop app spawns resource_dir()/binaries/${BIN}; without it the` +
    `\n  installed app has no node and cannot start.` +
    `\n  Build it first:  cargo build --release --bin sw\n`
  );
  process.exit(1);
}

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);

const { size, mtime } = fs.statSync(dest);
console.log(
  `[stage-node] staged ${BIN} (${(size / 1024 / 1024).toFixed(1)} MB, built ${mtime.toISOString()})`
);
