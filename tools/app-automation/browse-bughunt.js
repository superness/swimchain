/* Bug hunt over swimchain.io/browse: crawl key pages, interact, collect
   console errors, page errors, failed requests, and broken links. */
const { chromium } = require('playwright');

const BASE = 'https://swimchain.io';
const PAGES = [
  '/browse',
  '/browse/about',
  '/browse/protocol',
  '/browse/spaces',
  '/browse/search',
  '/browse/docs/search-ranking',
  '/browse/docs/gateway-operation',
];

const findings = [];
function note(sev, where, what) {
  findings.push({ sev, where, what });
  console.log(`[${sev}] ${where} :: ${what}`);
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  const consoleErrs = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrs.push(m.text().slice(0, 300));
  });
  page.on('pageerror', (e) => consoleErrs.push('PAGEERROR: ' + String(e).slice(0, 300)));
  const failedReqs = [];
  page.on('response', (r) => {
    if (r.status() >= 400 && r.url().startsWith(BASE)) failedReqs.push(`${r.status()} ${r.url()}`);
  });

  const seenLinks = new Set();

  for (const path of PAGES) {
    consoleErrs.length = 0;
    failedReqs.length = 0;
    const url = BASE + path;
    let resp;
    try {
      resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    } catch (e) {
      note('BUG', path, `navigation failed: ${String(e).slice(0, 200)}`);
      continue;
    }
    if (!resp || resp.status() >= 400) note('BUG', path, `HTTP ${resp && resp.status()}`);
    const title = await page.title();
    if (!title) note('WARN', path, 'empty <title>');
    for (const c of consoleErrs) note('BUG', path, `console: ${c}`);
    for (const f of failedReqs) note('BUG', path, `failed request: ${f}`);

    // body sanity: not blank, no raw error text
    const bodyText = (await page.textContent('body')) || '';
    if (bodyText.trim().length < 40) note('BUG', path, 'page body nearly empty');
    for (const bad of ['Application error', 'Internal Server Error', 'Unhandled Runtime']) {
      if (bodyText.includes(bad)) note('BUG', path, `body contains "${bad}"`);
    }

    // collect same-origin links for a status sweep
    const hrefs = await page.$$eval('a[href]', (as) => as.map((a) => a.href));
    for (const h of hrefs) {
      if (h.startsWith(BASE) && !h.includes('#') && !seenLinks.has(h)) seenLinks.add(h);
    }
    await page.screenshot({ path: `${__dirname.replace(/\\/g, '/')}/shot-${path.replace(/\W+/g, '_')}.png` });
  }

  // Interaction 1: search flow
  try {
    await page.goto(BASE + '/browse/search', { waitUntil: 'networkidle', timeout: 30000 });
    consoleErrs.length = 0;
    const input = await page.$('input[type="search"], input[type="text"], input[placeholder]');
    if (!input) note('BUG', '/browse/search', 'no search input found');
    else {
      await input.fill('swim');
      await input.press('Enter');
      await page.waitForTimeout(4000);
      const txt = ((await page.textContent('body')) || '').toLowerCase();
      const hasResultsOrEmpty =
        txt.includes('result') || txt.includes('no ') || txt.includes('found') || txt.includes('offline');
      if (!hasResultsOrEmpty) note('WARN', '/browse/search', 'search submit produced no visible results/empty state');
      for (const c of consoleErrs) note('BUG', '/browse/search (interact)', `console: ${c}`);
    }
  } catch (e) {
    note('BUG', '/browse/search (interact)', String(e).slice(0, 200));
  }

  // Interaction 2: spaces -> first space -> first post
  try {
    await page.goto(BASE + '/browse/spaces', { waitUntil: 'networkidle', timeout: 30000 });
    consoleErrs.length = 0;
    const spaceLink = await page.$('a[href*="/spaces/"]');
    if (!spaceLink) {
      const txt = ((await page.textContent('body')) || '').toLowerCase();
      if (txt.includes('offline') || txt.includes('unavailable')) note('INFO', '/browse/spaces', 'node offline notice shown (no spaces to click)');
      else note('WARN', '/browse/spaces', 'no space links found and no offline notice');
    } else {
      const href = await spaceLink.getAttribute('href');
      await spaceLink.click();
      await page.waitForLoadState('networkidle', { timeout: 30000 });
      const stxt = ((await page.textContent('body')) || '').trim();
      if (stxt.length < 40) note('BUG', `space view ${href}`, 'nearly empty body');
      for (const c of consoleErrs) note('BUG', `space view ${href}`, `console: ${c}`);
      const postLink = await page.$('a[href*="/s/"]');
      if (postLink) {
        const phref = await postLink.getAttribute('href');
        consoleErrs.length = 0;
        await postLink.click();
        await page.waitForLoadState('networkidle', { timeout: 30000 });
        for (const c of consoleErrs) note('BUG', `post view ${phref}`, `console: ${c}`);
        const ptxt = ((await page.textContent('body')) || '').trim();
        if (ptxt.length < 40) note('BUG', `post view ${phref}`, 'nearly empty body');
      }
    }
  } catch (e) {
    note('BUG', '/browse/spaces (interact)', String(e).slice(0, 200));
  }

  // Link status sweep (GET, same-origin, capped)
  const links = [...seenLinks].slice(0, 40);
  for (const h of links) {
    try {
      const r = await ctx.request.get(h, { timeout: 15000, maxRedirects: 5 });
      if (r.status() >= 400) note('BUG', 'link-sweep', `${r.status()} ${h}`);
    } catch (e) {
      note('BUG', 'link-sweep', `error ${h}: ${String(e).slice(0, 120)}`);
    }
  }

  await browser.close();
  console.log('\n=== SUMMARY ===');
  console.log(`findings: ${findings.length}`);
  for (const f of findings) console.log(`- [${f.sev}] ${f.where} :: ${f.what}`);
})();
