// Owns the Playwright Chromium session and the continuous log capture.
// One page is reused across open()/goto() so the log buffer and browser
// state survive client switches.
const { chromium } = require('playwright');
const { RingBuffer } = require('./ringbuffer');
const path = require('path');

function fmtLocation(loc) {
  if (!loc || !loc.url) return '';
  return `${loc.url}:${loc.lineNumber || 0}`;
}

class BrowserSession {
  constructor({ headed = false, bufferCap = 2000, defaultTimeout = 15000 } = {}) {
    this.headed = headed;
    this.defaultTimeout = defaultTimeout;
    this.logs = new RingBuffer(bufferCap);
    this.browser = null;
    this.page = null;
    this.client = null; // current client name, e.g. 'forum'
    this.clientBase = null; // e.g. http://127.0.0.1:8899/forum-client/
    // Shell (node-mode) driving: the client runs inside an iframe, so UI actions
    // must target that frame rather than the top page.
    this.frameSelector = null; // e.g. '#client' when framed, null when standalone
    this.shellBase = null; // e.g. http://127.0.0.1:8899/shell/forum (for goto deep links)
  }

  async ensurePage() {
    if (this.page && !this.page.isClosed()) return this.page;
    if (this.browser && !this.browser.isConnected()) {
      this.browser = null;
    }
    if (!this.browser) {
      this.browser = await chromium.launch({ headless: !this.headed });
    }
    const context = await this.browser.newContext({ viewport: { width: 1280, height: 900 } });
    this.page = await context.newPage();
    this.page.setDefaultTimeout(this.defaultTimeout);
    this.attachCapture(this.page);
    return this.page;
  }

  attachCapture(page) {
    page.on('console', msg => {
      this.logs.push({
        ts: Date.now(),
        kind: 'console',
        type: msg.type(),
        text: msg.text(),
        location: fmtLocation(msg.location()),
      });
    });
    page.on('pageerror', err => {
      this.logs.push({
        ts: Date.now(),
        kind: 'pageerror',
        type: '',
        text: err.stack || String(err),
        location: '',
      });
    });
    page.on('requestfailed', req => {
      const failure = req.failure();
      this.logs.push({
        ts: Date.now(),
        kind: 'requestfailed',
        type: '',
        text: `${req.method()} ${req.url()} -> ${failure ? failure.errorText : 'failed'}`,
        location: '',
      });
    });
  }

  async open(url, clientName, { frame = null, shellBase = null } = {}) {
    const page = await this.ensurePage();
    await page.goto(url, { waitUntil: 'load' });
    this.client = clientName || null;
    this.frameSelector = frame;
    this.shellBase = shellBase;
    this.clientBase = clientName ? url.replace(/[?#].*$/, '').replace(/[^/]*$/, '') : null;
    if (clientName && !frame) {
      // base is always .../{dir}/ — normalize in case a route was appended
      const m = url.match(/^(https?:\/\/[^/]+\/[a-z0-9-]+-client\/)/);
      if (m) this.clientBase = m[1];
    }
    return this.status();
  }

  async goto(target) {
    const page = await this.ensurePage();
    let url = target;
    if (!/^https?:\/\//.test(target)) {
      if (this.shellBase) {
        // Shell mode: a deep link means reloading the wrapper with a new route so
        // the client re-mounts framed (and re-receives node-mode config).
        const route = String(target).replace(/^\/+/, '');
        url = route ? `${this.shellBase}?route=${encodeURIComponent(route)}` : this.shellBase;
      } else if (this.clientBase) {
        url = this.clientBase + String(target).replace(/^\/+/, '');
      } else {
        throw new Error("No client open — use 'open <client>' first or pass an absolute URL");
      }
    }
    await page.goto(url, { waitUntil: 'load' });
    return this.status();
  }

  requirePage() {
    if (!this.page || this.page.isClosed()) {
      throw new Error("No page open — use 'open <client>' first");
    }
    return this.page;
  }

  // Locator rooted at the client — the iframe frame in shell mode, else the page.
  loc(selector) {
    const page = this.requirePage();
    return this.frameSelector
      ? page.frameLocator(this.frameSelector).locator(selector)
      : page.locator(selector);
  }

  // Playwright Frame for the client, for evaluate() in shell mode.
  async clientFrame() {
    const page = this.requirePage();
    if (!this.frameSelector) return page;
    const handle = await page.$(this.frameSelector);
    const frame = handle && (await handle.contentFrame());
    if (!frame) throw new Error(`client frame ${this.frameSelector} not found`);
    return frame;
  }

  async click(selector) {
    await this.loc(selector).first().click();
  }

  async type(selector, text) {
    await this.loc(selector).first().fill(text);
  }

  async press(key) {
    await this.requirePage().keyboard.press(key);
  }

  async wait(selector, timeout) {
    await this.loc(selector)
      .first()
      .waitFor({ state: 'visible', timeout: timeout ?? this.defaultTimeout });
  }

  async eval(js) {
    // Evaluate as an expression; JSON round-trip keeps the result serializable.
    const ctx = await this.clientFrame();
    const result = await ctx.evaluate(js);
    return JSON.parse(JSON.stringify(result === undefined ? null : result));
  }

  async screenshot({ selector, out, fullPage } = {}) {
    const page = this.requirePage();
    out = path.resolve(out);
    // Let renders settle so the picture reflects the latest action.
    await page.waitForTimeout(300);
    if (selector) {
      await this.loc(selector).first().screenshot({ path: out });
    } else {
      // Full-page shot is taken at the top level; the client iframe fills the
      // viewport, so the client UI is captured regardless of shell mode.
      await page.screenshot({ path: out, fullPage: !!fullPage });
    }
    return out;
  }

  async ui(selector) {
    return this.loc(selector || 'body').ariaSnapshot();
  }

  status() {
    const launched = !!(this.page && !this.page.isClosed());
    return {
      launched,
      url: launched ? this.page.url() : null,
      client: launched ? this.client : null,
      mode: this.frameSelector ? 'node' : 'standalone',
    };
  }

  async close() {
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
      this.page = null;
      this.client = null;
      this.clientBase = null;
      this.frameSelector = null;
      this.shellBase = null;
    }
  }
}

module.exports = { BrowserSession };
