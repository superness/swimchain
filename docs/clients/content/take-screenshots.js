#!/usr/bin/env node
const puppeteer = require('/mnt/c/github/swimchain/scripts/node_modules/puppeteer');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname);

const CLIENTS = [
  { name: 'forum', port: 5173, pages: ['/', '/spaces'] },
  { name: 'search', port: 5174, pages: ['/'] },
  { name: 'chat', port: 5175, pages: ['/'] },
  { name: 'bridge', port: 5176, pages: ['/', '/activity'] },
  { name: 'archiver', port: 5177, pages: ['/', '/archived'] },
  { name: 'analytics', port: 5178, pages: ['/', '/spaces'] },
  { name: 'feed', port: 5179, pages: ['/'] },
];

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });

  for (const client of CLIENTS) {
    for (const pagePath of client.pages) {
      const url = `http://localhost:${client.port}${pagePath}`;
      const suffix = pagePath === '/' ? 'main' : pagePath.replace(/\//g, '');
      const outFile = path.join(OUTPUT_DIR, `${client.name}-${suffix}.png`);

      try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 900 });
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        // Wait longer for WASM init and React renders
        await new Promise(r => setTimeout(r, 10000));
        await page.screenshot({ path: outFile, fullPage: false });
        await page.close();
        console.log(`OK: ${outFile}`);
      } catch (err) {
        console.log(`FAIL: ${url} - ${err.message}`);
      }
    }
  }

  await browser.close();
  console.log('Done.');
})();
