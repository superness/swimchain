// Spin up a swimchain testnet node with a FRESH (non-genesis) identity, so the
// harness (and the launcher) can drive apps as a brand-new user instead of the
// genesis/"Super" identity. Uses its own data dir + ports so it coexists with the
// genesis node (19735/19736). See README "Fresh identity".
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const CFG = require('./config');

// Alt port pair, clear of the genesis node. RPC is always p2p+1.
const FRESH_P2P = parseInt(process.env.SWIM_AUTO_FRESH_P2P || '19745', 10);
const FRESH_RPC = FRESH_P2P + 1;
// Dev password for the fresh identity; override via env to set your own.
const FRESH_PASSWORD = process.env.SWIMCHAIN_PASSWORD || 'freshpass123';

function binaryPath() {
  const exe = process.platform === 'win32' ? 'sw.exe' : 'sw';
  return path.join(CFG.ROOT, 'target', 'release', exe);
}

// --testnet appends the "-testnet" suffix to the data dir, so `swim-user` lives at
// <root>/swim-user-testnet (where the .cookie the harness reads is written).
function dataDirFor(name) {
  return path.join(CFG.ROOT, `${name}-testnet`);
}
function pidFile(name) {
  return path.join(CFG.ROOT, '.daemon-pids', `fresh-${name}.pid`);
}

// Create the identity if this data dir doesn't have one yet. Returns true if it
// minted a new identity, false if one already existed.
function ensureIdentity(name) {
  if (fs.existsSync(path.join(dataDirFor(name), 'identity.enc'))) return false;
  const r = spawnSync(binaryPath(), ['--testnet', `--data-dir=${name}`, 'identity', 'create'], {
    cwd: CFG.ROOT,
    env: { ...process.env, SWIMCHAIN_PASSWORD: FRESH_PASSWORD },
    stdio: 'inherit',
  });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`identity create failed (exit ${r.status})`);
  return true;
}

function startFresh(name) {
  const logPath = path.join(CFG.ROOT, '.daemon-pids', `fresh-${name}.log`);
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const fd = fs.openSync(logPath, 'a');
  const child = spawn(
    binaryPath(),
    ['--testnet', `--data-dir=${name}`, 'node', 'start', '--listen', `127.0.0.1:${FRESH_P2P}`],
    {
      cwd: CFG.ROOT,
      env: { ...process.env, SWIMCHAIN_PASSWORD: FRESH_PASSWORD },
      detached: true,
      stdio: ['ignore', fd, fd],
      windowsHide: true,
    }
  );
  fs.closeSync(fd);
  child.unref();
  fs.writeFileSync(pidFile(name), String(child.pid));
  return {
    pid: child.pid,
    rpc: `http://127.0.0.1:${FRESH_RPC}`,
    dataDir: dataDirFor(name),
    logPath,
  };
}

function stopFresh(name) {
  const pf = pidFile(name);
  if (!fs.existsSync(pf)) return false;
  const pid = parseInt(fs.readFileSync(pf, 'utf8'), 10);
  try {
    process.kill(pid);
  } catch {
    // already gone
  }
  try {
    fs.unlinkSync(pf);
  } catch {}
  return true;
}

module.exports = { ensureIdentity, startFresh, stopFresh, dataDirFor, binaryPath, FRESH_P2P, FRESH_RPC };
