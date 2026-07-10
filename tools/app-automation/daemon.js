#!/usr/bin/env node
// swim-auto daemon: owns the Playwright browser, the static client server,
// and the log buffer. The CLI talks to this over localhost HTTP.
const http = require('http');
const fs = require('fs');
const path = require('path');
const CFG = require('./lib/config');
const { startStaticServer } = require('./lib/static-server');
const { BrowserSession } = require('./lib/browser');

async function main() {
  const headed = process.argv.includes('--headed');
  const staticServer = await startStaticServer({
    port: CFG.STATIC_PORT,
    clientsDir: CFG.CLIENTS_DIR,
    clients: CFG.CLIENTS,
  });
  const session = new BrowserSession({
    headed,
    bufferCap: CFG.LOG_BUFFER_CAP,
    defaultTimeout: CFG.DEFAULT_TIMEOUT,
  });

  let controlServer;

  async function shutdown() {
    await session.close();
    staticServer.close();
    try {
      fs.unlinkSync(CFG.PID_FILE);
    } catch {}
    controlServer.close(() => process.exit(0));
    // Belt and braces: force-exit if close callbacks hang.
    setTimeout(() => process.exit(0), 2000).unref();
  }

  const handlers = {
    'GET /status': async () => ({
      pid: process.pid,
      staticPort: CFG.STATIC_PORT,
      controlPort: CFG.CONTROL_PORT,
      browser: session.status(),
    }),
    'POST /open': async b => {
      const url = b.url || CFG.clientUrl(b.client, b.path);
      if (!url) {
        throw new Error(`unknown client '${b.client}' (known: ${Object.keys(CFG.CLIENTS).join(', ')})`);
      }
      return session.open(url, b.url ? null : b.client);
    },
    'POST /goto': async b => session.goto(b.target),
    'POST /click': async b => {
      await session.click(b.selector);
      return { clicked: b.selector };
    },
    'POST /type': async b => {
      await session.type(b.selector, b.text);
      return { typed: b.selector };
    },
    'POST /press': async b => {
      await session.press(b.key);
      return { pressed: b.key };
    },
    'POST /wait': async b => {
      await session.wait(b.selector, b.timeout);
      return { visible: b.selector };
    },
    'POST /eval': async b => session.eval(b.js),
    'POST /screenshot': async b => {
      if (!b.out) throw new Error('screenshot requires an absolute output path');
      fs.mkdirSync(path.dirname(b.out), { recursive: true });
      return session.screenshot(b);
    },
    'POST /ui': async b => session.ui(b.selector),
    'POST /logs': async b => {
      if (b.clear) {
        session.logs.clear();
        return { cleared: true };
      }
      return session.logs.list({ errorsOnly: !!b.errorsOnly, tail: b.tail });
    },
    'POST /shutdown': async () => {
      setTimeout(shutdown, 50);
      return { stopping: true };
    },
  };

  controlServer = http.createServer((req, res) => {
    const key = `${req.method} ${(req.url || '').split('?')[0]}`;
    const handler = handlers[key];
    let raw = '';
    req.on('data', c => (raw += c));
    req.on('end', async () => {
      res.setHeader('Content-Type', 'application/json');
      if (!handler) {
        res.writeHead(404);
        res.end(JSON.stringify({ ok: false, error: `unknown endpoint ${key}` }));
        return;
      }
      let body = {};
      try {
        if (raw) body = JSON.parse(raw);
      } catch {
        res.writeHead(400);
        res.end(JSON.stringify({ ok: false, error: 'invalid JSON body' }));
        return;
      }
      try {
        const result = await handler(body);
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, result }));
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
  });

  await new Promise((resolve, reject) => {
    controlServer.once('error', reject);
    controlServer.listen(CFG.CONTROL_PORT, '127.0.0.1', resolve);
  });

  fs.mkdirSync(path.dirname(CFG.PID_FILE), { recursive: true });
  fs.writeFileSync(CFG.PID_FILE, String(process.pid));

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  console.log(
    `[swim-auto] daemon up: control http://127.0.0.1:${CFG.CONTROL_PORT}, clients http://127.0.0.1:${CFG.STATIC_PORT}`
  );
}

main().catch(e => {
  console.error(`[swim-auto] daemon failed: ${e.message}`);
  process.exit(1);
});
