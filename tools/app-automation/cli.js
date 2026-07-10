#!/usr/bin/env node
// swim-auto CLI: thin dispatcher over the daemon's control API, plus node
// lifecycle (delegated to scripts/daemon-control.js) and client builds.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const CFG = require('./lib/config');
const { parseArgs } = require('./lib/args');

function api(method, endpoint, body, timeout = 60000) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        host: '127.0.0.1',
        port: CFG.CONTROL_PORT,
        path: endpoint,
        method,
        timeout,
        headers: { 'Content-Type': 'application/json' },
      },
      res => {
        let raw = '';
        res.on('data', c => (raw += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(raw));
          } catch {
            reject(new Error(`bad daemon response: ${raw.slice(0, 200)}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('daemon request timed out'));
    });
    if (data) req.write(data);
    req.end();
  });
}

async function daemonAlive() {
  try {
    const r = await api('GET', '/status', null, 1500);
    return r.ok;
  } catch {
    return false;
  }
}

async function ensureDaemon(headed) {
  if (await daemonAlive()) return;
  const daemonArgs = [path.join(__dirname, 'daemon.js')];
  if (headed) daemonArgs.push('--headed');
  const child = spawn(process.execPath, daemonArgs, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
  for (let i = 0; i < 50; i++) {
    if (await daemonAlive()) return;
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error(`daemon did not start on port ${CFG.CONTROL_PORT}`);
}

async function call(endpoint, body) {
  const r = await api('POST', endpoint, body || {});
  if (!r.ok) throw new Error(r.error);
  return r.result;
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

async function defaultShotPath() {
  let client = 'page';
  try {
    const s = await api('GET', '/status');
    if (s.ok && s.result.browser.client) client = s.result.browser.client;
  } catch {}
  return path.join(CFG.SHOTS_DIR, `${client}-${timestamp()}.png`);
}

async function takeShot(args) {
  const out = path.resolve(args.out || (await defaultShotPath()));
  const result = await call('/screenshot', {
    out,
    selector: args._[1],
    fullPage: !!args.full,
  });
  // Contract: absolute path is the LAST line of output so agents can Read it.
  console.log(result);
  return result;
}

function fmtLog(e) {
  const t = new Date(e.ts).toISOString().slice(11, 19);
  const tag = e.kind === 'console' ? e.type : e.kind;
  const loc = e.location ? `  (${e.location})` : '';
  return `[${t}] ${tag.padEnd(13)} ${e.text}${loc}`;
}

function runNodeControl(argv) {
  const r = spawnSync(process.execPath, [path.join(CFG.ROOT, 'scripts', 'daemon-control.js'), ...argv], {
    cwd: CFG.ROOT,
    stdio: 'inherit',
  });
  return r.status || 0;
}

const HELP = `swim-auto — swimchain app automation (daemon + CLI)

Node & clients:
  node start|stop|status        Manage the testnet node (scripts/daemon-control.js)
  clients build                 Build all bundled clients (desktop-app build-clients.js)

Browser (auto-starts the daemon; add --headed to watch):
  open <client> [path]          Open a client: ${Object.keys(CFG.CLIENTS).join(', ')}
  goto <path|url>               Navigate within the client, or to an absolute URL
  click <selector>              Click (Playwright selectors: css, text=, role=)
  type <selector> <text...>     Fill an input
  press <key>                   Press a key (Enter, Escape, ...)
  wait <selector> [--timeout=ms]
  eval <js expression...>       Evaluate JS in the page, print JSON result
  screenshot [selector] [--out=file] [--full]
  ui [selector]                 ARIA snapshot of visible elements (find selectors)
  logs [--errors] [--tail=N] [--clear]
  status                        Daemon + browser + node status
  stop [--all]                  Stop browser+daemon (--all: also the node)

Any of open/goto/click/type/press accept --shot to screenshot after acting.`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];

  // Non-daemon commands first.
  if (!cmd || cmd === 'help' || args.help) {
    console.log(HELP);
    return;
  }
  if (cmd === 'node') {
    const sub = args._[1];
    if (!['start', 'stop', 'status'].includes(sub)) throw new Error('usage: swim-auto node start|stop|status');
    const flags = sub === 'status' ? [sub] : [sub, '--node-only'];
    process.exitCode = runNodeControl(flags);
    return;
  }
  if (cmd === 'clients') {
    if (args._[1] !== 'build') throw new Error('usage: swim-auto clients build');
    const r = spawnSync(process.execPath, [path.join(CFG.ROOT, 'desktop-app', 'scripts', 'build-clients.js')], {
      cwd: CFG.ROOT,
      stdio: 'inherit',
    });
    process.exitCode = r.status || 0;
    return;
  }
  if (cmd === 'stop') {
    if (await daemonAlive()) {
      await api('POST', '/shutdown', {});
      console.log('daemon stopped');
    } else {
      console.log('daemon not running');
    }
    try {
      fs.unlinkSync(CFG.PID_FILE);
    } catch {}
    if (args.all) process.exitCode = runNodeControl(['stop', '--node-only']);
    return;
  }
  if (cmd === 'status') {
    if (await daemonAlive()) {
      const s = await api('GET', '/status');
      console.log(JSON.stringify(s.result, null, 2));
    } else {
      console.log('daemon: not running');
    }
    runNodeControl(['status']);
    return;
  }

  // Browser commands: make sure the daemon is up.
  await ensureDaemon(!!args.headed);

  switch (cmd) {
    case 'open': {
      const client = args._[1];
      if (!client) throw new Error('usage: swim-auto open <client> [path]');
      const built = fs.existsSync(path.join(CFG.CLIENTS_DIR, CFG.CLIENTS[client] || '', 'index.html'));
      if (CFG.CLIENTS[client] && !built) {
        throw new Error(`${client} is not built — run: swim-auto clients build`);
      }
      const result = await call('/open', { client, path: args._[2] });
      console.log(JSON.stringify(result));
      break;
    }
    case 'goto': {
      if (!args._[1]) throw new Error('usage: swim-auto goto <path|url>');
      console.log(JSON.stringify(await call('/goto', { target: args._[1] })));
      break;
    }
    case 'click': {
      if (!args._[1]) throw new Error('usage: swim-auto click <selector>');
      await call('/click', { selector: args._[1] });
      console.log(`clicked ${args._[1]}`);
      break;
    }
    case 'type': {
      if (args._.length < 3) throw new Error('usage: swim-auto type <selector> <text...>');
      const text = args._.slice(2).join(' ');
      await call('/type', { selector: args._[1], text });
      console.log(`typed into ${args._[1]}`);
      break;
    }
    case 'press': {
      if (!args._[1]) throw new Error('usage: swim-auto press <key>');
      await call('/press', { key: args._[1] });
      console.log(`pressed ${args._[1]}`);
      break;
    }
    case 'wait': {
      if (!args._[1]) throw new Error('usage: swim-auto wait <selector> [--timeout=ms]');
      await call('/wait', { selector: args._[1], timeout: args.timeout ? parseInt(args.timeout, 10) : undefined });
      console.log(`visible: ${args._[1]}`);
      break;
    }
    case 'eval': {
      if (args._.length < 2) throw new Error('usage: swim-auto eval <js expression>');
      const result = await call('/eval', { js: args._.slice(1).join(' ') });
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    case 'screenshot': {
      await takeShot(args);
      return; // takeShot already printed the path as the last line
    }
    case 'ui': {
      console.log(await call('/ui', { selector: args._[1] }));
      break;
    }
    case 'logs': {
      const result = await call('/logs', {
        errorsOnly: !!args.errors,
        tail: args.tail ? parseInt(args.tail, 10) : undefined,
        clear: !!args.clear,
      });
      if (result.cleared) console.log('logs cleared');
      else if (result.length === 0) console.log('(no log entries)');
      else result.forEach(e => console.log(fmtLog(e)));
      break;
    }
    default:
      throw new Error(`unknown command '${cmd}' — run: swim-auto help`);
  }

  // --shot: act-then-look in one command.
  if (args.shot && ['open', 'goto', 'click', 'type', 'press'].includes(cmd)) {
    await takeShot({ _: [], out: undefined, full: false });
  }
}

main().catch(e => {
  console.error(`Error: ${e.message}`);
  process.exit(1);
});
