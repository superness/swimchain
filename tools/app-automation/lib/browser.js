// Owns the Playwright Chromium session and the continuous log capture.
// One page is reused across open()/goto() so the log buffer and browser
// state survive client switches.
const { chromium } = require('playwright');
const { RingBuffer } = require('./ringbuffer');

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
  }

  async ensurePage() {
    if (this.page && !this.page.isClosed()) return this.page;
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

  async open(url, clientName) {
    const page = await this.ensurePage();
    await page.goto(url, { waitUntil: 'load' });
    this.client = clientName || null;
    this.clientBase = clientName ? url.replace(/[?#].*$/, '').replace(/[^/]*$/, '') : null;
    if (clientName) {
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
      if (!this.clientBase) throw new Error("No client open — use 'open <client>' first or pass an absolute URL");
      url = this.clientBase + String(target).replace(/^\/+/, '');
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

  async click(selector) {
    await this.requirePage().locator(selector).first().click();
  }

  async type(selector, text) {
    await this.requirePage().locator(selector).first().fill(text);
  }

  async press(key) {
    await this.requirePage().keyboard.press(key);
  }

  async wait(selector, timeout) {
    await this.requirePage()
      .locator(selector)
      .first()
      .waitFor({ state: 'visible', timeout: timeout || this.defaultTimeout });
  }

  async eval(js) {
    // Evaluate as an expression; JSON round-trip keeps the result serializable.
    const result = await this.requirePage().evaluate(js);
    return JSON.parse(JSON.stringify(result === undefined ? null : result));
  }

  async screenshot({ selector, out, fullPage } = {}) {
    const page = this.requirePage();
    // Let renders settle so the picture reflects the latest action.
    await page.waitForTimeout(300);
    if (selector) {
      await page.locator(selector).first().screenshot({ path: out });
    } else {
      await page.screenshot({ path: out, fullPage: !!fullPage });
    }
    return out;
  }

  async ui(selector) {
    return this.requirePage().locator(selector || 'body').ariaSnapshot();
  }

  status() {
    const launched = !!(this.page && !this.page.isClosed());
    return {
      launched,
      url: launched ? this.page.url() : null,
      client: launched ? this.client : null,
    };
  }

  async close() {
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
      this.page = null;
      this.client = null;
      this.clientBase = null;
    }
  }
}

module.exports = { BrowserSession };
